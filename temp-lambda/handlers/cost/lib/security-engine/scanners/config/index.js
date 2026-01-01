"use strict";
/**
 * Security Engine V2 - AWS Config Scanner
 * Checks: recording enabled, S3 bucket security, conformance packs, aggregators
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigScanner = void 0;
exports.scanConfig = scanConfig;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_config_service_1 = require("@aws-sdk/client-config-service");
class ConfigScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'Config'; }
    get category() { return 'Governance'; }
    async scan() {
        this.log('Starting AWS Config security scan');
        const findings = [];
        const client = await this.clientFactory.getConfigClient(this.region);
        try {
            // Check 1: Configuration recorder not enabled
            const recorders = await client.send(new client_config_service_1.DescribeConfigurationRecordersCommand({}));
            if (!recorders.ConfigurationRecorders?.length) {
                findings.push(this.createFinding({
                    severity: 'high',
                    title: `AWS Config Not Enabled: ${this.region}`,
                    description: `AWS Config is not enabled in region ${this.region}`,
                    analysis: 'HIGH RISK: Without AWS Config, you cannot track resource configurations or compliance.',
                    resource_id: `config-${this.region}`,
                    resource_arn: `arn:aws:config:${this.region}:${this.accountId}:config-recorder`,
                    scan_type: 'config_not_enabled',
                    compliance: [
                        this.cisCompliance('3.5', 'Ensure AWS Config is enabled'),
                        this.nistCompliance('CM-8', 'Information System Component Inventory'),
                    ],
                    remediation: {
                        description: 'Enable AWS Config to track resource configurations',
                        steps: ['Go to AWS Config console', 'Set up AWS Config', 'Configure recording settings'],
                        estimated_effort: 'medium',
                        automation_available: true,
                    },
                    evidence: { region: this.region, hasRecorder: false },
                    risk_vector: 'compliance_gap',
                }));
            }
            else {
                // Check recorder status
                const status = await client.send(new client_config_service_1.DescribeConfigurationRecorderStatusCommand({}));
                for (const recorderStatus of status.ConfigurationRecordersStatus || []) {
                    if (!recorderStatus.recording) {
                        findings.push(this.createFinding({
                            severity: 'high',
                            title: `AWS Config Recording Stopped: ${recorderStatus.name}`,
                            description: `Configuration recorder ${recorderStatus.name} is not recording`,
                            analysis: 'HIGH RISK: Configuration changes are not being tracked.',
                            resource_id: recorderStatus.name,
                            resource_arn: `arn:aws:config:${this.region}:${this.accountId}:config-recorder/${recorderStatus.name}`,
                            scan_type: 'config_not_recording',
                            compliance: [
                                this.cisCompliance('3.5', 'Ensure AWS Config is enabled'),
                            ],
                            remediation: {
                                description: 'Start the configuration recorder',
                                steps: ['Go to AWS Config console', 'Start recording'],
                                cli_command: `aws configservice start-configuration-recorder --configuration-recorder-name ${recorderStatus.name}`,
                                estimated_effort: 'trivial',
                                automation_available: true,
                            },
                            evidence: { recorderName: recorderStatus.name, recording: false, lastStatus: recorderStatus.lastStatus },
                            risk_vector: 'compliance_gap',
                        }));
                    }
                }
                // Check if recording all resources
                for (const recorder of recorders.ConfigurationRecorders || []) {
                    if (!recorder.recordingGroup?.allSupported) {
                        findings.push(this.createFinding({
                            severity: 'medium',
                            title: `AWS Config Not Recording All Resources: ${recorder.name}`,
                            description: `Configuration recorder ${recorder.name} is not recording all resource types`,
                            analysis: 'Some resource types may not be tracked for compliance.',
                            resource_id: recorder.name,
                            resource_arn: `arn:aws:config:${this.region}:${this.accountId}:config-recorder/${recorder.name}`,
                            scan_type: 'config_partial_recording',
                            compliance: [
                                this.cisCompliance('3.5', 'Ensure AWS Config is enabled'),
                            ],
                            evidence: { recorderName: recorder.name, allSupported: recorder.recordingGroup?.allSupported },
                            risk_vector: 'compliance_gap',
                        }));
                    }
                    if (!recorder.recordingGroup?.includeGlobalResourceTypes) {
                        findings.push(this.createFinding({
                            severity: 'medium',
                            title: `AWS Config Not Recording Global Resources: ${recorder.name}`,
                            description: `Configuration recorder ${recorder.name} is not recording global resources (IAM, etc.)`,
                            analysis: 'Global resources like IAM are not being tracked.',
                            resource_id: recorder.name,
                            resource_arn: `arn:aws:config:${this.region}:${this.accountId}:config-recorder/${recorder.name}`,
                            scan_type: 'config_no_global_resources',
                            compliance: [
                                this.cisCompliance('3.5', 'Ensure AWS Config is enabled'),
                            ],
                            evidence: { recorderName: recorder.name, includeGlobalResourceTypes: false },
                            risk_vector: 'compliance_gap',
                        }));
                    }
                }
            }
            // Check 2: Delivery channel configuration
            await this.safeExecute('delivery-channels', async () => {
                const channels = await client.send(new client_config_service_1.DescribeDeliveryChannelsCommand({}));
                if (!channels.DeliveryChannels?.length) {
                    findings.push(this.createFinding({
                        severity: 'high',
                        title: `AWS Config No Delivery Channel: ${this.region}`,
                        description: `No delivery channel configured for AWS Config in ${this.region}`,
                        analysis: 'Configuration snapshots and history cannot be delivered without a delivery channel.',
                        resource_id: `config-delivery-${this.region}`,
                        resource_arn: `arn:aws:config:${this.region}:${this.accountId}:delivery-channel`,
                        scan_type: 'config_no_delivery_channel',
                        evidence: { region: this.region, hasDeliveryChannel: false },
                        risk_vector: 'compliance_gap',
                    }));
                }
            }, null);
            // Check 3: No conformance packs
            await this.safeExecute('conformance-packs', async () => {
                const conformancePacks = await client.send(new client_config_service_1.DescribeConformancePacksCommand({}));
                if (!conformancePacks.ConformancePackDetails?.length) {
                    findings.push(this.createFinding({
                        severity: 'low',
                        title: `AWS Config No Conformance Packs: ${this.region}`,
                        description: `No conformance packs deployed in ${this.region}`,
                        analysis: 'Conformance packs provide pre-built compliance rules for common frameworks.',
                        resource_id: `config-conformance-${this.region}`,
                        resource_arn: `arn:aws:config:${this.region}:${this.accountId}:conformance-pack`,
                        scan_type: 'config_no_conformance_packs',
                        compliance: [
                            this.wellArchitectedCompliance('SEC', 'Operate Workloads Securely'),
                        ],
                        evidence: { region: this.region, conformancePackCount: 0 },
                        risk_vector: 'compliance_gap',
                    }));
                }
            }, null);
            // Check 4: Compliance summary
            await this.safeExecute('compliance-summary', async () => {
                const compliance = await client.send(new client_config_service_1.GetComplianceSummaryByConfigRuleCommand({}));
                const nonCompliant = compliance.ComplianceSummary?.NonCompliantResourceCount?.CappedCount || 0;
                if (nonCompliant > 0) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `AWS Config Non-Compliant Resources: ${this.region}`,
                        description: `${nonCompliant} resources are non-compliant with Config rules`,
                        analysis: 'Non-compliant resources may pose security or operational risks.',
                        resource_id: `config-compliance-${this.region}`,
                        resource_arn: `arn:aws:config:${this.region}:${this.accountId}:compliance`,
                        scan_type: 'config_non_compliant_resources',
                        evidence: { region: this.region, nonCompliantCount: nonCompliant },
                        risk_vector: 'compliance_gap',
                    }));
                }
            }, null);
        }
        catch (error) {
            this.warn('Config scan failed', { error: error.message });
        }
        this.log('AWS Config scan completed', { findingsCount: findings.length });
        return findings;
    }
}
exports.ConfigScanner = ConfigScanner;
async function scanConfig(region, accountId, credentials, cache) {
    const scanner = new ConfigScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map