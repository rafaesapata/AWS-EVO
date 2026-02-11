/**
 * Azure Cost Optimization Handler
 * 
 * Fetches REAL cost optimization recommendations from Azure Advisor.
 * NO SIMULATED DATA - Only real Azure Advisor recommendations.
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
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

const costOptSchema = z.object({
  credentialId: z.string().uuid('Invalid credential ID'),
  categories: z.array(z.enum(['Cost', 'HighAvailability', 'Performance', 'Security', 'OperationalExcellence'])).optional(),
});

// Helper to extract resource name from Azure resource ID
function extractResourceName(resourceId: string): string {
  if (!resourceId) return 'Unknown';
  const parts = resourceId.split('/');
  return parts[parts.length - 1] || 'Unknown';
}

// Helper to extract resource type from Azure resource ID
function extractResourceType(resourceId: string): string {
  if (!resourceId) return 'Unknown';
  // Format: /subscriptions/{sub}/resourceGroups/{rg}/providers/{provider}/{type}/{name}
  const match = resourceId.match(/providers\/([^/]+\/[^/]+)/);
  return match ? match[1] : 'Unknown';
}

// Impact levels as constants for consistency
const IMPACT = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
} as const;

// Helper to map impact to priority
function mapImpactToPriority(impact: string): number {
  switch (impact?.toLowerCase()) {
    case 'high': return 5;
    case 'medium': return 4;
    case 'low': return 3;
    default: return 2;
  }
}

// Helper to map Azure Advisor recommendation to action type
// NOTE: Azure Advisor "High Impact" means high savings potential, NOT that resource should be terminated
function mapRecommendationToActionType(rec: any): string {
  const problem = (rec.shortDescription?.problem || '').toLowerCase();
  const solution = (rec.shortDescription?.solution || '').toLowerCase();
  const recommendationTypeId = (rec.recommendationTypeId || '').toLowerCase();
  
  // Reserved Instance / Savings Plan recommendations = purchase/optimize
  if (problem.includes('reserved instance') || 
      solution.includes('reserved instance') ||
      problem.includes('savings plan') ||
      solution.includes('savings plan') ||
      recommendationTypeId.includes('reservedinstance') ||
      recommendationTypeId.includes('savingsplan')) {
    return 'purchase'; // New type for RI/SP recommendations
  }
  
  // Shutdown/Delete recommendations
  if (problem.includes('shut down') || 
      problem.includes('delete') ||
      problem.includes('unused') ||
      problem.includes('idle') ||
      solution.includes('shut down') ||
      solution.includes('delete')) {
    return 'terminate';
  }
  
  // Resize/Downsize recommendations
  if (problem.includes('right-size') || 
      problem.includes('resize') ||
      problem.includes('downsize') ||
      problem.includes('underutilized') ||
      solution.includes('resize') ||
      solution.includes('smaller')) {
    return 'downsize';
  }
  
  // Default to optimize for other cost recommendations
  return 'optimize';
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

    logger.info('Starting Azure cost optimization analysis (REAL DATA ONLY)', { organizationId });

    // Parse and validate request body
    const validation = parseAndValidateBody(costOptSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const { credentialId, categories = ['Cost'] } = validation.data;

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

    // Import Azure SDK dynamically and create token credential
    let advisorClient: any = null;
    let computeClient: any = null;
    let tokenCredential: any = null;
    
    try {
      // Handle both OAuth and Service Principal credentials
      if (credential.auth_type === 'oauth') {
        const { getAzureCredentialWithToken, ONE_HOUR_MS } = await import('../../lib/azure-helpers.js');
        const tokenResult = await getAzureCredentialWithToken(prisma, credentialId, organizationId);
        
        if (!tokenResult.success) {
          return error(tokenResult.error || 'Failed to get Azure token', 400);
        }
        
        tokenCredential = {
          getToken: async () => ({
            token: tokenResult.accessToken,
            expiresOnTimestamp: Date.now() + ONE_HOUR_MS,
          }),
        };
      } else {
        if (!credential.tenant_id || !credential.client_id || !credential.client_secret) {
          return error('Service Principal credentials incomplete. Missing tenant_id, client_id, or client_secret.', 400);
        }
        const identity = await import('@azure/identity');
        tokenCredential = new identity.ClientSecretCredential(
          credential.tenant_id,
          credential.client_id,
          credential.client_secret
        );
      }
      
      // Create Azure clients
      const advisor = await import('@azure/arm-advisor');
      advisorClient = new advisor.AdvisorManagementClient(tokenCredential, credential.subscription_id);
      
      // Try to create compute client for additional VM details
      try {
        const compute = await import('@azure/arm-compute');
        computeClient = new compute.ComputeManagementClient(tokenCredential, credential.subscription_id);
      } catch {
        logger.warn('Could not create compute client for VM details');
      }
    } catch (err: any) {
      logger.error('Failed to initialize Azure SDK', { error: err.message });
      return error('Failed to connect to Azure. Please check your credentials.', 500);
    }

    const recommendations: any[] = [];
    let totalPotentialSavings = 0;

    // Fetch REAL recommendations from Azure Advisor
    try {
      logger.info('Fetching recommendations from Azure Advisor...');
      
      for await (const rec of advisorClient.recommendations.list()) {
        // Filter by requested categories
        if (!categories.includes(rec.category as any)) {
          continue;
        }

        // Extract savings amount from extended properties
        const savingsAmount = rec.extendedProperties?.savingsAmount 
          ? parseFloat(rec.extendedProperties.savingsAmount) 
          : rec.extendedProperties?.annualSavingsAmount
            ? parseFloat(rec.extendedProperties.annualSavingsAmount) / 12
            : 0;

        // Extract current and recommended SKU if available
        const currentSku = rec.extendedProperties?.currentSku || 
                          rec.extendedProperties?.vmSize ||
                          rec.extendedProperties?.currentSize ||
                          null;
        const recommendedSku = rec.extendedProperties?.targetSku || 
                              rec.extendedProperties?.recommendedSku ||
                              rec.extendedProperties?.recommendedSize ||
                              null;

        // Build the recommendation object with REAL data
        const recommendation = {
          id: rec.name || crypto.randomUUID(),
          category: rec.category,
          impact: rec.impact,
          
          // Resource identification
          resourceId: rec.resourceMetadata?.resourceId || rec.impactedValue,
          resourceName: extractResourceName(rec.resourceMetadata?.resourceId || rec.impactedValue || ''),
          resourceType: extractResourceType(rec.resourceMetadata?.resourceId || '') || rec.impactedField,
          
          // Problem and solution - THE EXPLANATION
          shortDescription: rec.shortDescription?.problem || 'Cost optimization opportunity identified',
          solution: rec.shortDescription?.solution || 'Review and apply the recommended changes',
          
          // Extended explanation from Azure Advisor
          reason: rec.extendedProperties?.reason || 
                  rec.extendedProperties?.description ||
                  rec.shortDescription?.problem ||
                  'Azure Advisor identified this resource for optimization based on usage patterns and best practices.',
          
          // Sizing information
          currentSize: currentSku,
          recommendedSize: recommendedSku,
          
          // Cost information
          potentialSavings: savingsAmount,
          currentMonthlyCost: rec.extendedProperties?.currentCost 
            ? parseFloat(rec.extendedProperties.currentCost) 
            : null,
          
          // Utilization data if available
          utilizationPatterns: rec.extendedProperties?.avgCpuPercentage || rec.extendedProperties?.avgMemoryPercentage
            ? {
                avgCpuUsage: rec.extendedProperties.avgCpuPercentage 
                  ? parseFloat(rec.extendedProperties.avgCpuPercentage) 
                  : null,
                avgMemoryUsage: rec.extendedProperties.avgMemoryPercentage 
                  ? parseFloat(rec.extendedProperties.avgMemoryPercentage) 
                  : null,
                lookbackPeriod: rec.extendedProperties.lookbackPeriod || '7 days',
              }
            : null,
          
          // Risk and complexity assessment
          implementationComplexity: rec.risk === 'None' ? 'low' : rec.risk === 'Low' ? 'low' : 'medium',
          riskAssessment: rec.risk?.toLowerCase() || 'low',
          
          // Action type based on recommendation content (NOT just impact level)
          actionType: mapRecommendationToActionType(rec),
          
          // Metadata
          lastUpdated: rec.lastUpdated,
          recommendationTypeId: rec.recommendationTypeId,
          
          // All extended properties for reference
          extendedProperties: rec.extendedProperties,
        };

        recommendations.push(recommendation);
        totalPotentialSavings += savingsAmount;
      }

      logger.info('Azure Advisor recommendations fetched', { 
        count: recommendations.length,
        totalSavings: totalPotentialSavings 
      });

    } catch (err: any) {
      logger.error('Error fetching Azure Advisor recommendations', { error: err.message, stack: err.stack });
      return error('Failed to fetch Azure Advisor recommendations', 500);
    }

    // If no recommendations found, return empty result (NO SIMULATED DATA)
    if (recommendations.length === 0) {
      logger.info('No Azure Advisor recommendations found for this subscription');
      
      return success({
        recommendations: [],
        summary: {
          totalRecommendations: 0,
          totalPotentialSavings: 0,
          byImpact: { high: 0, medium: 0, low: 0 },
          byCategory: categories.reduce((acc, cat) => ({ ...acc, [cat]: 0 }), {}),
          message: 'No cost optimization recommendations found. Your Azure resources are already optimized, or Azure Advisor has not generated recommendations yet. Recommendations are typically generated within 24-48 hours of resource creation.',
        },
        subscriptionId: credential.subscription_id,
        subscriptionName: credential.subscription_name,
      });
    }

    // Build summary
    const summary = {
      totalRecommendations: recommendations.length,
      totalPotentialSavings,
      byImpact: {
        high: recommendations.filter(r => r.impact === IMPACT.HIGH).length,
        medium: recommendations.filter(r => r.impact === IMPACT.MEDIUM).length,
        low: recommendations.filter(r => r.impact === IMPACT.LOW).length,
      },
      byCategory: categories.reduce((acc, cat) => {
        acc[cat] = recommendations.filter(r => r.category === cat).length;
        return acc;
      }, {} as Record<string, number>),
    };

    // Save recommendations to cost_optimizations table for consistency with AWS
    try {
      // Delete existing Azure optimizations for this credential
      await (prisma as any).costOptimization.deleteMany({
        where: { 
          organization_id: organizationId, 
          azure_credential_id: credentialId 
        }
      });

      // Save new recommendations
      if (recommendations.length > 0) {
        const optimizationsToSave = recommendations.map(rec => ({
          organization_id: organizationId,
          azure_credential_id: credentialId,
          cloud_provider: 'AZURE' as const,
          resource_type: rec.resourceType || 'Azure Resource',
          resource_id: rec.resourceId || rec.id,
          resource_name: rec.resourceName || 'Unknown',
          optimization_type: mapRecommendationToActionType(rec),
          current_cost: rec.currentMonthlyCost || 0,
          optimized_cost: rec.currentMonthlyCost ? (rec.currentMonthlyCost - rec.potentialSavings) : 0,
          potential_savings: rec.potentialSavings || 0,
          savings_percentage: rec.currentMonthlyCost && rec.currentMonthlyCost > 0 
            ? ((rec.potentialSavings / rec.currentMonthlyCost) * 100) 
            : 0,
          recommendation: rec.solution || rec.shortDescription,
          details: rec.reason || rec.shortDescription,
          priority: rec.impact?.toLowerCase() || 'medium',
          effort: rec.implementationComplexity || 'medium',
          category: rec.category || 'Cost',
          status: 'pending'
        }));

        await (prisma as any).costOptimization.createMany({ data: optimizationsToSave });
        logger.info('Saved Azure cost optimizations to database', { count: optimizationsToSave.length });
      }
    } catch (saveErr: any) {
      // Log but don't fail - the recommendations are still returned
      logger.warn('Failed to save Azure optimizations to database', { error: saveErr.message });
    }

    logger.info('Azure cost optimization analysis completed (REAL DATA)', {
      organizationId,
      subscriptionId: credential.subscription_id,
      recommendationsCount: recommendations.length,
      totalPotentialSavings,
    });

    return success({
      recommendations,
      summary,
      subscriptionId: credential.subscription_id,
      subscriptionName: credential.subscription_name,
    });
  } catch (err: any) {
    logger.error('Error running Azure cost optimization', { error: err.message, stack: err.stack });
    return error('Failed to run Azure cost optimization', 500);
  }
}
