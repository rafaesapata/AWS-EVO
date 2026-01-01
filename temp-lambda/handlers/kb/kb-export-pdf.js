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
    logging_js_1.logger.info('🚀 KB Export PDF started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { articleId } = body;
        if (!articleId) {
            return (0, response_js_1.error)('Missing required parameter: articleId');
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        const article = await prisma.knowledgeBaseArticle.findFirst({
            where: {
                id: articleId,
                organization_id: organizationId,
            },
        });
        if (!article) {
            return (0, response_js_1.error)('Article not found');
        }
        // Gerar HTML
        const html = generateArticleHTML(article);
        // Upload para S3
        const s3Client = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
        const bucketName = process.env.REPORTS_BUCKET_NAME || 'evo-uds-reports';
        const filename = `kb-article-${articleId}-${Date.now()}.html`;
        const key = `${organizationId}/kb/${filename}`;
        await s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: html,
            ContentType: 'text/html',
        }));
        const downloadUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, new client_s3_1.PutObjectCommand({ Bucket: bucketName, Key: key }), { expiresIn: 3600 });
        logging_js_1.logger.info(`✅ Exported KB article: ${article.title}`);
        return (0, response_js_1.success)({
            success: true,
            filename,
            downloadUrl,
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ KB Export PDF error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
function generateArticleHTML(article) {
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
      ${article.tags.map((tag) => `<span class="tag">${tag}</span>`).join('')}
    </div>
  ` : ''}
</body>
</html>
  `.trim();
}
//# sourceMappingURL=kb-export-pdf.js.map