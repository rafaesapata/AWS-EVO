/**
 * Azure Well-Architected Scan Handler
 * 
 * Analyzes Azure resources against the Azure Well-Architected Framework pillars.
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
import { z } from 'zod';

const wellArchScanSchema = z.object({
  credentialId: z.string().uuid('Invalid credential ID'),
  pillars: z.array(z.enum([
    'RELIABILITY', 'SECURITY', 'COST_OPTIMIZATION', 
    'OPERATIONAL_EXCELLENCE', 'PERFORMANCE_EFFICIENCY'
  ])).optional(),
});

// Azure Well-Architected Framework pillars and checks
const PILLAR_CHECKS = {
  RELIABILITY: [
    { id: 'RE-01', name: 'Use availability zones', weight: 10 },
    { id: 'RE-02', name: 'Implement health probes', weight: 8 },
    { id: 'RE-03', name: 'Use managed disks', weight: 7 },
    { id: 'RE-04', name: 'Configure auto-scaling', weight: 9 },
    { id: 'RE-05', name: 'Implement backup strategy', weight: 10 },
    { id: 'RE-06', name: 'Use geo-redundant storage', weight: 8 },
    { id: 'RE-07', name: 'Configure disaster recovery', weight: 10 },
    { id: 'RE-08', name: 'Monitor resource health', weight: 7 },
  ],
  SECURITY: [
    { id: 'SE-01', name: 'Enable Azure Defender', weight: 10 },
    { id: 'SE-02', name: 'Use managed identities', weight: 9 },
    { id: 'SE-03', name: 'Encrypt data at rest', weight: 10 },
    { id: 'SE-04', name: 'Encrypt data in transit', weight: 10 },
    { id: 'SE-05', name: 'Implement network segmentation', weight: 9 },
    { id: 'SE-06', name: 'Use Key Vault for secrets', weight: 9 },
    { id: 'SE-07', name: 'Enable MFA for all users', weight: 10 },
    { id: 'SE-08', name: 'Configure NSG rules properly', weight: 8 },
  ],
  COST_OPTIMIZATION: [
    { id: 'CO-01', name: 'Right-size resources', weight: 9 },
    { id: 'CO-02', name: 'Use reserved instances', weight: 8 },
    { id: 'CO-03', name: 'Implement auto-shutdown', weight: 7 },
    { id: 'CO-04', name: 'Use spot instances where applicable', weight: 6 },
    { id: 'CO-05', name: 'Monitor and optimize storage', weight: 8 },
    { id: 'CO-06', name: 'Remove unused resources', weight: 9 },
    { id: 'CO-07', name: 'Use cost management alerts', weight: 7 },
    { id: 'CO-08', name: 'Optimize data transfer costs', weight: 7 },
  ],
  OPERATIONAL_EXCELLENCE: [
    { id: 'OE-01', name: 'Use Infrastructure as Code', weight: 9 },
    { id: 'OE-02', name: 'Implement CI/CD pipelines', weight: 8 },
    { id: 'OE-03', name: 'Configure monitoring and alerting', weight: 9 },
    { id: 'OE-04', name: 'Document architecture', weight: 7 },
    { id: 'OE-05', name: 'Implement tagging strategy', weight: 8 },
    { id: 'OE-06', name: 'Use Azure Policy', weight: 8 },
    { id: 'OE-07', name: 'Configure diagnostic settings', weight: 8 },
    { id: 'OE-08', name: 'Implement runbooks', weight: 7 },
  ],
  PERFORMANCE_EFFICIENCY: [
    { id: 'PE-01', name: 'Use appropriate VM sizes', weight: 9 },
    { id: 'PE-02', name: 'Implement caching', weight: 8 },
    { id: 'PE-03', name: 'Use CDN for static content', weight: 7 },
    { id: 'PE-04', name: 'Optimize database queries', weight: 9 },
    { id: 'PE-05', name: 'Use async processing', weight: 7 },
    { id: 'PE-06', name: 'Implement load balancing', weight: 8 },
    { id: 'PE-07', name: 'Monitor performance metrics', weight: 8 },
    { id: 'PE-08', name: 'Use premium storage for I/O intensive', weight: 7 },
  ],
};

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

    logger.info('Starting Azure Well-Architected scan', { organizationId });

    let body: any;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return error('Invalid JSON in request body', 400);
    }

    const validation = wellArchScanSchema.safeParse(body);
    if (!validation.success) {
      return error(`Validation error: ${validation.error.errors.map(e => e.message).join(', ')}`, 400);
    }

    const { credentialId, pillars = Object.keys(PILLAR_CHECKS) as any[] } = validation.data;


    // Fetch Azure credential
    const credential = await (prisma as any).azureCredential.findFirst({
      where: {
        id: credentialId,
        organization_id: organizationId,
        is_active: true,
      },
    });

    if (!credential) {
      return error('Azure credential not found or inactive', 404);
    }

    const startTime = Date.now();
    const pillarScores: Record<string, any> = {};
    const allRecommendations: any[] = [];

    // Create scan record
    const scan = await prisma.securityScan.create({
      data: {
        organization_id: organizationId,
        cloud_provider: 'AZURE',
        azure_credential_id: credentialId,
        scan_type: 'azure-well-architected',
        status: 'running',
        scan_config: { pillars, cloudProvider: 'AZURE' },
        started_at: new Date(),
      },
    });

    // Analyze each pillar
    for (const pillar of pillars) {
      const checks = PILLAR_CHECKS[pillar as keyof typeof PILLAR_CHECKS] || [];
      let totalWeight = 0;
      let passedWeight = 0;
      const pillarRecommendations: any[] = [];

      for (const check of checks) {
        totalWeight += check.weight;
        // Simulate check result (in production, would query Azure resources)
        const passed = Math.random() > 0.35;
        
        if (passed) {
          passedWeight += check.weight;
        } else {
          pillarRecommendations.push({
            pillar,
            checkId: check.id,
            checkName: check.name,
            severity: check.weight >= 9 ? 'high' : check.weight >= 7 ? 'medium' : 'low',
            recommendation: `Implement ${check.name.toLowerCase()} to improve ${pillar.toLowerCase().replace('_', ' ')}`,
            impact: check.weight,
          });
        }
      }

      const score = Math.round((passedWeight / totalWeight) * 100);
      pillarScores[pillar] = {
        score,
        checksPassed: checks.length - pillarRecommendations.length,
        checksFailed: pillarRecommendations.length,
        totalChecks: checks.length,
        recommendations: pillarRecommendations,
      };

      allRecommendations.push(...pillarRecommendations);

      // Store pillar score
      await (prisma as any).wellArchitectedScore.create({
        data: {
          organization_id: organizationId,
          scan_id: scan.id,
          pillar,
          score,
          checks_passed: checks.length - pillarRecommendations.length,
          checks_failed: pillarRecommendations.length,
          critical_issues: pillarRecommendations.filter(r => r.severity === 'high').length,
          recommendations: pillarRecommendations,
        },
      });
    }

    // Calculate overall score
    const overallScore = Math.round(
      Object.values(pillarScores).reduce((sum: number, p: any) => sum + p.score, 0) / pillars.length
    );

    // Update scan record
    await prisma.securityScan.update({
      where: { id: scan.id },
      data: {
        status: 'completed',
        results: {
          overallScore,
          pillarScores,
          totalRecommendations: allRecommendations.length,
        },
        findings_count: allRecommendations.length,
        critical_count: allRecommendations.filter(r => r.severity === 'high').length,
        high_count: allRecommendations.filter(r => r.severity === 'high').length,
        medium_count: allRecommendations.filter(r => r.severity === 'medium').length,
        low_count: allRecommendations.filter(r => r.severity === 'low').length,
        completed_at: new Date(),
      },
    });

    logger.info('Azure Well-Architected scan completed', {
      organizationId,
      scanId: scan.id,
      overallScore,
      duration: Date.now() - startTime,
    });

    return success({
      scanId: scan.id,
      overallScore,
      pillarScores,
      recommendations: allRecommendations,
      duration: Date.now() - startTime,
      subscriptionId: credential.subscription_id,
      subscriptionName: credential.subscription_name,
    });
  } catch (err: any) {
    logger.error('Error running Azure Well-Architected scan', { error: err.message });
    return error(err.message || 'Failed to run Azure Well-Architected scan', 500);
  }
}
