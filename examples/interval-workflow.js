const workflow = require('../dist/index').default;

// Example of interval-triggered workflows
const intervalExamples = async () => {
  // Health check every 30 seconds
  workflow.createWorkflow('health-monitor', {
    nodes: [
      {
        name: 'start',
        trigger: 'interval',
        triggerOptions: { interval: 30000 }, // 30 seconds
        function: async (input, next) => {
          console.log('❤️  Running health check...');
          
          const services = ['database', 'cache', 'api', 'storage'];
          const results = [];
          
          for (const service of services) {
            await next('check-service', { service, checkId: Date.now() });
          }
        },
      },
      {
        name: 'check-service',
        trigger: 'workflow',
        function: async (input, next) => {
          // Simulate service health check
          const isHealthy = Math.random() > 0.1; // 90% healthy
          const responseTime = Math.floor(Math.random() * 200) + 10; // 10-210ms
          
          const status = {
            service: input.service,
            healthy: isHealthy,
            responseTime,
            checkedAt: new Date().toISOString()
          };
          
          if (isHealthy) {
            console.log(`✅ ${input.service}: healthy (${responseTime}ms)`);
            await next(next.SUCCESS, status);
          } else {
            console.log(`🚨 ${input.service}: unhealthy!`);
            await next('handle-unhealthy', status);
          }
        },
      },
      {
        name: 'handle-unhealthy',
        trigger: 'workflow',
        function: async (input, next) => {
          console.log(`🔧 Attempting to restart ${input.service}...`);
          
          // Simulate restart attempt
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const restartSuccessful = Math.random() > 0.3; // 70% success rate
          
          if (restartSuccessful) {
            console.log(`✅ ${input.service} restarted successfully`);
            await next(next.SUCCESS, { 
              ...input, 
              restarted: true, 
              restartedAt: new Date().toISOString() 
            });
          } else {
            console.log(`❌ Failed to restart ${input.service} - escalating...`);
            await next(next.ERROR, { 
              ...input, 
              escalated: true,
              error: `Failed to restart ${input.service}`
            });
          }
        },
      },
    ],
  });

  // Resource usage monitor every 1 minute
  workflow.createWorkflow('resource-monitor', {
    nodes: [
      {
        name: 'start',
        trigger: 'interval',
        triggerOptions: { interval: 60000 }, // 1 minute
        function: async (input, next) => {
          // Simulate gathering system resources
          const resources = {
            cpu: Math.floor(Math.random() * 100),
            memory: Math.floor(Math.random() * 100),
            disk: Math.floor(Math.random() * 100),
            network: Math.floor(Math.random() * 100)
          };
          
          console.log('📊 Resource usage:', resources);
          
          await next('analyze-resources', { 
            ...resources, 
            timestamp: new Date().toISOString() 
          });
        },
      },
      {
        name: 'analyze-resources',
        trigger: 'workflow',
        function: async (input, next) => {
          const alerts = [];
          
          if (input.cpu > 80) alerts.push(`High CPU usage: ${input.cpu}%`);
          if (input.memory > 85) alerts.push(`High memory usage: ${input.memory}%`);
          if (input.disk > 90) alerts.push(`High disk usage: ${input.disk}%`);
          if (input.network > 75) alerts.push(`High network usage: ${input.network}%`);
          
          if (alerts.length > 0) {
            console.log('🚨 Resource alerts:', alerts);
            await next('send-alerts', { alerts, resources: input });
          } else {
            console.log('✅ All resources within normal limits');
            await next(next.SUCCESS, { status: 'normal', resources: input });
          }
        },
      },
      {
        name: 'send-alerts',
        trigger: 'workflow',
        function: async (input, next) => {
          console.log('📧 Sending resource alerts to administrators...');
          
          // Simulate sending alerts
          await new Promise(resolve => setTimeout(resolve, 500));
          
          await next(next.SUCCESS, { 
            alertsSent: input.alerts.length,
            recipients: ['ops@company.com', 'alerts@company.com'],
            timestamp: new Date().toISOString()
          });
        },
      },
    ],
  });

  // Data processing queue every 5 seconds
  workflow.createWorkflow('queue-processor', {
    nodes: [
      {
        name: 'start',
        trigger: 'interval',
        triggerOptions: { interval: 5000 }, // 5 seconds
        function: async (input, next) => {
          // Simulate checking for queued items
          const queueSize = Math.floor(Math.random() * 10);
          
          if (queueSize === 0) {
            console.log('📭 Queue is empty');
            await next(next.SUCCESS, { queueSize: 0, processed: 0 });
            return;
          }
          
          console.log(`📬 Found ${queueSize} items in queue`);
          
          for (let i = 0; i < queueSize; i++) {
            await next('process-item', { 
              itemId: `item_${Date.now()}_${i}`,
              data: `Sample data ${i + 1}`,
              queuePosition: i + 1
            });
          }
        },
      },
      {
        name: 'process-item',
        trigger: 'workflow',
        function: async (input, next) => {
          console.log(`⚙️  Processing ${input.itemId}...`);
          
          // Simulate processing time
          const processingTime = Math.floor(Math.random() * 2000) + 500; // 500-2500ms
          await new Promise(resolve => setTimeout(resolve, processingTime));
          
          // Simulate occasional processing failures
          if (Math.random() < 0.05) { // 5% failure rate
            console.log(`❌ Failed to process ${input.itemId}`);
            await next(next.ERROR, { 
              itemId: input.itemId, 
              error: 'Processing failed',
              processingTime
            });
          } else {
            console.log(`✅ Successfully processed ${input.itemId} (${processingTime}ms)`);
            await next(next.SUCCESS, { 
              itemId: input.itemId,
              processed: true,
              processingTime,
              completedAt: new Date().toISOString()
            });
          }
        },
      },
    ],
  });

  console.log('🔄 Interval workflows created!');
  console.log('⏱️  Active interval jobs:');
  console.log('  • health-monitor: Every 30 seconds');
  console.log('  • resource-monitor: Every 1 minute');
  console.log('  • queue-processor: Every 5 seconds');
  
  // Start the server to activate interval jobs
  try {
    await workflow.serve({ host: '127.0.0.1', port: 3002 });
    console.log('\n🚀 Server running on http://127.0.0.1:3002');
    console.log('📊 Monitor endpoints:');
    console.log('  GET /health - Server health');
    console.log('  GET /workflows - List all workflows');
    
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down interval workflows...');
  await workflow.stop();
  console.log('✅ All interval jobs stopped');
  process.exit(0);
});

intervalExamples();