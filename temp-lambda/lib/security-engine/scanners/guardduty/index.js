"use strict";
/**
 * Security Engine V3 - GuardDuty Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuardDutyScanner = void 0;
exports.scanGuardDuty = scanGuardDuty;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_guardduty_1 = require("@aws-sdk/client-guardduty");
class GuardDutyScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'GuardDuty'; }
    get category() { return 'Logging & Monitoring'; }
    async scan() {
        this.log('Starting GuardDuty security scan');
        const findings = [];
        const client = await this.clientFactory.getGuardDutyClient(this.region);
        try {
            const detectorsResponse = await client.send(new client_guardduty_1.ListDetectorsCommand({}));
            const detectorIds = detectorsResponse.DetectorIds || [];
            if (detectorIds.length === 0) {
                findings.push(this.createFinding({
                    severity: 'high',
                    title: 'GuardDuty Not Enabled',
                    description: 'GuardDuty is not enabled in this region',
                    analysis: 'HIGH RISK: No threat detection for malicious activity.',
                    resource_id: 'guardduty',
                    resource_arn: `arn:aws:guardduty:${this.region}:${this.accountId}:detector/*`,
                    scan_type: 'guardduty_not_enabled',
                    compliance: [
                        this.cisCompliance('4.1', 'Ensure GuardDuty is enabled'),
                        this.nistCompliance('SI-4', 'Information System Monitoring'),
                    ],
                    remediation: {
                        description: 'Enable GuardDuty',
                        steps: ['Go to GuardDuty Console', 'Click Get Started', 'Enable GuardDuty'],
                        cli_command: 'aws guardduty create-detector --enable',
                        estimated_effort: 'trivial',
                        automation_available: true,
                    },
                    evidence: { detectorCount: 0 },
                    risk_vector: 'no_audit_trail',
                }));
                return findings;
            }
            for (const detectorId of detectorIds) {
                const detectorFindings = await this.checkDetector(client, detectorId);
                findings.push(...detectorFindings);
            }
        }
        catch (error) {
            this.warn('Failed to list detectors', { error: error.message });
        }
        this.log('GuardDuty scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkDetector(client, detectorId) {
        const findings = [];
        const detectorArn = this.arnBuilder.guardDutyDetector(this.region, detectorId);
        try {
            const detector = await client.send(new client_guardduty_1.GetDetectorCommand({ DetectorId: detectorId }));
            if (detector.Status !== 'ENABLED') {
                findings.push(this.createFinding({
                    severity: 'high',
                    title: `GuardDuty Detector Disabled: ${detectorId}`,
                    description: 'GuardDuty detector is not enabled',
                    analysis: 'HIGH RISK: Threat detection is not active.',
                    resource_id: detectorId,
                    resource_arn: detectorArn,
                    scan_type: 'guardduty_detector_disabled',
                    compliance: [this.cisCompliance('4.1', 'Ensure GuardDuty is enabled')],
                    evidence: { detectorId, status: detector.Status },
                    risk_vector: 'no_audit_trail',
                }));
            }
            const features = detector.Features || [];
            const s3Protection = features.find(f => f.Name === 'S3_DATA_EVENTS');
            if (!s3Protection || s3Protection.Status !== 'ENABLED') {
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: `GuardDuty S3 Protection Disabled: ${detectorId}`,
                    description: 'S3 data event monitoring is not enabled',
                    analysis: 'S3 threats may not be detected.',
                    resource_id: detectorId,
                    resource_arn: detectorArn,
                    scan_type: 'guardduty_no_s3_protection',
                    compliance: [this.wellArchitectedCompliance('SEC', 'Protect data at rest')],
                    evidence: { detectorId },
                    risk_vector: 'data_exposure',
                }));
            }
            const eksProtection = features.find(f => f.Name === 'EKS_AUDIT_LOGS');
            if (!eksProtection || eksProtection.Status !== 'ENABLED') {
                findings.push(this.createFinding({
                    severity: 'low',
                    title: `GuardDuty EKS Protection Disabled: ${detectorId}`,
                    description: 'EKS audit log monitoring is not enabled',
                    analysis: 'EKS threats may not be detected.',
                    resource_id: detectorId,
                    resource_arn: detectorArn,
                    scan_type: 'guardduty_no_eks_protection',
                    compliance: [this.wellArchitectedCompliance('SEC', 'Implement security monitoring')],
                    evidence: { detectorId },
                    risk_vector: 'no_audit_trail',
                }));
            }
        }
        catch (error) {
            this.warn(`Failed to get detector ${detectorId}`, { error: error.message });
        }
        return findings;
    }
}
exports.GuardDutyScanner = GuardDutyScanner;
async function scanGuardDuty(region, accountId, credentials, cache) {
    const scanner = new GuardDutyScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map