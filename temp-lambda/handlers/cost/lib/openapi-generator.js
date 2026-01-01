"use strict";
/**
 * OpenAPI Documentation Generator from Zod Schemas
 * Automatically generates OpenAPI 3.0 spec from centralized Zod schemas
 *
 * Features:
 * - Converts Zod schemas to OpenAPI JSON Schema
 * - Generates endpoint documentation
 * - Supports authentication and security schemes
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOpenAPISpec = generateOpenAPISpec;
exports.getOpenAPIJSON = getOpenAPIJSON;
exports.getOpenAPIYAML = getOpenAPIYAML;
const zod_1 = require("zod");
const schemas = __importStar(require("./schemas.js"));
// ============================================================================
// ZOD TO OPENAPI CONVERTER
// ============================================================================
function zodToOpenAPI(schema) {
    if (schema instanceof zod_1.ZodString) {
        const result = { type: 'string' };
        const checks = schema._def.checks || [];
        for (const check of checks) {
            if (check.kind === 'email')
                result.format = 'email';
            if (check.kind === 'uuid')
                result.format = 'uuid';
            if (check.kind === 'url')
                result.format = 'uri';
            if (check.kind === 'datetime')
                result.format = 'date-time';
            if (check.kind === 'min')
                result.minLength = check.value;
            if (check.kind === 'max')
                result.maxLength = check.value;
            if (check.kind === 'length') {
                result.minLength = check.value;
                result.maxLength = check.value;
            }
            if (check.kind === 'regex')
                result.pattern = check.regex.source;
        }
        return result;
    }
    if (schema instanceof zod_1.ZodNumber) {
        const result = { type: 'number' };
        const checks = schema._def.checks || [];
        for (const check of checks) {
            if (check.kind === 'int')
                result.type = 'integer';
            if (check.kind === 'min')
                result.minimum = check.value;
            if (check.kind === 'max')
                result.maximum = check.value;
        }
        return result;
    }
    if (schema instanceof zod_1.ZodBoolean) {
        return { type: 'boolean' };
    }
    if (schema instanceof zod_1.ZodArray) {
        return {
            type: 'array',
            items: zodToOpenAPI(schema._def.type),
        };
    }
    if (schema instanceof zod_1.ZodEnum) {
        return {
            type: 'string',
            enum: schema._def.values,
        };
    }
    if (schema instanceof zod_1.ZodOptional) {
        return zodToOpenAPI(schema._def.innerType);
    }
    if (schema instanceof zod_1.ZodDefault) {
        const inner = zodToOpenAPI(schema._def.innerType);
        inner.default = schema._def.defaultValue();
        return inner;
    }
    if (schema instanceof zod_1.ZodUnion) {
        return {
            oneOf: schema._def.options.map((opt) => zodToOpenAPI(opt)),
        };
    }
    if (schema instanceof zod_1.ZodObject) {
        const shape = schema._def.shape();
        const properties = {};
        const required = [];
        for (const [key, value] of Object.entries(shape)) {
            properties[key] = zodToOpenAPI(value);
            // Check if required (not optional)
            if (!(value instanceof zod_1.ZodOptional) && !(value instanceof zod_1.ZodDefault)) {
                required.push(key);
            }
        }
        return {
            type: 'object',
            properties,
            ...(required.length > 0 && { required }),
        };
    }
    // Fallback for unknown types
    return { type: 'object' };
}
const ENDPOINTS = [
    // Admin
    {
        path: '/api/functions/admin-manage-user',
        method: 'post',
        summary: 'Manage user (admin)',
        tags: ['Admin'],
        requestSchema: schemas.manageUserSchema,
        requiresAuth: true,
    },
    {
        path: '/api/functions/admin-create-user',
        method: 'post',
        summary: 'Create new user',
        tags: ['Admin'],
        requestSchema: schemas.createUserSchema,
        requiresAuth: true,
    },
    // Security
    {
        path: '/api/functions/security-scan',
        method: 'post',
        summary: 'Run security scan',
        tags: ['Security'],
        requestSchema: schemas.securityScanRequestSchema,
        requiresAuth: true,
    },
    {
        path: '/api/functions/compliance-scan',
        method: 'post',
        summary: 'Run compliance scan',
        tags: ['Security'],
        requestSchema: schemas.complianceScanSchema,
        requiresAuth: true,
    },
    // Cost
    {
        path: '/api/functions/fetch-daily-costs',
        method: 'post',
        summary: 'Fetch daily AWS costs',
        tags: ['Cost'],
        requestSchema: schemas.fetchDailyCostsSchema,
        requiresAuth: true,
    },
    {
        path: '/api/functions/finops-copilot',
        method: 'post',
        summary: 'FinOps AI Copilot',
        tags: ['Cost', 'AI'],
        requestSchema: schemas.finopsCopilotSchema,
        requiresAuth: true,
    },
    // ML/Anomaly
    {
        path: '/api/functions/detect-anomalies',
        method: 'post',
        summary: 'Detect anomalies',
        tags: ['ML'],
        requestSchema: schemas.detectAnomaliesSchema,
        requiresAuth: true,
    },
    // Notifications
    {
        path: '/api/functions/send-notification',
        method: 'post',
        summary: 'Send notification',
        tags: ['Notifications'],
        requestSchema: schemas.sendNotificationSchema,
        requiresAuth: true,
    },
    {
        path: '/api/functions/send-email',
        method: 'post',
        summary: 'Send email',
        tags: ['Notifications'],
        requestSchema: schemas.sendEmailSchema,
        requiresAuth: true,
    },
    // MFA
    {
        path: '/api/functions/mfa-enroll',
        method: 'post',
        summary: 'Enroll MFA factor',
        tags: ['Auth'],
        requestSchema: schemas.mfaEnrollSchema,
        requiresAuth: true,
    },
    {
        path: '/api/functions/mfa-challenge-verify',
        method: 'post',
        summary: 'Verify MFA challenge',
        tags: ['Auth'],
        requestSchema: schemas.mfaVerifySchema,
        requiresAuth: true,
    },
    // Reports
    {
        path: '/api/functions/generate-pdf-report',
        method: 'post',
        summary: 'Generate PDF report',
        tags: ['Reports'],
        requestSchema: schemas.generatePdfReportSchema,
        requiresAuth: true,
    },
    {
        path: '/api/functions/generate-excel-report',
        method: 'post',
        summary: 'Generate Excel report',
        tags: ['Reports'],
        requestSchema: schemas.generateExcelReportSchema,
        requiresAuth: true,
    },
    // Query
    {
        path: '/api/functions/query-table',
        method: 'post',
        summary: 'Query database table',
        tags: ['Data'],
        requestSchema: schemas.queryTableSchema,
        requiresAuth: true,
    },
];
// ============================================================================
// GENERATOR
// ============================================================================
function generateOpenAPISpec() {
    const paths = {};
    const componentSchemas = {};
    // Generate paths from endpoints
    for (const endpoint of ENDPOINTS) {
        const operation = {
            summary: endpoint.summary,
            description: endpoint.description,
            operationId: endpoint.path.split('/').pop()?.replace(/-/g, '_') || 'unknown',
            tags: endpoint.tags,
            responses: {
                '200': {
                    description: 'Successful response',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    success: { type: 'boolean' },
                                    data: { type: 'object' },
                                },
                            },
                        },
                    },
                },
                '400': { description: 'Bad request' },
                '401': { description: 'Unauthorized' },
                '403': { description: 'Forbidden' },
                '500': { description: 'Internal server error' },
            },
        };
        if (endpoint.requiresAuth) {
            operation.security = [{ bearerAuth: [] }];
        }
        if (endpoint.requestSchema) {
            const schemaName = endpoint.path.split('/').pop()?.replace(/-/g, '_') + '_request';
            componentSchemas[schemaName] = zodToOpenAPI(endpoint.requestSchema);
            operation.requestBody = {
                required: true,
                content: {
                    'application/json': {
                        schema: { $ref: `#/components/schemas/${schemaName}` },
                    },
                },
            };
        }
        if (!paths[endpoint.path]) {
            paths[endpoint.path] = {};
        }
        paths[endpoint.path][endpoint.method] = operation;
    }
    // Add common schemas
    componentSchemas['uuid'] = zodToOpenAPI(schemas.uuidSchema);
    componentSchemas['email'] = zodToOpenAPI(schemas.emailSchema);
    componentSchemas['pagination'] = zodToOpenAPI(schemas.paginationSchema);
    componentSchemas['dateRange'] = zodToOpenAPI(schemas.dateRangeSchema);
    return {
        openapi: '3.0.3',
        info: {
            title: 'EVO UDS API',
            version: '2.0.0',
            description: 'EVO Unified Dashboard System - AWS Security & Cost Management Platform',
        },
        servers: [
            {
                url: 'https://api-evo.ai.udstec.io',
                description: 'Production',
            },
            {
                url: 'http://localhost:3000',
                description: 'Local development',
            },
        ],
        paths,
        components: {
            schemas: componentSchemas,
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'AWS Cognito JWT token',
                },
            },
        },
        tags: [
            { name: 'Admin', description: 'Administrative operations' },
            { name: 'Auth', description: 'Authentication and MFA' },
            { name: 'Security', description: 'Security scanning and compliance' },
            { name: 'Cost', description: 'Cost management and FinOps' },
            { name: 'ML', description: 'Machine learning and anomaly detection' },
            { name: 'Notifications', description: 'Email and notification services' },
            { name: 'Reports', description: 'Report generation' },
            { name: 'Data', description: 'Data queries' },
            { name: 'AI', description: 'AI-powered features' },
        ],
    };
}
/**
 * Export OpenAPI spec as JSON string
 */
function getOpenAPIJSON() {
    return JSON.stringify(generateOpenAPISpec(), null, 2);
}
/**
 * Export OpenAPI spec as YAML string (basic conversion)
 */
function getOpenAPIYAML() {
    const spec = generateOpenAPISpec();
    return jsonToYaml(spec);
}
function jsonToYaml(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    let result = '';
    if (Array.isArray(obj)) {
        for (const item of obj) {
            if (typeof item === 'object' && item !== null) {
                result += `${spaces}-\n${jsonToYaml(item, indent + 1)}`;
            }
            else {
                result += `${spaces}- ${item}\n`;
            }
        }
    }
    else if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
            if (value === undefined)
                continue;
            if (typeof value === 'object' && value !== null) {
                result += `${spaces}${key}:\n${jsonToYaml(value, indent + 1)}`;
            }
            else if (typeof value === 'string' && value.includes('\n')) {
                result += `${spaces}${key}: |\n${value.split('\n').map(l => `${spaces}  ${l}`).join('\n')}\n`;
            }
            else {
                result += `${spaces}${key}: ${JSON.stringify(value)}\n`;
            }
        }
    }
    return result;
}
//# sourceMappingURL=openapi-generator.js.map