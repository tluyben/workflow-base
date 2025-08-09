# Workflow Base

A simple yet powerful workflow backend system for Node.js with TypeScript support. Create automated workflows with multiple trigger types, robust execution patterns, and a rock-solid Express server that never crashes.

## 🚀 Features

- **Multiple Trigger Types**: REST endpoints, Cron schedules, Intervals, and Workflow chains
- **Async/Await Support**: Full async node execution with `next()` function calls  
- **Rock-solid Server**: Uncrashable Express server with comprehensive error handling
- **Parallel Execution**: Support for branching workflows and parallel processing
- **🦕 Deno Sandbox**: Secure isolated execution with zero permissions (Deno only)
- **Workflow Logging**: Optional logging callback to capture execution details, console output, and errors
- **TypeScript**: Full type safety and IntelliSense support
- **Dual Runtime**: Works in both Node.js and Deno environments
- **Zero Configuration**: Works out of the box with sensible defaults
- **Comprehensive Testing**: 100% Jest test coverage

## 📦 Installation

```bash
npm install workflow-base
```

## 🏃‍♂️ Quick Start

### Node.js Usage

```javascript
const workflow = require('workflow-base');

// Create a simple workflow
const myWorkflow = workflow.createWorkflow('my-lovely-workflow', {
  nodes: [
    {
      name: 'start',
      trigger: 'rest',
      triggerOptions: { method: 'GET' },
      function: async (input, next) => {
        const message = `Hello, ${input.name || 'World'}!`;
        await next(next.SUCCESS, { message, timestamp: new Date() });
      }
    }
  ]
});

// Start the server
await workflow.serve({ host: '127.0.0.1', port: 3000 });
console.log('🚀 Workflow server running on http://127.0.0.1:3000');

// Test it: curl "http://127.0.0.1:3000/my-lovely-workflow/start?name=Workflow"
```

### 🦕 Deno with Sandbox Security

```typescript
// deno-secure.ts
import workflow from 'workflow-base';

// Define functions available to sandboxed nodes
const protectedFunctions = {
  log: (...args: any[]) => console.log('[SANDBOX]', ...args),
  math: {
    square: (n: number) => n * n,
    add: (a: number, b: number) => a + b,
  },
  storage: {
    data: {} as any,
    set: async (key: string, value: any) => storage.data[key] = value,
    get: async (key: string) => storage.data[key],
  },
};

const secureWorkflow = workflow.createWorkflow('secure-calc', {
  nodes: [
    {
      name: 'start',
      trigger: 'rest',
      triggerOptions: { method: 'GET' },
      function: async (input, next) => {
        const a = parseFloat(input.a) || 0;
        const b = parseFloat(input.b) || 0;
        await next('calculate', { a, b });
      },
    },
    {
      name: 'calculate',
      trigger: 'workflow',
      function: async (input, next) => {
        // 🔒 This runs in isolated worker with ZERO permissions
        log('Processing numbers:', input.a, input.b);
        const sum = math.add(input.a, input.b);
        const square = math.square(sum);
        
        await storage.set('lastCalculation', { sum, square });
        log('Results:', { sum, square });
        
        await next(next.SUCCESS, { sum, square });
      },
      sandbox: ['log', 'math.add', 'math.square', 'storage.set'], // Only these functions allowed
    },
  ],
  protectedFunctions, // Provide controlled API to sandboxed nodes
});

await workflow.serve({ port: 3000 });
```

Run with: `deno run --allow-net --allow-read deno-secure.ts`

**🛡️ Sandbox Features:**
- Zero file system access
- Zero network access  
- Zero environment access
- Only approved functions callable
- Automatic worker cleanup
- Crash isolation

## 📚 Core Concepts

### Workflow Structure

Every workflow needs:
- A `name` - unique identifier
- A `nodes` array with at least a `'start'` node
- Each node has a `trigger`, optional `triggerOptions`, and a `function`

### Trigger Types

| Trigger | Description | Options |
|---------|-------------|---------|
| `rest` | HTTP endpoints | `{ method: 'GET'/'POST'/etc, path?: string }` |
| `cron` | Scheduled execution | `{ cron: '0 */5 * * * *' }` |
| `interval` | Repeated execution | `{ interval: 30000 }` (ms) |
| `workflow` | Internal chain | None needed |

### The `next()` Function

Every node function receives `(input, next)` parameters:

```javascript
async function(input, next) {
  // Process input data
  console.log('Received:', input);
  
  // Continue to another node
  await next('nextNodeName', { data: 'processed' });
  
  // Or end the workflow
  await next(next.SUCCESS, { result: 'completed' });
  await next(next.ERROR, { error: 'something failed' });
}
```

## 🌟 Examples

### If-Then-Else Pattern

```javascript
const ifthenelse = workflow.createWorkflow('ifthenelse', {
  nodes: [
    {
      name: 'start',
      trigger: 'rest',
      triggerOptions: { method: 'GET' },
      function: async (input, next) => {
        if (input.a > 10) {
          return await next('then', { a: input.a });
        } else {
          return await next('else', { a: input.a, error: 'number too small' });
        }
      }
    },
    {
      name: 'then',
      trigger: 'workflow',
      function: async (input, next) => {
        await next(next.SUCCESS, { message: `${input.a}>10!` });
      }
    },
    {
      name: 'else',
      trigger: 'workflow',
      function: async (input, next) => {
        await next(next.ERROR, { message: `${input.a}<=10 :(` });
      }
    }
  ]
});

// Test: GET /ifthenelse/start?a=15
```

### Parallel Processing

```javascript
const parcalc = workflow.createWorkflow('parcalc', {
  nodes: [
    {
      name: 'start',
      trigger: 'rest',
      triggerOptions: { method: 'GET' },
      function: async (input, next) => {
        // Execute both operations in parallel
        await next('mult', { a: input.a, b: input.b });
        await next('plus', { a: input.a, b: input.b });
      }
    },
    {
      name: 'mult',
      trigger: 'workflow',
      function: async (input, next) => {
        await next('result', { m: input.a * input.b });
      }
    },
    {
      name: 'plus',
      trigger: 'workflow',
      function: async (input, next) => {
        await next('result', { p: input.a + input.b });
      }
    },
    {
      name: 'result',
      trigger: 'workflow',
      function: async (input, next) => {
        const total = (input.m || 0) + (input.p || 0);
        await next(next.SUCCESS, { 
          message: `result of a*b+(a+b) = ${total}` 
        });
      }
    }
  ]
});

// Test: GET /parcalc/start?a=3&b=2
```

### Scheduled Tasks

```javascript
// Cron job - runs every 5 minutes
workflow.createWorkflow('backup-job', {
  nodes: [
    {
      name: 'start',
      trigger: 'cron',
      triggerOptions: { cron: '0 */5 * * * *' },
      function: async (input, next) => {
        console.log('🗄️ Running backup...');
        // Your backup logic here
        await next(next.SUCCESS, { backupCompleted: true });
      }
    }
  ]
});

// Interval job - runs every 30 seconds  
workflow.createWorkflow('health-check', {
  nodes: [
    {
      name: 'start',
      trigger: 'interval',
      triggerOptions: { interval: 30000 },
      function: async (input, next) => {
        const isHealthy = await checkSystemHealth();
        console.log('❤️ Health check:', isHealthy ? 'OK' : 'FAIL');
        await next(next.SUCCESS, { healthy: isHealthy });
      }
    }
  ]
});
```

### Workflow Logging

Track and monitor your workflow execution with the optional logging feature:

```javascript
// Define a custom logger function
const logger = (logEntry) => {
  console.log(`[${logEntry.timestamp.toISOString()}] ${logEntry.workflowName}/${logEntry.nodeName}`);
  console.log(`  Input: ${JSON.stringify(logEntry.input)}`);
  console.log(`  Output: ${JSON.stringify(logEntry.output)}`);
  console.log(`  Duration: ${logEntry.duration}ms`);
  
  // Capture console output from the node
  if (logEntry.console?.length > 0) {
    console.log('  Console Output:');
    logEntry.console.forEach(line => console.log(`    ${line}`));
  }
  
  // Handle exceptions
  if (logEntry.exception) {
    console.error(`  ERROR: ${logEntry.exception.message}`);
  }
  
  // Send to your logging service
  // await sendToDatadog(logEntry);
  // await saveToDatabase(logEntry);
};

// Create workflow with logging
workflow.createWorkflow('monitored-workflow', {
  nodes: [
    {
      name: 'start',
      trigger: 'rest',
      triggerOptions: { method: 'POST' },
      function: async (input, next) => {
        console.log('Processing request...'); // This will be captured
        console.warn('Validation warning');   // This too!
        
        if (!input.data) {
          throw new Error('Missing required data'); // Exception captured
        }
        
        await next('process', { data: input.data });
      }
    },
    {
      name: 'process',
      trigger: 'workflow',
      function: async (input, next) => {
        console.log('Processing data:', input.data);
        const result = await processData(input.data);
        await next(next.SUCCESS, { result });
      }
    }
  ],
  logger: logger // Attach the logger
});
```

#### Log Entry Structure

Each log entry contains:
- `workflowName`: Name of the workflow
- `nodeName`: Name of the node being executed
- `input`: Input data received by the node
- `output`: Output data (next() calls made)
- `console`: Array of captured console output
- `exception`: Exception details if node crashed
- `timestamp`: When the node was executed
- `duration`: Execution time in milliseconds

## 🔧 API Reference

### Server Operations

```javascript
// Start server (optional settings)
await workflow.serve({ host: '127.0.0.1', port: 3000 });

// Execute workflow programmatically  
const result = await workflow.trigger('workflow-name', { input: 'data' });

// Stop server
await workflow.stop();

// Get Express app instance (for custom middleware)
const app = workflow.getApp();
```

### Built-in Endpoints

When you start the server, these are automatically available:

- `GET /health` - Server health check
- `GET /workflows` - List all workflows
- `GET /workflows/{name}` - Get workflow details
- `POST /workflows/{name}/execute` - Execute any workflow
- Your custom REST endpoints based on workflow definitions

### Input Data

REST triggers automatically parse and provide:

```javascript
{
  // Query parameters: ?name=value&age=30
  name: 'value',
  age: 30,
  
  // Body data (POST/PUT/PATCH)
  bodyField: 'from request body',
  
  // HTTP headers
  headers: { 'content-type': 'application/json' },
  
  // Organized data
  query: { name: 'value', age: 30 },
  body: { bodyField: 'from request body' }
}
```

## 🧪 Testing

The package includes comprehensive tests:

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run build         # Compile TypeScript
npm run lint          # Run linter
```

## 🦕 Deno Sandbox Security

### Why Use Sandboxed Workflows?

When building workflows that process user input or execute dynamic code, security is paramount. The Deno sandbox feature provides:

- **Complete Isolation**: Each sandboxed node runs in a separate worker with zero permissions
- **Controlled API**: Only explicitly allowed functions are accessible
- **Crash Protection**: Sandbox failures don't affect the main server
- **Resource Limits**: Built-in protection against infinite loops and memory exhaustion

### Sandbox Configuration

```typescript
const workflow = workflow.createWorkflow('sandbox-example', {
  nodes: [
    {
      name: 'untrusted-code',
      trigger: 'workflow',
      function: async (input, next) => {
        // This code runs in complete isolation
        // Cannot access file system, network, or global variables
        // Only functions listed in 'sandbox' array are available
        
        const result = await database.query('SELECT * FROM users');
        logger.info('Query executed:', result.length, 'rows');
        
        await next(next.SUCCESS, { count: result.length });
      },
      sandbox: ['database.query', 'logger.info'], // Whitelist of allowed functions
    },
  ],
  protectedFunctions: {
    database: {
      query: async (sql) => {
        // Your controlled database access with validation, rate limiting, etc.
        return await db.query(sql);
      },
    },
    logger: {
      info: (...args) => console.log('[SANDBOX]', ...args),
    },
  },
});
```

### Available NPM Scripts

```bash
# Node.js examples
npm run start:node        # Node.js compatibility example
npm run build && node examples/basic-usage.js

# Deno examples (requires Deno installed)
npm run deno              # Basic Deno sandbox example
npm run deno:advanced     # Advanced sandbox with security features
npm run test:deno         # Run Deno-specific tests

# Testing
npm test                  # Node.js tests
npm run test:deno         # Deno sandbox tests
```

## 📁 Examples

Check the directories for complete working examples:

### Node.js Examples (`/examples`)
- `basic-usage.js` - REST API workflows with parallel execution
- `cron-workflow.js` - Scheduled task examples  
- `interval-workflow.js` - Repeated task examples
- `programmatic-usage.js` - Using workflows without server

### Deno Examples (`/examples/deno`) 
- `basic-deno.ts` - Simple sandbox workflow
- `advanced-sandbox.ts` - Security features, rate limiting, validation
- `node-compatibility.js` - Shows Node.js behavior with sandbox features

Run them with:
```bash
# Node.js
npm run build
node examples/basic-usage.js

# Deno
npm run deno
# or
deno run --allow-net --allow-read examples/deno/basic-deno.ts
```

## 🔒 Error Handling

The system provides bulletproof error handling:

```javascript
// Business logic errors
await next(next.ERROR, { message: 'Validation failed' });

// Automatic handling of:
// - Node execution errors
// - Circular dependencies  
// - Server crashes
// - Uncaught exceptions
// - Unhandled promise rejections
```

## 🎯 Production Ready

- **Uncrashable**: Process-level error handling prevents server crashes
- **Memory Safe**: Automatic cleanup of execution contexts
- **Performance**: Optimized async execution with proper resource management
- **Monitoring**: Built-in health checks and workflow introspection
- **Logging**: Comprehensive request/response logging

## 📋 Requirements

### Node.js (Standard Features)
- Node.js 14+ 
- TypeScript 4.5+ (for development)

### Deno (Sandbox Features)
- Deno 1.40+ (for sandbox security features)
- Use `--allow-net --allow-read` permissions when running Deno workflows

## 📄 License

MIT

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Add tests for new features
4. Run `npm test` to ensure all tests pass
5. Submit a pull request

## 🐛 Issues

Found a bug or have a feature request? Please open an issue on GitHub.

---

**Made with ❤️ for the Node.js community**