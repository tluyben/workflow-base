import express, { Express, Request, Response, NextFunction } from 'express';
import { WorkflowEngine } from './workflow-engine';
import { TriggerManager } from './trigger-manager';
import {
  WorkflowDefinition,
  ServeOptions,
  RestTriggerOptions,
  NodeInput,
} from './types';

export class WorkflowServer {
  private app: Express;
  private workflowEngine: WorkflowEngine;
  private triggerManager: TriggerManager;
  private server: any = null;
  private isRunning: boolean = false;
  private has404Handler: boolean = false;
  private static processHandlersSet: boolean = false;

  constructor() {
    this.app = express();
    this.workflowEngine = new WorkflowEngine();
    this.triggerManager = new TriggerManager(this.workflowEngine);
    
    this.setupMiddleware();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Add request logging middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
      });
      
      next();
    });

    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        workflows: this.workflowEngine.getAllWorkflows().length,
        runningExecutions: this.workflowEngine.getRunningExecutions().length,
      });
    });

    // Workflow info endpoints
    this.app.get('/workflows', (req: Request, res: Response) => {
      try {
        const workflows = this.workflowEngine.getAllWorkflows().map(wf => ({
          name: wf.name,
          nodes: wf.nodes.map(n => ({
            name: n.name,
            trigger: n.trigger,
            triggerOptions: n.triggerOptions,
          })),
        }));
        res.json({ workflows });
      } catch (error) {
        this.handleError(error, req, res);
      }
    });

    this.app.get('/workflows/:name', (req: Request, res: Response) => {
      try {
        const workflow = this.workflowEngine.getWorkflow(req.params.name);
        if (!workflow) {
          return res.status(404).json({ error: `Workflow '${req.params.name}' not found` });
        }
        
        res.json({
          name: workflow.name,
          nodes: workflow.nodes.map(n => ({
            name: n.name,
            trigger: n.trigger,
            triggerOptions: n.triggerOptions,
          })),
        });
      } catch (error) {
        this.handleError(error, req, res);
      }
    });

    // Execute workflow endpoint
    this.app.post('/workflows/:name/execute', async (req: Request, res: Response) => {
      try {
        const input: NodeInput = {
          ...req.query,
          ...req.body,
          headers: req.headers as { [key: string]: string },
        };

        const result = await this.workflowEngine.executeWorkflow(req.params.name, input);
        
        if (result.success) {
          res.json({
            success: true,
            result: result.result,
            executionPath: result.executionPath,
          });
        } else {
          res.status(400).json({
            success: false,
            error: result.error,
            executionPath: result.executionPath,
          });
        }
      } catch (error) {
        this.handleError(error, req, res);
      }
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
      console.error(`[${new Date().toISOString()}] Unhandled error:`, error);
      
      if (res.headersSent) {
        return next(error);
      }
      
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        timestamp: new Date().toISOString(),
      });
    });

    // Note: 404 handler will be set up dynamically after all routes are registered

    // Process-level error handlers for uncrashable server (only set once globally)
    if (!WorkflowServer.processHandlersSet) {
      process.on('uncaughtException', (error: Error) => {
        console.error(`[${new Date().toISOString()}] Uncaught Exception:`, error);
        // Don't exit - keep the server running
      });

      process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
        console.error(`[${new Date().toISOString()}] Unhandled Rejection at:`, promise, 'reason:', reason);
        // Don't exit - keep the server running
      });
      
      WorkflowServer.processHandlersSet = true;
    }
  }

  private handleError(error: unknown, req: Request, res: Response): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${new Date().toISOString()}] Error in ${req.method} ${req.path}:`, error);
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }

  createWorkflow(name: string, definition: Omit<WorkflowDefinition, 'name'>): WorkflowDefinition {
    try {
      const workflow = this.workflowEngine.createWorkflow(name, definition);
      this.registerRestEndpoints(workflow);
      this.triggerManager.registerWorkflowTriggers(workflow);
      return workflow;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error creating workflow '${name}':`, error);
      throw error;
    }
  }

  private registerRestEndpoints(workflow: WorkflowDefinition): void {
    const restNodes = workflow.nodes.filter(node => node.trigger === 'rest');
    
    for (const node of restNodes) {
      if (!node.triggerOptions || !('method' in node.triggerOptions)) {
        continue;
      }

      const options = node.triggerOptions as RestTriggerOptions;
      const path = options.path || `/${workflow.name}/${node.name}`;
      const method = options.method.toLowerCase();

      // Dynamically register the route
      (this.app as any)[method](path, async (req: Request, res: Response) => {
        try {
          const input: NodeInput = {
            ...req.query,
            ...(req.body || {}),
            headers: req.headers as { [key: string]: string },
            query: req.query,
            body: req.body,
          };

          let result;
          if (node.name === 'start') {
            // If it's the start node, execute the entire workflow
            result = await this.workflowEngine.executeWorkflow(workflow.name, input);
          } else {
            // If it's not the start node, execute just this node
            // This is simplified - you might want more sophisticated routing
            const nextFunction = async (nextNodeName: string, output: any = {}) => {
              // Handle next function calls appropriately
              return output;
            };
            nextFunction.SUCCESS = 'SUCCESS';
            nextFunction.ERROR = 'ERROR';

            await node.function(input, nextFunction);
            result = { success: true, result: input };
          }

          if (result.success) {
            res.json({
              success: true,
              result: result.result,
              executionPath: result.executionPath,
            });
          } else {
            res.status(400).json({
              success: false,
              error: result.error,
              executionPath: result.executionPath,
            });
          }
        } catch (error) {
          this.handleError(error, req, res);
        }
      });

      console.log(`[${new Date().toISOString()}] Registered ${options.method} ${path} for workflow '${workflow.name}' node '${node.name}'`);
    }
  }

  async trigger(workflowName: string, input: NodeInput = {}): Promise<any> {
    const result = await this.workflowEngine.executeWorkflow(workflowName, input);
    if (result.success) {
      return result.result;
    } else {
      throw new Error(result.error || 'Workflow execution failed');
    }
  }

  private setupFinal404Handler(): void {
    if (!this.has404Handler) {
      // 404 handler - must be set up last after all routes
      this.app.use('*', (req: Request, res: Response) => {
        res.status(404).json({
          error: 'Not found',
          message: `Route ${req.method} ${req.originalUrl} not found`,
          timestamp: new Date().toISOString(),
        });
      });
      this.has404Handler = true;
    }
  }

  serve(options: ServeOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isRunning) {
        return reject(new Error('Server is already running'));
      }

      // Set up 404 handler after all dynamic routes have been registered
      this.setupFinal404Handler();

      const host = options.host || '127.0.0.1';
      const port = options.port || 3000;

      try {
        this.server = this.app.listen(port, host, () => {
          this.isRunning = true;
          this.triggerManager.start();
          console.log(`[${new Date().toISOString()}] Workflow server running on http://${host}:${port}`);
          resolve();
        });

        this.server.on('error', (error: Error) => {
          console.error(`[${new Date().toISOString()}] Server error:`, error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isRunning || !this.server) {
        return resolve();
      }

      this.triggerManager.stop();
      
      this.server.close(() => {
        this.isRunning = false;
        this.server = null;
        console.log(`[${new Date().toISOString()}] Workflow server stopped`);
        resolve();
      });
    });
  }

  getApp(): Express {
    // Ensure 404 handler is set up when app is accessed directly (e.g., in tests)
    this.setupFinal404Handler();
    return this.app;
  }

  getWorkflowEngine(): WorkflowEngine {
    return this.workflowEngine;
  }

  getTriggerManager(): TriggerManager {
    return this.triggerManager;
  }
}