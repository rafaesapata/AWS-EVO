/**
 * Log Frontend Error Lambda
 * Receives errors from the frontend and logs them to CloudWatch
 * This allows frontend errors to be monitored alongside backend errors
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

// Zod schema for frontend error validation
const frontendErrorSchema = z.object({
  message: z.string().min(1).max(5000),
  stack: z.string().max(10000).optional(),
  componentStack: z.string().max(5000).optional(),
  url: z.string().max(2000),
  userAgent: z.string().max(500),
  timestamp: z.string(),
  userId: z.string().optional(),
  organizationId: z.string().optional(),
  sessionId: z.string().optional(),
  errorType: z.enum(['unhandled_error', 'api_error', 'chunk_load_error', 'network_error', 'render_error']),
  severity: z.enum(['error', 'warning', 'critical']),
  metadata: z.object({
    apiEndpoint: z.string().optional(),
    statusCode: z.number().optional(),
    requestId: z.string().optional(),
    componentName: z.string().optional(),
    action: z.string().optional(),
  }).passthrough().optional(),
});

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.['origin'] || event.headers?.['Origin'] || '*';
  // Check for OPTIONS using direct property access since this is a public endpoint
  const method = event.requestContext?.http?.method || 'UNKNOWN';
  if (method === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    // Parse and validate request body using centralized validation
    const validation = parseAndValidateBody(frontendErrorSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const body = validation.data;

    // Extract client info
    const clientIp = event.requestContext?.http?.sourceIp || 'unknown';
    const userAgent = event.headers?.['user-agent'] || body.userAgent || 'unknown';

    // Log the error with structured data for CloudWatch Metric Filters
    // The format is important for the metric filters to detect these errors
    const errorLog = {
      level: 'ERROR',
      source: 'FRONTEND',
      errorType: body.errorType,
      severity: body.severity,
      statusCode: body.metadata?.statusCode || 500,
      message: body.message,
      stack: body.stack?.substring(0, 2000), // Truncate stack trace
      componentStack: body.componentStack?.substring(0, 1000),
      url: body.url,
      userAgent: userAgent.substring(0, 200),
      clientIp,
      timestamp: body.timestamp || new Date().toISOString(),
      userId: body.userId,
      organizationId: body.organizationId,
      sessionId: body.sessionId,
      metadata: body.metadata,
    };

    // Log as ERROR so CloudWatch Metric Filters can detect it
    // Using specific format that matches our metric filter patterns
    logger.error(`FRONTEND_ERROR: ${body.errorType} - ${body.message}`, errorLog);

    // Also log with statusCode format for 5XX detection
    if (body.metadata?.statusCode && body.metadata.statusCode >= 500) {
      logger.error(`Frontend API Error - statusCode: ${body.metadata.statusCode}`, {
        ...errorLog,
        statusCode: body.metadata.statusCode,
      });
    }

    // For critical errors, log additional warning
    if (body.severity === 'critical') {
      logger.error(`CRITICAL FRONTEND ERROR: ${body.message}`, errorLog);
    }

    return success({ 
      logged: true,
      errorId: `fe-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    });

  } catch (err) {
    logger.error('Failed to log frontend error:', err);
    return error('Failed to log error', 500, undefined, origin);
  }
}
