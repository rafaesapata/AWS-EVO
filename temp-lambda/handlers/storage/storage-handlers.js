"use strict";
/**
 * Storage Handlers - Upload, Download e Delete de arquivos no S3
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadHandler = uploadHandler;
exports.downloadHandler = downloadHandler;
exports.deleteHandler = deleteHandler;
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const s3Client = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const DEFAULT_BUCKET = process.env.S3_BUCKET || 'evo-uds-v3-production-attachments-383234048592';
// Upload Attachment Handler
async function uploadHandler(event, context) {
    console.log('📤 Upload Attachment');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { fileName, contentType, content, bucket, path } = body;
        if (!fileName) {
            return (0, response_js_1.badRequest)('File name is required');
        }
        const bucketName = bucket || DEFAULT_BUCKET;
        const key = path || `${organizationId}/${Date.now()}-${fileName}`;
        if (content) {
            // Direct upload with content
            const buffer = Buffer.from(content, 'base64');
            await s3Client.send(new client_s3_1.PutObjectCommand({
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
            return (0, response_js_1.success)({
                uploaded: true,
                bucket: bucketName,
                key,
                path: key,
                url: `https://${bucketName}.s3.amazonaws.com/${key}`
            });
        }
        else {
            // Generate presigned URL for client-side upload
            const command = new client_s3_1.PutObjectCommand({
                Bucket: bucketName,
                Key: key,
                ContentType: contentType || 'application/octet-stream',
                Metadata: {
                    'organization-id': organizationId,
                    'uploaded-by': user.sub
                }
            });
            const presignedUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, command, { expiresIn: 3600 });
            return (0, response_js_1.success)({
                presignedUrl,
                bucket: bucketName,
                key,
                path: key,
                expiresIn: 3600
            });
        }
    }
    catch (err) {
        console.error('❌ Upload error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
// Download Handler
async function downloadHandler(event, context) {
    console.log('📥 Download Attachment');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { bucket, path } = body;
        if (!path) {
            return (0, response_js_1.badRequest)('Path is required');
        }
        const bucketName = bucket || DEFAULT_BUCKET;
        // Verify organization access (path should start with org ID)
        if (!path.startsWith(organizationId) && !path.includes(`/${organizationId}/`)) {
            return (0, response_js_1.error)('Access denied', 403);
        }
        // Generate presigned URL for download
        const command = new client_s3_1.GetObjectCommand({
            Bucket: bucketName,
            Key: path
        });
        const presignedUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, command, { expiresIn: 3600 });
        return (0, response_js_1.success)({
            presignedUrl,
            bucket: bucketName,
            path,
            expiresIn: 3600
        });
    }
    catch (err) {
        console.error('❌ Download error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
// Delete Handler
async function deleteHandler(event, context) {
    console.log('🗑️ Delete Attachment');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { bucket, path } = body;
        if (!path) {
            return (0, response_js_1.badRequest)('Path is required');
        }
        const bucketName = bucket || DEFAULT_BUCKET;
        // Verify organization access
        if (!path.startsWith(organizationId) && !path.includes(`/${organizationId}/`)) {
            return (0, response_js_1.error)('Access denied', 403);
        }
        await s3Client.send(new client_s3_1.DeleteObjectCommand({
            Bucket: bucketName,
            Key: path
        }));
        return (0, response_js_1.success)({
            deleted: true,
            bucket: bucketName,
            path
        });
    }
    catch (err) {
        console.error('❌ Delete error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
// Main handler that routes to specific storage function
async function handler(event, context) {
    const path = (0, middleware_js_1.getHttpPath)(event);
    if (path.includes('upload-attachment')) {
        return uploadHandler(event, context);
    }
    else if (path.includes('storage-download')) {
        return downloadHandler(event, context);
    }
    else if (path.includes('storage-delete')) {
        return deleteHandler(event, context);
    }
    return (0, response_js_1.badRequest)('Unknown storage operation');
}
//# sourceMappingURL=storage-handlers.js.map