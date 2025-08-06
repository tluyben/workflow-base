import { WorkflowServer } from './server';
import { WorkflowEngine } from './workflow-engine';
import { TriggerManager } from './trigger-manager';

// Export types
export * from './types';

// Export main classes
export { WorkflowServer, WorkflowEngine, TriggerManager };

// Create a default instance for simple usage
const workflow = new WorkflowServer();

// Export the simplified API
export default {
  createWorkflow: workflow.createWorkflow.bind(workflow),
  serve: workflow.serve.bind(workflow),
  trigger: workflow.trigger.bind(workflow),
  stop: workflow.stop.bind(workflow),
  getApp: workflow.getApp.bind(workflow),
};

// Also export as named export for convenience
export const createWorkflow = workflow.createWorkflow.bind(workflow);
export const serve = workflow.serve.bind(workflow);
export const trigger = workflow.trigger.bind(workflow);
export const stop = workflow.stop.bind(workflow);
export const getApp = workflow.getApp.bind(workflow);