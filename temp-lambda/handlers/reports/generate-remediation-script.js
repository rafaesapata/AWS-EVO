"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
async function handler(event, context) {
    logging_js_1.logger.info('🚀 Generate Remediation Script started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { findingId } = body;
        if (!findingId) {
            return (0, response_js_1.error)('Missing required parameter: findingId');
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        const finding = await prisma.finding.findFirst({
            where: {
                id: findingId,
                organization_id: organizationId,
            },
        });
        if (!finding) {
            return (0, response_js_1.error)('Finding not found');
        }
        // Gerar script baseado no tipo de finding
        const script = generateScript(finding);
        logging_js_1.logger.info(`✅ Generated remediation script for finding ${findingId}`);
        return (0, response_js_1.success)({
            success: true,
            script,
            finding: {
                id: finding.id,
                title: finding.description,
                severity: finding.severity,
            },
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ Generate Remediation Script error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
function generateScript(finding) {
    const category = finding.category || 'general';
    switch (category) {
        case 's3_public':
            return `#!/bin/bash
# Remediation script for S3 public bucket
aws s3api put-public-access-block \\
  --bucket ${finding.resourceId} \\
  --public-access-block-configuration \\
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
`;
        case 'security_group':
            return `#!/bin/bash
# Remediation script for security group
aws ec2 revoke-security-group-ingress \\
  --group-id ${finding.resourceId} \\
  --ip-permissions IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges='[{CidrIp=0.0.0.0/0}]'
`;
        default:
            return `#!/bin/bash
# Remediation script for ${finding.description}
# Resource: ${finding.resourceId}
# Severity: ${finding.severity}

echo "Manual remediation required"
echo "Please review the finding and take appropriate action"
`;
    }
}
//# sourceMappingURL=generate-remediation-script.js.map