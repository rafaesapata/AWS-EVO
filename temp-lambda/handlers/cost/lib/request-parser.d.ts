/**
 * Safe Request Parser
 * Provides secure JSON parsing with error handling
 */
/**
 * Safely parse JSON with error handling
 * Prevents crashes from malformed JSON input
 */
export declare function safeParseJSON<T>(jsonString: string | null | undefined, defaultValue: T, context?: string): T;
/**
 * Parse Lambda event body safely
 */
export declare function parseEventBody<T extends object>(event: {
    body?: string | null;
}, defaultValue?: T, handlerName?: string): T;
/**
 * Validate required fields in parsed body
 */
export declare function validateRequiredFields<T extends object>(body: T, requiredFields: (keyof T)[]): {
    valid: boolean;
    missingFields: string[];
};
/**
 * Sanitize input to prevent XSS
 */
export declare function sanitizeInput(input: string): string;
/**
 * Parse and validate pagination parameters
 */
export declare function parsePaginationParams(body: {
    page?: number;
    limit?: number;
    offset?: number;
}): {
    page: number;
    limit: number;
    offset: number;
};
//# sourceMappingURL=request-parser.d.ts.map