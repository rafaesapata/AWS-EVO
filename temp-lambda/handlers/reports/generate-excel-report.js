"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
async function handler(event, context) {
    logging_js_1.logger.info('🚀 Generate Excel Report started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { reportType, accountId, startDate, endDate } = body;
        if (!reportType) {
            return (0, response_js_1.error)('Missing required parameter: reportType');
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        // Buscar dados baseado no tipo de relatório
        let data;
        let filename;
        switch (reportType) {
            case 'security':
                data = await getSecurityData(prisma, organizationId, accountId);
                filename = `security-report-${Date.now()}.csv`;
                break;
            case 'cost':
                data = await getCostData(prisma, organizationId, accountId, startDate, endDate);
                filename = `cost-report-${Date.now()}.csv`;
                break;
            case 'compliance':
                data = await getComplianceData(prisma, organizationId, accountId);
                filename = `compliance-report-${Date.now()}.csv`;
                break;
            case 'drift':
                data = await getDriftData(prisma, organizationId, accountId);
                filename = `drift-report-${Date.now()}.csv`;
                break;
            default:
                return (0, response_js_1.error)(`Invalid report type: ${reportType}`);
        }
        // Converter para CSV
        const csv = convertToCSV(data);
        // Upload para S3
        const s3Client = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
        const bucketName = process.env.REPORTS_BUCKET_NAME || 'evo-uds-reports';
        const key = `${organizationId}/${filename}`;
        await s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: csv,
            ContentType: 'text/csv',
        }));
        // Gerar URL pré-assinada
        const downloadUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, new client_s3_1.PutObjectCommand({ Bucket: bucketName, Key: key }), { expiresIn: 3600 });
        logging_js_1.logger.info(`✅ Excel report generated: ${filename}`);
        return (0, response_js_1.success)({
            success: true,
            filename,
            downloadUrl,
            recordCount: data.length,
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ Generate Excel Report error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
async function getSecurityData(prisma, organizationId, accountId) {
    return await prisma.finding.findMany({
        where: {
            organization_id: organizationId,
            ...(accountId && { aws_account_id: accountId }),
        },
        orderBy: { created_at: 'desc' },
        take: 1000,
    });
}
async function getCostData(prisma, organizationId, accountId, startDate, endDate) {
    return await prisma.dailyCost.findMany({
        where: {
            organization_id: organizationId,
            ...(accountId && { aws_account_id: accountId }),
            ...(startDate && endDate && {
                date: {
                    gte: new Date(startDate),
                    lte: new Date(endDate),
                },
            }),
        },
        orderBy: { date: 'desc' },
        take: 1000,
    });
}
async function getComplianceData(prisma, organizationId, accountId) {
    return await prisma.complianceViolation.findMany({
        where: {
            organization_id: organizationId,
            ...(accountId && { aws_account_id: accountId }),
        },
        orderBy: { detected_at: 'desc' },
        take: 1000,
    });
}
async function getDriftData(prisma, organizationId, accountId) {
    return await prisma.driftDetection.findMany({
        where: {
            organization_id: organizationId,
            ...(accountId && { aws_account_id: accountId }),
        },
        orderBy: { detected_at: 'desc' },
        take: 1000,
    });
}
function convertToCSV(data) {
    if (data.length === 0)
        return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(header => {
        const value = row[header];
        if (typeof value === 'object')
            return JSON.stringify(value);
        return String(value || '');
    }).join(','));
    return [headers.join(','), ...rows].join('\n');
}
//# sourceMappingURL=generate-excel-report.js.map