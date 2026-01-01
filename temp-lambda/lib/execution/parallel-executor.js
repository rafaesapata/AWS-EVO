"use strict";
/**
 * Parallel Executor for ML Waste Detection
 *
 * Executes multiple analyzers in parallel with timeout management
 * and partial results handling.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeParallel = executeParallel;
exports.createExecutionPlan = createExecutionPlan;
const logging_js_1 = require("../logging.js");
/**
 * Execute a single task with timeout
 */
async function executeWithTimeout(task, timeout) {
    const startTime = Date.now();
    try {
        const timeoutPromise = new Promise((_, reject) => {
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
    }
    catch (err) {
        const error = err;
        const isTimeout = error.message === 'Task timeout';
        logging_js_1.logger.warn(`Task ${task.name} ${isTimeout ? 'timed out' : 'failed'}`, {
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
async function executeParallel(tasks, options = {}) {
    const { maxConcurrency = 5, defaultTimeout = 10000, totalTimeout = 25000, } = options;
    const startTime = Date.now();
    const sortedTasks = [...tasks].sort((a, b) => b.priority - a.priority);
    const taskResults = [];
    const allResults = [];
    // Process tasks in batches
    for (let i = 0; i < sortedTasks.length; i += maxConcurrency) {
        // Check total timeout
        if (Date.now() - startTime > totalTimeout - 2000) {
            logging_js_1.logger.warn('Total timeout approaching, stopping execution', {
                completedTasks: taskResults.length,
                remainingTasks: sortedTasks.length - i,
            });
            break;
        }
        const batch = sortedTasks.slice(i, i + maxConcurrency);
        const remainingTime = totalTimeout - (Date.now() - startTime);
        const batchTimeout = Math.min(defaultTimeout, remainingTime - 1000);
        const batchResults = await Promise.all(batch.map(task => executeWithTimeout(task, task.timeout || batchTimeout)));
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
    logging_js_1.logger.info('Parallel execution completed', {
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
function createExecutionPlan(tasks) {
    return {
        highPriority: tasks.filter(t => t.priority >= 4),
        normalPriority: tasks.filter(t => t.priority >= 2 && t.priority < 4),
        lowPriority: tasks.filter(t => t.priority < 2),
    };
}
//# sourceMappingURL=parallel-executor.js.map