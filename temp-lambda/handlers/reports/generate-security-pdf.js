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
    logging_js_1.logger.info('🚀 Generate Security PDF started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountId, includeFindings = true, includeCompliance = true, includeDrifts = true, } = body;
        const prisma = (0, database_js_1.getPrismaClient)();
        // Buscar dados
        const data = {
            organization: await prisma.organization.findUnique({
                where: { id: organizationId },
            }),
        };
        if (includeFindings) {
            data.findings = await prisma.finding.findMany({
                where: {
                    organization_id: organizationId,
                    ...(accountId && { aws_account_id: accountId }),
                    status: 'pending',
                },
                orderBy: { created_at: 'desc' },
                take: 100,
            });
        }
        if (includeCompliance) {
            data.violations = await prisma.complianceViolation.findMany({
                where: {
                    organization_id: organizationId,
                    ...(accountId && { aws_account_id: accountId }),
                    status: 'OPEN',
                },
                take: 100,
            });
        }
        if (includeDrifts) {
            data.drifts = await prisma.driftDetection.findMany({
                where: {
                    organization_id: organizationId,
                    ...(accountId && { aws_account_id: accountId }),
                },
                orderBy: { detected_at: 'desc' },
                take: 100,
            });
        }
        // Gerar HTML (simplificado - em produção usar biblioteca de PDF)
        const html = generateSecurityReportHTML(data);
        // Upload para S3
        const s3Client = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
        const bucketName = process.env.REPORTS_BUCKET_NAME || 'evo-uds-reports';
        const filename = `security-report-${Date.now()}.html`;
        const key = `${organizationId}/${filename}`;
        await s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: html,
            ContentType: 'text/html',
        }));
        const downloadUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, new client_s3_1.PutObjectCommand({ Bucket: bucketName, Key: key }), { expiresIn: 3600 });
        logging_js_1.logger.info(`✅ Generated security PDF: ${filename}`);
        return (0, response_js_1.success)({
            success: true,
            filename,
            downloadUrl,
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ Generate Security PDF error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
function generateSecurityReportHTML(data) {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Security Report - ${data.organization?.name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .critical { color: #d32f2f; }
    .high { color: #f57c00; }
  </style>
</head>
<body>
  <h1>Security Report</h1>
  <p><strong>Organization:</strong> ${data.organization?.name}</p>
  <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
  
  ${data.findings ? `
    <h2>Security Findings (${data.findings.length})</h2>
    <table>
      <tr>
        <th>Severity</th>
        <th>Title</th>
        <th>Resource</th>
        <th>Status</th>
      </tr>
      ${data.findings.map((f) => `
        <tr>
          <td class="${f.severity.toLowerCase()}">${f.severity}</td>
          <td>${f.title || f.description}</td>
          <td>${f.resourceId || 'N/A'}</td>
          <td>${f.status}</td>
        </tr>
      `).join('')}
    </table>
  ` : ''}
  
  ${data.violations ? `
    <h2>Compliance Violations (${data.violations.length})</h2>
    <table>
      <tr>
        <th>Framework</th>
        <th>Control</th>
        <th>Resource</th>
        <th>Status</th>
      </tr>
      ${data.violations.map((v) => `
        <tr>
          <td>${v.framework}</td>
          <td>${v.controlId}</td>
          <td>${v.resourceId || 'N/A'}</td>
          <td>${v.status}</td>
        </tr>
      `).join('')}
    </table>
  ` : ''}
  
  ${data.drifts ? `
    <h2>Configuration Drifts (${data.drifts.length})</h2>
    <table>
      <tr>
        <th>Type</th>
        <th>Resource</th>
        <th>Severity</th>
        <th>Detected</th>
      </tr>
      ${data.drifts.map((d) => `
        <tr>
          <td>${d.drift_type}</td>
          <td>${d.resource_id}</td>
          <td>${d.severity}</td>
          <td>${new Date(d.detected_at).toLocaleDateString()}</td>
        </tr>
      `).join('')}
    </table>
  ` : ''}
</body>
</html>
  `.trim();
}
//# sourceMappingURL=generate-security-pdf.js.map