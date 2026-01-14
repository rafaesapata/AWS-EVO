/**
 * Azure Activity Logs Handler
 * 
 * Fetches and analyzes Azure Activity Logs for security monitoring.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { AzureProvider } from '../../lib/cloud-provider/azure-provider.js';
import { validateServicePrincipalCredentials } from '../../lib/azure-helpers.js';
import type { ActivityQueryParams } from '../../types/cloud.js';
import { z } from 'zod';

// Validation schema
const azureActivityLogsSchema = z.object({
  credentialId: z.string().uuid('Invalid credential ID'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD'),
  riskLevels: z.array(z.enum(['critical', 'high', 'medium', 'low'])).optional(),
  limit: z.number().min(1).max(1000).optional().default(100),
});

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  // Handle CORS preflight
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    logger.info('Fetching Azure activity logs', { organizationId });

    // Parse and validate request body
    let body: any;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return error('Invalid JSON in request body', 400);
    }

    const validation = azureActivityLogsSchema.safeParse(body);
    if (!validation.success) {
      return error(`Validation error: ${validation.error.errors.map(e => e.message).join(', ')}`, 400);
    }

    const { credentialId, startDate, endDate, riskLevels, limit } = validation.data;

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

    // Handle both OAuth and Service Principal credentials
    let azureProvider: AzureProvider;
    
    if (credential.auth_type === 'oauth') {
      // Use getAzureCredentialWithToken for OAuth
      const { getAzureCredentialWithToken } = await import('../../lib/azure-helpers.js');
      const tokenResult = await getAzureCredentialWithToken(prisma, credentialId, organizationId);
      
      if (!tokenResult.success) {
        return error(tokenResult.error, 400);
      }
      
      // Create provider with OAuth token
      azureProvider = AzureProvider.withOAuthToken(
        organizationId,
        credential.subscription_id,
        credential.subscription_name || undefined,
        credential.oauth_tenant_id || credential.tenant_id || '',
        tokenResult.accessToken,
        new Date(Date.now() + 3600 * 1000)
      );
    } else {
      // Validate Service Principal credentials
      const spValidation = validateServicePrincipalCredentials(credential);
      if (!spValidation.valid) {
        return error(spValidation.error, 400);
      }
      
      // Create Azure provider with Service Principal
      azureProvider = new AzureProvider(organizationId, spValidation.credentials);
    }

    const activityParams: ActivityQueryParams = {
      startDate,
      endDate,
      riskLevels,
      limit,
    };

    const events = await azureProvider.getActivityLogs(activityParams);

    logger.info('Azure activity logs fetched', {
      organizationId,
      credentialId,
      subscriptionId: credential.subscription_id,
      eventCount: events.length,
    });

    // Filter by risk level if specified
    let filteredEvents = events;
    if (riskLevels && riskLevels.length > 0) {
      filteredEvents = events.filter(e => riskLevels.includes(e.riskLevel));
    }

    // Calculate summary
    const summary = {
      total: filteredEvents.length,
      byRiskLevel: {
        critical: filteredEvents.filter(e => e.riskLevel === 'critical').length,
        high: filteredEvents.filter(e => e.riskLevel === 'high').length,
        medium: filteredEvents.filter(e => e.riskLevel === 'medium').length,
        low: filteredEvents.filter(e => e.riskLevel === 'low').length,
      },
      byService: filteredEvents.reduce((acc, e) => {
        acc[e.service] = (acc[e.service] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byUser: filteredEvents.reduce((acc, e) => {
        acc[e.userName] = (acc[e.userName] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    // Get high-risk events for alerts
    const highRiskEvents = filteredEvents.filter(
      e => e.riskLevel === 'critical' || e.riskLevel === 'high'
    );

    return success({
      subscriptionId: credential.subscription_id,
      subscriptionName: credential.subscription_name,
      period: {
        startDate,
        endDate,
      },
      summary,
      highRiskEvents: highRiskEvents.slice(0, 20), // Top 20 high-risk events
      events: filteredEvents.map(e => ({
        id: e.id,
        eventName: e.eventName,
        eventTime: e.eventTime,
        userName: e.userName,
        userType: e.userType,
        service: e.service,
        action: e.action,
        resourceId: e.resourceId,
        resourceType: e.resourceType,
        riskLevel: e.riskLevel,
        riskReasons: e.riskReasons,
        sourceIp: e.sourceIp,
      })),
    });
  } catch (err: any) {
    logger.error('Error fetching Azure activity logs', { error: err.message });
    return error(err.message || 'Failed to fetch Azure activity logs', 500);
  }
}
