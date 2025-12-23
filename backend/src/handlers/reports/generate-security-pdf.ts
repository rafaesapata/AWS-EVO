import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Generate Security PDF
 * AWS Lambda Handler for generate-security-pdf
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

interface GenerateSecurityPDFRequest {
  accountId?: string;
  includeFindings?: boolean;
  includeCompliance?: boolean;
  includeDrifts?: boolean;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Generate Security PDF started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: GenerateSecurityPDFRequest = event.body ? JSON.parse(event.body) : {};
    const {
      accountId,
      includeFindings = true,
      includeCompliance = true,
      includeDrifts = true,
    } = body;
    
    const prisma = getPrismaClient();
    
    // Buscar dados
    const data: any = {
      organization: await prisma.organization.findUnique({
        where: { id: organizationId },
      }),
    };
    
    if (includeFindings) {
      data.findings = await prisma.finding.findMany({
        where: {
          organization_id: organizationId,
          ...(accountId && { account_id: accountId }),
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
          ...(accountId && { account_id: accountId }),
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
    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    const bucketName = process.env.REPORTS_BUCKET_NAME || 'evo-uds-reports';
    const filename = `security-report-${Date.now()}.html`;
    const key = `${organizationId}/${filename}`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: html,
      ContentType: 'text/html',
    }));
    
    const downloadUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({ Bucket: bucketName, Key: key }),
      { expiresIn: 3600 }
    );
    
    logger.info(`✅ Generated security PDF: ${filename}`);
    
    return success({
      success: true,
      filename,
      downloadUrl,
    });
    
  } catch (err) {
    logger.error('❌ Generate Security PDF error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

function generateSecurityReportHTML(data: any): string {
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
      ${data.findings.map((f: any) => `
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
      ${data.violations.map((v: any) => `
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
      ${data.drifts.map((d: any) => `
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
