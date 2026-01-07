/**
 * Lambda handler for diagnosing cost dashboard issues
 * Specifically for rafael@uds.com.br zero data problem
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  logger.info('Cost Dashboard Diagnosis started', { requestId: context.awsRequestId });
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    const prisma = getPrismaClient();
    
    logger.info('Diagnosing for organization', { organizationId });
    
    const diagnosis: any = {
      organizationId,
      userEmail: user.email,
      timestamp: new Date().toISOString(),
      checks: {}
    };
    
    // 1. Check organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true }
    });
    
    diagnosis.checks.organization = {
      exists: !!organization,
      data: organization
    };
    
    // 2. Check AWS credentials
    const awsCredentials = await prisma.awsCredential.findMany({
      where: { 
        organization_id: organizationId,
        is_active: true 
      },
      select: {
        id: true,
        account_name: true,
        account_id: true,
        is_active: true,
        created_at: true
      }
    });
    
    diagnosis.checks.awsCredentials = {
      count: awsCredentials.length,
      activeCount: awsCredentials.filter(c => c.is_active).length,
      accounts: awsCredentials
    };
    
    // 3. Check daily costs - total count
    const totalCostsCount = await prisma.dailyCost.count({
      where: { organization_id: organizationId }
    });
    
    diagnosis.checks.dailyCosts = {
      totalCount: totalCostsCount
    };
    
    // 4. Check daily costs - recent data
    if (totalCostsCount > 0) {
      const recentCosts = await prisma.dailyCost.findMany({
        where: { organization_id: organizationId },
        orderBy: { date: 'desc' },
        take: 5,
        select: {
          date: true,
          service: true,
          cost: true,
          aws_account_id: true,
          created_at: true
        }
      });
      
      diagnosis.checks.dailyCosts.recentData = recentCosts;
      
      // 5. Check MTD aggregation
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const mtdAggregation = await prisma.dailyCost.aggregate({
        where: {
          organization_id: organizationId,
          date: { gte: startOfMonth }
        },
        _sum: { cost: true },
        _count: true
      });
      
      diagnosis.checks.mtdAggregation = {
        startOfMonth: startOfMonth.toISOString(),
        sum: mtdAggregation._sum.cost,
        count: mtdAggregation._count
      };
      
      // 6. Check YTD aggregation
      const startOfYear = new Date();
      startOfYear.setMonth(0, 1);
      startOfYear.setHours(0, 0, 0, 0);
      
      const ytdAggregation = await prisma.dailyCost.aggregate({
        where: {
          organization_id: organizationId,
          date: { gte: startOfYear }
        },
        _sum: { cost: true },
        _count: true
      });
      
      diagnosis.checks.ytdAggregation = {
        startOfYear: startOfYear.toISOString(),
        sum: ytdAggregation._sum.cost,
        count: ytdAggregation._count
      };
      
      // 7. Check top services
      const topServices = await prisma.dailyCost.groupBy({
        by: ['service'],
        where: {
          organization_id: organizationId,
          date: { gte: startOfMonth }
        },
        _sum: { cost: true },
        orderBy: { _sum: { cost: 'desc' } },
        take: 5
      });
      
      diagnosis.checks.topServices = topServices;
    }
    
    // 8. Check RI/SP data
    const riCount = await prisma.reservedInstance.count({
      where: { organization_id: organizationId }
    });
    
    const spCount = await prisma.savingsPlan.count({
      where: { organization_id: organizationId }
    });
    
    const riSpRecommendationsCount = await prisma.riSpRecommendation.count({
      where: { 
        organization_id: organizationId,
        status: 'active'
      }
    });
    
    diagnosis.checks.riSpData = {
      reservedInstances: riCount,
      savingsPlans: spCount,
      recommendations: riSpRecommendationsCount
    };
    
    // 9. Check if we can fetch costs via Lambda
    if (awsCredentials.length > 0) {
      diagnosis.checks.lambdaTest = {
        message: 'AWS credentials available for testing',
        accountId: awsCredentials[0].id,
        accountName: awsCredentials[0].account_name
      };
    }
    
    // 10. Generate recommendations
    const recommendations = [];
    
    if (awsCredentials.length === 0) {
      recommendations.push({
        type: 'error',
        message: 'No AWS credentials configured',
        action: 'Configure AWS credentials in Settings > AWS Accounts'
      });
    }
    
    if (totalCostsCount === 0) {
      recommendations.push({
        type: 'warning',
        message: 'No cost data found in database',
        action: 'Run cost fetch manually: Dashboard > Cost Analysis > "Busca Completa"'
      });
    }
    
    if (riCount === 0 && spCount === 0) {
      recommendations.push({
        type: 'info',
        message: 'No Reserved Instances or Savings Plans data',
        action: 'Run RI/SP analysis if you have commitments'
      });
    }
    
    diagnosis.recommendations = recommendations;
    diagnosis.summary = {
      hasAwsCredentials: awsCredentials.length > 0,
      hasCostData: totalCostsCount > 0,
      hasRiSpData: riCount > 0 || spCount > 0,
      isHealthy: awsCredentials.length > 0 && totalCostsCount > 0
    };
    
    logger.info('Cost Dashboard Diagnosis completed', { 
      organizationId,
      summary: diagnosis.summary
    });
    
    return success({
      success: true,
      diagnosis
    }, 200, origin);
    
  } catch (err) {
    logger.error('Cost Dashboard Diagnosis error', err as Error, { requestId: context.awsRequestId });
    return error(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
  }
}