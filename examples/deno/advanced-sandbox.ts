// Advanced Deno sandbox example - demonstrates security and isolation
import workflow from '../../dist/index.js';

// Simulated database-like storage
const db = new Map<string, any>();

// Protected functions with rate limiting and validation
const protectedFunctions = {
  // Logging with rate limiting
  log: (() => {
    let logCount = 0;
    const maxLogs = 10;
    
    return (...args: any[]) => {
      if (logCount >= maxLogs) {
        throw new Error('Log rate limit exceeded');
      }
      logCount++;
      console.log(`[SANDBOX-${logCount}]`, ...args);
    };
  })(),
  
  // Database operations with validation
  db: {
    // Get with key validation
    get: async (key: string) => {
      if (typeof key !== 'string' || key.length === 0) {
        throw new Error('Invalid key: must be non-empty string');
      }
      const value = db.get(key);
      console.log(`🔍 DB GET: ${key} = ${JSON.stringify(value)}`);
      return value;
    },
    
    // Set with validation and size limits
    set: async (key: string, value: any) => {
      if (typeof key !== 'string' || key.length === 0) {
        throw new Error('Invalid key: must be non-empty string');
      }
      if (db.size >= 100) {
        throw new Error('Database size limit exceeded');
      }
      
      const serialized = JSON.stringify(value);
      if (serialized.length > 1000) {
        throw new Error('Value too large: max 1000 characters');
      }
      
      db.set(key, value);
      console.log(`💾 DB SET: ${key} = ${serialized}`);
      return value;
    },
    
    // List keys with pagination
    list: async (offset = 0, limit = 10) => {
      const keys = Array.from(db.keys()).slice(offset, offset + limit);
      console.log(`📋 DB LIST: offset=${offset}, limit=${limit}, found=${keys.length}`);
      return keys;
    },
  },
  
  // Math operations with input validation
  calc: {
    add: (a: number, b: number) => {
      if (typeof a !== 'number' || typeof b !== 'number') {
        throw new Error('Both arguments must be numbers');
      }
      const result = a + b;
      console.log(`🧮 CALC ADD: ${a} + ${b} = ${result}`);
      return result;
    },
    
    multiply: (a: number, b: number) => {
      if (typeof a !== 'number' || typeof b !== 'number') {
        throw new Error('Both arguments must be numbers');
      }
      if (Math.abs(a) > 1000 || Math.abs(b) > 1000) {
        throw new Error('Numbers too large: max ±1000');
      }
      const result = a * b;
      console.log(`🧮 CALC MUL: ${a} * ${b} = ${result}`);
      return result;
    },
  },
  
  // HTTP operations (simulated)
  http: {
    get: async (url: string) => {
      // Simulate HTTP request with validation
      if (!url.startsWith('https://jsonplaceholder.typicode.com/')) {
        throw new Error('Only jsonplaceholder.typicode.com URLs allowed');
      }
      console.log(`🌐 HTTP GET: ${url}`);
      // Return mock data
      return { id: 1, title: 'Mock Post', body: 'Mock content' };
    },
  },
};

// Create workflow with various sandbox configurations
const advancedWorkflow = workflow.createWorkflow('advanced-sandbox', {
  nodes: [
    {
      name: 'start',
      trigger: 'rest' as const,
      triggerOptions: { method: 'POST' as const },
      function: async (input, next) => {
        // Validate input
        if (!input.operation) {
          throw new Error('Missing operation parameter');
        }
        
        // Route to different operations
        switch (input.operation) {
          case 'calc':
            await next('calculator', input);
            break;
          case 'store':
            await next('storage', input);
            break;
          case 'fetch':
            await next('fetcher', input);
            break;
          default:
            throw new Error(`Unknown operation: ${input.operation}`);
        }
      },
    },
    
    {
      name: 'calculator',
      trigger: 'workflow' as const,
      function: async (input, next) => {
        // This node can only do calculations and logging
        const a = parseFloat(input.a) || 0;
        const b = parseFloat(input.b) || 0;
        
        log('Starting calculation with:', a, b);
        
        const sum = calc.add(a, b);
        const product = calc.multiply(a, b);
        
        log('Results:', { sum, product });
        
        await next('result', {
          operation: 'calc',
          results: { sum, product, a, b }
        });
      },
      sandbox: ['log', 'calc.add', 'calc.multiply'],
    },
    
    {
      name: 'storage',
      trigger: 'workflow' as const,
      function: async (input, next) => {
        // This node can store and retrieve data
        log('Storage operation started');
        
        const key = input.key || `data_${Date.now()}`;
        const value = input.value || { timestamp: Date.now(), random: Math.random() };
        
        // Store the data
        await db.set(key, value);
        
        // Retrieve it back
        const retrieved = await db.get(key);
        
        // List current keys
        const keys = await db.list(0, 5);
        
        log('Storage operations completed');
        
        await next('result', {
          operation: 'store',
          results: { key, stored: value, retrieved, keys }
        });
      },
      sandbox: ['log', 'db.set', 'db.get', 'db.list'],
    },
    
    {
      name: 'fetcher',
      trigger: 'workflow' as const,
      function: async (input, next) => {
        // This node can make HTTP requests
        log('HTTP fetch operation started');
        
        const url = input.url || 'https://jsonplaceholder.typicode.com/posts/1';
        
        try {
          const data = await http.get(url);
          log('Fetch successful:', data.title);
          
          await next('result', {
            operation: 'fetch',
            results: { url, data, success: true }
          });
        } catch (error) {
          log('Fetch failed:', error.message);
          
          await next('result', {
            operation: 'fetch',
            results: { url, error: error.message, success: false }
          });
        }
      },
      sandbox: ['log', 'http.get'],
    },
    
    {
      name: 'result',
      trigger: 'workflow' as const,
      function: async (input, next) => {
        log('Final result processing');
        
        // Store the result in database
        const resultKey = `result_${input.operation}_${Date.now()}`;
        await db.set(resultKey, input.results);
        
        log('Result stored with key:', resultKey);
        
        await next(next.SUCCESS, {
          message: `Operation '${input.operation}' completed successfully`,
          operation: input.operation,
          results: input.results,
          storedAs: resultKey,
        });
      },
      sandbox: ['log', 'db.set'],
    },
  ],
  protectedFunctions,
});

// Test the advanced workflow
console.log('🦕 Advanced Deno Sandbox Example');
console.log('🛡️ Features: Rate limiting, input validation, size limits, URL restrictions');

// Test different operations
const testOperations = [
  { operation: 'calc', a: 5, b: 3 },
  { operation: 'store', key: 'test1', value: { message: 'Hello Sandbox' } },
  { operation: 'fetch', url: 'https://jsonplaceholder.typicode.com/posts/1' },
];

console.log('\n🧪 Testing operations programmatically...');

for (const testInput of testOperations) {
  try {
    console.log(`\n▶️ Testing: ${JSON.stringify(testInput)}`);
    const result = await workflow.trigger('advanced-sandbox', testInput);
    console.log(`✅ Success:`, result.message);
  } catch (error) {
    console.error(`❌ Error:`, error.message);
  }
}

// Start server for REST API testing
console.log('\n🚀 Starting advanced sandbox server...');

try {
  await workflow.serve({ host: '127.0.0.1', port: 3001 });
  console.log('🌐 Server running on http://127.0.0.1:3001');
  
  console.log('\n📋 Test endpoints:');
  console.log('  POST /advanced-sandbox/start');
  console.log('  Content-Type: application/json');
  
  console.log('\n🧪 Test with curl:');
  console.log('  curl -X POST http://127.0.0.1:3001/advanced-sandbox/start \\');
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d \'{"operation": "calc", "a": 10, "b": 5}\'');
  
  console.log('\n  curl -X POST http://127.0.0.1:3001/advanced-sandbox/start \\');
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d \'{"operation": "store", "key": "mydata", "value": {"test": true}}\'');
  
  console.log('\n🔒 Security features:');
  console.log('  • Each sandbox node runs with zero Deno permissions');
  console.log('  • Rate limiting on logging functions');
  console.log('  • Input validation on all protected functions');
  console.log('  • Size limits on database operations');
  console.log('  • URL restrictions on HTTP operations');
  console.log('  • Automatic cleanup of workers on shutdown');
  
} catch (error) {
  console.error('❌ Failed to start server:', error.message);
  Deno.exit(1);
}

// Graceful shutdown
const shutdown = async () => {
  console.log('\n🛑 Shutting down...');
  await workflow.stop();
  console.log('✅ Shutdown complete');
  Deno.exit(0);
};

globalThis.addEventListener('unload', shutdown);
Deno.addSignalListener('SIGINT', shutdown);
Deno.addSignalListener('SIGTERM', shutdown);