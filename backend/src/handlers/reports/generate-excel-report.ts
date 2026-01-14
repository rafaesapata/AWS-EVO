import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Generate Excel Report
 * AWS Lambda Handler for generate-excel-report
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient, getOptionalCredentialFilter } from '../../lib/database.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

interface GenerateExcelRequest {
  reportType: 'security' | 'cost' | 'compliance' | 'drift';
  accountId?: string;
  startDate?: string;
  endDate?: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Generate Excel Report started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const body: GenerateExcelRequest = event.body ? JSON.parse(event.body) : {};
    const { reportType, accountId, startDate, endDate } = body;
    
    if (!reportType) {
      return error('Missing required parameter: reportType');
    }
    
    const prisma = getPrismaClient();
    
    // Buscar dados baseado no tipo de relatório
    let data: any;
    let filename: string;
    
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
        return error(`Invalid report type: ${reportType}`);
    }
    
    // Converter para CSV
    const csv = convertToCSV(data);
    
    // Upload para S3
    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    const bucketName = process.env.REPORTS_BUCKET_NAME || 'evo-uds-reports';
    const key = `${organizationId}/${filename}`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: csv,
      ContentType: 'text/csv',
    }));
    
    // Gerar URL pré-assinada
    const downloadUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({ Bucket: bucketName, Key: key }),
      { expiresIn: 3600 }
    );
    
    logger.info(`✅ Excel report generated: ${filename}`);
    
    return success({
      success: true,
      filename,
      downloadUrl,
      recordCount: data.length,
    });
    
  } catch (err) {
    logger.error('❌ Generate Excel Report error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

async function getSecurityData(prisma: any, organizationId: string, accountId?: string) {
  const { getOptionalCredentialFilter } = await import('../../lib/database.js');
  return await prisma.finding.findMany({
    where: {
      organization_id: organizationId,
      ...getOptionalCredentialFilter(accountId),
    },
    orderBy: { created_at: 'desc' },
    take: 1000,
  });
}

async function getCostData(
  prisma: any,
  organizationId: string,
  accountId?: string,
  startDate?: string,
  endDate?: string
) {
  const { getOptionalCredentialFilter } = await import('../../lib/database.js');
  return await prisma.dailyCost.findMany({
    where: {
      organization_id: organizationId,
      ...getOptionalCredentialFilter(accountId),
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

async function getComplianceData(prisma: any, organizationId: string, accountId?: string) {
  const { getOptionalCredentialFilter } = await import('../../lib/database.js');
  return await prisma.complianceViolation.findMany({
    where: {
      organization_id: organizationId,
      ...getOptionalCredentialFilter(accountId),
    },
    orderBy: { detected_at: 'desc' },
    take: 1000,
  });
}

async function getDriftData(prisma: any, organizationId: string, accountId?: string) {
  const { getOptionalCredentialFilter } = await import('../../lib/database.js');
  return await prisma.driftDetection.findMany({
    where: {
      organization_id: organizationId,
      ...getOptionalCredentialFilter(accountId),
    },
    orderBy: { detected_at: 'desc' },
    take: 1000,
  });
}

function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(header => {
      const value = row[header];
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value || '');
    }).join(',')
  );
  
  return [headers.join(','), ...rows].join('\n');
}
