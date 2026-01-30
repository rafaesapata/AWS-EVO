/**
 * Azure Defender Scan Handler
 * 
 * Fetches security alerts from Microsoft Defender for Cloud.
 * Equivalent to AWS GuardDuty integration.
 */

// Ensure crypto is available globally for Azure SDK
import * as crypto from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = crypto.webcrypto || crypto;
}

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

const defenderScanSchema = z.object({
  credentialId: z.string().uuid('Invalid credential ID'),
  severity: z.enum(['High', 'Medium', 'Low', 'Informational']).optional(),
  status: z.enum(['Active', 'Resolved', 'Dismissed']).optional(),
  limit: z.number().min(1).max(500).default(100),
});

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    logger.info('Starting Azure Defender scan', { organizationId });

    // Parse and validate request body
    const validation = parseAndValidateBody(defenderScanSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const { credentialId, severity, status, limit = 100 } = validation.data;

    // Fetch Azure credential
    const credential = await prisma.azureCredential.findFirst({
      where: {
        id: credentialId,
        organization_id: organizationId,
        is_active: true,
      },
    });

    if (!credential) {
      return error('Azure credential not found or inactive', 404);
    }

    // Import Azure SDK dynamically and create token credential
    let SecurityCenter: any;
    let tokenCredential: any;
    
    try {
      const security = await import('@azure/arm-security');
      SecurityCenter = security.SecurityCenter;
      
      // Handle both OAuth and Service Principal credentials
      if (credential.auth_type === 'oauth') {
        // Use getAzureCredentialWithToken for OAuth
        const { getAzureCredentialWithToken } = await import('../../lib/azure-helpers.js');
        const tokenResult = await getAzureCredentialWithToken(prisma, credentialId, organizationId);
        
        if (!tokenResult.success) {
          return error(tokenResult.error, 400);
        }
        
        // Create a token credential that returns the OAuth token
        tokenCredential = {
          getToken: async () => ({
            token: tokenResult.accessToken,
            expiresOnTimestamp: Date.now() + 3600 * 1000,
          }),
        };
      } else {
        // Service Principal credentials - validate required fields
        if (!credential.tenant_id || !credential.client_id || !credential.client_secret) {
          return error('Service Principal credentials incomplete. Missing tenant_id, client_id, or client_secret.', 400);
        }
        const identity = await import('@azure/identity');
        tokenCredential = new identity.ClientSecretCredential(
          credential.tenant_id,
          credential.client_id,
          credential.client_secret
        );
      }
    } catch (err: any) {
      logger.error('Azure SDK not installed', { error: err.message });
      return error('Azure SDK not available. Contact administrator.', 500);
    }

    const securityClient = new SecurityCenter(
      tokenCredential,
      credential.subscription_id
    );

    const alerts: any[] = [];
    let alertCount = 0;

    try {
      for await (const alert of securityClient.alerts.list()) {
        if (limit && alertCount >= limit) break;
        
        // Filter by severity if specified
        if (severity && alert.severity !== severity) continue;
        
        // Filter by status if specified
        if (status && alert.status !== status) continue;

        alerts.push({
          id: alert.name,
          alertType: alert.alertType,
          severity: alert.severity,
          title: alert.alertDisplayName,
          description: alert.description,
          resourceId: alert.compromisedEntity,
          status: alert.status,
          intent: alert.intent,
          startTime: alert.startTimeUtc,
          endTime: alert.endTimeUtc,
          remediationSteps: alert.remediationSteps,
        });

        alertCount++;
      }
    } catch (err: any) {
      logger.warn('Error fetching Defender alerts', { error: err.message });
      // Continue with empty alerts if API fails
    }

    // Store findings in database
    const findingsToCreate = alerts.map(alert => ({
      organization_id: organizationId,
      azure_credential_id: credentialId,
      alert_id: alert.id,
      alert_type: alert.alertType || 'Unknown',
      severity: alert.severity || 'Medium',
      title: alert.title || 'Security Alert',
      description: alert.description,
      resource_id: alert.resourceId,
      status: alert.status || 'active',
      intent: alert.intent,
      remediation_steps: alert.remediationSteps || [],
      start_time: alert.startTime ? new Date(alert.startTime) : null,
      end_time: alert.endTime ? new Date(alert.endTime) : null,
    }));

    // Upsert findings
    for (const finding of findingsToCreate) {
      await (prisma as any).azureDefenderFinding.upsert({
        where: {
          azure_credential_id_alert_id: {
            azure_credential_id: finding.azure_credential_id,
            alert_id: finding.alert_id,
          },
        },
        update: {
          status: finding.status,
          end_time: finding.end_time,
          updated_at: new Date(),
        },
        create: finding,
      });
    }

    // Get summary
    const summary = {
      total: alerts.length,
      high: alerts.filter(a => a.severity === 'High').length,
      medium: alerts.filter(a => a.severity === 'Medium').length,
      low: alerts.filter(a => a.severity === 'Low').length,
      informational: alerts.filter(a => a.severity === 'Informational').length,
      active: alerts.filter(a => a.status === 'Active').length,
      resolved: alerts.filter(a => a.status === 'Resolved').length,
    };

    logger.info('Azure Defender scan completed', {
      organizationId,
      credentialId,
      alertsFound: alerts.length,
    });

    return success({
      alerts,
      summary,
      subscriptionId: credential.subscription_id,
      subscriptionName: credential.subscription_name,
    });
  } catch (err: any) {
    logger.error('Error running Azure Defender scan', { error: err.message });
    return error(err.message || 'Failed to run Azure Defender scan', 500);
  }
}
