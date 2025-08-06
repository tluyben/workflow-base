const workflow = require('../dist/index').default;

// Example of cron-triggered workflows
const cronExamples = async () => {
  // Every 10 seconds - log current time
  workflow.createWorkflow('time-logger', {
    nodes: [
      {
        name: 'start',
        trigger: 'cron',
        triggerOptions: { cron: '*/10 * * * * *' }, // Every 10 seconds
        function: async (input, next) => {
          const now = new Date().toISOString();
          console.log(`🕐 [${now}] Time logger executed`);
          await next(next.SUCCESS, { timestamp: now, message: 'Time logged' });
        },
      },
    ],
  });

  // Every minute - cleanup old data (simulated)
  workflow.createWorkflow('cleanup-job', {
    nodes: [
      {
        name: 'start',
        trigger: 'cron',
        triggerOptions: { cron: '0 * * * * *' }, // Every minute at :00 seconds
        function: async (input, next) => {
          console.log('🧹 Running cleanup job...');
          
          // Simulate cleanup work
          const itemsToClean = Math.floor(Math.random() * 100);
          
          await next('process-cleanup', { itemsFound: itemsToClean });
        },
      },
      {
        name: 'process-cleanup',
        trigger: 'workflow',
        function: async (input, next) => {
          // Simulate processing
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          console.log(`🗑️  Cleaned up ${input.itemsFound} items`);
          await next(next.SUCCESS, { 
            cleaned: input.itemsFound,
            completedAt: new Date().toISOString()
          });
        },
      },
    ],
  });

  // Daily report at midnight (commented out for demo, but would work)
  workflow.createWorkflow('daily-report', {
    nodes: [
      {
        name: 'start',
        trigger: 'cron',
        triggerOptions: { cron: '0 0 0 * * *' }, // Every day at midnight
        function: async (input, next) => {
          console.log('📊 Generating daily report...');
          
          const report = {
            date: new Date().toISOString().split('T')[0],
            totalUsers: Math.floor(Math.random() * 1000) + 500,
            totalTransactions: Math.floor(Math.random() * 5000) + 1000,
            revenue: Math.floor(Math.random() * 10000) + 5000
          };
          
          await next('send-report', report);
        },
      },
      {
        name: 'send-report',
        trigger: 'workflow',
        function: async (input, next) => {
          // Simulate sending report
          console.log('📧 Sending daily report:', {
            date: input.date,
            users: input.totalUsers,
            transactions: input.totalTransactions,
            revenue: `$${input.revenue}`
          });
          
          await next(next.SUCCESS, { 
            reportSent: true,
            recipients: ['admin@company.com', 'reports@company.com']
          });
        },
      },
    ],
  });

  // Multi-step cron workflow with error handling
  workflow.createWorkflow('backup-system', {
    nodes: [
      {
        name: 'start',
        trigger: 'cron',
        triggerOptions: { cron: '0 0 2 * * *' }, // Every day at 2:00 AM
        function: async (input, next) => {
          console.log('💾 Starting backup process...');
          
          const databases = ['users', 'products', 'orders', 'analytics'];
          
          for (const db of databases) {
            await next('backup-db', { database: db, timestamp: Date.now() });
          }
        },
      },
      {
        name: 'backup-db',
        trigger: 'workflow',
        function: async (input, next) => {
          try {
            console.log(`📦 Backing up database: ${input.database}`);
            
            // Simulate backup process
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Simulate occasional failures
            if (Math.random() < 0.1) { // 10% chance of failure
              throw new Error(`Backup failed for ${input.database}`);
            }
            
            await next('verify-backup', {
              database: input.database,
              backupFile: `${input.database}_${input.timestamp}.bak`,
              size: Math.floor(Math.random() * 1000) + 100 // MB
            });
            
          } catch (error) {
            console.error(`❌ Backup error for ${input.database}:`, error.message);
            await next(next.ERROR, { 
              database: input.database, 
              error: error.message 
            });
          }
        },
      },
      {
        name: 'verify-backup',
        trigger: 'workflow',
        function: async (input, next) => {
          console.log(`✅ Backup verified: ${input.backupFile} (${input.size}MB)`);
          
          await next(next.SUCCESS, {
            database: input.database,
            backupFile: input.backupFile,
            size: input.size,
            verified: true,
            completedAt: new Date().toISOString()
          });
        },
      },
    ],
  });

  console.log('⏰ Cron workflows created! They will run according to their schedules.');
  console.log('🔄 Active cron jobs:');
  console.log('  • time-logger: Every 10 seconds');
  console.log('  • cleanup-job: Every minute');
  console.log('  • daily-report: Daily at midnight (disabled for demo)');
  console.log('  • backup-system: Daily at 2:00 AM (disabled for demo)');
  
  // Start the server to activate cron jobs
  try {
    await workflow.serve({ host: '127.0.0.1', port: 3001 });
    console.log('\n🚀 Server running on http://127.0.0.1:3001');
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
  console.log('\n🛑 Shutting down cron workflows...');
  await workflow.stop();
  console.log('✅ All cron jobs stopped');
  process.exit(0);
});

cronExamples();