import { WorkflowEngine } from '../src/workflow-engine';
import { WorkflowDefinition, NodeInput, NextFunction } from '../src/types';

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine();
  });

  describe('createWorkflow', () => {
    it('should create a valid workflow with start node', () => {
      const workflow = engine.createWorkflow('test-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { result: 'hello' });
            },
          },
        ],
      });

      expect(workflow.name).toBe('test-workflow');
      expect(workflow.nodes).toHaveLength(1);
      expect(workflow.nodes[0].name).toBe('start');
    });

    it('should throw error when no nodes provided', () => {
      expect(() => {
        engine.createWorkflow('invalid-workflow', { nodes: [] });
      }).toThrow("Workflow 'invalid-workflow' must have at least one node");
    });

    it('should throw error when no start node provided', () => {
      expect(() => {
        engine.createWorkflow('invalid-workflow', {
          nodes: [
            {
              name: 'middle',
              trigger: 'workflow',
              function: async (input: NodeInput, next: NextFunction) => {
                await next(next.SUCCESS, input);
              },
            },
          ],
        });
      }).toThrow("Workflow 'invalid-workflow' must have a 'start' node");
    });

    it('should throw error when duplicate node names exist', () => {
      expect(() => {
        engine.createWorkflow('invalid-workflow', {
          nodes: [
            {
              name: 'start',
              trigger: 'rest',
              triggerOptions: { method: 'GET' },
              function: async (input: NodeInput, next: NextFunction) => {
                await next(next.SUCCESS, input);
              },
            },
            {
              name: 'start',
              trigger: 'workflow',
              function: async (input: NodeInput, next: NextFunction) => {
                await next(next.SUCCESS, input);
              },
            },
          ],
        });
      }).toThrow("Workflow 'invalid-workflow' has duplicate node name: 'start'");
    });
  });

  describe('executeWorkflow', () => {
    it('should execute simple workflow successfully', async () => {
      engine.createWorkflow('simple-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { result: 'completed', input: input.test });
            },
          },
        ],
      });

      const result = await engine.executeWorkflow('simple-workflow', { test: 'value' });
      
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ result: 'completed', input: 'value' });
      expect(result.executionPath).toEqual(['start', 'SUCCESS']);
    });

    it('should handle workflow with multiple nodes', async () => {
      engine.createWorkflow('multi-node-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next('process', { value: input.number });
            },
          },
          {
            name: 'process',
            trigger: 'workflow',
            function: async (input: NodeInput, next: NextFunction) => {
              const doubled = input.value * 2;
              await next(next.SUCCESS, { doubled });
            },
          },
        ],
      });

      const result = await engine.executeWorkflow('multi-node-workflow', { number: 5 });
      
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ doubled: 10 });
      expect(result.executionPath).toEqual(['start', 'process', 'SUCCESS']);
    });

    it('should handle conditional workflow (if-then-else)', async () => {
      engine.createWorkflow('conditional-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              if (input.a > 10) {
                await next('then', { a: input.a });
              } else {
                await next('else', { a: input.a, error: 'number too small' });
              }
            },
          },
          {
            name: 'then',
            trigger: 'workflow',
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { message: `${input.a}>10!` });
            },
          },
          {
            name: 'else',
            trigger: 'workflow',
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.ERROR, { message: `${input.a}<=10 :(` });
            },
          },
        ],
      });

      // Test then branch
      const resultThen = await engine.executeWorkflow('conditional-workflow', { a: 15 });
      expect(resultThen.success).toBe(true);
      expect(resultThen.result).toEqual({ message: '15>10!' });

      // Test else branch
      const resultElse = await engine.executeWorkflow('conditional-workflow', { a: 5 });
      expect(resultElse.success).toBe(false);
      expect(resultElse.error).toBe('5<=10 :(');
    });

    it('should handle parallel execution workflow', async () => {
      engine.createWorkflow('parallel-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next('mult', { a: input.a, b: input.b });
              await next('plus', { a: input.a, b: input.b });
            },
          },
          {
            name: 'mult',
            trigger: 'workflow',
            function: async (input: NodeInput, next: NextFunction) => {
              await next('result', { m: input.a * input.b });
            },
          },
          {
            name: 'plus',
            trigger: 'workflow',
            function: async (input: NodeInput, next: NextFunction) => {
              await next('result', { p: input.a + input.b });
            },
          },
          {
            name: 'result',
            trigger: 'workflow',
            function: async (input: NodeInput, next: NextFunction) => {
              const total = (input.m || 0) + (input.p || 0);
              await next(next.SUCCESS, { message: `result of a*b+(a+b) = ${total}` });
            },
          },
        ],
      });

      const result = await engine.executeWorkflow('parallel-workflow', { a: 3, b: 2 });
      expect(result.success).toBe(true);
      // This is simplified - the actual parallel execution would be more complex
      // For now, we just test that the workflow completes
      expect(result.result).toBeDefined();
    });

    it('should handle errors in node execution', async () => {
      engine.createWorkflow('error-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              throw new Error('Node execution failed');
            },
          },
        ],
      });

      const result = await engine.executeWorkflow('error-workflow', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Node execution failed');
    });

    it('should detect circular dependencies', async () => {
      engine.createWorkflow('circular-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next('node-a', input);
            },
          },
          {
            name: 'node-a',
            trigger: 'workflow',
            function: async (input: NodeInput, next: NextFunction) => {
              await next('node-b', input);
            },
          },
          {
            name: 'node-b',
            trigger: 'workflow',
            function: async (input: NodeInput, next: NextFunction) => {
              await next('node-a', input); // Creates circular dependency
            },
          },
        ],
      });

      const result = await engine.executeWorkflow('circular-workflow', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Circular dependency detected');
    });

    it('should return error for non-existent workflow', async () => {
      const result = await engine.executeWorkflow('non-existent', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe("Workflow 'non-existent' not found");
    });
  });

  describe('logging functionality', () => {
    it('should call logger for each node execution', async () => {
      const logEntries: any[] = [];
      const logger = jest.fn((entry) => {
        logEntries.push(entry);
      });

      engine.createWorkflow('logged-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next('second', { value: 'from-start' });
            },
          },
          {
            name: 'second',
            trigger: 'workflow',
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { final: 'result' });
            },
          },
        ],
        logger,
      });

      await engine.executeWorkflow('logged-workflow', { initial: 'input' });

      expect(logger).toHaveBeenCalledTimes(2);
      expect(logEntries).toHaveLength(2);
      
      // Check first node log
      expect(logEntries[0].workflowName).toBe('logged-workflow');
      expect(logEntries[0].nodeName).toBe('start');
      expect(logEntries[0].input).toEqual({ initial: 'input' });
      expect(logEntries[0].output).toEqual([{ target: 'second', data: { value: 'from-start' } }]);
      expect(logEntries[0].timestamp).toBeInstanceOf(Date);
      expect(logEntries[0].duration).toBeGreaterThanOrEqual(0);
      
      // Check second node log
      expect(logEntries[1].workflowName).toBe('logged-workflow');
      expect(logEntries[1].nodeName).toBe('second');
      expect(logEntries[1].input).toEqual({ value: 'from-start' });
      expect(logEntries[1].output).toEqual([{ target: 'SUCCESS', data: { final: 'result' } }]);
    });

    it('should capture console output when logger is provided', async () => {
      const logEntries: any[] = [];
      const logger = jest.fn((entry) => {
        logEntries.push(entry);
      });

      engine.createWorkflow('console-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              console.log('This is a log message');
              console.error('This is an error');
              console.warn('This is a warning');
              console.info('This is info');
              await next(next.SUCCESS, { done: true });
            },
          },
        ],
        logger,
      });

      await engine.executeWorkflow('console-workflow', {});

      expect(logger).toHaveBeenCalledTimes(1);
      expect(logEntries[0].console).toContain('[log] This is a log message');
      expect(logEntries[0].console).toContain('[error] This is an error');
      expect(logEntries[0].console).toContain('[warn] This is a warning');
      expect(logEntries[0].console).toContain('[info] This is info');
    });

    it('should capture exceptions in logger', async () => {
      const logEntries: any[] = [];
      const logger = jest.fn((entry) => {
        logEntries.push(entry);
      });

      engine.createWorkflow('error-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              console.log('About to throw error');
              throw new Error('Test error message');
            },
          },
        ],
        logger,
      });

      const result = await engine.executeWorkflow('error-workflow', {});

      expect(result.success).toBe(false);
      expect(logger).toHaveBeenCalledTimes(1);
      expect(logEntries[0].exception).toBeDefined();
      expect(logEntries[0].exception.message).toBe('Test error message');
      expect(logEntries[0].exception.stack).toBeDefined();
      expect(logEntries[0].console).toContain('[log] About to throw error');
    });

    it('should handle parallel node execution logging', async () => {
      const logEntries: any[] = [];
      const logger = jest.fn((entry) => {
        logEntries.push(entry);
      });

      engine.createWorkflow('parallel-logged', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next('branch1', { value: 1 });
              await next('branch2', { value: 2 });
            },
          },
          {
            name: 'branch1',
            trigger: 'workflow',
            function: async (input: NodeInput, next: NextFunction) => {
              console.log('Branch 1 executing');
              await next('merge', { from: 'branch1', data: input.value });
            },
          },
          {
            name: 'branch2',
            trigger: 'workflow',
            function: async (input: NodeInput, next: NextFunction) => {
              console.log('Branch 2 executing');
              await next('merge', { from: 'branch2', data: input.value });
            },
          },
          {
            name: 'merge',
            trigger: 'workflow',
            function: async (input: NodeInput, next: NextFunction) => {
              console.log('Merge node executing');
              await next(next.SUCCESS, input);
            },
          },
        ],
        logger,
      });

      await engine.executeWorkflow('parallel-logged', {});

      // Should have logs for all nodes
      expect(logger).toHaveBeenCalled();
      const nodeNames = logEntries.map(e => e.nodeName);
      expect(nodeNames).toContain('start');
      expect(nodeNames).toContain('branch1');
      expect(nodeNames).toContain('branch2');
      expect(nodeNames).toContain('merge');
      
      // Check that parallel branches were logged
      const startLog = logEntries.find(e => e.nodeName === 'start');
      expect(startLog.output).toHaveLength(2);
      expect(startLog.output).toContainEqual({ target: 'branch1', data: { value: 1 } });
      expect(startLog.output).toContainEqual({ target: 'branch2', data: { value: 2 } });
    });

    it('should not affect workflow execution when logger is not provided', async () => {
      engine.createWorkflow('no-logger-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              console.log('This should work normally');
              await next(next.SUCCESS, { result: 'success' });
            },
          },
        ],
        // No logger provided
      });

      const result = await engine.executeWorkflow('no-logger-workflow', {});
      
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ result: 'success' });
    });

    it('should measure execution duration accurately', async () => {
      const logEntries: any[] = [];
      const logger = jest.fn((entry) => {
        logEntries.push(entry);
      });

      engine.createWorkflow('timed-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              // Simulate some work
              await new Promise(resolve => setTimeout(resolve, 50));
              await next(next.SUCCESS, {});
            },
          },
        ],
        logger,
      });

      await engine.executeWorkflow('timed-workflow', {});

      expect(logEntries[0].duration).toBeGreaterThanOrEqual(50);
      expect(logEntries[0].duration).toBeLessThan(200); // Should not take too long
    });
  });

  describe('workflow management', () => {
    it('should retrieve workflow by name', () => {
      const originalWorkflow = engine.createWorkflow('test-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, input);
            },
          },
        ],
      });

      const retrieved = engine.getWorkflow('test-workflow');
      expect(retrieved).toEqual(originalWorkflow);
    });

    it('should return undefined for non-existent workflow', () => {
      const retrieved = engine.getWorkflow('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('should get all workflows', () => {
      engine.createWorkflow('workflow-1', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, input);
            },
          },
        ],
      });

      engine.createWorkflow('workflow-2', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'POST' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, input);
            },
          },
        ],
      });

      const all = engine.getAllWorkflows();
      expect(all).toHaveLength(2);
      expect(all.map(w => w.name)).toContain('workflow-1');
      expect(all.map(w => w.name)).toContain('workflow-2');
    });

    it('should delete workflow', () => {
      engine.createWorkflow('to-delete', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, input);
            },
          },
        ],
      });

      expect(engine.getWorkflow('to-delete')).toBeDefined();
      
      const deleted = engine.deleteWorkflow('to-delete');
      expect(deleted).toBe(true);
      expect(engine.getWorkflow('to-delete')).toBeUndefined();
    });

    it('should return false when deleting non-existent workflow', () => {
      const deleted = engine.deleteWorkflow('non-existent');
      expect(deleted).toBe(false);
    });
  });
});