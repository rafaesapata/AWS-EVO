"use strict";
/**
 * Input validation utilities using Zod
 * Provides type-safe validation for Lambda handlers with military-grade security
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRemediationTicketSchema = exports.complianceScanSchema = exports.costAnalysisSchema = exports.findingsQuerySchema = exports.securityScanSchema = exports.commonSchemas = void 0;
exports.sanitizeStringAdvanced = sanitizeStringAdvanced;
exports.detectMaliciousPatterns = detectMaliciousPatterns;
exports.sanitizeString = sanitizeString;
exports.validatePayloadSize = validatePayloadSize;
exports.sanitizeObject = sanitizeObject;
exports.validateEmail = validateEmail;
exports.validateAwsAccountId = validateAwsAccountId;
exports.validateAwsArn = validateAwsArn;
exports.validateUrl = validateUrl;
exports.validateInput = validateInput;
exports.parseAndValidateBody = parseAndValidateBody;
exports.validateQueryParams = validateQueryParams;
exports.validateCSRFToken = validateCSRFToken;
exports.validateOrganizationContext = validateOrganizationContext;
exports.checkRateLimit = checkRateLimit;
exports.checkRateLimitSlidingWindow = checkRateLimitSlidingWindow;
exports.cleanupRateLimitCache = cleanupRateLimitCache;
const zod_1 = require("zod");
const response_js_1 = require("./response.js");
// ============================================================================
// REGEX PATTERNS DE SEGURANÇA
// ============================================================================
const HTML_TAG_REGEX = /<[^>]*>/g;
const SCRIPT_TAG_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
// Fixed: Don't match quotes in JSON - only match SQL keywords followed by suspicious patterns
const SQL_INJECTION_REGEX = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|TRUNCATE|GRANT|REVOKE)\s+(FROM|INTO|TABLE|DATABASE|ALL|WHERE|\*))|(-{2}|;--)|(\bOR\b\s+\d+\s*=\s*\d+)|(\bAND\b\s+\d+\s*=\s*\d+)/gi;
/**
 * Padrões XSS adicionais para detecção avançada
 */
const XSS_PATTERNS = [
    /javascript:/gi,
    /vbscript:/gi,
    /data:text\/html/gi,
    /on\w+\s*=/gi, // Eventos como onclick=, onerror=
    /expression\s*\(/gi,
    /-moz-binding/gi,
    /<!--/g,
    /-->/g,
    /\/\*.*\*\//g,
    /\\x[0-9a-fA-F]{2}/g,
    /\\u[0-9a-fA-F]{4}/g,
];
// ============================================================================
// 1. SANITIZAÇÃO MULTI-CAMADA COM DECODIFICAÇÃO
// ============================================================================
/**
 * Sanitiza string com múltiplas camadas de proteção
 * Previne bypasses via encoding
 */
function sanitizeStringAdvanced(input) {
    if (typeof input !== 'string')
        return '';
    let sanitized = input;
    // PASSO 1: Decodificar múltiplas vezes para pegar encoding aninhado
    for (let i = 0; i < 3; i++) {
        try {
            const decoded = decodeURIComponent(sanitized);
            if (decoded === sanitized)
                break;
            sanitized = decoded;
        }
        catch {
            break;
        }
    }
    // PASSO 2: Decodificar HTML entities
    sanitized = sanitized
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/gi, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
    // PASSO 3: Normalizar Unicode para prevenir bypasses
    sanitized = sanitized.normalize('NFKC');
    // PASSO 4: Remover caracteres de controle e null bytes
    sanitized = sanitized
        .replace(/\0/g, '') // Null bytes
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Caracteres de controle
        .replace(/\s+/g, ' ') // Normalizar espaços
        .trim();
    // PASSO 5: Aplicar sanitização de HTML/Script
    sanitized = sanitized
        .replace(HTML_TAG_REGEX, '')
        .replace(SCRIPT_TAG_REGEX, '');
    // PASSO 6: Remover padrões SQL Injection
    sanitized = sanitized.replace(SQL_INJECTION_REGEX, '');
    // PASSO 7: Verificar padrões XSS adicionais
    for (const pattern of XSS_PATTERNS) {
        sanitized = sanitized.replace(pattern, '');
    }
    // PASSO 8: Limite de comprimento com margem de segurança
    const MAX_LENGTH = 5000;
    if (sanitized.length > MAX_LENGTH) {
        sanitized = sanitized.substring(0, MAX_LENGTH);
    }
    return sanitized;
}
/**
 * Verifica se string contém padrões maliciosos (sem modificar)
 */
function detectMaliciousPatterns(input) {
    if (typeof input !== 'string') {
        return { isMalicious: false, patterns: [] };
    }
    const detectedPatterns = [];
    let normalized = input;
    // Decodificar para análise
    try {
        for (let i = 0; i < 3; i++) {
            const decoded = decodeURIComponent(normalized);
            if (decoded === normalized)
                break;
            normalized = decoded;
        }
    }
    catch { }
    normalized = normalized.normalize('NFKC').toLowerCase();
    // Verificar padrões
    if (SQL_INJECTION_REGEX.test(normalized)) {
        detectedPatterns.push('SQL_INJECTION');
    }
    for (const pattern of XSS_PATTERNS) {
        if (pattern.test(normalized)) {
            detectedPatterns.push('XSS');
            break;
        }
    }
    if (HTML_TAG_REGEX.test(normalized)) {
        detectedPatterns.push('HTML_INJECTION');
    }
    return {
        isMalicious: detectedPatterns.length > 0,
        patterns: detectedPatterns
    };
}
/**
 * Sanitize string input to prevent injection attacks (legacy compatibility)
 */
function sanitizeString(input) {
    return sanitizeStringAdvanced(input);
}
// ============================================================================
// 2. VALIDAÇÃO DE TAMANHO DE PAYLOAD COM LIMITES POR TIPO
// ============================================================================
/**
 * Limites de payload por content-type
 */
const PAYLOAD_LIMITS = {
    'application/json': 256 * 1024, // 256KB para JSON
    'multipart/form-data': 10 * 1024 * 1024, // 10MB para uploads
    'application/x-www-form-urlencoded': 100 * 1024, // 100KB para forms
    'text/plain': 64 * 1024, // 64KB para texto
    'default': 512 * 1024 // 512KB padrão
};
/**
 * Valida tamanho do payload
 */
function validatePayloadSize(body, contentType) {
    if (!body)
        return { success: true };
    // Determinar content-type base (sem charset)
    const baseContentType = contentType?.split(';')[0]?.trim().toLowerCase() || 'default';
    const limit = PAYLOAD_LIMITS[baseContentType] || PAYLOAD_LIMITS['default'];
    // Calcular tamanho em bytes
    const bodySize = Buffer.byteLength(body, 'utf8');
    if (bodySize > limit) {
        return {
            success: false,
            error: {
                statusCode: 413,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Max-Payload-Size': limit.toString()
                },
                body: JSON.stringify({
                    error: 'Payload Too Large',
                    message: `Payload size ${bodySize} bytes exceeds maximum ${limit} bytes for ${baseContentType}`,
                    maxSize: limit,
                    actualSize: bodySize
                })
            }
        };
    }
    return { success: true };
}
/**
 * Sanitize object recursively
 */
function sanitizeObject(obj) {
    if (typeof obj === 'string') {
        return sanitizeStringAdvanced(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
    }
    if (obj && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            const sanitizedKey = sanitizeStringAdvanced(key);
            sanitized[sanitizedKey] = sanitizeObject(value);
        }
        return sanitized;
    }
    return obj;
}
/**
 * Validate email format with strict security
 */
function validateEmail(email) {
    // Strict email regex that requires:
    // - No consecutive dots in local part
    // - Valid domain with TLD (at least 2 chars)
    // - No leading/trailing dots
    const emailRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    const sanitized = sanitizeString(email);
    // Check for consecutive dots
    if (/\.\./.test(sanitized)) {
        return false;
    }
    return emailRegex.test(sanitized) && sanitized.length <= 254;
}
/**
 * Validate AWS Account ID format (12 digits)
 */
function validateAwsAccountId(accountId) {
    if (!accountId || typeof accountId !== 'string')
        return false;
    const sanitized = sanitizeString(accountId);
    return /^\d{12}$/.test(sanitized);
}
/**
 * Validate AWS ARN format
 */
function validateAwsArn(arn) {
    const arnRegex = /^arn:aws:[a-zA-Z0-9-]+:[a-zA-Z0-9-]*:\d{12}:[a-zA-Z0-9-_/:.]+$/;
    const sanitized = sanitizeString(arn);
    return arnRegex.test(sanitized);
}
/**
 * Validate URL with security checks
 */
function validateUrl(url) {
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
    }
    catch {
        return false;
    }
}
// Common validation schemas
exports.commonSchemas = {
    // AWS Account ID validation
    awsAccountId: zod_1.z.string().regex(/^\d{12}$/, 'Invalid AWS Account ID format'),
    // Organization ID validation
    organizationId: zod_1.z.string().uuid('Invalid organization ID format'),
    // AWS Region validation
    awsRegion: zod_1.z.string().regex(/^[a-z0-9-]+$/, 'Invalid AWS region format'),
    // Pagination
    pagination: zod_1.z.object({
        page: zod_1.z.number().int().min(1).default(1),
        limit: zod_1.z.number().int().min(1).max(100).default(20),
    }),
    // Date range
    dateRange: zod_1.z.object({
        startDate: zod_1.z.string().datetime().optional(),
        endDate: zod_1.z.string().datetime().optional(),
    }),
    // Severity levels
    severity: zod_1.z.enum(['critical', 'high', 'medium', 'low']),
    // Scan levels
    scanLevel: zod_1.z.enum(['basic', 'advanced', 'military']).default('military'),
};
// Security scan request validation
exports.securityScanSchema = zod_1.z.object({
    accountId: zod_1.z.string().nullish(), // Accept string, null, or undefined
    scanLevel: exports.commonSchemas.scanLevel,
    scanId: zod_1.z.string().optional(), // Optional scan ID for updating existing scans
    regions: zod_1.z.array(exports.commonSchemas.awsRegion).optional(),
    scanTypes: zod_1.z.array(zod_1.z.string()).optional(),
});
// Findings query validation
exports.findingsQuerySchema = zod_1.z.object({
    accountId: zod_1.z.string().optional(),
    severity: zod_1.z.array(exports.commonSchemas.severity).optional(),
    status: zod_1.z.array(zod_1.z.enum(['pending', 'acknowledged', 'resolved', 'false_positive'])).optional(),
    service: zod_1.z.array(zod_1.z.string()).optional(),
    category: zod_1.z.array(zod_1.z.string()).optional(),
    ...exports.commonSchemas.pagination.shape,
    ...exports.commonSchemas.dateRange.shape,
});
// Cost analysis request validation
exports.costAnalysisSchema = zod_1.z.object({
    accountId: zod_1.z.string().optional(),
    service: zod_1.z.string().optional(),
    granularity: zod_1.z.enum(['DAILY', 'MONTHLY', 'HOURLY']).default('DAILY'),
    ...exports.commonSchemas.dateRange.shape,
});
// Compliance scan validation
exports.complianceScanSchema = zod_1.z.object({
    accountId: zod_1.z.string().optional(),
    frameworks: zod_1.z.array(zod_1.z.enum(['CIS', 'PCI-DSS', 'SOC2', 'LGPD', 'GDPR'])).optional(),
    ...exports.commonSchemas.dateRange.shape,
});
// Remediation ticket creation validation
exports.createRemediationTicketSchema = zod_1.z.object({
    findingIds: zod_1.z.array(zod_1.z.string().uuid()).min(1, 'At least one finding must be selected'),
    title: zod_1.z.string().min(1, 'Title is required').max(200, 'Title too long'),
    description: zod_1.z.string().max(2000, 'Description too long').optional(),
    priority: zod_1.z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    organizationId: exports.commonSchemas.organizationId,
});
/**
 * Validation middleware for Lambda handlers with input sanitization
 */
function validateInput(schema, input) {
    try {
        // Sanitize input before validation
        const sanitizedInput = sanitizeObject(input);
        const result = schema.parse(sanitizedInput);
        return { success: true, data: result };
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            const errorMessages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
            return {
                success: false,
                error: (0, response_js_1.badRequest)(`Validation error: ${errorMessages}`, {
                    validationErrors: error.errors,
                }),
            };
        }
        return {
            success: false,
            error: (0, response_js_1.badRequest)('Invalid input format'),
        };
    }
}
/**
 * Parse and validate JSON body from Lambda event with security checks
 */
function parseAndValidateBody(schema, body, contentType) {
    if (!body) {
        return validateInput(schema, {});
    }
    // Validar tamanho do payload
    const sizeValidation = validatePayloadSize(body, contentType || 'application/json');
    if (!sizeValidation.success) {
        return sizeValidation;
    }
    try {
        const parsed = JSON.parse(body);
        // Additional security check for nested depth (DoS protection)
        const depth = getObjectDepth(parsed);
        if (depth > 10) {
            return {
                success: false,
                error: (0, response_js_1.badRequest)('Request structure too complex'),
            };
        }
        // Detectar padrões maliciosos antes de processar
        const bodyStr = JSON.stringify(parsed);
        const maliciousCheck = detectMaliciousPatterns(bodyStr);
        if (maliciousCheck.isMalicious) {
            // Use allowed origins from environment or default to production domain
            const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://evo.ai.udstec.io').split(',');
            const defaultOrigin = allowedOrigins[0];
            return {
                success: false,
                error: {
                    statusCode: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': defaultOrigin,
                        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-API-Key, X-Request-ID, X-Correlation-ID, X-CSRF-Token',
                        'Access-Control-Allow-Credentials': 'true',
                    },
                    body: JSON.stringify({
                        error: 'Malicious content detected',
                        patterns: maliciousCheck.patterns
                    })
                }
            };
        }
        return validateInput(schema, parsed);
    }
    catch (error) {
        return {
            success: false,
            error: (0, response_js_1.badRequest)('Invalid JSON format'),
        };
    }
}
/**
 * Calculate object nesting depth for DoS protection
 * Also validates array sizes to prevent memory exhaustion
 */
function getObjectDepth(obj, depth = 0) {
    if (depth > 10)
        return depth; // Early exit for performance
    if (obj && typeof obj === 'object') {
        if (Array.isArray(obj)) {
            // MILITARY GRADE: Limit array size to prevent memory exhaustion
            const MAX_ARRAY_SIZE = 1000;
            if (obj.length > MAX_ARRAY_SIZE) {
                throw new Error(`Array size ${obj.length} exceeds maximum ${MAX_ARRAY_SIZE}`);
            }
            if (obj.length === 0)
                return depth;
            return Math.max(...obj.map(item => getObjectDepth(item, depth + 1)));
        }
        else {
            // MILITARY GRADE: Limit object keys to prevent memory exhaustion
            const MAX_OBJECT_KEYS = 100;
            const keys = Object.keys(obj);
            if (keys.length > MAX_OBJECT_KEYS) {
                throw new Error(`Object has ${keys.length} keys, exceeds maximum ${MAX_OBJECT_KEYS}`);
            }
            const values = Object.values(obj);
            if (values.length === 0)
                return depth;
            return Math.max(...values.map(value => getObjectDepth(value, depth + 1)));
        }
    }
    return depth;
}
/**
 * Validate query parameters
 */
function validateQueryParams(schema, queryParams) {
    // Convert query string parameters to appropriate types
    const processedParams = {};
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
function validateCSRFToken(headers, method) {
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
function validateOrganizationContext(organizationId, userOrgId) {
    if (organizationId !== userOrgId) {
        return {
            success: false,
            error: (0, response_js_1.badRequest)('Access denied: Organization mismatch'),
        };
    }
    const validation = validateInput(exports.commonSchemas.organizationId, organizationId);
    if (!validation.success) {
        return validation;
    }
    return { success: true };
}
// ============================================================================
// 3. RATE LIMITING DISTRIBUÍDO
// ============================================================================
/**
 * Rate limiting validation (enhanced implementation)
 */
const rateLimitMap = new Map();
/**
 * Configurações de rate limiting por tipo de operação
 */
const RATE_LIMIT_CONFIG = {
    'default': { maxRequests: 100, windowMs: 60000, blockDurationMs: 300000 },
    'auth': { maxRequests: 10, windowMs: 60000, blockDurationMs: 900000 },
    'sensitive': { maxRequests: 5, windowMs: 60000, blockDurationMs: 1800000 },
    'export': { maxRequests: 3, windowMs: 300000, blockDurationMs: 3600000 },
};
function checkRateLimit(identifier, maxRequests = 100, windowMs = 60000 // 1 minute
) {
    const now = Date.now();
    const key = identifier;
    const current = rateLimitMap.get(key);
    // Verificar se está bloqueado
    if (current?.blocked && current.blockExpiry && current.blockExpiry > now) {
        const retryAfter = Math.ceil((current.blockExpiry - now) / 1000);
        return {
            success: false,
            error: {
                statusCode: 429,
                headers: {
                    'Content-Type': 'application/json',
                    'Retry-After': retryAfter.toString(),
                    'X-RateLimit-Limit': maxRequests.toString(),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': new Date(current.blockExpiry).toISOString()
                },
                body: JSON.stringify({
                    error: 'Rate limit exceeded',
                    message: `User blocked. Try again in ${retryAfter} seconds.`,
                    retryAfter
                }),
            },
        };
    }
    if (!current || now > current.resetTime) {
        // Reset or initialize
        rateLimitMap.set(key, { count: 1, resetTime: now + windowMs, blocked: false });
        return { success: true, remaining: maxRequests - 1 };
    }
    if (current.count >= maxRequests) {
        // Block user
        current.blocked = true;
        current.blockExpiry = now + 300000; // 5 minutes block
        return {
            success: false,
            error: {
                statusCode: 429,
                headers: {
                    'Content-Type': 'application/json',
                    'Retry-After': Math.ceil((current.resetTime - now) / 1000).toString(),
                    'X-RateLimit-Limit': maxRequests.toString(),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': new Date(current.resetTime).toISOString()
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
    return { success: true, remaining: maxRequests - current.count };
}
/**
 * Rate limiting com múltiplas janelas (sliding window)
 */
function checkRateLimitSlidingWindow(identifier, limits) {
    for (const limit of limits) {
        const result = checkRateLimit(`${identifier}:${limit.windowMs}`, limit.maxRequests, limit.windowMs);
        if (!result.success) {
            return result;
        }
    }
    return { success: true };
}
function cleanupRateLimitCache() {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
        if (now > entry.resetTime && (!entry.blocked || (entry.blockExpiry && now > entry.blockExpiry))) {
            rateLimitMap.delete(key);
        }
    }
}
// NOTA: setInterval removido - não funciona corretamente em Lambda
// O cleanup é feito automaticamente quando checkRateLimit é chamado
// Para cleanup periódico, usar EventBridge Scheduler ou chamar cleanupRateLimitCache() no início do handler
//# sourceMappingURL=validation.js.map