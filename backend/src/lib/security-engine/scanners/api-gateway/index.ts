/**
 * Security Engine V3 - API Gateway Scanner
 */

import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
import {
  APIGatewayClient,
  GetRestApisCommand,
  GetStagesCommand,
  GetMethodCommand,
  GetResourcesCommand,
} from '@aws-sdk/client-api-gateway';

export class APIGatewayScanner extends BaseScanner {
  get serviceName(): string { return 'APIGateway'; }
  get category(): string { return 'API Security'; }

  async scan(): Promise<Finding[]> {
    this.log('Starting API Gateway security scan');
    const findings: Finding[] = [];
    const client = await this.clientFactory.getAPIGatewayClient(this.region);

    try {
      const response = await client.send(new GetRestApisCommand({}));
      for (const api of response.items || []) {
        if (!api.id || !api.name) continue;
        const apiFindings = await this.checkAPI(client, api);
        findings.push(...apiFindings);
      }
    } catch (error) {
      this.warn('Failed to list REST APIs', { error: (error as Error).message });
    }

    this.log('API Gateway scan completed', { findingsCount: findings.length });
    return findings;
  }

  private async checkAPI(client: APIGatewayClient, api: any): Promise<Finding[]> {
    const findings: Finding[] = [];
    const apiId = api.id;
    const apiName = api.name;
    const apiArn = this.arnBuilder.apiGatewayRestApi(this.region, apiId);

    try {
      const stages = await client.send(new GetStagesCommand({ restApiId: apiId }));
      
      for (const stage of stages.item || []) {
        const stageName = stage.stageName || 'unknown';

        if (!stage.accessLogSettings?.destinationArn) {
          findings.push(this.createFinding({
            severity: 'medium',
            title: `API Gateway No Access Logging: ${apiName}/${stageName}`,
            description: 'Stage does not have access logging enabled',
            analysis: 'Access logs are essential for security monitoring.',
            resource_id: `${apiId}/${stageName}`,
            resource_arn: this.arnBuilder.apiGatewayStage(this.region, apiId, stageName),
            scan_type: 'apigateway_no_access_logs',
            compliance: [
              this.cisCompliance('3.1', 'Ensure logging is enabled'),
              this.pciCompliance('10.1', 'Implement audit trails'),
            ],
            evidence: { apiId, apiName, stageName },
            risk_vector: 'no_audit_trail',
          }));
        }

        if (!stage.tracingEnabled) {
          findings.push(this.createFinding({
            severity: 'low',
            title: `API Gateway X-Ray Disabled: ${apiName}/${stageName}`,
            description: 'X-Ray tracing is not enabled',
            analysis: 'X-Ray helps with debugging and performance analysis.',
            resource_id: `${apiId}/${stageName}`,
            resource_arn: this.arnBuilder.apiGatewayStage(this.region, apiId, stageName),
            scan_type: 'apigateway_no_xray',
            compliance: [this.wellArchitectedCompliance('OPS', 'Implement observability')],
            evidence: { apiId, apiName, stageName },
            risk_vector: 'no_audit_trail',
          }));
        }

        if (!stage.cacheClusterEnabled && stage.methodSettings) {
          const hasThrottling = Object.values(stage.methodSettings).some(
            (s: any) => s.throttlingBurstLimit || s.throttlingRateLimit
          );
          if (!hasThrottling) {
            findings.push(this.createFinding({
              severity: 'medium',
              title: `API Gateway No Throttling: ${apiName}/${stageName}`,
              description: 'Stage does not have throttling configured',
              analysis: 'Without throttling, API is vulnerable to abuse.',
              resource_id: `${apiId}/${stageName}`,
              resource_arn: this.arnBuilder.apiGatewayStage(this.region, apiId, stageName),
              scan_type: 'apigateway_no_throttling',
              compliance: [this.wellArchitectedCompliance('SEC', 'Protect networks')],
              evidence: { apiId, apiName, stageName },
              risk_vector: 'availability',
            }));
          }
        }

        if (!stage.webAclArn) {
          findings.push(this.createFinding({
            severity: 'medium',
            title: `API Gateway No WAF: ${apiName}/${stageName}`,
            description: 'Stage is not protected by WAF',
            analysis: 'WAF provides protection against common web attacks.',
            resource_id: `${apiId}/${stageName}`,
            resource_arn: this.arnBuilder.apiGatewayStage(this.region, apiId, stageName),
            scan_type: 'apigateway_no_waf',
            compliance: [this.wellArchitectedCompliance('SEC', 'Protect networks')],
            evidence: { apiId, apiName, stageName },
            risk_vector: 'network_exposure',
          }));
        }
      }
    } catch (error) {
      this.warn(`Failed to get stages for ${apiName}`, { error: (error as Error).message });
    }

    if (api.endpointConfiguration?.types?.includes('EDGE')) {
      findings.push(this.createFinding({
        severity: 'info',
        title: `API Gateway Using Edge Endpoint: ${apiName}`,
        description: 'API uses edge-optimized endpoint',
        analysis: 'Consider regional endpoint for better latency control.',
        resource_id: apiId,
        resource_arn: apiArn,
        scan_type: 'apigateway_edge_endpoint',
        compliance: [this.wellArchitectedCompliance('PERF', 'Select appropriate resources')],
        evidence: { apiId, apiName, endpointType: 'EDGE' },
        risk_vector: 'availability',
      }));
    }

    return findings;
  }
}

export async function scanAPIGateway(
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
): Promise<Finding[]> {
  const scanner = new APIGatewayScanner(region, accountId, credentials, cache);
  return scanner.scan();
}
