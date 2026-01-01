"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
async function handler(event, context) {
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    logging_js_1.logger.info('Process Events started', { requestId: context.awsRequestId });
    try {
        const prisma = (0, database_js_1.getPrismaClient)();
        // Buscar eventos pendentes
        const pendingEvents = await prisma.systemEvent.findMany({
            where: {
                processed: false,
            },
            orderBy: { created_at: 'asc' },
            take: 50,
        });
        logging_js_1.logger.info('Found pending events', { count: pendingEvents.length });
        const results = [];
        for (const evt of pendingEvents) {
            try {
                // Processar evento baseado no tipo
                await processEvent(prisma, evt);
                // Marcar como processado
                await prisma.systemEvent.update({
                    where: { id: evt.id },
                    data: {
                        processed: true,
                        processed_at: new Date(),
                    },
                });
                results.push({
                    eventId: evt.id,
                    eventType: evt.event_type,
                    status: 'processed',
                });
            }
            catch (err) {
                logging_js_1.logger.error('Error processing event', err, { eventId: evt.id, eventType: evt.event_type });
                results.push({
                    eventId: evt.id,
                    eventType: evt.event_type,
                    status: 'failed',
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
            }
        }
        logging_js_1.logger.info('Events processing completed', { processedCount: results.length });
        return (0, response_js_1.success)({
            success: true,
            eventsProcessed: results.length,
            results,
        });
    }
    catch (err) {
        logging_js_1.logger.error('Process Events error', err, { requestId: context.awsRequestId });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
async function processEvent(prisma, event) {
    const { event_type: eventType, payload } = event;
    switch (eventType) {
        case 'user_created':
            await handleUserCreated(prisma, payload);
            break;
        case 'alert_triggered':
            await handleAlertTriggered(prisma, payload);
            break;
        case 'scan_completed':
            await handleScanCompleted(prisma, payload);
            break;
        case 'cost_threshold_exceeded':
            await handleCostThreshold(prisma, payload);
            break;
        default:
            logging_js_1.logger.warn('Unknown event type', { eventType });
    }
}
async function handleUserCreated(prisma, payload) {
    logging_js_1.logger.info('Processing user_created event', { userId: payload?.userId });
}
async function handleAlertTriggered(prisma, payload) {
    logging_js_1.logger.info('Processing alert_triggered event', { alertId: payload?.alertId });
}
async function handleScanCompleted(prisma, payload) {
    logging_js_1.logger.info('Processing scan_completed event', { scanId: payload?.scanId });
}
async function handleCostThreshold(prisma, payload) {
    logging_js_1.logger.info('Processing cost_threshold_exceeded event', { threshold: payload?.threshold });
}
//# sourceMappingURL=process-events.js.map