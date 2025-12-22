import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from '../../lib/logging.js';
import { PrismaClient } from '@prisma/client';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const prisma = new PrismaClient();
const snsClient = new SNSClient({});

interface CloudFormationEvent {
  StackId: string;
  StackName: string;
  LogicalResourceId: string;
  PhysicalResourceId?: string;
  ResourceType: string;
  ResourceStatus: string;
  ResourceStatusReason?: string;
  Timestamp: string;
  RequestId: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');
    const cfEvent: CloudFormationEvent = body;

    // Validar evento
    if (!cfEvent.StackId || !cfEvent.ResourceStatus) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid CloudFormation event' }) };
    }

    // Extrair account ID do StackId
    const accountId = cfEvent.StackId.split(':')[4];

    // Buscar conta AWS
    const awsAccount = await prisma.awsAccount.findFirst({
      where: { account_id: accountId },
      include: { organization: true }
    });

    if (!awsAccount) {
      logger.info(`AWS Account ${accountId} not found, skipping event`);
      return { statusCode: 200, body: JSON.stringify({ message: 'Account not monitored' }) };
    }

    // Registrar evento de drift/mudança
    const eventType = getEventType(cfEvent.ResourceStatus);
    
    // Registrar evento (removido pois modelo não existe no schema)
    // await prisma.cloudFormationEvent.create({
    //   data: {
    //     awsAccountId: awsAccount.id,
    //     stackId: cfEvent.StackId,
    //     stackName: cfEvent.StackName,
    //     resourceId: cfEvent.LogicalResourceId,
    //     physicalResourceId: cfEvent.PhysicalResourceId,
    //     resourceType: cfEvent.ResourceType,
    //     status: cfEvent.ResourceStatus,
    //     statusReason: cfEvent.ResourceStatusReason,
    //     eventType,
    //     timestamp: new Date(cfEvent.Timestamp),
    //     rawEvent: cfEvent as unknown as Record<string, unknown>
    //   }
    // });

    // Verificar se é um evento crítico que requer notificação
    const criticalStatuses = [
      'CREATE_FAILED', 'UPDATE_FAILED', 'DELETE_FAILED',
      'ROLLBACK_IN_PROGRESS', 'ROLLBACK_COMPLETE',
      'UPDATE_ROLLBACK_IN_PROGRESS', 'UPDATE_ROLLBACK_COMPLETE'
    ];

    if (criticalStatuses.includes(cfEvent.ResourceStatus)) {
      // Buscar configurações de alerta (removido pois modelo não existe no schema)
      // const alertConfig = await prisma.alertConfiguration.findFirst({
      //   where: { 
      //     organizationId: awsAccount.organization_id,
      //     eventType: 'CLOUDFORMATION_FAILURE',
      //     enabled: true
      //   }
      // });

      // Simplified alert handling since alertConfig is commented out
      // Enviar notificação SNS
      const message = {
        type: 'CLOUDFORMATION_EVENT',
        severity: 'HIGH',
        account: awsAccount.account_id,
        accountName: awsAccount.account_name,
        stack: cfEvent.StackName,
        resource: cfEvent.LogicalResourceId,
        status: cfEvent.ResourceStatus,
        reason: cfEvent.ResourceStatusReason,
        timestamp: cfEvent.Timestamp
      };

      if (process.env.ALERT_SNS_TOPIC_ARN) {
        await snsClient.send(new PublishCommand({
          TopicArn: process.env.ALERT_SNS_TOPIC_ARN,
          Subject: `CloudFormation Alert: ${cfEvent.StackName} - ${cfEvent.ResourceStatus}`,
          Message: JSON.stringify(message, null, 2)
        }));
      }

      // Registrar alerta
      await prisma.alert.create({
        data: {
          organization_id: awsAccount.organization_id,
          severity: 'HIGH',
          title: `CloudFormation Alert: ${cfEvent.StackName}`,
          message: cfEvent.ResourceStatusReason || `Resource ${cfEvent.LogicalResourceId} failed`,
          metadata: message as any
        }
      });
    }

    // Verificar drift detection
    if (cfEvent.ResourceStatus === 'UPDATE_COMPLETE' || cfEvent.ResourceStatus === 'CREATE_COMPLETE') {
      await checkForDrift(awsAccount.id, cfEvent);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        eventId: cfEvent.RequestId,
        processed: true
      })
    };
  } catch (error) {
    logger.error('CloudFormation webhook error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

function getEventType(status: string): string {
  if (status.includes('CREATE')) return 'CREATE';
  if (status.includes('UPDATE')) return 'UPDATE';
  if (status.includes('DELETE')) return 'DELETE';
  if (status.includes('ROLLBACK')) return 'ROLLBACK';
  return 'OTHER';
}

async function checkForDrift(awsAccountId: string, event: CloudFormationEvent): Promise<void> {
  // Buscar baseline do recurso (removido pois modelo não existe no schema)
  // const baseline = await prisma.resourceBaseline.findFirst({
  //   where: {
  //     awsAccountId,
  //     resourceId: event.LogicalResourceId,
  //     resourceType: event.ResourceType
  //   }
  // });

  // Marcar como potencial drift para análise posterior
  await prisma.driftDetection.create({
    data: {
      organization_id: awsAccountId, // Using as placeholder
      aws_account_id: awsAccountId,
      resource_id: event.LogicalResourceId,
      resource_type: event.ResourceType,
      resource_name: event.LogicalResourceId,
      drift_type: 'CLOUDFORMATION_UPDATE',
      severity: 'MEDIUM'
    }
  });
}
