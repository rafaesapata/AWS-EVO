/**
 * Centralized Zod Schemas for Input Validation
 * All handler input schemas should be defined here for consistency
 */
import { z } from 'zod';
export declare const uuidSchema: z.ZodString;
export declare const emailSchema: z.ZodString;
export declare const awsAccountIdSchema: z.ZodString;
export declare const awsRegionSchema: z.ZodString;
export declare const paginationSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
}, {
    page?: number | undefined;
    limit?: number | undefined;
}>;
export declare const dateRangeSchema: z.ZodObject<{
    startDate: z.ZodOptional<z.ZodString>;
    endDate: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    startDate?: string | undefined;
    endDate?: string | undefined;
}, {
    startDate?: string | undefined;
    endDate?: string | undefined;
}>;
export declare const mfaSetupSchema: z.ZodObject<{
    action: z.ZodEnum<["setup", "verify", "disable"]>;
    code: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "setup" | "verify" | "disable";
    code?: string | undefined;
}, {
    action: "setup" | "verify" | "disable";
    code?: string | undefined;
}>;
export declare const mfaEnrollSchema: z.ZodObject<{
    factorType: z.ZodEnum<["totp", "sms"]>;
    friendlyName: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    factorType: "totp" | "sms";
    friendlyName?: string | undefined;
}, {
    factorType: "totp" | "sms";
    friendlyName?: string | undefined;
}>;
export declare const mfaVerifySchema: z.ZodObject<{
    factorId: z.ZodString;
    code: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
    factorId: string;
}, {
    code: string;
    factorId: string;
}>;
export declare const mfaUnenrollSchema: z.ZodObject<{
    factorId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    factorId: string;
}, {
    factorId: string;
}>;
export declare const webauthnRegisterSchema: z.ZodObject<{
    action: z.ZodEnum<["start", "finish"]>;
    userId: z.ZodOptional<z.ZodString>;
    deviceName: z.ZodOptional<z.ZodString>;
    attestation: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        rawId: z.ZodString;
        type: z.ZodString;
        response: z.ZodObject<{
            clientDataJSON: z.ZodString;
            attestationObject: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            clientDataJSON: string;
            attestationObject: string;
        }, {
            clientDataJSON: string;
            attestationObject: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        id: string;
        rawId: string;
        response: {
            clientDataJSON: string;
            attestationObject: string;
        };
    }, {
        type: string;
        id: string;
        rawId: string;
        response: {
            clientDataJSON: string;
            attestationObject: string;
        };
    }>>;
    challenge: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "start" | "finish";
    userId?: string | undefined;
    deviceName?: string | undefined;
    attestation?: {
        type: string;
        id: string;
        rawId: string;
        response: {
            clientDataJSON: string;
            attestationObject: string;
        };
    } | undefined;
    challenge?: string | undefined;
}, {
    action: "start" | "finish";
    userId?: string | undefined;
    deviceName?: string | undefined;
    attestation?: {
        type: string;
        id: string;
        rawId: string;
        response: {
            clientDataJSON: string;
            attestationObject: string;
        };
    } | undefined;
    challenge?: string | undefined;
}>;
export declare const createUserSchema: z.ZodObject<{
    email: z.ZodString;
    name: z.ZodString;
    organizationId: z.ZodOptional<z.ZodString>;
    role: z.ZodEnum<["ADMIN", "USER", "VIEWER", "AUDITOR"]>;
    temporaryPassword: z.ZodOptional<z.ZodString>;
    sendInvite: z.ZodDefault<z.ZodBoolean>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    email: string;
    name: string;
    role: "ADMIN" | "USER" | "VIEWER" | "AUDITOR";
    sendInvite: boolean;
    organizationId?: string | undefined;
    metadata?: Record<string, string> | undefined;
    temporaryPassword?: string | undefined;
}, {
    email: string;
    name: string;
    role: "ADMIN" | "USER" | "VIEWER" | "AUDITOR";
    organizationId?: string | undefined;
    metadata?: Record<string, string> | undefined;
    temporaryPassword?: string | undefined;
    sendInvite?: boolean | undefined;
}>;
export declare const manageUserSchema: z.ZodObject<{
    action: z.ZodEnum<["update", "delete", "disable", "enable", "reset_password"]>;
    email: z.ZodString;
    attributes: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    password: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email: string;
    action: "update" | "delete" | "disable" | "enable" | "reset_password";
    attributes?: Record<string, string> | undefined;
    password?: string | undefined;
}, {
    email: string;
    action: "update" | "delete" | "disable" | "enable" | "reset_password";
    attributes?: Record<string, string> | undefined;
    password?: string | undefined;
}>;
export declare const logAuditSchema: z.ZodObject<{
    action: z.ZodString;
    resourceType: z.ZodString;
    resourceId: z.ZodString;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    action: string;
    resourceType: string;
    resourceId: string;
    details?: Record<string, any> | undefined;
}, {
    action: string;
    resourceType: string;
    resourceId: string;
    details?: Record<string, any> | undefined;
}>;
export declare const saveAwsCredentialsSchema: z.ZodObject<{
    name: z.ZodString;
    accessKeyId: z.ZodString;
    secretAccessKey: z.ZodString;
    regions: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    roleArn: z.ZodOptional<z.ZodString>;
    externalId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    regions: string[];
    name: string;
    accessKeyId: string;
    secretAccessKey: string;
    externalId?: string | undefined;
    roleArn?: string | undefined;
}, {
    name: string;
    accessKeyId: string;
    secretAccessKey: string;
    regions?: string[] | undefined;
    externalId?: string | undefined;
    roleArn?: string | undefined;
}>;
export declare const updateAwsCredentialsSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    accessKeyId: z.ZodOptional<z.ZodString>;
    secretAccessKey: z.ZodOptional<z.ZodString>;
    regions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    regions?: string[] | undefined;
    name?: string | undefined;
    accessKeyId?: string | undefined;
    secretAccessKey?: string | undefined;
    isActive?: boolean | undefined;
}, {
    id: string;
    regions?: string[] | undefined;
    name?: string | undefined;
    accessKeyId?: string | undefined;
    secretAccessKey?: string | undefined;
    isActive?: boolean | undefined;
}>;
export declare const securityScanRequestSchema: z.ZodObject<{
    accountId: z.ZodOptional<z.ZodString>;
    credentialId: z.ZodOptional<z.ZodString>;
    regions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    scanTypes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    frameworks: z.ZodOptional<z.ZodArray<z.ZodEnum<["CIS", "WELL_ARCHITECTED", "PCI_DSS", "NIST", "LGPD", "SOC2"]>, "many">>;
}, "strip", z.ZodTypeAny, {
    accountId?: string | undefined;
    regions?: string[] | undefined;
    scanTypes?: string[] | undefined;
    frameworks?: ("CIS" | "SOC2" | "LGPD" | "WELL_ARCHITECTED" | "PCI_DSS" | "NIST")[] | undefined;
    credentialId?: string | undefined;
}, {
    accountId?: string | undefined;
    regions?: string[] | undefined;
    scanTypes?: string[] | undefined;
    frameworks?: ("CIS" | "SOC2" | "LGPD" | "WELL_ARCHITECTED" | "PCI_DSS" | "NIST")[] | undefined;
    credentialId?: string | undefined;
}>;
export declare const complianceScanSchema: z.ZodObject<{
    frameworkId: z.ZodEnum<["cis", "lgpd", "pci-dss", "nist", "soc2", "well-architected"]>;
    scanId: z.ZodOptional<z.ZodString>;
    accountId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    frameworkId: "cis" | "lgpd" | "pci-dss" | "nist" | "soc2" | "well-architected";
    accountId?: string | undefined;
    scanId?: string | undefined;
}, {
    frameworkId: "cis" | "lgpd" | "pci-dss" | "nist" | "soc2" | "well-architected";
    accountId?: string | undefined;
    scanId?: string | undefined;
}>;
export declare const sendNotificationSchema: z.ZodObject<{
    channel: z.ZodEnum<["email", "slack", "webhook", "sms", "sns"]>;
    recipient: z.ZodString;
    subject: z.ZodOptional<z.ZodString>;
    message: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    message: string;
    channel: "email" | "sms" | "slack" | "webhook" | "sns";
    recipient: string;
    metadata?: Record<string, any> | undefined;
    subject?: string | undefined;
}, {
    message: string;
    channel: "email" | "sms" | "slack" | "webhook" | "sns";
    recipient: string;
    metadata?: Record<string, any> | undefined;
    subject?: string | undefined;
}>;
export declare const fetchDailyCostsSchema: z.ZodObject<{
    accountId: z.ZodOptional<z.ZodString>;
    startDate: z.ZodOptional<z.ZodString>;
    endDate: z.ZodOptional<z.ZodString>;
    granularity: z.ZodDefault<z.ZodEnum<["DAILY", "MONTHLY"]>>;
    incremental: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    granularity: "DAILY" | "MONTHLY";
    incremental: boolean;
    startDate?: string | undefined;
    endDate?: string | undefined;
    accountId?: string | undefined;
}, {
    startDate?: string | undefined;
    endDate?: string | undefined;
    accountId?: string | undefined;
    granularity?: "DAILY" | "MONTHLY" | undefined;
    incremental?: boolean | undefined;
}>;
export declare const costForecastSchema: z.ZodObject<{
    accountId: z.ZodOptional<z.ZodString>;
    forecastDays: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    forecastDays: number;
    accountId?: string | undefined;
}, {
    accountId?: string | undefined;
    forecastDays?: number | undefined;
}>;
export declare const budgetForecastSchema: z.ZodObject<{
    accountId: z.ZodOptional<z.ZodString>;
    months: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    months: number;
    accountId?: string | undefined;
}, {
    accountId?: string | undefined;
    months?: number | undefined;
}>;
export declare const finopsCopilotSchema: z.ZodObject<{
    question: z.ZodString;
    awsAccountId: z.ZodString;
    context: z.ZodDefault<z.ZodEnum<["cost", "optimization", "forecast", "comparison", "general"]>>;
    timeRange: z.ZodOptional<z.ZodObject<{
        start: z.ZodString;
        end: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        start: string;
        end: string;
    }, {
        start: string;
        end: string;
    }>>;
}, "strip", z.ZodTypeAny, {
    question: string;
    awsAccountId: string;
    context: "cost" | "optimization" | "forecast" | "comparison" | "general";
    timeRange?: {
        start: string;
        end: string;
    } | undefined;
}, {
    question: string;
    awsAccountId: string;
    context?: "cost" | "optimization" | "forecast" | "comparison" | "general" | undefined;
    timeRange?: {
        start: string;
        end: string;
    } | undefined;
}>;
export declare const detectAnomaliesSchema: z.ZodObject<{
    awsAccountId: z.ZodString;
    analysisType: z.ZodDefault<z.ZodEnum<["cost", "security", "performance", "all"]>>;
    sensitivity: z.ZodDefault<z.ZodEnum<["low", "medium", "high"]>>;
    lookbackDays: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    awsAccountId: string;
    analysisType: "security" | "performance" | "cost" | "all";
    sensitivity: "high" | "medium" | "low";
    lookbackDays: number;
}, {
    awsAccountId: string;
    analysisType?: "security" | "performance" | "cost" | "all" | undefined;
    sensitivity?: "high" | "medium" | "low" | undefined;
    lookbackDays?: number | undefined;
}>;
export declare const aiPrioritizationSchema: z.ZodObject<{
    findingIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    findingIds?: string[] | undefined;
}, {
    limit?: number | undefined;
    findingIds?: string[] | undefined;
}>;
export declare const cloudwatchMetricsSchema: z.ZodObject<{
    accountId: z.ZodOptional<z.ZodString>;
    regions: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    regions: string[];
    accountId?: string | undefined;
}, {
    accountId?: string | undefined;
    regions?: string[] | undefined;
}>;
export declare const alertRulesSchema: z.ZodObject<{
    ruleId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    ruleId?: string | undefined;
}, {
    ruleId?: string | undefined;
}>;
export declare const autoAlertsSchema: z.ZodObject<{
    accountId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    accountId?: string | undefined;
}, {
    accountId?: string | undefined;
}>;
export declare const generatePdfReportSchema: z.ZodObject<{
    reportType: z.ZodEnum<["security", "cost", "compliance", "executive"]>;
    scanId: z.ZodOptional<z.ZodString>;
    dateRange: z.ZodOptional<z.ZodObject<{
        startDate: z.ZodOptional<z.ZodString>;
        endDate: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        startDate?: string | undefined;
        endDate?: string | undefined;
    }, {
        startDate?: string | undefined;
        endDate?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    reportType: "security" | "cost" | "compliance" | "executive";
    scanId?: string | undefined;
    dateRange?: {
        startDate?: string | undefined;
        endDate?: string | undefined;
    } | undefined;
}, {
    reportType: "security" | "cost" | "compliance" | "executive";
    scanId?: string | undefined;
    dateRange?: {
        startDate?: string | undefined;
        endDate?: string | undefined;
    } | undefined;
}>;
export declare const generateExcelReportSchema: z.ZodObject<{
    reportType: z.ZodEnum<["findings", "costs", "resources", "compliance"]>;
    accountId: z.ZodOptional<z.ZodString>;
    startDate: z.ZodOptional<z.ZodString>;
    endDate: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reportType: "compliance" | "findings" | "costs" | "resources";
    startDate?: string | undefined;
    endDate?: string | undefined;
    accountId?: string | undefined;
}, {
    reportType: "compliance" | "findings" | "costs" | "resources";
    startDate?: string | undefined;
    endDate?: string | undefined;
    accountId?: string | undefined;
}>;
export declare const sendEmailSchema: z.ZodObject<{
    type: z.ZodEnum<["single", "bulk", "notification", "alert", "security", "welcome", "password-reset"]>;
    to: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>;
    cc: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
    bcc: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
    subject: z.ZodOptional<z.ZodString>;
    htmlBody: z.ZodOptional<z.ZodString>;
    textBody: z.ZodOptional<z.ZodString>;
    template: z.ZodOptional<z.ZodString>;
    templateData: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    priority: z.ZodDefault<z.ZodEnum<["high", "normal", "low"]>>;
}, "strip", z.ZodTypeAny, {
    type: "security" | "alert" | "single" | "bulk" | "notification" | "welcome" | "password-reset";
    priority: "high" | "low" | "normal";
    to: string | string[];
    subject?: string | undefined;
    cc?: string | string[] | undefined;
    bcc?: string | string[] | undefined;
    htmlBody?: string | undefined;
    textBody?: string | undefined;
    template?: string | undefined;
    templateData?: Record<string, any> | undefined;
}, {
    type: "security" | "alert" | "single" | "bulk" | "notification" | "welcome" | "password-reset";
    to: string | string[];
    priority?: "high" | "low" | "normal" | undefined;
    subject?: string | undefined;
    cc?: string | string[] | undefined;
    bcc?: string | string[] | undefined;
    htmlBody?: string | undefined;
    textBody?: string | undefined;
    template?: string | undefined;
    templateData?: Record<string, any> | undefined;
}>;
export declare const uploadAttachmentSchema: z.ZodObject<{
    fileName: z.ZodString;
    contentType: z.ZodString;
    content: z.ZodString;
    bucket: z.ZodOptional<z.ZodString>;
    path: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    fileName: string;
    contentType: string;
    content: string;
    path?: string | undefined;
    bucket?: string | undefined;
}, {
    fileName: string;
    contentType: string;
    content: string;
    path?: string | undefined;
    bucket?: string | undefined;
}>;
export declare const downloadAttachmentSchema: z.ZodObject<{
    bucket: z.ZodString;
    path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
    bucket: string;
}, {
    path: string;
    bucket: string;
}>;
export declare const kbArticleTrackingSchema: z.ZodObject<{
    article_id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    article_id: string;
}, {
    article_id: string;
}>;
export declare const kbDetailedTrackingSchema: z.ZodObject<{
    p_article_id: z.ZodString;
    p_device_type: z.ZodOptional<z.ZodString>;
    p_reading_time: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    p_article_id: string;
    p_device_type?: string | undefined;
    p_reading_time?: number | undefined;
}, {
    p_article_id: string;
    p_device_type?: string | undefined;
    p_reading_time?: number | undefined;
}>;
export declare const createJiraTicketSchema: z.ZodObject<{
    findingId: z.ZodString;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    priority: z.ZodDefault<z.ZodEnum<["Highest", "High", "Medium", "Low", "Lowest"]>>;
    issueType: z.ZodDefault<z.ZodEnum<["Bug", "Task", "Story", "Epic"]>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    priority: "Highest" | "High" | "Medium" | "Low" | "Lowest";
    findingId: string;
    issueType: "Bug" | "Task" | "Story" | "Epic";
    description?: string | undefined;
}, {
    title: string;
    findingId: string;
    description?: string | undefined;
    priority?: "Highest" | "High" | "Medium" | "Low" | "Lowest" | undefined;
    issueType?: "Bug" | "Task" | "Story" | "Epic" | undefined;
}>;
export declare const queryTableSchema: z.ZodObject<{
    table: z.ZodString;
    filters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    orderBy: z.ZodOptional<z.ZodString>;
    orderDirection: z.ZodDefault<z.ZodEnum<["asc", "desc"]>>;
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    table: string;
    orderDirection: "asc" | "desc";
    offset: number;
    orderBy?: string | undefined;
    filters?: Record<string, any> | undefined;
}, {
    table: string;
    limit?: number | undefined;
    orderBy?: string | undefined;
    filters?: Record<string, any> | undefined;
    orderDirection?: "asc" | "desc" | undefined;
    offset?: number | undefined;
}>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ManageUserInput = z.infer<typeof manageUserSchema>;
export type SecurityScanInput = z.infer<typeof securityScanRequestSchema>;
export type FetchDailyCostsInput = z.infer<typeof fetchDailyCostsSchema>;
export type DetectAnomaliesInput = z.infer<typeof detectAnomaliesSchema>;
export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;
export type QueryTableInput = z.infer<typeof queryTableSchema>;
export type FinopsCopilotInput = z.infer<typeof finopsCopilotSchema>;
//# sourceMappingURL=schemas.d.ts.map