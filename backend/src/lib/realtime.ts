/**
 * Real-time Notification System
 * Manages WebSocket communications for live updates
 */

import { 
  ApiGatewayManagementApiClient, 
  PostToConnectionCommand,
  GoneException 
} from '@aws-sdk/client-apigatewaymanagementapi';
import { 
  DynamoDBClient, 
  QueryCommand, 
  DeleteItemCommand 
} from '@aws-sdk/client-dynamodb';
import { logger } from './logging.js';

const dynamodb = new DynamoDBClient({});
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'evo-uds-websocket-connections';

export interface RealtimeEvent {
  type: 'SCAN_PROGRESS' | 'SCAN_COMPLETE' | 'ALERT' | 'COST_UPDATE' | 'FINDING' | 'SYSTEM_NOTIFICATION';
  payload: any;
  timestamp: string;
  organizationId: string;
  userId?: string;
}

export class RealtimeNotifier {
  private client: ApiGatewayManagementApiClient;

  constructor(endpoint: string) {
    this.client = new ApiGatewayManagementApiClient({ 
      endpoint: endpoint.replace('wss://', 'https://').replace('ws://', 'http://')
    });
  }

  async notifyUser(connectionId: string, event: RealtimeEvent): Promise<boolean> {
    try {
      await this.client.send(new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(event)),
      }));
      
      logger.debug('Real-time notification sent', { 
        connectionId, 
        eventType: event.type,
        organizationId: event.organizationId 
      });
      
      return true;
    } catch (error) {
      if (error instanceof GoneException) {
        // Connection stale, remove from DynamoDB
        logger.info('Removing stale WebSocket connection', { connectionId });
        await this.removeConnection(connectionId);
        return false;
      }
      
      logger.error('Failed to send real-time notification', error as Error, { 
        connectionId, 
        eventType: event.type 
      });
      return false;
    }
  }

  async broadcastToOrg(orgId: string, event: RealtimeEvent): Promise<number> {
    const connections = await this.getOrgConnections(orgId);
    
    if (connections.length === 0) {
      logger.debug('No active connections for organization', { orgId });
      return 0;
    }

    const results = await Promise.allSettled(
      connections.map(connectionId => this.notifyUser(connectionId, event))
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
    
    logger.info('Broadcast completed', { 
      orgId, 
      eventType: event.type, 
      totalConnections: connections.length,
      successfulDeliveries: successCount 
    });

    return successCount;
  }

  async broadcastToUser(userId: string, event: RealtimeEvent): Promise<number> {
    const connections = await this.getUserConnections(userId);
    
    if (connections.length === 0) {
      logger.debug('No active connections for user', { userId });
      return 0;
    }

    const results = await Promise.allSettled(
      connections.map(connectionId => this.notifyUser(connectionId, event))
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
    
    logger.info('User notification completed', { 
      userId, 
      eventType: event.type, 
      totalConnections: connections.length,
      successfulDeliveries: successCount 
    });

    return successCount;
  }

  private async getOrgConnections(orgId: string): Promise<string[]> {
    try {
      const response = await dynamodb.send(new QueryCommand({
        TableName: CONNECTIONS_TABLE,
        IndexName: 'OrganizationIndex', // Assumindo que existe um GSI
        KeyConditionExpression: 'organizationId = :orgId',
        ExpressionAttributeValues: {
          ':orgId': { S: orgId },
        },
        ProjectionExpression: 'connectionId',
      }));

      return response.Items?.map(item => item.connectionId.S!) || [];
    } catch (error) {
      logger.error('Failed to get organization connections', error as Error, { orgId });
      return [];
    }
  }

  private async getUserConnections(userId: string): Promise<string[]> {
    try {
      const response = await dynamodb.send(new QueryCommand({
        TableName: CONNECTIONS_TABLE,
        IndexName: 'UserIndex', // Assumindo que existe um GSI
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': { S: userId },
        },
        ProjectionExpression: 'connectionId',
      }));

      return response.Items?.map(item => item.connectionId.S!) || [];
    } catch (error) {
      logger.error('Failed to get user connections', error as Error, { userId });
      return [];
    }
  }

  private async removeConnection(connectionId: string): Promise<void> {
    try {
      await dynamodb.send(new DeleteItemCommand({
        TableName: CONNECTIONS_TABLE,
        Key: {
          connectionId: { S: connectionId },
        },
      }));
    } catch (error) {
      logger.error('Failed to remove stale connection', error as Error, { connectionId });
    }
  }
}

// Factory function para criar notifier
export function createRealtimeNotifier(): RealtimeNotifier | null {
  const endpoint = process.env.WEBSOCKET_ENDPOINT;
  
  if (!endpoint) {
    logger.warn('WebSocket endpoint not configured - real-time notifications disabled');
    return null;
  }

  return new RealtimeNotifier(endpoint);
}

// Helper functions para eventos comuns
export const realtimeEvents = {
  scanProgress: (scanId: string, progress: number, currentStep: string, orgId: string): RealtimeEvent => ({
    type: 'SCAN_PROGRESS',
    payload: { scanId, progress, currentStep },
    timestamp: new Date().toISOString(),
    organizationId: orgId,
  }),

  scanComplete: (scanId: string, findingsCount: number, orgId: string): RealtimeEvent => ({
    type: 'SCAN_COMPLETE',
    payload: { scanId, findingsCount },
    timestamp: new Date().toISOString(),
    organizationId: orgId,
  }),

  newAlert: (alert: any, orgId: string): RealtimeEvent => ({
    type: 'ALERT',
    payload: alert,
    timestamp: new Date().toISOString(),
    organizationId: orgId,
  }),

  costUpdate: (costData: any, orgId: string): RealtimeEvent => ({
    type: 'COST_UPDATE',
    payload: costData,
    timestamp: new Date().toISOString(),
    organizationId: orgId,
  }),

  newFinding: (finding: any, orgId: string): RealtimeEvent => ({
    type: 'FINDING',
    payload: finding,
    timestamp: new Date().toISOString(),
    organizationId: orgId,
  }),
};