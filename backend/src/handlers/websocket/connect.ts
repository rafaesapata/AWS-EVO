/**
 * WebSocket Connection Handler
 * Manages real-time connections for live updates
 * SECURITY: Validates authentication and organization access
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { logger } from '../../lib/logger.js';
import { businessMetrics } from '../../lib/metrics.js';

const dynamodb = new DynamoDBClient({});
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'evo-uds-websocket-connections';

export const handler: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId!;
  
  // SECURITY: Get user ID from authorizer - MUST be authenticated
  const userId = event.requestContext.authorizer?.principalId;
  
  // SECURITY: Reject anonymous/unauthenticated connections
  if (!userId || userId === 'anonymous') {
    logger.warn('WebSocket connection rejected - no authentication', { 
      connectionId,
      sourceIp: event.requestContext.identity?.sourceIp
    });
    return { 
      statusCode: 401, 
      body: JSON.stringify({ message: 'Unauthorized - authentication required' })
    };
  }
  
  // SECURITY: Get organization ID from token claims, NOT from query parameter
  const tokenOrgId = event.requestContext.authorizer?.claims?.['custom:organization_id'];
  const requestedOrgId = event.queryStringParameters?.orgId;
  
  // SECURITY: Validate organization access
  let organizationId: string;
  
  if (requestedOrgId) {
    // If orgId specified in query, it MUST match token's org (no cross-org access)
    if (requestedOrgId !== tokenOrgId) {
      logger.security('WEBSOCKET_UNAUTHORIZED_ORG_ACCESS', 'HIGH', {
        userId,
        requestedOrgId,
        tokenOrgId,
        connectionId,
        sourceIp: event.requestContext.identity?.sourceIp
      });
      return { 
        statusCode: 403, 
        body: JSON.stringify({ message: 'Access denied to organization' })
      };
    }
    organizationId = requestedOrgId;
  } else if (tokenOrgId) {
    organizationId = tokenOrgId;
  } else {
    // No organization ID available
    logger.warn('WebSocket connection rejected - no organization ID', { 
      connectionId, 
      userId 
    });
    return { 
      statusCode: 400, 
      body: JSON.stringify({ message: 'Organization ID required' })
    };
  }
  
  // Validate organization ID format (UUID)
  const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!uuidRegex.test(organizationId)) {
    logger.warn('WebSocket connection rejected - invalid organization ID format', { 
      connectionId, 
      userId,
      organizationId 
    });
    return { 
      statusCode: 400, 
      body: JSON.stringify({ message: 'Invalid organization ID format' })
    };
  }
  
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
        organizationId: { S: organizationId },
        connectedAt: { N: Date.now().toString() },
        ttl: { N: (Math.floor(Date.now() / 1000) + (24 * 60 * 60)).toString() }, // 24h TTL
      },
    }));

    // Métricas
    await businessMetrics.userActivity('websocket_connect', organizationId, userId);

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