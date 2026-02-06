/**
 * Storage Handlers - Upload, Download e Delete de arquivos no S3
 */

import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const DEFAULT_BUCKET = process.env.S3_BUCKET || 'evo-uds-v3-sandbox-attachments-971354623291';

// Zod schemas for storage operations
const uploadRequestSchema = z.object({
  fileName: z.string().min(1, 'File name is required').max(255),
  contentType: z.string().max(100).optional(),
  content: z.string().optional(), // Base64 encoded
  bucket: z.string().max(100).optional(),
  path: z.string().max(500).optional(),
});

const downloadRequestSchema = z.object({
  bucket: z.string().max(100).optional(),
  path: z.string().min(1, 'Path is required').max(500),
});

const deleteRequestSchema = z.object({
  bucket: z.string().max(100).optional(),
  path: z.string().min(1, 'Path is required').max(500),
});

// Upload Attachment Handler
export async function uploadHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  console.log('📤 Upload Attachment');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    // Validate input with Zod
    const validation = parseAndValidateBody(uploadRequestSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { fileName, contentType, content, bucket, path } = validation.data;
    
    const bucketName = bucket || DEFAULT_BUCKET;
    
    // SECURITY: Ensure path is scoped to the organization
    // Prevent path traversal attacks
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${organizationId}/${Date.now()}-${sanitizedFileName}`;
    
    if (content) {
      // Direct upload with content
      const buffer = Buffer.from(content, 'base64');
      
      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType || 'application/octet-stream',
        Metadata: {
          'organization-id': organizationId,
          'uploaded-by': user.sub,
          'original-name': fileName
        }
      }));
      
      return success({
        uploaded: true,
        bucket: bucketName,
        key,
        path: key,
        url: `https://${bucketName}.s3.amazonaws.com/${key}`
      });
    } else {
      // Generate presigned URL for client-side upload
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: contentType || 'application/octet-stream',
        Metadata: {
          'organization-id': organizationId,
          'uploaded-by': user.sub
        }
      });
      
      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      
      return success({
        presignedUrl,
        bucket: bucketName,
        key,
        path: key,
        expiresIn: 3600
      });
    }
    
  } catch (err) {
    console.error('❌ Upload error:', err);
    return error('An unexpected error occurred. Please try again.', 500);
  }
}

// Download Handler
export async function downloadHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  console.log('📥 Download Attachment');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    // Validate input with Zod
    const validation = parseAndValidateBody(downloadRequestSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { bucket, path } = validation.data;
    
    const bucketName = bucket || DEFAULT_BUCKET;
    
    // Verify organization access (path should start with org ID)
    if (!path.startsWith(organizationId) && !path.includes(`/${organizationId}/`)) {
      return error('Access denied', 403);
    }
    
    // Generate presigned URL for download
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: path
    });
    
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    
    return success({
      presignedUrl,
      bucket: bucketName,
      path,
      expiresIn: 3600
    });
    
  } catch (err) {
    console.error('❌ Download error:', err);
    return error('An unexpected error occurred. Please try again.', 500);
  }
}

// Delete Handler
export async function deleteHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  console.log('🗑️ Delete Attachment');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    // Validate input with Zod
    const validation = parseAndValidateBody(deleteRequestSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { bucket, path } = validation.data;
    
    const bucketName = bucket || DEFAULT_BUCKET;
    
    // Verify organization access
    if (!path.startsWith(organizationId) && !path.includes(`/${organizationId}/`)) {
      return error('Access denied', 403);
    }
    
    await s3Client.send(new DeleteObjectCommand({
      Bucket: bucketName,
      Key: path
    }));
    
    return success({
      deleted: true,
      bucket: bucketName,
      path
    });
    
  } catch (err) {
    console.error('❌ Delete error:', err);
    return error('An unexpected error occurred. Please try again.', 500);
  }
}

// Main handler that routes to specific storage function
export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const path = getHttpPath(event);
  
  if (path.includes('upload-attachment')) {
    return uploadHandler(event, context);
  } else if (path.includes('storage-download')) {
    return downloadHandler(event, context);
  } else if (path.includes('storage-delete')) {
    return deleteHandler(event, context);
  }
  
  return badRequest('Unknown storage operation');
}
