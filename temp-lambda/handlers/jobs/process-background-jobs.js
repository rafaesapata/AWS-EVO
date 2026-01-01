"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
// Rate limiting per organization (max jobs per minute)
const ORG_JOB_LIMITS = new Map();
const MAX_JOBS_PER_ORG_PER_MINUTE = 10;
function checkOrgRateLimit(organizationId) {
    const now = Date.now();
    const limit = ORG_JOB_LIMITS.get(organizationId);
    if (!limit || now > limit.resetTime) {
        ORG_JOB_LIMITS.set(organizationId, { count: 1, resetTime: now + 60000 });
        return true;
    }
    if (limit.count >= MAX_JOBS_PER_ORG_PER_MINUTE) {
        logging_js_1.logger.warn('Organization rate limit exceeded for background jobs', { organizationId });
        return false;
    }
    limit.count++;
    return true;
}
async function handler(event, context) {
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    logging_js_1.logger.info('Process Background Jobs started', { requestId: context.awsRequestId });
    try {
        const prisma = (0, database_js_1.getPrismaClient)();
        // Buscar jobs pendentes (sistema processa de todas as orgs)
        // Cada job é isolado por organization_id
        const pendingJobs = await prisma.backgroundJob.findMany({
            where: {
                status: 'pending',
            },
            orderBy: { created_at: 'asc' },
            take: 20,
        });
        logging_js_1.logger.info('Found pending background jobs', { jobsCount: pendingJobs.length });
        const results = [];
        for (const job of pendingJobs) {
            // Rate limiting per organization
            const jobOrgId = job.organization_id;
            if (jobOrgId && !checkOrgRateLimit(jobOrgId)) {
                results.push({
                    jobId: job.id,
                    jobType: job.job_type,
                    status: 'rate_limited',
                    organizationId: jobOrgId,
                });
                continue;
            }
            try {
                // Marcar como em execução
                await prisma.backgroundJob.update({
                    where: { id: job.id },
                    data: {
                        status: 'running',
                        started_at: new Date(),
                    },
                });
                // Processar job (isolado por organization_id do job)
                const result = await processJob(prisma, job);
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
                    organizationId: jobOrgId,
                });
                logging_js_1.logger.info('Background job completed', {
                    jobId: job.id,
                    jobType: job.job_type,
                    organizationId: jobOrgId
                });
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
                    organizationId: jobOrgId,
                });
                logging_js_1.logger.error('Background job failed', err, {
                    jobId: job.id,
                    jobType: job.job_type,
                    organizationId: jobOrgId
                });
            }
        }
        return (0, response_js_1.success)({
            success: true,
            jobsProcessed: results.length,
            results,
        });
    }
    catch (err) {
        logging_js_1.logger.error('Process Background Jobs error', err, { requestId: context.awsRequestId });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
async function processJob(prisma, job) {
    const params = job.parameters || {};
    switch (job.job_type) {
        case 'data_export':
            return await processDataExport(prisma, params);
        case 'report_generation':
            return await processReportGeneration(prisma, params);
        case 'cleanup':
            return await processCleanup(prisma, params);
        case 'sync':
            return await processSync(prisma, params);
        default:
            return { processed: true, message: `Job type ${job.job_type} processed` };
    }
}
async function processDataExport(prisma, params) {
    return { exported: true, records: 0 };
}
async function processReportGeneration(prisma, params) {
    return { generated: true, reportId: 'report-123' };
}
async function processCleanup(prisma, params) {
    return { cleaned: true, deletedRecords: 0 };
}
async function processSync(prisma, params) {
    return { synced: true, syncedRecords: 0 };
}
//# sourceMappingURL=process-background-jobs.js.map