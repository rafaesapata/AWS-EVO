"use strict";
/**
 * Security Engine V2 - Macie Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MacieScanner = void 0;
exports.scanMacie = scanMacie;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_macie2_1 = require("@aws-sdk/client-macie2");
class MacieScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'Macie'; }
    get category() { return 'Data Security'; }
    async scan() {
        this.log('Starting Macie security scan');
        const findings = [];
        const client = await this.clientFactory.getMacieClient(this.region);
        try {
            // Check 1: Macie enabled status
            const session = await client.send(new client_macie2_1.GetMacieSessionCommand({}));
            if (session.status !== 'ENABLED') {
                findings.push(this.createFinding({
                    severity: 'high',
                    title: `Macie Not Enabled: ${this.region}`,
                    description: `Amazon Macie is not enabled in ${this.region}`,
                    analysis: 'HIGH RISK: Sensitive data discovery is not active.',
                    resource_id: `macie-${this.region}`,
                    resource_arn: `arn:aws:macie2:${this.region}:${this.accountId}:`,
                    scan_type: 'macie_not_enabled',
                    compliance: [
                        this.pciCompliance('3.1', 'Keep cardholder data storage to a minimum'),
                        this.lgpdCompliance('Art.46', 'Security Measures'),
                        this.nistCompliance('RA-5', 'Vulnerability Scanning'),
                    ],
                    remediation: {
                        description: 'Enable Amazon Macie for sensitive data discovery',
                        steps: ['Go to Macie console', 'Enable Macie', 'Configure S3 buckets to scan'],
                        estimated_effort: 'low',
                        automation_available: true,
                    },
                    evidence: { region: this.region, status: session.status },
                    risk_vector: 'data_exposure',
                }));
                return findings;
            }
            // Check 2: No classification jobs
            await this.safeExecute('classification-jobs', async () => {
                const jobs = await client.send(new client_macie2_1.ListClassificationJobsCommand({}));
                if (!jobs.items?.length) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `Macie No Classification Jobs: ${this.region}`,
                        description: `No Macie classification jobs configured in ${this.region}`,
                        analysis: 'S3 buckets are not being scanned for sensitive data.',
                        resource_id: `macie-jobs-${this.region}`,
                        resource_arn: `arn:aws:macie2:${this.region}:${this.accountId}:classification-job`,
                        scan_type: 'macie_no_jobs',
                        compliance: [this.pciCompliance('3.1', 'Keep cardholder data storage to a minimum')],
                        evidence: { region: this.region, jobCount: 0 },
                        risk_vector: 'data_exposure',
                    }));
                }
                else {
                    // Check for paused jobs
                    const pausedJobs = jobs.items.filter((j) => j.jobStatus === 'PAUSED');
                    if (pausedJobs.length > 0) {
                        findings.push(this.createFinding({
                            severity: 'low',
                            title: `Macie Paused Jobs: ${this.region}`,
                            description: `${pausedJobs.length} Macie classification jobs are paused`,
                            analysis: 'Paused jobs are not actively scanning for sensitive data.',
                            resource_id: `macie-paused-${this.region}`,
                            resource_arn: `arn:aws:macie2:${this.region}:${this.accountId}:classification-job`,
                            scan_type: 'macie_paused_jobs',
                            evidence: { region: this.region, pausedCount: pausedJobs.length },
                            risk_vector: 'data_exposure',
                        }));
                    }
                }
            }, null);
            // Check 3: Sensitive data findings
            await this.safeExecute('sensitive-findings', async () => {
                const stats = await client.send(new client_macie2_1.GetFindingStatisticsCommand({
                    groupBy: 'severity.description'
                }));
                const highSeverity = stats.countsBySeverity?.find((s) => s.key === 'High');
                if (highSeverity && highSeverity.count && highSeverity.count > 0) {
                    findings.push(this.createFinding({
                        severity: 'high',
                        title: `Macie High Severity Findings: ${this.region}`,
                        description: `${highSeverity.count} high severity sensitive data findings`,
                        analysis: 'HIGH RISK: Sensitive data exposure detected.',
                        resource_id: `macie-findings-${this.region}`,
                        resource_arn: `arn:aws:macie2:${this.region}:${this.accountId}:finding`,
                        scan_type: 'macie_high_findings',
                        compliance: [
                            this.pciCompliance('3.4', 'Render PAN unreadable'),
                            this.lgpdCompliance('Art.46', 'Security Measures'),
                        ],
                        evidence: { region: this.region, highSeverityCount: highSeverity.count },
                        risk_vector: 'data_exposure',
                    }));
                }
            }, null);
        }
        catch (error) {
            if (error.name === 'AccessDeniedException' || error.message?.includes('not enabled')) {
                findings.push(this.createFinding({
                    severity: 'high',
                    title: `Macie Not Enabled: ${this.region}`,
                    description: `Amazon Macie is not enabled in ${this.region}`,
                    analysis: 'HIGH RISK: Sensitive data discovery is not active.',
                    resource_id: `macie-${this.region}`,
                    resource_arn: `arn:aws:macie2:${this.region}:${this.accountId}:`,
                    scan_type: 'macie_not_enabled',
                    compliance: [this.pciCompliance('3.1', 'Keep cardholder data storage to a minimum')],
                    evidence: { region: this.region, enabled: false },
                    risk_vector: 'data_exposure',
                }));
            }
            else {
                this.warn('Macie scan failed', { error: error.message });
            }
        }
        this.log('Macie scan completed', { findingsCount: findings.length });
        return findings;
    }
}
exports.MacieScanner = MacieScanner;
async function scanMacie(region, accountId, credentials, cache) {
    const scanner = new MacieScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map