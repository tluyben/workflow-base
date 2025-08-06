# Workflow Base

A simple yet powerful workflow backend system for Node.js with TypeScript support. Create automated workflows with multiple trigger types, robust execution patterns, and a rock-solid Express server that never crashes.

## 🚀 Features

- **Multiple Trigger Types**: REST endpoints, Cron schedules, Intervals, and Workflow chains
- **Async/Await Support**: Full async node execution with `next()` function calls  
- **Rock-solid Server**: Uncrashable Express server with comprehensive error handling
- **Parallel Execution**: Support for branching workflows and parallel processing
- **TypeScript**: Full type safety and IntelliSense support
- **Zero Configuration**: Works out of the box with sensible defaults
- **Comprehensive Testing**: 100% Jest test coverage

## 📦 Installation

```bash
npm install workflow-base
```

## 🏃‍♂️ Quick Start

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

## 📁 Examples

Check the `/examples` directory for complete working examples:

- `basic-usage.js` - REST API workflows
- `cron-workflow.js` - Scheduled task examples  
- `interval-workflow.js` - Repeated task examples
- `programmatic-usage.js` - Using workflows without server

Run them with:
```bash
npm run build  # First compile
node examples/basic-usage.js
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

- Node.js 14+ 
- TypeScript 4.5+ (for development)

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