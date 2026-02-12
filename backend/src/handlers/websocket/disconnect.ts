/**
 * WebSocket Disconnect Handler
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { logger } from '../../lib/logger.js';

const dynamodb = new DynamoDBClient({});
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'evo-uds-websocket-connections';

export const handler: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId!;
  
  logger.info('WebSocket connection disconnected', { connectionId });

  try {
    await dynamodb.send(new DeleteItemCommand({
      TableName: CONNECTIONS_TABLE,
      Key: {
        connectionId: { S: connectionId },
      },
    }));

    return { statusCode: 200, body: 'Disconnected' };
  } catch (error) {
    logger.error('Failed to remove WebSocket connection', error as Error, { connectionId });
    return { statusCode: 500, body: 'Disconnect failed' };
  }
};