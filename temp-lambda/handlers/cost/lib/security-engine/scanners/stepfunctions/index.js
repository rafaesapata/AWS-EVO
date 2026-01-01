"use strict";
/**
 * Security Engine V2 - Step Functions Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StepFunctionsScanner = void 0;
exports.scanStepFunctions = scanStepFunctions;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_sfn_1 = require("@aws-sdk/client-sfn");
class StepFunctionsScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'StepFunctions'; }
    get category() { return 'Compute'; }
    async scan() {
        this.log('Starting Step Functions security scan');
        const findings = [];
        const client = await this.clientFactory.getStepFunctionsClient(this.region);
        try {
            const stateMachines = await client.send(new client_sfn_1.ListStateMachinesCommand({}));
            for (const sm of stateMachines.stateMachines || []) {
                if (!sm.stateMachineArn || !sm.name)
                    continue;
                const smName = sm.name;
                const smArn = sm.stateMachineArn;
                await this.safeExecute(`sm-${smName}`, async () => {
                    const details = await client.send(new client_sfn_1.DescribeStateMachineCommand({
                        stateMachineArn: smArn
                    }));
                    // Check 1: No logging configured
                    if (!details.loggingConfiguration?.level || details.loggingConfiguration.level === 'OFF') {
                        findings.push(this.createFinding({
                            severity: 'medium',
                            title: `Step Functions No Logging: ${smName}`,
                            description: `State machine ${smName} does not have logging enabled`,
                            analysis: 'Without logging, you cannot audit workflow executions.',
                            resource_id: smName,
                            resource_arn: smArn,
                            scan_type: 'stepfunctions_no_logging',
                            compliance: [
                                this.cisCompliance('3.1', 'Enable Logging'),
                                this.pciCompliance('10.1', 'Implement audit trails'),
                            ],
                            remediation: {
                                description: 'Enable logging for the state machine',
                                steps: ['Go to Step Functions console', 'Edit state machine', 'Enable logging'],
                                estimated_effort: 'low',
                                automation_available: true,
                            },
                            evidence: { stateMachineName: smName, loggingLevel: details.loggingConfiguration?.level },
                            risk_vector: 'audit_gap',
                        }));
                    }
                    // Check 2: No X-Ray tracing
                    if (!details.tracingConfiguration?.enabled) {
                        findings.push(this.createFinding({
                            severity: 'low',
                            title: `Step Functions No Tracing: ${smName}`,
                            description: `State machine ${smName} does not have X-Ray tracing enabled`,
                            analysis: 'X-Ray tracing helps debug and analyze workflow performance.',
                            resource_id: smName,
                            resource_arn: smArn,
                            scan_type: 'stepfunctions_no_tracing',
                            compliance: [this.wellArchitectedCompliance('OPS', 'Understand Workload Health')],
                            evidence: { stateMachineName: smName, tracingEnabled: false },
                            risk_vector: 'observability',
                        }));
                    }
                    // Check 3: Using EXPRESS type
                    if (sm.type === 'EXPRESS') {
                        findings.push(this.createFinding({
                            severity: 'info',
                            title: `Step Functions Express Workflow: ${smName}`,
                            description: `State machine ${smName} is an Express workflow`,
                            analysis: 'Express workflows have different durability guarantees than Standard.',
                            resource_id: smName,
                            resource_arn: smArn,
                            scan_type: 'stepfunctions_express_type',
                            evidence: { stateMachineName: smName, type: sm.type },
                            risk_vector: 'configuration',
                        }));
                    }
                }, null);
            }
        }
        catch (error) {
            this.warn('Step Functions scan failed', { error: error.message });
        }
        this.log('Step Functions scan completed', { findingsCount: findings.length });
        return findings;
    }
}
exports.StepFunctionsScanner = StepFunctionsScanner;
async function scanStepFunctions(region, accountId, credentials, cache) {
    const scanner = new StepFunctionsScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map