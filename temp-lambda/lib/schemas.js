"use strict";
/**
 * Centralized Zod Schemas for Input Validation
 * All handler input schemas should be defined here for consistency
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryTableSchema = exports.createJiraTicketSchema = exports.kbDetailedTrackingSchema = exports.kbArticleTrackingSchema = exports.downloadAttachmentSchema = exports.uploadAttachmentSchema = exports.sendEmailSchema = exports.generateExcelReportSchema = exports.generatePdfReportSchema = exports.autoAlertsSchema = exports.alertRulesSchema = exports.cloudwatchMetricsSchema = exports.aiPrioritizationSchema = exports.detectAnomaliesSchema = exports.finopsCopilotSchema = exports.budgetForecastSchema = exports.costForecastSchema = exports.fetchDailyCostsSchema = exports.sendNotificationSchema = exports.complianceScanSchema = exports.securityScanRequestSchema = exports.updateAwsCredentialsSchema = exports.saveAwsCredentialsSchema = exports.logAuditSchema = exports.manageUserSchema = exports.createUserSchema = exports.webauthnRegisterSchema = exports.mfaUnenrollSchema = exports.mfaVerifySchema = exports.mfaEnrollSchema = exports.mfaSetupSchema = exports.dateRangeSchema = exports.paginationSchema = exports.awsRegionSchema = exports.awsAccountIdSchema = exports.emailSchema = exports.uuidSchema = void 0;
const zod_1 = require("zod");
// ============================================================================
// COMMON SCHEMAS
// ============================================================================
exports.uuidSchema = zod_1.z.string().uuid();
exports.emailSchema = zod_1.z.string().email();
exports.awsAccountIdSchema = zod_1.z.string().regex(/^\d{12}$/, 'AWS Account ID must be 12 digits');
exports.awsRegionSchema = zod_1.z.string().regex(/^[a-z]{2}-[a-z]+-\d$/, 'Invalid AWS region format');
exports.paginationSchema = zod_1.z.object({
    page: zod_1.z.number().int().min(1).default(1),
    limit: zod_1.z.number().int().min(1).max(100).default(20),
});
exports.dateRangeSchema = zod_1.z.object({
    startDate: zod_1.z.string().datetime().optional(),
    endDate: zod_1.z.string().datetime().optional(),
});
// ============================================================================
// AUTH/MFA SCHEMAS
// ============================================================================
exports.mfaSetupSchema = zod_1.z.object({
    action: zod_1.z.enum(['setup', 'verify', 'disable']),
    code: zod_1.z.string().length(6).optional(),
});
exports.mfaEnrollSchema = zod_1.z.object({
    factorType: zod_1.z.enum(['totp', 'sms']),
    friendlyName: zod_1.z.string().max(100).optional(),
});
exports.mfaVerifySchema = zod_1.z.object({
    factorId: exports.uuidSchema,
    code: zod_1.z.string().min(6).max(8),
});
exports.mfaUnenrollSchema = zod_1.z.object({
    factorId: exports.uuidSchema,
});
exports.webauthnRegisterSchema = zod_1.z.object({
    action: zod_1.z.enum(['start', 'finish']),
    userId: zod_1.z.string().optional(),
    deviceName: zod_1.z.string().max(100).optional(),
    attestation: zod_1.z.object({
        id: zod_1.z.string(),
        rawId: zod_1.z.string(),
        type: zod_1.z.string(),
        response: zod_1.z.object({
            clientDataJSON: zod_1.z.string(),
            attestationObject: zod_1.z.string(),
        }),
    }).optional(),
    challenge: zod_1.z.string().optional(),
});
// ============================================================================
// ADMIN SCHEMAS
// ============================================================================
exports.createUserSchema = zod_1.z.object({
    email: exports.emailSchema,
    name: zod_1.z.string().min(2).max(100),
    organizationId: exports.uuidSchema.optional(),
    role: zod_1.z.enum(['ADMIN', 'USER', 'VIEWER', 'AUDITOR']),
    temporaryPassword: zod_1.z.string().min(8).optional(),
    sendInvite: zod_1.z.boolean().default(true),
    metadata: zod_1.z.record(zod_1.z.string()).optional(),
});
exports.manageUserSchema = zod_1.z.object({
    action: zod_1.z.enum(['update', 'delete', 'disable', 'enable', 'reset_password']),
    email: exports.emailSchema,
    attributes: zod_1.z.record(zod_1.z.string()).optional(),
    password: zod_1.z.string().min(8).optional(),
});
exports.logAuditSchema = zod_1.z.object({
    action: zod_1.z.string().min(1).max(100),
    resourceType: zod_1.z.string().min(1).max(50),
    resourceId: zod_1.z.string().min(1).max(100),
    details: zod_1.z.record(zod_1.z.any()).optional(),
});
// ============================================================================
// AWS CREDENTIALS SCHEMAS
// ============================================================================
exports.saveAwsCredentialsSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    accessKeyId: zod_1.z.string().min(16).max(128),
    secretAccessKey: zod_1.z.string().min(16).max(128),
    regions: zod_1.z.array(exports.awsRegionSchema).min(1).default(['us-east-1']),
    roleArn: zod_1.z.string().optional(),
    externalId: zod_1.z.string().optional(),
});
exports.updateAwsCredentialsSchema = zod_1.z.object({
    id: exports.uuidSchema,
    name: zod_1.z.string().min(1).max(100).optional(),
    accessKeyId: zod_1.z.string().min(16).max(128).optional(),
    secretAccessKey: zod_1.z.string().min(16).max(128).optional(),
    regions: zod_1.z.array(exports.awsRegionSchema).optional(),
    isActive: zod_1.z.boolean().optional(),
});
// ============================================================================
// SECURITY SCAN SCHEMAS
// ============================================================================
exports.securityScanRequestSchema = zod_1.z.object({
    accountId: exports.uuidSchema.optional(),
    credentialId: exports.uuidSchema.optional(),
    regions: zod_1.z.array(exports.awsRegionSchema).optional(),
    scanTypes: zod_1.z.array(zod_1.z.string()).optional(),
    frameworks: zod_1.z.array(zod_1.z.enum(['CIS', 'WELL_ARCHITECTED', 'PCI_DSS', 'NIST', 'LGPD', 'SOC2'])).optional(),
});
exports.complianceScanSchema = zod_1.z.object({
    frameworkId: zod_1.z.enum(['cis', 'lgpd', 'pci-dss', 'nist', 'soc2', 'well-architected']),
    scanId: exports.uuidSchema.optional(),
    accountId: exports.uuidSchema.optional(),
});
// ============================================================================
// NOTIFICATION SCHEMAS  
// ============================================================================
exports.sendNotificationSchema = zod_1.z.object({
    channel: zod_1.z.enum(['email', 'slack', 'webhook', 'sms', 'sns']),
    recipient: zod_1.z.string().min(1),
    subject: zod_1.z.string().max(200).optional(),
    message: zod_1.z.string().min(1).max(10000),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
});
// ============================================================================
// COST SCHEMAS
// ============================================================================
exports.fetchDailyCostsSchema = zod_1.z.object({
    accountId: exports.uuidSchema.optional(),
    startDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    granularity: zod_1.z.enum(['DAILY', 'MONTHLY']).default('DAILY'),
    incremental: zod_1.z.boolean().default(true), // Busca incremental por padrão
});
exports.costForecastSchema = zod_1.z.object({
    accountId: exports.uuidSchema.optional(),
    forecastDays: zod_1.z.number().int().min(1).max(365).default(30),
});
exports.budgetForecastSchema = zod_1.z.object({
    accountId: exports.uuidSchema.optional(),
    months: zod_1.z.number().int().min(1).max(12).default(3),
});
exports.finopsCopilotSchema = zod_1.z.object({
    question: zod_1.z.string().min(1).max(1000),
    awsAccountId: exports.uuidSchema,
    context: zod_1.z.enum(['cost', 'optimization', 'forecast', 'comparison', 'general']).default('general'),
    timeRange: zod_1.z.object({
        start: zod_1.z.string(),
        end: zod_1.z.string(),
    }).optional(),
});
// ============================================================================
// ML/ANOMALY SCHEMAS
// ============================================================================
exports.detectAnomaliesSchema = zod_1.z.object({
    awsAccountId: exports.uuidSchema,
    analysisType: zod_1.z.enum(['cost', 'security', 'performance', 'all']).default('all'),
    sensitivity: zod_1.z.enum(['low', 'medium', 'high']).default('medium'),
    lookbackDays: zod_1.z.number().int().min(7).max(90).default(30),
});
exports.aiPrioritizationSchema = zod_1.z.object({
    findingIds: zod_1.z.array(exports.uuidSchema).optional(),
    limit: zod_1.z.number().int().min(1).max(100).default(20),
});
// ============================================================================
// MONITORING SCHEMAS
// ============================================================================
exports.cloudwatchMetricsSchema = zod_1.z.object({
    accountId: exports.uuidSchema.optional(),
    regions: zod_1.z.array(exports.awsRegionSchema).default(['us-east-1']),
});
exports.alertRulesSchema = zod_1.z.object({
    ruleId: exports.uuidSchema.optional(),
});
exports.autoAlertsSchema = zod_1.z.object({
    accountId: exports.uuidSchema.optional(),
});
// ============================================================================
// REPORTS SCHEMAS
// ============================================================================
exports.generatePdfReportSchema = zod_1.z.object({
    reportType: zod_1.z.enum(['security', 'cost', 'compliance', 'executive']),
    scanId: exports.uuidSchema.optional(),
    dateRange: exports.dateRangeSchema.optional(),
});
exports.generateExcelReportSchema = zod_1.z.object({
    reportType: zod_1.z.enum(['findings', 'costs', 'resources', 'compliance']),
    accountId: exports.uuidSchema.optional(),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
});
// sendNotificationSchema já definido acima
exports.sendEmailSchema = zod_1.z.object({
    type: zod_1.z.enum(['single', 'bulk', 'notification', 'alert', 'security', 'welcome', 'password-reset']),
    to: zod_1.z.union([exports.emailSchema, zod_1.z.array(exports.emailSchema)]),
    cc: zod_1.z.union([exports.emailSchema, zod_1.z.array(exports.emailSchema)]).optional(),
    bcc: zod_1.z.union([exports.emailSchema, zod_1.z.array(exports.emailSchema)]).optional(),
    subject: zod_1.z.string().max(200).optional(),
    htmlBody: zod_1.z.string().optional(),
    textBody: zod_1.z.string().optional(),
    template: zod_1.z.string().optional(),
    templateData: zod_1.z.record(zod_1.z.any()).optional(),
    priority: zod_1.z.enum(['high', 'normal', 'low']).default('normal'),
});
// ============================================================================
// STORAGE SCHEMAS
// ============================================================================
exports.uploadAttachmentSchema = zod_1.z.object({
    fileName: zod_1.z.string().min(1).max(255),
    contentType: zod_1.z.string().min(1).max(100),
    content: zod_1.z.string(), // Base64 encoded
    bucket: zod_1.z.string().optional(),
    path: zod_1.z.string().optional(),
});
exports.downloadAttachmentSchema = zod_1.z.object({
    bucket: zod_1.z.string().min(1),
    path: zod_1.z.string().min(1),
});
// ============================================================================
// KNOWLEDGE BASE SCHEMAS
// ============================================================================
exports.kbArticleTrackingSchema = zod_1.z.object({
    article_id: exports.uuidSchema,
});
exports.kbDetailedTrackingSchema = zod_1.z.object({
    p_article_id: exports.uuidSchema,
    p_device_type: zod_1.z.string().max(50).optional(),
    p_reading_time: zod_1.z.number().int().min(0).optional(),
});
// ============================================================================
// INTEGRATIONS SCHEMAS
// ============================================================================
exports.createJiraTicketSchema = zod_1.z.object({
    findingId: exports.uuidSchema,
    title: zod_1.z.string().min(1).max(255),
    description: zod_1.z.string().max(10000).optional(),
    priority: zod_1.z.enum(['Highest', 'High', 'Medium', 'Low', 'Lowest']).default('Medium'),
    issueType: zod_1.z.enum(['Bug', 'Task', 'Story', 'Epic']).default('Bug'),
});
// ============================================================================
// QUERY SCHEMAS
// ============================================================================
exports.queryTableSchema = zod_1.z.object({
    table: zod_1.z.string().min(1).max(50),
    filters: zod_1.z.record(zod_1.z.any()).optional(),
    orderBy: zod_1.z.string().optional(),
    orderDirection: zod_1.z.enum(['asc', 'desc']).default('desc'),
    limit: zod_1.z.number().int().min(1).max(1000).default(100),
    offset: zod_1.z.number().int().min(0).default(0),
});
//# sourceMappingURL=schemas.js.map