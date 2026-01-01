"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
const client_lambda_1 = require("@aws-sdk/client-lambda");
async function handler(event, context) {
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const organizationId = (0, auth_js_1.getOrganizationId)(user);
    logging_js_1.logger.info('Execute scheduled job started', {
        organizationId,
        userId: user.sub,
        requestId: context.awsRequestId
    });
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const { jobId } = body;
        if (!jobId) {
            return (0, response_js_1.badRequest)('jobId is required');
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        // Buscar job
        const job = await prisma.backgroundJob.findFirst({
            where: {
                id: jobId,
                organization_id: organizationId,
            },
        });
        if (!job) {
            return (0, response_js_1.badRequest)('Job not found');
        }
        logging_js_1.logger.info('Executing scheduled job', {
            organizationId,
            jobId,
            jobName: job.job_name,
            jobType: job.job_type
        });
        // Atualizar status para running
        await prisma.backgroundJob.update({
            where: { id: jobId },
            data: {
                status: 'running',
                started_at: new Date(),
            },
        });
        try {
            // Executar job baseado no tipo
            let result;
            switch (job.job_type) {
                case 'security_scan':
                    result = await invokeLambda('SecurityScan', job.parameters);
                    break;
                case 'compliance_scan':
                    result = await invokeLambda('ComplianceScan', job.parameters);
                    break;
                case 'guardduty_scan':
                    result = await invokeLambda('GuardDutyScan', job.parameters);
                    break;
                case 'cost_analysis':
                    result = await invokeLambda('FinopsCopilot', job.parameters);
                    break;
                case 'sync_accounts':
                    result = await invokeLambda('SyncOrganizationAccounts', {});
                    break;
                default:
                    throw new Error(`Unknown job type: ${job.job_type}`);
            }
            // Atualizar status para completed
            await prisma.backgroundJob.update({
                where: { id: jobId },
                data: {
                    status: 'completed',
                    completed_at: new Date(),
                    result,
                },
            });
            logging_js_1.logger.info('Scheduled job completed successfully', {
                organizationId,
                jobId,
                jobName: job.job_name,
                jobType: job.job_type
            });
            return (0, response_js_1.success)({
                job_id: jobId,
                status: 'completed',
                result,
            });
        }
        catch (jobError) {
            // Atualizar status para failed
            await prisma.backgroundJob.update({
                where: { id: jobId },
                data: {
                    status: 'failed',
                    completed_at: new Date(),
                    error: jobError instanceof Error ? jobError.message : 'Unknown error',
                },
            });
            throw jobError;
        }
    }
    catch (err) {
        logging_js_1.logger.error('Execute scheduled job error', err, {
            organizationId,
            userId: user.sub,
            requestId: context.awsRequestId
        });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
async function invokeLambda(functionName, payload) {
    const lambdaClient = new client_lambda_1.LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const response = await lambdaClient.send(new client_lambda_1.InvokeCommand({
        FunctionName: `evo-uds-${process.env.ENVIRONMENT || 'dev'}-${functionName}`,
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify(payload),
    }));
    if (response.Payload) {
        const result = JSON.parse(new TextDecoder().decode(response.Payload));
        return result;
    }
    return null;
}
//# sourceMappingURL=execute-scheduled-job.js.map