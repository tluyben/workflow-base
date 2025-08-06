// worker.ts - Deno worker for executing sandboxed workflow nodes
import { createRemoteApi } from './worker-proxy';
import { SandboxNodeExecution, NodeInput } from './types';

// Create the remote API proxy
const api = createRemoteApi((message) => {
  (globalThis as any).postMessage(message);
});

// Handle execution requests from parent
(globalThis as any).onmessage = async (e: any) => {
  const data = e.data;
  
  // Skip if this is a response message (handled by createRemoteApi)
  if (data.id !== undefined && (data.result !== undefined || data.error !== undefined)) {
    return;
  }

  // Handle execution request
  if (data.type === 'execute') {
    try {
      const execution: SandboxNodeExecution = data.payload;
      const result = await executeNodeFunction(execution);
      (globalThis as any).postMessage({ type: 'result', result });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      (globalThis as any).postMessage({ type: 'error', error: errorMessage });
    }
  }
};

/**
 * Execute a workflow node function in a sandboxed environment
 */
async function executeNodeFunction(execution: SandboxNodeExecution): Promise<any> {
  const { nodeName, functionCode, input, allowedFunctions } = execution;
  
  // Create a controlled environment with only allowed functions
  const sandbox: any = {};
  
  // Add allowed functions to sandbox
  for (const funcName of allowedFunctions) {
    if (funcName.includes('.')) {
      // Handle nested functions like 'storage.get'
      const parts = funcName.split('.');
      let current = sandbox;
      
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
      
      const finalPart = parts[parts.length - 1];
      current[finalPart] = (...args: any[]) => (api as any)[funcName](...args);
    } else {
      // Direct function
      sandbox[funcName] = (...args: any[]) => (api as any)[funcName](...args);
    }
  }

  // Track next() calls
  const nextCalls: { targetNode: string; data: any }[] = [];
  let executionComplete = false;

  // Create the next function for the sandboxed code
  const nextFunction = async (nextNodeName: string, output: any = {}) => {
    if (executionComplete) {
      return;
    }
    nextCalls.push({ targetNode: nextNodeName, data: output });
  };

  nextFunction.SUCCESS = 'SUCCESS';
  nextFunction.ERROR = 'ERROR';

  // Create the full execution context
  const executionContext = {
    input,
    next: nextFunction,
    ...sandbox, // Add all allowed functions to the global context
  };

  try {
    // Execute the function in a controlled environment
    // We need to be careful about how we evaluate the function code
    const wrappedCode = `
      (async function(input, next, ${allowedFunctions.map(f => f.replace('.', '_')).join(', ')}) {
        ${functionCode}
      })
    `;

    // Create the function dynamically
    const userFunction = eval(wrappedCode);
    
    // Map dot-notation functions to underscore versions for the parameter list
    const functionArgs: any[] = [input, nextFunction];
    for (const funcName of allowedFunctions) {
      if (funcName.includes('.')) {
        const parts = funcName.split('.');
        let current = sandbox;
        for (const part of parts) {
          current = current[part];
        }
        functionArgs.push(current);
      } else {
        functionArgs.push(sandbox[funcName]);
      }
    }

    // Execute the user function
    await userFunction(...functionArgs);
    executionComplete = true;

    // Return the next calls that were made
    return {
      success: true,
      nextCalls,
      nodeName,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error in sandboxed execution',
      nodeName,
    };
  }
}

// Export for potential future use
export { executeNodeFunction };