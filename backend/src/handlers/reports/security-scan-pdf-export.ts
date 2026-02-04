import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { getPrismaClient } from '../../lib/database.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { success, error, badRequest, notFound, corsOptions } from '../../lib/response.js';
import { getOrigin } from '../../lib/middleware.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import PDFDocument from 'pdfkit';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

// Zod schema for security scan PDF export
const securityScanPdfExportSchema = z.object({
  scanId: z.string().uuid('Invalid scan ID format'),
  format: z.enum(['detailed', 'summary', 'executive']).default('detailed'),
  includeRemediation: z.boolean().default(true),
  language: z.enum(['pt-BR', 'en-US']).default('pt-BR'),
});

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  let organizationId: string = '';
  let userId: string = 'unknown';
  
  try {
    const user = getUserFromEvent(event);
    userId = user.sub || user.id || 'unknown';
    organizationId = getOrganizationIdWithImpersonation(event, user);
  } catch (authError) {
    logger.error('Authentication error', authError);
    return error('Unauthorized', 401, undefined, origin);
  }

  if (!organizationId) {
    return error('Organization ID not found', 401, undefined, origin);
  }

  try {
    const prisma = getPrismaClient();
    
    // Validate input with Zod
    const validation = parseAndValidateBody(securityScanPdfExportSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { scanId, format, includeRemediation, language } = validation.data;

    // Buscar scan - FILTRAR POR ORGANIZATION_ID
    const scan = await prisma.securityScan.findFirst({
      where: { 
        id: scanId,
        organization_id: organizationId
      }
    });

    if (!scan) {
      return notFound('Scan not found', origin);
    }

    // Buscar findings do scan
    const findings = await prisma.finding.findMany({
      where: {
        organization_id: organizationId,
        ...(scan.aws_account_id ? { aws_account_id: scan.aws_account_id } : {})
      },
      orderBy: { severity: 'desc' }
    });

    logger.info('Generating PDF report', { 
      scanId, 
      organizationId, 
      findingsCount: findings.length 
    });

    // Gerar PDF
    const pdfBuffer = await generatePDF(
      scan, 
      findings, 
      format ?? 'detailed', 
      includeRemediation !== undefined ? includeRemediation : true, 
      language ?? 'pt-BR'
    );

    // Upload para S3
    const bucket = process.env.REPORTS_BUCKET || 'evo-uds-reports-971354623291';
    const timestamp = Date.now();
    const key = `security-reports/${organizationId}/${scanId}/${timestamp}-report.pdf`;

    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      ContentDisposition: `attachment; filename="evo-security-report-${scanId.slice(0, 8)}.pdf"`,
      Metadata: { 
        scanId, 
        format: format ?? 'detailed', 
        generatedBy: userId, 
        generatedAt: new Date().toISOString(),
        organizationId
      }
    }));

    // Gerar URL assinada para download (válida por 1 hora)
    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ 
        Bucket: bucket, 
        Key: key,
        ResponseContentDisposition: `attachment; filename="evo-security-report-${scanId.slice(0, 8)}.pdf"`
      }),
      { expiresIn: 3600 }
    );

    logger.info('PDF report generated', { scanId, organizationId, key, size: pdfBuffer.length });

    return success({
      downloadUrl: signedUrl,
      expiresIn: 3600,
      fileSize: pdfBuffer.length,
      format,
      filename: `evo-security-report-${scanId.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.pdf`
    }, 200, origin);
  } catch (err) {
    logger.error('Security scan PDF export error:', err);
    return error('Internal server error', 500, undefined, origin);
  }
}

async function generatePDF(
  scan: any,
  findings: any[],
  format: string,
  includeRemediation: boolean,
  language: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ 
      size: 'A4', 
      margin: 50,
      info: {
        Title: 'EVO Security Report',
        Author: 'EVO Platform',
        Subject: 'AWS Security Analysis',
        Creator: 'EVO Platform v3.2'
      }
    });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const t = language === 'pt-BR' ? {
      title: 'Relatório de Segurança AWS',
      subtitle: 'Análise de Vulnerabilidades e Conformidade',
      summary: 'Resumo Executivo',
      scanInfo: 'Informações do Scan',
      findings: 'Descobertas de Segurança',
      remediation: 'Remediação Sugerida',
      generatedBy: 'Gerado por EVO Platform',
      critical: 'Crítico',
      high: 'Alto',
      medium: 'Médio',
      low: 'Baixo',
      total: 'Total',
      resource: 'Recurso',
      severity: 'Severidade',
      noFindings: 'Nenhuma vulnerabilidade encontrada'
    } : {
      title: 'AWS Security Report',
      subtitle: 'Vulnerability and Compliance Analysis',
      summary: 'Executive Summary',
      scanInfo: 'Scan Information',
      findings: 'Security Findings',
      remediation: 'Suggested Remediation',
      generatedBy: 'Generated by EVO Platform',
      critical: 'Critical',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
      total: 'Total',
      resource: 'Resource',
      severity: 'Severity',
      noFindings: 'No vulnerabilities found'
    };

    // Contagem por severidade
    const counts = {
      critical: findings.filter(f => f.severity?.toLowerCase() === 'critical').length,
      high: findings.filter(f => f.severity?.toLowerCase() === 'high').length,
      medium: findings.filter(f => f.severity?.toLowerCase() === 'medium').length,
      low: findings.filter(f => f.severity?.toLowerCase() === 'low').length
    };

    // Header com logo/título
    doc.fontSize(28).fillColor('#1e40af').text(t.title, { align: 'center' });
    doc.fontSize(14).fillColor('#6b7280').text(t.subtitle, { align: 'center' });
    doc.moveDown(2);

    // Linha separadora
    doc.strokeColor('#e5e7eb').lineWidth(1)
       .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();

    // Informações do Scan
    doc.fontSize(16).fillColor('#1f2937').text(t.scanInfo);
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#6b7280');
    doc.text(`Scan ID: ${scan.id}`);
    doc.text(`Tipo: ${scan.scan_type || 'security'}`);
    doc.text(`Status: ${scan.status}`);
    doc.text(`Data: ${new Date(scan.created_at).toLocaleString(language)}`);
    doc.moveDown(1.5);

    // Resumo Executivo
    doc.fontSize(16).fillColor('#1f2937').text(t.summary);
    doc.moveDown(0.5);

    // Tabela de resumo
    const tableTop = doc.y;
    const col1 = 50, col2 = 200, col3 = 350;
    
    // Header da tabela
    doc.fontSize(11).fillColor('#374151');
    doc.text(t.severity, col1, tableTop);
    doc.text('Quantidade', col2, tableTop);
    doc.moveDown(0.5);

    // Linha
    doc.strokeColor('#e5e7eb').lineWidth(0.5)
       .moveTo(col1, doc.y).lineTo(400, doc.y).stroke();
    doc.moveDown(0.3);

    // Dados
    const severities = [
      { label: t.critical, count: counts.critical, color: '#dc2626' },
      { label: t.high, count: counts.high, color: '#ea580c' },
      { label: t.medium, count: counts.medium, color: '#ca8a04' },
      { label: t.low, count: counts.low, color: '#2563eb' }
    ];

    severities.forEach(sev => {
      doc.fontSize(10).fillColor(sev.color).text(sev.label, col1, doc.y);
      doc.fillColor('#1f2937').text(sev.count.toString(), col2, doc.y - 12);
      doc.moveDown(0.5);
    });

    // Total
    doc.strokeColor('#e5e7eb').lineWidth(0.5)
       .moveTo(col1, doc.y).lineTo(400, doc.y).stroke();
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#1f2937').font('Helvetica-Bold');
    doc.text(t.total, col1, doc.y);
    doc.text(findings.length.toString(), col2, doc.y - 12);
    doc.font('Helvetica');
    doc.moveDown(2);

    // Findings detalhados (se não for executive)
    if (format !== 'executive' && findings.length > 0) {
      doc.addPage();
      doc.fontSize(16).fillColor('#1f2937').text(t.findings);
      doc.moveDown();

      findings.slice(0, 50).forEach((finding, index) => {
        // Verificar se precisa de nova página
        if (doc.y > 700) {
          doc.addPage();
        }

        const severity = (finding.severity || 'low').toLowerCase();
        const severityColor = severity === 'critical' ? '#dc2626' : 
                             severity === 'high' ? '#ea580c' : 
                             severity === 'medium' ? '#ca8a04' : '#2563eb';

        // Número e título
        doc.fontSize(11).fillColor('#1f2937').font('Helvetica-Bold');
        doc.text(`${index + 1}. ${finding.description || finding.event_name || 'Finding'}`, {
          width: 450
        });
        doc.font('Helvetica');

        // Badge de severidade
        doc.fontSize(9).fillColor(severityColor);
        doc.text(`[${severity.toUpperCase()}]`, { continued: false });

        // Detalhes
        doc.fontSize(9).fillColor('#6b7280');
        if (finding.resource_id) {
          doc.text(`${t.resource}: ${finding.resource_id}`);
        }
        if (finding.service) {
          doc.text(`Service: ${finding.service}`);
        }

        // Remediação
        if (includeRemediation && finding.remediation) {
          doc.fontSize(9).fillColor('#166534');
          doc.text(`${t.remediation}: ${finding.remediation}`, { width: 450 });
        }

        doc.moveDown(1);
      });

      if (findings.length > 50) {
        doc.fontSize(10).fillColor('#6b7280');
        doc.text(`... e mais ${findings.length - 50} findings não mostrados neste relatório.`);
      }
    } else if (findings.length === 0) {
      doc.fontSize(12).fillColor('#166534').text(t.noFindings);
    }

    // Footer
    doc.fontSize(8).fillColor('#9ca3af');
    const footerY = doc.page.height - 50;
    doc.text(
      `${t.generatedBy} • ${new Date().toLocaleString(language)}`,
      50, footerY,
      { align: 'center', width: 495 }
    );

    doc.end();
  });
}
