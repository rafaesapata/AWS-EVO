/**
 * Start Security Scan Handler - Inicia um novo scan de segurança
 * Invoca o security-scan Lambda de forma assíncrona para evitar timeout
 */

import { getHttpMethod } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

interface RequestBody {
  scanType: 'vulnerability' | 'compliance' | 'configuration' | 'network' | 'full';
  accountId?: string;
  organizationId?: string;
  scanLevel?: 'quick' | 'standard' | 'deep';
}

const SECURITY_SCAN_LAMBDA = process.env.SECURITY_SCAN_LAMBDA || 'evo-uds-v3-production-security-scan';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  console.log('🔍 Start Security Scan');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: RequestBody = event.body ? JSON.parse(event.body) : {};
    const { scanType = 'full', accountId, scanLevel = 'standard' } = body;
    
    const prisma = getPrismaClient();
    
    // Get AWS credentials from database
    const credentialRecord = await prisma.awsCredential.findFirst({
      where: {
        organization_id: organizationId,
        ...(accountId ? { id: accountId } : {}),
        is_active: true
      }
    });
    
    if (!credentialRecord) {
      return badRequest('No AWS credentials found for this account');
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
    const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
    
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
      await lambdaClient.send(new InvokeCommand({
        FunctionName: SECURITY_SCAN_LAMBDA,
        InvocationType: 'Event', // Async invocation - returns immediately
        Payload: Buffer.from(JSON.stringify(scanPayload))
      }));
      
      console.log('✅ Security Scan Lambda invoked asynchronously');
    } catch (invokeError) {
      console.error('Failed to invoke security-scan Lambda:', invokeError);
      
      // Update scan status to failed if Lambda invocation fails
      await prisma.securityScan.update({
        where: { id: scan.id },
        data: { 
          status: 'failed',
          completed_at: new Date(),
          results: { error: (invokeError as Error).message }
        }
      });
      
      return error('Failed to start security scan: ' + (invokeError as Error).message);
    }
    
    return success({
      status: 'started',
      message: `Scan de segurança iniciado. Acompanhe o progresso na lista de scans.`,
      scanType,
      scanLevel,
      scanId: scan.id
    });
    
  } catch (err) {
    console.error('❌ Start Security Scan error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
