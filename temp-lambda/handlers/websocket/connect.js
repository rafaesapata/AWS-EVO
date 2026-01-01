"use strict";
/**
 * WebSocket Connection Handler
 * Manages real-time connections for live updates
 * SECURITY: Validates authentication and organization access
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const logging_js_1 = require("../../lib/logging.js");
const metrics_js_1 = require("../../lib/metrics.js");
const dynamodb = new client_dynamodb_1.DynamoDBClient({});
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'evo-uds-websocket-connections';
const handler = async (event) => {
    const connectionId = event.requestContext.connectionId;
    // SECURITY: Get user ID from authorizer - MUST be authenticated
    const userId = event.requestContext.authorizer?.principalId;
    // SECURITY: Reject anonymous/unauthenticated connections
    if (!userId || userId === 'anonymous') {
        logging_js_1.logger.warn('WebSocket connection rejected - no authentication', {
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
    let organizationId;
    if (requestedOrgId) {
        // If orgId specified in query, it MUST match token's org (no cross-org access)
        if (requestedOrgId !== tokenOrgId) {
            logging_js_1.logger.security('WEBSOCKET_UNAUTHORIZED_ORG_ACCESS', {
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
    }
    else if (tokenOrgId) {
        organizationId = tokenOrgId;
    }
    else {
        // No organization ID available
        logging_js_1.logger.warn('WebSocket connection rejected - no organization ID', {
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
        logging_js_1.logger.warn('WebSocket connection rejected - invalid organization ID format', {
            connectionId,
            userId,
            organizationId
        });
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Invalid organization ID format' })
        };
    }
    logging_js_1.logger.info('WebSocket connection established', {
        connectionId,
        userId,
        organizationId
    });
    try {
        await dynamodb.send(new client_dynamodb_1.PutItemCommand({
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
        await metrics_js_1.businessMetrics.userActivity('websocket_connect', organizationId, userId);
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Connected successfully' })
        };
    }
    catch (error) {
        logging_js_1.logger.error('Failed to store WebSocket connection', error, {
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
exports.handler = handler;
//# sourceMappingURL=connect.js.map