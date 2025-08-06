import { WorkflowNode, SandboxNodeExecution, WorkerMessage, WorkerResponse, NodeInput } from './types';
import { WorkerMessageDispatcher } from './worker-proxy';
import { detectRuntime, validateSandboxSupport } from './runtime';

// Conditional Worker type based on runtime
type WorkerType = any;

export class SandboxManager {
  private workers: Map<string, WorkerType> = new Map();
  private dispatcher: WorkerMessageDispatcher;
  private runtime = detectRuntime();

  constructor(protectedFunctions: { [key: string]: any } = {}) {
    this.dispatcher = new WorkerMessageDispatcher(protectedFunctions);
  }

  /**
   * Validate that a workflow with sandbox nodes can run in the current environment
   */
  validateWorkflowSandboxSupport(nodes: WorkflowNode[]): void {
    const hasSandboxNodes = nodes.some(node => node.sandbox && node.sandbox.length > 0);
    
    if (hasSandboxNodes) {
      validateSandboxSupport(this.runtime);
    }
  }

  /**
   * Validate that all sandbox functions are available in protected functions
   */
  validateSandboxFunctions(nodes: WorkflowNode[], protectedFunctions: { [key: string]: any }): void {
    for (const node of nodes) {
      if (node.sandbox) {
        for (const funcName of node.sandbox) {
          if (!this.isFunctionAvailable(funcName, protectedFunctions)) {
            throw new Error(
              `Function '${funcName}' required by sandboxed node '${node.name}' is not available in protectedFunctions. ` +
              `Available functions: ${Object.keys(protectedFunctions).join(', ')}`
            );
          }
        }
      }
    }
  }

  private isFunctionAvailable(funcName: string, protectedFunctions: { [key: string]: any }): boolean {
    const parts = funcName.split('.');
    let current = protectedFunctions;
    
    for (const part of parts) {
      current = current?.[part];
      if (!current) return false;
    }
    
    return typeof current === 'function';
  }

  /**
   * Execute a sandboxed node function
   */
  async executeSandboxedNode(
    node: WorkflowNode, 
    input: NodeInput, 
    workflowName: string
  ): Promise<{ success: boolean; nextCalls?: any[]; error?: string }> {
    if (!node.sandbox || node.sandbox.length === 0) {
      throw new Error(`Node '${node.name}' is not configured for sandbox execution`);
    }

    try {
      const worker = await this.getOrCreateWorker(workflowName);
      
      // Extract the function body from the node function
      const functionString = node.function.toString();
      const functionBody = this.extractFunctionBody(functionString);

      const execution: SandboxNodeExecution = {
        nodeName: node.name,
        functionCode: functionBody,
        input,
        allowedFunctions: node.sandbox,
      };

      return await this.executeInWorker(worker, execution);

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown sandbox execution error'
      };
    }
  }

  private extractFunctionBody(functionString: string): string {
    // Extract the function body from the string representation
    // Handle both arrow functions and regular functions
    const match = functionString.match(/(?:async\s*)?(?:\([^)]*\)|[^=]*)\s*=>\s*\{([\s\S]*)\}/) ||
                  functionString.match(/(?:async\s*)?function[^{]*\{([\s\S]*)\}/);
    
    if (!match) {
      throw new Error('Could not extract function body for sandbox execution');
    }

    return match[1].trim();
  }

  private async getOrCreateWorker(workflowName: string): Promise<WorkerType> {
    let worker = this.workers.get(workflowName);
    
    if (!worker) {
      // Only create workers in Deno environment
      if (!this.runtime.isDeno) {
        throw new Error('Worker creation is only supported in Deno environment');
      }

      try {
        // Create new worker with no permissions (Deno-specific)
        // Use a relative path that works in Deno
        const workerUrl = './worker.ts';
        const WorkerClass = (globalThis as any).Worker;
        
        worker = new WorkerClass(workerUrl, {
          type: 'module',
          deno: {
            permissions: 'none', // No permissions at all
          },
        });

        // Set up message handling for this worker
        worker.onmessage = (e: any) => {
          this.dispatcher.handleMessage(worker!, e.data);
        };

        // Handle worker errors
        worker.onerror = (error: any) => {
          console.error(`[${new Date().toISOString()}] Worker error for workflow '${workflowName}':`, error);
          this.removeWorker(workflowName);
        };

        this.workers.set(workflowName, worker);
      } catch (error) {
        throw new Error(`Failed to create worker: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return worker;
  }

  private async executeInWorker(
    worker: WorkerType, 
    execution: SandboxNodeExecution
  ): Promise<{ success: boolean; nextCalls?: any[]; error?: string }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Sandbox execution timeout (10s)'));
      }, 10000); // 10 second timeout

      const messageHandler = (e: any) => {
        if (e.data.type === 'result') {
          clearTimeout(timeout);
          worker.removeEventListener('message', messageHandler);
          resolve(e.data.result);
        } else if (e.data.type === 'error') {
          clearTimeout(timeout);
          worker.removeEventListener('message', messageHandler);
          resolve({
            success: false,
            error: e.data.error
          });
        }
      };

      worker.addEventListener('message', messageHandler);
      
      // Send execution request
      worker.postMessage({
        type: 'execute',
        payload: execution
      });
    });
  }

  /**
   * Clean up workers
   */
  removeWorker(workflowName: string): void {
    const worker = this.workers.get(workflowName);
    if (worker) {
      worker.terminate();
      this.workers.delete(workflowName);
    }
  }

  /**
   * Clean up all workers
   */
  cleanup(): void {
    for (const [workflowName, worker] of this.workers) {
      worker.terminate();
    }
    this.workers.clear();
  }

  /**
   * Get information about active workers
   */
  getWorkerInfo(): { workflowName: string; created: Date }[] {
    return Array.from(this.workers.keys()).map(workflowName => ({
      workflowName,
      created: new Date(), // In a real implementation, you'd track creation time
    }));
  }
}