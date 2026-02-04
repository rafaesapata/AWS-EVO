/**
 * Security Headers Implementation
 * Provides comprehensive security headers for all API responses
 */

import type { APIGatewayProxyResultV2 } from '../types/lambda.js';

export interface SecurityHeadersConfig {
  contentSecurityPolicy?: string;
  strictTransportSecurity?: string;
  xFrameOptions?: string;
  xContentTypeOptions?: string;
  referrerPolicy?: string;
  permissionsPolicy?: string;
  crossOriginEmbedderPolicy?: string;
  crossOriginOpenerPolicy?: string;
  crossOriginResourcePolicy?: string;
  enableHSTS?: boolean;
  enableCSP?: boolean;
  enableXSSProtection?: boolean;
}

/**
 * Default security headers configuration
 */
export const DEFAULT_SECURITY_HEADERS: SecurityHeadersConfig = {
  contentSecurityPolicy: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.evo-uds.com wss://api.evo-uds.com https://*.amazonaws.com",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ].join('; '),
  
  strictTransportSecurity: 'max-age=31536000; includeSubDomains; preload',
  xFrameOptions: 'DENY',
  xContentTypeOptions: 'nosniff',
  referrerPolicy: 'strict-origin-when-cross-origin',
  
  permissionsPolicy: [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
    'ambient-light-sensor=()',
    'autoplay=()',
    'encrypted-media=()',
    'fullscreen=(self)',
    'picture-in-picture=()'
  ].join(', '),
  
  crossOriginEmbedderPolicy: 'require-corp',
  crossOriginOpenerPolicy: 'same-origin',
  crossOriginResourcePolicy: 'same-origin',
  
  enableHSTS: true,
  enableCSP: true,
  enableXSSProtection: true,
};

/**
 * Security Headers Manager
 */
export class SecurityHeadersManager {
  private config: SecurityHeadersConfig;

  constructor(config: SecurityHeadersConfig = DEFAULT_SECURITY_HEADERS) {
    this.config = { ...DEFAULT_SECURITY_HEADERS, ...config };
  }

  /**
   * Generate security headers object
   */
  getHeaders(environment: string = 'production'): Record<string, string> {
    const headers: Record<string, string> = {};

    // Content Security Policy
    if (this.config.enableCSP && this.config.contentSecurityPolicy) {
      headers['Content-Security-Policy'] = this.config.contentSecurityPolicy;
      
      // Report-only mode for development
      if (environment === 'development') {
        headers['Content-Security-Policy-Report-Only'] = this.config.contentSecurityPolicy;
        delete headers['Content-Security-Policy'];
      }
    }

    // Strict Transport Security (HTTPS only)
    if (this.config.enableHSTS && this.config.strictTransportSecurity && environment === 'production') {
      headers['Strict-Transport-Security'] = this.config.strictTransportSecurity;
    }

    // X-Frame-Options
    if (this.config.xFrameOptions) {
      headers['X-Frame-Options'] = this.config.xFrameOptions;
    }

    // X-Content-Type-Options
    if (this.config.xContentTypeOptions) {
      headers['X-Content-Type-Options'] = this.config.xContentTypeOptions;
    }

    // Referrer Policy
    if (this.config.referrerPolicy) {
      headers['Referrer-Policy'] = this.config.referrerPolicy;
    }

    // Permissions Policy
    if (this.config.permissionsPolicy) {
      headers['Permissions-Policy'] = this.config.permissionsPolicy;
    }

    // Cross-Origin Policies
    if (this.config.crossOriginEmbedderPolicy) {
      headers['Cross-Origin-Embedder-Policy'] = this.config.crossOriginEmbedderPolicy;
    }

    if (this.config.crossOriginOpenerPolicy) {
      headers['Cross-Origin-Opener-Policy'] = this.config.crossOriginOpenerPolicy;
    }

    if (this.config.crossOriginResourcePolicy) {
      headers['Cross-Origin-Resource-Policy'] = this.config.crossOriginResourcePolicy;
    }

    // XSS Protection (legacy but still useful)
    if (this.config.enableXSSProtection) {
      headers['X-XSS-Protection'] = '1; mode=block';
    }

    // Additional security headers
    headers['X-Permitted-Cross-Domain-Policies'] = 'none';
    headers['X-Download-Options'] = 'noopen';
    headers['X-DNS-Prefetch-Control'] = 'off';
    headers['Expect-CT'] = 'max-age=86400, enforce';

    // Cache control for sensitive endpoints
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, private';
    headers['Pragma'] = 'no-cache';
    headers['Expires'] = '0';

    return headers;
  }

  /**
   * Apply security headers to Lambda response
   */
  applyHeaders(
    response: APIGatewayProxyResultV2,
    environment: string = 'production'
  ): APIGatewayProxyResultV2 {
    const securityHeaders = this.getHeaders(environment);
    
    return {
      ...response,
      headers: {
        ...response.headers,
        ...securityHeaders,
      },
    };
  }

  /**
   * Create CSP nonce for inline scripts/styles
   */
  generateNonce(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Update CSP with nonce
   */
  updateCSPWithNonce(nonce: string): void {
    if (this.config.contentSecurityPolicy) {
      this.config.contentSecurityPolicy = this.config.contentSecurityPolicy
        .replace("'unsafe-inline'", `'nonce-${nonce}'`);
    }
  }

  /**
   * Validate security headers
   */
  validateHeaders(headers: Record<string, string>): {
    valid: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check for required headers
    const requiredHeaders = [
      'Content-Security-Policy',
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
    ];

    requiredHeaders.forEach(header => {
      if (!headers[header] && !headers[header.toLowerCase()]) {
        issues.push(`Missing required header: ${header}`);
      }
    });

    // Check CSP
    const csp = headers['Content-Security-Policy'] || headers['content-security-policy'];
    if (csp) {
      if (csp.includes("'unsafe-eval'")) {
        recommendations.push('Consider removing unsafe-eval from CSP');
      }
      if (csp.includes("'unsafe-inline'")) {
        recommendations.push('Consider using nonces instead of unsafe-inline');
      }
      if (!csp.includes('upgrade-insecure-requests')) {
        recommendations.push('Consider adding upgrade-insecure-requests to CSP');
      }
    }

    // Check HSTS
    const hsts = headers['Strict-Transport-Security'] || headers['strict-transport-security'];
    if (hsts) {
      if (!hsts.includes('includeSubDomains')) {
        recommendations.push('Consider adding includeSubDomains to HSTS');
      }
      if (!hsts.includes('preload')) {
        recommendations.push('Consider adding preload to HSTS');
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      recommendations,
    };
  }
}

// Global security headers manager
export const securityHeaders = new SecurityHeadersManager();

/**
 * Middleware for applying security headers
 */
export function withSecurityHeaders(
  handler: (event: any, context: any) => Promise<APIGatewayProxyResultV2>,
  config?: SecurityHeadersConfig
) {
  const headerManager = config ? new SecurityHeadersManager(config) : securityHeaders;
  const environment = process.env.NODE_ENV || 'production';

  return async (event: any, context: any): Promise<APIGatewayProxyResultV2> => {
    const response = await handler(event, context);
    return headerManager.applyHeaders(response, environment);
  };
}

/**
 * CORS configuration with security considerations
 */
export interface CORSConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders?: string[];
  maxAge?: number;
  credentials?: boolean;
}

export const SECURE_CORS_CONFIG: CORSConfig = {
  allowedOrigins: [
    'https://evo.nuevacore.com',
    'https://api.evo.nuevacore.com',
    'https://evo.ai.udstec.io',
    'https://api-evo.ai.udstec.io',
    'https://app.evo-uds.com',
    'https://dashboard.evo-uds.com',
    // Development origins - only in non-production
    ...(process.env.NODE_ENV !== 'production' ? [
      'http://localhost:8080',
      'http://localhost:3000',
      'http://localhost:5173',
    ] : []),
  ],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-API-Key',
    'X-Request-ID',
    'X-Correlation-ID',
    'X-CSRF-Token',
    'X-Amz-Date',
    'X-Amz-Security-Token',
    'X-Impersonate-Organization',
  ],
  exposedHeaders: [
    'X-Request-ID',
    'X-Correlation-ID',
    'X-Response-Time',
    'X-RateLimit-Remaining',
    'X-RateLimit-Limit',
    'X-RateLimit-Reset',
  ],
  maxAge: 86400, // 24 hours
  credentials: true,
};

/**
 * Generate CORS headers - SECURITY HARDENED
 * Never allows '*' origin in production when credentials are enabled
 */
export function generateCORSHeaders(
  origin: string | undefined,
  config: CORSConfig = SECURE_CORS_CONFIG
): Record<string, string> {
  const headers: Record<string, string> = {};
  const isProduction = process.env.NODE_ENV === 'production';

  // Check if origin is in allowed list
  const isAllowedOrigin = origin && config.allowedOrigins.includes(origin);
  
  // In production, NEVER use '*' - always validate origin
  if (isAllowedOrigin) {
    headers['Access-Control-Allow-Origin'] = origin;
    if (config.credentials) {
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
  } else if (!isProduction && origin) {
    // MILITARY GRADE: In development, validate localhost origins with strict regex
    // Prevents bypass attacks like http://localhost.attacker.com
    const LOCALHOST_REGEX = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
    
    if (LOCALHOST_REGEX.test(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      if (config.credentials) {
        headers['Access-Control-Allow-Credentials'] = 'true';
      }
    } else {
      // Unknown origin in dev - use first allowed origin (no credentials)
      headers['Access-Control-Allow-Origin'] = config.allowedOrigins[0] || 'https://evo.nuevacore.com';
    }
  } else {
    // Production with unknown origin - use primary domain (no credentials)
    headers['Access-Control-Allow-Origin'] = 'https://evo.nuevacore.com';
  }

  headers['Access-Control-Allow-Methods'] = config.allowedMethods.join(', ');
  headers['Access-Control-Allow-Headers'] = config.allowedHeaders.join(', ');

  if (config.exposedHeaders && config.exposedHeaders.length > 0) {
    headers['Access-Control-Expose-Headers'] = config.exposedHeaders.join(', ');
  }

  if (config.maxAge) {
    headers['Access-Control-Max-Age'] = config.maxAge.toString();
  }

  // Security headers for CORS
  headers['Vary'] = 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers';

  return headers;
}

/**
 * Security audit for headers
 */
export async function auditSecurityHeaders(
  url: string
): Promise<{
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  headers: Record<string, string>;
  issues: string[];
  recommendations: string[];
}> {
  try {
    // Real HTTP request to analyze headers
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });
    
    // Convert Headers to plain object
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    
    const validation = securityHeaders.validateHeaders(headers);
    
    let score = 100;
    score -= validation.issues.length * 10;
    score -= validation.recommendations.length * 5;
    score = Math.max(0, score);

    let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
    if (score >= 95) grade = 'A+';
    else if (score >= 85) grade = 'A';
    else if (score >= 75) grade = 'B';
    else if (score >= 65) grade = 'C';
    else if (score >= 55) grade = 'D';
    else grade = 'F';

    return {
      score,
      grade,
      headers,
      issues: validation.issues,
      recommendations: validation.recommendations,
    };
  } catch (error) {
    // Return error state when analysis fails
    console.error(`Security header analysis failed for ${url}`, (error as Error).message);
    
    return {
      score: 0,
      grade: 'F' as const,
      headers: {},
      issues: [`Failed to analyze ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`],
      recommendations: [
        'Ensure the URL is accessible',
        'Check network connectivity',
        'Verify SSL/TLS configuration',
        'Review firewall settings'
      ],
    };
  }
}

/**
 * Rate limiting headers
 */
export function generateRateLimitHeaders(
  limit: number,
  remaining: number,
  resetTime: number
): Record<string, string> {
  return {
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': resetTime.toString(),
    'Retry-After': Math.ceil((resetTime - Date.now()) / 1000).toString(),
  };
}