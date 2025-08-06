import workflow, { createWorkflow, serve, trigger, stop } from '../src/index';
import { NodeInput, NextFunction } from '../src/types';

describe('Main API', () => {
  afterEach(async () => {
    await stop();
  });

  describe('Default Export', () => {
    it('should create workflow using default export', () => {
      const wf = workflow.createWorkflow('default-export-test', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { message: 'default export works' });
            },
          },
        ],
      });

      expect(wf.name).toBe('default-export-test');
      expect(wf.nodes).toHaveLength(1);
    });

    it('should trigger workflow using default export', async () => {
      workflow.createWorkflow('trigger-test', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { 
                result: 'triggered successfully',
                inputValue: input.testValue 
              });
            },
          },
        ],
      });

      const result = await workflow.trigger('trigger-test', { testValue: 'hello' });
      expect(result.result).toBe('triggered successfully');
      expect(result.inputValue).toBe('hello');
    });
  });

  describe('Named Exports', () => {
    it('should create workflow using named export', () => {
      const wf = createWorkflow('named-export-test', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'POST' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { message: 'named export works' });
            },
          },
        ],
      });

      expect(wf.name).toBe('named-export-test');
      expect(wf.nodes[0].triggerOptions).toEqual({ method: 'POST' });
    });

    it('should trigger workflow using named export', async () => {
      createWorkflow('named-trigger-test', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { 
                message: 'named trigger works',
                doubled: input.number * 2
              });
            },
          },
        ],
      });

      const result = await trigger('named-trigger-test', { number: 7 });
      expect(result.message).toBe('named trigger works');
      expect(result.doubled).toBe(14);
    });
  });

  describe('Server Operations', () => {
    it('should start and stop server', async () => {
      const port = 3005; // Use unique port for this test
      
      await expect(serve({ port, host: '127.0.0.1' })).resolves.toBeUndefined();
      await expect(stop()).resolves.toBeUndefined();
    });

    it('should handle server start errors', async () => {
      const port = 3006;
      
      // Start server first time - should succeed
      await serve({ port });
      
      // Try to start again - should fail
      await expect(serve({ port: 3007 })).rejects.toThrow('Server is already running');
      
      await stop();
    });
  });

  describe('Complex Workflow Integration', () => {
    it('should handle complex multi-node workflow', async () => {
      createWorkflow('complex-integration-test', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              const value = input.value || 0;
              if (value > 10) {
                await next('high-value', { value, category: 'high' });
              } else {
                await next('low-value', { value, category: 'low' });
              }
            },
          },
          {
            name: 'high-value',
            trigger: 'workflow',
            function: async (input: NodeInput, next: NextFunction) => {
              await next('calculate', { 
                value: input.value,
                multiplier: 2,
                category: input.category 
              });
            },
          },
          {
            name: 'low-value',
            trigger: 'workflow',
            function: async (input: NodeInput, next: NextFunction) => {
              await next('calculate', { 
                value: input.value,
                multiplier: 5,
                category: input.category 
              });
            },
          },
          {
            name: 'calculate',
            trigger: 'workflow',
            function: async (input: NodeInput, next: NextFunction) => {
              const result = input.value * input.multiplier;
              await next(next.SUCCESS, { 
                originalValue: input.value,
                multiplier: input.multiplier,
                result,
                category: input.category,
                message: `${input.value} * ${input.multiplier} = ${result} (${input.category} value)`
              });
            },
          },
        ],
      });

      // Test high value path
      const highResult = await trigger('complex-integration-test', { value: 15 });
      expect(highResult.originalValue).toBe(15);
      expect(highResult.multiplier).toBe(2);
      expect(highResult.result).toBe(30);
      expect(highResult.category).toBe('high');

      // Test low value path
      const lowResult = await trigger('complex-integration-test', { value: 5 });
      expect(lowResult.originalValue).toBe(5);
      expect(lowResult.multiplier).toBe(5);
      expect(lowResult.result).toBe(25);
      expect(lowResult.category).toBe('low');
    });

    it('should handle workflow with error conditions', async () => {
      createWorkflow('error-handling-test', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              if (!input.required) {
                await next(next.ERROR, { message: 'Missing required parameter' });
              } else {
                await next(next.SUCCESS, { 
                  message: 'All good!',
                  received: input.required
                });
              }
            },
          },
        ],
      });

      // Test success case
      const successResult = await trigger('error-handling-test', { required: 'present' });
      expect(successResult.message).toBe('All good!');
      expect(successResult.received).toBe('present');

      // Test error case
      await expect(trigger('error-handling-test', {}))
        .rejects.toThrow('Missing required parameter');
    });
  });
});