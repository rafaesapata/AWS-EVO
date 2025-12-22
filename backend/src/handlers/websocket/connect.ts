/**
 * WebSocket Connection Handler
 * Manages real-time connections for live updates
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { logger } from '../../lib/logging.js';
import { businessMetrics } from '../../lib/metrics.js';

const dynamodb = new DynamoDBClient({});
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'evo-uds-websocket-connections';

export const handler: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId!;
  const userId = event.requestContext.authorizer?.principalId || 'anonymous';
  const organizationId = event.queryStringParameters?.orgId;
  
  logger.info('WebSocket connection established', { 
    connectionId, 
    userId, 
    organizationId 
  });

  try {
    await dynamodb.send(new PutItemCommand({
      TableName: CONNECTIONS_TABLE,
      Item: {
        connectionId: { S: connectionId },
        userId: { S: userId },
        organizationId: { S: organizationId || 'unknown' },
        connectedAt: { N: Date.now().toString() },
        ttl: { N: (Math.floor(Date.now() / 1000) + (24 * 60 * 60)).toString() }, // 24h TTL
      },
    }));

    // Métricas
    await businessMetrics.userActivity('websocket_connect', organizationId || 'unknown', userId);

    return { 
      statusCode: 200, 
      body: JSON.stringify({ message: 'Connected successfully' })
    };
  } catch (error) {
    logger.error('Failed to store WebSocket connection', error as Error, {
      connectionId,
      userId,
      organizationId,
    });

    return { 
      statusCode: 500, 
      body: JSON.stringify({ message: 'Connection failed' })
    };
  }
};