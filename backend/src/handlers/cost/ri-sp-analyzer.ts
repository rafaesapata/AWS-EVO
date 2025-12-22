/**
 * Lambda handler for RI/SP Analyzer
 * AWS Lambda Handler for ri-sp-analyzer
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { EC2Client, DescribeReservedInstancesCommand } from '@aws-sdk/client-ec2';
import { SavingsplansClient, DescribeSavingsPlansCommand } from '@aws-sdk/client-savingsplans';
import { CostExplorerClient, GetSavingsPlansCoverageCommand, GetReservationCoverageCommand } from '@aws-sdk/client-cost-explorer';

interface RISPAnalyzerRequest {
  accountId: string;
  region?: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 RI/SP Analyzer started');
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: RISPAnalyzerRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId, region = 'us-east-1' } = body;
    
    if (!accountId) {
      return error('Missing required parameter: accountId');
    }
    
    const prisma = getPrismaClient();
    
    const account = await prisma.awsCredential.findFirst({
      where: { id: accountId, organization_id: organizationId, is_active: true },
    });
    
    if (!account) {
      return error('AWS account not found');
    }
    
    const resolvedCreds = await resolveAwsCredentials(account, region);
    
    const ec2Client = new EC2Client({
      region,
      credentials: toAwsCredentials(resolvedCreds),
    });
    
    const savingsPlansClient = new SavingsplansClient({
      region,
      credentials: toAwsCredentials(resolvedCreds),
    });
    
    const costExplorerClient = new CostExplorerClient({
      region,
      credentials: toAwsCredentials(resolvedCreds),
    });
    
    // Get Reserved Instances
    const riResponse = await ec2Client.send(new DescribeReservedInstancesCommand({}));
    
    const reservedInstances = (riResponse.ReservedInstances || []).map(ri => ({
      id: ri.ReservedInstancesId,
      instanceType: ri.InstanceType,
      instanceCount: ri.InstanceCount,
      state: ri.State,
      start: ri.Start,
      end: ri.End,
      offeringType: ri.OfferingType,
    }));
    
    // Get Savings Plans
    let savingsPlans: any[] = [];
    try {
      const spResponse = await savingsPlansClient.send(new DescribeSavingsPlansCommand({}));
      savingsPlans = (spResponse.savingsPlans || []).map(sp => ({
        id: sp.savingsPlanId,
        type: sp.savingsPlanType,
        state: sp.state,
        commitment: sp.commitment,
        start: sp.start,
        end: sp.end,
        paymentOption: sp.paymentOption,
        upfrontPaymentAmount: sp.upfrontPaymentAmount,
        recurringPaymentAmount: sp.recurringPaymentAmount,
      }));
    } catch (err) {
      logger.warn('Could not fetch Savings Plans:', err);
    }
    
    // Get coverage data
    let riCoverage = 0;
    let spCoverage = 0;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    try {
      const riCoverageResponse = await costExplorerClient.send(new GetReservationCoverageCommand({
        TimePeriod: {
          Start: startDate.toISOString().split('T')[0],
          End: endDate.toISOString().split('T')[0],
        },
      }));
      riCoverage = parseFloat(riCoverageResponse.Total?.CoverageHours?.CoverageHoursPercentage || '0');
    } catch (err) {
      logger.warn('Could not fetch RI coverage:', err);
    }
    
    try {
      const spCoverageResponse = await costExplorerClient.send(new GetSavingsPlansCoverageCommand({
        TimePeriod: {
          Start: startDate.toISOString().split('T')[0],
          End: endDate.toISOString().split('T')[0],
        },
      }));
      spCoverage = parseFloat(spCoverageResponse.Total?.CoveragePercentage || '0');
    } catch (err) {
      logger.warn('Could not fetch SP coverage:', err);
    }
    
    const recommendations = [];
    
    // RI recommendations
    if (reservedInstances.length === 0) {
      recommendations.push({
        type: 'ri_purchase',
        priority: 'medium',
        message: 'No Reserved Instances found. Consider purchasing RIs for steady-state workloads',
        potentialSavings: 'Up to 72%',
      });
    } else {
      const expiringRIs = reservedInstances.filter(ri => {
        if (!ri.end) return false;
        const daysUntilExpiry = Math.ceil((new Date(ri.end).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
      });
      
      if (expiringRIs.length > 0) {
        recommendations.push({
          type: 'ri_renewal',
          priority: 'high',
          message: `${expiringRIs.length} Reserved Instance(s) expiring within 30 days`,
          instances: expiringRIs.map(ri => ri.id),
        });
      }
    }
    
    // Savings Plans recommendations
    if (savingsPlans.length === 0) {
      recommendations.push({
        type: 'sp_purchase',
        priority: 'medium',
        message: 'No Savings Plans found. Consider Compute Savings Plans for flexible savings across EC2, Lambda, and Fargate',
        potentialSavings: 'Up to 66%',
      });
    }
    
    // Coverage recommendations
    if (riCoverage < 50 && spCoverage < 50) {
      recommendations.push({
        type: 'increase_coverage',
        priority: 'high',
        message: `Low commitment coverage: RI ${riCoverage.toFixed(1)}%, SP ${spCoverage.toFixed(1)}%. Consider increasing commitments for cost savings`,
        currentCoverage: { ri: riCoverage, sp: spCoverage },
      });
    }
    
    logger.info(`✅ Analyzed ${reservedInstances.length} RIs and ${savingsPlans.length} Savings Plans`);
    
    return success({
      success: true,
      reservedInstances,
      savingsPlans,
      coverage: {
        reservedInstances: riCoverage,
        savingsPlans: spCoverage,
      },
      recommendations,
      summary: {
        totalRIs: reservedInstances.length,
        activeRIs: reservedInstances.filter(ri => ri.state === 'active').length,
        totalSavingsPlans: savingsPlans.length,
        activeSavingsPlans: savingsPlans.filter(sp => sp.state === 'active').length,
      },
    });
    
  } catch (err) {
    logger.error('❌ RI/SP Analyzer error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
