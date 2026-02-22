/**
 * Manage Email Templates Handler (Super Admin Only)
 * CRUD operations for email templates
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

// Field length constants for consistency with database schema
const FIELD_LIMITS = {
  TEMPLATE_TYPE: 100,
  NAME: 255,
  SUBJECT: 500,
  CATEGORY: 100,
} as const;

// Validation schemas using discriminated union
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

// Combined schema using discriminated union for type safety
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

// Type definitions for raw query results
interface EmailTemplateRow {
  id: string;
  template_type: string;
  name: string;
  description: string | null;
  subject: string;
  html_body: string;
  text_body: string | null;
  variables: string[];
  category: string;
  header_image_url: string | null;
  is_active: boolean;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
}

interface CountResult {
  count: bigint;
}

interface IdResult {
  id: string;
}

interface SystemCheckResult {
  id: string;
  is_system: boolean;
  template_type: string;
}

/**
 * Replaces template variables with provided values or placeholders
 */
function replaceVariables(
  content: string,
  templateVariables: string[],
  providedValues: Record<string, string>
): string {
  let result = content;
  for (const variable of templateVariables) {
    const value = providedValues[variable] || `{${variable}}`;
    const regex = new RegExp(`\\{${variable}\\}`, 'g');
    result = result.replace(regex, value);
  }
  return result;
}

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('📧 Manage email templates started');

  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    
    // Super admin only
    if (!isSuperAdmin(user)) {
      return forbidden('Super admin access required');
    }

    const validation = parseAndValidateBody(requestSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const data = validation.data as RequestData;
    const prisma = getPrismaClient();

    logger.info(`🔧 Action: ${data.action}`);

    switch (data.action) {
      case 'create': {
        // Check if template_type already exists
        const existing = await prisma.$queryRaw<CountResult[]>`
          SELECT COUNT(*) as count FROM email_templates WHERE template_type = ${data.template_type}
        `;
        
        if (existing[0]?.count > 0n) {
          return badRequest(`Template type '${data.template_type}' already exists`);
        }

        const result = await prisma.$queryRaw<IdResult[]>`
          INSERT INTO email_templates (
            template_type, name, description, subject, html_body, text_body, 
            variables, category, header_image_url, is_active, is_system, created_by, updated_by
          ) VALUES (
            ${data.template_type}, ${data.name}, ${data.description || null}, 
            ${data.subject}, ${data.html_body}, ${data.text_body || null},
            ${data.variables}::text[], ${data.category}, ${data.header_image_url || null}, ${data.is_active}, 
            false, ${user.sub}::uuid, ${user.sub}::uuid
          )
          RETURNING id
        `;

        logger.info(`✅ Template created: ${data.template_type}`, { 
          templateId: result[0].id,
          createdBy: user.sub 
        });
        
        return success({ 
          message: 'Template created successfully', 
          id: result[0].id,
          template_type: data.template_type,
        });
      }

      case 'update': {
        // Check template exists and is not system template
        const template = await prisma.$queryRaw<SystemCheckResult[]>`
          SELECT id, is_system, template_type FROM email_templates WHERE id = ${data.id}::uuid
        `;

        if (template.length === 0) {
          return badRequest('Template not found');
        }

        if (template[0].is_system) {
          return forbidden('Cannot modify system templates');
        }

        // Build dynamic update - using raw SQL for flexibility
        const setClauses: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;
        
        if (data.name !== undefined) {
          setClauses.push(`name = $${paramIndex++}`);
          values.push(data.name);
        }
        if (data.description !== undefined) {
          setClauses.push(`description = $${paramIndex++}`);
          values.push(data.description);
        }
        if (data.subject !== undefined) {
          setClauses.push(`subject = $${paramIndex++}`);
          values.push(data.subject);
        }
        if (data.html_body !== undefined) {
          setClauses.push(`html_body = $${paramIndex++}`);
          values.push(data.html_body);
        }
        if (data.text_body !== undefined) {
          setClauses.push(`text_body = $${paramIndex++}`);
          values.push(data.text_body);
        }
        if (data.variables !== undefined) {
          setClauses.push(`variables = $${paramIndex++}::text[]`);
          values.push(data.variables);
        }
        if (data.category !== undefined) {
          setClauses.push(`category = $${paramIndex++}`);
          values.push(data.category);
        }
        if (data.is_active !== undefined) {
          setClauses.push(`is_active = $${paramIndex++}`);
          values.push(data.is_active);
        }

        if (setClauses.length === 0) {
          return badRequest('No fields to update');
        }

        // Always update audit fields
        setClauses.push(`updated_by = $${paramIndex++}::uuid`);
        values.push(user.sub);
        setClauses.push('updated_at = NOW()');

        // Add the ID as the last parameter
        values.push(data.id);

        await prisma.$executeRawUnsafe(
          `UPDATE email_templates SET ${setClauses.join(', ')} WHERE id = $${paramIndex}::uuid`,
          ...values
        );

        logger.info(`✅ Template updated: ${data.id}`, { updatedBy: user.sub });
        return success({ message: 'Template updated successfully', id: data.id });
      }

      case 'delete': {
        // Check template exists and is not system template
        const template = await prisma.$queryRaw<SystemCheckResult[]>`
          SELECT id, is_system, template_type FROM email_templates WHERE id = ${data.id}::uuid
        `;

        if (template.length === 0) {
          return badRequest('Template not found');
        }

        if (template[0].is_system) {
          return forbidden('Cannot delete system templates');
        }

        await prisma.$executeRaw`
          DELETE FROM email_templates WHERE id = ${data.id}::uuid
        `;

        logger.info(`✅ Template deleted: ${template[0].template_type}`, { deletedBy: user.sub });
        return success({ message: 'Template deleted successfully', id: data.id });
      }

      case 'list': {
        let query = `
          SELECT id, template_type, name, description, subject, variables, 
                 category, is_active, is_system, created_at, updated_at
          FROM email_templates
          WHERE 1=1
        `;
        const params: unknown[] = [];
        let paramIndex = 1;

        if (data.category) {
          query += ` AND category = $${paramIndex++}`;
          params.push(data.category);
        }
        if (data.is_active !== undefined) {
          query += ` AND is_active = $${paramIndex++}`;
          params.push(data.is_active);
        }

        query += ' ORDER BY category, name';

        const templates = await prisma.$queryRawUnsafe<EmailTemplateRow[]>(query, ...params);
        return success({ templates });
      }

      case 'get': {
        if (!data.id && !data.template_type) {
          return badRequest('Either id or template_type is required');
        }

        let template: EmailTemplateRow[];
        
        if (data.id) {
          template = await prisma.$queryRaw<EmailTemplateRow[]>`
            SELECT id, template_type, name, description, subject, html_body, text_body,
                   variables, category, is_active, is_system, created_at, updated_at
            FROM email_templates
            WHERE id = ${data.id}::uuid
          `;
        } else {
          template = await prisma.$queryRaw<EmailTemplateRow[]>`
            SELECT id, template_type, name, description, subject, html_body, text_body,
                   variables, category, is_active, is_system, created_at, updated_at
            FROM email_templates
            WHERE template_type = ${data.template_type}
          `;
        }

        if (template.length === 0) {
          return badRequest('Template not found');
        }

        return success({ template: template[0] });
      }

      case 'preview': {
        if (!data.id && !data.template_type) {
          return badRequest('Either id or template_type is required');
        }

        let template: EmailTemplateRow[];
        
        if (data.id) {
          template = await prisma.$queryRaw<EmailTemplateRow[]>`
            SELECT id, template_type, name, description, subject, html_body, text_body,
                   variables, category, is_active, is_system, created_at, updated_at
            FROM email_templates
            WHERE id = ${data.id}::uuid
          `;
        } else {
          template = await prisma.$queryRaw<EmailTemplateRow[]>`
            SELECT id, template_type, name, description, subject, html_body, text_body,
                   variables, category, is_active, is_system, created_at, updated_at
            FROM email_templates
            WHERE template_type = ${data.template_type}
          `;
        }

        if (template.length === 0) {
          return badRequest('Template not found');
        }

        const vars = data.variables || {};
        const previewSubject = replaceVariables(template[0].subject, template[0].variables, vars);
        const previewHtml = replaceVariables(template[0].html_body, template[0].variables, vars);

        return success({
          template: {
            ...template[0],
            preview_subject: previewSubject,
            preview_html: previewHtml,
          },
        });
      }

      default:
        return badRequest('Invalid action');
    }
  } catch (err) {
    logger.error('❌ Manage email templates error:', err);
    return error('Failed to manage email templates. Please try again.', 500);
  }
}
