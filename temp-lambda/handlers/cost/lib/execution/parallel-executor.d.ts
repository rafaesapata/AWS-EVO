/**
 * Parallel Executor for ML Waste Detection
 *
 * Executes multiple analyzers in parallel with timeout management
 * and partial results handling.
 */
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
 * Execute multiple analyzer tasks in parallel
 */
export declare function executeParallel<T>(tasks: AnalyzerTask<T>[], options?: {
    maxConcurrency?: number;
    defaultTimeout?: number;
    totalTimeout?: number;
}): Promise<ExecutionSummary<T>>;
/**
 * Create an execution plan based on priorities
 */
export declare function createExecutionPlan<T>(tasks: AnalyzerTask<T>[]): {
    highPriority: AnalyzerTask<T>[];
    normalPriority: AnalyzerTask<T>[];
    lowPriority: AnalyzerTask<T>[];
};
//# sourceMappingURL=parallel-executor.d.ts.map