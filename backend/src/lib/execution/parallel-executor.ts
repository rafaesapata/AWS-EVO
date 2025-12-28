/**
 * Parallel Executor for ML Waste Detection
 * 
 * Executes multiple analyzers in parallel with timeout management
 * and partial results handling.
 */

import { logger } from '../logging.js';

export interface AnalyzerTask<T> {
  name: string;
  priority: number;
  execute: () => Promise<T[]>;
  timeout?: number;
}

export interface ExecutionResult<T> {
  name: string;
  results: T[];
  duration: number;
  success: boolean;
  error?: string;
}

export interface ExecutionSummary<T> {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  timedOutTasks: number;
  totalDuration: number;
  results: T[];
  taskResults: ExecutionResult<T>[];
}

/**
 * Execute a single task with timeout
 */
async function executeWithTimeout<T>(
  task: AnalyzerTask<T>,
  timeout: number
): Promise<ExecutionResult<T>> {
  const startTime = Date.now();
  
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Task timeout')), timeout);
    });
    
    const results = await Promise.race([
      task.execute(),
      timeoutPromise
    ]);
    
    return {
      name: task.name,
      results,
      duration: Date.now() - startTime,
      success: true,
    };
  } catch (err) {
    const error = err as Error;
    const isTimeout = error.message === 'Task timeout';
    
    logger.warn(`Task ${task.name} ${isTimeout ? 'timed out' : 'failed'}`, {
      error: error.message,
      duration: Date.now() - startTime,
    });
    
    return {
      name: task.name,
      results: [],
      duration: Date.now() - startTime,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Execute multiple analyzer tasks in parallel
 */
export async function executeParallel<T>(
  tasks: AnalyzerTask<T>[],
  options: {
    maxConcurrency?: number;
    defaultTimeout?: number;
    totalTimeout?: number;
  } = {}
): Promise<ExecutionSummary<T>> {
  const {
    maxConcurrency = 5,
    defaultTimeout = 10000,
    totalTimeout = 25000,
  } = options;
  
  const startTime = Date.now();
  const sortedTasks = [...tasks].sort((a, b) => b.priority - a.priority);
  const taskResults: ExecutionResult<T>[] = [];
  const allResults: T[] = [];
  
  // Process tasks in batches
  for (let i = 0; i < sortedTasks.length; i += maxConcurrency) {
    // Check total timeout
    if (Date.now() - startTime > totalTimeout - 2000) {
      logger.warn('Total timeout approaching, stopping execution', {
        completedTasks: taskResults.length,
        remainingTasks: sortedTasks.length - i,
      });
      break;
    }
    
    const batch = sortedTasks.slice(i, i + maxConcurrency);
    const remainingTime = totalTimeout - (Date.now() - startTime);
    const batchTimeout = Math.min(defaultTimeout, remainingTime - 1000);
    
    const batchResults = await Promise.all(
      batch.map(task => executeWithTimeout(task, task.timeout || batchTimeout))
    );
    
    for (const result of batchResults) {
      taskResults.push(result);
      if (result.success) {
        allResults.push(...result.results);
      }
    }
  }
  
  const completedTasks = taskResults.filter(r => r.success).length;
  const failedTasks = taskResults.filter(r => !r.success && r.error !== 'Task timeout').length;
  const timedOutTasks = taskResults.filter(r => r.error === 'Task timeout').length;
  
  logger.info('Parallel execution completed', {
    totalTasks: tasks.length,
    completedTasks,
    failedTasks,
    timedOutTasks,
    totalResults: allResults.length,
    totalDuration: Date.now() - startTime,
  });
  
  return {
    totalTasks: tasks.length,
    completedTasks,
    failedTasks,
    timedOutTasks,
    totalDuration: Date.now() - startTime,
    results: allResults,
    taskResults,
  };
}

/**
 * Create an execution plan based on priorities
 */
export function createExecutionPlan<T>(
  tasks: AnalyzerTask<T>[]
): { highPriority: AnalyzerTask<T>[]; normalPriority: AnalyzerTask<T>[]; lowPriority: AnalyzerTask<T>[] } {
  return {
    highPriority: tasks.filter(t => t.priority >= 4),
    normalPriority: tasks.filter(t => t.priority >= 2 && t.priority < 4),
    lowPriority: tasks.filter(t => t.priority < 2),
  };
}
