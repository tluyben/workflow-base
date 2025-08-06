const workflow = require('../dist/index').default;

// Example of using workflows programmatically (without server)
const programmaticExamples = async () => {
  console.log('🔧 Programmatic Workflow Usage Examples\n');

  // Example 1: Simple data transformation
  workflow.createWorkflow('data-transform', {
    nodes: [
      {
        name: 'start',
        trigger: 'rest',
        triggerOptions: { method: 'GET' },
        function: async (input, next) => {
          console.log('📥 Input received:', input);
          await next('validate', input);
        },
      },
      {
        name: 'validate',
        trigger: 'workflow',
        function: async (input, next) => {
          if (!input.data || !Array.isArray(input.data)) {
            await next(next.ERROR, { message: 'Invalid data format' });
            return;
          }
          
          console.log('✅ Data validation passed');
          await next('transform', input);
        },
      },
      {
        name: 'transform',
        trigger: 'workflow',
        function: async (input, next) => {
          const transformed = input.data.map(item => ({
            ...item,
            processed: true,
            processedAt: new Date().toISOString(),
            uppercaseName: item.name ? item.name.toUpperCase() : undefined
          }));
          
          console.log('🔄 Data transformed');
          await next(next.SUCCESS, { 
            originalCount: input.data.length,
            transformed,
            transformedAt: new Date().toISOString()
          });
        },
      },
    ],
  });

  // Example 2: Multi-step calculation
  workflow.createWorkflow('calculator', {
    nodes: [
      {
        name: 'start',
        trigger: 'rest',
        triggerOptions: { method: 'GET' },
        function: async (input, next) => {
          const { operation, numbers } = input;
          
          if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
            await next(next.ERROR, { message: 'Numbers array is required' });
            return;
          }
          
          switch (operation) {
            case 'sum':
              await next('calculate-sum', { numbers });
              break;
            case 'product':
              await next('calculate-product', { numbers });
              break;
            case 'average':
              await next('calculate-average', { numbers });
              break;
            case 'statistics':
              await next('calculate-sum', { numbers, includeStats: true });
              break;
            default:
              await next(next.ERROR, { message: 'Unsupported operation' });
          }
        },
      },
      {
        name: 'calculate-sum',
        trigger: 'workflow',
        function: async (input, next) => {
          const sum = input.numbers.reduce((a, b) => a + b, 0);
          console.log(`➕ Sum calculated: ${sum}`);
          
          if (input.includeStats) {
            await next('calculate-average', { ...input, sum });
          } else {
            await next(next.SUCCESS, { operation: 'sum', result: sum, numbers: input.numbers });
          }
        },
      },
      {
        name: 'calculate-product',
        trigger: 'workflow',
        function: async (input, next) => {
          const product = input.numbers.reduce((a, b) => a * b, 1);
          console.log(`✖️  Product calculated: ${product}`);
          
          await next(next.SUCCESS, { 
            operation: 'product', 
            result: product, 
            numbers: input.numbers 
          });
        },
      },
      {
        name: 'calculate-average',
        trigger: 'workflow',
        function: async (input, next) => {
          const sum = input.sum || input.numbers.reduce((a, b) => a + b, 0);
          const average = sum / input.numbers.length;
          console.log(`📊 Average calculated: ${average}`);
          
          if (input.includeStats) {
            await next('calculate-stats', { ...input, sum, average });
          } else {
            await next(next.SUCCESS, { 
              operation: 'average', 
              result: average, 
              numbers: input.numbers 
            });
          }
        },
      },
      {
        name: 'calculate-stats',
        trigger: 'workflow',
        function: async (input, next) => {
          const { numbers, sum, average } = input;
          const min = Math.min(...numbers);
          const max = Math.max(...numbers);
          const count = numbers.length;
          
          // Calculate standard deviation
          const variance = numbers.reduce((acc, num) => acc + Math.pow(num - average, 2), 0) / count;
          const stdDev = Math.sqrt(variance);
          
          const stats = {
            count,
            sum,
            average,
            min,
            max,
            variance,
            standardDeviation: stdDev,
            numbers: numbers.sort((a, b) => a - b)
          };
          
          console.log('📈 Full statistics calculated');
          await next(next.SUCCESS, { operation: 'statistics', result: stats });
        },
      },
    ],
  });

  // Example 3: File processing simulation
  workflow.createWorkflow('file-processor', {
    nodes: [
      {
        name: 'start',
        trigger: 'rest',
        triggerOptions: { method: 'POST' },
        function: async (input, next) => {
          const files = input.files || [];
          console.log(`📁 Processing ${files.length} files`);
          
          for (const file of files) {
            await next('process-file', { 
              filename: file.name,
              size: file.size,
              type: file.type,
              uploadedAt: new Date().toISOString()
            });
          }
        },
      },
      {
        name: 'process-file',
        trigger: 'workflow',
        function: async (input, next) => {
          console.log(`🔄 Processing file: ${input.filename}`);
          
          // Simulate processing based on file type
          let processingTime = 1000;
          let operations = [];
          
          switch (input.type) {
            case 'image':
              operations = ['resize', 'optimize', 'thumbnail'];
              processingTime = 2000;
              break;
            case 'video':
              operations = ['transcode', 'thumbnail', 'metadata'];
              processingTime = 5000;
              break;
            case 'document':
              operations = ['extract-text', 'index', 'backup'];
              processingTime = 1500;
              break;
            default:
              operations = ['scan', 'backup'];
              processingTime = 500;
          }
          
          // Simulate processing time
          await new Promise(resolve => setTimeout(resolve, processingTime));
          
          await next('finalize-file', {
            ...input,
            operations,
            processingTime,
            processedAt: new Date().toISOString()
          });
        },
      },
      {
        name: 'finalize-file',
        trigger: 'workflow',
        function: async (input, next) => {
          console.log(`✅ File processed: ${input.filename} (${input.processingTime}ms)`);
          
          const result = {
            filename: input.filename,
            originalSize: input.size,
            type: input.type,
            operations: input.operations,
            processingTime: input.processingTime,
            status: 'completed',
            completedAt: input.processedAt
          };
          
          await next(next.SUCCESS, result);
        },
      },
    ],
  });

  // Run examples
  console.log('1. Data Transformation Example');
  try {
    const transformResult = await workflow.trigger('data-transform', {
      data: [
        { id: 1, name: 'john doe', age: 30 },
        { id: 2, name: 'jane smith', age: 25 },
        { id: 3, name: 'bob johnson', age: 35 }
      ]
    });
    console.log('📤 Transform result:', JSON.stringify(transformResult, null, 2));
  } catch (error) {
    console.error('❌ Transform error:', error.message);
  }

  console.log('\n2. Calculator Examples');
  
  const numbers = [1, 2, 3, 4, 5, 10, 15, 20];
  
  try {
    const sumResult = await workflow.trigger('calculator', { 
      operation: 'sum', 
      numbers 
    });
    console.log('📤 Sum result:', sumResult);
  } catch (error) {
    console.error('❌ Sum error:', error.message);
  }

  try {
    const avgResult = await workflow.trigger('calculator', { 
      operation: 'average', 
      numbers 
    });
    console.log('📤 Average result:', avgResult);
  } catch (error) {
    console.error('❌ Average error:', error.message);
  }

  try {
    const statsResult = await workflow.trigger('calculator', { 
      operation: 'statistics', 
      numbers 
    });
    console.log('📤 Statistics result:', JSON.stringify(statsResult.result, null, 2));
  } catch (error) {
    console.error('❌ Statistics error:', error.message);
  }

  console.log('\n3. File Processing Example');
  try {
    const fileResult = await workflow.trigger('file-processor', {
      files: [
        { name: 'photo1.jpg', size: 2048000, type: 'image' },
        { name: 'video1.mp4', size: 50000000, type: 'video' },
        { name: 'document1.pdf', size: 1024000, type: 'document' }
      ]
    });
    console.log('📤 File processing completed');
  } catch (error) {
    console.error('❌ File processing error:', error.message);
  }

  console.log('\n✨ All programmatic examples completed!');
  console.log('💡 These workflows can also be accessed via REST endpoints by starting the server.');
};

// Run the examples
programmaticExamples().catch(console.error);