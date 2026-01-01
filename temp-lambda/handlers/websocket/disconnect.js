"use strict";
/**
 * WebSocket Disconnect Handler
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const logging_js_1 = require("../../lib/logging.js");
const dynamodb = new client_dynamodb_1.DynamoDBClient({});
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'evo-uds-websocket-connections';
const handler = async (event) => {
    const connectionId = event.requestContext.connectionId;
    logging_js_1.logger.info('WebSocket connection disconnected', { connectionId });
    try {
        await dynamodb.send(new client_dynamodb_1.DeleteItemCommand({
            TableName: CONNECTIONS_TABLE,
            Key: {
                connectionId: { S: connectionId },
            },
        }));
        return { statusCode: 200, body: 'Disconnected' };
    }
    catch (error) {
        logging_js_1.logger.error('Failed to remove WebSocket connection', error, { connectionId });
        return { statusCode: 500, body: 'Disconnect failed' };
    }
};
exports.handler = handler;
//# sourceMappingURL=disconnect.js.map