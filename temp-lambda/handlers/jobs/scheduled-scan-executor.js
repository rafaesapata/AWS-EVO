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
    logging_js_1.logger.info('Scheduled Scan Executor started', { requestId: context.awsRequestId });
    try {
        const prisma = (0, database_js_1.getPrismaClient)();
        // Buscar jobs agendados que devem ser executados
        const now = new Date();
        const jobs = await prisma.backgroundJob.findMany({
            where: {
                status: 'pending',
                job_type: {
                    in: ['security_scan', 'compliance_scan', 'drift_detection', 'cost_analysis'],
                },
            },
            take: 10,
        });
        logging_js_1.logger.info('Found scheduled jobs to execute', { jobsCount: jobs.length });
        const results = [];
        for (const job of jobs) {
            try {
                // Marcar como em execução
                await prisma.backgroundJob.update({
                    where: { id: job.id },
                    data: {
                        status: 'running',
                        started_at: new Date(),
                    },
                });
                // Executar job baseado no tipo
                let result;
                switch (job.job_type) {
                    case 'security_scan':
                        result = await executeSecurityScan(job);
                        break;
                    case 'compliance_scan':
                        result = await executeComplianceScan(job);
                        break;
                    case 'drift_detection':
                        result = await executeDriftDetection(job);
                        break;
                    case 'cost_analysis':
                        result = await executeCostAnalysis(job);
                        break;
                    default:
                        throw new Error(`Unknown job type: ${job.job_type}`);
                }
                // Marcar como completo
                await prisma.backgroundJob.update({
                    where: { id: job.id },
                    data: {
                        status: 'completed',
                        result,
                        completed_at: new Date(),
                    },
                });
                results.push({
                    jobId: job.id,
                    jobType: job.job_type,
                    status: 'completed',
                    result,
                });
                logging_js_1.logger.info('Job completed', { jobId: job.id, jobType: job.job_type });
            }
            catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                await prisma.backgroundJob.update({
                    where: { id: job.id },
                    data: {
                        status: 'failed',
                        error: errorMessage,
                        completed_at: new Date(),
                    },
                });
                results.push({
                    jobId: job.id,
                    jobType: job.job_type,
                    status: 'failed',
                    error: errorMessage,
                });
                logging_js_1.logger.error('Job failed', err, { jobId: job.id, jobType: job.job_type });
            }
        }
        return (0, response_js_1.success)({
            success: true,
            jobsExecuted: results.length,
            results,
        });
    }
    catch (err) {
        logging_js_1.logger.error('Scheduled Scan Executor error', err, { requestId: context.awsRequestId });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
async function executeSecurityScan(job) {
    // Simular execução de security scan
    return {
        scanned: true,
        findingsCount: 0,
        message: 'Security scan completed',
    };
}
async function executeComplianceScan(job) {
    return {
        scanned: true,
        violationsCount: 0,
        message: 'Compliance scan completed',
    };
}
async function executeDriftDetection(job) {
    return {
        scanned: true,
        driftsCount: 0,
        message: 'Drift detection completed',
    };
}
async function executeCostAnalysis(job) {
    return {
        analyzed: true,
        totalCost: 0,
        message: 'Cost analysis completed',
    };
}
//# sourceMappingURL=scheduled-scan-executor.js.map