import { TriggerManager } from '../src/trigger-manager';
import { WorkflowEngine } from '../src/workflow-engine';
import { NodeInput, NextFunction } from '../src/types';

describe('TriggerManager', () => {
  let engine: WorkflowEngine;
  let triggerManager: TriggerManager;

  beforeEach(() => {
    engine = new WorkflowEngine();
    triggerManager = new TriggerManager(engine);
  });

  afterEach(() => {
    triggerManager.stop();
  });

  describe('Cron Triggers', () => {
    it('should register cron trigger successfully', () => {
      const workflow = engine.createWorkflow('cron-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'cron',
            triggerOptions: { cron: '0 */5 * * * *' }, // Every 5 minutes
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { cronExecuted: true });
            },
          },
        ],
      });

      expect(() => {
        triggerManager.registerWorkflowTriggers(workflow);
      }).not.toThrow();

      const jobs = triggerManager.getScheduledJobs();
      expect(jobs).toContain('cron-workflow-start');
    });

    it('should throw error for cron trigger without cron expression', () => {
      const workflow = engine.createWorkflow('invalid-cron-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'cron',
            // Missing triggerOptions
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, {});
            },
          },
        ],
      });

      expect(() => {
        triggerManager.registerWorkflowTriggers(workflow);
      }).toThrow("Cron trigger for node 'start' requires cron expression");
    });
  });

  describe('Interval Triggers', () => {
    it('should register interval trigger successfully', () => {
      const workflow = engine.createWorkflow('interval-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'interval',
            triggerOptions: { interval: 5000 }, // Every 5 seconds
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { intervalExecuted: true });
            },
          },
        ],
      });

      expect(() => {
        triggerManager.registerWorkflowTriggers(workflow);
      }).not.toThrow();

      const jobs = triggerManager.getScheduledJobs();
      expect(jobs).toContain('interval-workflow-start');
    });

    it('should throw error for interval trigger without interval', () => {
      const workflow = engine.createWorkflow('invalid-interval-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'interval',
            // Missing triggerOptions
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, {});
            },
          },
        ],
      });

      expect(() => {
        triggerManager.registerWorkflowTriggers(workflow);
      }).toThrow("Interval trigger for node 'start' requires interval in milliseconds");
    });
  });

  describe('Workflow and REST Triggers', () => {
    it('should handle workflow triggers without scheduling', () => {
      const workflow = engine.createWorkflow('workflow-trigger-test', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next('process', input);
            },
          },
          {
            name: 'process',
            trigger: 'workflow', // This shouldn't create any scheduled jobs
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { processed: true });
            },
          },
        ],
      });

      triggerManager.registerWorkflowTriggers(workflow);
      
      const jobs = triggerManager.getScheduledJobs();
      expect(jobs).toHaveLength(0); // No jobs should be scheduled for workflow or REST triggers
    });

    it('should handle REST triggers without scheduling', () => {
      const workflow = engine.createWorkflow('rest-trigger-test', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'POST' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { restExecuted: true });
            },
          },
        ],
      });

      triggerManager.registerWorkflowTriggers(workflow);
      
      const jobs = triggerManager.getScheduledJobs();
      expect(jobs).toHaveLength(0); // No jobs should be scheduled for REST triggers
    });
  });

  describe('Trigger Management', () => {
    it('should unregister workflow triggers', () => {
      const cronWorkflow = engine.createWorkflow('cron-test', {
        nodes: [
          {
            name: 'start',
            trigger: 'cron',
            triggerOptions: { cron: '0 * * * * *' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, {});
            },
          },
        ],
      });

      const intervalWorkflow = engine.createWorkflow('interval-test', {
        nodes: [
          {
            name: 'start',
            trigger: 'interval',
            triggerOptions: { interval: 1000 },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, {});
            },
          },
        ],
      });

      triggerManager.registerWorkflowTriggers(cronWorkflow);
      triggerManager.registerWorkflowTriggers(intervalWorkflow);

      let jobs = triggerManager.getScheduledJobs();
      expect(jobs).toHaveLength(2);

      triggerManager.unregisterWorkflowTriggers('cron-test');
      
      jobs = triggerManager.getScheduledJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs).toContain('interval-test-start');
      expect(jobs).not.toContain('cron-test-start');
    });

    it('should start and stop trigger manager', () => {
      expect(() => {
        triggerManager.start();
        triggerManager.stop();
      }).not.toThrow();
    });

    it('should clear all jobs on stop', () => {
      const workflow = engine.createWorkflow('cleanup-test', {
        nodes: [
          {
            name: 'start',
            trigger: 'cron',
            triggerOptions: { cron: '0 * * * * *' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, {});
            },
          },
        ],
      });

      triggerManager.registerWorkflowTriggers(workflow);
      
      let jobs = triggerManager.getScheduledJobs();
      expect(jobs).toHaveLength(1);

      triggerManager.stop();
      
      jobs = triggerManager.getScheduledJobs();
      expect(jobs).toHaveLength(0);
    });
  });

  describe('Event Handling', () => {
    it('should emit events for trigger fired', (done) => {
      const workflow = engine.createWorkflow('event-test', {
        nodes: [
          {
            name: 'start',
            trigger: 'cron',
            triggerOptions: { cron: '* * * * * *' }, // Every second (for testing)
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { eventTest: true });
            },
          },
        ],
      });

      triggerManager.on('triggerFired', (event) => {
        expect(event.type).toBe('cron');
        expect(event.workflow).toBe('event-test');
        expect(event.node).toBe('start');
        done();
      });

      triggerManager.registerWorkflowTriggers(workflow);
      triggerManager.start();
      
      // Clean up after test
      setTimeout(() => {
        triggerManager.stop();
      }, 1500);
    });

    it('should emit events for trigger errors', (done) => {
      // Mock the workflow engine to throw an error when executed
      const originalExecute = engine.executeWorkflow;
      engine.executeWorkflow = jest.fn().mockRejectedValue(new Error('Test error for event'));

      const workflow = engine.createWorkflow('error-event-test', {
        nodes: [
          {
            name: 'start',
            trigger: 'interval',
            triggerOptions: { interval: 50 }, // Very short interval for testing
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { test: 'should not reach here' });
            },
          },
        ],
      });

      const timeout = setTimeout(() => {
        engine.executeWorkflow = originalExecute; // Restore original
        triggerManager.stop();
        done(new Error('Test timed out waiting for trigger error event'));
      }, 2000);

      triggerManager.on('triggerError', (event) => {
        clearTimeout(timeout);
        engine.executeWorkflow = originalExecute; // Restore original
        expect(event.type).toBe('interval');
        expect(event.workflow).toBe('error-event-test');
        expect(event.node).toBe('start');
        expect(event.error).toBe('Test error for event');
        triggerManager.stop();
        done();
      });

      triggerManager.registerWorkflowTriggers(workflow);
      triggerManager.start();
    }, 5000);
  });

  describe('Unknown Trigger Types', () => {
    it('should throw error for unknown trigger type', () => {
      // Create an invalid workflow with unknown trigger type
      const invalidWorkflow = {
        name: 'invalid-trigger-workflow',
        nodes: [
          {
            name: 'start',
            trigger: 'unknown' as any,
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, {});
            },
          },
        ],
      };

      expect(() => {
        triggerManager.registerWorkflowTriggers(invalidWorkflow);
      }).toThrow('Unknown trigger type: unknown');
    });
  });
});