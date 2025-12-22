/**
 * Security Configuration
 * Military-grade security settings and constants
 */

export const SECURITY_CONFIG = {
  // Authentication
  AUTH: {
    SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
    REFRESH_THRESHOLD: 5 * 60 * 1000, // 5 minutes before expiry
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
  },

  // Input validation
  INPUT: {
    MAX_STRING_LENGTH: 1000,
    MAX_TEXT_LENGTH: 10000,
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_FILE_TYPES: ['.pdf', '.doc', '.docx', '.txt', '.csv', '.xlsx'],
  },

  // Rate limiting
  RATE_LIMIT: {
    API_REQUESTS_PER_MINUTE: 60,
    LOGIN_ATTEMPTS_PER_HOUR: 10,
    PASSWORD_RESET_PER_HOUR: 3,
  },

  // Encryption
  ENCRYPTION: {
    ALGORITHM: 'AES-256-GCM',
    KEY_LENGTH: 32,
    IV_LENGTH: 16,
  },

  // Headers
  SECURITY_HEADERS: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.amazonaws.com;",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  },

  // AWS Security
  AWS: {
    ALLOWED_REGIONS: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'],
    MAX_ACCOUNT_IDS: 10,
    SCAN_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  },

  // Validation patterns
  PATTERNS: {
    EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    AWS_ACCOUNT_ID: /^\d{12}$/,
    AWS_REGION: /^[a-z0-9-]+$/,
    AWS_ARN: /^arn:aws:[a-zA-Z0-9-]+:[a-zA-Z0-9-]*:\d{12}:[a-zA-Z0-9-_/:.]+$/,
    UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    SAFE_STRING: /^[a-zA-Z0-9\s\-_.@]+$/,
  },

  // Dangerous patterns to block
  BLOCKED_PATTERNS: {
    XSS: [
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      /onload=/i,
      /onerror=/i,
      /onclick=/i,
      /onmouseover=/i,
      /onfocus=/i,
      /onblur=/i,
    ],
    SQL_INJECTION: [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
      /[';\"]/,
      /--/,
      /\/\*/,
    ],
    PATH_TRAVERSAL: [
      /\.\.\//,
      /\.\.\\\/,
    ],
    COMMAND_INJECTION: [
      /[;&|`$(){}[\]\\]/,
    ],
  },
} as const;

/**
 * Check if environment is production
 */
export function isProduction(): boolean {
  return import.meta.env.PROD || import.meta.env.NODE_ENV === 'production';
}

/**
 * Get security headers for requests
 */
export function getSecurityHeaders(): Record<string, string> {
  return { ...SECURITY_CONFIG.SECURITY_HEADERS };
}

/**
 * Validate if a region is allowed
 */
export function isAllowedRegion(region: string): boolean {
  return SECURITY_CONFIG.AWS.ALLOWED_REGIONS.includes(region);
}

/**
 * Check if input contains blocked patterns
 */
export function containsBlockedPattern(input: string): { blocked: boolean; reason?: string } {
  // Check XSS patterns
  for (const pattern of SECURITY_CONFIG.BLOCKED_PATTERNS.XSS) {
    if (pattern.test(input)) {
      return { blocked: true, reason: 'XSS pattern detected' };
    }
  }

  // Check SQL injection patterns
  for (const pattern of SECURITY_CONFIG.BLOCKED_PATTERNS.SQL_INJECTION) {
    if (pattern.test(input)) {
      return { blocked: true, reason: 'SQL injection pattern detected' };
    }
  }

  // Check path traversal patterns
  for (const pattern of SECURITY_CONFIG.BLOCKED_PATTERNS.PATH_TRAVERSAL) {
    if (pattern.test(input)) {
      return { blocked: true, reason: 'Path traversal pattern detected' };
    }
  }

  // Check command injection patterns
  for (const pattern of SECURITY_CONFIG.BLOCKED_PATTERNS.COMMAND_INJECTION) {
    if (pattern.test(input)) {
      return { blocked: true, reason: 'Command injection pattern detected' };
    }
  }

  return { blocked: false };
}