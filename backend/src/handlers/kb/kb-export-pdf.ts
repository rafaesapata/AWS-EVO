import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for KB Export PDF
 * AWS Lambda Handler for kb-export-pdf
 * 
 * Exporta artigo da KB para PDF
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

interface KBExportPDFRequest {
  articleId: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 KB Export PDF started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const body: KBExportPDFRequest = event.body ? JSON.parse(event.body) : {};
    const { articleId } = body;
    
    if (!articleId) {
      return error('Missing required parameter: articleId');
    }
    
    const prisma = getPrismaClient();
    
    const article = await prisma.knowledgeBaseArticle.findFirst({
      where: {
        id: articleId,
        organization_id: organizationId,
      },
    });
    
    if (!article) {
      return error('Article not found');
    }
    
    // Gerar HTML
    const html = generateArticleHTML(article);
    
    // Upload para S3
    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    const bucketName = process.env.REPORTS_BUCKET_NAME || 'evo-uds-reports';
    const filename = `kb-article-${articleId}-${Date.now()}.html`;
    const key = `${organizationId}/kb/${filename}`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: html,
      ContentType: 'text/html',
    }));
    
    const downloadUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: bucketName, Key: key }),
      { expiresIn: 3600 }
    );
    
    logger.info(`✅ Exported KB article: ${article.title}`);
    
    return success({
      success: true,
      filename,
      downloadUrl,
    });
    
  } catch (err) {
    logger.error('❌ KB Export PDF error:', err);
    return error('An unexpected error occurred. Please try again.', 500);
  }
}

function generateArticleHTML(article: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>${article.title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
    h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    .meta { color: #666; font-size: 14px; margin: 20px 0; }
    .content { margin-top: 30px; }
    .tags { margin-top: 30px; }
    .tag { display: inline-block; background: #e9ecef; padding: 5px 10px; margin: 5px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>${article.title}</h1>
  
  <div class="meta">
    <p><strong>Category:</strong> ${article.category || 'Uncategorized'}</p>
    <p><strong>Created:</strong> ${new Date(article.created_at).toLocaleDateString()}</p>
    <p><strong>Views:</strong> ${article.views || 0}</p>
  </div>
  
  <div class="content">
    ${article.content}
  </div>
  
  ${article.tags && article.tags.length > 0 ? `
    <div class="tags">
      <strong>Tags:</strong>
      ${article.tags.map((tag: string) => `<span class="tag">${tag}</span>`).join('')}
    </div>
  ` : ''}
</body>
</html>
  `.trim();
}
