"use strict";
/**
 * Safe Request Parser
 * Provides secure JSON parsing with error handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeParseJSON = safeParseJSON;
exports.parseEventBody = parseEventBody;
exports.validateRequiredFields = validateRequiredFields;
exports.sanitizeInput = sanitizeInput;
exports.parsePaginationParams = parsePaginationParams;
const logging_1 = require("./logging");
/**
 * Safely parse JSON with error handling
 * Prevents crashes from malformed JSON input
 */
function safeParseJSON(jsonString, defaultValue, context) {
    if (!jsonString) {
        return defaultValue;
    }
    try {
        const parsed = JSON.parse(jsonString);
        return parsed;
    }
    catch (error) {
        logging_1.logger.warn('Failed to parse JSON', {
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
function parseEventBody(event, defaultValue = {}, handlerName) {
    return safeParseJSON(event.body, defaultValue, handlerName);
}
/**
 * Validate required fields in parsed body
 */
function validateRequiredFields(body, requiredFields) {
    const missingFields = [];
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
function sanitizeInput(input) {
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
function parsePaginationParams(body) {
    const page = Math.max(1, Number(body.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(body.limit) || 20));
    const offset = body.offset !== undefined
        ? Math.max(0, Number(body.offset))
        : (page - 1) * limit;
    return { page, limit, offset };
}
//# sourceMappingURL=request-parser.js.map