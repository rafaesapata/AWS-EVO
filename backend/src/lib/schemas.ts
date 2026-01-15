/**
 * Centralized Zod Schemas for Input Validation
 * All handler input schemas should be defined here for consistency
 */

import { z } from 'zod';

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email();
export const awsAccountIdSchema = z.string().regex(/^\d{12}$/, 'AWS Account ID must be 12 digits');
export const awsRegionSchema = z.string().regex(/^[a-z]{2}-[a-z]+-\d$/, 'Invalid AWS region format');

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// ============================================================================
// AUTH/MFA SCHEMAS
// ============================================================================

export const mfaSetupSchema = z.object({
  action: z.enum(['setup', 'verify', 'disable']),
  code: z.string().length(6).optional(),
});

export const mfaEnrollSchema = z.object({
  factorType: z.enum(['totp', 'sms']),
  friendlyName: z.string().max(100).optional(),
  accessToken: z.string().min(1).optional(), // Required for Cognito MFA enrollment
});

export const mfaVerifySchema = z.object({
  factorId: uuidSchema,
  code: z.string().min(6).max(8),
  accessToken: z.string().min(1).optional(), // Required for Cognito MFA verification
});

export const mfaUnenrollSchema = z.object({
  factorId: uuidSchema,
});

export const webauthnRegisterSchema = z.object({
  action: z.enum(['start', 'finish']),
  userId: z.string().optional(),
  deviceName: z.string().max(100).optional(),
  attestation: z.object({
    id: z.string(),
    rawId: z.string(),
    type: z.string(),
    response: z.object({
      clientDataJSON: z.string(),
      attestationObject: z.string(),
    }),
  }).optional(),
  challenge: z.string().optional(),
});

// ============================================================================
// ADMIN SCHEMAS
// ============================================================================

export const createUserSchema = z.object({
  email: emailSchema,
  name: z.string().min(2).max(100),
  organizationId: uuidSchema.optional(),
  role: z.enum(['ADMIN', 'USER', 'VIEWER', 'AUDITOR']),
  temporaryPassword: z.string().min(8).optional(),
  sendInvite: z.boolean().default(true),
  metadata: z.record(z.string()).optional(),
});

export const manageUserSchema = z.object({
  action: z.enum(['update', 'delete', 'disable', 'enable', 'reset_password', 'update_organization']),
  email: emailSchema,
  attributes: z.record(z.any()).optional(),
  password: z.string().min(8).optional(),
});

export const logAuditSchema = z.object({
  action: z.string().min(1).max(100),
  resourceType: z.string().min(1).max(50),
  resourceId: z.string().min(1).max(100),
  details: z.record(z.any()).optional(),
});

// ============================================================================
// AWS CREDENTIALS SCHEMAS
// ============================================================================

export const saveAwsCredentialsSchema = z.object({
  name: z.string().min(1).max(100),
  accessKeyId: z.string().min(16).max(128),
  secretAccessKey: z.string().min(16).max(128),
  regions: z.array(awsRegionSchema).min(1).default(['us-east-1']),
  roleArn: z.string().optional(),
  externalId: z.string().optional(),
});

export const updateAwsCredentialsSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(100).optional(),
  accessKeyId: z.string().min(16).max(128).optional(),
  secretAccessKey: z.string().min(16).max(128).optional(),
  regions: z.array(awsRegionSchema).optional(),
  isActive: z.boolean().optional(),
});

// ============================================================================
// SECURITY SCAN SCHEMAS
// ============================================================================

export const securityScanRequestSchema = z.object({
  accountId: uuidSchema.optional(),
  credentialId: uuidSchema.optional(),
  regions: z.array(awsRegionSchema).optional(),
  scanTypes: z.array(z.string()).optional(),
  frameworks: z.array(z.enum(['CIS', 'WELL_ARCHITECTED', 'PCI_DSS', 'NIST', 'LGPD', 'SOC2'])).optional(),
});

export const complianceScanSchema = z.object({
  frameworkId: z.enum(['cis', 'lgpd', 'pci-dss', 'nist', 'soc2', 'hipaa', 'gdpr', 'well-architected']),
  scanId: uuidSchema.optional(),
  accountId: uuidSchema.optional(),
  jobId: uuidSchema.optional(), // For async scan progress tracking
});

// ============================================================================
// NOTIFICATION SCHEMAS  
// ============================================================================

export const sendNotificationSchema = z.object({
  channel: z.enum(['email', 'slack', 'webhook', 'sms', 'sns']),
  recipient: z.string().min(1),
  subject: z.string().max(200).optional(),
  message: z.string().min(1).max(10000),
  metadata: z.record(z.any()).optional(),
});

// ============================================================================
// COST SCHEMAS
// ============================================================================

export const fetchDailyCostsSchema = z.object({
  accountId: uuidSchema.optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  granularity: z.enum(['DAILY', 'MONTHLY']).default('DAILY'),
  incremental: z.boolean().default(true), // Busca incremental por padrão
});

export const analyzeRiSpSchema = z.object({
  accountId: uuidSchema,
  analysisType: z.enum(['all', 'ri', 'sp', 'recommendations']).default('all'),
  lookbackDays: z.number().int().min(7).max(90).default(30),
});

export const costForecastSchema = z.object({
  accountId: uuidSchema.optional(),
  forecastDays: z.number().int().min(1).max(365).default(30),
});

export const budgetForecastSchema = z.object({
  accountId: uuidSchema.optional(),
  months: z.number().int().min(1).max(12).default(3),
});

export const finopsCopilotSchema = z.object({
  question: z.string().min(1).max(1000),
  awsAccountId: uuidSchema,
  context: z.enum(['cost', 'optimization', 'forecast', 'comparison', 'general']).default('general'),
  timeRange: z.object({
    start: z.string(),
    end: z.string(),
  }).optional(),
});

// ============================================================================
// ML/ANOMALY SCHEMAS
// ============================================================================

export const detectAnomaliesSchema = z.object({
  awsAccountId: uuidSchema,
  analysisType: z.enum(['cost', 'security', 'performance', 'all']).default('all'),
  sensitivity: z.enum(['low', 'medium', 'high']).default('medium'),
  lookbackDays: z.number().int().min(7).max(90).default(30),
});

export const aiPrioritizationSchema = z.object({
  findingIds: z.array(uuidSchema).optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

// ============================================================================
// MONITORING SCHEMAS
// ============================================================================

export const cloudwatchMetricsSchema = z.object({
  accountId: uuidSchema.optional(),
  regions: z.array(awsRegionSchema).default(['us-east-1']),
});

export const alertRulesSchema = z.object({
  ruleId: uuidSchema.optional(),
});

export const autoAlertsSchema = z.object({
  accountId: uuidSchema.optional(),
});

// ============================================================================
// REPORTS SCHEMAS
// ============================================================================

export const generatePdfReportSchema = z.object({
  reportType: z.enum(['security', 'cost', 'compliance', 'executive']),
  scanId: uuidSchema.optional(),
  dateRange: dateRangeSchema.optional(),
});

export const generateExcelReportSchema = z.object({
  reportType: z.enum(['findings', 'costs', 'resources', 'compliance']),
  accountId: uuidSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// sendNotificationSchema já definido acima

export const sendEmailSchema = z.object({
  type: z.enum(['single', 'bulk', 'notification', 'alert', 'security', 'welcome', 'password-reset']),
  to: z.union([emailSchema, z.array(emailSchema)]),
  cc: z.union([emailSchema, z.array(emailSchema)]).optional(),
  bcc: z.union([emailSchema, z.array(emailSchema)]).optional(),
  subject: z.string().max(200).optional(),
  htmlBody: z.string().optional(),
  textBody: z.string().optional(),
  template: z.string().optional(),
  templateData: z.record(z.any()).optional(),
  priority: z.enum(['high', 'normal', 'low']).default('normal'),
});

// ============================================================================
// STORAGE SCHEMAS
// ============================================================================

export const uploadAttachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  content: z.string(), // Base64 encoded
  bucket: z.string().optional(),
  path: z.string().optional(),
});

export const downloadAttachmentSchema = z.object({
  bucket: z.string().min(1),
  path: z.string().min(1),
});

// ============================================================================
// KNOWLEDGE BASE SCHEMAS
// ============================================================================

export const kbArticleTrackingSchema = z.object({
  article_id: uuidSchema,
});

export const kbDetailedTrackingSchema = z.object({
  p_article_id: uuidSchema,
  p_device_type: z.string().max(50).optional(),
  p_reading_time: z.number().int().min(0).optional(),
});

// ============================================================================
// INTEGRATIONS SCHEMAS
// ============================================================================

export const createJiraTicketSchema = z.object({
  findingId: uuidSchema,
  title: z.string().min(1).max(255),
  description: z.string().max(10000).optional(),
  priority: z.enum(['Highest', 'High', 'Medium', 'Low', 'Lowest']).default('Medium'),
  issueType: z.enum(['Bug', 'Task', 'Story', 'Epic']).default('Bug'),
});

// ============================================================================
// QUERY SCHEMAS
// ============================================================================

export const queryTableSchema = z.object({
  table: z.string().min(1).max(50),
  filters: z.record(z.any()).optional(),
  orderBy: z.string().optional(),
  orderDirection: z.enum(['asc', 'desc']).default('desc'),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ManageUserInput = z.infer<typeof manageUserSchema>;
export type SecurityScanInput = z.infer<typeof securityScanRequestSchema>;
export type FetchDailyCostsInput = z.infer<typeof fetchDailyCostsSchema>;
export type AnalyzeRiSpInput = z.infer<typeof analyzeRiSpSchema>;
export type DetectAnomaliesInput = z.infer<typeof detectAnomaliesSchema>;
export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;
export type QueryTableInput = z.infer<typeof queryTableSchema>;
export type FinopsCopilotInput = z.infer<typeof finopsCopilotSchema>;
