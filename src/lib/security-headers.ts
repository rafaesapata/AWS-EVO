/**
 * Security Headers Configuration
 * Implements comprehensive security headers for the application
 */

export interface SecurityHeadersConfig {
  contentSecurityPolicy?: string;
  strictTransportSecurity?: string;
  xFrameOptions?: string;
  xContentTypeOptions?: string;
  xXSSProtection?: string;
  referrerPolicy?: string;
  permissionsPolicy?: string;
  crossOriginEmbedderPolicy?: string;
  crossOriginOpenerPolicy?: string;
  crossOriginResourcePolicy?: string;
}

export const DEFAULT_SECURITY_HEADERS: SecurityHeadersConfig = {
  // Content Security Policy - Prevent XSS attacks
  // SECURITY: Removed 'unsafe-eval' to prevent code injection attacks
  contentSecurityPolicy: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.amazonaws.com https://*.cloudfront.net",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ].join('; '),

  // HSTS - Force HTTPS
  strictTransportSecurity: 'max-age=31536000; includeSubDomains; preload',

  // Prevent clickjacking
  xFrameOptions: 'DENY',

  // Prevent MIME type sniffing
  xContentTypeOptions: 'nosniff',

  // XSS Protection
  xXSSProtection: '1; mode=block',

  // Referrer Policy
  referrerPolicy: 'strict-origin-when-cross-origin',

  // Permissions Policy (Feature Policy)
  permissionsPolicy: [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()'
  ].join(', '),

  // Cross-Origin Policies
  crossOriginEmbedderPolicy: 'require-corp',
  crossOriginOpenerPolicy: 'same-origin',
  crossOriginResourcePolicy: 'same-origin'
};

export const DEVELOPMENT_SECURITY_HEADERS: SecurityHeadersConfig = {
  ...DEFAULT_SECURITY_HEADERS,
  // More lenient CSP for development
  contentSecurityPolicy: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob: http://localhost:*",
    "connect-src 'self' http://localhost:* https://*.amazonaws.com ws://localhost:*",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '),
  
  // Disable some strict policies in development
  crossOriginEmbedderPolicy: undefined,
  crossOriginOpenerPolicy: undefined,
};

/**
 * Apply security headers to response
 */
export function applySecurityHeaders(
  headers: Headers | Record<string, string>,
  config: SecurityHeadersConfig = DEFAULT_SECURITY_HEADERS,
  isDevelopment: boolean = false
): void {
  const finalConfig = isDevelopment ? DEVELOPMENT_SECURITY_HEADERS : config;

  Object.entries(finalConfig).forEach(([key, value]) => {
    if (value) {
      const headerName = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      
      if (headers instanceof Headers) {
        headers.set(headerName, value);
      } else {
        headers[headerName] = value;
      }
    }
  });
}

/**
 * Security headers middleware for Express-like frameworks
 */
export function securityHeadersMiddleware(
  config: SecurityHeadersConfig = DEFAULT_SECURITY_HEADERS
) {
  return (req: any, res: any, next: any) => {
    const isDevelopment = process.env.NODE_ENV === 'development';
    applySecurityHeaders(res.headers || {}, config, isDevelopment);
    next();
  };
}

/**
 * Generate meta tags for HTML head
 */
export function generateSecurityMetaTags(
  config: SecurityHeadersConfig = DEFAULT_SECURITY_HEADERS
): string {
  const tags: string[] = [];

  if (config.contentSecurityPolicy) {
    tags.push(`<meta http-equiv="Content-Security-Policy" content="${config.contentSecurityPolicy}">`);
  }

  if (config.xFrameOptions) {
    tags.push(`<meta http-equiv="X-Frame-Options" content="${config.xFrameOptions}">`);
  }

  if (config.xContentTypeOptions) {
    tags.push(`<meta http-equiv="X-Content-Type-Options" content="${config.xContentTypeOptions}">`);
  }

  if (config.xXSSProtection) {
    tags.push(`<meta http-equiv="X-XSS-Protection" content="${config.xXSSProtection}">`);
  }

  if (config.referrerPolicy) {
    tags.push(`<meta name="referrer" content="${config.referrerPolicy}">`);
  }

  return tags.join('\n');
}

/**
 * Validate CSP violations (for reporting)
 */
export interface CSPViolation {
  'document-uri': string;
  referrer: string;
  'violated-directive': string;
  'effective-directive': string;
  'original-policy': string;
  disposition: string;
  'blocked-uri': string;
  'line-number': number;
  'column-number': number;
  'source-file': string;
  'status-code': number;
  'script-sample': string;
}

export function handleCSPViolation(violation: CSPViolation): void {
  console.warn('CSP Violation:', {
    directive: violation['violated-directive'],
    blockedUri: violation['blocked-uri'],
    documentUri: violation['document-uri'],
    sourceFile: violation['source-file'],
    lineNumber: violation['line-number']
  });

  // In production, send to monitoring service
  if (process.env.NODE_ENV === 'production') {
    // Send to CloudWatch or other monitoring service
    // metricsCollector.recordCSPViolation(violation);
  }
}

/**
 * CORS configuration with security considerations
 */
export interface CORSConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders?: string[];
  credentials: boolean;
  maxAge: number;
  preflightContinue: boolean;
  optionsSuccessStatus: number;
}

export const SECURE_CORS_CONFIG: CORSConfig = {
  allowedOrigins: [
    'https://app.evo.ai',
    'https://staging.evo.ai',
    ...(process.env.NODE_ENV === 'development' ? ['http://localhost:8080', 'http://localhost:3000'] : [])
  ],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-Organization-Id',
    'X-Request-ID'
  ],
  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count',
    'X-Request-ID'
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
};

/**
 * Apply CORS headers
 */
export function applyCORSHeaders(
  headers: Headers | Record<string, string>,
  origin: string,
  config: CORSConfig = SECURE_CORS_CONFIG
): boolean {
  // Check if origin is allowed
  const isAllowedOrigin = config.allowedOrigins.includes(origin) || 
                         config.allowedOrigins.includes('*');

  if (!isAllowedOrigin) {
    return false;
  }

  const setHeader = (name: string, value: string) => {
    if (headers instanceof Headers) {
      headers.set(name, value);
    } else {
      headers[name] = value;
    }
  };

  setHeader('Access-Control-Allow-Origin', origin);
  setHeader('Access-Control-Allow-Methods', config.allowedMethods.join(', '));
  setHeader('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
  
  if (config.exposedHeaders && config.exposedHeaders.length > 0) {
    setHeader('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
  }
  
  if (config.credentials) {
    setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  setHeader('Access-Control-Max-Age', config.maxAge.toString());

  return true;
}

/**
 * Security audit function
 */
export function auditSecurityHeaders(headers: Record<string, string>): {
  score: number;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  // Check for required headers
  const requiredHeaders = [
    'content-security-policy',
    'strict-transport-security',
    'x-frame-options',
    'x-content-type-options',
    'x-xss-protection'
  ];

  requiredHeaders.forEach(header => {
    if (!headers[header]) {
      issues.push(`Missing ${header} header`);
      score -= 15;
    }
  });

  // Check CSP strength
  const csp = headers['content-security-policy'];
  if (csp) {
    if (csp.includes("'unsafe-inline'")) {
      issues.push("CSP allows unsafe-inline scripts/styles");
      score -= 10;
      recommendations.push("Remove 'unsafe-inline' from CSP and use nonces or hashes");
    }
    
    if (csp.includes("'unsafe-eval'")) {
      issues.push("CSP allows unsafe-eval");
      score -= 10;
      recommendations.push("Remove 'unsafe-eval' from CSP");
    }
    
    if (!csp.includes('upgrade-insecure-requests')) {
      recommendations.push("Add 'upgrade-insecure-requests' to CSP");
      score -= 5;
    }
  }

  // Check HSTS
  const hsts = headers['strict-transport-security'];
  if (hsts) {
    if (!hsts.includes('includeSubDomains')) {
      recommendations.push("Add 'includeSubDomains' to HSTS");
      score -= 5;
    }
    
    if (!hsts.includes('preload')) {
      recommendations.push("Add 'preload' to HSTS");
      score -= 5;
    }
  }

  return { score: Math.max(0, score), issues, recommendations };
}