/**
 * Frontend Input Sanitization Library
 * Military-grade input validation and sanitization
 */

import DOMPurify from 'dompurify';
import validator from 'validator';

/**
 * Sanitize HTML content to prevent XSS attacks
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== 'string') return '';
  
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
}

/**
 * Sanitize plain text input
 */
export function sanitizeText(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/[<>]/g, '') // Remove HTML brackets
    .replace(/['"]/g, '') // Remove quotes
    .replace(/[;\\]/g, '') // Remove potential injection chars
    .replace(/\0/g, '') // Remove null bytes
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .substring(0, 1000); // Limit length
}

/**
 * Validate and sanitize email
 */
export function validateEmail(email: string): { isValid: boolean; sanitized: string } {
  const sanitized = sanitizeText(email);
  const isValid = validator.isEmail(sanitized) && sanitized.length <= 254;
  
  return { isValid, sanitized };
}

/**
 * Validate and sanitize URL
 */
export function validateUrl(url: string): { isValid: boolean; sanitized: string } {
  const sanitized = sanitizeText(url);
  
  // Check if it's a valid URL
  const isValid = validator.isURL(sanitized, {
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
    allow_underscores: false,
    allow_trailing_dot: false,
    allow_protocol_relative_urls: false,
  });
  
  return { isValid, sanitized };
}

/**
 * Validate AWS Account ID
 */
export function validateAwsAccountId(accountId: string): { isValid: boolean; sanitized: string } {
  const sanitized = sanitizeText(accountId);
  const isValid = /^\d{12}$/.test(sanitized);
  
  return { isValid, sanitized };
}

/**
 * Validate AWS Region
 */
export function validateAwsRegion(region: string): { isValid: boolean; sanitized: string } {
  const sanitized = sanitizeText(region);
  const isValid = /^[a-z0-9-]+$/.test(sanitized) && sanitized.length <= 20;
  
  return { isValid, sanitized };
}

/**
 * Validate AWS ARN
 */
export function validateAwsArn(arn: string): { isValid: boolean; sanitized: string } {
  const sanitized = sanitizeText(arn);
  const isValid = /^arn:aws:[a-zA-Z0-9-]+:[a-zA-Z0-9-]*:\d{12}:[a-zA-Z0-9-_/:.]+$/.test(sanitized);
  
  return { isValid, sanitized };
}

/**
 * Validate organization name
 */
export function validateOrganizationName(name: string): { isValid: boolean; sanitized: string } {
  const sanitized = sanitizeText(name);
  const isValid = sanitized.length >= 2 && sanitized.length <= 100 && /^[a-zA-Z0-9\s-_.]+$/.test(sanitized);
  
  return { isValid, sanitized };
}

/**
 * Validate user name
 */
export function validateUserName(name: string): { isValid: boolean; sanitized: string } {
  const sanitized = sanitizeText(name);
  const isValid = sanitized.length >= 1 && sanitized.length <= 50 && /^[a-zA-Z\s-'.]+$/.test(sanitized);
  
  return { isValid, sanitized };
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): { 
  isValid: boolean; 
  strength: 'weak' | 'medium' | 'strong';
  errors: string[];
} {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  // Check for common patterns
  if (/(.)\1{2,}/.test(password)) {
    errors.push('Password cannot contain repeated characters');
  }
  
  if (/123|abc|qwe|password|admin/i.test(password)) {
    errors.push('Password cannot contain common patterns');
  }
  
  const isValid = errors.length === 0;
  
  let strength: 'weak' | 'medium' | 'strong' = 'weak';
  if (isValid) {
    if (password.length >= 12 && /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?].*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      strength = 'strong';
    } else if (password.length >= 10) {
      strength = 'medium';
    }
  }
  
  return { isValid, strength, errors };
}

/**
 * Sanitize form data object
 */
export function sanitizeFormData(data: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(data)) {
    const sanitizedKey = sanitizeText(key);
    
    if (typeof value === 'string') {
      sanitized[sanitizedKey] = sanitizeText(value);
    } else if (Array.isArray(value)) {
      sanitized[sanitizedKey] = value.map(item => 
        typeof item === 'string' ? sanitizeText(item) : item
      );
    } else {
      sanitized[sanitizedKey] = value;
    }
  }
  
  return sanitized;
}

/**
 * Check for potential security threats in input
 */
export function detectSecurityThreats(input: string): {
  hasThreat: boolean;
  threats: string[];
} {
  const threats: string[] = [];
  
  // Check for XSS patterns
  const xssPatterns = [
    /<script/i,
    /javascript:/i,
    /vbscript:/i,
    /onload=/i,
    /onerror=/i,
    /onclick=/i,
    /onmouseover=/i,
  ];
  
  for (const pattern of xssPatterns) {
    if (pattern.test(input)) {
      threats.push('Potential XSS attack detected');
      break;
    }
  }
  
  // Check for SQL injection patterns
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
    /[';\"]/,
    /--/,
    /\/\*/,
  ];
  
  for (const pattern of sqlPatterns) {
    if (pattern.test(input)) {
      threats.push('Potential SQL injection detected');
      break;
    }
  }
  
  // Check for path traversal
  if (/\.\.\/|\.\.\\/.test(input)) {
    threats.push('Potential path traversal detected');
  }
  
  // Check for command injection
  if (/[;&|`$(){}[\]\\]/.test(input)) {
    threats.push('Potential command injection detected');
  }
  
  return {
    hasThreat: threats.length > 0,
    threats,
  };
}