/**
 * Azure Fetch Monitor Metrics Handler
 * 
 * Fetches metrics from Azure Monitor API for VMs, App Services, and other resources.
 * Stores metrics in the resource_metrics table for dashboard display.
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
import { getAzureCredentialWithToken } from '../../lib/azure-helpers.js';
import { z } from 'zod';
import { parseAndValidateBody } from '../../lib/validation.js';

// Validation schema
const azureFetchMetricsSchema = z.object({
  credentialId: z.string().uuid('Invalid credential ID'),
  resourceTypes: z.array(z.string()).optional(),
  timeRange: z.enum(['1h', '3h', '6h', '12h', '24h', '7d']).optional().default('3h'),
});

// Azure Monitor metric definitions by resource type
const METRIC_DEFINITIONS: Record<string, { metrics: string[]; aggregation: string }> = {
  'Microsoft.Compute/virtualMachines': {
    metrics: ['Percentage CPU', 'Available Memory Bytes', 'Disk Read Bytes', 'Disk Write Bytes', 'Network In Total', 'Network Out Total'],
    aggregation: 'Average',
  },
  'Microsoft.Web/sites': {
    metrics: ['CpuTime', 'MemoryWorkingSet', 'Requests', 'Http5xx', 'AverageResponseTime'],
    aggregation: 'Average',
  },
  'Microsoft.Sql/servers/databases': {
    metrics: ['cpu_percent', 'physical_data_read_percent', 'log_write_percent', 'dtu_consumption_percent', 'storage_percent'],
    aggregation: 'Average',
  },
  'Microsoft.Storage/storageAccounts': {
    metrics: ['UsedCapacity', 'Transactions', 'Ingress', 'Egress', 'SuccessE2ELatency'],
    aggregation: 'Average',
  },
};

// Time range to ISO duration mapping
const TIME_RANGE_MAP: Record<string, { duration: string; interval: string }> = {
  '1h': { duration: 'PT1H', interval: 'PT5M' },
  '3h': { duration: 'PT3H', interval: 'PT15M' },
  '6h': { duration: 'PT6H', interval: 'PT30M' },
  '12h': { duration: 'PT12H', interval: 'PT1H' },
  '24h': { duration: 'P1D', interval: 'PT1H' },
  '7d': { duration: 'P7D', interval: 'PT6H' },
};

// Resource types that require minimum 1 hour interval (Azure limitation)
const HOURLY_INTERVAL_RESOURCE_TYPES = [
  'Microsoft.Storage/storageAccounts',
];

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

    logger.info('Fetching Azure Monitor metrics', { organizationId });

    // Parse and validate request body
    const validation = parseAndValidateBody(azureFetchMetricsSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const { credentialId, resourceTypes, timeRange = '3h' } = validation.data;

    // Get Azure credential with valid token
    const credentialResult = await getAzureCredentialWithToken(prisma, credentialId, organizationId);
    if (!credentialResult.success) {
      return error(credentialResult.error || 'Failed to get Azure credential', 400);
    }

    const { credential, accessToken } = credentialResult;
    const subscriptionId = credential.subscription_id;

    // Calculate time range
    const timeConfig = TIME_RANGE_MAP[timeRange];
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - parseIsoDuration(timeConfig.duration));

    // List resources to get metrics for
    const resources = await listAzureResources(accessToken, subscriptionId, resourceTypes);

    logger.info('Found Azure resources', {
      organizationId,
      resourceCount: resources.length,
    });

    // Fetch metrics for each resource
    let metricsCollected = 0;
    let resourcesProcessed = 0;
    const permissionErrors: Array<{ resourceType: string; error: string }> = [];

    for (const resource of resources) {
      try {
        const metricDef = METRIC_DEFINITIONS[resource.type];
        if (!metricDef) continue;

        // Create or update monitored resource entry
        const mappedType = mapResourceType(resource.type);
        
        // For Azure, we need to find by azure_credential_id since the unique constraint uses aws_account_id
        const existingResource = await prisma.monitoredResource.findFirst({
          where: {
            organization_id: organizationId,
            azure_credential_id: credentialId,
            resource_id: resource.id,
            resource_type: mappedType,
          },
        });
        
        if (existingResource) {
          await prisma.monitoredResource.update({
            where: { id: existingResource.id },
            data: {
              resource_name: resource.name,
              region: resource.location,
              status: 'active',
              updated_at: new Date(),
            },
          });
        } else {
          await prisma.monitoredResource.create({
            data: {
              organization_id: organizationId,
              azure_credential_id: credentialId,
              cloud_provider: 'AZURE',
              resource_id: resource.id,
              resource_name: resource.name,
              resource_type: mappedType,
              region: resource.location,
              status: 'active',
            },
          });
        }

        const metrics = await fetchResourceMetrics(
          accessToken,
          resource.id,
          resource.type,
          metricDef.metrics,
          metricDef.aggregation,
          startTime,
          endTime,
          timeConfig.interval
        );

        // Store metrics in database
        for (const metric of metrics) {
          // For Azure, we need to find by azure_credential_id since the unique constraint uses aws_account_id
          const existingMetric = await prisma.resourceMetric.findFirst({
            where: {
              organization_id: organizationId,
              azure_credential_id: credentialId,
              resource_id: resource.id,
              metric_name: metric.name,
              timestamp: metric.timestamp,
            },
          });
          
          if (existingMetric) {
            await prisma.resourceMetric.update({
              where: { id: existingMetric.id },
              data: {
                metric_value: metric.value,
                metric_unit: metric.unit,
              },
            });
          } else {
            await prisma.resourceMetric.create({
              data: {
                organization_id: organizationId,
                azure_credential_id: credentialId,
                cloud_provider: 'AZURE',
                resource_id: resource.id,
                resource_name: resource.name,
                resource_type: mapResourceType(resource.type),
                metric_name: metric.name,
                metric_value: metric.value,
                metric_unit: metric.unit,
                timestamp: metric.timestamp,
              },
            });
          }
          metricsCollected++;
        }

        resourcesProcessed++;
      } catch (err: any) {
        logger.warn('Failed to fetch metrics for resource', {
          resourceId: resource.id,
          error: err.message,
        });
        permissionErrors.push({
          resourceType: resource.type,
          error: err.message,
        });
      }
    }

    logger.info('Azure metrics collection complete', {
      organizationId,
      resourcesProcessed,
      metricsCollected,
      permissionErrors: permissionErrors.length,
    });

    return success({
      success: true,
      resourcesFound: resources.length,
      resourcesProcessed,
      metricsCollected,
      permissionErrors: permissionErrors.length > 0 ? permissionErrors : undefined,
      message: `Collected ${metricsCollected} metrics from ${resourcesProcessed} Azure resources`,
    });
  } catch (err: any) {
    logger.error('Error fetching Azure Monitor metrics', { error: err.message, stack: err.stack });
    return error('Failed to fetch Azure Monitor metrics', 500);
  }
}

/**
 * List Azure resources that support metrics
 */
async function listAzureResources(
  accessToken: string,
  subscriptionId: string,
  resourceTypes?: string[]
): Promise<Array<{ id: string; name: string; type: string; location: string }>> {
  const resources: Array<{ id: string; name: string; type: string; location: string }> = [];

  // Filter to supported resource types
  const supportedTypes = resourceTypes || Object.keys(METRIC_DEFINITIONS);
  const typeFilter = supportedTypes
    .map(t => `resourceType eq '${t}'`)
    .join(' or ');

  const url = `https://management.azure.com/subscriptions/${subscriptionId}/resources?api-version=2021-04-01&$filter=${encodeURIComponent(typeFilter)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to list Azure resources: ${response.status} ${errorText}`);
  }

  const data = await response.json() as { value?: Array<{ id: string; name: string; type: string; location: string }> };

  for (const resource of data.value || []) {
    resources.push({
      id: resource.id,
      name: resource.name,
      type: resource.type,
      location: resource.location,
    });
  }

  return resources;
}

/**
 * Fetch metrics for a specific Azure resource
 */
async function fetchResourceMetrics(
  accessToken: string,
  resourceId: string,
  resourceType: string,
  metricNames: string[],
  aggregation: string,
  startTime: Date,
  endTime: Date,
  interval: string
): Promise<Array<{ name: string; value: number; unit: string; timestamp: Date }>> {
  const metrics: Array<{ name: string; value: number; unit: string; timestamp: Date }> = [];

  // Use hourly interval for resource types that require it (Azure limitation)
  const effectiveInterval = HOURLY_INTERVAL_RESOURCE_TYPES.includes(resourceType) ? 'PT1H' : interval;

  const metricNamesParam = metricNames.join(',');
  const timespan = `${startTime.toISOString()}/${endTime.toISOString()}`;

  const url = `https://management.azure.com${resourceId}/providers/Microsoft.Insights/metrics?api-version=2021-05-01&metricnames=${encodeURIComponent(metricNamesParam)}&timespan=${encodeURIComponent(timespan)}&interval=${effectiveInterval}&aggregation=${aggregation}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch metrics: ${response.status} ${errorText}`);
  }

  const data = await response.json() as { 
    value?: Array<{ 
      name: { value: string }; 
      unit?: string; 
      timeseries?: Array<{ 
        data?: Array<{ 
          timeStamp: string; 
          average?: number; 
          total?: number; 
          maximum?: number; 
          minimum?: number; 
        }> 
      }> 
    }> 
  };

  for (const metric of data.value || []) {
    const timeseries = metric.timeseries?.[0];
    if (!timeseries?.data) continue;

    // Get the latest data point
    const latestData = timeseries.data[timeseries.data.length - 1];
    if (!latestData) continue;

    const value = latestData.average ?? latestData.total ?? latestData.maximum ?? latestData.minimum ?? 0;

    metrics.push({
      name: metric.name.value,
      value,
      unit: metric.unit || 'Count',
      timestamp: new Date(latestData.timeStamp),
    });
  }

  return metrics;
}

/**
 * Map Azure resource type to simplified type for database
 */
function mapResourceType(azureType: string): string {
  const typeMap: Record<string, string> = {
    'Microsoft.Compute/virtualMachines': 'vm',
    'Microsoft.Web/sites': 'webapp',
    'Microsoft.Sql/servers/databases': 'sqldb',
    'Microsoft.Storage/storageAccounts': 'storage',
  };
  return typeMap[azureType] || azureType.split('/').pop()?.toLowerCase() || 'unknown';
}

/**
 * Parse ISO 8601 duration to milliseconds
 */
function parseIsoDuration(duration: string): number {
  const match = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return 3600000; // Default 1 hour

  const days = parseInt(match[1] || '0', 10);
  const hours = parseInt(match[2] || '0', 10);
  const minutes = parseInt(match[3] || '0', 10);
  const seconds = parseInt(match[4] || '0', 10);

  return ((days * 24 + hours) * 60 + minutes) * 60 * 1000 + seconds * 1000;
}
