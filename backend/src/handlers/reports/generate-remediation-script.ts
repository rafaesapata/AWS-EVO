import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Generate Remediation Script
 * AWS Lambda Handler for generate-remediation-script
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

// Zod schema for generate remediation script
const generateRemediationSchema = z.object({
  findingId: z.string().uuid('Invalid finding ID format'),
});

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Generate Remediation Script started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    // Validate input with Zod
    const validation = parseAndValidateBody(generateRemediationSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { findingId } = validation.data;
    
    const prisma = getPrismaClient();
    
    const finding = await prisma.finding.findFirst({
      where: {
        id: findingId,
        organization_id: organizationId,
      },
    });
    
    if (!finding) {
      return error('Finding not found');
    }
    
    // Gerar script baseado no tipo de finding
    const script = generateScript(finding);
    
    logger.info(`✅ Generated remediation script for finding ${findingId}`);
    
    return success({
      success: true,
      script,
      finding: {
        id: finding.id,
        title: finding.description,
        severity: finding.severity,
      },
    });
    
  } catch (err) {
    logger.error('❌ Generate Remediation Script error:', err);
    return error('An unexpected error occurred. Please try again.', 500);
  }
}

function generateScript(finding: any): string {
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
