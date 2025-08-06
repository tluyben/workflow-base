// Example showing Node.js behavior with sandbox features
const workflow = require('../../dist/index').default;

console.log('🟢 Node.js Sandbox Compatibility Test');

// This should work fine - regular workflow without sandbox
const regularWorkflow = workflow.createWorkflow('regular', {
  nodes: [
    {
      name: 'start',
      trigger: 'rest',
      triggerOptions: { method: 'GET' },
      function: async (input, next) => {
        const message = `Hello from Node.js! Input: ${JSON.stringify(input)}`;
        await next(next.SUCCESS, { message });
      },
    },
  ],
});

// This should throw an error - workflow with sandbox nodes in Node.js
try {
  const sandboxWorkflow = workflow.createWorkflow('sandbox-test', {
    nodes: [
      {
        name: 'start',
        trigger: 'rest',
        triggerOptions: { method: 'GET' },
        function: async (input, next) => {
          console.log('This should not execute');
          await next(next.SUCCESS, { message: 'Should not work' });
        },
        sandbox: ['print'], // This should cause an error in Node.js
      },
    ],
    protectedFunctions: {
      print: (...args) => console.log(...args),
    },
  });
  
  console.log('❌ ERROR: Sandbox workflow should not have been created in Node.js!');
} catch (error) {
  console.log('✅ EXPECTED: Sandbox workflow rejected in Node.js:', error.message);
}

// Test the regular workflow
async function testRegularWorkflow() {
  try {
    console.log('\n🧪 Testing regular workflow in Node.js...');
    const result = await workflow.trigger('regular', { test: 'data' });
    console.log('✅ Regular workflow result:', result);
  } catch (error) {
    console.error('❌ Regular workflow error:', error.message);
  }
}

// Start server to test REST endpoints
async function startServer() {
  try {
    await workflow.serve({ host: '127.0.0.1', port: 3002 });
    console.log('\n🚀 Node.js server running on http://127.0.0.1:3002');
    console.log('📋 Available endpoints:');
    console.log('  GET /health - Health check');
    console.log('  GET /regular/start?test=value - Regular workflow');
    console.log('\n🧪 Test with:');
    console.log('  curl "http://127.0.0.1:3002/regular/start?test=nodejs"');
    console.log('\n💡 To use sandbox features, run the examples in Deno:');
    console.log('  deno run --allow-net --allow-read examples/deno/basic-deno.ts');
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Run tests
testRegularWorkflow().then(startServer);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down Node.js server...');
  await workflow.stop();
  console.log('✅ Server stopped');
  process.exit(0);
});