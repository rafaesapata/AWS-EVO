/**
 * OpenAPI Documentation Generator from Zod Schemas
 * Automatically generates OpenAPI 3.0 spec from centralized Zod schemas
 * 
 * Features:
 * - Converts Zod schemas to OpenAPI JSON Schema
 * - Generates endpoint documentation
 * - Supports authentication and security schemes
 * 
 * @see https://swagger.io/specification/ for OpenAPI 3.0 spec
 */

import { ZodSchema, ZodObject, ZodString, ZodNumber, ZodBoolean, ZodArray, ZodEnum, ZodOptional, ZodDefault, ZodUnion, ZodNullable, ZodLiteral } from 'zod';
import * as schemas from './schemas.js';
import { VERSION } from './version.js';
import { getApiUrl } from './app-domain.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE_PATH = '/api/functions';
const PRODUCTION_URL = getApiUrl();
const LOCAL_URL = 'http://localhost:3000';
const OPENAPI_VERSION = '3.0.3';
const API_TITLE = 'EVO Platform API';
const API_DESCRIPTION = 'EVO Platform by NuevaCore - Multi-Cloud Security & Cost Management Platform. Supports AWS and Azure.';

/** API Tags for grouping endpoints */
const API_TAGS = {
  ADMIN: 'Admin',
  AUTH: 'Auth',
  SECURITY: 'Security',
  COST: 'Cost',
  ML: 'ML',
  NOTIFICATIONS: 'Notifications',
  REPORTS: 'Reports',
  DATA: 'Data',
  AI: 'AI',
  AZURE: 'Azure',
  DASHBOARD: 'Dashboard',
  LICENSE: 'License',
  KB: 'Knowledge Base',
  STORAGE: 'Storage',
  JOBS: 'Jobs',
  INTEGRATIONS: 'Integrations',
} as const;

type ApiTag = typeof API_TAGS[keyof typeof API_TAGS];

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

/** Map of Zod string check kinds to OpenAPI formats */
const STRING_FORMAT_MAP: Record<string, string> = {
  email: 'email',
  uuid: 'uuid',
  url: 'uri',
  datetime: 'date-time',
  date: 'date',
  time: 'time',
  ip: 'ipv4',
  cuid: 'cuid',
  cuid2: 'cuid2',
  ulid: 'ulid',
};

interface ZodCheck {
  kind: string;
  value?: number;
  regex?: RegExp;
}

/**
 * Convert Zod schema to OpenAPI schema
 * @param schema - Zod schema to convert
 * @returns OpenAPI schema object
 */
function zodToOpenAPI(schema: ZodSchema): OpenAPISchema {
  // Handle nullable wrapper
  if (schema instanceof ZodNullable) {
    const inner = zodToOpenAPI((schema as any)._def.innerType);
    return { ...inner, nullable: true } as OpenAPISchema;
  }

  // Handle literal values
  if (schema instanceof ZodLiteral) {
    const value = (schema as any)._def.value;
    return { 
      type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string',
      enum: [value],
    };
  }

  if (schema instanceof ZodString) {
    const result: OpenAPISchema = { type: 'string' };
    const checks: ZodCheck[] = (schema as any)._def.checks || [];
    
    for (const check of checks) {
      // Map format checks
      if (STRING_FORMAT_MAP[check.kind]) {
        result.format = STRING_FORMAT_MAP[check.kind];
      }
      // Handle length constraints
      if (check.kind === 'min' && check.value !== undefined) result.minLength = check.value;
      if (check.kind === 'max' && check.value !== undefined) result.maxLength = check.value;
      if (check.kind === 'length' && check.value !== undefined) {
        result.minLength = check.value;
        result.maxLength = check.value;
      }
      if (check.kind === 'regex' && check.regex) {
        result.pattern = check.regex.source;
      }
    }
    
    return result;
  }

  if (schema instanceof ZodNumber) {
    const result: OpenAPISchema = { type: 'number' };
    const checks: ZodCheck[] = (schema as any)._def.checks || [];
    
    for (const check of checks) {
      if (check.kind === 'int') result.type = 'integer';
      if (check.kind === 'min' && check.value !== undefined) result.minimum = check.value;
      if (check.kind === 'max' && check.value !== undefined) result.maximum = check.value;
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
      
      // Check if required (not optional and not default)
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
  tags: ApiTag[];
  requestSchema?: ZodSchema;
  responseSchema?: ZodSchema;
  requiresAuth?: boolean;
}

/** Helper to create endpoint path */
const endpoint = (name: string): string => `${API_BASE_PATH}/${name}`;

/**
 * Endpoint definitions organized by category
 * @see .kiro/steering/lambda-functions-reference.md for complete list
 */
const ENDPOINTS: EndpointDefinition[] = [
  // ============================================================================
  // ADMIN
  // ============================================================================
  {
    path: endpoint('admin-manage-user'),
    method: 'post',
    summary: 'Manage user (CRUD operations)',
    description: 'Update, delete, enable, disable, or reset password for users',
    tags: [API_TAGS.ADMIN],
    requestSchema: schemas.manageUserSchema,
    requiresAuth: true,
  },
  {
    path: endpoint('create-cognito-user'),
    method: 'post',
    summary: 'Create Cognito user',
    tags: [API_TAGS.ADMIN],
    requestSchema: schemas.createUserSchema,
    requiresAuth: true,
  },
  {
    path: endpoint('manage-organizations'),
    method: 'post',
    summary: 'Manage organizations (super admin)',
    tags: [API_TAGS.ADMIN],
    requiresAuth: true,
  },
  {
    path: endpoint('deactivate-demo-mode'),
    method: 'post',
    summary: 'Deactivate demo mode for organization',
    tags: [API_TAGS.ADMIN],
    requiresAuth: true,
  },
  {
    path: endpoint('log-audit'),
    method: 'post',
    summary: 'Log audit action',
    tags: [API_TAGS.ADMIN],
    requiresAuth: true,
  },

  // ============================================================================
  // AUTH & MFA
  // ============================================================================
  {
    path: endpoint('mfa-enroll'),
    method: 'post',
    summary: 'Enroll MFA factor (TOTP)',
    tags: [API_TAGS.AUTH],
    requestSchema: schemas.mfaEnrollSchema,
    requiresAuth: true,
  },
  {
    path: endpoint('mfa-check'),
    method: 'post',
    summary: 'Check if user has MFA enabled',
    tags: [API_TAGS.AUTH],
    requiresAuth: true,
  },
  {
    path: endpoint('mfa-challenge-verify'),
    method: 'post',
    summary: 'Verify MFA code during enrollment',
    tags: [API_TAGS.AUTH],
    requestSchema: schemas.mfaVerifySchema,
    requiresAuth: true,
  },
  {
    path: endpoint('mfa-verify-login'),
    method: 'post',
    summary: 'Verify MFA code during login',
    tags: [API_TAGS.AUTH],
    requestSchema: schemas.mfaVerifySchema,
    requiresAuth: true,
  },
  {
    path: endpoint('mfa-list-factors'),
    method: 'post',
    summary: 'List user MFA factors',
    tags: [API_TAGS.AUTH],
    requiresAuth: true,
  },
  {
    path: endpoint('mfa-unenroll'),
    method: 'post',
    summary: 'Remove MFA factor',
    tags: [API_TAGS.AUTH],
    requiresAuth: true,
  },
  {
    path: endpoint('webauthn-register'),
    method: 'post',
    summary: 'Register WebAuthn/Passkey credential',
    tags: [API_TAGS.AUTH],
    requiresAuth: true,
  },
  {
    path: endpoint('webauthn-authenticate'),
    method: 'post',
    summary: 'Authenticate via WebAuthn',
    tags: [API_TAGS.AUTH],
    requiresAuth: true,
  },
  {
    path: endpoint('webauthn-check'),
    method: 'post',
    summary: 'Check if user has WebAuthn enabled',
    tags: [API_TAGS.AUTH],
    requiresAuth: true,
  },
  {
    path: endpoint('self-register'),
    method: 'post',
    summary: 'Self-register new customer (public)',
    description: 'Creates Organization, User, Profile and Trial License',
    tags: [API_TAGS.AUTH],
    requiresAuth: false,
  },

  // ============================================================================
  // SECURITY
  // ============================================================================
  {
    path: endpoint('security-scan'),
    method: 'post',
    summary: 'Run security scan (23 scanners, 170+ checks)',
    tags: [API_TAGS.SECURITY],
    requestSchema: schemas.securityScanRequestSchema,
    requiresAuth: true,
  },
  {
    path: endpoint('start-security-scan'),
    method: 'post',
    summary: 'Start async security scan',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('compliance-scan'),
    method: 'post',
    summary: 'Run compliance scan (7 frameworks)',
    description: 'Supports CIS, LGPD, PCI-DSS, HIPAA, GDPR, SOC2, NIST',
    tags: [API_TAGS.SECURITY],
    requestSchema: schemas.complianceScanSchema,
    requiresAuth: true,
  },
  {
    path: endpoint('start-compliance-scan'),
    method: 'post',
    summary: 'Start async compliance scan',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('get-compliance-scan-status'),
    method: 'post',
    summary: 'Get compliance scan status and progress',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('get-compliance-history'),
    method: 'post',
    summary: 'Get compliance history for trend analysis',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('well-architected-scan'),
    method: 'post',
    summary: 'AWS Well-Architected Framework analysis (6 pillars)',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('guardduty-scan'),
    method: 'post',
    summary: 'GuardDuty integration scan',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('get-findings'),
    method: 'post',
    summary: 'List security findings',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('get-security-posture'),
    method: 'post',
    summary: 'Get security posture overview',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('validate-aws-credentials'),
    method: 'post',
    summary: 'Validate AWS credentials',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('validate-permissions'),
    method: 'post',
    summary: 'Validate IAM permissions',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('iam-deep-analysis'),
    method: 'post',
    summary: 'Deep IAM analysis',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('lateral-movement-detection'),
    method: 'post',
    summary: 'Detect lateral movement threats',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('drift-detection'),
    method: 'post',
    summary: 'Detect configuration drift',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('analyze-cloudtrail'),
    method: 'post',
    summary: 'Analyze CloudTrail events',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },

  // ============================================================================
  // WAF MONITORING
  // ============================================================================
  {
    path: endpoint('waf-setup-monitoring'),
    method: 'post',
    summary: 'Setup WAF cross-account monitoring',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('waf-dashboard-api'),
    method: 'post',
    summary: 'WAF dashboard API (events, metrics, block/unblock)',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },

  // ============================================================================
  // COST & FINOPS
  // ============================================================================
  {
    path: endpoint('fetch-daily-costs'),
    method: 'post',
    summary: 'Fetch daily AWS costs via Cost Explorer',
    tags: [API_TAGS.COST],
    requestSchema: schemas.fetchDailyCostsSchema,
    requiresAuth: true,
  },
  {
    path: endpoint('ri-sp-analyzer'),
    method: 'post',
    summary: 'Analyze Reserved Instances and Savings Plans',
    tags: [API_TAGS.COST],
    requestSchema: schemas.analyzeRiSpSchema,
    requiresAuth: true,
  },
  {
    path: endpoint('get-ri-sp-data'),
    method: 'post',
    summary: 'Get saved RI/SP data from database',
    tags: [API_TAGS.COST],
    requiresAuth: true,
  },
  {
    path: endpoint('cost-optimization'),
    method: 'post',
    summary: 'Get cost optimization recommendations',
    tags: [API_TAGS.COST],
    requiresAuth: true,
  },
  {
    path: endpoint('budget-forecast'),
    method: 'post',
    summary: 'Budget forecast',
    tags: [API_TAGS.COST],
    requiresAuth: true,
  },
  {
    path: endpoint('generate-cost-forecast'),
    method: 'post',
    summary: 'Generate cost forecast',
    tags: [API_TAGS.COST],
    requiresAuth: true,
  },
  {
    path: endpoint('finops-copilot'),
    method: 'post',
    summary: 'FinOps AI Copilot',
    tags: [API_TAGS.COST, API_TAGS.AI],
    requestSchema: schemas.finopsCopilotSchema,
    requiresAuth: true,
  },
  {
    path: endpoint('ml-waste-detection'),
    method: 'post',
    summary: 'ML-powered waste detection',
    tags: [API_TAGS.COST, API_TAGS.ML],
    requiresAuth: true,
  },

  // ============================================================================
  // AI & MACHINE LEARNING
  // ============================================================================
  {
    path: endpoint('bedrock-chat'),
    method: 'post',
    summary: 'Chat with AWS Bedrock (Claude 3.5)',
    tags: [API_TAGS.AI],
    requiresAuth: true,
  },
  {
    path: endpoint('intelligent-alerts-analyzer'),
    method: 'post',
    summary: 'Intelligent alerts analysis',
    tags: [API_TAGS.ML],
    requiresAuth: true,
  },
  {
    path: endpoint('predict-incidents'),
    method: 'post',
    summary: 'Predict incidents with ML',
    tags: [API_TAGS.ML],
    requiresAuth: true,
  },
  {
    path: endpoint('detect-anomalies'),
    method: 'post',
    summary: 'Detect anomalies',
    tags: [API_TAGS.ML],
    requestSchema: schemas.detectAnomaliesSchema,
    requiresAuth: true,
  },
  {
    path: endpoint('get-ai-notifications'),
    method: 'post',
    summary: 'Get proactive AI notifications',
    tags: [API_TAGS.AI],
    requiresAuth: true,
  },
  {
    path: endpoint('update-ai-notification'),
    method: 'post',
    summary: 'Update AI notification status',
    tags: [API_TAGS.AI],
    requiresAuth: true,
  },

  // ============================================================================
  // DASHBOARD & MONITORING
  // ============================================================================
  {
    path: endpoint('get-executive-dashboard'),
    method: 'post',
    summary: 'Get executive dashboard data',
    tags: [API_TAGS.DASHBOARD],
    requiresAuth: true,
  },
  {
    path: endpoint('get-executive-dashboard-public'),
    method: 'post',
    summary: 'Get executive dashboard (TV token auth)',
    tags: [API_TAGS.DASHBOARD],
    requiresAuth: false,
  },
  {
    path: endpoint('manage-tv-tokens'),
    method: 'post',
    summary: 'Manage TV dashboard tokens',
    tags: [API_TAGS.DASHBOARD],
    requiresAuth: true,
  },
  {
    path: endpoint('alerts'),
    method: 'post',
    summary: 'CRUD alerts',
    tags: [API_TAGS.DASHBOARD],
    requiresAuth: true,
  },
  {
    path: endpoint('aws-realtime-metrics'),
    method: 'post',
    summary: 'Get AWS realtime metrics',
    tags: [API_TAGS.DASHBOARD],
    requiresAuth: true,
  },
  {
    path: endpoint('fetch-cloudwatch-metrics'),
    method: 'post',
    summary: 'Fetch CloudWatch metrics',
    tags: [API_TAGS.DASHBOARD],
    requiresAuth: true,
  },
  {
    path: endpoint('fetch-edge-services'),
    method: 'post',
    summary: 'Fetch edge services (CloudFront, etc)',
    tags: [API_TAGS.DASHBOARD],
    requiresAuth: true,
  },
  {
    path: endpoint('get-platform-metrics'),
    method: 'post',
    summary: 'Get platform metrics (114 Lambdas + 111 endpoints)',
    tags: [API_TAGS.DASHBOARD],
    requiresAuth: true,
  },
  {
    path: endpoint('get-recent-errors'),
    method: 'post',
    summary: 'Get recent errors from CloudWatch Logs',
    tags: [API_TAGS.DASHBOARD],
    requiresAuth: true,
  },

  // ============================================================================
  // AWS CREDENTIALS
  // ============================================================================
  {
    path: endpoint('list-aws-credentials'),
    method: 'post',
    summary: 'List AWS credentials',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('save-aws-credentials'),
    method: 'post',
    summary: 'Save AWS credentials (Quick Connect)',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('update-aws-credentials'),
    method: 'post',
    summary: 'Update AWS credentials',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },

  // ============================================================================
  // AZURE MULTI-CLOUD
  // ============================================================================
  {
    path: endpoint('azure-oauth-initiate'),
    method: 'post',
    summary: 'Initiate Azure OAuth flow',
    tags: [API_TAGS.AZURE],
    requiresAuth: true,
  },
  {
    path: endpoint('azure-oauth-callback'),
    method: 'post',
    summary: 'Azure OAuth callback',
    tags: [API_TAGS.AZURE],
    requiresAuth: true,
  },
  {
    path: endpoint('validate-azure-credentials'),
    method: 'post',
    summary: 'Validate Azure credentials',
    tags: [API_TAGS.AZURE],
    requiresAuth: true,
  },
  {
    path: endpoint('save-azure-credentials'),
    method: 'post',
    summary: 'Save Azure credentials',
    tags: [API_TAGS.AZURE],
    requiresAuth: true,
  },
  {
    path: endpoint('list-azure-credentials'),
    method: 'post',
    summary: 'List Azure credentials',
    tags: [API_TAGS.AZURE],
    requiresAuth: true,
  },
  {
    path: endpoint('delete-azure-credentials'),
    method: 'post',
    summary: 'Delete Azure credentials',
    tags: [API_TAGS.AZURE],
    requiresAuth: true,
  },
  {
    path: endpoint('azure-security-scan'),
    method: 'post',
    summary: 'Azure security scan',
    tags: [API_TAGS.AZURE, API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('azure-compliance-scan'),
    method: 'post',
    summary: 'Azure compliance scan (CIS/Azure Benchmark)',
    tags: [API_TAGS.AZURE, API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('azure-cost-optimization'),
    method: 'post',
    summary: 'Azure Advisor cost recommendations',
    tags: [API_TAGS.AZURE, API_TAGS.COST],
    requiresAuth: true,
  },
  {
    path: endpoint('azure-fetch-costs'),
    method: 'post',
    summary: 'Fetch Azure costs',
    tags: [API_TAGS.AZURE, API_TAGS.COST],
    requiresAuth: true,
  },
  {
    path: endpoint('azure-fetch-edge-services'),
    method: 'post',
    summary: 'Fetch Azure edge services (Front Door, App Gateway, etc)',
    tags: [API_TAGS.AZURE],
    requiresAuth: true,
  },
  {
    path: endpoint('list-cloud-credentials'),
    method: 'post',
    summary: 'List unified cloud credentials (AWS + Azure)',
    tags: [API_TAGS.AZURE, API_TAGS.SECURITY],
    requiresAuth: true,
  },

  // ============================================================================
  // LICENSE
  // ============================================================================
  {
    path: endpoint('validate-license'),
    method: 'post',
    summary: 'Validate organization license',
    tags: [API_TAGS.LICENSE],
    requiresAuth: true,
  },
  {
    path: endpoint('configure-license'),
    method: 'post',
    summary: 'Configure license',
    tags: [API_TAGS.LICENSE],
    requiresAuth: true,
  },
  {
    path: endpoint('sync-license'),
    method: 'post',
    summary: 'Sync license with external API',
    tags: [API_TAGS.LICENSE],
    requiresAuth: true,
  },
  {
    path: endpoint('manage-seats'),
    method: 'post',
    summary: 'Manage license seats',
    tags: [API_TAGS.LICENSE],
    requiresAuth: true,
  },

  // ============================================================================
  // KNOWLEDGE BASE
  // ============================================================================
  {
    path: endpoint('kb-analytics-dashboard'),
    method: 'post',
    summary: 'Knowledge base analytics dashboard',
    tags: [API_TAGS.KB],
    requiresAuth: true,
  },
  {
    path: endpoint('kb-ai-suggestions'),
    method: 'post',
    summary: 'AI suggestions for knowledge base',
    tags: [API_TAGS.KB, API_TAGS.AI],
    requiresAuth: true,
  },
  {
    path: endpoint('increment-article-views'),
    method: 'post',
    summary: 'Increment article views',
    tags: [API_TAGS.KB],
    requiresAuth: true,
  },

  // ============================================================================
  // REPORTS
  // ============================================================================
  {
    path: endpoint('generate-pdf-report'),
    method: 'post',
    summary: 'Generate PDF report',
    tags: [API_TAGS.REPORTS],
    requestSchema: schemas.generatePdfReportSchema,
    requiresAuth: true,
  },
  {
    path: endpoint('generate-excel-report'),
    method: 'post',
    summary: 'Generate Excel report',
    tags: [API_TAGS.REPORTS],
    requestSchema: schemas.generateExcelReportSchema,
    requiresAuth: true,
  },
  {
    path: endpoint('generate-security-pdf'),
    method: 'post',
    summary: 'Generate security PDF report',
    tags: [API_TAGS.REPORTS, API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('generate-remediation-script'),
    method: 'post',
    summary: 'Generate remediation script',
    tags: [API_TAGS.REPORTS, API_TAGS.SECURITY],
    requiresAuth: true,
  },

  // ============================================================================
  // DATA
  // ============================================================================
  {
    path: endpoint('query-table'),
    method: 'post',
    summary: 'Query database table (multi-tenant)',
    tags: [API_TAGS.DATA],
    requestSchema: schemas.queryTableSchema,
    requiresAuth: true,
  },
  {
    path: endpoint('mutate-table'),
    method: 'post',
    summary: 'Mutate database table',
    tags: [API_TAGS.DATA],
    requiresAuth: true,
  },
  {
    path: endpoint('ticket-management'),
    method: 'post',
    summary: 'Ticket management (comments, checklist, SLA)',
    tags: [API_TAGS.DATA],
    requiresAuth: true,
  },
  {
    path: endpoint('ticket-attachments'),
    method: 'post',
    summary: 'Ticket attachments (S3 presigned URLs)',
    tags: [API_TAGS.DATA, API_TAGS.STORAGE],
    requiresAuth: true,
  },

  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================
  {
    path: endpoint('send-notification'),
    method: 'post',
    summary: 'Send notification',
    tags: [API_TAGS.NOTIFICATIONS],
    requestSchema: schemas.sendNotificationSchema,
    requiresAuth: true,
  },
  {
    path: endpoint('send-email'),
    method: 'post',
    summary: 'Send email via SES',
    tags: [API_TAGS.NOTIFICATIONS],
    requestSchema: schemas.sendEmailSchema,
    requiresAuth: true,
  },
  {
    path: endpoint('manage-email-preferences'),
    method: 'post',
    summary: 'Manage email preferences',
    tags: [API_TAGS.NOTIFICATIONS],
    requiresAuth: true,
  },

  // ============================================================================
  // STORAGE
  // ============================================================================
  {
    path: endpoint('storage-download'),
    method: 'post',
    summary: 'Download file from S3',
    tags: [API_TAGS.STORAGE],
    requiresAuth: true,
  },
  {
    path: endpoint('storage-delete'),
    method: 'post',
    summary: 'Delete file from S3',
    tags: [API_TAGS.STORAGE],
    requiresAuth: true,
  },
  {
    path: endpoint('upload-attachment'),
    method: 'post',
    summary: 'Upload attachment',
    tags: [API_TAGS.STORAGE],
    requiresAuth: true,
  },

  // ============================================================================
  // JOBS
  // ============================================================================
  {
    path: endpoint('process-background-jobs'),
    method: 'post',
    summary: 'Process background jobs',
    tags: [API_TAGS.JOBS],
    requiresAuth: true,
  },
  {
    path: endpoint('list-background-jobs'),
    method: 'post',
    summary: 'List background jobs',
    tags: [API_TAGS.JOBS],
    requiresAuth: true,
  },
  {
    path: endpoint('execute-scheduled-job'),
    method: 'post',
    summary: 'Execute scheduled job',
    tags: [API_TAGS.JOBS],
    requiresAuth: true,
  },
  {
    path: endpoint('scheduled-scan-executor'),
    method: 'post',
    summary: 'Execute scheduled scans',
    tags: [API_TAGS.JOBS],
    requiresAuth: true,
  },

  // ============================================================================
  // INTEGRATIONS
  // ============================================================================
  {
    path: endpoint('create-jira-ticket'),
    method: 'post',
    summary: 'Create Jira ticket',
    tags: [API_TAGS.INTEGRATIONS],
    requiresAuth: true,
  },

  // ============================================================================
  // ADDITIONAL ADMIN ENDPOINTS
  // ============================================================================
  {
    path: endpoint('disable-cognito-user'),
    method: 'post',
    summary: 'Disable Cognito user',
    tags: [API_TAGS.ADMIN],
    requiresAuth: true,
  },
  {
    path: endpoint('admin-sync-license'),
    method: 'post',
    summary: 'Sync license (admin)',
    tags: [API_TAGS.ADMIN, API_TAGS.LICENSE],
    requiresAuth: true,
  },

  // ============================================================================
  // ADDITIONAL AUTH ENDPOINTS
  // ============================================================================
  {
    path: endpoint('delete-webauthn-credential'),
    method: 'post',
    summary: 'Delete WebAuthn credential',
    tags: [API_TAGS.AUTH],
    requiresAuth: true,
  },
  {
    path: endpoint('verify-tv-token'),
    method: 'post',
    summary: 'Verify TV dashboard token',
    tags: [API_TAGS.AUTH],
    requiresAuth: false,
  },

  // ============================================================================
  // ADDITIONAL SECURITY ENDPOINTS
  // ============================================================================
  {
    path: endpoint('start-cloudtrail-analysis'),
    method: 'post',
    summary: 'Start async CloudTrail analysis',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('fetch-cloudtrail'),
    method: 'post',
    summary: 'Fetch CloudTrail events',
    tags: [API_TAGS.SECURITY],
    requiresAuth: true,
  },

  // ============================================================================
  // ADDITIONAL DASHBOARD ENDPOINTS
  // ============================================================================
  {
    path: endpoint('auto-alerts'),
    method: 'post',
    summary: 'Auto-generated alerts',
    tags: [API_TAGS.DASHBOARD],
    requiresAuth: true,
  },
  {
    path: endpoint('check-alert-rules'),
    method: 'post',
    summary: 'Check alert rules',
    tags: [API_TAGS.DASHBOARD],
    requiresAuth: true,
  },
  {
    path: endpoint('endpoint-monitor-check'),
    method: 'post',
    summary: 'Check monitored endpoints',
    tags: [API_TAGS.DASHBOARD],
    requiresAuth: true,
  },
  {
    path: endpoint('generate-error-fix-prompt'),
    method: 'post',
    summary: 'Generate error fix prompt',
    tags: [API_TAGS.DASHBOARD, API_TAGS.AI],
    requiresAuth: true,
  },

  // ============================================================================
  // ADDITIONAL AI ENDPOINTS
  // ============================================================================
  {
    path: endpoint('anomaly-detection'),
    method: 'post',
    summary: 'Anomaly detection (alias)',
    tags: [API_TAGS.ML],
    requiresAuth: true,
  },
  {
    path: endpoint('send-ai-notification'),
    method: 'post',
    summary: 'Send AI notification (super admin)',
    tags: [API_TAGS.AI],
    requiresAuth: true,
  },
  {
    path: endpoint('list-ai-notifications-admin'),
    method: 'post',
    summary: 'List AI notifications with stats (super admin)',
    tags: [API_TAGS.AI],
    requiresAuth: true,
  },
  {
    path: endpoint('manage-notification-rules'),
    method: 'post',
    summary: 'Manage proactive notification rules (super admin)',
    tags: [API_TAGS.AI],
    requiresAuth: true,
  },

  // ============================================================================
  // ADDITIONAL AZURE ENDPOINTS
  // ============================================================================
  {
    path: endpoint('azure-oauth-refresh'),
    method: 'post',
    summary: 'Refresh Azure OAuth token',
    tags: [API_TAGS.AZURE],
    requiresAuth: true,
  },
  {
    path: endpoint('azure-oauth-revoke'),
    method: 'post',
    summary: 'Revoke Azure OAuth credentials',
    tags: [API_TAGS.AZURE],
    requiresAuth: true,
  },
  {
    path: endpoint('start-azure-security-scan'),
    method: 'post',
    summary: 'Start async Azure security scan',
    tags: [API_TAGS.AZURE, API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('azure-defender-scan'),
    method: 'post',
    summary: 'Microsoft Defender for Cloud scan',
    tags: [API_TAGS.AZURE, API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('azure-well-architected-scan'),
    method: 'post',
    summary: 'Azure Well-Architected Framework scan',
    tags: [API_TAGS.AZURE, API_TAGS.SECURITY],
    requiresAuth: true,
  },
  {
    path: endpoint('azure-reservations-analyzer'),
    method: 'post',
    summary: 'Azure Reserved Instances analysis',
    tags: [API_TAGS.AZURE, API_TAGS.COST],
    requiresAuth: true,
  },
  {
    path: endpoint('azure-resource-inventory'),
    method: 'post',
    summary: 'Azure resource inventory',
    tags: [API_TAGS.AZURE],
    requiresAuth: true,
  },
  {
    path: endpoint('azure-activity-logs'),
    method: 'post',
    summary: 'Azure activity logs',
    tags: [API_TAGS.AZURE],
    requiresAuth: true,
  },
  {
    path: endpoint('azure-fetch-monitor-metrics'),
    method: 'post',
    summary: 'Fetch Azure Monitor metrics',
    tags: [API_TAGS.AZURE, API_TAGS.DASHBOARD],
    requiresAuth: true,
  },
  {
    path: endpoint('azure-detect-anomalies'),
    method: 'post',
    summary: 'Azure anomaly detection',
    tags: [API_TAGS.AZURE, API_TAGS.ML],
    requiresAuth: true,
  },

  // ============================================================================
  // ADDITIONAL LICENSE ENDPOINTS
  // ============================================================================
  {
    path: endpoint('daily-license-validation'),
    method: 'post',
    summary: 'Daily license validation job',
    tags: [API_TAGS.LICENSE],
    requiresAuth: true,
  },

  // ============================================================================
  // ADDITIONAL KB ENDPOINTS
  // ============================================================================
  {
    path: endpoint('kb-export-pdf'),
    method: 'post',
    summary: 'Export KB article to PDF',
    tags: [API_TAGS.KB],
    requiresAuth: true,
  },
  {
    path: endpoint('increment-article-helpful'),
    method: 'post',
    summary: 'Increment article helpful count',
    tags: [API_TAGS.KB],
    requiresAuth: true,
  },
  {
    path: endpoint('track-article-view-detailed'),
    method: 'post',
    summary: 'Track detailed article view',
    tags: [API_TAGS.KB],
    requiresAuth: true,
  },

  // ============================================================================
  // ADDITIONAL REPORTS ENDPOINTS
  // ============================================================================
  {
    path: endpoint('security-scan-pdf-export'),
    method: 'post',
    summary: 'Export security scan to PDF',
    tags: [API_TAGS.REPORTS, API_TAGS.SECURITY],
    requiresAuth: true,
  },

  // ============================================================================
  // ADDITIONAL NOTIFICATIONS ENDPOINTS
  // ============================================================================
  {
    path: endpoint('get-communication-logs'),
    method: 'post',
    summary: 'Get communication logs',
    tags: [API_TAGS.NOTIFICATIONS],
    requiresAuth: true,
  },
  {
    path: endpoint('manage-email-templates'),
    method: 'post',
    summary: 'Manage email templates (super admin)',
    tags: [API_TAGS.NOTIFICATIONS, API_TAGS.ADMIN],
    requiresAuth: true,
  },
  {
    path: endpoint('send-scheduled-emails'),
    method: 'post',
    summary: 'Send scheduled emails job',
    tags: [API_TAGS.NOTIFICATIONS],
    requiresAuth: true,
  },

  // ============================================================================
  // ORGANIZATIONS & PROFILES
  // ============================================================================
  {
    path: endpoint('create-organization-account'),
    method: 'post',
    summary: 'Create organization account',
    tags: [API_TAGS.ADMIN],
    requiresAuth: true,
  },
  {
    path: endpoint('sync-organization-accounts'),
    method: 'post',
    summary: 'Sync organization accounts',
    tags: [API_TAGS.ADMIN],
    requiresAuth: true,
  },
  {
    path: endpoint('check-organization'),
    method: 'post',
    summary: 'Check organization',
    tags: [API_TAGS.ADMIN],
    requiresAuth: true,
  },
  {
    path: endpoint('create-with-organization'),
    method: 'post',
    summary: 'Create user with organization',
    tags: [API_TAGS.ADMIN],
    requiresAuth: true,
  },
  {
    path: endpoint('get-user-organization'),
    method: 'post',
    summary: 'Get user organization',
    tags: [API_TAGS.ADMIN],
    requiresAuth: true,
  },

  // ============================================================================
  // ADDITIONAL MONITORING ENDPOINTS
  // ============================================================================
  {
    path: endpoint('get-lambda-health'),
    method: 'post',
    summary: 'Get Lambda health metrics',
    tags: [API_TAGS.DASHBOARD],
    requiresAuth: true,
  },
  {
    path: endpoint('log-frontend-error'),
    method: 'post',
    summary: 'Log frontend error to CloudWatch',
    tags: [API_TAGS.DASHBOARD],
    requiresAuth: true,
  },

  // ============================================================================
  // ADDITIONAL COST ENDPOINTS
  // ============================================================================
  {
    path: endpoint('get-ri-sp-analysis'),
    method: 'post',
    summary: 'Get RI/SP analysis results',
    tags: [API_TAGS.COST],
    requiresAuth: true,
  },
  {
    path: endpoint('list-ri-sp-history'),
    method: 'post',
    summary: 'List RI/SP analysis history',
    tags: [API_TAGS.COST],
    requiresAuth: true,
  },

  // ============================================================================
  // ADDITIONAL ADMIN ENDPOINTS
  // ============================================================================
  {
    path: endpoint('manage-demo-mode'),
    method: 'post',
    summary: 'Manage demo mode settings',
    tags: [API_TAGS.ADMIN],
    requiresAuth: true,
  },

  // ============================================================================
  // ADDITIONAL AZURE ENDPOINTS
  // ============================================================================
  {
    path: endpoint('validate-azure-permissions'),
    method: 'post',
    summary: 'Validate Azure permissions',
    tags: [API_TAGS.AZURE, API_TAGS.SECURITY],
    requiresAuth: true,
  },
];

// ============================================================================
// GENERATOR
// ============================================================================

/** Standard HTTP error responses */
const STANDARD_ERROR_RESPONSES: Record<string, OpenAPIResponse> = {
  '400': { description: 'Bad request - Invalid input parameters' },
  '401': { description: 'Unauthorized - Missing or invalid authentication' },
  '403': { description: 'Forbidden - Insufficient permissions' },
  '404': { description: 'Not found - Resource does not exist' },
  '429': { description: 'Too many requests - Rate limit exceeded' },
  '500': { description: 'Internal server error' },
};

/**
 * Generate operation ID from endpoint path
 * @example '/api/functions/security-scan' -> 'security_scan'
 */
function generateOperationId(path: string): string {
  const name = path.split('/').pop() || 'unknown';
  return name.replace(/-/g, '_');
}

/**
 * Generate OpenAPI 3.0 specification from endpoint definitions
 */
export function generateOpenAPISpec(): OpenAPISpec {
  const paths: Record<string, OpenAPIPath> = {};
  const componentSchemas: Record<string, OpenAPISchema> = {};

  // Generate paths from endpoints
  for (const endpoint of ENDPOINTS) {
    const operationId = generateOperationId(endpoint.path);
    
    const operation: OpenAPIOperation = {
      summary: endpoint.summary,
      description: endpoint.description,
      operationId,
      tags: endpoint.tags,
      responses: {
        '200': {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', description: 'Operation success status' },
                  data: { type: 'object', description: 'Response data' },
                },
              },
            },
          },
        },
        ...STANDARD_ERROR_RESPONSES,
      },
    };

    if (endpoint.requiresAuth) {
      operation.security = [{ bearerAuth: [] }];
    }

    if (endpoint.requestSchema) {
      const schemaName = `${operationId}_request`;
      componentSchemas[schemaName] = zodToOpenAPI(endpoint.requestSchema);
      
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${schemaName}` } as unknown as OpenAPISchema,
          },
        },
      };
    }

    if (!paths[endpoint.path]) {
      paths[endpoint.path] = {};
    }
    paths[endpoint.path][endpoint.method] = operation;
  }

  // Add common reusable schemas
  componentSchemas['uuid'] = zodToOpenAPI(schemas.uuidSchema);
  componentSchemas['email'] = zodToOpenAPI(schemas.emailSchema);
  componentSchemas['pagination'] = zodToOpenAPI(schemas.paginationSchema);
  componentSchemas['dateRange'] = zodToOpenAPI(schemas.dateRangeSchema);

  // Generate tags with descriptions
  const tags = Object.values(API_TAGS).map(name => ({
    name,
    description: getTagDescription(name),
  }));

  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: API_TITLE,
      version: VERSION,
      description: API_DESCRIPTION,
    },
    servers: [
      { url: PRODUCTION_URL, description: 'Production' },
      { url: LOCAL_URL, description: 'Local development' },
    ],
    paths,
    components: {
      schemas: componentSchemas,
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'AWS Cognito JWT token from Authorization header',
        },
      },
    },
    tags,
  };
}

/**
 * Get description for API tag
 */
function getTagDescription(tag: string): string {
  const descriptions: Record<string, string> = {
    [API_TAGS.ADMIN]: 'Administrative operations (user management, organizations)',
    [API_TAGS.AUTH]: 'Authentication, MFA, and WebAuthn',
    [API_TAGS.SECURITY]: 'Security scanning, compliance, and WAF monitoring',
    [API_TAGS.COST]: 'Cost management, FinOps, and optimization',
    [API_TAGS.ML]: 'Machine learning and anomaly detection',
    [API_TAGS.NOTIFICATIONS]: 'Email and notification services',
    [API_TAGS.REPORTS]: 'Report generation (PDF, Excel)',
    [API_TAGS.DATA]: 'Data queries and ticket management',
    [API_TAGS.AI]: 'AI-powered features (Bedrock, Copilot)',
    [API_TAGS.AZURE]: 'Azure multi-cloud integration',
    [API_TAGS.DASHBOARD]: 'Dashboard and monitoring',
    [API_TAGS.LICENSE]: 'License management',
    [API_TAGS.KB]: 'Knowledge base',
    [API_TAGS.STORAGE]: 'File storage (S3)',
    [API_TAGS.JOBS]: 'Background jobs',
    [API_TAGS.INTEGRATIONS]: 'Third-party integrations (Jira)',
  };
  return descriptions[tag] || tag;
}

/**
 * Export OpenAPI spec as JSON string
 */
export function getOpenAPIJSON(pretty = true): string {
  return JSON.stringify(generateOpenAPISpec(), null, pretty ? 2 : 0);
}

/**
 * Export OpenAPI spec as YAML string
 * Note: For production use, consider using a proper YAML library like 'yaml' or 'js-yaml'
 */
export function getOpenAPIYAML(): string {
  const spec = generateOpenAPISpec();
  return objectToYaml(spec);
}

/**
 * Simple JSON to YAML converter
 * Handles basic types, arrays, and nested objects
 */
function objectToYaml(obj: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);
  
  if (obj === null || obj === undefined) {
    return 'null\n';
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]\n';
    
    return obj.map(item => {
      if (typeof item === 'object' && item !== null) {
        const nested = objectToYaml(item, indent + 1).trimStart();
        return `${spaces}- ${nested}`;
      }
      return `${spaces}- ${formatYamlValue(item)}\n`;
    }).join('');
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}\n';
    
    return entries.map(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        return `${spaces}${key}:\n${objectToYaml(value, indent + 1)}`;
      }
      return `${spaces}${key}: ${formatYamlValue(value)}\n`;
    }).join('');
  }

  return `${formatYamlValue(obj)}\n`;
}

/**
 * Format a primitive value for YAML output
 */
function formatYamlValue(value: unknown): string {
  if (typeof value === 'string') {
    // Quote strings that contain special characters or look like other types
    if (value.includes('\n')) {
      return `|\n${value.split('\n').map(l => `  ${l}`).join('\n')}`;
    }
    if (/^[{[\]#&*!|>'"%@`]|: |:\s*$/.test(value) || value === '' || value === 'true' || value === 'false' || value === 'null' || !isNaN(Number(value))) {
      return JSON.stringify(value);
    }
    return value;
  }
  return JSON.stringify(value);
}

/**
 * Get total endpoint count
 */
export function getEndpointCount(): number {
  return ENDPOINTS.length;
}

/**
 * Get endpoints by tag
 */
export function getEndpointsByTag(tag: ApiTag): EndpointDefinition[] {
  return ENDPOINTS.filter(e => e.tags.includes(tag));
}
