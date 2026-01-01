/**
 * Input validation utilities using Zod
 * Provides type-safe validation for Lambda handlers with military-grade security
 */
import { z } from 'zod';
import type { APIGatewayProxyResultV2 } from '../types/lambda.js';
/**
 * Sanitiza string com múltiplas camadas de proteção
 * Previne bypasses via encoding
 */
export declare function sanitizeStringAdvanced(input: string): string;
/**
 * Verifica se string contém padrões maliciosos (sem modificar)
 */
export declare function detectMaliciousPatterns(input: string): {
    isMalicious: boolean;
    patterns: string[];
};
/**
 * Sanitize string input to prevent injection attacks (legacy compatibility)
 */
export declare function sanitizeString(input: string): string;
/**
 * Valida tamanho do payload
 */
export declare function validatePayloadSize(body: string | null, contentType: string): {
    success: true;
} | {
    success: false;
    error: APIGatewayProxyResultV2;
};
/**
 * Sanitize object recursively
 */
export declare function sanitizeObject(obj: any): any;
/**
 * Validate email format with strict security
 */
export declare function validateEmail(email: string): boolean;
/**
 * Validate AWS Account ID format (12 digits)
 */
export declare function validateAwsAccountId(accountId: string): boolean;
/**
 * Validate AWS ARN format
 */
export declare function validateAwsArn(arn: string): boolean;
/**
 * Validate URL with security checks
 */
export declare function validateUrl(url: string): boolean;
export declare const commonSchemas: {
    awsAccountId: z.ZodString;
    organizationId: z.ZodString;
    awsRegion: z.ZodString;
    pagination: z.ZodObject<{
        page: z.ZodDefault<z.ZodNumber>;
        limit: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        page: number;
        limit: number;
    }, {
        page?: number | undefined;
        limit?: number | undefined;
    }>;
    dateRange: z.ZodObject<{
        startDate: z.ZodOptional<z.ZodString>;
        endDate: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        startDate?: string | undefined;
        endDate?: string | undefined;
    }, {
        startDate?: string | undefined;
        endDate?: string | undefined;
    }>;
    severity: z.ZodEnum<["critical", "high", "medium", "low"]>;
    scanLevel: z.ZodDefault<z.ZodEnum<["basic", "advanced", "military"]>>;
};
export declare const securityScanSchema: z.ZodObject<{
    accountId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    scanLevel: z.ZodDefault<z.ZodEnum<["basic", "advanced", "military"]>>;
    scanId: z.ZodOptional<z.ZodString>;
    regions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    scanTypes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    scanLevel: "basic" | "advanced" | "military";
    accountId?: string | null | undefined;
    scanId?: string | undefined;
    regions?: string[] | undefined;
    scanTypes?: string[] | undefined;
}, {
    accountId?: string | null | undefined;
    scanLevel?: "basic" | "advanced" | "military" | undefined;
    scanId?: string | undefined;
    regions?: string[] | undefined;
    scanTypes?: string[] | undefined;
}>;
export declare const findingsQuerySchema: z.ZodObject<{
    startDate: z.ZodOptional<z.ZodString>;
    endDate: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    accountId: z.ZodOptional<z.ZodString>;
    severity: z.ZodOptional<z.ZodArray<z.ZodEnum<["critical", "high", "medium", "low"]>, "many">>;
    status: z.ZodOptional<z.ZodArray<z.ZodEnum<["pending", "acknowledged", "resolved", "false_positive"]>, "many">>;
    service: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    category: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: ("pending" | "acknowledged" | "resolved" | "false_positive")[] | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
    accountId?: string | undefined;
    severity?: ("critical" | "high" | "medium" | "low")[] | undefined;
    service?: string[] | undefined;
    category?: string[] | undefined;
}, {
    page?: number | undefined;
    limit?: number | undefined;
    status?: ("pending" | "acknowledged" | "resolved" | "false_positive")[] | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
    accountId?: string | undefined;
    severity?: ("critical" | "high" | "medium" | "low")[] | undefined;
    service?: string[] | undefined;
    category?: string[] | undefined;
}>;
export declare const costAnalysisSchema: z.ZodObject<{
    startDate: z.ZodOptional<z.ZodString>;
    endDate: z.ZodOptional<z.ZodString>;
    accountId: z.ZodOptional<z.ZodString>;
    service: z.ZodOptional<z.ZodString>;
    granularity: z.ZodDefault<z.ZodEnum<["DAILY", "MONTHLY", "HOURLY"]>>;
}, "strip", z.ZodTypeAny, {
    granularity: "DAILY" | "MONTHLY" | "HOURLY";
    startDate?: string | undefined;
    endDate?: string | undefined;
    accountId?: string | undefined;
    service?: string | undefined;
}, {
    startDate?: string | undefined;
    endDate?: string | undefined;
    accountId?: string | undefined;
    service?: string | undefined;
    granularity?: "DAILY" | "MONTHLY" | "HOURLY" | undefined;
}>;
export declare const complianceScanSchema: z.ZodObject<{
    startDate: z.ZodOptional<z.ZodString>;
    endDate: z.ZodOptional<z.ZodString>;
    accountId: z.ZodOptional<z.ZodString>;
    frameworks: z.ZodOptional<z.ZodArray<z.ZodEnum<["CIS", "PCI-DSS", "SOC2", "LGPD", "GDPR"]>, "many">>;
}, "strip", z.ZodTypeAny, {
    startDate?: string | undefined;
    endDate?: string | undefined;
    accountId?: string | undefined;
    frameworks?: ("CIS" | "PCI-DSS" | "SOC2" | "LGPD" | "GDPR")[] | undefined;
}, {
    startDate?: string | undefined;
    endDate?: string | undefined;
    accountId?: string | undefined;
    frameworks?: ("CIS" | "PCI-DSS" | "SOC2" | "LGPD" | "GDPR")[] | undefined;
}>;
export declare const createRemediationTicketSchema: z.ZodObject<{
    findingIds: z.ZodArray<z.ZodString, "many">;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    priority: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
    organizationId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    findingIds: string[];
    title: string;
    priority: "critical" | "high" | "medium" | "low";
    organizationId: string;
    description?: string | undefined;
}, {
    findingIds: string[];
    title: string;
    organizationId: string;
    description?: string | undefined;
    priority?: "critical" | "high" | "medium" | "low" | undefined;
}>;
/**
 * Validation middleware for Lambda handlers with input sanitization
 */
export declare function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): {
    success: true;
    data: T;
} | {
    success: false;
    error: APIGatewayProxyResultV2;
};
/**
 * Parse and validate JSON body from Lambda event with security checks
 */
export declare function parseAndValidateBody<T>(schema: z.ZodSchema<T>, body: string | null, contentType?: string): {
    success: true;
    data: T;
} | {
    success: false;
    error: APIGatewayProxyResultV2;
};
/**
 * Validate query parameters
 */
export declare function validateQueryParams<T>(schema: z.ZodSchema<T>, queryParams: Record<string, string> | null): {
    success: true;
    data: T;
} | {
    success: false;
    error: APIGatewayProxyResultV2;
};
/**
 * CSRF Token validation for Lambda handlers
 */
export declare function validateCSRFToken(headers: Record<string, string | undefined>, method: string): {
    success: true;
} | {
    success: false;
    error: APIGatewayProxyResultV2;
};
/**
 * Validate and sanitize organization context
 */
export declare function validateOrganizationContext(organizationId: string, userOrgId: string): {
    success: true;
} | {
    success: false;
    error: APIGatewayProxyResultV2;
};
export declare function checkRateLimit(identifier: string, maxRequests?: number, windowMs?: number): {
    success: true;
    remaining: number;
} | {
    success: false;
    error: APIGatewayProxyResultV2;
};
/**
 * Rate limiting com múltiplas janelas (sliding window)
 */
export declare function checkRateLimitSlidingWindow(identifier: string, limits: Array<{
    maxRequests: number;
    windowMs: number;
}>): {
    success: true;
} | {
    success: false;
    error: APIGatewayProxyResultV2;
};
export declare function cleanupRateLimitCache(): void;
//# sourceMappingURL=validation.d.ts.map