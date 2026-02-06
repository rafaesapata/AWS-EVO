/**
 * Ticket Attachments Handler
 * Handles secure file uploads and downloads for tickets using S3
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const S3_BUCKET = process.env.TICKET_ATTACHMENTS_BUCKET || 'evo-uds-v3-ticket-attachments';
const S3_REGION = process.env.AWS_REGION || 'us-east-1';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const PRESIGNED_URL_EXPIRY = 3600; // 1 hour

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'text/plain', 'text/csv', 'text/markdown',
  'application/json', 'application/xml',
  'application/zip', 'application/gzip',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const s3Client = new S3Client({ region: S3_REGION });

// ==================== SCHEMAS ====================

const requestUploadSchema = z.object({
  ticketId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().min(1).max(MAX_FILE_SIZE),
  mimeType: z.string(),
  description: z.string().max(500).optional(),
  commentId: z.string().uuid().optional(),
});

const confirmUploadSchema = z.object({
  attachmentId: z.string().uuid(),
});

const getDownloadUrlSchema = z.object({
  attachmentId: z.string().uuid(),
});

const deleteAttachmentSchema = z.object({
  attachmentId: z.string().uuid(),
});

// ==================== HELPER FUNCTIONS ====================

function sanitizeFileName(fileName: string): string {
  // Remove path traversal attempts and special characters
  return fileName
    .replace(/\.\./g, '')
    .replace(/[\/\\]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .substring(0, 200);
}

function generateS3Key(organizationId: string, ticketId: string, fileName: string): string {
  const timestamp = Date.now();
  const uuid = randomUUID().substring(0, 8);
  const sanitized = sanitizeFileName(fileName);
  return `tickets/${organizationId}/${ticketId}/${timestamp}-${uuid}-${sanitized}`;
}

async function recordTicketHistory(
  prisma: any,
  ticketId: string,
  userId: string,
  userName: string | null,
  userEmail: string | null,
  action: string,
  comment?: string
) {
  return prisma.ticketHistory.create({
    data: {
      ticket_id: ticketId,
      user_id: userId,
      user_name: userName,
      user_email: userEmail,
      action,
      comment,
    },
  });
}

// ==================== MAIN HANDLER ====================

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const method = getHttpMethod(event);
  const origin = event.headers?.['origin'] || event.headers?.['Origin'] || '*';
  
  if (method === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();
    const body = event.body ? JSON.parse(event.body) : {};
    const action = body.action;

    logger.info(`Ticket attachments action: ${action}`, { userId: user.sub, organizationId });

    // ==================== REQUEST UPLOAD URL ====================
    
    if (action === 'request-upload') {
      const validation = requestUploadSchema.safeParse(body);
      if (!validation.success) {
        return error(`Validation error: ${validation.error.message}`, 400);
      }

      const { ticketId, fileName, fileSize, mimeType, description, commentId } = validation.data;

      // Validate mime type
      if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        return error(`File type not allowed: ${mimeType}. Allowed types: images, PDF, documents, text files, archives.`, 400);
      }

      // Verify ticket belongs to organization
      const ticket = await prisma.remediationTicket.findFirst({
        where: { id: ticketId, organization_id: organizationId },
      });

      if (!ticket) {
        return error('Ticket not found', 404);
      }

      // Generate S3 key
      const s3Key = generateS3Key(organizationId, ticketId, fileName);
      const sanitizedFileName = sanitizeFileName(fileName);

      // Create attachment record (pending upload)
      const attachment = await prisma.ticketAttachment.create({
        data: {
          ticket_id: ticketId,
          comment_id: commentId,
          file_name: sanitizedFileName,
          original_name: fileName,
          file_size: fileSize,
          mime_type: mimeType,
          s3_key: s3Key,
          s3_bucket: S3_BUCKET,
          uploaded_by: user.sub,
          uploaded_by_name: user.name || user.email,
          description,
        },
      });

      // Generate presigned upload URL
      const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        ContentType: mimeType,
        ContentLength: fileSize,
        Metadata: {
          'organization-id': organizationId,
          'ticket-id': ticketId,
          'attachment-id': attachment.id,
          'uploaded-by': user.sub,
        },
      });

      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 }); // 15 minutes

      return success({
        attachmentId: attachment.id,
        uploadUrl,
        s3Key,
        expiresIn: 900,
        message: 'Upload URL generated. Upload file within 15 minutes.',
      });
    }

    // ==================== CONFIRM UPLOAD ====================
    
    if (action === 'confirm-upload') {
      const validation = confirmUploadSchema.safeParse(body);
      if (!validation.success) {
        return error(`Validation error: ${validation.error.message}`, 400);
      }

      const { attachmentId } = validation.data;

      const attachment = await prisma.ticketAttachment.findFirst({
        where: { id: attachmentId },
        include: { ticket: true },
      });

      if (!attachment || attachment.ticket.organization_id !== organizationId) {
        return error('Attachment not found', 404);
      }

      // Verify file exists in S3
      try {
        const command = new GetObjectCommand({
          Bucket: attachment.s3_bucket,
          Key: attachment.s3_key,
        });
        await s3Client.send(command);
      } catch (s3Error) {
        // File doesn't exist, delete the attachment record
        await prisma.ticketAttachment.delete({ where: { id: attachmentId } });
        return error('File not found in storage. Please try uploading again.', 404);
      }

      // Record in history
      await recordTicketHistory(
        prisma,
        attachment.ticket_id,
        user.sub,
        user.name || user.email,
        user.email,
        'attachment_added',
        `Added attachment: ${attachment.original_name}`
      );

      return success({
        attachment,
        message: 'Upload confirmed successfully',
      });
    }

    // ==================== GET DOWNLOAD URL ====================
    
    if (action === 'get-download-url') {
      const validation = getDownloadUrlSchema.safeParse(body);
      if (!validation.success) {
        return error(`Validation error: ${validation.error.message}`, 400);
      }

      const { attachmentId } = validation.data;

      const attachment = await prisma.ticketAttachment.findFirst({
        where: { id: attachmentId, is_deleted: false },
        include: { ticket: true },
      });

      if (!attachment || attachment.ticket.organization_id !== organizationId) {
        return error('Attachment not found', 404);
      }

      // Generate presigned download URL
      const command = new GetObjectCommand({
        Bucket: attachment.s3_bucket,
        Key: attachment.s3_key,
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(attachment.original_name)}"`,
      });

      const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: PRESIGNED_URL_EXPIRY });

      return success({
        downloadUrl,
        fileName: attachment.original_name,
        mimeType: attachment.mime_type,
        fileSize: attachment.file_size,
        expiresIn: PRESIGNED_URL_EXPIRY,
      });
    }

    // ==================== DELETE ATTACHMENT ====================
    
    if (action === 'delete-attachment') {
      const validation = deleteAttachmentSchema.safeParse(body);
      if (!validation.success) {
        return error(`Validation error: ${validation.error.message}`, 400);
      }

      const { attachmentId } = validation.data;

      const attachment = await prisma.ticketAttachment.findFirst({
        where: { id: attachmentId, is_deleted: false },
        include: { ticket: true },
      });

      if (!attachment || attachment.ticket.organization_id !== organizationId) {
        return error('Attachment not found', 404);
      }

      // Soft delete the attachment
      await prisma.ticketAttachment.update({
        where: { id: attachmentId },
        data: {
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by: user.sub,
        },
      });

      // Optionally delete from S3 (or keep for audit purposes)
      // For now, we'll keep the file but mark as deleted in DB
      // To actually delete from S3:
      // await s3Client.send(new DeleteObjectCommand({ Bucket: attachment.s3_bucket, Key: attachment.s3_key }));

      await recordTicketHistory(
        prisma,
        attachment.ticket_id,
        user.sub,
        user.name || user.email,
        user.email,
        'attachment_removed',
        `Removed attachment: ${attachment.original_name}`
      );

      return success({ message: 'Attachment deleted successfully' });
    }

    // ==================== LIST ATTACHMENTS ====================
    
    if (action === 'list-attachments') {
      const { ticketId } = body;
      if (!ticketId) return error('ticketId is required', 400);

      const ticket = await prisma.remediationTicket.findFirst({
        where: { id: ticketId, organization_id: organizationId },
      });

      if (!ticket) return error('Ticket not found', 404);

      const attachments = await prisma.ticketAttachment.findMany({
        where: { ticket_id: ticketId, is_deleted: false },
        orderBy: { created_at: 'desc' },
      });

      const totalSize = attachments.reduce((sum: number, a: any) => sum + a.file_size, 0);

      return success({
        attachments,
        count: attachments.length,
        totalSize,
        totalSizeFormatted: formatFileSize(totalSize),
      });
    }

    return error(`Unknown action: ${action}`, 400);

  } catch (err) {
    logger.error('Ticket attachments error:', err);
    return error('An unexpected error occurred. Please try again.', 500);
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
