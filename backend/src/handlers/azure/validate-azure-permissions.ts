/**
 * Validate Azure Permissions Handler
 * 
 * Performs REAL API calls against every Azure endpoint used by the EVO platform.
 * Each test maps to a specific handler/feature so the admin knows exactly
 * which features will work and which won't.
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
import { logger } from '../../lib/logger.js';
import {
  isInvalidClientSecretError,
  INVALID_CLIENT_SECRET_MESSAGE,
  resolveClientSecret,
  resolveCertificatePem,
  getAzureCredentialWithToken,
  createStaticTokenCredential,
  ONE_HOUR_MS,
} from '../../lib/azure-helpers.js';
import { fetchWithRetry } from '../../lib/azure-retry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeatureTest {
  /** Unique key */
  id: string;
  /** Human-readable name (PT-BR) */
  name: string;
  /** Which EVO feature / handler depends on this */
  feature: string;
  /** Is this critical for the platform to work? */
  critical: boolean;
  /** Azure permissions needed */
  permissions: string[];
  /** The actual test function — returns { ok, detail } */
  test: (ctx: TestContext) => Promise<{ ok: boolean; detail: string }>;
}

interface TestContext {
  accessToken: string;
  subscriptionId: string;
}

interface TestResult {
  id: string;
  name: string;
  feature: string;
  critical: boolean;
  permissions: string[];
  status: 'ok' | 'error' | 'warning';
  detail: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Azure API helper
// ---------------------------------------------------------------------------

const BASE = 'https://management.azure.com';

async function azureGet(token: string, url: string, timeoutMs = 10000): Promise<{ status: number; body: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: controller.signal as any,
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function azurePost(token: string, url: string, payload: any, timeoutMs = 10000): Promise<{ status: number; body: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal as any,
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function ok(detail: string) { return { ok: true, detail }; }
function fail(detail: string) { return { ok: false, detail }; }

// ---------------------------------------------------------------------------
// Feature tests — each one calls the REAL Azure API
// ---------------------------------------------------------------------------

function buildFeatureTests(ctx: TestContext): FeatureTest[] {
  const sub = ctx.subscriptionId;
  const today = new Date();
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const fmtDate = (d: Date) => d.toISOString().split('T')[0];

  return [
    // ── 1. Subscription & Resource Groups ──────────────────────────────
    {
      id: 'subscription_read',
      name: 'Leitura da Assinatura',
      feature: 'Conectividade básica',
      critical: true,
      permissions: ['Microsoft.Resources/subscriptions/read'],
      test: async (testCtx) => {
        const r = await azureGet(testCtx.accessToken, `${BASE}/subscriptions/${sub}?api-version=2022-12-01`);
        if (r.status === 200) return ok(`Assinatura: ${r.body?.displayName || sub}`);
        if (r.status === 404) return fail(`Subscription ${sub} não encontrada. Verifique se o Subscription ID está correto e se o token tem acesso a esta subscription. Isso NÃO é erro de permissão — a subscription simplesmente não existe ou não pertence ao tenant/conta usada para autenticação.`);
        if (r.status === 403) return fail(`Sem permissão para acessar subscription ${sub} (HTTP 403)`);
        return fail(`HTTP ${r.status}: ${r.body?.error?.message || 'Erro desconhecido'}`);
      },
    },
    {
      id: 'resource_groups',
      name: 'Listar Resource Groups',
      feature: 'Inventário de Recursos',
      critical: true,
      permissions: ['Microsoft.Resources/subscriptions/resourceGroups/read'],
      test: async (testCtx) => {
        const r = await azureGet(testCtx.accessToken, `${BASE}/subscriptions/${sub}/resourcegroups?api-version=2021-04-01`);
        if (r.status === 404) return fail(`Subscription não encontrada (HTTP 404). Verifique o Subscription ID.`);
        if (r.status !== 200) return fail(`HTTP ${r.status}: ${r.body?.error?.message || r.body?.error?.code || ''}`);
        const count = r.body?.value?.length ?? 0;
        return ok(`${count} resource group(s) encontrado(s)`);
      },
    },
    {
      id: 'resources_list',
      name: 'Listar Todos os Recursos',
      feature: 'Inventário de Recursos / Monitor Metrics',
      critical: true,
      permissions: ['Microsoft.Resources/subscriptions/resources/read'],
      test: async (testCtx) => {
        const r = await azureGet(testCtx.accessToken, `${BASE}/subscriptions/${sub}/resources?api-version=2021-04-01&$top=5`);
        if (r.status === 404) return fail(`Subscription não encontrada (HTTP 404). Verifique o Subscription ID.`);
        if (r.status !== 200) return fail(`HTTP ${r.status}: ${r.body?.error?.message || r.body?.error?.code || ''}`);
        const count = r.body?.value?.length ?? 0;
        return ok(`${count} recurso(s) na primeira página`);
      },
    },

    // ── 2. Compute (VMs) ───────────────────────────────────────────────
    {
      id: 'virtual_machines',
      name: 'Listar Virtual Machines',
      feature: 'Security Scan / Inventário / Monitor Metrics',
      critical: true,
      permissions: ['Microsoft.Compute/virtualMachines/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.Compute/virtualMachines?api-version=2023-09-01`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} VM(s)`);
      },
    },

    // ── 3. Storage ─────────────────────────────────────────────────────
    {
      id: 'storage_accounts',
      name: 'Listar Storage Accounts',
      feature: 'Security Scan / Inventário / Monitor Metrics',
      critical: true,
      permissions: ['Microsoft.Storage/storageAccounts/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.Storage/storageAccounts?api-version=2023-01-01`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} storage account(s)`);
      },
    },

    // ── 4. Network ─────────────────────────────────────────────────────
    {
      id: 'network_nsgs',
      name: 'Listar Network Security Groups',
      feature: 'Security Scan (Network Security)',
      critical: true,
      permissions: ['Microsoft.Network/networkSecurityGroups/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.Network/networkSecurityGroups?api-version=2023-09-01`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} NSG(s)`);
      },
    },
    {
      id: 'network_vnets',
      name: 'Listar Virtual Networks',
      feature: 'Security Scan / Inventário',
      critical: false,
      permissions: ['Microsoft.Network/virtualNetworks/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.Network/virtualNetworks?api-version=2023-09-01`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} VNet(s)`);
      },
    },
    {
      id: 'load_balancers',
      name: 'Listar Load Balancers',
      feature: 'Edge Services / Inventário',
      critical: false,
      permissions: ['Microsoft.Network/loadBalancers/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.Network/loadBalancers?api-version=2023-09-01`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} load balancer(s)`);
      },
    },
    {
      id: 'app_gateways',
      name: 'Listar Application Gateways',
      feature: 'Edge Services',
      critical: false,
      permissions: ['Microsoft.Network/applicationGateways/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.Network/applicationGateways?api-version=2023-09-01`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} app gateway(s)`);
      },
    },
    {
      id: 'front_doors',
      name: 'Listar Azure Front Door',
      feature: 'Edge Services',
      critical: false,
      permissions: ['Microsoft.Network/frontDoors/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.Network/frontDoors?api-version=2021-06-01`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} front door(s)`);
      },
    },

    // ── 5. Web Apps / Functions ────────────────────────────────────────
    {
      id: 'web_apps',
      name: 'Listar Web Apps & Functions',
      feature: 'Security Scan (App Service + Functions)',
      critical: true,
      permissions: ['Microsoft.Web/sites/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.Web/sites?api-version=2023-01-01`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} web app(s)/function(s)`);
      },
    },

    // ── 6. SQL Servers & Databases ─────────────────────────────────────
    {
      id: 'sql_servers',
      name: 'Listar SQL Servers',
      feature: 'Security Scan (SQL Database) / Monitor Metrics',
      critical: true,
      permissions: ['Microsoft.Sql/servers/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.Sql/servers?api-version=2023-05-01-preview`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} SQL server(s)`);
      },
    },

    // ── 7. Key Vault ───────────────────────────────────────────────────
    {
      id: 'key_vaults',
      name: 'Listar Key Vaults',
      feature: 'Security Scan (Key Vault)',
      critical: false,
      permissions: ['Microsoft.KeyVault/vaults/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.KeyVault/vaults?api-version=2023-07-01`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} key vault(s)`);
      },
    },

    // ── 8. AKS ─────────────────────────────────────────────────────────
    {
      id: 'aks_clusters',
      name: 'Listar AKS Clusters',
      feature: 'Security Scan (AKS)',
      critical: false,
      permissions: ['Microsoft.ContainerService/managedClusters/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.ContainerService/managedClusters?api-version=2024-01-01`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} cluster(s) AKS`);
      },
    },

    // ── 9. Cosmos DB ───────────────────────────────────────────────────
    {
      id: 'cosmos_db',
      name: 'Listar Cosmos DB Accounts',
      feature: 'Security Scan (Cosmos DB)',
      critical: false,
      permissions: ['Microsoft.DocumentDB/databaseAccounts/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.DocumentDB/databaseAccounts?api-version=2023-11-15`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} Cosmos DB account(s)`);
      },
    },

    // ── 10. Redis Cache ────────────────────────────────────────────────
    {
      id: 'redis_cache',
      name: 'Listar Redis Cache',
      feature: 'Security Scan (Redis)',
      critical: false,
      permissions: ['Microsoft.Cache/redis/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.Cache/redis?api-version=2023-08-01`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} Redis cache(s)`);
      },
    },

    // ── 11. API Management ─────────────────────────────────────────────
    {
      id: 'api_management',
      name: 'Listar API Management',
      feature: 'Edge Services',
      critical: false,
      permissions: ['Microsoft.ApiManagement/service/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.ApiManagement/service?api-version=2023-05-01-preview`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} API Management instance(s)`);
      },
    },

    // ── 12. Cost Management ────────────────────────────────────────────
    {
      id: 'cost_management',
      name: 'Consultar Custos (Cost Management)',
      feature: 'Fetch Costs / Detect Anomalies / Cost Optimization',
      critical: true,
      permissions: ['Microsoft.CostManagement/query/action'],
      test: async () => {
        const r = await azurePost(
          ctx.accessToken,
          `${BASE}/subscriptions/${sub}/providers/Microsoft.CostManagement/query?api-version=2023-03-01`,
          {
            type: 'ActualCost',
            timeframe: 'Custom',
            timePeriod: { from: fmtDate(weekAgo), to: fmtDate(today) },
            dataset: {
              granularity: 'None',
              aggregation: { totalCost: { name: 'Cost', function: 'Sum' } },
            },
          }
        );
        if (r.status !== 200) return fail(`HTTP ${r.status}: ${r.body?.error?.message || 'Sem acesso a Cost Management'}`);
        const rows = r.body?.properties?.rows?.length ?? 0;
        return ok(`Query executada com sucesso (${rows} row(s))`);
      },
    },

    // ── 13. Reservations (RI/SP) ───────────────────────────────────────
    {
      id: 'reservations',
      name: 'Listar Reservations',
      feature: 'Reservations Analyzer',
      critical: false,
      permissions: ['Microsoft.Capacity/reservationOrders/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/providers/Microsoft.Capacity/reservationOrders?api-version=2022-11-01`);
        if (r.status === 200) return ok(`${r.body?.value?.length ?? 0} reservation order(s)`);
        if (r.status === 403) return fail('Sem permissão para listar reservations');
        return fail(`HTTP ${r.status}`);
      },
    },

    // ── 14. Security (Defender for Cloud) ──────────────────────────────
    {
      id: 'security_assessments',
      name: 'Listar Security Assessments',
      feature: 'Security Scan / Compliance Scan',
      critical: true,
      permissions: ['Microsoft.Security/assessments/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.Security/assessments?api-version=2021-06-01&$top=5`);
        if (r.status !== 200) return fail(`HTTP ${r.status}: ${r.body?.error?.message || 'Sem acesso a Security Assessments'}`);
        return ok(`${r.body?.value?.length ?? 0} assessment(s) na primeira página`);
      },
    },
    {
      id: 'secure_scores',
      name: 'Ler Secure Score',
      feature: 'Security Scan / Compliance Scan',
      critical: true,
      permissions: ['Microsoft.Security/secureScores/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.Security/secureScores?api-version=2020-01-01`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} secure score(s)`);
      },
    },
    {
      id: 'security_alerts',
      name: 'Listar Security Alerts (Defender)',
      feature: 'Defender Scan',
      critical: false,
      permissions: ['Microsoft.Security/alerts/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.Security/alerts?api-version=2022-01-01&$top=5`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} alert(s) na primeira página`);
      },
    },
    {
      id: 'regulatory_compliance',
      name: 'Listar Regulatory Compliance Standards',
      feature: 'Compliance Scan',
      critical: false,
      permissions: ['Microsoft.Security/regulatoryComplianceStandards/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.Security/regulatoryComplianceStandards?api-version=2019-01-01-preview`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} compliance standard(s)`);
      },
    },

    // ── 15. Advisor ────────────────────────────────────────────────────
    {
      id: 'advisor_recommendations',
      name: 'Listar Advisor Recommendations',
      feature: 'Cost Optimization / Well-Architected',
      critical: false,
      permissions: ['Microsoft.Advisor/recommendations/read'],
      test: async () => {
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.Advisor/recommendations?api-version=2023-01-01&$top=5`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} recommendation(s) na primeira página`);
      },
    },

    // ── 16. Monitor Metrics ────────────────────────────────────────────
    {
      id: 'monitor_metrics',
      name: 'Ler Monitor Metrics',
      feature: 'Monitor Metrics / Dashboard',
      critical: true,
      permissions: ['Microsoft.Insights/metrics/read'],
      test: async () => {
        // We need a real resource to test metrics. Try to find a VM or storage account.
        const resR = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/resources?api-version=2021-04-01&$top=50`);
        if (resR.status !== 200) return fail('Não foi possível listar recursos para testar métricas');
        const resources = resR.body?.value || [];
        const metricsTarget = resources.find((r: any) =>
          /Microsoft\.Compute\/virtualMachines|Microsoft\.Storage\/storageAccounts|Microsoft\.Web\/sites/i.test(r.type)
        );
        if (!metricsTarget) return ok('Nenhum recurso compatível encontrado para testar métricas (permissão não verificada)');
        const now = new Date();
        const hourAgo = new Date(now.getTime() - 3600000);
        const timespan = `${hourAgo.toISOString()}/${now.toISOString()}`;
        const metricName = /virtualMachines/i.test(metricsTarget.type) ? 'Percentage CPU' : 'UsedCapacity';
        const url = `${BASE}${metricsTarget.id}/providers/Microsoft.Insights/metrics?api-version=2021-05-01&metricnames=${encodeURIComponent(metricName)}&timespan=${encodeURIComponent(timespan)}&interval=PT1H&aggregation=Average`;
        const r = await azureGet(ctx.accessToken, url);
        if (r.status !== 200) return fail(`HTTP ${r.status} ao ler métricas de ${metricsTarget.name}`);
        return ok(`Métricas lidas com sucesso de ${metricsTarget.name} (${metricsTarget.type})`);
      },
    },

    // ── 17. Activity Logs ──────────────────────────────────────────────
    {
      id: 'activity_logs',
      name: 'Ler Activity Logs',
      feature: 'Activity Logs',
      critical: false,
      permissions: ['Microsoft.Insights/eventtypes/values/read'],
      test: async () => {
        const now = new Date();
        const dayAgo = new Date(now.getTime() - 86400000);
        const filter = `eventTimestamp ge '${dayAgo.toISOString()}' and eventTimestamp le '${now.toISOString()}'`;
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.Insights/eventtypes/management/values?api-version=2015-04-01&$filter=${encodeURIComponent(filter)}&$top=5`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} evento(s) de atividade na última 24h`);
      },
    },

    // ── 18. Diagnostic Settings (used by Key Vault scanner) ────────────
    {
      id: 'diagnostic_settings',
      name: 'Ler Diagnostic Settings',
      feature: 'Security Scan (Key Vault / Logging)',
      critical: false,
      permissions: ['Microsoft.Insights/diagnosticSettings/read'],
      test: async () => {
        // Test on the subscription itself
        const r = await azureGet(ctx.accessToken, `${BASE}/subscriptions/${sub}/providers/Microsoft.Insights/diagnosticSettings?api-version=2021-05-01-preview`);
        if (r.status !== 200) return fail(`HTTP ${r.status}`);
        return ok(`${r.body?.value?.length ?? 0} diagnostic setting(s) na assinatura`);
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

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

    if (!credentialId || typeof credentialId !== 'string') {
      return badRequest('credentialId is required');
    }

    logger.info('Validating Azure permissions (comprehensive)', { credentialId, organizationId });

    // ── Get credential ────────────────────────────────────────────────
    const credential = await prisma.azureCredential.findFirst({
      where: { id: credentialId, organization_id: organizationId },
    });

    if (!credential) {
      return badRequest('Azure credential not found');
    }

    // ── Obtain access token (supports OAuth, Certificate, SP) ─────────
    let accessToken: string;

    if (credential.auth_type === 'oauth') {
      // Force fresh token
      try {
        await prisma.azureCredential.update({
          where: { id: credentialId },
          data: { token_expires_at: new Date(0) },
        });
      } catch { /* ignore */ }

      const tokenResult = await getAzureCredentialWithToken(prisma, credentialId, organizationId);
      if (!tokenResult.success) {
        if (isInvalidClientSecretError(tokenResult.error)) {
          return error(INVALID_CLIENT_SECRET_MESSAGE, 401);
        }
        return error(tokenResult.error, 400);
      }
      accessToken = tokenResult.accessToken;
    } else if (credential.auth_type === 'certificate') {
      const pem = await resolveCertificatePem(credential);
      if (!credential.tenant_id || !credential.client_id || !pem) {
        return error('Certificate credentials incomplete.', 400);
      }
      const { ClientCertificateCredential } = await import('@azure/identity');
      const certCred = new ClientCertificateCredential(credential.tenant_id, credential.client_id, { certificate: pem });
      const tokenRes = await certCred.getToken('https://management.azure.com/.default');
      accessToken = tokenRes.token;
    } else {
      const resolvedSecret = await resolveClientSecret(credential);
      if (!credential.tenant_id || !credential.client_id || !resolvedSecret) {
        return error('Service Principal credentials incomplete.', 400);
      }
      try {
        const { ClientSecretCredential } = await import('@azure/identity');
        const spCred = new ClientSecretCredential(credential.tenant_id, credential.client_id, resolvedSecret);
        const tokenRes = await spCred.getToken('https://management.azure.com/.default');
        accessToken = tokenRes.token;
      } catch (spErr: any) {
        if (isInvalidClientSecretError(spErr.message || '')) {
          return error(INVALID_CLIENT_SECRET_MESSAGE, 401);
        }
        return error(`Service Principal authentication failed: ${spErr.message}`, 400);
      }
    }

    // ── Pre-flight: verify subscription is accessible by this token ───
    const ctx: TestContext = { accessToken, subscriptionId: credential.subscription_id };
    let subscriptionMismatch: { available: string[]; requested: string } | null = null;

    try {
      const subListRes = await azureGet(accessToken, `${BASE}/subscriptions?api-version=2022-12-01`);
      if (subListRes.status === 200 && subListRes.body?.value) {
        const availableSubs: Array<{ subscriptionId: string; displayName: string; state: string }> = subListRes.body.value;
        const match = availableSubs.find(s => s.subscriptionId === credential.subscription_id);
        if (!match && availableSubs.length > 0) {
          subscriptionMismatch = {
            available: availableSubs.map(s => `${s.subscriptionId} (${s.displayName}, ${s.state})`),
            requested: credential.subscription_id,
          };
          logger.warn('Subscription ID not found in token accessible subscriptions', {
            credentialId,
            requestedSubscription: credential.subscription_id,
            availableCount: availableSubs.length,
            availableIds: availableSubs.map(s => s.subscriptionId),
          });
        } else if (availableSubs.length === 0) {
          subscriptionMismatch = {
            available: [],
            requested: credential.subscription_id,
          };
          logger.warn('Token has no accessible subscriptions', { credentialId });
        }
      }
    } catch (err: any) {
      logger.warn('Pre-flight subscription check failed', { error: err.message });
    }

    // ── Run all tests in parallel (batches of 8) ──────────────────────
    const tests = buildFeatureTests(ctx);
    const results: TestResult[] = [];

    const BATCH_SIZE = 8;
    for (let i = 0; i < tests.length; i += BATCH_SIZE) {
      const batch = tests.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (t) => {
          const start = Date.now();
          try {
            const res = await t.test(ctx);
            return {
              id: t.id,
              name: t.name,
              feature: t.feature,
              critical: t.critical,
              permissions: t.permissions,
              status: res.ok ? 'ok' as const : (t.critical ? 'error' as const : 'warning' as const),
              detail: res.detail,
              durationMs: Date.now() - start,
            };
          } catch (err: any) {
            return {
              id: t.id,
              name: t.name,
              feature: t.feature,
              critical: t.critical,
              permissions: t.permissions,
              status: t.critical ? 'error' as const : 'warning' as const,
              detail: `Exceção: ${err.message}`,
              durationMs: Date.now() - start,
            };
          }
        })
      );

      for (const r of batchResults) {
        if (r.status === 'fulfilled') {
          results.push(r.value);
        }
      }
    }

    // ── Build summary ─────────────────────────────────────────────────
    const okCount = results.filter(r => r.status === 'ok').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    const warningCount = results.filter(r => r.status === 'warning').length;
    const totalDuration = results.reduce((s, r) => s + r.durationMs, 0);

    const summary = {
      total: results.length,
      ok: okCount,
      errors: errorCount,
      warnings: warningCount,
      isValid: errorCount === 0,
      totalDurationMs: totalDuration,
    };

    // Group by feature for easier frontend rendering
    const byFeature: Record<string, TestResult[]> = {};
    for (const r of results) {
      if (!byFeature[r.feature]) byFeature[r.feature] = [];
      byFeature[r.feature].push(r);
    }

    const missingPermissions = results
      .filter(r => r.status !== 'ok')
      .flatMap(r => r.permissions);

    logger.info('Azure permissions validation complete', {
      credentialId,
      summary,
    });

    return success({
      summary,
      results,
      byFeature,
      missingPermissions: [...new Set(missingPermissions)],
      subscriptionMismatch: subscriptionMismatch || undefined,
      credential: {
        id: credential.id,
        subscriptionId: credential.subscription_id,
        subscriptionName: credential.subscription_name,
        authType: credential.auth_type,
      },
    });
  } catch (err: any) {
    logger.error('Error validating Azure permissions', { error: err.message, stack: err.stack });
    return error('Internal server error', 500);
  }
}
