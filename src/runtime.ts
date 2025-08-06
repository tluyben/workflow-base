import { RuntimeEnvironment } from './types';

// Detect runtime environment
export function detectRuntime(): RuntimeEnvironment {
  const isDeno = typeof (globalThis as any).Deno !== 'undefined' && 
                 typeof (globalThis as any).Deno.version?.deno !== 'undefined';
  
  const isNode = typeof process !== 'undefined' && 
                 typeof process.versions?.node !== 'undefined';

  return { isDeno, isNode };
}

export function logRuntime(runtime: RuntimeEnvironment): void {
  if (runtime.isDeno) {
    console.log('🦕 Running in Deno', (globalThis as any).Deno.version);
  } else if (runtime.isNode) {
    console.log('🟢 Running in Node.js', process.version);
  } else {
    console.log('❓ Unknown runtime environment');
  }
}

export function validateSandboxSupport(runtime: RuntimeEnvironment): void {
  if (!runtime.isDeno) {
    throw new Error(
      '🚨 Sandbox functionality requires Deno runtime. ' +
      'Workflows with sandbox nodes can only run in Deno environment. ' +
      'Please use: deno run --allow-net --allow-read your-workflow.ts'
    );
  }
}