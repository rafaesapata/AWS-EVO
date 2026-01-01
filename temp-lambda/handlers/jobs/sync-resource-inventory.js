"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const aws_helpers_js_1 = require("../../lib/aws-helpers.js");
const client_ec2_1 = require("@aws-sdk/client-ec2");
async function handler(event, context) {
    logging_js_1.logger.info('🚀 Sync Resource Inventory started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountId, region: requestedRegion } = body;
        if (!accountId) {
            return (0, response_js_1.error)('Missing required parameter: accountId');
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        const account = await prisma.awsCredential.findFirst({
            where: { id: accountId, organization_id: organizationId, is_active: true },
        });
        if (!account) {
            return (0, response_js_1.error)('AWS account not found');
        }
        // Usar região solicitada, ou primeira região da conta, ou padrão
        const accountRegions = account.regions;
        const region = requestedRegion ||
            (accountRegions && accountRegions.length > 0 ? accountRegions[0] : 'us-east-1');
        const resolvedCreds = await (0, aws_helpers_js_1.resolveAwsCredentials)(account, region);
        const ec2Client = new client_ec2_1.EC2Client({
            region,
            credentials: (0, aws_helpers_js_1.toAwsCredentials)(resolvedCreds),
        });
        const response = await ec2Client.send(new client_ec2_1.DescribeInstancesCommand({}));
        let syncedCount = 0;
        if (response.Reservations) {
            for (const reservation of response.Reservations) {
                if (reservation.Instances) {
                    for (const instance of reservation.Instances) {
                        await prisma.resourceInventory.upsert({
                            where: {
                                aws_account_id_resource_id_region: {
                                    aws_account_id: accountId,
                                    resource_id: instance.InstanceId,
                                    region,
                                },
                            },
                            update: {
                                resource_name: instance.Tags?.find(t => t.Key === 'Name')?.Value,
                                metadata: {
                                    instanceType: instance.InstanceType,
                                    state: instance.State?.Name,
                                }
                            },
                            create: {
                                organization_id: organizationId,
                                aws_account_id: accountId,
                                resource_id: instance.InstanceId,
                                resource_type: 'EC2::Instance',
                                resource_name: instance.Tags?.find(t => t.Key === 'Name')?.Value,
                                region,
                                metadata: {
                                    instanceType: instance.InstanceType,
                                    state: instance.State?.Name,
                                }
                            },
                        });
                        syncedCount++;
                    }
                }
            }
        }
        logging_js_1.logger.info(`✅ Synced ${syncedCount} resources`);
        return (0, response_js_1.success)({
            success: true,
            syncedCount,
            region,
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ Sync Resource Inventory error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=sync-resource-inventory.js.map