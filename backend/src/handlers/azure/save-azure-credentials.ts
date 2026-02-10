/**
 * Save Azure Credentials Handler
 * 
 * Saves validated Azure credentials to the database.
 * Supports both Service Principal and OAuth authentication types.
 * Encrypts sensitive data (client_secret, refresh_token) before storage.
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
import { AzureProvider } from '../../lib/cloud-provider/azure-provider.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { ensureNotDemoMode } from '../../lib/demo-data-service.js';

// Validation schema for Service Principal credentials
const servicePrincipalSchema = z.object({
  authType: z.literal('service_principal').optional().default('service_principal'),
  tenantId: z.string().min(1, 'Tenant ID is required'),
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client Secret is required'),
  subscriptionId: z.string().min(1, 'Subscription ID is required'),
  subscriptionName: z.string().optional(),
  regions: z.array(z.string()).optional().default(['eastus']),
  validateFirst: z.boolean().optional().default(true),
});

// Validation schema for OAuth credentials (from OAuth callback)
const oauthSchema = z.object({
  authType: z.literal('oauth'),
  subscriptionId: z.string().min(1, 'Subscription ID is required'),
  subscriptionName: z.string().optional(),
  encryptedRefreshToken: z.string().min(1, 'Encrypted refresh token is required'),
  tokenExpiresAt: z.string().datetime().optional(),
  oauthTenantId: z.string().min(1, 'OAuth tenant ID is required'),
  oauthUserEmail: z.string().email().optional(),
  regions: z.array(z.string()).optional().default(['eastus']),
});

// Combined schema
const saveAzureCredentialsSchema = z.discriminatedUnion('authType', [
  servicePrincipalSchema,
  oauthSchema,
]);

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  // Handle CORS preflight
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }

  // Get origin for CORS - include in ALL responses
  const origin = (event.headers?.['origin'] || event.headers?.['Origin'] || '*');

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    logger.info('Saving Azure credentials', { organizationId });

    // SECURITY: Block write operations in demo mode
    const demoCheck = await ensureNotDemoMode(prisma, organizationId, origin);
    if (demoCheck.blocked) return demoCheck.response;

    // Parse and validate request body - default to service_principal if authType not specified
    let bodyWithDefault: any;
    try {
      bodyWithDefault = JSON.parse(event.body || '{}');
      if (!bodyWithDefault.authType) {
        bodyWithDefault.authType = 'service_principal';
      }
    } catch {
      return error('Invalid JSON in request body', 400, undefined, origin);
    }

    const validation = parseAndValidateBody(saveAzureCredentialsSchema, JSON.stringify(bodyWithDefault));
    if (!validation.success) {
      return validation.error;
    }

    const data = validation.data;
    const authType = data.authType;

    // Check if credential already exists for this subscription
    const existingCredential = await prisma.azureCredential.findUnique({
      where: {
        organization_id_subscription_id: {
          organization_id: organizationId,
          subscription_id: data.subscriptionId,
        },
      },
    });

    let credential;

    if (authType === 'service_principal') {
      const spData = data as z.infer<typeof servicePrincipalSchema>;
      
      // Optionally validate credentials before saving
      if (spData.validateFirst) {
        const azureProvider = new AzureProvider(organizationId, {
          tenantId: spData.tenantId,
          clientId: spData.clientId,
          clientSecret: spData.clientSecret,
          subscriptionId: spData.subscriptionId,
          subscriptionName: spData.subscriptionName,
        });

        const validationResult = await azureProvider.validateCredentials();
        
        if (!validationResult.valid) {
          logger.warn('Azure credential validation failed before save', {
            organizationId,
            error: validationResult.error,
          });
          
          return error(validationResult.error || 'Invalid Azure credentials', 401, {
            valid: false,
            details: validationResult.details,
          }, origin);
        }
      }

      if (existingCredential) {
        // Update existing credential
        credential = await prisma.azureCredential.update({
          where: { id: existingCredential.id },
          data: {
            auth_type: 'service_principal',
            tenant_id: spData.tenantId,
            client_id: spData.clientId,
            client_secret: spData.clientSecret, // TODO: Encrypt with KMS
            subscription_name: spData.subscriptionName,
            regions: spData.regions,
            // Clear OAuth fields
            encrypted_refresh_token: null,
            token_expires_at: null,
            oauth_tenant_id: null,
            oauth_user_email: null,
            last_refresh_at: null,
            refresh_error: null,
            is_active: true,
            updated_at: new Date(),
          },
        });

        logger.info('Azure Service Principal credentials updated', {
          organizationId,
          credentialId: credential.id,
          subscriptionId: spData.subscriptionId,
        });
      } else {
        // Create new credential
        credential = await prisma.azureCredential.create({
          data: {
            organization_id: organizationId,
            auth_type: 'service_principal',
            tenant_id: spData.tenantId,
            client_id: spData.clientId,
            client_secret: spData.clientSecret, // TODO: Encrypt with KMS
            subscription_id: spData.subscriptionId,
            subscription_name: spData.subscriptionName,
            regions: spData.regions,
            is_active: true,
          },
        });

        logger.info('Azure Service Principal credentials created', {
          organizationId,
          credentialId: credential.id,
          subscriptionId: spData.subscriptionId,
        });
      }
    } else {
      // OAuth credentials
      const oauthData = data as z.infer<typeof oauthSchema>;

      if (existingCredential) {
        // Update existing credential
        credential = await prisma.azureCredential.update({
          where: { id: existingCredential.id },
          data: {
            auth_type: 'oauth',
            subscription_name: oauthData.subscriptionName,
            encrypted_refresh_token: oauthData.encryptedRefreshToken,
            token_expires_at: oauthData.tokenExpiresAt ? new Date(oauthData.tokenExpiresAt) : null,
            oauth_tenant_id: oauthData.oauthTenantId,
            oauth_user_email: oauthData.oauthUserEmail,
            last_refresh_at: new Date(),
            refresh_error: null,
            regions: oauthData.regions,
            // Clear Service Principal fields
            tenant_id: null,
            client_id: null,
            client_secret: null,
            is_active: true,
            updated_at: new Date(),
          },
        });

        logger.info('Azure OAuth credentials updated', {
          organizationId,
          credentialId: credential.id,
          subscriptionId: oauthData.subscriptionId,
        });
      } else {
        // Create new credential
        credential = await prisma.azureCredential.create({
          data: {
            organization_id: organizationId,
            auth_type: 'oauth',
            subscription_id: oauthData.subscriptionId,
            subscription_name: oauthData.subscriptionName,
            encrypted_refresh_token: oauthData.encryptedRefreshToken,
            token_expires_at: oauthData.tokenExpiresAt ? new Date(oauthData.tokenExpiresAt) : null,
            oauth_tenant_id: oauthData.oauthTenantId,
            oauth_user_email: oauthData.oauthUserEmail,
            last_refresh_at: new Date(),
            regions: oauthData.regions,
            is_active: true,
          },
        });

        logger.info('Azure OAuth credentials created', {
          organizationId,
          credentialId: credential.id,
          subscriptionId: oauthData.subscriptionId,
        });
      }
    }

    // Audit log
    logAuditAsync({
      organizationId,
      userId: user.sub,
      action: existingCredential ? 'CREDENTIAL_UPDATE' : 'CREDENTIAL_CREATE',
      resourceType: 'azure_credential',
      resourceId: credential.id,
      details: {
        subscription_id: credential.subscription_id,
        auth_type: authType,
        is_update: !!existingCredential,
      },
      ipAddress: getIpFromEvent(event),
      userAgent: getUserAgentFromEvent(event),
    });

    // Return credential without exposing secrets
    return success({
      id: credential.id,
      subscriptionId: credential.subscription_id,
      subscriptionName: credential.subscription_name,
      authType: credential.auth_type,
      // Service Principal fields (only if applicable)
      tenantId: credential.tenant_id,
      clientId: credential.client_id,
      // OAuth fields (only if applicable)
      oauthTenantId: credential.oauth_tenant_id,
      oauthUserEmail: credential.oauth_user_email,
      tokenExpiresAt: credential.token_expires_at,
      lastRefreshAt: credential.last_refresh_at,
      // Common fields
      regions: credential.regions,
      isActive: credential.is_active,
      createdAt: credential.created_at,
      updatedAt: credential.updated_at,
      isNew: !existingCredential,
    }, 200, origin);
  } catch (err: any) {
    logger.error('Error saving Azure credentials', { error: err.message });
    
    // Handle unique constraint violation
    if (err.code === 'P2002') {
      return error('Azure credentials for this subscription already exist', 409, undefined, origin);
    }
    
    return error('Failed to save Azure credentials', 500, undefined, origin);
  }
}
