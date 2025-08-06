import { EventEmitter } from 'node:events';
import { ToadScheduler, SimpleIntervalJob, AsyncTask, CronJob } from 'toad-scheduler';
import {
  WorkflowDefinition,
  WorkflowNode,
  TriggerType,
  CronTriggerOptions,
  IntervalTriggerOptions,
  NodeInput,
} from './types';
import { WorkflowEngine } from './workflow-engine';

export class TriggerManager extends EventEmitter {
  private scheduler: ToadScheduler;
  private scheduledJobs: Map<string, SimpleIntervalJob | CronJob> = new Map();
  private workflowEngine: WorkflowEngine;

  constructor(workflowEngine: WorkflowEngine) {
    super();
    this.scheduler = new ToadScheduler();
    this.workflowEngine = workflowEngine;
  }

  registerWorkflowTriggers(workflow: WorkflowDefinition): void {
    for (const node of workflow.nodes) {
      this.registerNodeTrigger(workflow, node);
    }
  }

  private registerNodeTrigger(workflow: WorkflowDefinition, node: WorkflowNode): void {
    const triggerId = `${workflow.name}-${node.name}`;

    switch (node.trigger) {
      case 'cron':
        this.registerCronTrigger(triggerId, workflow.name, node);
        break;
      case 'interval':
        this.registerIntervalTrigger(triggerId, workflow.name, node);
        break;
      case 'rest':
        // REST triggers are handled by the Express server
        break;
      case 'workflow':
        // Workflow triggers are handled internally by the execution engine
        break;
      default:
        throw new Error(`Unknown trigger type: ${node.trigger}`);
    }
  }

  private registerCronTrigger(triggerId: string, workflowName: string, node: WorkflowNode): void {
    if (!node.triggerOptions || !('cron' in node.triggerOptions)) {
      throw new Error(`Cron trigger for node '${node.name}' requires cron expression`);
    }

    const options = node.triggerOptions as CronTriggerOptions;
    
    const task = new AsyncTask(
      `${triggerId}-task`,
      async () => {
        try {
          this.emit('triggerFired', { type: 'cron', workflow: workflowName, node: node.name });
          
          if (node.name === 'start') {
            await this.workflowEngine.executeWorkflow(workflowName, {});
          } else {
            // For non-start nodes, we need to execute just this node
            // This is a simplified approach - in practice you might want more sophisticated handling
            const workflow = this.workflowEngine.getWorkflow(workflowName);
            if (workflow) {
              const nextFunction = async (nextNodeName: string, output: any = {}) => {
                // Handle the next function call appropriately
                this.emit('nodeNext', { 
                  workflow: workflowName, 
                  from: node.name, 
                  to: nextNodeName, 
                  output 
                });
              };
              nextFunction.SUCCESS = 'SUCCESS';
              nextFunction.ERROR = 'ERROR';
              
              await node.function({}, nextFunction);
            }
          }
        } catch (error) {
          this.emit('triggerError', { 
            type: 'cron', 
            workflow: workflowName, 
            node: node.name, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      },
      (error) => {
        this.emit('triggerError', { 
          type: 'cron', 
          workflow: workflowName, 
          node: node.name, 
          error: error.message 
        });
      }
    );

    const job = new CronJob({ cronExpression: options.cron }, task, { id: triggerId });
    this.scheduler.addCronJob(job);
    this.scheduledJobs.set(triggerId, job);
  }

  private registerIntervalTrigger(triggerId: string, workflowName: string, node: WorkflowNode): void {
    if (!node.triggerOptions || !('interval' in node.triggerOptions)) {
      throw new Error(`Interval trigger for node '${node.name}' requires interval in milliseconds`);
    }

    const options = node.triggerOptions as IntervalTriggerOptions;
    
    const task = new AsyncTask(
      `${triggerId}-task`,
      async () => {
        try {
          this.emit('triggerFired', { type: 'interval', workflow: workflowName, node: node.name });
          
          if (node.name === 'start') {
            await this.workflowEngine.executeWorkflow(workflowName, {});
          } else {
            // For non-start nodes with interval triggers
            const workflow = this.workflowEngine.getWorkflow(workflowName);
            if (workflow) {
              const nextFunction = async (nextNodeName: string, output: any = {}) => {
                this.emit('nodeNext', { 
                  workflow: workflowName, 
                  from: node.name, 
                  to: nextNodeName, 
                  output 
                });
              };
              nextFunction.SUCCESS = 'SUCCESS';
              nextFunction.ERROR = 'ERROR';
              
              await node.function({}, nextFunction);
            }
          }
        } catch (error) {
          this.emit('triggerError', { 
            type: 'interval', 
            workflow: workflowName, 
            node: node.name, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      },
      (error) => {
        this.emit('triggerError', { 
          type: 'interval', 
          workflow: workflowName, 
          node: node.name, 
          error: error.message 
        });
      }
    );

    const job = new SimpleIntervalJob({ milliseconds: options.interval }, task, { id: triggerId });
    this.scheduler.addSimpleIntervalJob(job);
    this.scheduledJobs.set(triggerId, job);
  }

  unregisterWorkflowTriggers(workflowName: string): void {
    const keysToRemove: string[] = [];
    
    for (const [triggerId, job] of this.scheduledJobs) {
      if (triggerId.startsWith(workflowName + '-')) {
        try {
          if (job.id) {
            this.scheduler.removeById(job.id);
          }
        } catch (error) {
          console.warn(`Failed to remove job ${triggerId}:`, error);
        }
        keysToRemove.push(triggerId);
      }
    }

    keysToRemove.forEach(key => this.scheduledJobs.delete(key));
  }

  getScheduledJobs(): string[] {
    return Array.from(this.scheduledJobs.keys());
  }

  stop(): void {
    // Stop all jobs before stopping scheduler
    for (const [triggerId, job] of this.scheduledJobs) {
      try {
        if (job.id && this.scheduler.existsById(job.id)) {
          this.scheduler.stopById(job.id);
          this.scheduler.removeById(job.id);
        }
      } catch (error) {
        console.warn(`Failed to remove job ${triggerId} during stop:`, error);
      }
    }
    
    this.scheduler.stop();
    this.scheduledJobs.clear();
  }

  start(): void {
    // ToadScheduler doesn't need explicit start - jobs run automatically when added
    // This method is kept for API compatibility
  }
}