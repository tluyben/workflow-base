# CLAUDE.md - Workflow Base Documentation

This document provides comprehensive information about the workflow-base package for Claude Code AI assistant.

## Project Overview

**workflow-base** is a simple yet powerful workflow backend system built with Node.js, Express, TypeScript, and toad-scheduler. It enables creating and running automated workflows with multiple trigger types and robust execution patterns.

## Key Features

- **Multiple Trigger Types**: REST, Cron, Interval, and Workflow triggers
- **🦕 Deno Sandbox Security**: Isolated worker execution with zero permissions (Deno only)
- **Rock-solid Express Server**: Uncrashable server with comprehensive error handling
- **Async Node Execution**: Full support for async/await patterns with `next()` function
- **Parallel Execution**: Support for branching workflows and parallel processing
- **Dual Runtime Support**: Works in both Node.js and Deno environments
- **TypeScript Support**: Full type safety and IntelliSense support
- **Comprehensive Testing**: 100% Jest test coverage + Deno-specific tests
- **Easy Integration**: Simple API for both programmatic and server usage

## Architecture

### Core Components

1. **WorkflowEngine** (`src/workflow-engine.ts`)
   - Manages workflow creation, validation, and execution
   - Handles node execution with circular dependency detection
   - Provides async execution with proper error handling

2. **TriggerManager** (`src/trigger-manager.ts`)
   - Manages cron and interval scheduling using toad-scheduler
   - Handles trigger registration and cleanup
   - Provides event-based trigger monitoring

3. **WorkflowServer** (`src/server.ts`)
   - Express server integration with REST endpoint handling
   - Automatic route registration for REST triggers
   - Health check and monitoring endpoints
   - Uncrashable server with process-level error handling

4. **🦕 Sandbox System** (Deno only)
   - **SandboxManager** (`src/sandbox-manager.ts`) - Worker lifecycle management
   - **WorkerProxy** (`src/worker-proxy.ts`) - Message passing between parent/worker
   - **Worker** (`src/worker.ts`) - Isolated execution environment
   - **RuntimeDetection** (`src/runtime.ts`) - Environment detection and validation

## API Reference

### Creating Workflows

```javascript
const workflow = require('workflow-base');

const myWorkflow = workflow.createWorkflow('workflow-name', {
  nodes: [
    {
      name: 'start',                    // Required: must have 'start' node
      trigger: 'rest',                  // 'rest', 'cron', 'interval', 'workflow'
      triggerOptions: {                 // Trigger-specific options
        method: 'GET',                  // For REST: GET, POST, PUT, DELETE, PATCH
        path: '/custom/path'            // Optional custom path
      },
      function: async (input, next) => {
        // Your node logic here
        await next('nextNodeName', outputData);
        // OR
        await next(next.SUCCESS, outputData);  // End successfully
        await next(next.ERROR, errorData);    // End with error
      }
    }
  ]
});
```

### Trigger Options

- **REST Triggers**: `{ method: 'GET'|'POST'|'PUT'|'DELETE'|'PATCH', path?: string }`
- **Cron Triggers**: `{ cron: '*/5 * * * * *' }` (uses cron syntax)
- **Interval Triggers**: `{ interval: 30000 }` (milliseconds)
- **Workflow Triggers**: No options needed (internal triggers)

### Server Operations

```javascript
// Start server (default: 127.0.0.1:3000)
await workflow.serve({ host: '127.0.0.1', port: 3000 });

// Execute workflow programmatically
const result = await workflow.trigger('workflow-name', { inputData: 'value' });

// Stop server
await workflow.stop();
```

### Input Data Structure

All node functions receive an `input` object containing:

```javascript
{
  // Query parameters (for REST triggers)
  queryParam: 'value',
  
  // Body data (for POST/PUT/PATCH REST triggers)
  bodyParam: 'value',
  
  // HTTP headers (for REST triggers)
  headers: { 'content-type': 'application/json' },
  
  // Separated query and body (for REST triggers)
  query: { queryParam: 'value' },
  body: { bodyParam: 'value' },
  
  // Custom data from previous nodes
  customData: 'from previous node'
}
```

## Example Workflows

### 1. If-Then-Else Pattern
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
```

### 2. Parallel Processing Pattern
```javascript
const parcalc = workflow.createWorkflow('parcalc', {
  nodes: [
    {
      name: 'start',
      trigger: 'rest',
      triggerOptions: { method: 'GET' },
      function: async (input, next) => {
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
        await next(next.SUCCESS, { 
          message: `result = ${(input.m || 0) + (input.p || 0)}` 
        });
      }
    }
  ]
});
```

### 3. 🦕 Deno Sandbox Workflow (Security-First)
```typescript
// Define functions available to sandboxed nodes
const protectedFunctions = {
  log: (...args: any[]) => console.log('[SANDBOX]', ...args),
  math: {
    square: (n: number) => n * n,
    add: (a: number, b: number) => a + b,
  },
  database: {
    query: async (sql: string) => {
      // Controlled database access with validation
      if (!sql.toLowerCase().startsWith('select')) {
        throw new Error('Only SELECT queries allowed');
      }
      return await db.query(sql);
    },
  },
};

const secureWorkflow = workflow.createWorkflow('secure-calculation', {
  nodes: [
    {
      name: 'start',
      trigger: 'rest',
      triggerOptions: { method: 'POST' },
      function: async (input, next) => {
        // Regular execution - no sandbox
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
        // Cannot access file system, network, global variables, etc.
        // Only functions in 'sandbox' array are available
        
        log('Processing calculation:', input.a, input.b);
        const sum = math.add(input.a, input.b);
        const squared = math.square(sum);
        
        // Store result in controlled database access
        await database.query(`SELECT * FROM calculations LIMIT 1`);
        
        log('Calculation complete:', squared);
        await next(next.SUCCESS, { result: squared });
      },
      sandbox: ['log', 'math.add', 'math.square', 'database.query'], // Whitelist
    },
  ],
  protectedFunctions, // Provide controlled API to sandboxed nodes
});
```

### 4. Scheduled Workflows
```javascript
// Cron-based workflow (every 5 minutes)
const cronWorkflow = workflow.createWorkflow('backup-job', {
  nodes: [
    {
      name: 'start',
      trigger: 'cron',
      triggerOptions: { cron: '0 */5 * * * *' },
      function: async (input, next) => {
        console.log('Running backup...');
        await next(next.SUCCESS, { backupCompleted: true });
      }
    }
  ]
});

// Interval-based workflow (every 30 seconds)
const intervalWorkflow = workflow.createWorkflow('health-check', {
  nodes: [
    {
      name: 'start',
      trigger: 'interval',
      triggerOptions: { interval: 30000 },
      function: async (input, next) => {
        const isHealthy = await checkSystemHealth();
        await next(next.SUCCESS, { healthy: isHealthy });
      }
    }
  ]
});
```

## Built-in Endpoints

When you start the server, these endpoints are automatically available:

- `GET /health` - Server health check
- `GET /workflows` - List all registered workflows
- `GET /workflows/{name}` - Get specific workflow info
- `POST /workflows/{name}/execute` - Execute workflow programmatically
- REST trigger endpoints based on your workflow definitions

## Error Handling

The system provides multiple levels of error handling:

1. **Node-level**: Use `await next(next.ERROR, errorData)` to handle business logic errors
2. **Workflow-level**: Automatic handling of execution errors and circular dependencies
3. **Server-level**: Comprehensive Express error middleware
4. **Process-level**: Uncrashable server with uncaught exception handling

## Testing

Run the comprehensive test suite:

```bash
npm test          # Run all tests
npm run test:watch # Watch mode
```

Tests cover:
- Workflow creation and validation
- Node execution patterns
- Trigger management
- Server operations
- Error scenarios
- Edge cases

## Development Commands

```bash
# Build and Test
npm run build         # Compile TypeScript
npm run dev           # Development mode with ts-node
npm run lint          # Run ESLint
npm start             # Start compiled version

# Node.js Runtime
npm test              # Run Node.js tests (Jest)
npm run start:node    # Run Node.js compatibility example

# 🦕 Deno Runtime (Requires Deno installation)
npm run deno          # Run basic Deno sandbox example
npm run deno:advanced # Run advanced sandbox with security features
npm run test:deno     # Run Deno-specific sandbox tests
```

## 🛡️ Sandbox Security Features (Deno Only)

### Runtime Environment Detection
The system automatically detects whether it's running in Node.js or Deno and adjusts behavior accordingly:

```typescript
import { detectRuntime } from 'workflow-base/runtime';

const runtime = detectRuntime();
console.log(runtime.isDeno); // true in Deno, false in Node.js
console.log(runtime.isNode); // false in Deno, true in Node.js
```

### Sandbox Node Configuration

```typescript
{
  name: 'secure-processing',
  trigger: 'workflow',
  function: async (input, next) => {
    // This code runs with zero permissions in isolated worker
    const result = await protectedAPI.process(input.data);
    await logger.log('Processing complete');
    await next(next.SUCCESS, { result });
  },
  sandbox: ['protectedAPI.process', 'logger.log'], // Function whitelist
}
```

### Protected Functions System

```typescript
const protectedFunctions = {
  // Simple functions
  log: (...args) => console.log('[SECURE]', ...args),
  
  // Nested object APIs
  database: {
    query: async (sql) => {
      // Add your own validation, rate limiting, etc.
      if (!isValidQuery(sql)) throw new Error('Invalid query');
      return await db.query(sql);
    },
    insert: async (table, data) => {
      validateTable(table);
      validateData(data);
      return await db.insert(table, data);
    },
  },
  
  // HTTP with restrictions
  http: {
    get: async (url) => {
      if (!isAllowedDomain(url)) throw new Error('Domain not allowed');
      return await fetch(url);
    },
  },
};
```

### Security Guarantees

When running in Deno with sandbox nodes:

- ✅ **Zero File System Access**: Sandboxed code cannot read/write files
- ✅ **Zero Network Access**: No direct network calls possible
- ✅ **Zero Environment Access**: No environment variables accessible
- ✅ **Zero Process Access**: Cannot spawn processes or access system APIs
- ✅ **Function Whitelisting**: Only explicitly allowed functions callable
- ✅ **Memory Isolation**: Each worker has isolated memory space
- ✅ **Crash Isolation**: Worker crashes don't affect main server
- ✅ **Timeout Protection**: 10-second execution timeout per node
- ✅ **Automatic Cleanup**: Workers terminated after execution

## File Structure

```
workflow-base/
├── src/
│   ├── index.ts              # Main exports
│   ├── types.ts              # TypeScript definitions
│   ├── workflow-engine.ts    # Core workflow logic
│   ├── trigger-manager.ts    # Scheduling and triggers
│   ├── server.ts             # Express server
│   ├── runtime.ts            # 🦕 Runtime detection (Deno/Node.js)
│   ├── sandbox-manager.ts    # 🦕 Sandbox worker management
│   ├── worker-proxy.ts       # 🦕 Message passing system
│   └── worker.ts             # 🦕 Isolated worker execution
├── tests/
│   ├── *.test.ts             # Jest test files (Node.js)
│   └── deno/                 # 🦕 Deno-specific tests
│       └── sandbox.test.ts   # Sandbox functionality tests
├── examples/
│   ├── *.js                  # Node.js examples
│   └── deno/                 # 🦕 Deno examples
│       ├── basic-deno.ts     # Simple sandbox workflow
│       ├── advanced-sandbox.ts # Advanced security features
│       └── node-compatibility.js # Node.js behavior demo
├── dist/                     # Compiled JavaScript (after build)
├── deno.json                 # 🦕 Deno configuration
└── package.json             # NPM package configuration
```

## Best Practices

1. **Always have a 'start' node** - Required for workflow execution
2. **Use descriptive node names** - Makes debugging easier
3. **Handle errors gracefully** - Use `next.ERROR` for business logic errors
4. **Validate inputs** - Check input data before processing
5. **Avoid circular dependencies** - The system will detect and prevent them
6. **Use async/await** - All node functions should be async
7. **Test your workflows** - Use the programmatic API for testing

## Performance Notes

- The server uses process-level error handling to prevent crashes
- Workflows execute asynchronously with proper resource cleanup
- Scheduled jobs (cron/interval) are managed by toad-scheduler
- Memory usage is optimized with execution context cleanup

## Troubleshooting

### Common Issues

1. **"Workflow must have a 'start' node"**
   - Ensure you have a node named 'start' in your workflow

2. **"Circular dependency detected"**
   - Check your workflow for loops in node execution paths

3. **"Server is already running"**
   - Call `await workflow.stop()` before starting a new server

4. **Cron jobs not running**
   - Verify cron expression syntax
   - Ensure server is started with `workflow.serve()`

### Debug Mode

Set `NODE_ENV=development` for verbose error messages and stack traces.

## Version History

- **1.1.0**: 🦕 Deno Sandbox Security Release
  - Added secure isolated worker execution for Deno runtime
  - Implemented zero-permission sandbox nodes
  - Added protected functions proxy system with message passing
  - Created comprehensive Deno examples and tests
  - Added runtime detection and dual environment support
  - Parallel execution coordination with sandbox nodes
  - Automatic worker lifecycle management

- **1.0.0**: Initial release with core functionality
  - REST, Cron, Interval, and Workflow triggers
  - Rock-solid Express server
  - Comprehensive test suite
  - TypeScript support
  - Example workflows