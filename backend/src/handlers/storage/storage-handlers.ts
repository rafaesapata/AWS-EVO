/**
 * Storage Handlers - Upload, Download e Delete de arquivos no S3
 */

import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const DEFAULT_BUCKET = process.env.S3_BUCKET || 'evo-uds-v3-production-attachments-383234048592';

interface UploadRequest {
  fileName: string;
  contentType: string;
  content?: string; // Base64 encoded
  bucket?: string;
  path?: string;
}

interface DownloadRequest {
  bucket?: string;
  path: string;
}

interface DeleteRequest {
  bucket?: string;
  path: string;
}

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
    const organizationId = getOrganizationId(user);
    
    const body: UploadRequest = event.body ? JSON.parse(event.body) : {};
    const { fileName, contentType, content, bucket, path } = body;
    
    if (!fileName) {
      return badRequest('File name is required');
    }
    
    const bucketName = bucket || DEFAULT_BUCKET;
    const key = path || `${organizationId}/${Date.now()}-${fileName}`;
    
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
    return error(err instanceof Error ? err.message : 'Internal server error');
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
    const organizationId = getOrganizationId(user);
    
    const body: DownloadRequest = event.body ? JSON.parse(event.body) : {};
    const { bucket, path } = body;
    
    if (!path) {
      return badRequest('Path is required');
    }
    
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
    return error(err instanceof Error ? err.message : 'Internal server error');
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
    const organizationId = getOrganizationId(user);
    
    const body: DeleteRequest = event.body ? JSON.parse(event.body) : {};
    const { bucket, path } = body;
    
    if (!path) {
      return badRequest('Path is required');
    }
    
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
    return error(err instanceof Error ? err.message : 'Internal server error');
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
