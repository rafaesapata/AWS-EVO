/**
 * Azure Fetch Monitor Metrics Handler
 * 
 * Fetches metrics from Azure Monitor API for VMs, App Services, SQL DBs, and Storage.
 * Stores resources in monitored_resources and metrics in resource_metrics.
 * 
 * Optimized: parallel fetching, delete+insert for metrics, proper error handling.
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
import { fetchWithRetry } from '../../lib/azure-retry.js';

const azureFetchMetricsSchema = z.object({
  credentialId: z.string().uuid('Invalid credential ID'),
  resourceTypes: z.array(z.string()).optional(),
  timeRange: z.enum(['1h', '3h', '6h', '12h', '24h', '7d']).optional().default('3h'),
});

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

const TIME_RANGE_MAP: Record<string, { duration: string; interval: string }> = {
  '1h': { duration: 'PT1H', interval: 'PT5M' },
  '3h': { duration: 'PT3H', interval: 'PT15M' },
  '6h': { duration: 'PT6H', interval: 'PT30M' },
  '12h': { duration: 'PT12H', interval: 'PT1H' },
  '24h': { duration: 'P1D', interval: 'PT1H' },
  '7d': { duration: 'P7D', interval: 'PT6H' },
};

const HOURLY_INTERVAL_RESOURCE_TYPES = ['Microsoft.Storage/storageAccounts'];

/** Azure SQL API version for server/database listing */
const AZURE_SQL_API_VERSION = '2023-05-01-preview';
/** Azure Resource Management API version */
const AZURE_RESOURCES_API_VERSION = '2021-04-01';
/** Azure Monitor Metrics API version */
const AZURE_MONITOR_API_VERSION = '2021-05-01';

/** Default fallback duration in ms (1 hour) when ISO duration parsing fails */
const DEFAULT_DURATION_MS = 3_600_000;
const RESOURCE_BATCH_SIZE = 3;
/** Max metrics per Prisma createMany call */
const METRICS_INSERT_BATCH_SIZE = 100;

/** Maps Azure resource types to short internal identifiers */
const AZURE_TYPE_MAP: Record<string, string> = {
  'Microsoft.Compute/virtualMachines': 'vm',
  'Microsoft.Web/sites': 'webapp',
  'Microsoft.Sql/servers/databases': 'sqldb',
  'Microsoft.Storage/storageAccounts': 'storage',
};

/** Case-insensitive lookup helper for Record<string, T> */
function caseInsensitiveLookup<T>(map: Record<string, T>, key: string): T | undefined {
  if (map[key]) return map[key];
  const lowerKey = key.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (k.toLowerCase() === lowerKey) return v;
  }
  return undefined;
}

/** Case-insensitive lookup for METRIC_DEFINITIONS */
function getMetricDefinition(resourceType: string): { metrics: string[]; aggregation: string } | undefined {
  return caseInsensitiveLookup(METRIC_DEFINITIONS, resourceType);
}

/** Case-insensitive lookup for AZURE_TYPE_MAP with fallback */
function getAzureTypeMapping(resourceType: string): string {
  return caseInsensitiveLookup(AZURE_TYPE_MAP, resourceType)
    || resourceType.split('/').pop()?.toLowerCase()
    || 'unknown';
}

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

    logger.info('Azure Monitor metrics - start', { organizationId });

    const validation = parseAndValidateBody(azureFetchMetricsSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const { credentialId, resourceTypes, timeRange = '3h' } = validation.data;

    // Get Azure credential with valid token
    const credentialResult = await getAzureCredentialWithToken(prisma, credentialId, organizationId);
    if (!credentialResult.success) {
      logger.error('Azure credential failed', { credentialId, error: credentialResult.error });
      return error(credentialResult.error || 'Failed to get Azure credential', 400);
    }

    const { credential, accessToken } = credentialResult;
    const subscriptionId = credential.subscription_id;
    if (!subscriptionId) {
      return error('Azure credential missing subscription ID', 400);
    }

    // Calculate time range
    const timeConfig = TIME_RANGE_MAP[timeRange];
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - parseIsoDuration(timeConfig.duration));

    // List Azure resources
    let resources: AzureResource[];
    try {
      resources = await listAzureResources(accessToken, subscriptionId, resourceTypes);
    } catch (listErr: any) {
      logger.error('Failed to list Azure resources', { subscriptionId, error: listErr.message });
      return error(`Failed to list Azure resources: ${listErr.message}`, 500);
    }

    logger.info('Azure resources found', {
      organizationId,
      count: resources.length,
      types: [...new Set(resources.map(r => r.type))],
    });

    if (resources.length === 0) {
      return success({
        success: true,
        resourcesFound: 0,
        resourcesProcessed: 0,
        metricsCollected: 0,
        message: 'No supported Azure resources found. Supported: VMs, App Services, SQL DBs, Storage Accounts.',
      });
    }

    // Process resources in parallel batches of 3
    let metricsCollected = 0;
    let resourcesProcessed = 0;
    const permissionErrors: Array<{ resourceType: string; region: string; error: string; missingPermissions: string[] }> = [];

    for (let i = 0; i < resources.length; i += RESOURCE_BATCH_SIZE) {
      const batch = resources.slice(i, i + RESOURCE_BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(resource => processResource(
          prisma, accessToken, resource, organizationId, credentialId,
          startTime, endTime, timeConfig.interval
        ))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === 'fulfilled') {
          resourcesProcessed++;
          metricsCollected += result.value;
        } else {
          const res = batch[j];
          logger.warn('Resource processing failed', {
            name: res.name, type: res.type, error: result.reason?.message,
          });
          permissionErrors.push({
            resourceType: getAzureTypeMapping(res.type),
            region: res.location,
            error: result.reason?.message || 'Unknown error',
            missingPermissions: ['Microsoft.Insights/metrics/read'],
          });
        }
      }
    }

    logger.info('Azure metrics collection complete', {
      organizationId, resourcesFound: resources.length,
      resourcesProcessed, metricsCollected, errors: permissionErrors.length,
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
    logger.error('Azure Monitor metrics error', { error: err.message, stack: err.stack });
    return error(`Failed to fetch Azure Monitor metrics: ${err.message}`, 500);
  }
}


interface AzureResource {
  id: string;
  name: string;
  type: string;
  location: string;
}

interface MetricPoint {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
}

/**
 * Process a single Azure resource: upsert resource + fetch & store metrics.
 * Returns the number of metrics stored.
 */
async function processResource(
  prisma: any,
  accessToken: string,
  resource: AzureResource,
  organizationId: string,
  credentialId: string,
  startTime: Date,
  endTime: Date,
  interval: string
): Promise<number> {
  const metricDef = getMetricDefinition(resource.type);
  if (!metricDef) return 0;

  const mappedType = getAzureTypeMapping(resource.type);
  const resourceId = resource.id; // Full Azure resource path

  // Upsert monitored resource using findFirst + create/update
  // (safe for Azure since we filter by azure_credential_id)
  const existing = await prisma.monitoredResource.findFirst({
    where: {
      organization_id: organizationId,
      azure_credential_id: credentialId,
      resource_id: resourceId,
      resource_type: mappedType,
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.monitoredResource.update({
      where: { id: existing.id },
      data: {
        resource_name: resource.name,
        region: resource.location,
        status: 'active',
        cloud_provider: 'AZURE',
      },
    });
  } else {
    await prisma.monitoredResource.create({
      data: {
        organization_id: organizationId,
        azure_credential_id: credentialId,
        cloud_provider: 'AZURE',
        resource_id: resourceId,
        resource_name: resource.name,
        resource_type: mappedType,
        region: resource.location,
        status: 'active',
      },
    });
  }

  // Fetch metrics from Azure Monitor
  const metrics = await fetchResourceMetrics(
    accessToken, resource.id, resource.type,
    metricDef.metrics, metricDef.aggregation,
    startTime, endTime, interval
  );

  if (metrics.length === 0) return 0;

  // Delete existing metrics for this resource in the time range, then bulk insert
  // This avoids the N+1 findFirst pattern and handles the NULL aws_account_id unique constraint issue
  await prisma.resourceMetric.deleteMany({
    where: {
      organization_id: organizationId,
      azure_credential_id: credentialId,
      resource_id: resourceId,
      timestamp: { gte: startTime, lte: endTime },
    },
  });

  // Batch insert using createMany (much faster than individual creates)
  const metricsData = metrics.map(m => ({
    organization_id: organizationId,
    azure_credential_id: credentialId,
    cloud_provider: 'AZURE' as const,
    resource_id: resourceId,
    resource_name: resource.name,
    resource_type: mappedType,
    metric_name: m.name,
    metric_value: m.value,
    metric_unit: m.unit,
    timestamp: m.timestamp,
  }));

  // createMany in batches of 100 to avoid payload limits
  for (let i = 0; i < metricsData.length; i += METRICS_INSERT_BATCH_SIZE) {
    await prisma.resourceMetric.createMany({
      data: metricsData.slice(i, i + METRICS_INSERT_BATCH_SIZE),
      skipDuplicates: true,
    });
  }

  return metrics.length;
}

/**
 * List Azure resources that support metrics.
 * Fetches all resources without server-side filter (avoids case-sensitivity issues),
 * then filters client-side. SQL databases are discovered separately as child resources.
 */
async function listAzureResources(
  accessToken: string,
  subscriptionId: string,
  resourceTypes?: string[]
): Promise<AzureResource[]> {
  const resources: AzureResource[] = [];
  const supportedTypes = new Set((resourceTypes || Object.keys(METRIC_DEFINITIONS)).map(t => t.toLowerCase()));

  // List ALL resources without $filter (avoids case-sensitivity and child resource issues)
  let url: string | null = `https://management.azure.com/subscriptions/${subscriptionId}/resources?api-version=${AZURE_RESOURCES_API_VERSION}`;
  const allResourceTypes = new Set<string>();
  let totalRawResources = 0;

  while (url) {
    const data: { value?: AzureResource[]; nextLink?: string } = await fetchAzureApi(accessToken, url);

    for (const r of data.value || []) {
      totalRawResources++;
      allResourceTypes.add(r.type || 'unknown');
      if (supportedTypes.has((r.type || '').toLowerCase())) {
        resources.push({ id: r.id, name: r.name, type: r.type, location: r.location });
      }
    }

    url = data.nextLink || null;
  }

  // Debug: log all resource types found in the subscription
  logger.info('Azure resource types in subscription', {
    subscriptionId,
    totalRawResources,
    matchedResources: resources.length,
    supportedTypes: [...supportedTypes],
    allTypesFound: [...allResourceTypes].sort(),
  });

  // SQL Databases are child resources not returned by /resources endpoint
  if (supportedTypes.has('microsoft.sql/servers/databases')) {
    await discoverSqlDatabases(accessToken, subscriptionId, resources);
  }

  logger.info('Azure resources discovered', {
    total: resources.length,
    types: [...new Set(resources.map(r => r.type))],
  });

  return resources;
}

/** Typed wrapper for Azure Management API GET requests */
async function fetchAzureApi<T>(accessToken: string, url: string): Promise<T> {
  const response = await fetchWithRetry(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Azure API error', { status: response.status, url: url.substring(0, 120), error: errorText.substring(0, 500) });
    throw new Error(`Azure API ${response.status}: ${errorText.substring(0, 200)}`);
  }

  return response.json() as Promise<T>;
}


/**
 * Discover SQL databases via SQL servers endpoint.
 * The /resources endpoint doesn't return child resources like databases.
 */
async function discoverSqlDatabases(
  accessToken: string,
  subscriptionId: string,
  resources: AzureResource[]
): Promise<void> {
  const existingIds = new Set(resources.map(r => r.id));

  try {
    // List all SQL servers in the subscription
    let serversUrl: string | null = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Sql/servers?api-version=${AZURE_SQL_API_VERSION}`;
    const sqlServers: Array<{ id: string; name: string }> = [];

    while (serversUrl) {
      try {
        const srvData: { value?: Array<{ id: string; name: string }>; nextLink?: string } = await fetchAzureApi(accessToken, serversUrl);
        for (const s of srvData.value || []) {
          sqlServers.push({ id: s.id, name: s.name });
        }
        serversUrl = srvData.nextLink || null;
      } catch (srvErr: any) {
        logger.warn('Failed to list SQL servers', { error: srvErr.message });
        return;
      }
    }

    // For each SQL server, list its databases
    for (const server of sqlServers) {
      try {
        let dbsUrl: string | null = `https://management.azure.com${server.id}/databases?api-version=${AZURE_SQL_API_VERSION}`;
        while (dbsUrl) {
          const dbData: { value?: AzureResource[]; nextLink?: string } = await fetchAzureApi(accessToken, dbsUrl);
          for (const db of dbData.value || []) {
            if (db.name === 'master') continue;
            if (!existingIds.has(db.id)) {
              existingIds.add(db.id);
              resources.push({ id: db.id, name: db.name, type: db.type || 'Microsoft.Sql/servers/databases', location: db.location });
            }
          }
          dbsUrl = dbData.nextLink || null;
        }
      } catch (dbErr: any) {
        logger.warn('Error listing databases for SQL server', { server: server.name, error: dbErr.message });
      }
    }
  } catch (sqlErr: any) {
    logger.warn('Error discovering SQL databases', { error: sqlErr.message });
  }
}

/**
 * Fetch metrics for a specific Azure resource from Azure Monitor API
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
): Promise<MetricPoint[]> {
  const metrics: MetricPoint[] = [];
  const effectiveInterval = HOURLY_INTERVAL_RESOURCE_TYPES.some(t => t.toLowerCase() === resourceType.toLowerCase()) ? 'PT1H' : interval;
  const metricNamesParam = metricNames.join(',');
  const timespan = `${startTime.toISOString()}/${endTime.toISOString()}`;

  const url = `https://management.azure.com${resourceId}/providers/Microsoft.Insights/metrics?api-version=${AZURE_MONITOR_API_VERSION}&metricnames=${encodeURIComponent(metricNamesParam)}&timespan=${encodeURIComponent(timespan)}&interval=${effectiveInterval}&aggregation=${aggregation}`;

  const response = await fetchWithRetry(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    const shortName = resourceId.split('/').pop() || resourceId;
    logger.warn('Azure metrics API error', { status: response.status, resource: shortName, error: errorText.substring(0, 300) });
    throw new Error(`Metrics API ${response.status} for ${shortName}`);
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

    for (const dp of timeseries.data) {
      const value = dp.average ?? dp.total ?? dp.maximum ?? dp.minimum;
      if (value === undefined || value === null) continue;

      metrics.push({
        name: metric.name.value,
        value,
        unit: metric.unit || 'Count',
        timestamp: new Date(dp.timeStamp),
      });
    }
  }

  return metrics;
}

function parseIsoDuration(duration: string): number {
  const match = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return DEFAULT_DURATION_MS;
  const days = parseInt(match[1] || '0', 10);
  const hours = parseInt(match[2] || '0', 10);
  const minutes = parseInt(match[3] || '0', 10);
  const seconds = parseInt(match[4] || '0', 10);
  return ((days * 24 + hours) * 60 + minutes) * 60 * 1000 + seconds * 1000;
}
