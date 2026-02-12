/**
 * Safe Request Parser
 * Provides secure JSON parsing with error handling
 */

import { logger } from './logger.js';

/**
 * Safely parse JSON with error handling
 * Prevents crashes from malformed JSON input
 */
export function safeParseJSON<T>(
  jsonString: string | null | undefined,
  defaultValue: T,
  context?: string
): T {
  if (!jsonString) {
    return defaultValue;
  }

  try {
    const parsed = JSON.parse(jsonString);
    return parsed as T;
  } catch (error) {
    logger.warn('Failed to parse JSON', {
      context,
      error: error instanceof Error ? error.message : 'Unknown error',
      preview: jsonString.substring(0, 100),
    });
    return defaultValue;
  }
}

/**
 * Parse Lambda event body safely
 */
export function parseEventBody<T extends object>(
  event: { body?: string | null },
  defaultValue: T = {} as T,
  handlerName?: string
): T {
  return safeParseJSON<T>(event.body, defaultValue, handlerName);
}

/**
 * Validate required fields in parsed body
 */
export function validateRequiredFields<T extends object>(
  body: T,
  requiredFields: (keyof T)[]
): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];
  
  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null) {
      missingFields.push(String(field));
    }
  }
  
  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Sanitize input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Parse and validate pagination parameters
 */
export function parsePaginationParams(
  body: { page?: number; limit?: number; offset?: number }
): { page: number; limit: number; offset: number } {
  const page = Math.max(1, Number(body.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(body.limit) || 20));
  const offset = body.offset !== undefined 
    ? Math.max(0, Number(body.offset)) 
    : (page - 1) * limit;
  
  return { page, limit, offset };
}
