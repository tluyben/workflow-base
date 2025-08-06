// Basic Deno example with sandbox functionality
import workflow from '../../dist/index.js';

// Define protected functions that sandboxed nodes can access
const protectedFunctions = {
  // Simple logging function
  print: (...args: any[]) => {
    console.log('[SANDBOX LOG]', ...args);
  },
  
  // Math utilities
  math: {
    square: (n: number) => n * n,
    cube: (n: number) => n * n * n,
  },
  
  // Storage simulation
  storage: {
    data: {} as any,
    get: async (key: string) => protectedFunctions.storage.data[key],
    set: async (key: string, value: any) => {
      protectedFunctions.storage.data[key] = value;
      return value;
    },
  },
};

// Example workflow with sandbox nodes
const myWf = workflow.createWorkflow('parcalc', {
  nodes: [
    {
      name: 'start',
      trigger: 'rest' as const,
      triggerOptions: { method: 'GET' as const },
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
      trigger: 'workflow' as const,
      function: async (input, next) => {
        // This is a sandboxed node - it can only use functions in sandbox array
        const result = input.a * input.b;
        print('Multiplication result:', result);
        await next('result', { m: result });
      },
      sandbox: ['print'], // Only allow print function
    },
    {
      name: 'plus',
      trigger: 'workflow' as const,
      function: async (input, next) => {
        // This node uses math utilities and storage
        const result = input.a + input.b;
        const squared = math.square(result);
        await storage.set('lastSum', result);
        print('Addition result:', result, 'squared:', squared);
        await next('result', { p: result });
      },
      sandbox: ['print', 'math.square', 'storage.set'], // Multiple allowed functions
    },
    {
      name: 'result',
      trigger: 'workflow' as const,
      function: async (input, next) => {
        const total = (input.m || 0) + (input.p || 0);
        const lastSum = await storage.get('lastSum');
        print('Final calculation:', { m: input.m, p: input.p, total, lastSum });
        
        await next(next.SUCCESS, {
          message: `result of a*b+(a+b) = ${total}`,
          lastSum,
        });
      },
      sandbox: ['print', 'storage.get'], // Access to print and storage.get
    },
  ],
  protectedFunctions, // Provide the protected functions
});

// Test programmatically first
console.log('🦕 Deno Sandbox Example - Testing programmatically...');

try {
  const result = await workflow.trigger('parcalc', { a: 3, b: 2 });
  console.log('✅ Programmatic result:', result);
} catch (error) {
  console.error('❌ Programmatic error:', error.message);
}

console.log('\n🚀 Starting Deno server with sandbox support...');

// Start the server
try {
  await workflow.serve({ host: '127.0.0.1', port: 3000 });
  console.log('🌐 Server running on http://127.0.0.1:3000');
  
  console.log('\n📋 Available endpoints:');
  console.log('  GET  /health - Health check');
  console.log('  GET  /workflows - List all workflows');
  console.log('  GET  /parcalc/start?a=3&b=2 - Sandboxed parallel calculation');
  
  console.log('\n🧪 Test with curl:');
  console.log('  curl "http://127.0.0.1:3000/parcalc/start?a=3&b=2"');
  
  console.log('\n🛡️ Sandbox features:');
  console.log('  • mult node: Can only use print()');
  console.log('  • plus node: Can use print(), math.square(), storage.set()');
  console.log('  • result node: Can use print(), storage.get()');
  console.log('  • All sandboxed nodes run in isolated Deno workers with zero permissions');
  
} catch (error) {
  console.error('❌ Failed to start server:', error.message);
  Deno.exit(1);
}

// Handle graceful shutdown
const handleShutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await workflow.stop();
  console.log('✅ Server stopped');
  Deno.exit(0);
};

// Listen for shutdown signals
globalThis.addEventListener('unload', handleShutdown);
Deno.addSignalListener('SIGINT', handleShutdown);
Deno.addSignalListener('SIGTERM', handleShutdown);