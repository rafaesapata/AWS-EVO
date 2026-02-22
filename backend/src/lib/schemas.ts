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
  services: z.array(z.string()).optional(), // Filter by service names (from tag-cost-services)
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
  reportType: z.enum(['security', 'cost', 'compliance', 'executive', 'inventory']),
  scanId: uuidSchema.optional(),
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }).optional(),
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
  htmlBody: z.string().max(100000).optional(),
  textBody: z.string().max(50000).optional(),
  template: z.string().max(100).optional(),
  templateData: z.record(z.any()).optional(),
  priority: z.enum(['high', 'normal', 'low']).default('normal'),
  tags: z.record(z.string()).optional(),
  alertData: z.object({
    id: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    metric: z.string(),
    currentValue: z.number(),
    threshold: z.number(),
    message: z.string(),
    timestamp: z.string(),
  }).optional(),
  securityEvent: z.object({
    type: z.string(),
    description: z.string(),
    timestamp: z.string(),
    sourceIp: z.string().optional(),
    userAgent: z.string().optional(),
    userId: z.string().optional(),
  }).optional(),
  welcomeData: z.object({
    name: z.string(),
    organizationName: z.string(),
    loginUrl: z.string().url(),
  }).optional(),
  resetData: z.object({
    name: z.string(),
    resetUrl: z.string().url(),
    expiresIn: z.string(),
  }).optional(),
  notificationData: z.object({
    message: z.string(),
    severity: z.enum(['info', 'warning', 'error', 'critical']).optional(),
  }).optional(),
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
// ALERTS SCHEMAS
// ============================================================================

export const alertsQuerySchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  status: z.enum(['active', 'acknowledged', 'resolved']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const alertUpdateSchema = z.object({
  id: uuidSchema,
  action: z.enum(['acknowledge', 'resolve']),
});

export const alertDeleteSchema = z.object({
  id: uuidSchema,
});

// ============================================================================
// MONITORED ENDPOINTS SCHEMAS
// ============================================================================

export const createMonitoredEndpointSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  timeout: z.number().int().min(1000).max(60000).default(5000),
  is_active: z.boolean().default(true),
  alert_on_failure: z.boolean().default(true),
  monitor_ssl: z.boolean().default(true),
  ssl_alert_days: z.number().int().min(1).max(365).default(30),
});

export const updateMonitoredEndpointSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  timeout: z.number().int().min(1000).max(60000).optional(),
  is_active: z.boolean().optional(),
  alert_on_failure: z.boolean().optional(),
  monitor_ssl: z.boolean().optional(),
  ssl_alert_days: z.number().int().min(1).max(365).optional(),
});

export const deleteMonitoredEndpointSchema = z.object({
  id: uuidSchema,
});

// ============================================================================
// TV TOKENS SCHEMAS
// ============================================================================

export const manageTvTokensSchema = z.object({
  action: z.enum(['list', 'create', 'toggle', 'delete']),
  tokenId: uuidSchema.optional(),
  name: z.string().min(1).max(100).optional(),
  expirationDays: z.number().int().min(1).max(365).default(30),
  isActive: z.boolean().optional(),
});

// ============================================================================
// REALTIME METRICS SCHEMAS
// ============================================================================

export const realtimeMetricsSchema = z.object({
  accountId: uuidSchema.optional(),
  regions: z.array(awsRegionSchema).optional(),
  services: z.array(z.string()).optional(),
  timeRange: z.enum(['1h', '3h', '6h', '12h', '24h', '7d']).default('1h'),
});

// ============================================================================
// COMMUNICATION LOGS SCHEMAS
// ============================================================================

export const communicationLogsQuerySchema = z.object({
  type: z.enum(['email', 'sms', 'webhook', 'all']).default('all'),
  status: z.enum(['sent', 'failed', 'pending', 'all']).default('all'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ============================================================================
// SECURITY SCAN PDF EXPORT SCHEMAS
// ============================================================================

export const securityScanPdfExportSchema = z.object({
  scanId: uuidSchema,
  includeRemediation: z.boolean().default(true),
  includeSummary: z.boolean().default(true),
  language: z.enum(['en', 'pt']).default('en'),
});

// ============================================================================
// GENERATE REMEDIATION SCRIPT SCHEMAS
// ============================================================================

export const generateRemediationScriptSchema = z.object({
  findingIds: z.array(uuidSchema).min(1).max(50),
  format: z.enum(['bash', 'powershell', 'terraform', 'cloudformation']).default('bash'),
  includeComments: z.boolean().default(true),
});

// ============================================================================
// GENERATE SECURITY PDF SCHEMAS
// ============================================================================

export const generateSecurityPdfSchema = z.object({
  scanId: uuidSchema.optional(),
  accountId: uuidSchema.optional(),
  dateRange: dateRangeSchema.optional(),
  includeFindings: z.boolean().default(true),
  includeCompliance: z.boolean().default(true),
  includeRecommendations: z.boolean().default(true),
});

// ============================================================================
// RI/SP ANALYZER SCHEMAS
// ============================================================================

export const riSpAnalyzerSchema = z.object({
  accountId: uuidSchema,
  region: awsRegionSchema.optional(),
  regions: z.array(awsRegionSchema).optional(),
  analysisDepth: z.enum(['basic', 'detailed', 'comprehensive']).default('comprehensive'),
});

// ============================================================================
// JIRA INTEGRATION SCHEMAS
// ============================================================================

export const createJiraTicketFullSchema = z.object({
  findingId: uuidSchema,
  title: z.string().min(1).max(255),
  description: z.string().max(10000).optional(),
  priority: z.enum(['Highest', 'High', 'Medium', 'Low', 'Lowest']).default('Medium'),
  issueType: z.enum(['Bug', 'Task', 'Story', 'Epic']).default('Bug'),
  projectKey: z.string().min(1).max(20).optional(),
  labels: z.array(z.string().max(50)).max(10).optional(),
  assignee: z.string().max(100).optional(),
});

// ============================================================================
// SCHEDULED JOB SCHEMAS
// ============================================================================

export const executeScheduledJobSchema = z.object({
  jobId: uuidSchema,
  force: z.boolean().default(false),
});

// ============================================================================
// NOTIFICATION SETTINGS SCHEMAS
// ============================================================================

export const notificationSettingsSchema = z.object({
  action: z.enum(['get', 'update']),
  settings: z.object({
    email_enabled: z.boolean().optional(),
    slack_enabled: z.boolean().optional(),
    webhook_enabled: z.boolean().optional(),
    security_alerts: z.boolean().optional(),
    cost_alerts: z.boolean().optional(),
    compliance_alerts: z.boolean().optional(),
    daily_digest: z.boolean().optional(),
    weekly_report: z.boolean().optional(),
    alert_threshold: z.enum(['all', 'high', 'critical']).optional(),
  }).optional(),
});

// ============================================================================
// AI INSIGHTS SCHEMAS
// ============================================================================

export const generateAiInsightsSchema = z.object({
  accountId: uuidSchema.optional(),
  insightType: z.enum(['cost', 'security', 'performance', 'all']).default('all'),
  timeRange: z.enum(['7d', '30d', '90d']).default('30d'),
  maxInsights: z.number().int().min(1).max(20).default(10),
});

// ============================================================================
// FETCH EDGE SERVICES SCHEMAS
// ============================================================================

export const fetchEdgeServicesSchema = z.object({
  accountId: uuidSchema.optional(),
  regions: z.array(awsRegionSchema).optional(),
  services: z.array(z.enum(['cloudfront', 'route53', 'waf', 'shield', 'globalaccelerator'])).optional(),
});

// ============================================================================
// AUTO ALERTS SCHEMAS
// ============================================================================

export const autoAlertsRequestSchema = z.object({
  accountId: uuidSchema.optional(),
  enabled: z.boolean().optional(),
  thresholds: z.object({
    cpu: z.number().min(0).max(100).optional(),
    memory: z.number().min(0).max(100).optional(),
    disk: z.number().min(0).max(100).optional(),
    cost: z.number().min(0).optional(),
  }).optional(),
});

// ============================================================================
// ENDPOINT MONITOR CHECK SCHEMAS
// ============================================================================

export const endpointMonitorCheckSchema = z.object({
  endpointId: uuidSchema.optional(),
  forceCheck: z.boolean().default(false),
});

// ============================================================================
// CHECK ALERT RULES SCHEMAS
// ============================================================================

export const checkAlertRulesSchema = z.object({
  ruleId: uuidSchema.optional(),
  dryRun: z.boolean().default(false),
});

// ============================================================================
// FETCH CLOUDWATCH METRICS SCHEMAS
// ============================================================================

export const fetchCloudwatchMetricsSchema = z.object({
  accountId: uuidSchema.optional(),
  regions: z.array(awsRegionSchema).default(['us-east-1']),
  namespace: z.string().optional(),
  metricName: z.string().optional(),
  dimensions: z.array(z.object({
    Name: z.string(),
    Value: z.string(),
  })).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  period: z.number().int().min(60).max(86400).default(300),
  statistics: z.array(z.enum(['Average', 'Sum', 'Minimum', 'Maximum', 'SampleCount'])).default(['Average']),
});

// ============================================================================
// LOG FRONTEND ERROR SCHEMAS
// ============================================================================

export const logFrontendErrorSchema = z.object({
  error: z.string().min(1).max(5000),
  stack: z.string().max(10000).optional(),
  url: z.string().url().optional(),
  userAgent: z.string().max(500).optional(),
  timestamp: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});

// ============================================================================
// CREATE WITH ORGANIZATION SCHEMAS
// ============================================================================

export const createWithOrganizationSchema = z.object({
  email: emailSchema,
  name: z.string().min(2).max(100),
  organizationName: z.string().min(2).max(100),
  role: z.enum(['admin', 'user', 'viewer']).default('admin'),
});

// ============================================================================
// GET USER ORGANIZATION SCHEMAS
// ============================================================================

export const getUserOrganizationSchema = z.object({
  userId: z.string().optional(),
  includeMembers: z.boolean().default(false),
});

// ============================================================================
// SYNC RESOURCE INVENTORY SCHEMAS
// ============================================================================

export const syncResourceInventorySchema = z.object({
  accountId: uuidSchema,
  regions: z.array(awsRegionSchema).optional(),
  services: z.array(z.string()).optional(),
  fullSync: z.boolean().default(false),
});

// ============================================================================
// SAVE RI/SP ANALYSIS SCHEMAS
// ============================================================================

export const saveRiSpAnalysisSchema = z.object({
  accountId: uuidSchema,
  analysisData: z.object({
    reservedInstances: z.array(z.any()).optional(),
    savingsPlans: z.array(z.any()).optional(),
    recommendations: z.array(z.any()).optional(),
    coverage: z.object({
      ri: z.number().min(0).max(100).optional(),
      sp: z.number().min(0).max(100).optional(),
    }).optional(),
  }),
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
export type AlertUpdateInput = z.infer<typeof alertUpdateSchema>;
export type CreateMonitoredEndpointInput = z.infer<typeof createMonitoredEndpointSchema>;
export type UpdateMonitoredEndpointInput = z.infer<typeof updateMonitoredEndpointSchema>;
export type ManageTvTokensInput = z.infer<typeof manageTvTokensSchema>;
export type RiSpAnalyzerInput = z.infer<typeof riSpAnalyzerSchema>;
export type CreateJiraTicketInput = z.infer<typeof createJiraTicketFullSchema>;
