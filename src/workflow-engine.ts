import { EventEmitter } from 'events';
import {
  WorkflowDefinition,
  WorkflowNode,
  NodeInput,
  NextFunction,
  ExecutionContext,
  WorkflowResult,
} from './types';
import { SandboxManager } from './sandbox-manager';
import { detectRuntime, logRuntime } from './runtime';

export class WorkflowEngine extends EventEmitter {
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private runningExecutions: Map<string, ExecutionContext> = new Map();
  private sandboxManager: SandboxManager | null = null;
  private runtime = detectRuntime();

  createWorkflow(name: string, definition: Omit<WorkflowDefinition, 'name'>): WorkflowDefinition {
    const workflow: WorkflowDefinition = {
      name,
      ...definition,
    };

    this.validateWorkflow(workflow);
    this.validateSandboxConfiguration(workflow);
    this.workflows.set(name, workflow);
    
    return workflow;
  }

  private validateWorkflow(workflow: WorkflowDefinition): void {
    if (!workflow.nodes || workflow.nodes.length === 0) {
      throw new Error(`Workflow '${workflow.name}' must have at least one node`);
    }

    const hasStart = workflow.nodes.some(node => node.name === 'start');
    if (!hasStart) {
      throw new Error(`Workflow '${workflow.name}' must have a 'start' node`);
    }

    const nodeNames = new Set();
    for (const node of workflow.nodes) {
      if (nodeNames.has(node.name)) {
        throw new Error(`Workflow '${workflow.name}' has duplicate node name: '${node.name}'`);
      }
      nodeNames.add(node.name);
    }
  }

  private validateSandboxConfiguration(workflow: WorkflowDefinition): void {
    const hasSandboxNodes = workflow.nodes.some(node => node.sandbox && node.sandbox.length > 0);
    
    if (hasSandboxNodes) {
      // Initialize sandbox manager if we have sandboxed nodes
      if (!this.sandboxManager) {
        this.sandboxManager = new SandboxManager(workflow.protectedFunctions || {});
      }
      
      // Validate sandbox support
      this.sandboxManager.validateWorkflowSandboxSupport(workflow.nodes);
      this.sandboxManager.validateSandboxFunctions(workflow.nodes, workflow.protectedFunctions || {});
      
      logRuntime(this.runtime);
      console.log(`🛡️ Sandbox validation passed for workflow '${workflow.name}'`);
    }
  }

  async executeWorkflow(workflowName: string, input: NodeInput = {}): Promise<WorkflowResult> {
    const workflow = this.workflows.get(workflowName);
    if (!workflow) {
      return {
        success: false,
        error: `Workflow '${workflowName}' not found`,
      };
    }

    const executionId = `${workflowName}-${Date.now()}-${Math.random()}`;
    const context: ExecutionContext = {
      workflowName,
      nodeId: executionId,
      startTime: new Date(),
      input,
    };

    this.runningExecutions.set(executionId, context);
    
    try {
      const result = await this.executeNode(workflow, 'start', input, []);
      this.runningExecutions.delete(executionId);
      return result;
    } catch (error) {
      this.runningExecutions.delete(executionId);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private async executeNode(
    workflow: WorkflowDefinition,
    nodeName: string,
    input: NodeInput,
    executionPath: string[]
  ): Promise<WorkflowResult> {
    if (executionPath.includes(nodeName)) {
      throw new Error(`Circular dependency detected: ${executionPath.join(' -> ')} -> ${nodeName}`);
    }

    const node = workflow.nodes.find(n => n.name === nodeName);
    if (!node) {
      if (nodeName === 'SUCCESS') {
        return {
          success: true,
          result: input,
          executionPath: [...executionPath, nodeName],
        };
      }
      if (nodeName === 'ERROR') {
        return {
          success: false,
          error: input?.message || 'Workflow ended with error',
          executionPath: [...executionPath, nodeName],
        };
      }
      throw new Error(`Node '${nodeName}' not found in workflow '${workflow.name}'`);
    }

    const newExecutionPath = [...executionPath, nodeName];
    
    // Check if this is a sandboxed node
    if (node.sandbox && node.sandbox.length > 0) {
      return await this.executeSandboxedNode(workflow, node, input, newExecutionPath);
    }
    
    // Track all next() calls made during node execution
    const nextCalls: { targetNode: string; data: any }[] = [];
    let nodeExecutionComplete = false;

    const nextFunction: NextFunction = async (nextNodeName: string, output: any = {}) => {
      if (nodeExecutionComplete) {
        // If node execution is already complete, execute immediately (shouldn't happen in normal flow)
        await this.executeNode(workflow, nextNodeName, output, newExecutionPath);
        return;
      }
      
      // Collect the next call to be executed after node function completes
      nextCalls.push({ targetNode: nextNodeName, data: output });
    };

    nextFunction.SUCCESS = 'SUCCESS';
    nextFunction.ERROR = 'ERROR';

    try {
      this.emit('nodeStart', { workflow: workflow.name, node: nodeName, input });
      
      // Execute the node function
      await node.function(input, nextFunction);
      nodeExecutionComplete = true;
      
      // Now execute all next() calls in parallel
      if (nextCalls.length === 0) {
        // No next calls - return current state
        return {
          success: true,
          result: input,
          executionPath: newExecutionPath,
        };
      }

      if (nextCalls.length === 1) {
        // Single next call - execute directly
        const call = nextCalls[0];
        const result = await this.executeNode(workflow, call.targetNode, call.data, newExecutionPath);
        this.emit('nodeComplete', { workflow: workflow.name, node: nodeName, result });
        return result;
      }

      // Multiple next calls - handle parallel execution  
      const results = await this.executeParallelNextCalls(workflow, nextCalls, newExecutionPath);
      const finalResult = this.mergeParallelResults(results, newExecutionPath);
      
      this.emit('nodeComplete', { workflow: workflow.name, node: nodeName, result: finalResult });
      return finalResult;

    } catch (error) {
      const errorResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error in node execution',
        executionPath: newExecutionPath,
      };
      
      this.emit('nodeError', { workflow: workflow.name, node: nodeName, error: errorResult.error });
      
      return errorResult;
    }
  }

  private async executeParallelNextCalls(
    workflow: WorkflowDefinition,
    nextCalls: { targetNode: string; data: any }[],
    executionPath: string[]
  ): Promise<{ targetNode: string; result: WorkflowResult; data: any }[]> {
    // Execute each branch and track what they want to call next
    const parallelResults: Map<string, any[]> = new Map();
    const subsequentCallsFromBranches: { fromBranch: string; targetNode: string; data: any }[] = [];
    
    // Step 1: Execute all the immediate target nodes (mult, plus, etc.)
    // But intercept their next() calls instead of executing them immediately
    const branchPromises = nextCalls.map(async (call) => {
      const branchName = call.targetNode;
      
      // Find the node definition
      const node = workflow.nodes.find(n => n.name === branchName);
      if (!node) {
        throw new Error(`Node '${branchName}' not found`);
      }
      
      // Execute the branch but capture what it wants to call next
      const capturedNextCalls: { targetNode: string; data: any }[] = [];
      
      const interceptingNextFunction = async (nextNodeName: string, output: any = {}) => {
        // Instead of executing immediately, capture the call
        capturedNextCalls.push({ targetNode: nextNodeName, data: output });
        subsequentCallsFromBranches.push({ 
          fromBranch: branchName, 
          targetNode: nextNodeName, 
          data: output 
        });
      };
      
      interceptingNextFunction.SUCCESS = 'SUCCESS';
      interceptingNextFunction.ERROR = 'ERROR';
      
      // Execute the branch node with our intercepting next function
      await node.function(call.data, interceptingNextFunction as any);
      
      return { branchName, capturedNextCalls };
    });
    
    // Wait for all branches to complete their own logic
    const branchResults = await Promise.all(branchPromises);
    
    // Step 2: Now coordinate the subsequent calls
    // Group subsequent calls by target node
    const groupedSubsequentCalls = new Map<string, { fromBranch: string; data: any }[]>();
    
    for (const call of subsequentCallsFromBranches) {
      if (!groupedSubsequentCalls.has(call.targetNode)) {
        groupedSubsequentCalls.set(call.targetNode, []);
      }
      groupedSubsequentCalls.get(call.targetNode)!.push({ 
        fromBranch: call.fromBranch, 
        data: call.data 
      });
    }
    
    // Step 3: Execute each target node with merged inputs
    const finalResults: { targetNode: string; result: WorkflowResult; data: any }[] = [];
    
    for (const [targetNode, calls] of groupedSubsequentCalls) {
      let mergedData: any;
      
      if (calls.length === 1) {
        mergedData = calls[0].data;
      } else {
        // Multiple branches calling same target - merge their data
        mergedData = this.mergeInputs(calls.map(call => call.data));
      }
      
      const result = await this.executeNode(workflow, targetNode, mergedData, executionPath);
      finalResults.push({ targetNode, result, data: mergedData });
    }
    
    return finalResults;
  }

  private async executeSandboxedNode(
    workflow: WorkflowDefinition,
    node: WorkflowNode,
    input: NodeInput,
    executionPath: string[]
  ): Promise<WorkflowResult> {
    if (!this.sandboxManager) {
      return {
        success: false,
        error: 'Sandbox manager not initialized',
        executionPath,
      };
    }

    try {
      this.emit('nodeStart', { workflow: workflow.name, node: node.name, input });
      
      const result = await this.sandboxManager.executeSandboxedNode(node, input, workflow.name);
      
      if (!result.success) {
        const errorResult = {
          success: false,
          error: result.error || 'Sandbox execution failed',
          executionPath,
        };
        
        this.emit('nodeError', { workflow: workflow.name, node: node.name, error: errorResult.error });
        return errorResult;
      }

      // Process next calls from the sandboxed execution
      const nextCalls = result.nextCalls || [];
      
      if (nextCalls.length === 0) {
        // No next calls - return current state
        const finalResult = {
          success: true,
          result: input,
          executionPath: [...executionPath, node.name],
        };
        
        this.emit('nodeComplete', { workflow: workflow.name, node: node.name, result: finalResult });
        return finalResult;
      }

      if (nextCalls.length === 1) {
        // Single next call - execute directly
        const call = nextCalls[0];
        const finalResult = await this.executeNode(workflow, call.targetNode, call.data, executionPath);
        this.emit('nodeComplete', { workflow: workflow.name, node: node.name, result: finalResult });
        return finalResult;
      }

      // Multiple next calls - handle parallel execution  
      const results = await this.executeParallelNextCalls(workflow, nextCalls, executionPath);
      const finalResult = this.mergeParallelResults(results, executionPath);
      
      this.emit('nodeComplete', { workflow: workflow.name, node: node.name, result: finalResult });
      return finalResult;

    } catch (error) {
      const errorResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error in sandboxed node execution',
        executionPath,
      };
      
      this.emit('nodeError', { workflow: workflow.name, node: node.name, error: errorResult.error });
      return errorResult;
    }
  }

  private mergeInputs(inputs: any[]): any {
    // Merge multiple inputs into a single input object
    // This combines all properties from all inputs
    const merged: any = {};
    
    for (const input of inputs) {
      if (typeof input === 'object' && input !== null) {
        Object.assign(merged, input);
      }
    }
    
    return merged;
  }

  private mergeParallelResults(
    results: { targetNode: string; result: WorkflowResult; data: any }[],
    executionPath: string[]
  ): WorkflowResult {
    // If any result failed, return the first failure
    const failedResult = results.find(r => !r.result.success);
    if (failedResult) {
      return failedResult.result;
    }

    // All succeeded - return the first successful result
    // In more complex scenarios, you might want different merging logic
    const firstResult = results[0]?.result;
    if (firstResult) {
      return {
        ...firstResult,
        executionPath: firstResult.executionPath || executionPath,
      };
    }

    // Fallback
    return {
      success: true,
      result: {},
      executionPath,
    };
  }

  getWorkflow(name: string): WorkflowDefinition | undefined {
    return this.workflows.get(name);
  }

  getAllWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  deleteWorkflow(name: string): boolean {
    return this.workflows.delete(name);
  }

  getRunningExecutions(): ExecutionContext[] {
    return Array.from(this.runningExecutions.values());
  }

  /**
   * Clean up resources including sandbox workers
   */
  cleanup(): void {
    if (this.sandboxManager) {
      this.sandboxManager.cleanup();
    }
  }

  /**
   * Get information about sandbox workers
   */
  getSandboxInfo(): { workflowName: string; created: Date }[] {
    if (this.sandboxManager) {
      return this.sandboxManager.getWorkerInfo();
    }
    return [];
  }
}