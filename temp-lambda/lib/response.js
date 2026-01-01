"use strict";
/**
 * Helpers para respostas HTTP padronizadas com segurança aprimorada
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setRequestContext = setRequestContext;
exports.getRequestContext = getRequestContext;
exports.success = success;
exports.error = error;
exports.unauthorized = unauthorized;
exports.forbidden = forbidden;
exports.notFound = notFound;
exports.badRequest = badRequest;
exports.tooManyRequests = tooManyRequests;
exports.corsOptions = corsOptions;
exports.healthCheck = healthCheck;
exports.paginated = paginated;
exports.streamingResponse = streamingResponse;
const security_headers_js_1 = require("./security-headers.js");
// Base headers with security considerations
const BASE_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
};
// Request context for tracking
let currentRequestId;
let currentCorrelationId;
/**
 * Set request context for response headers
 */
function setRequestContext(requestId, correlationId) {
    currentRequestId = requestId;
    currentCorrelationId = correlationId;
}
/**
 * Get request context
 */
function getRequestContext() {
    return { requestId: currentRequestId, correlationId: currentCorrelationId };
}
/**
 * Generate response headers with CORS, security, and request tracking
 * CORS headers are ALWAYS included - uses '*' as fallback when origin is not provided
 */
function getResponseHeaders(origin, additionalHeaders) {
    // Always generate CORS headers - use '*' as fallback for maximum compatibility
    const corsHeaders = (0, security_headers_js_1.generateCORSHeaders)(origin || '*', security_headers_js_1.SECURE_CORS_CONFIG);
    const headers = {
        ...BASE_HEADERS,
        ...corsHeaders,
        ...additionalHeaders,
    };
    // Add request tracking headers
    if (currentRequestId) {
        headers['X-Request-ID'] = currentRequestId;
    }
    if (currentCorrelationId) {
        headers['X-Correlation-ID'] = currentCorrelationId;
    }
    return headers;
}
function success(data, statusCode = 200, origin, additionalHeaders) {
    return {
        statusCode,
        headers: getResponseHeaders(origin, additionalHeaders),
        body: JSON.stringify({
            success: true,
            data,
            timestamp: new Date().toISOString(),
        }),
    };
}
function error(message, statusCode = 500, details, origin, additionalHeaders) {
    console.error('Error response:', { message, statusCode, details });
    // Don't expose internal details in production
    const sanitizedDetails = process.env.NODE_ENV === 'production' ? undefined : details;
    return {
        statusCode,
        headers: getResponseHeaders(origin, additionalHeaders),
        body: JSON.stringify({
            success: false,
            error: message,
            timestamp: new Date().toISOString(),
            ...(sanitizedDetails && { details: sanitizedDetails }),
        }),
    };
}
function unauthorized(message = 'Authentication required', origin) {
    return error(message, 401, undefined, origin, {
        'WWW-Authenticate': 'Bearer realm="API"',
    });
}
function forbidden(message = 'Access denied', origin) {
    return error(message, 403, undefined, origin);
}
function notFound(message = 'Resource not found', origin) {
    return error(message, 404, undefined, origin);
}
function badRequest(message, details, origin) {
    return error(message, 400, details, origin);
}
function tooManyRequests(message = 'Rate limit exceeded', retryAfter, origin) {
    const additionalHeaders = {};
    if (retryAfter) {
        additionalHeaders['Retry-After'] = retryAfter.toString();
    }
    return error(message, 429, undefined, origin, additionalHeaders);
}
function corsOptions(origin) {
    return {
        statusCode: 200,
        headers: getResponseHeaders(origin),
        body: '',
    };
}
function healthCheck(status = 'healthy', details, origin) {
    const statusCode = status === 'healthy' ? 200 : 503;
    return {
        statusCode,
        headers: getResponseHeaders(origin, {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        }),
        body: JSON.stringify({
            status,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            ...(details && { details }),
        }),
    };
}
/**
 * Paginated response helper
 */
function paginated(data, total, page, limit, origin) {
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;
    return success({
        data,
        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext,
            hasPrev,
        },
    }, 200, origin);
}
/**
 * Streaming response for large datasets
 */
function streamingResponse(data, isLast = false, origin) {
    return {
        statusCode: 200,
        headers: getResponseHeaders(origin, {
            'Transfer-Encoding': 'chunked',
            'X-Stream-End': isLast.toString(),
        }),
        body: JSON.stringify(data),
    };
}
//# sourceMappingURL=response.js.map