import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler para gerar relatório PDF
 * AWS Lambda Handler for generate-pdf-report
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

interface GeneratePDFRequest {
  reportType: 'security' | 'compliance' | 'cost' | 'inventory';
  scanId?: string;
  dateRange?: {
    start: string;
    end: string;
  };
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  // Handle CORS preflight FIRST
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationIdWithImpersonation(event, user);
  
  logger.info('Generate PDF report started', { 
    organizationId,
    userId: user.sub,
    requestId: context.awsRequestId 
  });
  
  try {
    const body: GeneratePDFRequest = event.body ? JSON.parse(event.body) : {};
    const { reportType, scanId, dateRange } = body;
    
    if (!reportType) {
      return badRequest('reportType is required');
    }
    
    logger.info('Generating PDF report', { organizationId, reportType, scanId });
    
    const prisma = getPrismaClient();
    
    // Coletar dados baseado no tipo de relatório
    let reportData: any = {};
    
    switch (reportType) {
      case 'security': {
        const findings = await prisma.finding.findMany({
          where: {
            organization_id: organizationId,
            ...(scanId && { 
              details: {
                path: ['scan_id'],
                equals: scanId,
              }
            }),
          },
          orderBy: { created_at: 'desc' },
          take: 100,
        });
        
        const stats = await prisma.finding.groupBy({
          by: ['severity'],
          where: { organization_id: organizationId },
          _count: true,
        });
        
        reportData = {
          title: 'Security Findings Report',
          findings,
          summary: {
            total: findings.length,
            critical: stats.find(s => s.severity === 'critical')?._count || 0,
            high: stats.find(s => s.severity === 'high')?._count || 0,
            medium: stats.find(s => s.severity === 'medium')?._count || 0,
            low: stats.find(s => s.severity === 'low')?._count || 0,
          },
        };
        break;
      }
      
      case 'compliance': {
        const checks = await prisma.complianceCheck.findMany({
          where: {
            scan: {
              organization_id: organizationId,
            },
          },
          include: {
            scan: true,
          },
          orderBy: { created_at: 'desc' },
          take: 100,
        });
        
        reportData = {
          title: 'Compliance Report',
          checks,
          summary: {
            total: checks.length,
            passed: checks.filter(c => c.status === 'passed').length,
            failed: checks.filter(c => c.status === 'failed').length,
          },
        };
        break;
      }
      
      case 'cost': {
        // Placeholder - implementar quando tiver dados de custo
        reportData = {
          title: 'Cost Analysis Report',
          message: 'Cost data collection in progress',
        };
        break;
      }
      
      case 'inventory': {
        // Placeholder - implementar quando tiver inventário
        reportData = {
          title: 'Resource Inventory Report',
          message: 'Inventory data collection in progress',
        };
        break;
      }
    }
    
    // Gerar PDF (simplificado - em produção usar biblioteca como puppeteer ou pdfkit)
    const pdfContent = generateSimplePDF(reportData);
    
    // Upload para S3
    const bucketName = process.env.REPORTS_BUCKET || 'evo-uds-reports';
    const fileName = `${reportType}-report-${Date.now()}.pdf`;
    const s3Key = `${organizationId}/${fileName}`;
    
    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: pdfContent,
        ContentType: 'application/pdf',
        Metadata: {
          organization_id: organizationId,
          report_type: reportType,
          generated_at: new Date().toISOString(),
        },
      })
    );
    
    // Gerar URL pré-assinada para download
    const downloadUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
      }),
      { expiresIn: 3600 } // 1 hora
    );
    
    logger.info('PDF report generated successfully', { 
      organizationId, 
      reportType, 
      fileName,
      s3Key 
    });
    
    return success({
      file_name: fileName,
      download_url: downloadUrl,
      expires_in: 3600,
      report_type: reportType,
    });
    
  } catch (err) {
    logger.error('Generate PDF report error', err as Error, { 
      organizationId,
      userId: user.sub,
      requestId: context.awsRequestId 
    });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

/**
 * Gera PDF simples (placeholder)
 * Em produção, usar biblioteca apropriada
 */
function generateSimplePDF(data: any): Buffer {
  // Placeholder - retorna PDF mínimo válido
  const pdfHeader = '%PDF-1.4\n';
  const pdfContent = `
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources 4 0 R /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>
endobj
5 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
100 700 Td
(${data.title || 'Report'}) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000214 00000 n
0000000304 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
398
%%EOF
`;
  
  return Buffer.from(pdfHeader + pdfContent);
}
