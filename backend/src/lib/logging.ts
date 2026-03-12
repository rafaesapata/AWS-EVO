/**
 * @deprecated Use `./logger.js` instead. This module re-exports from logger.ts
 * for backward compatibility. All new code should import from './logger.js'.
 */

export { logger, logger as default, EvoLogger, type LogLevel, type LogContext } from './logger.js';

/**
 * @deprecated Use logger directly. Kept for backward compatibility.
 */
export function withLogging<T extends (...args: any[]) => any>(
  functionName: string,
  handler: T
): T {
  const { logger: log } = require('./logger.js');
  return (async (...args: any[]) => {
    const startTime = Date.now();
    const requestId = args[1]?.awsRequestId || 'unknown';
    log.info(`Lambda function started: ${functionName}`, { type: 'lambda', functionName, requestId });
    try {
      const result = await handler(...args);
      const duration = Date.now() - startTime;
      log.info(`Lambda function completed: ${functionName}`, { type: 'lambda', functionName, requestId, duration, statusCode: result?.statusCode });
      return result;
    } catch (error) {
      log.error(`Lambda function failed: ${functionName}`, error as Error, { type: 'lambda', functionName, requestId });
      throw error;
    }
  }) as T;
}

/**
 * @deprecated Use logger.initFromLambda() instead. Kept for backward compatibility.
 */
export function withRequestId<T extends (...args: any[]) => any>(
  handler: T
): T {
  const { logger: log } = require('./logger.js');
  return (async (event: any, context: any) => {
    const requestId = event?.headers?.['x-request-id'] || event?.headers?.['X-Request-ID'] || context?.awsRequestId || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const correlationId = event?.headers?.['x-correlation-id'] || event?.headers?.['X-Correlation-ID'] || requestId;
    log.info('Request started', { requestId, correlationId, method: event?.requestContext?.http?.method || event?.httpMethod, path: event?.requestContext?.http?.path || event?.path });
    const { clearRequestContext, setRequestContext } = await import('./response.js');
    clearRequestContext();
    setRequestContext(requestId, correlationId);
    const startTime = Date.now();
    try {
      const result = await handler(event, context);
      const duration = Date.now() - startTime;
      log.info('Request completed', { requestId, correlationId, duration, statusCode: result?.statusCode });
      return { ...result, headers: { ...result?.headers, 'X-Request-ID': requestId, 'X-Correlation-ID': correlationId, 'X-Response-Time': `${duration}ms` } };
    } catch (error) {
      const duration = Date.now() - startTime;
      log.error('Request failed', error as Error, { requestId, correlationId, duration });
      throw error;
    }
  }) as T;
}