const workflow = require('../dist/index.js').default;

// Custom logger function
const logger = (logEntry) => {
  console.log('\n=== WORKFLOW LOG ENTRY ===');
  console.log(`Workflow: ${logEntry.workflowName}`);
  console.log(`Node: ${logEntry.nodeName}`);
  console.log(`Timestamp: ${logEntry.timestamp.toISOString()}`);
  console.log(`Duration: ${logEntry.duration}ms`);
  console.log(`Input:`, JSON.stringify(logEntry.input, null, 2));
  
  if (logEntry.output) {
    console.log(`Output:`, JSON.stringify(logEntry.output, null, 2));
  }
  
  if (logEntry.console && logEntry.console.length > 0) {
    console.log(`Console Output:`);
    logEntry.console.forEach(line => console.log(`  ${line}`));
  }
  
  if (logEntry.exception) {
    console.log(`Exception:`, logEntry.exception.message);
    if (logEntry.exception.stack) {
      console.log(`Stack:`, logEntry.exception.stack);
    }
  }
  
  console.log('=========================\n');
};

// Create a workflow with logging
const calculatorWorkflow = workflow.createWorkflow('calculator-with-logging', {
  nodes: [
    {
      name: 'start',
      trigger: 'rest',
      triggerOptions: { method: 'POST' },
      function: async (input, next) => {
        console.log('Starting calculation workflow');
        console.log('Input values:', input.a, input.b);
        
        const a = parseFloat(input.a) || 0;
        const b = parseFloat(input.b) || 0;
        
        if (isNaN(a) || isNaN(b)) {
          console.error('Invalid input values');
          throw new Error('Input values must be numbers');
        }
        
        console.log('Validated inputs, proceeding to calculation');
        await next('calculate', { a, b, operation: input.operation || 'add' });
      }
    },
    {
      name: 'calculate',
      trigger: 'workflow',
      function: async (input, next) => {
        console.log(`Performing ${input.operation} operation`);
        
        let result;
        switch (input.operation) {
          case 'add':
            result = input.a + input.b;
            console.log(`${input.a} + ${input.b} = ${result}`);
            break;
          case 'subtract':
            result = input.a - input.b;
            console.log(`${input.a} - ${input.b} = ${result}`);
            break;
          case 'multiply':
            result = input.a * input.b;
            console.log(`${input.a} * ${input.b} = ${result}`);
            break;
          case 'divide':
            if (input.b === 0) {
              console.error('Division by zero attempted');
              throw new Error('Cannot divide by zero');
            }
            result = input.a / input.b;
            console.log(`${input.a} / ${input.b} = ${result}`);
            break;
          default:
            console.warn(`Unknown operation: ${input.operation}`);
            throw new Error(`Unknown operation: ${input.operation}`);
        }
        
        console.info('Calculation complete');
        await next(next.SUCCESS, { result, operation: input.operation });
      }
    }
  ],
  logger: logger // Attach the logger function
});

// Create another workflow to test error logging
const errorWorkflow = workflow.createWorkflow('error-test-workflow', {
  nodes: [
    {
      name: 'start',
      trigger: 'rest',
      triggerOptions: { method: 'GET' },
      function: async (input, next) => {
        console.log('This workflow will intentionally fail');
        console.warn('About to throw an error...');
        
        if (input.crash === 'true') {
          throw new Error('Intentional crash for testing error logging');
        }
        
        await next(next.SUCCESS, { message: 'No crash requested' });
      }
    }
  ],
  logger: logger
});

// Create a workflow that demonstrates parallel execution with logging
const parallelWorkflow = workflow.createWorkflow('parallel-with-logging', {
  nodes: [
    {
      name: 'start',
      trigger: 'rest',
      triggerOptions: { method: 'GET' },
      function: async (input, next) => {
        console.log('Starting parallel branches');
        const value = parseInt(input.value) || 10;
        
        // Execute two branches in parallel
        await next('branch1', { value });
        await next('branch2', { value });
      }
    },
    {
      name: 'branch1',
      trigger: 'workflow',
      function: async (input, next) => {
        console.log('Branch 1: Doubling the value');
        const doubled = input.value * 2;
        console.log(`Branch 1 result: ${doubled}`);
        await next('merge', { branch1Result: doubled });
      }
    },
    {
      name: 'branch2',
      trigger: 'workflow',
      function: async (input, next) => {
        console.log('Branch 2: Squaring the value');
        const squared = input.value * input.value;
        console.log(`Branch 2 result: ${squared}`);
        await next('merge', { branch2Result: squared });
      }
    },
    {
      name: 'merge',
      trigger: 'workflow',
      function: async (input, next) => {
        console.log('Merging results from both branches');
        const total = (input.branch1Result || 0) + (input.branch2Result || 0);
        console.log(`Combined result: ${total}`);
        await next(next.SUCCESS, { total });
      }
    }
  ],
  logger: logger
});

// Start the server
async function main() {
  try {
    await workflow.serve({ host: '127.0.0.1', port: 3000 });
    
    console.log('\n🚀 Server running on http://127.0.0.1:3000');
    console.log('\n📝 Example requests with logging:');
    console.log('\n1. Calculator workflow:');
    console.log('   curl -X POST http://127.0.0.1:3000/calculator-with-logging/start \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"a": 10, "b": 5, "operation": "multiply"}\'');
    console.log('\n2. Error test workflow:');
    console.log('   curl http://127.0.0.1:3000/error-test-workflow/start?crash=true');
    console.log('\n3. Parallel workflow:');
    console.log('   curl http://127.0.0.1:3000/parallel-with-logging/start?value=5');
    console.log('\n✨ Watch the console for detailed logs from each node execution!');
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();