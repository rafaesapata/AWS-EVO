/**
 * Security Engine V3 - Lambda Scanner
 * Comprehensive Lambda security checks (12+ checks)
 */

import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
import { DEPRECATED_RUNTIMES, SENSITIVE_ENV_PATTERNS } from '../../config.js';
import {
  LambdaClient,
  ListFunctionsCommand,
  GetFunctionUrlConfigCommand,
  GetPolicyCommand,
} from '@aws-sdk/client-lambda';

export class LambdaScanner extends BaseScanner {
  get serviceName(): string {
    return 'Lambda';
  }

  get category(): string {
    return 'Serverless Security';
  }

  async scan(): Promise<Finding[]> {
    this.log('Starting Lambda security scan');
    const findings: Finding[] = [];

    const lambdaClient = await this.clientFactory.getLambdaClient(this.region);

    try {
      const functionsResponse = await lambdaClient.send(new ListFunctionsCommand({}));
      const functions = functionsResponse.Functions || [];

      for (const fn of functions) {
        if (!fn.FunctionName || !fn.FunctionArn) continue;

        const fnFindings = await this.scanFunction(lambdaClient, fn);
        findings.push(...fnFindings);
      }
    } catch (error) {
      this.warn('Failed to list Lambda functions', { error: (error as Error).message });
    }

    this.log('Lambda scan completed', { findingsCount: findings.length });
    return findings;
  }

  private async scanFunction(client: LambdaClient, fn: any): Promise<Finding[]> {
    const findings: Finding[] = [];
    const functionName = fn.FunctionName!;
    const functionArn = fn.FunctionArn!;

    // Check 1: Function URL without authentication
    await this.safeExecute('functionUrl', async () => {
      try {
        const urlConfig = await client.send(new GetFunctionUrlConfigCommand({ FunctionName: functionName }));
        
        if (urlConfig.AuthType === 'NONE') {
          findings.push(this.createFinding({
            severity: 'critical',
            title: `Lambda Function URL Public: ${functionName}`,
            description: `Function URL allows unauthenticated access`,
            analysis: 'CRITICAL RISK: Anyone on the internet can invoke this function via HTTP.',
            resource_id: functionName,
            resource_arn: functionArn,
            scan_type: 'lambda_public_function_url',
            category: 'Access Control',
            compliance: [
              this.cisCompliance('2.1', 'Ensure Lambda functions are not publicly accessible'),
              this.nistCompliance('AC-3', 'Access Enforcement'),
            ],
            remediation: {
              description: 'Enable IAM authentication for the function URL',
              steps: [
                'Go to Lambda Console',
                `Select function ${functionName}`,
                'Go to Configuration > Function URL',
                'Change Auth type to AWS_IAM',
              ],
              cli_command: `aws lambda update-function-url-config --function-name ${functionName} --auth-type AWS_IAM`,
              estimated_effort: 'trivial',
              automation_available: true,
            },
            evidence: { functionName, authType: urlConfig.AuthType, functionUrl: urlConfig.FunctionUrl },
            risk_vector: 'public_exposure',
            attack_vectors: ['Direct HTTP invocation', 'DDoS', 'Data exfiltration'],
          }));
        }
      } catch (e: any) {
        // No function URL configured - OK
        if (e.name !== 'ResourceNotFoundException') throw e;
      }
    }, null);


    // Check 2: No VPC configuration
    if (!fn.VpcConfig?.VpcId) {
      findings.push(this.createFinding({
        severity: 'medium',
        title: `Lambda Without VPC: ${functionName}`,
        description: `Function is not deployed in a VPC`,
        analysis: 'Functions accessing internal resources should be in a VPC for network isolation.',
        resource_id: functionName,
        resource_arn: functionArn,
        scan_type: 'lambda_no_vpc',
        category: 'Network Security',
        compliance: [this.wellArchitectedCompliance('SEC', 'Control traffic at all layers')],
        remediation: {
          description: 'Configure VPC for the function if it accesses internal resources',
          steps: [
            'Identify if function needs access to VPC resources',
            'If yes, configure VPC, subnets, and security groups',
            'Ensure NAT Gateway for internet access if needed',
          ],
          estimated_effort: 'medium',
          automation_available: true,
        },
        evidence: { functionName, vpcConfig: null },
        risk_vector: 'network_exposure',
      }));
    }

    // Check 3: Secrets in environment variables
    const envVars = fn.Environment?.Variables || {};
    const suspiciousVars: string[] = [];
    
    for (const key of Object.keys(envVars)) {
      if (SENSITIVE_ENV_PATTERNS.some(pattern => pattern.test(key))) {
        suspiciousVars.push(key);
      }
    }

    if (suspiciousVars.length > 0) {
      findings.push(this.createFinding({
        severity: 'high',
        title: `Lambda With Secrets in Env Vars: ${functionName}`,
        description: `Potentially sensitive variables detected: ${suspiciousVars.join(', ')}`,
        analysis: 'HIGH RISK: Secrets in environment variables can be exposed in logs and console.',
        resource_id: functionName,
        resource_arn: functionArn,
        scan_type: 'lambda_secrets_in_env',
        category: 'Secrets Management',
        compliance: [
          this.cisCompliance('2.2', 'Ensure secrets are not stored in Lambda environment variables'),
          this.soc2Compliance('CC6.1', 'Logical and physical access controls'),
        ],
        remediation: {
          description: 'Move secrets to AWS Secrets Manager or Parameter Store',
          steps: [
            'Create secrets in AWS Secrets Manager',
            'Update Lambda code to fetch secrets at runtime',
            'Remove secrets from environment variables',
            'Grant Lambda role access to secrets',
          ],
          estimated_effort: 'medium',
          automation_available: false,
        },
        evidence: { functionName, suspiciousVariables: suspiciousVars },
        risk_vector: 'credential_exposure',
        attack_vectors: ['Log analysis', 'Console access', 'Memory dump'],
      }));
    }

    // Check 4: Deprecated runtime
    if (fn.Runtime && DEPRECATED_RUNTIMES.includes(fn.Runtime)) {
      findings.push(this.createFinding({
        severity: 'high',
        title: `Lambda With Deprecated Runtime: ${functionName}`,
        description: `Runtime ${fn.Runtime} is deprecated and no longer receives security updates`,
        analysis: 'HIGH RISK: Deprecated runtimes may have known vulnerabilities.',
        resource_id: functionName,
        resource_arn: functionArn,
        scan_type: 'lambda_deprecated_runtime',
        category: 'Vulnerability Management',
        compliance: [
          this.nistCompliance('SI-2', 'Flaw Remediation'),
          this.pciCompliance('6.2', 'Ensure all system components are protected from known vulnerabilities'),
        ],
        remediation: {
          description: 'Update to a supported runtime version',
          steps: [
            'Review AWS Lambda runtime support policy',
            'Test function with newer runtime version',
            'Update function configuration',
            'Deploy and verify functionality',
          ],
          estimated_effort: 'medium',
          automation_available: false,
        },
        evidence: { functionName, runtime: fn.Runtime },
        risk_vector: 'outdated_software',
      }));
    }

    // Check 5: No Dead Letter Queue
    if (!fn.DeadLetterConfig?.TargetArn) {
      findings.push(this.createFinding({
        severity: 'low',
        title: `Lambda Without DLQ: ${functionName}`,
        description: `Function does not have a Dead Letter Queue configured`,
        analysis: 'Failed async invocations will be lost without a DLQ.',
        resource_id: functionName,
        resource_arn: functionArn,
        scan_type: 'lambda_no_dlq',
        category: 'Reliability',
        compliance: [this.wellArchitectedCompliance('REL', 'Design for failure')],
        evidence: { functionName },
        risk_vector: 'data_loss',
      }));
    }

    // Check 6: No X-Ray tracing
    if (fn.TracingConfig?.Mode !== 'Active') {
      findings.push(this.createFinding({
        severity: 'low',
        title: `Lambda Without X-Ray Tracing: ${functionName}`,
        description: `X-Ray tracing is not enabled`,
        analysis: 'X-Ray helps with debugging and security analysis.',
        resource_id: functionName,
        resource_arn: functionArn,
        scan_type: 'lambda_no_xray',
        category: 'Logging & Monitoring',
        compliance: [this.wellArchitectedCompliance('OPS', 'Implement observability')],
        evidence: { functionName, tracingMode: fn.TracingConfig?.Mode },
        risk_vector: 'no_audit_trail',
      }));
    }

    // Check 7: High memory/timeout (potential abuse)
    if ((fn.MemorySize || 0) >= 3008 && (fn.Timeout || 0) >= 300) {
      findings.push(this.createFinding({
        severity: 'low',
        title: `Lambda With High Resources: ${functionName}`,
        description: `Function has high memory (${fn.MemorySize}MB) and timeout (${fn.Timeout}s)`,
        analysis: 'High resource functions can be expensive if abused. Ensure this is intentional.',
        resource_id: functionName,
        resource_arn: functionArn,
        scan_type: 'lambda_high_resources',
        category: 'Cost Optimization',
        compliance: [this.wellArchitectedCompliance('COST', 'Implement cloud financial management')],
        evidence: { functionName, memorySize: fn.MemorySize, timeout: fn.Timeout },
        risk_vector: 'availability',
      }));
    }

    // Check 8: Resource-based policy analysis
    await this.safeExecute('resourcePolicy', async () => {
      try {
        const policyResponse = await client.send(new GetPolicyCommand({ FunctionName: functionName }));
        
        if (policyResponse.Policy) {
          const policy = JSON.parse(policyResponse.Policy);
          
          for (const statement of policy.Statement || []) {
            // Check for overly permissive principal
            if (statement.Principal === '*' && !statement.Condition) {
              findings.push(this.createFinding({
                severity: 'high',
                title: `Lambda With Public Resource Policy: ${functionName}`,
                description: `Resource policy allows invocation from any principal`,
                analysis: 'HIGH RISK: Any AWS account can invoke this function.',
                resource_id: functionName,
                resource_arn: functionArn,
                scan_type: 'lambda_public_policy',
                category: 'Access Control',
                compliance: [this.nistCompliance('AC-3', 'Access Enforcement')],
                evidence: { functionName, policy },
                risk_vector: 'public_exposure',
              }));
            }
          }
        }
      } catch (e: any) {
        // No resource policy - OK
        if (e.name !== 'ResourceNotFoundException') throw e;
      }
    }, null);

    // Check 9: Reserved concurrency not set (potential DoS)
    if (fn.ReservedConcurrentExecutions === undefined) {
      findings.push(this.createFinding({
        severity: 'low',
        title: `Lambda Without Reserved Concurrency: ${functionName}`,
        description: `Function does not have reserved concurrency configured`,
        analysis: 'Without reserved concurrency, function may be throttled or consume all account concurrency.',
        resource_id: functionName,
        resource_arn: functionArn,
        scan_type: 'lambda_no_reserved_concurrency',
        category: 'Reliability',
        compliance: [this.wellArchitectedCompliance('REL', 'Manage service quotas and constraints')],
        evidence: { functionName },
        risk_vector: 'availability',
      }));
    }

    return findings;
  }
}

export async function scanLambda(
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
): Promise<Finding[]> {
  const scanner = new LambdaScanner(region, accountId, credentials, cache);
  return scanner.scan();
}
