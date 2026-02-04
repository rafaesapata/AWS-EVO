/**
 * Microsoft Defender for Cloud Integration Scanner
 * 
 * Integrates with Microsoft Defender for Cloud to:
 * - Import Secure Score
 * - Sync recommendations
 * - Get security alerts
 * - Map findings to EVO format
 * 
 * Features:
 * - Resource caching to avoid duplicate API calls
 * - Rate limiting to prevent Azure API throttling
 */

import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding, AzureScanError } from '../types.js';
import { logger } from '../../../../logging.js';
import { getGlobalCache, CacheKeys } from '../utils/cache.js';
import { rateLimitedFetch } from '../utils/rate-limiter.js';

// Configuration constants
const AZURE_MANAGEMENT_BASE_URL = 'https://management.azure.com';
const API_VERSIONS = {
  secureScores: '2020-01-01',
  assessments: '2021-06-01',
  alerts: '2022-01-01',
  pricings: '2024-01-01',
} as const;

// Threshold constants for findings
const SECURE_SCORE_THRESHOLDS = {
  LOW: 50,
  MODERATE: 70,
} as const;

const CRITICAL_FINDINGS_THRESHOLDS = {
  CRITICAL_COUNT: 5,
  HIGH_COUNT: 10,
} as const;

interface SecureScore {
  id: string;
  name: string;
  properties: {
    displayName?: string;
    score?: {
      current?: number;
      max?: number;
      percentage?: number;
    };
    weight?: number;
  };
}

interface SecurityAssessment {
  id: string;
  name: string;
  properties: {
    displayName?: string;
    status?: {
      code?: string;
      cause?: string;
      description?: string;
    };
    resourceDetails?: {
      source?: string;
      id?: string;
    };
    metadata?: {
      displayName?: string;
      description?: string;
      severity?: string;
      categories?: string[];
      userImpact?: string;
      implementationEffort?: string;
      threats?: string[];
      remediationDescription?: string;
    };
  };
}

interface SecurityAlert {
  id: string;
  name: string;
  properties: {
    alertDisplayName?: string;
    alertType?: string;
    description?: string;
    severity?: string;
    status?: string;
    intent?: string;
    startTimeUtc?: string;
    endTimeUtc?: string;
    resourceIdentifiers?: Array<{
      type?: string;
      azureResourceId?: string;
    }>;
    remediationSteps?: string[];
    compromisedEntity?: string;
    techniques?: string[];
    subTechniques?: string[];
    entities?: any[];
  };
}

interface DefenderPricing {
  id: string;
  name: string;
  properties: {
    pricingTier?: string;
    subPlan?: string;
    freeTrialRemainingTime?: string;
  };
}

// Generic fetch helper to reduce duplication
async function fetchSecurityResource<T>(
  context: AzureScanContext,
  resourcePath: string,
  apiVersion: string,
  cacheKey: string
): Promise<T[]> {
  const cache = getGlobalCache();
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `${AZURE_MANAGEMENT_BASE_URL}/subscriptions/${context.subscriptionId}/providers/Microsoft.Security/${resourcePath}?api-version=${apiVersion}`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, `fetchSecurityResource:${resourcePath}`);

      if (!response.ok) return [];
      const data = await response.json() as { value?: T[] };
      return data.value || [];
    } catch {
      return [];
    }
  });
}

const fetchSecureScores = (context: AzureScanContext) => 
  fetchSecurityResource<SecureScore>(context, 'secureScores', API_VERSIONS.secureScores, CacheKeys.defenderSecureScores(context.subscriptionId));

const fetchAssessments = (context: AzureScanContext) => 
  fetchSecurityResource<SecurityAssessment>(context, 'assessments', API_VERSIONS.assessments, CacheKeys.defenderAssessments(context.subscriptionId));

const fetchSecurityAlerts = (context: AzureScanContext) => 
  fetchSecurityResource<SecurityAlert>(context, 'alerts', API_VERSIONS.alerts, CacheKeys.defenderAlerts(context.subscriptionId));

const fetchDefenderPricing = (context: AzureScanContext) => 
  fetchSecurityResource<DefenderPricing>(context, 'pricings', API_VERSIONS.pricings, CacheKeys.defenderPricing(context.subscriptionId));

// Map Defender severity to EVO severity
function mapSeverity(defenderSeverity?: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' {
  const severityMap: Record<string, 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'> = {
    high: 'HIGH',
    medium: 'MEDIUM',
    low: 'LOW',
    informational: 'INFO',
  };
  return severityMap[defenderSeverity?.toLowerCase() || ''] || 'MEDIUM';
}

// Map alert severity (alerts are more urgent, so we escalate)
function mapAlertSeverity(alertSeverity?: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' {
  const severityMap: Record<string, 'CRITICAL' | 'HIGH' | 'MEDIUM'> = {
    high: 'CRITICAL',
    medium: 'HIGH',
    low: 'MEDIUM',
  };
  return severityMap[alertSeverity?.toLowerCase() || ''] || 'MEDIUM';
}

// Important Defender plans to check
const CRITICAL_DEFENDER_PLANS = [
  { name: 'VirtualMachines', displayName: 'Defender for Servers' },
  { name: 'SqlServers', displayName: 'Defender for SQL' },
  { name: 'AppServices', displayName: 'Defender for App Service' },
  { name: 'StorageAccounts', displayName: 'Defender for Storage' },
  { name: 'KeyVaults', displayName: 'Defender for Key Vault' },
  { name: 'Arm', displayName: 'Defender for Resource Manager' },
  { name: 'Dns', displayName: 'Defender for DNS' },
  { name: 'Containers', displayName: 'Defender for Containers' },
  { name: 'CloudPosture', displayName: 'Defender CSPM' },
] as const;

// Helper to create secure score findings
function createSecureScoreFinding(
  score: SecureScore,
  percentage: number
): AzureSecurityFinding | null {
  const scoreData = score.properties.score;
  if (!scoreData) return null;

  if (percentage < SECURE_SCORE_THRESHOLDS.LOW) {
    return {
      severity: 'HIGH',
      title: 'Low Secure Score',
      description: `Microsoft Defender Secure Score is ${percentage.toFixed(1)}% (${scoreData.current}/${scoreData.max}). This indicates significant security gaps.`,
      resourceType: 'Microsoft.Security/secureScores',
      resourceId: score.id,
      resourceName: 'Secure Score',
      remediation: 'Review and implement Defender for Cloud recommendations to improve your security posture.',
      complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
      metadata: { current: scoreData.current, max: scoreData.max, percentage: percentage.toFixed(1) },
    };
  }
  
  if (percentage < SECURE_SCORE_THRESHOLDS.MODERATE) {
    return {
      severity: 'MEDIUM',
      title: 'Moderate Secure Score',
      description: `Microsoft Defender Secure Score is ${percentage.toFixed(1)}% (${scoreData.current}/${scoreData.max}). There is room for improvement.`,
      resourceType: 'Microsoft.Security/secureScores',
      resourceId: score.id,
      resourceName: 'Secure Score',
      remediation: 'Review Defender for Cloud recommendations to improve your security posture.',
      complianceFrameworks: ['CIS Azure 1.4'],
      metadata: { current: scoreData.current, max: scoreData.max, percentage: percentage.toFixed(1) },
    };
  }
  
  return null;
}

// Helper to create defender plan findings
function createDefenderPlanFindings(
  pricing: DefenderPricing[],
  subscriptionId: string
): AzureSecurityFinding[] {
  const pricingMap = new Map(pricing.map(p => [p.name, p]));
  const findings: AzureSecurityFinding[] = [];
  
  for (const plan of CRITICAL_DEFENDER_PLANS) {
    const planPricing = pricingMap.get(plan.name);
    
    if (!planPricing || planPricing.properties.pricingTier !== 'Standard') {
      findings.push({
        severity: 'MEDIUM',
        title: `${plan.displayName} Not Enabled`,
        description: `${plan.displayName} is not enabled or using Free tier.`,
        resourceType: 'Microsoft.Security/pricings',
        resourceId: `/subscriptions/${subscriptionId}/providers/Microsoft.Security/pricings/${plan.name}`,
        resourceName: plan.displayName,
        remediation: `Enable ${plan.displayName} for enhanced threat protection.`,
        complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
        metadata: { currentTier: planPricing?.properties.pricingTier || 'Not configured' },
      });
    }
  }
  
  return findings;
}

// Helper to create assessment findings
function createAssessmentFindings(assessments: SecurityAssessment[]): AzureSecurityFinding[] {
  return assessments
    .filter(a => a.properties.status?.code === 'Unhealthy')
    .map(assessment => {
      const metadata = assessment.properties.metadata;
      const resourceId = assessment.properties.resourceDetails?.id || assessment.id;
      const resourceName = resourceId.split('/').pop() || 'Unknown';

      return {
        severity: mapSeverity(metadata?.severity),
        title: metadata?.displayName || assessment.properties.displayName || 'Security Assessment Failed',
        description: metadata?.description || assessment.properties.status?.description || 'Security assessment identified an issue.',
        resourceType: 'Microsoft.Security/assessments',
        resourceId,
        resourceName,
        remediation: metadata?.remediationDescription || 'Review the assessment details in Defender for Cloud.',
        complianceFrameworks: metadata?.categories || ['CIS Azure 1.4'],
        metadata: {
          assessmentId: assessment.name,
          userImpact: metadata?.userImpact,
          implementationEffort: metadata?.implementationEffort,
          threats: metadata?.threats,
        },
      };
    });
}

// Helper to create alert findings
function createAlertFindings(alerts: SecurityAlert[]): AzureSecurityFinding[] {
  return alerts
    .filter(a => a.properties.status === 'Active' || a.properties.status === 'InProgress')
    .map(alert => {
      const props = alert.properties;
      const resourceId = props.resourceIdentifiers?.[0]?.azureResourceId || alert.id;

      return {
        severity: mapAlertSeverity(props.severity),
        title: `Security Alert: ${props.alertDisplayName || props.alertType}`,
        description: props.description || 'Security alert detected by Microsoft Defender.',
        resourceType: 'Microsoft.Security/alerts',
        resourceId,
        resourceName: props.compromisedEntity || 'Unknown',
        remediation: props.remediationSteps?.join(' ') || 'Review the alert in Microsoft Defender for Cloud.',
        complianceFrameworks: ['MITRE ATT&CK'],
        metadata: {
          alertType: props.alertType,
          intent: props.intent,
          techniques: props.techniques,
          startTime: props.startTimeUtc,
          status: props.status,
        },
      };
    });
}

// Helper to create summary finding if many issues
function createSummaryFinding(
  findings: AzureSecurityFinding[],
  subscriptionId: string
): AzureSecurityFinding | null {
  const criticalCount = findings.filter(f => f.severity === 'CRITICAL').length;
  const highCount = findings.filter(f => f.severity === 'HIGH').length;

  if (criticalCount > CRITICAL_FINDINGS_THRESHOLDS.CRITICAL_COUNT || 
      highCount > CRITICAL_FINDINGS_THRESHOLDS.HIGH_COUNT) {
    return {
      severity: 'CRITICAL',
      title: 'Multiple Critical Security Issues Detected',
      description: `Microsoft Defender for Cloud identified ${criticalCount} critical and ${highCount} high severity issues. Immediate attention required.`,
      resourceType: 'Microsoft.Security/summary',
      resourceId: `/subscriptions/${subscriptionId}/security/summary`,
      resourceName: 'Security Summary',
      remediation: 'Prioritize addressing critical and high severity findings. Consider engaging security team.',
      complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
      metadata: { criticalCount, highCount, totalFindings: findings.length },
    };
  }
  
  return null;
}

export const defenderScanner: AzureScanner = {
  name: 'azure-defender',
  description: 'Integrates with Microsoft Defender for Cloud for security insights',
  category: 'Security',

  async scan(context: AzureScanContext): Promise<AzureScanResult> {
    const startTime = Date.now();
    const findings: AzureSecurityFinding[] = [];
    const errors: AzureScanError[] = [];
    let resourcesScanned = 0;

    try {
      logger.info('Starting Defender for Cloud scan', { subscriptionId: context.subscriptionId });

      // Fetch all Defender data in parallel
      const [secureScores, assessments, alerts, pricing] = await Promise.all([
        fetchSecureScores(context),
        fetchAssessments(context),
        fetchSecurityAlerts(context),
        fetchDefenderPricing(context),
      ]);

      resourcesScanned = assessments.length + alerts.length + pricing.length;

      // 1. Check Secure Score
      const overallScore = secureScores.find(s => s.name === 'ascScore');
      if (overallScore?.properties?.score) {
        const score = overallScore.properties.score;
        const percentage = score.percentage || (score.current && score.max ? (score.current / score.max) * 100 : 0);
        const scoreFinding = createSecureScoreFinding(overallScore, percentage);
        if (scoreFinding) findings.push(scoreFinding);
      }

      // 2. Check Defender Plans
      findings.push(...createDefenderPlanFindings(pricing, context.subscriptionId));

      // 3. Process Security Assessments
      findings.push(...createAssessmentFindings(assessments));

      // 4. Process Security Alerts
      const alertFindings = createAlertFindings(alerts);
      findings.push(...alertFindings);

      // 5. Add summary finding if many issues
      const summaryFinding = createSummaryFinding(findings, context.subscriptionId);
      if (summaryFinding) findings.unshift(summaryFinding);

      logger.info('Defender for Cloud scan completed', {
        subscriptionId: context.subscriptionId,
        resourcesScanned,
        findingsCount: findings.length,
        secureScore: overallScore?.properties?.score?.percentage,
        activeAlerts: alertFindings.length,
      });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error scanning Defender for Cloud', { error: errorMessage });
      errors.push({
        scanner: 'azure-defender',
        message: errorMessage,
        recoverable: true,
        resourceType: 'Microsoft.Security',
      });
    }

    return {
      findings,
      resourcesScanned,
      errors,
      scanDurationMs: Date.now() - startTime,
    };
  },
};

export default defenderScanner;
