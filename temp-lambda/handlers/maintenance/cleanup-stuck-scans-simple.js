"use strict";
/**
 * Lambda simples para limpeza de scans travados
 * Executa automaticamente sem necessidade de autenticação
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
async function handler() {
    const prisma = (0, database_js_1.getPrismaClient)();
    try {
        logging_js_1.logger.info('🔧 Starting automatic cleanup of stuck scans');
        // Definir tempo limite: 30 minutos
        const stuckThreshold = new Date(Date.now() - 30 * 60 * 1000);
        // Primeiro, identificar scans travados
        const stuckScans = await prisma.securityScan.findMany({
            where: {
                status: 'running',
                started_at: {
                    lt: stuckThreshold
                }
            },
            select: {
                id: true,
                organization_id: true,
                scan_type: true,
                started_at: true
            }
        });
        logging_js_1.logger.info(`📊 Found ${stuckScans.length} stuck scans`);
        if (stuckScans.length === 0) {
            return (0, response_js_1.success)({
                message: 'No stuck scans found',
                scansProcessed: 0,
                timestamp: new Date().toISOString()
            });
        }
        // Atualizar scans travados
        const updateResult = await prisma.securityScan.updateMany({
            where: {
                status: 'running',
                started_at: {
                    lt: stuckThreshold
                }
            },
            data: {
                status: 'failed',
                completed_at: new Date(),
                results: {
                    error: 'Automatic cleanup: Process was stuck for more than 30 minutes',
                    cleanup_timestamp: new Date().toISOString(),
                    cleanup_reason: 'automatic_stuck_scan_cleanup'
                }
            }
        });
        logging_js_1.logger.info(`✅ Updated ${updateResult.count} stuck scans to failed status`);
        // Log detalhes dos scans limpos
        stuckScans.forEach(scan => {
            const durationMinutes = Math.floor((Date.now() - new Date(scan.started_at).getTime()) / (1000 * 60));
            logging_js_1.logger.info(`Cleaned stuck scan: ${scan.id} (${scan.scan_type}) - stuck for ${durationMinutes} minutes`);
        });
        return (0, response_js_1.success)({
            message: `Successfully cleaned up ${updateResult.count} stuck scans`,
            scansProcessed: updateResult.count,
            scansFound: stuckScans.length,
            stuckThresholdMinutes: 30,
            timestamp: new Date().toISOString(),
            cleanedScans: stuckScans.map(scan => ({
                id: scan.id,
                scanType: scan.scan_type,
                organizationId: scan.organization_id,
                startedAt: scan.started_at,
                durationMinutes: Math.floor((Date.now() - new Date(scan.started_at).getTime()) / (1000 * 60))
            }))
        });
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logging_js_1.logger.error('❌ Cleanup failed:', err);
        return (0, response_js_1.error)(`Cleanup failed: ${errorMessage}`, 500);
    }
}
//# sourceMappingURL=cleanup-stuck-scans-simple.js.map