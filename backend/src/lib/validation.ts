/**
 * Input validation utilities using Zod
 * Provides type-safe validation for Lambda handlers with military-grade security
 */

import { z } from 'zod';
import { badRequest } from './response.js';
import type { APIGatewayProxyResultV2 } from '../types/lambda.js';

// Input sanitization utilities
const HTML_TAG_REGEX = /<[^>]*>/g;
const SCRIPT_TAG_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const SQL_INJECTION_REGEX = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)|[';\"\\]/gi;
const XSS_PATTERNS = [
  /javascript:/gi,
  /vbscript:/gi,
  /onload=/gi,
  /onerror=/gi,
  /onclick=/gi,
  /onmouseover=/gi,
  /onfocus=/gi,
  /onblur=/gi,
  /onchange=/gi,
  /onsubmit=/gi,
];

/**
 * Sanitize string input to prevent injection attacks
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  let sanitized = input
    // Remove HTML tags
    .replace(HTML_TAG_REGEX, '')
    // Remove script tags
    .replace(SCRIPT_TAG_REGEX, '')
    // Remove potential SQL injection patterns
    .replace(SQL_INJECTION_REGEX, '')
    // Remove null bytes
    .replace(/\0/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Check for XSS patterns
  for (const pattern of XSS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Limit length to prevent DoS
  if (sanitized.length > 10000) {
    sanitized = sanitized.substring(0, 10000);
  }

  return sanitized;
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = sanitizeString(key);
      sanitized[sanitizedKey] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * Validate email format with strict security
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const sanitized = sanitizeString(email);
  return emailRegex.test(sanitized) && sanitized.length <= 254;
}

/**
 * Validate AWS ARN format
 */
export function validateAwsArn(arn: string): boolean {
  const arnRegex = /^arn:aws:[a-zA-Z0-9-]+:[a-zA-Z0-9-]*:\d{12}:[a-zA-Z0-9-_/:.]+$/;
  const sanitized = sanitizeString(arn);
  return arnRegex.test(sanitized);
}

/**
 * Validate URL with security checks
 */
export function validateUrl(url: string): boolean {
  try {
    const sanitized = sanitizeString(url);
    const parsed = new URL(sanitized);
    
    // Only allow HTTPS in production
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      return false;
    }
    
    // Block dangerous protocols
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
    if (dangerousProtocols.includes(parsed.protocol)) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

// Common validation schemas
export const commonSchemas = {
  // AWS Account ID validation
  awsAccountId: z.string().regex(/^\d{12}$/, 'Invalid AWS Account ID format'),
  
  // Organization ID validation
  organizationId: z.string().uuid('Invalid organization ID format'),
  
  // AWS Region validation
  awsRegion: z.string().regex(/^[a-z0-9-]+$/, 'Invalid AWS region format'),
  
  // Pagination
  pagination: z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  
  // Date range
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
  
  // Severity levels
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  
  // Scan levels
  scanLevel: z.enum(['basic', 'advanced', 'military']).default('military'),
};

// Security scan request validation
export const securityScanSchema = z.object({
  accountId: z.string().optional(),
  scanLevel: commonSchemas.scanLevel,
  regions: z.array(commonSchemas.awsRegion).optional(),
  scanTypes: z.array(z.string()).optional(),
});

// Findings query validation
export const findingsQuerySchema = z.object({
  accountId: z.string().optional(),
  severity: z.array(commonSchemas.severity).optional(),
  status: z.array(z.enum(['pending', 'acknowledged', 'resolved', 'false_positive'])).optional(),
  service: z.array(z.string()).optional(),
  category: z.array(z.string()).optional(),
  ...commonSchemas.pagination.shape,
  ...commonSchemas.dateRange.shape,
});

// Cost analysis request validation
export const costAnalysisSchema = z.object({
  accountId: z.string().optional(),
  service: z.string().optional(),
  granularity: z.enum(['DAILY', 'MONTHLY', 'HOURLY']).default('DAILY'),
  ...commonSchemas.dateRange.shape,
});

// Compliance scan validation
export const complianceScanSchema = z.object({
  accountId: z.string().optional(),
  frameworks: z.array(z.enum(['CIS', 'PCI-DSS', 'SOC2', 'LGPD', 'GDPR'])).optional(),
  ...commonSchemas.dateRange.shape,
});

/**
 * Validation middleware for Lambda handlers with input sanitization
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): { success: true; data: T } | { success: false; error: APIGatewayProxyResultV2 } {
  try {
    // Sanitize input before validation
    const sanitizedInput = sanitizeObject(input);
    const result = schema.parse(sanitizedInput);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join(', ');
      
      return {
        success: false,
        error: badRequest(`Validation error: ${errorMessages}`, {
          validationErrors: error.errors,
        }),
      };
    }
    
    return {
      success: false,
      error: badRequest('Invalid input format'),
    };
  }
}

/**
 * Parse and validate JSON body from Lambda event with security checks
 */
export function parseAndValidateBody<T>(
  schema: z.ZodSchema<T>,
  body: string | null
): { success: true; data: T } | { success: false; error: APIGatewayProxyResultV2 } {
  if (!body) {
    return validateInput(schema, {});
  }
  
  // Check for oversized payloads (DoS protection)
  if (body.length > 1024 * 1024) { // 1MB limit
    return {
      success: false,
      error: badRequest('Request payload too large'),
    };
  }
  
  try {
    const parsed = JSON.parse(body);
    
    // Additional security check for nested depth (DoS protection)
    const depth = getObjectDepth(parsed);
    if (depth > 10) {
      return {
        success: false,
        error: badRequest('Request structure too complex'),
      };
    }
    
    return validateInput(schema, parsed);
  } catch (error) {
    return {
      success: false,
      error: badRequest('Invalid JSON format'),
    };
  }
}

/**
 * Calculate object nesting depth for DoS protection
 */
function getObjectDepth(obj: any, depth = 0): number {
  if (depth > 10) return depth; // Early exit for performance
  
  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj)) {
      return Math.max(...obj.map(item => getObjectDepth(item, depth + 1)));
    } else {
      return Math.max(...Object.values(obj).map(value => getObjectDepth(value, depth + 1)));
    }
  }
  
  return depth;
}

/**
 * Validate query parameters
 */
export function validateQueryParams<T>(
  schema: z.ZodSchema<T>,
  queryParams: Record<string, string> | null
): { success: true; data: T } | { success: false; error: APIGatewayProxyResultV2 } {
  // Convert query string parameters to appropriate types
  const processedParams: Record<string, unknown> = {};
  
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      // Try to parse numbers
      if (/^\d+$/.test(value)) {
        processedParams[key] = parseInt(value, 10);
      }
      // Try to parse booleans
      else if (value === 'true' || value === 'false') {
        processedParams[key] = value === 'true';
      }
      // Try to parse arrays (comma-separated)
      else if (value.includes(',')) {
        processedParams[key] = value.split(',').map(v => v.trim());
      }
      // Keep as string
      else {
        processedParams[key] = value;
      }
    }
  }
  
  return validateInput(schema, processedParams);
}

/**
 * CSRF Token validation for Lambda handlers
 */
export function validateCSRFToken(
  headers: Record<string, string | undefined>,
  method: string
): { success: true } | { success: false; error: APIGatewayProxyResultV2 } {
  // Skip CSRF validation for GET requests
  if (method === 'GET') {
    return { success: true };
  }
  
  const csrfToken = headers['x-csrf-token'] || headers['X-CSRF-Token'];
  
  if (!csrfToken) {
    return {
      success: false,
      error: {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'CSRF token required',
          message: 'CSRF token is required for this operation',
        }),
      },
    };
  }
  
  // Validate token format (should be 64 hex characters)
  if (!/^[a-f0-9]{64}$/i.test(csrfToken)) {
    return {
      success: false,
      error: {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Invalid CSRF token',
          message: 'CSRF token format is invalid',
        }),
      },
    };
  }
  
  return { success: true };
}

/**
 * Validate and sanitize organization context
 */
export function validateOrganizationContext(
  organizationId: string,
  userOrgId: string
): { success: true } | { success: false; error: APIGatewayProxyResultV2 } {
  if (organizationId !== userOrgId) {
    return {
      success: false,
      error: badRequest('Access denied: Organization mismatch'),
    };
  }
  
  const validation = validateInput(commonSchemas.organizationId, organizationId);
  if (!validation.success) {
    return validation;
  }
  
  return { success: true };
}

/**
 * Rate limiting validation (basic implementation)
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
  identifier: string,
  maxRequests: number = 100,
  windowMs: number = 60000 // 1 minute
): { success: true } | { success: false; error: APIGatewayProxyResultV2 } {
  const now = Date.now();
  const key = identifier;
  
  const current = rateLimitMap.get(key);
  
  if (!current || now > current.resetTime) {
    // Reset or initialize
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return { success: true };
  }
  
  if (current.count >= maxRequests) {
    return {
      success: false,
      error: {
        statusCode: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': Math.ceil((current.resetTime - now) / 1000).toString(),
        },
        body: JSON.stringify({
          error: 'Rate limit exceeded',
          message: `Too many requests. Try again in ${Math.ceil((current.resetTime - now) / 1000)} seconds.`,
        }),
      },
    };
  }
  
  // Increment counter
  current.count++;
  return { success: true };
}