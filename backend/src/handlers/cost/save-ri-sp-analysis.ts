/**
 * Save RI/SP Analysis Results to Database
 * 
 * Saves Reserved Instances, Savings Plans, Recommendations, and Utilization History
 * to the database for persistence and historical tracking.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';

interface SaveRiSpAnalysisInput {
  accountId: string;
  analysisData: {
    reservedInstances?: any[];
    savingsPlans?: any[];
    recommendations?: any[];
    utilizationHistory?: any[];
    metadata?: {
      analysisDepth?: string;
      regions?: string[];
      timestamp?: string;
    };
  };
}

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

    const body: SaveRiSpAnalysisInput = JSON.parse(event.body || '{}');
    const { accountId, analysisData } = body;

    if (!accountId || !analysisData) {
      return error('Missing required fields: accountId, analysisData', 400);
    }

    logger.info('Saving RI/SP analysis to database', {
      organizationId,
      accountId,
      riCount: analysisData.reservedInstances?.length || 0,
      spCount: analysisData.savingsPlans?.length || 0,
      recommendationsCount: analysisData.recommendations?.length || 0,
    });

    const savedCounts = {
      reservedInstances: 0,
      savingsPlans: 0,
      recommendations: 0,
      utilizationHistory: 0,
    };

    // Save Reserved Instances
    if (analysisData.reservedInstances && analysisData.reservedInstances.length > 0) {
      for (const ri of analysisData.reservedInstances) {
        await prisma.reservedInstance.upsert({
          where: {
            reserved_instance_id: ri.reservedInstanceId || ri.id,
          },
          create: {
            organization_id: organizationId,
            aws_account_id: accountId,
            aws_account_number: ri.accountId,
            reserved_instance_id: ri.reservedInstanceId || ri.id,
            instance_type: ri.instanceType,
            product_description: ri.productDescription || 'Linux/UNIX',
            availability_zone: ri.availabilityZone,
            region: ri.region || 'us-east-1',
            instance_count: ri.instanceCount || 1,
            state: ri.state || 'active',
            offering_class: ri.offeringClass || 'standard',
            offering_type: ri.offeringType || 'No Upfront',
            fixed_price: ri.fixedPrice,
            usage_price: ri.usagePrice,
            recurring_charges: ri.recurringCharges,
            start_date: new Date(ri.startDate || ri.start),
            end_date: new Date(ri.endDate || ri.end),
            duration_seconds: ri.duration || 31536000,
            utilization_percentage: ri.utilization || ri.utilizationPercentage,
            hours_used: ri.hoursUsed,
            hours_unused: ri.hoursUnused,
            net_savings: ri.netSavings || ri.savings,
            on_demand_cost_equivalent: ri.onDemandCostEquivalent,
            scope: ri.scope,
            tags: ri.tags,
            last_analyzed_at: new Date(),
          },
          update: {
            utilization_percentage: ri.utilization || ri.utilizationPercentage,
            hours_used: ri.hoursUsed,
            hours_unused: ri.hoursUnused,
            net_savings: ri.netSavings || ri.savings,
            on_demand_cost_equivalent: ri.onDemandCostEquivalent,
            state: ri.state || 'active',
            last_analyzed_at: new Date(),
            updated_at: new Date(),
          },
        });
        savedCounts.reservedInstances++;
      }
    }

    // Save Savings Plans
    if (analysisData.savingsPlans && analysisData.savingsPlans.length > 0) {
      for (const sp of analysisData.savingsPlans) {
        await prisma.savingsPlan.upsert({
          where: {
            savings_plan_id: sp.savingsPlanId || sp.id,
          },
          create: {
            organization_id: organizationId,
            aws_account_id: accountId,
            aws_account_number: sp.accountId,
            savings_plan_id: sp.savingsPlanId || sp.id,
            savings_plan_arn: sp.savingsPlanArn || sp.arn,
            savings_plan_type: sp.savingsPlanType || sp.type || 'Compute',
            payment_option: sp.paymentOption || 'No Upfront',
            commitment: sp.commitment || sp.hourlyCommitment || 0,
            currency: sp.currency || 'USD',
            region: sp.region,
            instance_family: sp.instanceFamily,
            state: sp.state || 'active',
            start_date: new Date(sp.startDate || sp.start),
            end_date: new Date(sp.endDate || sp.end),
            utilization_percentage: sp.utilization || sp.utilizationPercentage,
            coverage_percentage: sp.coverage || sp.coveragePercentage,
            total_commitment_to_date: sp.totalCommitmentToDate,
            used_commitment: sp.usedCommitment,
            unused_commitment: sp.unusedCommitment,
            net_savings: sp.netSavings || sp.savings,
            on_demand_cost_equivalent: sp.onDemandCostEquivalent,
            tags: sp.tags,
            offering_id: sp.offeringId,
            last_analyzed_at: new Date(),
          },
          update: {
            utilization_percentage: sp.utilization || sp.utilizationPercentage,
            coverage_percentage: sp.coverage || sp.coveragePercentage,
            used_commitment: sp.usedCommitment,
            unused_commitment: sp.unusedCommitment,
            net_savings: sp.netSavings || sp.savings,
            on_demand_cost_equivalent: sp.onDemandCostEquivalent,
            state: sp.state || 'active',
            last_analyzed_at: new Date(),
            updated_at: new Date(),
          },
        });
        savedCounts.savingsPlans++;
      }
    }

    // Save Recommendations
    if (analysisData.recommendations && analysisData.recommendations.length > 0) {
      // First, mark old recommendations as expired
      await prisma.riSpRecommendation.updateMany({
        where: {
          organization_id: organizationId,
          aws_account_id: accountId,
          status: 'active',
        },
        data: {
          status: 'expired',
          updated_at: new Date(),
        },
      });

      // Then create new recommendations
      for (const rec of analysisData.recommendations) {
        await prisma.riSpRecommendation.create({
          data: {
            organization_id: organizationId,
            aws_account_id: accountId,
            recommendation_type: rec.type || rec.recommendationType || 'reserved_instance',
            service: rec.service || 'EC2',
            instance_type: rec.instanceType,
            region: rec.region,
            platform: rec.platform,
            tenancy: rec.tenancy,
            offering_class: rec.offeringClass,
            savings_plan_type: rec.savingsPlanType,
            payment_option: rec.paymentOption,
            term_years: rec.termYears || rec.term || 1,
            estimated_monthly_savings: rec.potentialSavings?.monthly || rec.monthlySavings || 0,
            estimated_annual_savings: rec.potentialSavings?.annual || rec.annualSavings || 0,
            upfront_cost: rec.upfrontCost,
            estimated_monthly_cost: rec.estimatedMonthlyCost,
            estimated_roi_months: rec.estimatedRoiMonths || rec.breakEvenMonths,
            lookback_period_days: rec.lookbackPeriodDays || 30,
            average_usage_hours: rec.averageUsageHours,
            normalized_units_per_hour: rec.normalizedUnitsPerHour,
            recommended_units: rec.recommendedUnits || rec.quantity || 1,
            confidence_level: rec.confidenceLevel || rec.confidence || 'medium',
            priority: rec.priority || 3,
            implementation_effort: rec.implementationEffort || 'medium',
            implementation_steps: rec.implementationSteps,
            potential_risks: rec.potentialRisks || [],
            recommendation_details: rec.details || rec,
            generated_at: new Date(),
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            status: 'active',
          },
        });
        savedCounts.recommendations++;
      }
    }

    // Save Utilization History
    if (analysisData.utilizationHistory && analysisData.utilizationHistory.length > 0) {
      for (const history of analysisData.utilizationHistory) {
        await prisma.riSpUtilizationHistory.upsert({
          where: {
            organization_id_resource_type_resource_id_period_start: {
              organization_id: organizationId,
              resource_type: history.resourceType || 'reserved_instance',
              resource_id: history.resourceId,
              period_start: new Date(history.periodStart),
            },
          },
          create: {
            organization_id: organizationId,
            aws_account_id: accountId,
            resource_type: history.resourceType || 'reserved_instance',
            resource_id: history.resourceId,
            period_start: new Date(history.periodStart),
            period_end: new Date(history.periodEnd),
            utilization_percentage: history.utilizationPercentage || 0,
            coverage_percentage: history.coveragePercentage,
            hours_used: history.hoursUsed,
            hours_unused: history.hoursUnused,
            net_savings: history.netSavings,
            on_demand_cost_equivalent: history.onDemandCostEquivalent,
            amortized_upfront_fee: history.amortizedUpfrontFee,
            amortized_recurring_fee: history.amortizedRecurringFee,
            total_actual_cost: history.totalActualCost,
            instance_count: history.instanceCount,
          },
          update: {
            utilization_percentage: history.utilizationPercentage || 0,
            coverage_percentage: history.coveragePercentage,
            hours_used: history.hoursUsed,
            hours_unused: history.hoursUnused,
            net_savings: history.netSavings,
            on_demand_cost_equivalent: history.onDemandCostEquivalent,
          },
        });
        savedCounts.utilizationHistory++;
      }
    }

    logger.info('RI/SP analysis saved successfully', savedCounts);

    // Audit log
    logAuditAsync({
      organizationId,
      userId: user.sub,
      action: 'DATA_EXPORT',
      resourceType: 'cost_report',
      resourceId: accountId,
      details: {
        type: 'ri_sp_analysis',
        ...savedCounts,
      },
      ipAddress: getIpFromEvent(event),
      userAgent: getUserAgentFromEvent(event),
    });

    return success({
      message: 'RI/SP analysis saved successfully',
      counts: savedCounts,
    });

  } catch (err) {
    logger.error('Error saving RI/SP analysis', err as Error);
    return error('Failed to save RI/SP analysis');
  }
}
