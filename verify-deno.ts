// Simple verification script for Deno setup
/// <reference lib="deno.ns" />

console.log('🦕 Verifying Deno setup...');

// Test 1: Deno globals are available
console.log('✅ Deno.version:', Deno.version);

// Test 2: Can import our workflow module
try {
  const workflow = await import('./dist/index.js');
  console.log('✅ Workflow module imported successfully');
  console.log('  - createWorkflow:', typeof workflow.default.createWorkflow);
  console.log('  - getWorkflowEngine:', typeof workflow.default.getWorkflowEngine);
} catch (error) {
  console.log('❌ Failed to import workflow module:', (error as Error).message);
}

// Test 3: Can create a basic workflow with sandbox
try {
  const { default: workflow } = await import('./dist/index.js');
  
  const testWorkflow = workflow.createWorkflow('test-sandbox', {
    nodes: [
      {
        name: 'start',
        trigger: 'rest',
        triggerOptions: { method: 'GET' },
        function: async (input: any, next: any) => {
          await next(next.SUCCESS, { message: 'sandbox test' });
        },
        sandbox: ['testFunc'],
      },
    ],
    protectedFunctions: {
      testFunc: () => 'test',
    },
  });
  
  console.log('✅ Sandbox workflow created successfully');
  console.log('  - Workflow name:', testWorkflow.name);
  console.log('  - Node count:', testWorkflow.nodes.length);
  console.log('  - Sandbox functions:', testWorkflow.nodes[0].sandbox);
  
} catch (error) {
  console.log('❌ Failed to create sandbox workflow:', (error as Error).message);
}

console.log('🎉 Deno verification complete!');