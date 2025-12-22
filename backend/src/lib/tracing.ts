/**
 * AWS X-Ray Distributed Tracing Implementation
 * Provides comprehensive tracing for Lambda functions and AWS SDK calls
 */

import AWSXRay from 'aws-xray-sdk-core';
import { logger } from './logging.js';

// Instrumentar AWS SDK e HTTP requests
export function instrumentAWSClients() {
  try {
    AWSXRay.captureHTTPsGlobal(require('http'));
    AWSXRay.captureHTTPsGlobal(require('https'));
    AWSXRay.capturePromise();
    logger.info('AWS X-Ray instrumentation enabled');
  } catch (error) {
    logger.warn('X-Ray instrumentation failed - running without tracing', error as Error);
  }
}

// Wrapper para Prisma com tracing
export function tracePrismaQuery<T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  return AWSXRay.captureAsyncFunc(name, async (subsegment) => {
    const startTime = Date.now();
    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      
      subsegment?.addAnnotation('query_duration_ms', duration);
      subsegment?.addAnnotation('query_success', true);
      
      if (duration > 1000) {
        logger.warn('Slow Prisma query detected', { name, duration });
      }
      
      subsegment?.close();
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      subsegment?.addAnnotation('query_duration_ms', duration);
      subsegment?.addAnnotation('query_success', false);
      subsegment?.addError(error as Error);
      subsegment?.close();
      throw error;
    }
  });
}

// Decorator para handlers Lambda
export function withTracing(
  handlerName: string,
  metadata?: Record<string, string>
) {
  return function<T extends Function>(handler: T): T {
    return (async (event: any, context: any, ...args: any[]) => {
      return AWSXRay.captureAsyncFunc(`handler_${handlerName}`, async (subsegment) => {
        // Adicionar metadata
        if (metadata) {
          Object.entries(metadata).forEach(([key, value]) => {
            subsegment?.addAnnotation(key, value);
          });
        }
        
        // Adicionar informações do evento
        subsegment?.addAnnotation('http_method', event.requestContext?.http?.method || 'unknown');
        subsegment?.addAnnotation('user_agent', event.headers?.['user-agent'] || 'unknown');
        subsegment?.addAnnotation('source_ip', event.requestContext?.http?.sourceIp || 'unknown');
        
        const startTime = Date.now();
        try {
          const result = await handler(event, context, ...args);
          const duration = Date.now() - startTime;
          
          subsegment?.addAnnotation('handler_duration_ms', duration);
          subsegment?.addAnnotation('handler_success', true);
          subsegment?.addAnnotation('status_code', result.statusCode || 200);
          
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          subsegment?.addAnnotation('handler_duration_ms', duration);
          subsegment?.addAnnotation('handler_success', false);
          subsegment?.addError(error as Error);
          throw error;
        }
      });
    }) as unknown as T;
  };
}

// Trace custom operations
export function traceOperation<T>(
  operationName: string,
  operation: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  return AWSXRay.captureAsyncFunc(operationName, async (subsegment) => {
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        subsegment?.addAnnotation(key, String(value));
      });
    }
    
    const startTime = Date.now();
    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      subsegment?.addAnnotation('operation_duration_ms', duration);
      subsegment?.addAnnotation('operation_success', true);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      subsegment?.addAnnotation('operation_duration_ms', duration);
      subsegment?.addAnnotation('operation_success', false);
      subsegment?.addError(error as Error);
      throw error;
    }
  });
}

// Initialize tracing
export function initializeTracing() {
  if (process.env.AWS_XRAY_TRACING_NAME) {
    instrumentAWSClients();
    logger.info('X-Ray tracing initialized', { 
      tracingName: process.env.AWS_XRAY_TRACING_NAME 
    });
  }
}