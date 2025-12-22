import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from '../../lib/logging.js';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const prisma = new PrismaClient();
const s3Client = new S3Client({});

interface ExportRequest {
  scanId: string;
  format?: 'detailed' | 'summary' | 'executive';
  includeRemediation?: boolean;
  language?: 'pt-BR' | 'en-US';
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const body: ExportRequest = JSON.parse(event.body || '{}');
    const { scanId, format = 'detailed', includeRemediation = true, language = 'pt-BR' } = body;

    if (!scanId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'scanId is required' }) };
    }

    // Buscar scan
    const scan = await prisma.securityScan.findUnique({
      where: { id: scanId }
    });

    if (!scan) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Scan not found' }) };
    }

    // Gerar conteúdo do PDF
    const pdfContent = generatePDFContent({
      id: scan.id,
      scanType: scan.scan_type,
      status: scan.status,
      createdAt: scan.created_at,
      completedAt: scan.completed_at,
      findings: [],
      awsAccount: {
        name: 'AWS Account',
        accountId: '123456789012',
        organization: { name: 'Organization' }
      }
    }, format, includeRemediation, language);
    
    // Converter para PDF (usando HTML como base)
    const pdfBuffer = await generatePDFBuffer(pdfContent);

    // Upload para S3
    const bucket = process.env.REPORTS_BUCKET || 'evo-uds-reports';
    const key = `security-scans/${scan.organization_id}/${scanId}/${Date.now()}-report.pdf`;

    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      Metadata: {
        scanId,
        format,
        generatedBy: userId,
        generatedAt: new Date().toISOString()
      }
    }));

    // Gerar URL assinada
    const signedUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 3600 }
    );

    // Registrar exportação
    await prisma.reportExport.create({
      data: {
        organization_id: scan.organization_id,
        report_type: 'security_scan',
        format: 'pdf',
        status: 'completed',
        file_url: signedUrl,
        file_size: pdfBuffer.length
      }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        downloadUrl: signedUrl,
        expiresIn: 3600,
        fileSize: pdfBuffer.length,
        format
      })
    };
  } catch (error) {
    logger.error('Security scan PDF export error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};

function generatePDFContent(
  scan: {
    id: string;
    scanType: string;
    status: string;
    createdAt: Date;
    completedAt: Date | null;
    findings: { severity: string; title: string; description: string; resourceId: string; remediation: string | null }[];
    awsAccount: { name: string; accountId: string; organization: { name: string } };
  },
  format: string,
  includeRemediation: boolean,
  language: string
): string {
  const t = language === 'pt-BR' ? translations.ptBR : translations.enUS;
  
  const criticalCount = scan.findings.filter(f => f.severity === 'CRITICAL').length;
  const highCount = scan.findings.filter(f => f.severity === 'HIGH').length;
  const mediumCount = scan.findings.filter(f => f.severity === 'MEDIUM').length;
  const lowCount = scan.findings.filter(f => f.severity === 'LOW').length;

  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${t.title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    h1 { color: #1a365d; border-bottom: 2px solid #3182ce; padding-bottom: 10px; }
    h2 { color: #2c5282; margin-top: 30px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .summary-box { background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .severity-critical { color: #c53030; font-weight: bold; }
    .severity-high { color: #dd6b20; font-weight: bold; }
    .severity-medium { color: #d69e2e; }
    .severity-low { color: #38a169; }
    .finding { border: 1px solid #e2e8f0; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .finding-header { display: flex; justify-content: space-between; }
    .remediation { background: #ebf8ff; padding: 10px; margin-top: 10px; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
    th { background: #edf2f7; }
    .footer { margin-top: 40px; text-align: center; color: #718096; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${t.title}</h1>
      <p><strong>${t.organization}:</strong> ${scan.awsAccount.organization.name}</p>
      <p><strong>${t.account}:</strong> ${scan.awsAccount.name} (${scan.awsAccount.accountId})</p>
    </div>
    <div>
      <p><strong>${t.scanDate}:</strong> ${scan.createdAt.toLocaleDateString(language)}</p>
      <p><strong>${t.scanType}:</strong> ${scan.scanType}</p>
      <p><strong>Status:</strong> ${scan.status}</p>
    </div>
  </div>

  <div class="summary-box">
    <h2>${t.summary}</h2>
    <table>
      <tr>
        <th>${t.severity}</th>
        <th>${t.count}</th>
      </tr>
      <tr><td class="severity-critical">CRITICAL</td><td>${criticalCount}</td></tr>
      <tr><td class="severity-high">HIGH</td><td>${highCount}</td></tr>
      <tr><td class="severity-medium">MEDIUM</td><td>${mediumCount}</td></tr>
      <tr><td class="severity-low">LOW</td><td>${lowCount}</td></tr>
      <tr><td><strong>Total</strong></td><td><strong>${scan.findings.length}</strong></td></tr>
    </table>
  </div>`;

  if (format !== 'executive') {
    html += `<h2>${t.findings}</h2>`;
    
    const sortedFindings = [...scan.findings].sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return (order[a.severity as keyof typeof order] || 4) - (order[b.severity as keyof typeof order] || 4);
    });

    for (const finding of sortedFindings) {
      html += `
      <div class="finding">
        <div class="finding-header">
          <strong>${finding.title}</strong>
          <span class="severity-${finding.severity.toLowerCase()}">${finding.severity}</span>
        </div>
        <p>${finding.description}</p>
        <p><strong>${t.resource}:</strong> ${finding.resourceId}</p>
        ${includeRemediation && finding.remediation ? `
        <div class="remediation">
          <strong>${t.remediation}:</strong>
          <p>${finding.remediation}</p>
        </div>` : ''}
      </div>`;
    }
  }

  html += `
  <div class="footer">
    <p>${t.generatedBy} EVO UDS - ${new Date().toISOString()}</p>
  </div>
</body>
</html>`;

  return html;
}

async function generatePDFBuffer(htmlContent: string): Promise<Buffer> {
  // Em produção, usar puppeteer ou similar
  // Por simplicidade, retornamos o HTML como buffer
  return Buffer.from(htmlContent, 'utf-8');
}

const translations = {
  ptBR: {
    title: 'Relatório de Segurança',
    organization: 'Organização',
    account: 'Conta AWS',
    scanDate: 'Data do Scan',
    scanType: 'Tipo de Scan',
    summary: 'Resumo Executivo',
    severity: 'Severidade',
    count: 'Quantidade',
    findings: 'Descobertas',
    resource: 'Recurso',
    remediation: 'Remediação',
    generatedBy: 'Gerado por'
  },
  enUS: {
    title: 'Security Report',
    organization: 'Organization',
    account: 'AWS Account',
    scanDate: 'Scan Date',
    scanType: 'Scan Type',
    summary: 'Executive Summary',
    severity: 'Severity',
    count: 'Count',
    findings: 'Findings',
    resource: 'Resource',
    remediation: 'Remediation',
    generatedBy: 'Generated by'
  }
};
