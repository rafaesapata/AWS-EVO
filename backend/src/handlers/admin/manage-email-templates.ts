/**
 * Manage Email Templates Handler (Super Admin Only)
 * CRUD operations for email templates + image upload via S3 presigned URL
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, forbidden, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, isSuperAdmin } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { z } from 'zod';
import { parseAndValidateBody } from '../../lib/validation.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';

const FIELD_LIMITS = {
  TEMPLATE_TYPE: 100,
  NAME: 255,
  SUBJECT: 500,
  CATEGORY: 100,
} as const;

const S3_BUCKET = process.env.S3_UPLOADS_BUCKET || 'evo-uds-uploads';
const S3_REGION = process.env.AWS_REGION || 'us-east-1';

const createTemplateSchema = z.object({
  action: z.literal('create'),
  template_type: z.string().min(1).max(FIELD_LIMITS.TEMPLATE_TYPE),
  name: z.string().min(1).max(FIELD_LIMITS.NAME),
  description: z.string().optional(),
  subject: z.string().min(1).max(FIELD_LIMITS.SUBJECT),
  html_body: z.string().min(1),
  text_body: z.string().optional(),
  variables: z.array(z.string()).default([]),
  category: z.string().max(FIELD_LIMITS.CATEGORY).default('general'),
  header_image_url: z.string().url().optional(),
  is_active: z.boolean().default(true),
});

const updateTemplateSchema = z.object({
  action: z.literal('update'),
  id: z.string().uuid(),
  name: z.string().min(1).max(FIELD_LIMITS.NAME).optional(),
  description: z.string().optional(),
  subject: z.string().min(1).max(FIELD_LIMITS.SUBJECT).optional(),
  html_body: z.string().min(1).optional(),
  text_body: z.string().optional(),
  variables: z.array(z.string()).optional(),
  category: z.string().max(FIELD_LIMITS.CATEGORY).optional(),
  header_image_url: z.string().url().nullable().optional(),
  is_active: z.boolean().optional(),
});

const deleteTemplateSchema = z.object({
  action: z.literal('delete'),
  id: z.string().uuid(),
});

const listTemplatesSchema = z.object({
  action: z.literal('list'),
  category: z.string().optional(),
  is_active: z.boolean().optional(),
});

const getTemplateSchema = z.object({
  action: z.literal('get'),
  id: z.string().uuid().optional(),
  template_type: z.string().optional(),
});

const previewTemplateSchema = z.object({
  action: z.literal('preview'),
  id: z.string().uuid().optional(),
  template_type: z.string().optional(),
  variables: z.record(z.string()).optional(),
});

const uploadImageSchema = z.object({
  action: z.literal('upload_image'),
  id: z.string().uuid(),
  filename: z.string().min(1).max(255),
  content_type: z.string().regex(/^image\/(png|jpeg|jpg|gif|svg\+xml|webp)$/),
});

const requestSchema = z.discriminatedUnion('action', [
  createTemplateSchema,
  updateTemplateSchema,
  deleteTemplateSchema,
  listTemplatesSchema,
  getTemplateSchema,
  previewTemplateSchema,
  uploadImageSchema,
]);

type RequestData = z.infer<typeof requestSchema>;

// System template types that cannot be deleted, only edited (visual/content fields)
const SYSTEM_TEMPLATE_TYPES = [
  'security_scan_report', 'welcome', 'password_changed', 'critical_alert',
  'daily_summary', 'weekly_report', 'proactive_notification', 'password_reset', 'sla_escalation',
];

// Fields that can be edited on system templates
const SYSTEM_EDITABLE_FIELDS = [
  'name', 'description', 'subject', 'html_body', 'text_body', 'variables',
  'category', 'header_image_url', 'is_active',
];

function replaceVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

export async function handler(event: AuthorizedEvent, _context: LambdaContext): Promise<APIGatewayProxyResultV2> {
  const method = getHttpMethod(event);
  if (method === 'OPTIONS') return corsOptions();

  const user = getUserFromEvent(event);
  if (!isSuperAdmin(user)) {
    return forbidden('Only super admins can manage email templates');
  }

  const validation = parseAndValidateBody(requestSchema, event.body);
  if (!validation.success) {
    return validation.error;
  }

  const data = validation.data as RequestData;
  const prisma = getPrismaClient();

  try {
    let result: APIGatewayProxyResultV2;

    switch (data.action) {
      case 'create':
        result = await handleCreate(prisma, data, user.sub);
        break;
      case 'update':
        result = await handleUpdate(prisma, data, user.sub);
        break;
      case 'delete':
        result = await handleDelete(prisma, data);
        break;
      case 'list':
        return await handleList(prisma, data);
      case 'get':
        return await handleGet(prisma, data);
      case 'preview':
        return await handlePreview(prisma, data);
      case 'upload_image':
        result = await handleUploadImage(prisma, data);
        break;
      default:
        return badRequest('Unknown action');
    }

    // Audit log for mutating actions
    if (['create', 'update', 'delete', 'upload_image'].includes(data.action)) {
      const resourceId = 'id' in data ? data.id : ('template_type' in data ? data.template_type : 'unknown');
      logAuditAsync({
        organizationId: 'system',
        userId: user.sub,
        action: 'SETTINGS_UPDATE',
        resourceType: 'settings',
        resourceId: String(resourceId),
        details: { sub_action: 'email_template_' + data.action },
        ipAddress: getIpFromEvent(event),
        userAgent: getUserAgentFromEvent(event),
      });
    }

    return result;
  } catch (err) {
    logger.error('manage-email-templates error', err as Error);
    return error('Internal server error');
  }
}

async function handleCreate(
  prisma: ReturnType<typeof getPrismaClient>,
  data: z.infer<typeof createTemplateSchema>,
  userId: string
): Promise<APIGatewayProxyResultV2> {
  // Check if template_type already exists
  const existing = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id FROM "email_templates" WHERE template_type = $1 LIMIT 1`,
    data.template_type
  );
  if (existing.length > 0) {
    return badRequest(`Template type '${data.template_type}' already exists`);
  }

  const result = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO "email_templates" (template_type, name, description, subject, html_body, text_body, variables, category, header_image_url, is_active, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     RETURNING id, template_type, name, description, subject, category, header_image_url, is_active, is_system, created_at`,
    data.template_type, data.name, data.description || null, data.subject,
    data.html_body, data.text_body || null,
    JSON.stringify(data.variables), data.category,
    data.header_image_url || null, data.is_active, userId
  );

  return success({ template: result[0] });
}

async function handleUpdate(
  prisma: ReturnType<typeof getPrismaClient>,
  data: z.infer<typeof updateTemplateSchema>,
  userId: string
): Promise<APIGatewayProxyResultV2> {
  // Check template exists
  const existing = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, is_system, template_type FROM "email_templates" WHERE id = $1`,
    data.id
  );
  if (existing.length === 0) {
    return badRequest('Template not found');
  }

  const template = existing[0];
  const isSystem = template.is_system;

  // Build dynamic SET clause
  const setClauses: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  const fieldsToUpdate: Record<string, any> = {
    name: data.name,
    description: data.description,
    subject: data.subject,
    html_body: data.html_body,
    text_body: data.text_body,
    variables: data.variables !== undefined ? JSON.stringify(data.variables) : undefined,
    category: data.category,
    header_image_url: data.header_image_url,
    is_active: data.is_active,
  };

  for (const [field, value] of Object.entries(fieldsToUpdate)) {
    if (value === undefined) continue;
    // System templates: only allow editable fields
    if (isSystem && !SYSTEM_EDITABLE_FIELDS.includes(field)) continue;
    setClauses.push(field + ' = $' + paramIndex++);
    params.push(value);
  }

  if (setClauses.length === 0) {
    return badRequest('No valid fields to update');
  }

  setClauses.push('updated_by = $' + paramIndex++);
  params.push(userId);
  setClauses.push('updated_at = NOW()');
  params.push(data.id);

  const whereParam = '$' + paramIndex;
  const result = await prisma.$queryRawUnsafe<any[]>(
    'UPDATE "email_templates" SET ' + setClauses.join(', ') + ' WHERE id = ' + whereParam +
    ' RETURNING id, template_type, name, description, subject, category, header_image_url, is_active, is_system, updated_at',
    ...params
  );

  return success({ template: result[0] });
}

async function handleDelete(
  prisma: ReturnType<typeof getPrismaClient>,
  data: z.infer<typeof deleteTemplateSchema>
): Promise<APIGatewayProxyResultV2> {
  const existing = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, is_system, template_type FROM "email_templates" WHERE id = $1`,
    data.id
  );
  if (existing.length === 0) {
    return badRequest('Template not found');
  }
  if (existing[0].is_system) {
    return badRequest('System templates cannot be deleted, only edited');
  }

  await prisma.$queryRawUnsafe(`DELETE FROM "email_templates" WHERE id = $1`, data.id);
  return success({ deleted: true, id: data.id });
}

async function handleList(
  prisma: ReturnType<typeof getPrismaClient>,
  data: z.infer<typeof listTemplatesSchema>
): Promise<APIGatewayProxyResultV2> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (data.category) {
    conditions.push('category = $' + paramIndex++);
    params.push(data.category);
  }
  if (data.is_active !== undefined) {
    conditions.push('is_active = $' + paramIndex++);
    params.push(data.is_active);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const templates = await prisma.$queryRawUnsafe<any[]>(
    'SELECT id, template_type, name, description, subject, category, header_image_url,' +
    ' is_active, is_system, variables, created_at, updated_at' +
    ' FROM "email_templates" ' + whereClause +
    ' ORDER BY is_system DESC, category, name',
    ...params
  );

  return success({ templates, total: templates.length });
}

async function handleGet(
  prisma: ReturnType<typeof getPrismaClient>,
  data: z.infer<typeof getTemplateSchema>
): Promise<APIGatewayProxyResultV2> {
  if (!data.id && !data.template_type) {
    return badRequest('Either id or template_type is required');
  }

  let template: any[];
  if (data.id) {
    template = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, template_type, name, description, subject, html_body, text_body,
              variables, category, header_image_url, is_active, is_system, created_at, updated_at
       FROM "email_templates" WHERE id = $1`,
      data.id
    );
  } else {
    template = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, template_type, name, description, subject, html_body, text_body,
              variables, category, header_image_url, is_active, is_system, created_at, updated_at
       FROM "email_templates" WHERE template_type = $1`,
      data.template_type!
    );
  }

  if (template.length === 0) {
    return badRequest('Template not found');
  }

  return success({ template: template[0] });
}

async function handlePreview(
  prisma: ReturnType<typeof getPrismaClient>,
  data: z.infer<typeof previewTemplateSchema>
): Promise<APIGatewayProxyResultV2> {
  if (!data.id && !data.template_type) {
    return badRequest('Either id or template_type is required');
  }

  let template: any[];
  if (data.id) {
    template = await prisma.$queryRawUnsafe<any[]>(
      `SELECT subject, html_body, text_body, variables, header_image_url FROM "email_templates" WHERE id = $1`,
      data.id
    );
  } else {
    template = await prisma.$queryRawUnsafe<any[]>(
      `SELECT subject, html_body, text_body, variables, header_image_url FROM "email_templates" WHERE template_type = $1`,
      data.template_type!
    );
  }

  if (template.length === 0) {
    return badRequest('Template not found');
  }

  const t = template[0];
  const vars = data.variables || {};

  // Inject header image if available
  if (t.header_image_url) {
    vars['headerImage'] = t.header_image_url;
  }

  return success({
    subject: replaceVariables(t.subject, vars),
    html: replaceVariables(t.html_body, vars),
    text: t.text_body ? replaceVariables(t.text_body, vars) : null,
  });
}

async function handleUploadImage(
  prisma: ReturnType<typeof getPrismaClient>,
  data: z.infer<typeof uploadImageSchema>
): Promise<APIGatewayProxyResultV2> {
  // Verify template exists
  const existing = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id FROM "email_templates" WHERE id = $1`,
    data.id
  );
  if (existing.length === 0) {
    return badRequest('Template not found');
  }

  // Generate S3 presigned URL
  const s3Key = `email-templates/${data.id}/${Date.now()}-${data.filename}`;
  const s3Client = new S3Client({ region: S3_REGION });

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3Key,
    ContentType: data.content_type,
  });

  const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 });
  const publicUrl = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${s3Key}`;

  // Update template with the image URL
  await prisma.$queryRawUnsafe(
    `UPDATE "email_templates" SET header_image_url = $1, updated_at = NOW() WHERE id = $2`,
    publicUrl, data.id
  );

  return success({
    presigned_url: presignedUrl,
    public_url: publicUrl,
    s3_key: s3Key,
    expires_in: 600,
  });
}
