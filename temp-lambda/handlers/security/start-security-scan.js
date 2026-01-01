"use strict";
/**
 * Start Security Scan Handler - Inicia um novo scan de segurança
 * Invoca o security-scan Lambda de forma assíncrona para evitar timeout
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const client_lambda_1 = require("@aws-sdk/client-lambda");
const SECURITY_SCAN_LAMBDA = process.env.SECURITY_SCAN_LAMBDA || 'evo-uds-v3-production-security-scan';
async function handler(event, context) {
    console.log('🔍 Start Security Scan');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { scanType = 'full', accountId, scanLevel = 'standard' } = body;
        const prisma = (0, database_js_1.getPrismaClient)();
        // Get AWS credentials from database
        const credentialRecord = await prisma.awsCredential.findFirst({
            where: {
                organization_id: organizationId,
                ...(accountId ? { id: accountId } : {}),
                is_active: true
            }
        });
        if (!credentialRecord) {
            return (0, response_js_1.badRequest)('No AWS credentials found for this account');
        }
        // Create scan record immediately to provide instant feedback
        const scan = await prisma.securityScan.create({
            data: {
                organization_id: organizationId,
                aws_account_id: credentialRecord.id,
                scan_type: `${scanLevel}-security-scan`,
                status: 'running',
                scan_config: {
                    regions: credentialRecord.regions?.length ? credentialRecord.regions : ['us-east-1'],
                    level: scanLevel,
                    engine: 'v3'
                },
            },
        });
        console.log('✅ Scan record created:', scan.id);
        // Invoke security-scan Lambda asynchronously
        // This ensures the scan runs in its own Lambda execution context
        const lambdaClient = new client_lambda_1.LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
        // Build the event payload for security-scan Lambda
        const scanPayload = {
            body: JSON.stringify({
                accountId: credentialRecord.id,
                scanLevel,
                scanId: scan.id // Pass the scan ID to the main handler
            }),
            requestContext: event.requestContext,
            headers: event.headers
        };
        try {
            // Invoke asynchronously (Event invocation type)
            await lambdaClient.send(new client_lambda_1.InvokeCommand({
                FunctionName: SECURITY_SCAN_LAMBDA,
                InvocationType: 'Event', // Async invocation - returns immediately
                Payload: Buffer.from(JSON.stringify(scanPayload))
            }));
            console.log('✅ Security Scan Lambda invoked asynchronously');
        }
        catch (invokeError) {
            console.error('Failed to invoke security-scan Lambda:', invokeError);
            // Update scan status to failed if Lambda invocation fails
            await prisma.securityScan.update({
                where: { id: scan.id },
                data: {
                    status: 'failed',
                    completed_at: new Date(),
                    results: { error: invokeError.message }
                }
            });
            return (0, response_js_1.error)('Failed to start security scan: ' + invokeError.message);
        }
        return (0, response_js_1.success)({
            status: 'started',
            message: `Scan de segurança iniciado. Acompanhe o progresso na lista de scans.`,
            scanType,
            scanLevel,
            scanId: scan.id
        });
    }
    catch (err) {
        console.error('❌ Start Security Scan error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=start-security-scan.js.map