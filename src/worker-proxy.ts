import { WorkerMessage, WorkerResponse } from './types';

/**
 * Creates a remote API proxy for worker-side usage
 * This allows sandboxed code to call protected functions via message passing
 */
export function createRemoteApi(sendFn: (payload: WorkerMessage) => void) {
  let id = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();

  // Handle messages from parent
  (globalThis as any).onmessage = (e: any) => {
    const { id: responseId, result, error } = e.data;
    const handler = pending.get(responseId);
    
    if (handler) {
      pending.delete(responseId);
      if (error) {
        handler.reject(new Error(error));
      } else {
        handler.resolve(result);
      }
    }
  };

  const call = (method: string, ...args: any[]): Promise<any> => {
    return new Promise((resolve, reject) => {
      const reqId = id++;
      pending.set(reqId, { resolve, reject });
      
      try {
        sendFn({ id: reqId, method, args });
      } catch (error) {
        pending.delete(reqId);
        reject(error);
      }
    });
  };

  // Create a dynamic proxy that can handle any method call
  return new Proxy({}, {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined;
      
      // Handle nested properties like 'storage.get'
      if (prop.includes('.')) {
        return (...args: any[]) => call(prop, ...args);
      }
      
      // Handle direct method calls
      return (...args: any[]) => call(prop, ...args);
    }
  }) as any;
}

/**
 * Parent-side message dispatcher
 * Handles worker requests and routes them to appropriate handlers
 */
export class WorkerMessageDispatcher {
  private apiHandlers: { [key: string]: any } = {};

  constructor(protectedFunctions: { [key: string]: any } = {}) {
    this.apiHandlers = { ...protectedFunctions };
  }

  async handleMessage(worker: any, message: WorkerMessage): Promise<void> {
    const { id, method, args } = message;
    
    try {
      // Navigate to the handler function
      const parts = method.split('.');
      let fn = this.apiHandlers;
      
      for (const part of parts) {
        fn = fn?.[part];
        if (!fn) {
          throw new Error(`Method '${method}' not found in protected functions`);
        }
      }
      
      if (typeof fn !== 'function') {
        throw new Error(`'${method}' is not a function`);
      }

      // Execute the function
      const result = await fn(...args);
      
      // Send result back to worker
      worker.postMessage({ id, result } as WorkerResponse);
      
    } catch (error) {
      // Send error back to worker
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      worker.postMessage({ id, error: errorMessage } as WorkerResponse);
    }
  }

  addHandler(path: string, handler: (...args: any[]) => any): void {
    const parts = path.split('.');
    let current = this.apiHandlers;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
    
    current[parts[parts.length - 1]] = handler;
  }

  removeHandler(path: string): void {
    const parts = path.split('.');
    let current = this.apiHandlers;
    
    for (let i = 0; i < parts.length - 1; i++) {
      current = current[parts[i]];
      if (!current) return;
    }
    
    delete current[parts[parts.length - 1]];
  }

  getHandlers(): { [key: string]: any } {
    return { ...this.apiHandlers };
  }
}