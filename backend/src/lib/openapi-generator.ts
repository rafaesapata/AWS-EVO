/**
 * OpenAPI Documentation Generator from Zod Schemas
 * Automatically generates OpenAPI 3.0 spec from centralized Zod schemas
 * 
 * Features:
 * - Converts Zod schemas to OpenAPI JSON Schema
 * - Generates endpoint documentation
 * - Supports authentication and security schemes
 */

import { ZodSchema, ZodObject, ZodString, ZodNumber, ZodBoolean, ZodArray, ZodEnum, ZodOptional, ZodDefault, ZodUnion } from 'zod';
import * as schemas from './schemas.js';

// ============================================================================
// TYPES
// ============================================================================

interface OpenAPISchema {
  type?: string;
  format?: string;
  properties?: Record<string, OpenAPISchema>;
  required?: string[];
  items?: OpenAPISchema;
  enum?: string[];
  description?: string;
  default?: any;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  oneOf?: OpenAPISchema[];
}

interface OpenAPIParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required?: boolean;
  schema: OpenAPISchema;
  description?: string;
}

interface OpenAPIRequestBody {
  required?: boolean;
  content: {
    'application/json': {
      schema: OpenAPISchema;
    };
  };
}

interface OpenAPIResponse {
  description: string;
  content?: {
    'application/json': {
      schema: OpenAPISchema;
    };
  };
}

interface OpenAPIOperation {
  summary: string;
  description?: string;
  operationId: string;
  tags?: string[];
  security?: Array<Record<string, string[]>>;
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: Record<string, OpenAPIResponse>;
}

interface OpenAPIPath {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  options?: OpenAPIOperation;
}

interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers: Array<{ url: string; description?: string }>;
  paths: Record<string, OpenAPIPath>;
  components: {
    schemas: Record<string, OpenAPISchema>;
    securitySchemes: Record<string, any>;
  };
  tags?: Array<{ name: string; description?: string }>;
}

// ============================================================================
// ZOD TO OPENAPI CONVERTER
// ============================================================================

function zodToOpenAPI(schema: ZodSchema): OpenAPISchema {
  if (schema instanceof ZodString) {
    const result: OpenAPISchema = { type: 'string' };
    const checks = (schema as any)._def.checks || [];
    
    for (const check of checks) {
      if (check.kind === 'email') result.format = 'email';
      if (check.kind === 'uuid') result.format = 'uuid';
      if (check.kind === 'url') result.format = 'uri';
      if (check.kind === 'datetime') result.format = 'date-time';
      if (check.kind === 'min') result.minLength = check.value;
      if (check.kind === 'max') result.maxLength = check.value;
      if (check.kind === 'length') {
        result.minLength = check.value;
        result.maxLength = check.value;
      }
      if (check.kind === 'regex') result.pattern = check.regex.source;
    }
    
    return result;
  }

  if (schema instanceof ZodNumber) {
    const result: OpenAPISchema = { type: 'number' };
    const checks = (schema as any)._def.checks || [];
    
    for (const check of checks) {
      if (check.kind === 'int') result.type = 'integer';
      if (check.kind === 'min') result.minimum = check.value;
      if (check.kind === 'max') result.maximum = check.value;
    }
    
    return result;
  }

  if (schema instanceof ZodBoolean) {
    return { type: 'boolean' };
  }

  if (schema instanceof ZodArray) {
    return {
      type: 'array',
      items: zodToOpenAPI((schema as any)._def.type),
    };
  }

  if (schema instanceof ZodEnum) {
    return {
      type: 'string',
      enum: (schema as any)._def.values,
    };
  }

  if (schema instanceof ZodOptional) {
    return zodToOpenAPI((schema as any)._def.innerType);
  }

  if (schema instanceof ZodDefault) {
    const inner = zodToOpenAPI((schema as any)._def.innerType);
    inner.default = (schema as any)._def.defaultValue();
    return inner;
  }

  if (schema instanceof ZodUnion) {
    return {
      oneOf: (schema as any)._def.options.map((opt: ZodSchema) => zodToOpenAPI(opt)),
    };
  }

  if (schema instanceof ZodObject) {
    const shape = (schema as any)._def.shape();
    const properties: Record<string, OpenAPISchema> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToOpenAPI(value as ZodSchema);
      
      // Check if required (not optional)
      if (!(value instanceof ZodOptional) && !(value instanceof ZodDefault)) {
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

// ============================================================================
// ENDPOINT DEFINITIONS
// ============================================================================

interface EndpointDefinition {
  path: string;
  method: 'get' | 'post' | 'put' | 'delete';
  summary: string;
  description?: string;
  tags: string[];
  requestSchema?: ZodSchema;
  responseSchema?: ZodSchema;
  requiresAuth?: boolean;
}

const ENDPOINTS: EndpointDefinition[] = [
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

export function generateOpenAPISpec(): OpenAPISpec {
  const paths: Record<string, OpenAPIPath> = {};
  const componentSchemas: Record<string, OpenAPISchema> = {};

  // Generate paths from endpoints
  for (const endpoint of ENDPOINTS) {
    const operation: OpenAPIOperation = {
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
            schema: { $ref: `#/components/schemas/${schemaName}` } as any,
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
export function getOpenAPIJSON(): string {
  return JSON.stringify(generateOpenAPISpec(), null, 2);
}

/**
 * Export OpenAPI spec as YAML string (basic conversion)
 */
export function getOpenAPIYAML(): string {
  const spec = generateOpenAPISpec();
  return jsonToYaml(spec);
}

function jsonToYaml(obj: any, indent: number = 0): string {
  const spaces = '  '.repeat(indent);
  let result = '';

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        result += `${spaces}-\n${jsonToYaml(item, indent + 1)}`;
      } else {
        result += `${spaces}- ${item}\n`;
      }
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;
      
      if (typeof value === 'object' && value !== null) {
        result += `${spaces}${key}:\n${jsonToYaml(value, indent + 1)}`;
      } else if (typeof value === 'string' && value.includes('\n')) {
        result += `${spaces}${key}: |\n${value.split('\n').map(l => `${spaces}  ${l}`).join('\n')}\n`;
      } else {
        result += `${spaces}${key}: ${JSON.stringify(value)}\n`;
      }
    }
  }

  return result;
}
