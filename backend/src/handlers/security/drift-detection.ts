import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Drift Detection
 * AWS Lambda Handler for drift-detection
 * 
 * Detecta mudanças não autorizadas em recursos AWS (drift)
 * comparando estado atual vs estado esperado no inventário
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';

interface DriftDetectionRequest {
  accountId?: string;
  regions?: string[];
}

interface DriftItem {
  aws_account_id: string;
  resource_id: string;
  resource_type: string;
  resource_name: string | null;
  drift_type: 'created' | 'configuration_drift' | 'deleted';
  detected_at: Date;
  severity: 'critical' | 'high' | 'medium' | 'low';
  diff: any;
  expected_state: any;
  actual_state: any;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const startTime = Date.now();
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  
  logger.info('Drift Detection started', { 
    organizationId,
    userId: user.sub,
    requestId: context.awsRequestId 
  });
  
  try {
    const body: DriftDetectionRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId, regions: requestedRegions } = body;
    
    const prisma = getPrismaClient();
    
    // Buscar credenciais AWS ativas
    const awsAccounts = await prisma.awsCredential.findMany({
      where: {
        organization_id: organizationId,
        is_active: true,
        ...(accountId && { id: accountId }),
      },
    });
    
    if (awsAccounts.length === 0) {
      return success({
        success: true,
        message: 'No AWS credentials configured. Please configure AWS credentials first.',
        drifts: [],
        stats: {
          total: 0,
          created: 0,
          modified: 0,
          deleted: 0,
          critical: 0,
          high: 0,
        },
      });
    }
    
    const detectedDrifts: DriftItem[] = [];
    
    // Processar cada conta AWS
    for (const account of awsAccounts) {
      const regions = requestedRegions || account.regions || ['us-east-1'];
      
      // Resolver credenciais via AssumeRole
      let resolvedCreds;
      try {
        resolvedCreds = await resolveAwsCredentials(account, regions[0]);
        logger.info('Credentials resolved for account', { organizationId, accountId: account.id });
      } catch (err) {
        logger.error('Failed to resolve credentials for account', err as Error, { 
          organizationId, 
          accountId: account.id 
        });
        continue;
      }
      
      // Escanear cada região
      for (const region of regions) {
        logger.info('Scanning for drift in region', { organizationId, region, accountId: account.id });
        
        const regionDrifts = await detectDriftsInRegion(
          prisma,
          account.id,
          region,
          resolvedCreds
        );
        
        detectedDrifts.push(...regionDrifts);
      }
    }
    
    // Salvar drifts detectados
    if (detectedDrifts.length > 0) {
      await prisma.driftDetection.createMany({
        data: detectedDrifts.map(drift => ({
          ...drift,
          organization_id: organizationId
        })),
        skipDuplicates: true,
      });
    }
    
    // Calcular estatísticas
    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const createdCount = detectedDrifts.filter(d => d.drift_type === 'created').length;
    const modifiedCount = detectedDrifts.filter(d => d.drift_type === 'configuration_drift').length;
    const deletedCount = detectedDrifts.filter(d => d.drift_type === 'deleted').length;
    const criticalCount = detectedDrifts.filter(d => d.severity === 'critical').length;
    const highCount = detectedDrifts.filter(d => d.severity === 'high').length;
    
    // Salvar histórico
    await prisma.driftDetectionHistory.create({
      data: {
        organization_id: organizationId,
        total_drifts: detectedDrifts.length,
        created_count: createdCount,
        modified_count: modifiedCount,
        deleted_count: deletedCount,
        critical_count: criticalCount,
        high_count: highCount,
        execution_time_seconds: parseFloat(executionTime),
        message: `Detected ${detectedDrifts.length} drifts (${createdCount} created, ${modifiedCount} modified, ${deletedCount} deleted)`,
      },
    });
    
    logger.info('Drift Detection completed', { 
      organizationId,
      driftsDetected: detectedDrifts.length,
      executionTime,
      createdCount,
      modifiedCount,
      deletedCount
    });
    
    return success({
      success: true,
      drifts_detected: detectedDrifts.length,
      execution_time: executionTime,
      summary: {
        created: createdCount,
        configuration_drift: modifiedCount,
        deleted: deletedCount,
        critical: criticalCount,
        high: highCount,
      },
      drifts: detectedDrifts,
    });
    
  } catch (err) {
    logger.error('Drift Detection error', err as Error, { 
      organizationId,
      userId: user.sub,
      requestId: context.awsRequestId 
    });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

async function detectDriftsInRegion(
  prisma: any,
  accountId: string,
  region: string,
  credentials: any
): Promise<DriftItem[]> {
  const drifts: DriftItem[] = [];
  
  try {
    // Obter instâncias EC2 atuais
    const ec2Client = new EC2Client({
      region,
      credentials: toAwsCredentials(credentials),
    });
    
    const response = await ec2Client.send(new DescribeInstancesCommand({}));
    const currentInstances: any[] = [];
    
    if (response.Reservations) {
      for (const reservation of response.Reservations) {
        if (reservation.Instances) {
          currentInstances.push(...reservation.Instances);
        }
      }
    }
    
    // Obter estado esperado do inventário
    const expectedResources = await prisma.resourceInventory.findMany({
      where: {
        awsAccountId: accountId,
        resourceType: 'EC2::Instance',
        region,
      },
    });
    
    // Comparar estado atual vs esperado
    for (const current of currentInstances) {
      const expected = expectedResources.find(
        (r: any) => r.resourceId === current.InstanceId
      );
      
      if (!expected) {
        // Recurso criado fora do IaC
        drifts.push({
          aws_account_id: accountId,
          resource_id: current.InstanceId!,
          resource_type: 'EC2::Instance',
          resource_name: current.Tags?.find((t: any) => t.Key === 'Name')?.Value || null,
          drift_type: 'created',
          detected_at: new Date(),
          severity: 'high',
          diff: {
            instanceType: current.InstanceType,
            state: current.State?.Name,
            securityGroups: current.SecurityGroups?.map((sg: any) => sg.GroupId),
          },
          expected_state: null,
          actual_state: {
            instanceType: current.InstanceType,
            state: current.State?.Name,
          },
        });
      } else {
        // Comparar configurações
        const expectedMeta = (expected.metadata as any) || {};
        if (expectedMeta.instanceType && expectedMeta.instanceType !== current.InstanceType) {
          drifts.push({
            aws_account_id: accountId,
            resource_id: current.InstanceId!,
            resource_type: 'EC2::Instance',
            resource_name: current.Tags?.find((t: any) => t.Key === 'Name')?.Value || expected.resourceName,
            drift_type: 'configuration_drift',
            detected_at: new Date(),
            severity: 'medium',
            diff: {
              field: 'instanceType',
              expected: expectedMeta.instanceType,
              actual: current.InstanceType,
            },
            expected_state: expectedMeta,
            actual_state: {
              instanceType: current.InstanceType,
              state: current.State?.Name,
            },
          });
        }
      }
    }
    
    // Verificar recursos deletados (existem no inventário mas não na AWS)
    for (const expected of expectedResources) {
      const exists = currentInstances.some((c: any) => c.InstanceId === expected.resourceId);
      if (!exists) {
        drifts.push({
          aws_account_id: accountId,
          resource_id: expected.resourceId,
          resource_type: 'EC2::Instance',
          resource_name: expected.resourceName,
          drift_type: 'deleted',
          detected_at: new Date(),
          severity: 'critical',
          diff: { message: 'Resource no longer exists in AWS' },
          expected_state: expected.metadata,
          actual_state: null,
        });
      }
    }
    
  } catch (err) {
    logger.error('Error detecting drifts in region', err as Error, { region, accountId });
  }
  
  return drifts;
}
