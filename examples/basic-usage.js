const workflow = require('../dist/index').default;

// Example 1: Simple REST API workflow
const simpleWorkflow = workflow.createWorkflow('simple-api', {
  nodes: [
    {
      name: 'start',
      trigger: 'rest',
      triggerOptions: { method: 'GET' },
      function: async (input, next) => {
        const message = `Hello, ${input.name || 'World'}!`;
        await next(next.SUCCESS, { message, timestamp: new Date().toISOString() });
      },
    },
  ],
});

// Example 2: If-Then-Else workflow (from your specification)
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
      },
    },
    {
      name: 'then',
      trigger: 'workflow',
      function: async (input, next) => {
        await next(next.SUCCESS, { message: `${input.a}>10!` });
      },
    },
    {
      name: 'else',
      trigger: 'workflow',
      function: async (input, next) => {
        await next(next.ERROR, { message: `${input.a}<=10 :(` });
      },
    },
  ],
});

// Example 3: Parallel calculation workflow (from your specification)
const parcalc = workflow.createWorkflow('parcalc', {
  nodes: [
    {
      name: 'start',
      trigger: 'rest',
      triggerOptions: { method: 'GET' },
      function: async (input, next) => {
        // Convert query parameters to numbers
        const a = parseFloat(input.a) || 0;
        const b = parseFloat(input.b) || 0;
        
        await next('mult', { a, b });
        await next('plus', { a, b });
      },
    },
    {
      name: 'mult',
      trigger: 'workflow',
      function: async (input, next) => {
        await next('result', { m: input.a * input.b });
      },
    },
    {
      name: 'plus',
      trigger: 'workflow',
      function: async (input, next) => {
        await next('result', { p: input.a + input.b });
      },
    },
    {
      name: 'result',
      trigger: 'workflow',
      function: async (input, next) => {
        await next(next.SUCCESS, { 
          message: `result of a*b+(a+b) = ${(input.m || 0) + (input.p || 0)}` 
        });
      },
    },
  ],
});

// Start the server
async function startServer() {
  try {
    await workflow.serve({ host: '127.0.0.1', port: 3000 });
    console.log('🚀 Workflow server is running on http://127.0.0.1:3000');
    
    console.log('\n📋 Available endpoints:');
    console.log('  GET  /health - Health check');
    console.log('  GET  /workflows - List all workflows');
    console.log('  GET  /simple-api/start?name=YourName - Simple greeting');
    console.log('  GET  /ifthenelse/start?a=15 - If-then-else example (try a=5 too)');
    console.log('  GET  /parcalc/start?a=3&b=2 - Parallel calculation example');
    console.log('  POST /workflows/{name}/execute - Execute any workflow programmatically');
    
    console.log('\n🧪 Test the workflows:');
    console.log('  curl "http://127.0.0.1:3000/simple-api/start?name=Workflow"');
    console.log('  curl "http://127.0.0.1:3000/ifthenelse/start?a=15"');
    console.log('  curl "http://127.0.0.1:3000/parcalc/start?a=3&b=2"');

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await workflow.stop();
  console.log('✅ Server stopped');
  process.exit(0);
});

// Start the server
startServer();