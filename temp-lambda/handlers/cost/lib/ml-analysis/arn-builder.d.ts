/**
 * ARN Builder Module for ML Waste Detection
 *
 * Builds Amazon Resource Names (ARNs) for all supported AWS services.
 * ARN format: arn:partition:service:region:account-id:resource-type/resource-id
 *
 * @module ml-analysis/arn-builder
 */
export interface ArnComponents {
    partition: string;
    service: string;
    region: string;
    accountId: string;
    resourceType?: string;
    resourceId: string;
}
/**
 * Build ARN for a resource
 *
 * @param service - AWS service name (e.g., 'ec2', 'rds', 'lambda')
 * @param region - AWS region (e.g., 'us-east-1')
 * @param accountId - 12-digit AWS account ID
 * @param resourceType - Resource type (e.g., 'instance', 'db', 'function')
 * @param resourceId - Resource identifier
 * @returns Full ARN string
 */
export declare function buildResourceArn(service: string, region: string, accountId: string, resourceType: string, resourceId: string): string;
/**
 * Parse ARN into components
 *
 * @param arn - Full ARN string
 * @returns Parsed ARN components or null if invalid
 */
export declare function parseArn(arn: string): ArnComponents | null;
/**
 * Generate AWS Console URL from ARN
 *
 * @param arn - Full ARN string
 * @returns AWS Console URL or null if not supported
 */
export declare function getConsoleUrlFromArn(arn: string): string | null;
/**
 * Get service name from resource type
 *
 * @param resourceType - Full resource type (e.g., 'EC2::Instance', 'RDS::DBInstance')
 * @returns Service code for ARN building
 */
export declare function getServiceFromResourceType(resourceType: string): {
    service: string;
    type: string;
};
//# sourceMappingURL=arn-builder.d.ts.map