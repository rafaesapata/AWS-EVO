/**
 * Azure Compliance Scan Handler
 * 
 * Runs compliance checks against Azure resources using Azure SDK.
 * Supports CIS Azure Benchmark, Azure Security Benchmark, LGPD, GDPR, PCI-DSS.
 * Uses background jobs for async execution and stores results in ComplianceCheck table.
 */

// Ensure crypto is available globally for Azure SDK
import * as crypto from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = crypto.webcrypto || crypto;
}

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';

interface ComplianceControl {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  check: (clients: AzureClients, context: CheckContext) => Promise<CheckResult>;
}

interface AzureClients {
  tokenCredential: any;
  subscriptionId: string;
}

interface CheckContext {
  subscriptionId: string;
  organizationId: string;
}

interface CheckResult {
  status: 'passed' | 'failed' | 'error' | 'not_applicable';
  evidence: Record<string, any>;
  affected_resources: string[];
}

// Schema for starting a scan (from frontend)
const startScanSchema = z.object({
  frameworkId: z.string().min(1),
  credentialId: z.string().uuid(),
});

// Schema for async invocation (from start handler or Lambda invoke)
const asyncScanSchema = z.object({
  frameworkId: z.string().min(1),
  credentialId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
});

// ==================== FRAMEWORK CONTROLS ====================

const CIS_AZURE_CONTROLS: ComplianceControl[] = [
  {
    id: 'cis-azure-1.1',
    name: 'Ensure MFA is enabled for all privileged users',
    description: 'Multi-factor authentication should be enabled for all privileged Azure AD users',
    category: 'Identity and Access Management',
    severity: 'critical',
    check: async (clients, ctx) => {
      // MFA check requires Azure AD / Microsoft Graph API access which is not available in this context
      return { status: 'not_applicable', evidence: { reason: 'Requires Microsoft Graph API access for Azure AD MFA verification' }, affected_resources: [] };
    },
  },
  {
    id: 'cis-azure-2.1',
    name: 'Ensure Azure Defender is enabled for servers',
    description: 'Azure Defender should be enabled to provide threat protection for compute resources',
    category: 'Security Center',
    severity: 'high',
    check: async (clients, ctx) => {
      try {
        const { SecurityCenter } = await import('@azure/arm-security');
        const securityClient = new SecurityCenter(clients.tokenCredential, clients.subscriptionId);
        const pricings = securityClient.pricings;
        const result = await pricings.get('VirtualMachines');
        const isEnabled = result.pricingTier === 'Standard';
        return {
          status: isEnabled ? 'passed' : 'failed',
          evidence: { pricingTier: result.pricingTier, resourceType: 'VirtualMachines' },
          affected_resources: isEnabled ? [] : ['Microsoft.Security/pricings/VirtualMachines'],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'cis-azure-3.1',
    name: 'Ensure secure transfer required is enabled for storage accounts',
    description: 'Storage accounts should require HTTPS for secure data transfer',
    category: 'Storage',
    severity: 'high',
    check: async (clients, ctx) => {
      try {
        const { StorageManagementClient } = await import('@azure/arm-storage');
        const storageClient = new StorageManagementClient(clients.tokenCredential, clients.subscriptionId);
        const accounts = [];
        for await (const account of storageClient.storageAccounts.list()) {
          accounts.push(account);
        }
        const insecure = accounts.filter(a => !a.enableHttpsTrafficOnly);
        return {
          status: insecure.length === 0 ? 'passed' : 'failed',
          evidence: { totalAccounts: accounts.length, insecureAccounts: insecure.length },
          affected_resources: insecure.map(a => a.id || a.name || 'unknown'),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'cis-azure-4.1',
    name: 'Ensure SQL server auditing is enabled',
    description: 'Auditing should be enabled on all SQL servers',
    category: 'Database',
    severity: 'high',
    check: async (clients, ctx) => {
      try {
        const { SqlManagementClient } = await import('@azure/arm-sql');
        const sqlClient = new SqlManagementClient(clients.tokenCredential, clients.subscriptionId);
        const servers = [];
        for await (const server of sqlClient.servers.list()) {
          servers.push(server);
        }
        if (servers.length === 0) {
          return { status: 'not_applicable', evidence: { reason: 'No SQL servers found' }, affected_resources: [] };
        }
        const nonCompliant: string[] = [];
        for (const server of servers) {
          try {
            const rgName = server.id?.split('/')[4] || '';
            const auditing = await sqlClient.serverBlobAuditingPolicies.get(rgName, server.name!);
            if (auditing.state !== 'Enabled') {
              nonCompliant.push(server.id || server.name || 'unknown');
            }
          } catch {
            nonCompliant.push(server.id || server.name || 'unknown');
          }
        }
        return {
          status: nonCompliant.length === 0 ? 'passed' : 'failed',
          evidence: { totalServers: servers.length, nonCompliant: nonCompliant.length },
          affected_resources: nonCompliant,
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'cis-azure-5.1',
    name: 'Ensure diagnostic logs are enabled for all services',
    description: 'Diagnostic settings should be configured to capture activity logs',
    category: 'Logging and Monitoring',
    severity: 'medium',
    check: async (clients, ctx) => {
      try {
        const { MonitorClient } = await import('@azure/arm-monitor');
        const monitorClient = new MonitorClient(clients.tokenCredential, clients.subscriptionId);
        const settingsResult = await monitorClient.diagnosticSettings.list(`/subscriptions/${clients.subscriptionId}`);
        const settings = settingsResult.value || [];
        return {
          status: settings.length > 0 ? 'passed' : 'failed',
          evidence: { diagnosticSettingsCount: settings.length },
          affected_resources: settings.length === 0 ? [`/subscriptions/${clients.subscriptionId}`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'cis-azure-6.1',
    name: 'Ensure RDP access is restricted from the internet',
    description: 'Network security groups should not allow inbound RDP from any source',
    category: 'Networking',
    severity: 'critical',
    check: async (clients, ctx) => {
      try {
        const { NetworkManagementClient } = await import('@azure/arm-network');
        const networkClient = new NetworkManagementClient(clients.tokenCredential, clients.subscriptionId);
        const nsgs = [];
        for await (const nsg of networkClient.networkSecurityGroups.listAll()) {
          nsgs.push(nsg);
        }
        const exposed: string[] = [];
        for (const nsg of nsgs) {
          for (const rule of nsg.securityRules || []) {
            if (rule.direction === 'Inbound' && rule.access === 'Allow' &&
                (rule.destinationPortRange === '3389' || rule.destinationPortRange === '*') &&
                (rule.sourceAddressPrefix === '*' || rule.sourceAddressPrefix === '0.0.0.0/0' || rule.sourceAddressPrefix === 'Internet')) {
              exposed.push(nsg.id || nsg.name || 'unknown');
              break;
            }
          }
        }
        return {
          status: exposed.length === 0 ? 'passed' : 'failed',
          evidence: { totalNSGs: nsgs.length, exposedNSGs: exposed.length },
          affected_resources: exposed,
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'cis-azure-6.2',
    name: 'Ensure SSH access is restricted from the internet',
    description: 'Network security groups should not allow inbound SSH from any source',
    category: 'Networking',
    severity: 'critical',
    check: async (clients, ctx) => {
      try {
        const { NetworkManagementClient } = await import('@azure/arm-network');
        const networkClient = new NetworkManagementClient(clients.tokenCredential, clients.subscriptionId);
        const nsgs = [];
        for await (const nsg of networkClient.networkSecurityGroups.listAll()) {
          nsgs.push(nsg);
        }
        const exposed: string[] = [];
        for (const nsg of nsgs) {
          for (const rule of nsg.securityRules || []) {
            if (rule.direction === 'Inbound' && rule.access === 'Allow' &&
                (rule.destinationPortRange === '22' || rule.destinationPortRange === '*') &&
                (rule.sourceAddressPrefix === '*' || rule.sourceAddressPrefix === '0.0.0.0/0' || rule.sourceAddressPrefix === 'Internet')) {
              exposed.push(nsg.id || nsg.name || 'unknown');
              break;
            }
          }
        }
        return {
          status: exposed.length === 0 ? 'passed' : 'failed',
          evidence: { totalNSGs: nsgs.length, exposedNSGs: exposed.length },
          affected_resources: exposed,
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'cis-azure-7.1',
    name: 'Ensure VM disk encryption is enabled',
    description: 'Virtual machine disks should be encrypted at rest',
    category: 'Virtual Machines',
    severity: 'high',
    check: async (clients, ctx) => {
      try {
        const { ComputeManagementClient } = await import('@azure/arm-compute');
        const computeClient = new ComputeManagementClient(clients.tokenCredential, clients.subscriptionId);
        const vms = [];
        for await (const vm of computeClient.virtualMachines.listAll()) {
          vms.push(vm);
        }
        if (vms.length === 0) {
          return { status: 'not_applicable', evidence: { reason: 'No VMs found' }, affected_resources: [] };
        }
        // Check disk encryption status
        const unencrypted: string[] = [];
        for (const vm of vms) {
          const osDisk = vm.storageProfile?.osDisk;
          if (osDisk && !osDisk.encryptionSettings?.enabled && !osDisk.managedDisk?.securityProfile) {
            unencrypted.push(vm.id || vm.name || 'unknown');
          }
        }
        return {
          status: unencrypted.length === 0 ? 'passed' : 'failed',
          evidence: { totalVMs: vms.length, unencryptedVMs: unencrypted.length },
          affected_resources: unencrypted,
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'cis-azure-8.1',
    name: 'Ensure Key Vault is recoverable',
    description: 'Key Vaults should have soft delete and purge protection enabled',
    category: 'Key Vault',
    severity: 'high',
    check: async (clients, ctx) => {
      try {
        const { KeyVaultManagementClient } = await import('@azure/arm-keyvault');
        const kvClient = new KeyVaultManagementClient(clients.tokenCredential, clients.subscriptionId);
        const vaults = [];
        for await (const vault of kvClient.vaults.listBySubscription()) {
          vaults.push(vault);
        }
        if (vaults.length === 0) {
          return { status: 'not_applicable', evidence: { reason: 'No Key Vaults found' }, affected_resources: [] };
        }
        const nonRecoverable: string[] = [];
        for (const vault of vaults) {
          if (!vault.properties?.enableSoftDelete || !vault.properties?.enablePurgeProtection) {
            nonRecoverable.push(vault.id || vault.name || 'unknown');
          }
        }
        return {
          status: nonRecoverable.length === 0 ? 'passed' : 'failed',
          evidence: { totalVaults: vaults.length, nonRecoverable: nonRecoverable.length },
          affected_resources: nonRecoverable,
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
];

const AZURE_SECURITY_BENCHMARK_CONTROLS: ComplianceControl[] = [
  {
    id: 'asb-ns-1',
    name: 'Implement network segmentation',
    description: 'Ensure proper network segmentation using NSGs and Azure Firewall',
    category: 'Network Security',
    severity: 'high',
    check: async (clients, ctx) => {
      try {
        const { NetworkManagementClient } = await import('@azure/arm-network');
        const networkClient = new NetworkManagementClient(clients.tokenCredential, clients.subscriptionId);
        const nsgs = [];
        for await (const nsg of networkClient.networkSecurityGroups.listAll()) {
          nsgs.push(nsg);
        }
        return {
          status: nsgs.length > 0 ? 'passed' : 'failed',
          evidence: { nsgCount: nsgs.length },
          affected_resources: nsgs.length === 0 ? [`/subscriptions/${clients.subscriptionId}`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'asb-dp-1',
    name: 'Discover and classify sensitive data',
    description: 'Ensure data classification and protection mechanisms are in place',
    category: 'Data Protection',
    severity: 'medium',
    check: async (clients, ctx) => {
      try {
        const { StorageManagementClient } = await import('@azure/arm-storage');
        const storageClient = new StorageManagementClient(clients.tokenCredential, clients.subscriptionId);
        const accounts = [];
        for await (const account of storageClient.storageAccounts.list()) {
          accounts.push(account);
        }
        const withoutEncryption = accounts.filter(a => !a.encryption?.services?.blob?.enabled);
        return {
          status: withoutEncryption.length === 0 ? 'passed' : 'failed',
          evidence: { totalAccounts: accounts.length, unencrypted: withoutEncryption.length },
          affected_resources: withoutEncryption.map(a => a.id || a.name || 'unknown'),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'asb-lt-1',
    name: 'Enable threat detection',
    description: 'Azure Defender should be enabled for threat detection',
    category: 'Logging and Threat Detection',
    severity: 'high',
    check: async (clients, ctx) => {
      try {
        const { SecurityCenter } = await import('@azure/arm-security');
        const securityClient = new SecurityCenter(clients.tokenCredential, clients.subscriptionId);
        const pricings = securityClient.pricings;
        const result = await pricings.list();
        const enabledCount = (result.value || []).filter((p: any) => p.pricingTier === 'Standard').length;
        const totalCount = (result.value || []).length;
        return {
          status: enabledCount > 0 ? 'passed' : 'failed',
          evidence: { enabledDefenders: enabledCount, totalPricings: totalCount },
          affected_resources: enabledCount === 0 ? ['Microsoft.Security/pricings'] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'asb-br-1',
    name: 'Ensure regular automated backups',
    description: 'Resources should have automated backup policies configured',
    category: 'Backup and Recovery',
    severity: 'medium',
    check: async (clients, ctx) => {
      // This check requires Recovery Services Vault access
      return { status: 'not_applicable', evidence: { reason: 'Requires Recovery Services Vault configuration review' }, affected_resources: [] };
    },
  },
  {
    id: 'asb-pv-1',
    name: 'Define and establish secure configurations',
    description: 'Ensure Azure Policy is used to enforce secure configurations',
    category: 'Posture and Vulnerability Management',
    severity: 'medium',
    check: async (clients, ctx) => {
      try {
        const { PolicyClient } = await import('@azure/arm-policy');
        const policyClient = new PolicyClient(clients.tokenCredential, clients.subscriptionId);
        const assignments = [];
        for await (const assignment of policyClient.policyAssignments.list()) {
          assignments.push(assignment);
        }
        return {
          status: assignments.length > 0 ? 'passed' : 'failed',
          evidence: { policyAssignments: assignments.length },
          affected_resources: assignments.length === 0 ? [`/subscriptions/${clients.subscriptionId}`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
];

// Shared controls for LGPD, GDPR, PCI-DSS (mapped to Azure-specific checks)
const DATA_PROTECTION_CONTROLS: ComplianceControl[] = [
  {
    id: 'dp-encryption-at-rest',
    name: 'Ensure encryption at rest for all storage',
    description: 'All data storage services must use encryption at rest',
    category: 'Data Protection',
    severity: 'critical',
    check: async (clients, ctx) => {
      try {
        const { StorageManagementClient } = await import('@azure/arm-storage');
        const storageClient = new StorageManagementClient(clients.tokenCredential, clients.subscriptionId);
        const accounts = [];
        for await (const account of storageClient.storageAccounts.list()) {
          accounts.push(account);
        }
        const unencrypted = accounts.filter(a => !a.encryption?.services?.blob?.enabled);
        return {
          status: unencrypted.length === 0 ? 'passed' : 'failed',
          evidence: { totalAccounts: accounts.length, unencrypted: unencrypted.length },
          affected_resources: unencrypted.map(a => a.id || a.name || 'unknown'),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'dp-encryption-in-transit',
    name: 'Ensure encryption in transit (HTTPS only)',
    description: 'All services must enforce HTTPS for data in transit',
    category: 'Data Protection',
    severity: 'critical',
    check: async (clients, ctx) => {
      try {
        const { StorageManagementClient } = await import('@azure/arm-storage');
        const storageClient = new StorageManagementClient(clients.tokenCredential, clients.subscriptionId);
        const accounts = [];
        for await (const account of storageClient.storageAccounts.list()) {
          accounts.push(account);
        }
        const insecure = accounts.filter(a => !a.enableHttpsTrafficOnly);
        return {
          status: insecure.length === 0 ? 'passed' : 'failed',
          evidence: { totalAccounts: accounts.length, insecure: insecure.length },
          affected_resources: insecure.map(a => a.id || a.name || 'unknown'),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'dp-access-control',
    name: 'Ensure proper access controls are in place',
    description: 'RBAC should be properly configured with least privilege',
    category: 'Access Control',
    severity: 'high',
    check: async (clients, ctx) => {
      // RBAC check requires Authorization Management Client
      return { status: 'not_applicable', evidence: { reason: 'Requires Azure AD role assignment review' }, affected_resources: [] };
    },
  },
  {
    id: 'dp-network-security',
    name: 'Ensure network isolation for sensitive workloads',
    description: 'Sensitive workloads should be isolated using VNets and NSGs',
    category: 'Network Security',
    severity: 'high',
    check: async (clients, ctx) => {
      try {
        const { NetworkManagementClient } = await import('@azure/arm-network');
        const networkClient = new NetworkManagementClient(clients.tokenCredential, clients.subscriptionId);
        const vnets = [];
        for await (const vnet of networkClient.virtualNetworks.listAll()) {
          vnets.push(vnet);
        }
        return {
          status: vnets.length > 0 ? 'passed' : 'failed',
          evidence: { vnetCount: vnets.length },
          affected_resources: vnets.length === 0 ? [`/subscriptions/${clients.subscriptionId}`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'dp-logging',
    name: 'Ensure audit logging is enabled',
    description: 'Activity logs and diagnostic settings must be configured',
    category: 'Logging',
    severity: 'high',
    check: async (clients, ctx) => {
      try {
        const { MonitorClient } = await import('@azure/arm-monitor');
        const monitorClient = new MonitorClient(clients.tokenCredential, clients.subscriptionId);
        const settingsResult = await monitorClient.diagnosticSettings.list(`/subscriptions/${clients.subscriptionId}`);
        const settings = settingsResult.value || [];
        return {
          status: settings.length > 0 ? 'passed' : 'failed',
          evidence: { diagnosticSettingsCount: settings.length },
          affected_resources: settings.length === 0 ? [`/subscriptions/${clients.subscriptionId}`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
];

const AZURE_FRAMEWORKS: Record<string, ComplianceControl[]> = {
  'cis-azure': CIS_AZURE_CONTROLS,
  'azure-security-benchmark': AZURE_SECURITY_BENCHMARK_CONTROLS,
  'lgpd': DATA_PROTECTION_CONTROLS,
  'gdpr': DATA_PROTECTION_CONTROLS,
  'pci-dss': DATA_PROTECTION_CONTROLS,
};

function getFrameworkName(frameworkId: string): string {
  const names: Record<string, string> = {
    'cis-azure': 'CIS Microsoft Azure Foundations Benchmark',
    'azure-security-benchmark': 'Azure Security Benchmark',
    'lgpd': 'LGPD - Lei Geral de Proteção de Dados',
    'gdpr': 'GDPR - General Data Protection Regulation',
    'pci-dss': 'PCI-DSS v4.0',
  };
  return names[frameworkId] || frameworkId;
}

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const startTime = Date.now();

  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    logger.info('Azure Compliance Scan handler invoked', { organizationId });

    // Try async schema first (invoked from Lambda), then start schema (from frontend)
    let frameworkId: string;
    let credentialId: string;
    let jobId: string | undefined;

    const asyncValidation = parseAndValidateBody(asyncScanSchema, event.body);
    if (asyncValidation.success) {
      frameworkId = asyncValidation.data.frameworkId;
      credentialId = asyncValidation.data.credentialId;
      jobId = asyncValidation.data.jobId;
    } else {
      const startValidation = parseAndValidateBody(startScanSchema, event.body);
      if (!startValidation.success) {
        return startValidation.error;
      }
      frameworkId = startValidation.data.frameworkId;
      credentialId = startValidation.data.credentialId;
    }

    // If no jobId, this is a direct call from frontend — create a background job and return immediately
    if (!jobId) {
      // Check for existing running scan
      const existingJob = await prisma.backgroundJob.findFirst({
        where: {
          organization_id: organizationId,
          job_type: 'compliance-scan',
          status: { in: ['pending', 'running'] },
          payload: { path: ['frameworkId'], equals: frameworkId },
        },
      });

      if (existingJob) {
        const jobAge = Date.now() - new Date(existingJob.created_at).getTime();
        if (jobAge > 10 * 60 * 1000) {
          await prisma.backgroundJob.update({
            where: { id: existingJob.id },
            data: { status: 'failed', completed_at: new Date(), error: 'Job timed out' },
          });
        } else {
          return success({
            job_id: existingJob.id,
            status: existingJob.status,
            message: 'A compliance scan for this framework is already in progress',
            already_running: true,
          }, 200, origin);
        }
      }

      // Create background job
      const job = await prisma.backgroundJob.create({
        data: {
          organization_id: organizationId,
          job_type: 'compliance-scan',
          status: 'pending',
          payload: {
            jobName: `Azure Compliance - ${getFrameworkName(frameworkId)}`,
            frameworkId,
            credentialId,
            organizationId,
            cloudProvider: 'AZURE',
          },
          result: { progress: 0, message: 'Scan queued...' },
        },
      });

      // Invoke self asynchronously
      try {
        const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda');
        const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
        const prefix = process.env.LAMBDA_PREFIX || `evo-uds-v3-${process.env.ENVIRONMENT || 'sandbox'}`;

        await lambdaClient.send(new InvokeCommand({
          FunctionName: `${prefix}-azure-compliance-scan`,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify({
            body: JSON.stringify({ frameworkId, credentialId, jobId: job.id }),
            requestContext: {
              http: { method: 'POST' },
              authorizer: event.requestContext?.authorizer,
            },
            headers: {
              authorization: event.headers?.authorization || event.headers?.Authorization || '',
              'content-type': 'application/json',
            },
          })),
        }));
        logger.info('Invoked azure-compliance-scan Lambda async', { jobId: job.id });
      } catch (invokeErr: any) {
        logger.error('Failed to invoke azure-compliance-scan Lambda', { error: invokeErr.message });
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: { status: 'failed', error: `Failed to invoke scan: ${invokeErr.message}`, completed_at: new Date() },
        });
        return error('Failed to start Azure compliance scan', 500, undefined, origin);
      }

      return success({
        job_id: job.id,
        status: 'pending',
        message: 'Azure compliance scan started. Use the job_id to check progress.',
        framework: frameworkId,
        framework_name: getFrameworkName(frameworkId),
      }, 202, origin);
    }

    // ==================== ASYNC EXECUTION (with jobId) ====================

    // Update job to running
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: { status: 'running', started_at: new Date(), result: { progress: 0, message: 'Initializing Azure scan...' } },
    });

    // Fetch Azure credential
    const credential = await (prisma as any).azureCredential.findFirst({
      where: { id: credentialId, organization_id: organizationId, is_active: true },
    });

    if (!credential) {
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: { status: 'failed', error: 'Azure credential not found or inactive', completed_at: new Date() },
      });
      return error('Azure credential not found or inactive', 404, undefined, origin);
    }

    // Create token credential
    let tokenCredential: any;
    try {
      if (credential.auth_type === 'oauth') {
        const { getAzureCredentialWithToken, createStaticTokenCredential } = await import('../../lib/azure-helpers.js');
        const tokenResult = await getAzureCredentialWithToken(prisma, credentialId, organizationId);
        if (!tokenResult.success) {
          await prisma.backgroundJob.update({
            where: { id: jobId },
            data: { status: 'failed', error: tokenResult.error, completed_at: new Date() },
          });
          return error(tokenResult.error, 400, undefined, origin);
        }
        tokenCredential = createStaticTokenCredential(tokenResult.accessToken);
      } else {
        if (!credential.tenant_id || !credential.client_id || !credential.client_secret) {
          await prisma.backgroundJob.update({
            where: { id: jobId },
            data: { status: 'failed', error: 'Incomplete Service Principal credentials', completed_at: new Date() },
          });
          return error('Service Principal credentials incomplete', 400, undefined, origin);
        }
        const identity = await import('@azure/identity');
        tokenCredential = new identity.ClientSecretCredential(credential.tenant_id, credential.client_id, credential.client_secret);
      }
    } catch (authErr: any) {
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: { status: 'failed', error: `Authentication failed: ${authErr.message}`, completed_at: new Date() },
      });
      return error('Azure authentication failed. Please check your credentials.', 500, undefined, origin);
    }

    const azureClients: AzureClients = { tokenCredential, subscriptionId: credential.subscription_id };
    const checkContext: CheckContext = { subscriptionId: credential.subscription_id, organizationId };

    // Get framework controls
    const controls = AZURE_FRAMEWORKS[frameworkId];
    if (!controls) {
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: { status: 'failed', error: `Unknown framework: ${frameworkId}`, completed_at: new Date() },
      });
      return badRequest(`Unknown framework: ${frameworkId}`, undefined, origin);
    }

    // Run compliance checks
    const results: Array<{
      control_id: string; control_name: string; description: string;
      status: string; severity: string; evidence: any;
      remediation_steps: string; affected_resources: string[];
      framework_reference: string; region: string;
    }> = [];

    for (let i = 0; i < controls.length; i++) {
      const control = controls[i];
      try {
        const result = await control.check(azureClients, checkContext);
        results.push({
          control_id: control.id,
          control_name: control.name,
          description: control.description,
          status: result.status,
          severity: control.severity,
          evidence: result.evidence,
          remediation_steps: `Review ${control.category} settings in Azure Portal`,
          affected_resources: result.affected_resources,
          framework_reference: `${frameworkId.toUpperCase()} ${control.id}`,
          region: 'global',
        });
      } catch (err: any) {
        logger.error('Azure control check failed', { controlId: control.id, error: err.message });
        results.push({
          control_id: control.id,
          control_name: control.name,
          description: control.description,
          status: 'error',
          severity: control.severity,
          evidence: { error: err.message },
          remediation_steps: `Review ${control.category} settings in Azure Portal`,
          affected_resources: [],
          framework_reference: `${frameworkId.toUpperCase()} ${control.id}`,
          region: 'global',
        });
      }

      // Update progress
      if (jobId && (i + 1) % 2 === 0) {
        const progress = Math.round(((i + 1) / controls.length) * 100);
        await prisma.backgroundJob.update({
          where: { id: jobId },
          data: { result: { progress, message: `Checking ${control.id}...`, completed: i + 1, total: controls.length } },
        });
      }
    }

    // Create scan record in SecurityScan table (same as AWS flow)
    const scanRecord = await prisma.securityScan.create({
      data: {
        organization_id: organizationId,
        azure_credential_id: credentialId,
        cloud_provider: 'AZURE',
        scan_type: `compliance-${frameworkId}`,
        status: 'completed',
        scan_config: { framework: frameworkId, cloud_provider: 'AZURE', subscription_id: credential.subscription_id },
        completed_at: new Date(),
      },
    });

    // Delete old compliance checks for this framework + credential
    const oldScans = await prisma.securityScan.findMany({
      where: {
        organization_id: organizationId,
        azure_credential_id: credentialId,
        scan_type: `compliance-${frameworkId}`,
        id: { not: scanRecord.id },
      },
      select: { id: true },
    });
    if (oldScans.length > 0) {
      await prisma.complianceCheck.deleteMany({
        where: { scan_id: { in: oldScans.map(s => s.id) } },
      });
    }

    // Store compliance checks
    await prisma.complianceCheck.createMany({
      data: results.map(r => ({
        scan_id: scanRecord.id,
        framework: frameworkId,
        control_id: r.control_id,
        control_name: r.control_name,
        status: r.status,
        severity: r.severity,
        evidence: r.evidence,
        remediation_steps: r.remediation_steps,
      })),
    });

    // Calculate stats
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const errors = results.filter(r => r.status === 'error').length;
    const notApplicable = results.filter(r => r.status === 'not_applicable').length;
    const applicable = results.length - notApplicable - errors;
    const complianceScore = applicable > 0 ? Math.round((passed / applicable) * 100) : 0;
    const duration = Date.now() - startTime;

    // Update job as completed
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        completed_at: new Date(),
        result: {
          progress: 100,
          scan_id: scanRecord.id,
          framework: frameworkId,
          compliance_score: complianceScore,
          passed, failed, errors,
          duration_ms: duration,
        },
      },
    });

    // Store compliance history
    try {
      await prisma.securityPosture.create({
        data: {
          organization_id: organizationId,
          overall_score: complianceScore,
          critical_findings: results.filter(r => r.status === 'failed' && r.severity === 'critical').length,
          high_findings: results.filter(r => r.status === 'failed' && r.severity === 'high').length,
          medium_findings: results.filter(r => r.status === 'failed' && r.severity === 'medium').length,
          low_findings: results.filter(r => r.status === 'failed' && r.severity === 'low').length,
          compliance_score: complianceScore,
          risk_level: complianceScore >= 80 ? 'low' : complianceScore >= 60 ? 'medium' : 'high',
        },
      });
    } catch (e) {
      logger.warn('Failed to store compliance history', { error: e });
    }

    // Audit log
    logAuditAsync({
      organizationId,
      userId: user.sub,
      action: 'COMPLIANCE_SCAN_COMPLETE',
      resourceType: 'compliance_scan',
      resourceId: scanRecord.id,
      details: {
        cloud_provider: 'AZURE',
        subscription_id: credential.subscription_id,
        framework: frameworkId,
        compliance_score: complianceScore,
        passed, failed, errors,
        duration_ms: duration,
      },
      ipAddress: getIpFromEvent(event),
      userAgent: getUserAgentFromEvent(event),
    });

    logger.info('Azure compliance scan completed', { frameworkId, complianceScore, passed, failed, duration: `${duration}ms` });

    return success({
      scan_id: scanRecord.id,
      framework: frameworkId,
      framework_name: getFrameworkName(frameworkId),
      checks_count: results.length,
      passed, failed, errors,
      not_applicable: notApplicable,
      compliance_score: complianceScore,
      duration_ms: duration,
    }, 200, origin);

  } catch (err: any) {
    logger.error('Azure compliance scan error', { error: err.message });

    // Update job as failed if possible
    try {
      const body = event.body ? JSON.parse(event.body) : {};
      if (body.jobId) {
        const prisma = getPrismaClient();
        await prisma.backgroundJob.update({
          where: { id: body.jobId },
          data: {
            status: 'failed',
            completed_at: new Date(),
            error: err.message || 'Internal server error',
            result: { progress: 0, error: err.message || 'Internal server error' },
          },
        });
      }
    } catch (updateErr) {
      logger.error('Failed to update job status', { error: updateErr });
    }

    return error('Failed to run Azure compliance scan', 500, undefined, getOrigin(event));
  }
}
