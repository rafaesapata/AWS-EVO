/**
 * Lambda handler for Cleanup Expired External IDs
 * AWS Lambda Handler for cleanup-expired-external-ids
 *
 * SECURITY NOTE: This handler intentionally does NOT filter by organization_id.
 * This is by design because:
 *
 * 1. External IDs are temporary, globally unique identifiers used for AWS STS AssumeRole
 * 2. They are created during the AWS account connection flow and expire after 30 days
 * 3. Each External ID is cryptographically random and cannot be guessed
 * 4. The cleanup is a system-level maintenance task triggered by EventBridge
 * 5. No sensitive data is exposed - only expired, unused IDs are deleted
 *
 * The External ID pattern follows AWS best practices for cross-account access:
 * https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-user_externalid.html
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=cleanup-expired-external-ids.d.ts.map