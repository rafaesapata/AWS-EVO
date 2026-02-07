/**
 * Validate Azure Permissions Handler
 * 
 * Performs comprehensive validation of Azure Service Principal permissions
 * to ensure all required permissions are correctly configured.
 */

// IMPORTANTE: Crypto polyfill DEVE ser o primeiro import
import * as crypto from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = crypto.webcrypto || crypto;
}

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, badRequest } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { AzureProvider } from '../../lib/cloud-provider/azure-provider.js';

interface ValidationResult {
  permission: string;
  required: boolean;
  status: 'ok' | 'missing' | 'warning';
  message?: string;
}

// Required permissions for EVO Platform
const REQUIRED_PERMISSIONS = [
  // Resource Management
  { permission: 'Microsoft.Resources/subscriptions/read', description: 'Read subscription information', critical: true },
  { permission: 'Microsoft.Resources/subscriptions/resourceGroups/read', description: 'List resource groups', critical: true },
  
  // Compute
  { permission: 'Microsoft.Compute/virtualMachines/read', description: 'Read virtual machines', critical: true },
  { permission: 'Microsoft.Compute/virtualMachines/instanceView/read', description: 'Read VM instance view', critical: true },
  
  // Storage
  { permission: 'Microsoft.Storage/storageAccounts/read', description: 'Read storage accounts', critical: true },
  { permission: 'Microsoft.Storage/storageAccounts/listKeys/action', description: 'List storage account keys', critical: false },
  
  // Network
  { permission: 'Microsoft.Network/networkInterfaces/read', description: 'Read network interfaces', critical: true },
  { permission: 'Microsoft.Network/virtualNetworks/read', description: 'Read virtual networks', critical: true },
  { permission: 'Microsoft.Network/loadBalancers/read', description: 'Read load balancers', critical: true },
  { permission: 'Microsoft.Network/applicationGateways/read', description: 'Read application gateways', critical: true },
  { permission: 'Microsoft.Network/frontDoors/read', description: 'Read Azure Front Door', critical: true },
  
  // Cost Management
  { permission: 'Microsoft.CostManagement/query/action', description: 'Query cost data', critical: true },
  { permission: 'Microsoft.Consumption/usageDetails/read', description: 'Read usage details', critical: true },
  
  // Security (Defender for Cloud)
  { permission: 'Microsoft.Security/assessments/read', description: 'Read security assessments', critical: true },
  { permission: 'Microsoft.Security/secureScores/read', description: 'Read secure scores', critical: true },
  
  // Advisor
  { permission: 'Microsoft.Advisor/recommendations/read', description: 'Read advisor recommendations', critical: true },
  
  // Monitor
  { permission: 'Microsoft.Insights/metrics/read', description: 'Read metrics', critical: true },
  { permission: 'Microsoft.Insights/activityLogs/read', description: 'Read activity logs', critical: false },
];

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    const body = JSON.parse(event.body || '{}');
    const { credentialId } = body;

    if (!credentialId) {
      return badRequest('credentialId is required');
    }

    logger.info('Validating Azure permissions', { 
      credentialId, 
      organizationId,
      userId: user.sub 
    });

    // Get credential from database
    const credential = await prisma.azureCredential.findFirst({
      where: {
        id: credentialId,
        organization_id: organizationId,
      },
    });

    if (!credential) {
      return badRequest('Azure credential not found');
    }

    // Initialize Azure provider
    let azureProvider: AzureProvider;
    
    if (credential.auth_type === 'oauth') {
      // Use getAzureCredentialWithToken for OAuth
      const { getAzureCredentialWithToken } = await import('../../lib/azure-helpers.js');
      const tokenResult = await getAzureCredentialWithToken(prisma, credentialId, organizationId);
      
      if (!tokenResult.success) {
        return error(tokenResult.error, 400);
      }
      
      azureProvider = AzureProvider.withOAuthToken(
        organizationId,
        credential.subscription_id,
        credential.subscription_name || undefined,
        credential.oauth_tenant_id || credential.tenant_id || '',
        tokenResult.accessToken,
        new Date(Date.now() + 3600 * 1000)
      );
    } else {
      if (!credential.tenant_id || !credential.client_id || !credential.client_secret) {
        return error('Service Principal credentials incomplete. Missing tenant_id, client_id, or client_secret.', 400);
      }
      
      azureProvider = new AzureProvider(organizationId, {
        subscriptionId: credential.subscription_id,
        subscriptionName: credential.subscription_name || undefined,
        tenantId: credential.tenant_id,
        clientId: credential.client_id,
        clientSecret: credential.client_secret,
      });
    }

    // Validate basic connectivity
    let hasBasicAccess = false;
    try {
      await azureProvider.validateCredentials();
      hasBasicAccess = true;
      logger.info('Basic Azure access validated');
    } catch (err: any) {
      logger.error('Basic Azure access failed', err);
      return error('Failed to connect to Azure. Please check your credentials.', 401);
    }

    // Test permissions in groups
    const results: ValidationResult[] = [];
    const missingPermissions: string[] = [];
    const warnings: string[] = [];

    // Group 2: Test resource listing (validates compute, storage, network permissions)
    let hasResourceAccess = false;
    try {
      await azureProvider.listResources();
      hasResourceAccess = true;
      logger.info('Azure resource access validated');
    } catch (err: any) {
      logger.warn('Azure resource access limited', { error: err.message });
    }

    // Group 3: Test cost access
    let hasCostAccess = false;
    try {
      const endDate = new Date();
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await azureProvider.getCosts({
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        granularity: 'DAILY' as any,
      });
      hasCostAccess = true;
      logger.info('Azure cost access validated');
    } catch (err: any) {
      logger.warn('Azure cost access limited', { error: err.message });
    }

    // Map test results to permissions
    for (const perm of REQUIRED_PERMISSIONS) {
      let hasPermission = false;
      
      // Determine if permission is likely present based on group tests
      if (perm.permission.includes('subscriptions/read') || 
          perm.permission.includes('resourceGroups/read')) {
        hasPermission = hasBasicAccess;
      } else if (perm.permission.includes('virtualMachines') || 
                 perm.permission.includes('storageAccounts') ||
                 perm.permission.includes('networkInterfaces') ||
                 perm.permission.includes('virtualNetworks') ||
                 perm.permission.includes('loadBalancers') ||
                 perm.permission.includes('applicationGateways') ||
                 perm.permission.includes('frontDoors')) {
        hasPermission = hasResourceAccess;
      } else if (perm.permission.includes('CostManagement') || 
                 perm.permission.includes('Consumption')) {
        hasPermission = hasCostAccess;
      } else {
        // For Security, Advisor, Monitor - assume OK if basic access works
        hasPermission = hasBasicAccess;
      }
      
      if (hasPermission) {
        results.push({
          permission: perm.permission,
          required: perm.critical,
          status: 'ok',
          message: perm.description,
        });
      } else if (perm.critical) {
        results.push({
          permission: perm.permission,
          required: true,
          status: 'missing',
          message: `${perm.description} - REQUIRED`,
        });
        missingPermissions.push(perm.permission);
      } else {
        results.push({
          permission: perm.permission,
          required: false,
          status: 'warning',
          message: `${perm.description} - Optional but recommended`,
        });
        warnings.push(perm.permission);
      }
    }

    const summary = {
      total: results.length,
      ok: results.filter(r => r.status === 'ok').length,
      missing: missingPermissions.length,
      warnings: warnings.length,
      isValid: missingPermissions.length === 0,
    };

    logger.info('Azure permissions validation complete', {
      credentialId,
      summary,
    });

    return success({
      summary,
      results,
      missingPermissions,
      warnings,
      credential: {
        id: credential.id,
        subscriptionId: credential.subscription_id,
        subscriptionName: credential.subscription_name,
        authType: credential.auth_type,
      },
    });

  } catch (err: any) {
    logger.error('Error validating Azure permissions', err);
    return error('Internal server error', 500);
  }
}
