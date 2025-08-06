import request from 'supertest';
import { WorkflowServer } from '../src/server';
import { NodeInput, NextFunction } from '../src/types';

describe('WorkflowServer', () => {
  let server: WorkflowServer;

  beforeEach(() => {
    server = new WorkflowServer();
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('Health and Info Endpoints', () => {
    it('should respond to health check', async () => {
      const response = await request(server.getApp())
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        workflows: 0,
        runningExecutions: 0,
      });
      expect(response.body.timestamp).toBeDefined();
    });

    it('should list all workflows', async () => {
      server.createWorkflow('test-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { result: 'test' });
            },
          },
        ],
      });

      const response = await request(server.getApp())
        .get('/workflows')
        .expect(200);

      expect(response.body.workflows).toHaveLength(1);
      expect(response.body.workflows[0].name).toBe('test-workflow');
      expect(response.body.workflows[0].nodes).toHaveLength(1);
      expect(response.body.workflows[0].nodes[0].name).toBe('start');
    });

    it('should get specific workflow info', async () => {
      server.createWorkflow('specific-workflow', {
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

      const response = await request(server.getApp())
        .get('/workflows/specific-workflow')
        .expect(200);

      expect(response.body.name).toBe('specific-workflow');
      expect(response.body.nodes[0].trigger).toBe('rest');
      expect(response.body.nodes[0].triggerOptions.method).toBe('POST');
    });

    it('should return 404 for non-existent workflow', async () => {
      const response = await request(server.getApp())
        .get('/workflows/non-existent')
        .expect(404);

      expect(response.body.error).toBe("Workflow 'non-existent' not found");
    });
  });

  describe('Workflow Execution', () => {
    it('should execute workflow via POST endpoint', async () => {
      server.createWorkflow('post-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { 
                message: 'success', 
                receivedInput: input.testValue,
                hasHeaders: !!input.headers
              });
            },
          },
        ],
      });

      const response = await request(server.getApp())
        .post('/workflows/post-workflow/execute')
        .send({ testValue: 'hello' })
        .set('X-Test-Header', 'test-value')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.result.message).toBe('success');
      expect(response.body.result.receivedInput).toBe('hello');
      expect(response.body.result.hasHeaders).toBe(true);
      expect(response.body.executionPath).toContain('start');
    });

    it('should handle workflow execution errors', async () => {
      server.createWorkflow('error-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.ERROR, { message: 'Something went wrong' });
            },
          },
        ],
      });

      const response = await request(server.getApp())
        .post('/workflows/error-workflow/execute')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Something went wrong');
    });

    it('should handle non-existent workflow execution', async () => {
      const response = await request(server.getApp())
        .post('/workflows/non-existent/execute')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Workflow 'non-existent' not found");
    });
  });

  describe('REST Triggers', () => {
    it('should register GET endpoint for REST trigger', async () => {
      server.createWorkflow('rest-get-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { 
                method: 'GET',
                query: input.query,
                testParam: input.testParam
              });
            },
          },
        ],
      });

      const response = await request(server.getApp())
        .get('/rest-get-workflow/start?testParam=value123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.result.method).toBe('GET');
      expect(response.body.result.testParam).toBe('value123');
    });

    it('should register POST endpoint for REST trigger', async () => {
      server.createWorkflow('rest-post-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'POST' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { 
                method: 'POST',
                body: input.body,
                receivedData: input.data
              });
            },
          },
        ],
      });

      const response = await request(server.getApp())
        .post('/rest-post-workflow/start')
        .send({ data: 'test-data' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.result.method).toBe('POST');
      expect(response.body.result.receivedData).toBe('test-data');
    });

    it('should handle custom path for REST trigger', async () => {
      server.createWorkflow('custom-path-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET', path: '/custom/api/endpoint' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { message: 'custom path works' });
            },
          },
        ],
      });

      const response = await request(server.getApp())
        .get('/custom/api/endpoint')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.result.message).toBe('custom path works');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const response = await request(server.getApp())
        .get('/unknown/route')
        .expect(404);

      expect(response.body.error).toBe('Not found');
      expect(response.body.message).toContain('Route GET /unknown/route not found');
    });

    it('should handle workflow errors gracefully', async () => {
      server.createWorkflow('crash-workflow', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              throw new Error('Simulated workflow error');
            },
          },
        ],
      });

      const response = await request(server.getApp())
        .get('/crash-workflow/start')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Simulated workflow error');
    });
  });

  describe('Server Management', () => {
    it('should start and stop server', async () => {
      const port = 3001; // Use different port for testing
      
      await expect(server.serve({ port })).resolves.toBeUndefined();
      await expect(server.stop()).resolves.toBeUndefined();
    });

    it('should prevent starting server twice', async () => {
      const port = 3002;
      
      await server.serve({ port });
      await expect(server.serve({ port: 3003 })).rejects.toThrow('Server is already running');
      await server.stop();
    });
  });

  describe('Trigger Method', () => {
    it('should execute workflow via trigger method', async () => {
      server.createWorkflow('trigger-test', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.SUCCESS, { 
                doubled: input.value * 2 
              });
            },
          },
        ],
      });

      const result = await server.trigger('trigger-test', { value: 5 });
      expect(result.doubled).toBe(10);
    });

    it('should throw error for failed workflow execution', async () => {
      server.createWorkflow('trigger-error-test', {
        nodes: [
          {
            name: 'start',
            trigger: 'rest',
            triggerOptions: { method: 'GET' },
            function: async (input: NodeInput, next: NextFunction) => {
              await next(next.ERROR, { message: 'Trigger error test' });
            },
          },
        ],
      });

      await expect(server.trigger('trigger-error-test', {}))
        .rejects.toThrow('Trigger error test');
    });
  });
});