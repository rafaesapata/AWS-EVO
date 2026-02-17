/**
 * Azure Well-Architected Scan Handler
 * 
 * Analyzes Azure resources against the Azure Well-Architected Framework pillars
 * using real Azure REST API calls (Resource Graph).
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
import { logger } from '../../lib/logger.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { getAzureCredentialWithToken, resolveAzureTenantId, validateServicePrincipalCredentials, validateCertificateCredentials, getAzureTokenUrl, isInvalidClientSecretError, INVALID_CLIENT_SECRET_MESSAGE } from '../../lib/azure-helpers.js';
import { z } from 'zod';

const VALID_PILLARS = [
  'reliability', 'security', 'cost_optimization',
  'operational_excellence', 'performance_efficiency', 'sustainability',
] as const;

type PillarName = typeof VALID_PILLARS[number];

interface Recommendation {
  check_name: string;
  description: string;
  recommendation: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface PillarResult {
  pillar: PillarName;
  score: number;
  checks_passed: number;
  checks_failed: number;
  critical_issues: number;
  recommendations: Recommendation[];
}

const wellArchScanSchema = z.object({
  credentialId: z.string().uuid('Invalid credential ID'),
  pillars: z.array(z.enum(VALID_PILLARS)).optional(),
});


// ─── Azure REST API helpers ───────────────────────────────────────────────────

const AZURE_MGMT = 'https://management.azure.com';
const API_VERSION_COMPUTE = '2023-09-01';
const API_VERSION_NETWORK = '2023-09-01';
const API_VERSION_STORAGE = '2023-01-01';
const API_VERSION_SQL = '2021-11-01';
const API_VERSION_MONITOR = '2021-05-01';
const API_VERSION_ADVISOR = '2022-10-01';
const API_VERSION_SECURITY = '2024-01-01';
const API_VERSION_RESOURCE_GRAPH = '2021-03-01';

async function azureGet(token: string, url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.warn('Azure API call failed', { url: url.substring(0, 120), status: res.status, body: text.substring(0, 200) });
    return null;
  }
  return res.json();
}

async function azurePost(token: string, url: string, body: any): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.warn('Azure API POST failed', { url: url.substring(0, 120), status: res.status, body: text.substring(0, 200) });
    return null;
  }
  return res.json();
}

/** Query Azure Resource Graph for resource data */
async function queryResourceGraph(token: string, subscriptionId: string, query: string): Promise<any[]> {
  const url = `${AZURE_MGMT}/providers/Microsoft.ResourceGraph/resources?api-version=${API_VERSION_RESOURCE_GRAPH}`;
  const result = await azurePost(token, url, {
    subscriptions: [subscriptionId],
    query,
    options: { resultFormat: 'objectArray' },
  });
  return result?.data || [];
}


// ─── Pillar Analysis Functions (real Azure data) ──────────────────────────────

function analyzeReliability(vms: any[], disks: any[], sqlDbs: any[], lbs: any[]): PillarResult {
  const recs: Recommendation[] = [];
  let pass = 0, fail = 0, crit = 0;

  // Check VMs in availability sets/zones
  const noAvailability = vms.filter(vm => !vm.zones?.length && !vm.properties?.availabilitySet);
  if (noAvailability.length > 0) {
    fail++; crit++;
    recs.push({
      check_name: 'Zonas de Disponibilidade',
      description: `${noAvailability.length} VM(s) sem zona de disponibilidade ou availability set: ${noAvailability.slice(0, 3).map((v: any) => v.name).join(', ')}`,
      recommendation: 'Configure zonas de disponibilidade ou availability sets para garantir alta disponibilidade',
      severity: 'critical',
    });
  } else if (vms.length > 0) { pass++; }

  // Check unmanaged disks
  const unmanagedDisks = disks.filter(d => d.properties?.diskState === 'Unattached');
  if (unmanagedDisks.length > 0) {
    fail++;
    recs.push({
      check_name: 'Discos Não Anexados',
      description: `${unmanagedDisks.length} disco(s) não anexados a nenhuma VM: ${unmanagedDisks.slice(0, 3).map((d: any) => d.name).join(', ')}`,
      recommendation: 'Remova discos não utilizados ou anexe-os a VMs para evitar custos desnecessários e riscos de dados órfãos',
      severity: 'medium',
    });
  } else if (disks.length > 0) { pass++; }

  // Check SQL databases without geo-replication
  const noGeoRepl = sqlDbs.filter(db => !db.properties?.secondaryType && db.properties?.currentServiceObjectiveName !== 'ElasticPool');
  if (noGeoRepl.length > 0) {
    fail++; crit++;
    recs.push({
      check_name: 'Geo-Replicação SQL',
      description: `${noGeoRepl.length} banco(s) SQL sem geo-replicação configurada: ${noGeoRepl.slice(0, 3).map((d: any) => d.name).join(', ')}`,
      recommendation: 'Configure geo-replicação ativa para bancos de dados críticos para garantir recuperação de desastres',
      severity: 'critical',
    });
  } else if (sqlDbs.length > 0) { pass++; }

  // Check load balancers with health probes
  const noProbes = lbs.filter(lb => !lb.properties?.probes?.length);
  if (noProbes.length > 0) {
    fail++;
    recs.push({
      check_name: 'Health Probes',
      description: `${noProbes.length} load balancer(s) sem health probes configurados: ${noProbes.slice(0, 3).map((l: any) => l.name).join(', ')}`,
      recommendation: 'Configure health probes nos load balancers para detectar instâncias não saudáveis automaticamente',
      severity: 'high',
    });
  } else if (lbs.length > 0) { pass++; }

  // Check backup configuration (VMs without backup)
  const noBackupVMs = vms.filter(vm => !vm.properties?.securityProfile?.encryptionAtHost);
  if (vms.length > 0 && vms.length > 2) {
    // Conservative: if there are VMs, recommend backup verification
    fail++;
    recs.push({
      check_name: 'Backup de VMs',
      description: `${vms.length} VM(s) encontradas - verifique se todas possuem Azure Backup configurado`,
      recommendation: 'Configure Azure Backup para todas as VMs de produção com política de retenção adequada',
      severity: 'high',
    });
  } else if (vms.length > 0) { pass++; }

  const total = pass + fail;
  return {
    pillar: 'reliability',
    score: total > 0 ? Math.round((pass / total) * 100) : 100,
    checks_passed: pass, checks_failed: fail, critical_issues: crit,
    recommendations: recs,
  };
}


function analyzeSecurity(nsgs: any[], storageAccounts: any[], keyVaults: any[], sqlServers: any[], securityAssessments: any[]): PillarResult {
  const recs: Recommendation[] = [];
  let pass = 0, fail = 0, crit = 0;

  // Check NSGs with overly permissive rules (0.0.0.0/0 on non-HTTP ports)
  const openNSGs: string[] = [];
  for (const nsg of nsgs) {
    const rules = nsg.properties?.securityRules || [];
    const hasOpenRule = rules.some((r: any) =>
      r.properties?.access === 'Allow' &&
      r.properties?.direction === 'Inbound' &&
      (r.properties?.sourceAddressPrefix === '*' || r.properties?.sourceAddressPrefix === '0.0.0.0/0') &&
      r.properties?.destinationPortRange !== '443' &&
      r.properties?.destinationPortRange !== '80'
    );
    if (hasOpenRule) openNSGs.push(nsg.name);
  }
  if (openNSGs.length > 0) {
    fail++; crit++;
    recs.push({
      check_name: 'NSGs com Acesso Aberto',
      description: `${openNSGs.length} NSG(s) com regras permitindo acesso de qualquer origem em portas não-HTTP: ${openNSGs.slice(0, 3).join(', ')}`,
      recommendation: 'Restrinja as regras de NSG para permitir apenas IPs e portas necessários. Evite 0.0.0.0/0 em portas sensíveis',
      severity: 'critical',
    });
  } else if (nsgs.length > 0) { pass++; }

  // Check storage accounts without HTTPS-only
  const noHttps = storageAccounts.filter(sa => sa.properties?.supportsHttpsTrafficOnly === false);
  if (noHttps.length > 0) {
    fail++; crit++;
    recs.push({
      check_name: 'Storage sem HTTPS',
      description: `${noHttps.length} storage account(s) permitindo tráfego HTTP não criptografado: ${noHttps.slice(0, 3).map((s: any) => s.name).join(', ')}`,
      recommendation: 'Habilite "Secure transfer required" em todas as storage accounts para forçar HTTPS',
      severity: 'critical',
    });
  } else if (storageAccounts.length > 0) { pass++; }

  // Check storage accounts with public blob access
  const publicBlob = storageAccounts.filter(sa => sa.properties?.allowBlobPublicAccess === true);
  if (publicBlob.length > 0) {
    fail++; crit++;
    recs.push({
      check_name: 'Blob Público',
      description: `${publicBlob.length} storage account(s) com acesso público a blobs habilitado: ${publicBlob.slice(0, 3).map((s: any) => s.name).join(', ')}`,
      recommendation: 'Desabilite o acesso público a blobs e use SAS tokens ou Azure AD para controle de acesso',
      severity: 'critical',
    });
  } else if (storageAccounts.length > 0) { pass++; }

  // Check Key Vaults with soft delete disabled
  const noSoftDelete = keyVaults.filter(kv => kv.properties?.enableSoftDelete === false);
  if (noSoftDelete.length > 0) {
    fail++;
    recs.push({
      check_name: 'Key Vault Soft Delete',
      description: `${noSoftDelete.length} Key Vault(s) sem soft delete habilitado: ${noSoftDelete.slice(0, 3).map((k: any) => k.name).join(', ')}`,
      recommendation: 'Habilite soft delete e purge protection em todos os Key Vaults para proteger contra exclusão acidental',
      severity: 'high',
    });
  } else if (keyVaults.length > 0) { pass++; }

  // Check SQL Servers without TDE or auditing
  const noAudit = sqlServers.filter(s => !s.properties?.administratorLoginPassword);
  if (sqlServers.length > 0) {
    // Check for Azure AD admin configured
    const noADAdmin = sqlServers.filter(s => !s.properties?.administrators?.azureADOnlyAuthentication);
    if (noADAdmin.length > 0) {
      fail++;
      recs.push({
        check_name: 'SQL Azure AD Auth',
        description: `${noADAdmin.length} SQL Server(s) sem autenticação exclusiva Azure AD: ${noADAdmin.slice(0, 3).map((s: any) => s.name).join(', ')}`,
        recommendation: 'Configure autenticação Azure AD exclusiva nos SQL Servers para eliminar senhas SQL',
        severity: 'high',
      });
    } else { pass++; }
  }

  // Check Security Center assessments (unhealthy)
  const unhealthy = securityAssessments.filter(a => a.properties?.status?.code === 'Unhealthy');
  if (unhealthy.length > 0) {
    fail++;
    const topIssues = unhealthy.slice(0, 3).map((a: any) => a.properties?.displayName || a.name).join(', ');
    recs.push({
      check_name: 'Microsoft Defender Findings',
      description: `${unhealthy.length} recomendação(ões) do Microsoft Defender com status "Unhealthy": ${topIssues}`,
      recommendation: 'Revise e corrija as recomendações do Microsoft Defender for Cloud para melhorar a postura de segurança',
      severity: unhealthy.length > 5 ? 'critical' : 'high',
    });
  } else if (securityAssessments.length > 0) { pass++; }

  const total = pass + fail;
  return {
    pillar: 'security',
    score: total > 0 ? Math.round((pass / total) * 100) : 100,
    checks_passed: pass, checks_failed: fail, critical_issues: crit,
    recommendations: recs,
  };
}


function analyzeOperationalExcellence(vms: any[], alertRules: any[], resourceGroups: any[]): PillarResult {
  const recs: Recommendation[] = [];
  let pass = 0, fail = 0, crit = 0;

  // Check if monitoring alerts are configured
  if (alertRules.length === 0) {
    fail++; crit++;
    recs.push({
      check_name: 'Alertas de Monitoramento',
      description: 'Nenhuma regra de alerta do Azure Monitor configurada na subscription',
      recommendation: 'Configure alertas para métricas críticas como CPU, memória, disco e disponibilidade dos serviços',
      severity: 'critical',
    });
  } else if (alertRules.length < 3) {
    fail++;
    recs.push({
      check_name: 'Alertas Insuficientes',
      description: `Apenas ${alertRules.length} regra(s) de alerta configurada(s) - insuficiente para monitoramento adequado`,
      recommendation: 'Configure alertas para todos os recursos críticos incluindo VMs, bancos de dados e serviços de aplicação',
      severity: 'high',
    });
  } else { pass++; }

  // Check resource tagging
  const untaggedVMs = vms.filter(vm => !vm.tags || Object.keys(vm.tags).length < 2);
  if (untaggedVMs.length > 0) {
    fail++;
    recs.push({
      check_name: 'Tags de Recursos',
      description: `${untaggedVMs.length} VM(s) sem tags adequadas (mínimo 2 tags): ${untaggedVMs.slice(0, 3).map((v: any) => v.name).join(', ')}`,
      recommendation: 'Implemente uma estratégia de tagging com tags obrigatórias como Environment, Owner, CostCenter e Application',
      severity: 'medium',
    });
  } else if (vms.length > 0) { pass++; }

  // Check diagnostic settings (resource groups as proxy for organization)
  if (resourceGroups.length > 10) {
    // Many resource groups may indicate lack of organization
    const emptyRGs = resourceGroups.filter(rg => rg.properties?.provisioningState === 'Succeeded');
    if (emptyRGs.length > 15) {
      fail++;
      recs.push({
        check_name: 'Organização de Resource Groups',
        description: `${resourceGroups.length} resource groups encontrados - considere consolidar para melhor gerenciamento`,
        recommendation: 'Revise e consolide resource groups. Use naming conventions e organize por aplicação ou ambiente',
        severity: 'low',
      });
    } else { pass++; }
  } else { pass++; }

  // Check if VMs have diagnostic extensions
  const noExtensions = vms.filter(vm => {
    const extensions = vm.properties?.instanceView?.extensions || [];
    return !extensions.some((e: any) => 
      e.name?.toLowerCase().includes('diagnostic') || 
      e.name?.toLowerCase().includes('monitor')
    );
  });
  if (noExtensions.length > 0 && vms.length > 0) {
    fail++;
    recs.push({
      check_name: 'Diagnóstico de VMs',
      description: `${vms.length} VM(s) encontradas - verifique se possuem extensões de diagnóstico habilitadas`,
      recommendation: 'Instale a extensão Azure Monitor Agent em todas as VMs para coleta de logs e métricas detalhadas',
      severity: 'medium',
    });
  } else if (vms.length > 0) { pass++; }

  const total = pass + fail;
  return {
    pillar: 'operational_excellence',
    score: total > 0 ? Math.round((pass / total) * 100) : 100,
    checks_passed: pass, checks_failed: fail, critical_issues: crit,
    recommendations: recs,
  };
}

function analyzePerformance(vms: any[], sqlDbs: any[], appGateways: any[]): PillarResult {
  const recs: Recommendation[] = [];
  let pass = 0, fail = 0;

  // Check for old-generation VM sizes
  const oldGenPatterns = /^(Basic_|Standard_A[0-9]|Standard_D[1-4]v2|Standard_DS[1-4]v2)$/i;
  const oldGenVMs = vms.filter(vm => oldGenPatterns.test(vm.properties?.hardwareProfile?.vmSize || ''));
  if (oldGenVMs.length > 0) {
    fail++;
    recs.push({
      check_name: 'Geração de VMs',
      description: `${oldGenVMs.length} VM(s) usando tamanhos de geração antiga: ${oldGenVMs.slice(0, 3).map((v: any) => `${v.name} (${v.properties?.hardwareProfile?.vmSize})`).join(', ')}`,
      recommendation: 'Migre para VMs de geração mais recente (Dv5, Ev5, Fsv2) para melhor relação custo-performance',
      severity: 'medium',
    });
  } else if (vms.length > 0) { pass++; }

  // Check SQL databases on Basic/S0 tier
  const lowTierDBs = sqlDbs.filter(db => {
    const tier = db.properties?.currentServiceObjectiveName || '';
    return tier === 'Basic' || tier === 'S0' || tier === 'Free';
  });
  if (lowTierDBs.length > 0) {
    fail++;
    recs.push({
      check_name: 'Tier de SQL Database',
      description: `${lowTierDBs.length} banco(s) SQL em tier básico/gratuito: ${lowTierDBs.slice(0, 3).map((d: any) => `${d.name} (${d.properties?.currentServiceObjectiveName})`).join(', ')}`,
      recommendation: 'Avalie migrar bancos de produção para tiers Standard S3+ ou Premium para melhor performance e SLA',
      severity: 'high',
    });
  } else if (sqlDbs.length > 0) { pass++; }

  // Check for CDN/Application Gateway usage
  if (appGateways.length === 0 && vms.length > 3) {
    fail++;
    recs.push({
      check_name: 'Application Gateway / CDN',
      description: 'Nenhum Application Gateway encontrado com múltiplas VMs na subscription',
      recommendation: 'Considere usar Application Gateway ou Azure Front Door para balanceamento de carga e caching',
      severity: 'medium',
    });
  } else if (appGateways.length > 0) { pass++; }

  // Check VMs with Standard HDD
  const hddVMs = vms.filter(vm => {
    const osDisk = vm.properties?.storageProfile?.osDisk;
    return osDisk?.managedDisk?.storageAccountType === 'Standard_LRS';
  });
  if (hddVMs.length > 0) {
    fail++;
    recs.push({
      check_name: 'Tipo de Disco',
      description: `${hddVMs.length} VM(s) usando disco Standard HDD: ${hddVMs.slice(0, 3).map((v: any) => v.name).join(', ')}`,
      recommendation: 'Migre para Premium SSD ou Standard SSD para melhor performance de I/O',
      severity: 'high',
    });
  } else if (vms.length > 0) { pass++; }

  const total = pass + fail;
  return {
    pillar: 'performance_efficiency',
    score: total > 0 ? Math.round((pass / total) * 100) : 100,
    checks_passed: pass, checks_failed: fail, critical_issues: 0,
    recommendations: recs,
  };
}


function analyzeCostOptimization(vms: any[], disks: any[], advisorRecs: any[]): PillarResult {
  const recs: Recommendation[] = [];
  let pass = 0, fail = 0;

  // Check deallocated VMs still incurring costs (disks)
  const deallocated = vms.filter(vm => 
    vm.properties?.provisioningState === 'Succeeded' && 
    (vm.properties?.instanceView?.statuses || []).some((s: any) => s.code?.includes('deallocated'))
  );
  if (deallocated.length > 0) {
    fail++;
    recs.push({
      check_name: 'VMs Desalocadas',
      description: `${deallocated.length} VM(s) desalocadas ainda gerando custos de disco: ${deallocated.slice(0, 3).map((v: any) => v.name).join(', ')}`,
      recommendation: 'Exclua VMs desalocadas que não são mais necessárias ou crie snapshots e remova os discos',
      severity: 'medium',
    });
  } else { pass++; }

  // Check unattached disks
  const unattached = disks.filter(d => d.properties?.diskState === 'Unattached');
  if (unattached.length > 0) {
    fail++;
    const totalSizeGB = unattached.reduce((sum: number, d: any) => sum + (d.properties?.diskSizeGB || 0), 0);
    recs.push({
      check_name: 'Discos Não Utilizados',
      description: `${unattached.length} disco(s) não anexados totalizando ${totalSizeGB} GB: ${unattached.slice(0, 3).map((d: any) => `${d.name} (${d.properties?.diskSizeGB}GB)`).join(', ')}`,
      recommendation: 'Remova discos não utilizados para eliminar custos de armazenamento desnecessários',
      severity: 'medium',
    });
  } else if (disks.length > 0) { pass++; }

  // Check Azure Advisor cost recommendations
  const costAdvisor = advisorRecs.filter(r => r.properties?.category === 'Cost');
  if (costAdvisor.length > 0) {
    fail++;
    const topRecs = costAdvisor.slice(0, 3).map((r: any) => 
      r.properties?.shortDescription?.problem || r.properties?.shortDescription?.solution || 'Recomendação de custo'
    ).join('; ');
    recs.push({
      check_name: 'Azure Advisor - Custos',
      description: `${costAdvisor.length} recomendação(ões) de otimização de custos do Azure Advisor: ${topRecs}`,
      recommendation: 'Revise e implemente as recomendações do Azure Advisor para reduzir custos',
      severity: costAdvisor.length > 3 ? 'high' : 'medium',
    });
  } else { pass++; }

  // Check for VMs that could use Reserved Instances
  const runningVMs = vms.filter(vm => vm.properties?.provisioningState === 'Succeeded');
  if (runningVMs.length > 3) {
    fail++;
    recs.push({
      check_name: 'Instâncias Reservadas',
      description: `${runningVMs.length} VMs em execução - potencial economia com Reserved Instances ou Savings Plans`,
      recommendation: 'Avalie Azure Reserved VM Instances ou Savings Plans para VMs com uso previsível (economia de até 72%)',
      severity: 'medium',
    });
  } else { pass++; }

  const total = pass + fail;
  return {
    pillar: 'cost_optimization',
    score: total > 0 ? Math.round((pass / total) * 100) : 100,
    checks_passed: pass, checks_failed: fail, critical_issues: 0,
    recommendations: recs,
  };
}

function analyzeSustainability(vms: any[], appServices: any[]): PillarResult {
  const recs: Recommendation[] = [];
  let pass = 1, fail = 0; // Region OK by default

  // Check for ARM-based VMs (Ampere/Cobalt)
  const nonArm = vms.filter(vm => {
    const size = vm.properties?.hardwareProfile?.vmSize || '';
    return !size.toLowerCase().includes('p') && vm.properties?.provisioningState === 'Succeeded';
  });
  if (nonArm.length > 0 && vms.length > 2) {
    fail++;
    recs.push({
      check_name: 'VMs ARM (Cobalt)',
      description: `${nonArm.length} VM(s) usando processadores x86 - considere Azure Cobalt (ARM) para melhor eficiência energética`,
      recommendation: 'Avalie migrar workloads compatíveis para VMs baseadas em ARM (Dpsv5, Epsv5) para menor consumo de energia',
      severity: 'low',
    });
  } else if (vms.length > 0) { pass++; }

  // Check for serverless usage
  if (appServices.length === 0 && vms.length > 5) {
    fail++;
    recs.push({
      check_name: 'Uso de Serverless',
      description: `${vms.length} VMs sem uso de App Services/Functions - considere serverless para workloads variáveis`,
      recommendation: 'Migre workloads com demanda variável para Azure Functions ou App Service para otimizar uso de recursos',
      severity: 'low',
    });
  } else if (appServices.length > 0) { pass++; }

  // Check for auto-scaling
  const noAutoScale = vms.filter(vm => !vm.properties?.virtualMachineScaleSet);
  if (noAutoScale.length > 3) {
    fail++;
    recs.push({
      check_name: 'Auto-Scaling',
      description: `${noAutoScale.length} VM(s) sem auto-scaling configurado via VMSS`,
      recommendation: 'Use Virtual Machine Scale Sets com auto-scaling para ajustar capacidade automaticamente à demanda',
      severity: 'medium',
    });
  } else if (vms.length > 0) { pass++; }

  const total = pass + fail;
  return {
    pillar: 'sustainability',
    score: total > 0 ? Math.round((pass / total) * 100) : 100,
    checks_passed: pass, checks_failed: fail, critical_issues: 0,
    recommendations: recs,
  };
}


// ─── Token Resolution ─────────────────────────────────────────────────────────

async function resolveAccessToken(prisma: any, credential: any, credentialId: string, organizationId: string): Promise<{ token: string } | { error: string }> {
  if (credential.auth_type === 'oauth') {
    const tokenResult = await getAzureCredentialWithToken(prisma, credentialId, organizationId);
    if (!tokenResult.success) return { error: tokenResult.error };
    return { token: tokenResult.accessToken };
  }

  if (credential.auth_type === 'certificate') {
    const certValidation = await validateCertificateCredentials(credential);
    if (!certValidation.valid) return { error: certValidation.error };
    const { ClientCertificateCredential } = await import('@azure/identity');
    const certCred = new ClientCertificateCredential(
      certValidation.credentials.tenantId,
      certValidation.credentials.clientId,
      { certificate: certValidation.credentials.certificatePem }
    );
    const tokenResponse = await certCred.getToken('https://management.azure.com/.default');
    return { token: tokenResponse.token };
  }

  // Service Principal
  const spValidation = await validateServicePrincipalCredentials(credential);
  if (!spValidation.valid) return { error: spValidation.error };

  const tokenUrl = getAzureTokenUrl(spValidation.credentials.tenantId);
  const params = new URLSearchParams({
    client_id: spValidation.credentials.clientId,
    client_secret: spValidation.credentials.clientSecret,
    grant_type: 'client_credentials',
    scope: 'https://management.azure.com/.default',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (isInvalidClientSecretError(errorText)) {
      return { error: `invalid_client: ${INVALID_CLIENT_SECRET_MESSAGE}` };
    }
    return { error: `Failed to get access token: ${response.status}` };
  }

  const data = await response.json() as { access_token: string };
  return { token: data.access_token };
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (getHttpMethod(event) === 'OPTIONS') return corsOptions();

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    logger.info('Starting Azure Well-Architected scan', { organizationId });

    const validation = parseAndValidateBody(wellArchScanSchema, event.body);
    if (!validation.success) return validation.error;

    const { credentialId, pillars = [...VALID_PILLARS] } = validation.data;

    // Fetch credential
    const credential = await (prisma as any).azureCredential.findFirst({
      where: { id: credentialId, organization_id: organizationId, is_active: true },
    });
    if (!credential) return error('Azure credential not found or inactive', 404);

    // Get access token
    const tokenResult = await resolveAccessToken(prisma, credential, credentialId, organizationId);
    if ('error' in tokenResult) return error(tokenResult.error, 400);
    const token = tokenResult.token;
    const subscriptionId = credential.subscription_id;

    const startTime = Date.now();

    // Create scan record
    const scan = await prisma.securityScan.create({
      data: {
        organization_id: organizationId,
        cloud_provider: 'AZURE',
        azure_credential_id: credentialId,
        scan_type: 'well_architected',
        status: 'running',
        scan_config: { pillars, cloudProvider: 'AZURE' },
        started_at: new Date(),
      },
    });

    // ─── Fetch real Azure resources in parallel ───────────────────────────────
    const [vms, disks, nsgs, storageAccounts, keyVaults, sqlServers, sqlDbs, lbs, appGateways, alertRules, advisorRecs, securityAssessments, resourceGroups, appServices] = await Promise.all([
      // VMs
      azureGet(token, `${AZURE_MGMT}/subscriptions/${subscriptionId}/providers/Microsoft.Compute/virtualMachines?api-version=${API_VERSION_COMPUTE}`)
        .then(r => r?.value || []).catch(() => []),
      // Disks
      azureGet(token, `${AZURE_MGMT}/subscriptions/${subscriptionId}/providers/Microsoft.Compute/disks?api-version=${API_VERSION_COMPUTE}`)
        .then(r => r?.value || []).catch(() => []),
      // NSGs
      azureGet(token, `${AZURE_MGMT}/subscriptions/${subscriptionId}/providers/Microsoft.Network/networkSecurityGroups?api-version=${API_VERSION_NETWORK}`)
        .then(r => r?.value || []).catch(() => []),
      // Storage Accounts
      azureGet(token, `${AZURE_MGMT}/subscriptions/${subscriptionId}/providers/Microsoft.Storage/storageAccounts?api-version=${API_VERSION_STORAGE}`)
        .then(r => r?.value || []).catch(() => []),
      // Key Vaults
      azureGet(token, `${AZURE_MGMT}/subscriptions/${subscriptionId}/providers/Microsoft.KeyVault/vaults?api-version=2023-07-01`)
        .then(r => r?.value || []).catch(() => []),
      // SQL Servers
      azureGet(token, `${AZURE_MGMT}/subscriptions/${subscriptionId}/providers/Microsoft.Sql/servers?api-version=${API_VERSION_SQL}`)
        .then(r => r?.value || []).catch(() => []),
      // SQL Databases
      queryResourceGraph(token, subscriptionId, "Resources | where type == 'microsoft.sql/servers/databases' | where name != 'master' | project name, properties, location, tags")
        .catch(() => []),
      // Load Balancers
      azureGet(token, `${AZURE_MGMT}/subscriptions/${subscriptionId}/providers/Microsoft.Network/loadBalancers?api-version=${API_VERSION_NETWORK}`)
        .then(r => r?.value || []).catch(() => []),
      // Application Gateways
      azureGet(token, `${AZURE_MGMT}/subscriptions/${subscriptionId}/providers/Microsoft.Network/applicationGateways?api-version=${API_VERSION_NETWORK}`)
        .then(r => r?.value || []).catch(() => []),
      // Alert Rules
      azureGet(token, `${AZURE_MGMT}/subscriptions/${subscriptionId}/providers/Microsoft.Insights/metricAlerts?api-version=${API_VERSION_MONITOR}`)
        .then(r => r?.value || []).catch(() => []),
      // Advisor Recommendations
      azureGet(token, `${AZURE_MGMT}/subscriptions/${subscriptionId}/providers/Microsoft.Advisor/recommendations?api-version=${API_VERSION_ADVISOR}`)
        .then(r => r?.value || []).catch(() => []),
      // Security Assessments
      azureGet(token, `${AZURE_MGMT}/subscriptions/${subscriptionId}/providers/Microsoft.Security/assessments?api-version=${API_VERSION_SECURITY}`)
        .then(r => r?.value || []).catch(() => []),
      // Resource Groups
      azureGet(token, `${AZURE_MGMT}/subscriptions/${subscriptionId}/resourcegroups?api-version=2021-04-01`)
        .then(r => r?.value || []).catch(() => []),
      // App Services
      azureGet(token, `${AZURE_MGMT}/subscriptions/${subscriptionId}/providers/Microsoft.Web/sites?api-version=2023-01-01`)
        .then(r => r?.value || []).catch(() => []),
    ]);

    logger.info('Azure resources fetched', {
      vms: vms.length, disks: disks.length, nsgs: nsgs.length,
      storageAccounts: storageAccounts.length, keyVaults: keyVaults.length,
      sqlServers: sqlServers.length, sqlDbs: sqlDbs.length, lbs: lbs.length,
      appGateways: appGateways.length, alertRules: alertRules.length,
      advisorRecs: advisorRecs.length, securityAssessments: securityAssessments.length,
      appServices: appServices.length,
    });

    // ─── Analyze each pillar ──────────────────────────────────────────────────
    const pillarResults: PillarResult[] = [];

    for (const pillar of pillars) {
      let result: PillarResult;
      switch (pillar) {
        case 'reliability':
          result = analyzeReliability(vms, disks, sqlDbs, lbs);
          break;
        case 'security':
          result = analyzeSecurity(nsgs, storageAccounts, keyVaults, sqlServers, securityAssessments);
          break;
        case 'operational_excellence':
          result = analyzeOperationalExcellence(vms, alertRules, resourceGroups);
          break;
        case 'performance_efficiency':
          result = analyzePerformance(vms, sqlDbs, appGateways);
          break;
        case 'cost_optimization':
          result = analyzeCostOptimization(vms, disks, advisorRecs);
          break;
        case 'sustainability':
          result = analyzeSustainability(vms, appServices);
          break;
        default:
          continue;
      }
      pillarResults.push(result);

      // Store pillar score in DB
      await (prisma as any).wellArchitectedScore.create({
        data: {
          organization_id: organizationId,
          scan_id: scan.id,
          pillar,
          score: result.score,
          checks_passed: result.checks_passed,
          checks_failed: result.checks_failed,
          critical_issues: result.critical_issues,
          recommendations: result.recommendations,
        },
      });
    }

    // Calculate overall score
    const overallScore = pillarResults.length > 0
      ? Math.round(pillarResults.reduce((sum, p) => sum + p.score, 0) / pillarResults.length)
      : 0;

    const allRecs = pillarResults.flatMap(p => p.recommendations);

    // Update scan record
    await prisma.securityScan.update({
      where: { id: scan.id },
      data: {
        status: 'completed',
        results: JSON.parse(JSON.stringify({
          overallScore,
          pillarScores: Object.fromEntries(pillarResults.map(p => [p.pillar, p])),
          totalRecommendations: allRecs.length,
          resourcesSummary: {
            vms: vms.length, disks: disks.length, nsgs: nsgs.length,
            storageAccounts: storageAccounts.length, sqlDbs: sqlDbs.length,
            keyVaults: keyVaults.length, appServices: appServices.length,
          },
        })),
        findings_count: allRecs.length,
        critical_count: allRecs.filter(r => r.severity === 'critical').length,
        high_count: allRecs.filter(r => r.severity === 'high').length,
        medium_count: allRecs.filter(r => r.severity === 'medium').length,
        low_count: allRecs.filter(r => r.severity === 'low').length,
        completed_at: new Date(),
      },
    });

    const duration = Date.now() - startTime;
    logger.info('Azure Well-Architected scan completed', {
      organizationId, scanId: scan.id, overallScore, duration,
      recommendations: allRecs.length,
    });

    return success({
      scanId: scan.id,
      overallScore,
      pillarScores: Object.fromEntries(pillarResults.map(p => [p.pillar, p])),
      recommendations: allRecs,
      duration,
      subscriptionId: credential.subscription_id,
      subscriptionName: credential.subscription_name,
    });
  } catch (err: any) {
    logger.error('Error running Azure Well-Architected scan', { error: err.message });
    return error('Failed to run Azure Well-Architected scan', 500);
  }
}
