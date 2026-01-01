"use strict";
/**
 * Security Engine V3 - ELB Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ELBScanner = void 0;
exports.scanELB = scanELB;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_elastic_load_balancing_v2_1 = require("@aws-sdk/client-elastic-load-balancing-v2");
class ELBScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'ELB'; }
    get category() { return 'Network Security'; }
    async scan() {
        this.log('Starting ELB security scan');
        const findings = [];
        const client = await this.clientFactory.getELBV2Client(this.region);
        try {
            const response = await client.send(new client_elastic_load_balancing_v2_1.DescribeLoadBalancersCommand({}));
            for (const lb of response.LoadBalancers || []) {
                if (!lb.LoadBalancerArn || !lb.LoadBalancerName)
                    continue;
                const lbFindings = await this.checkLoadBalancer(client, lb);
                findings.push(...lbFindings);
            }
        }
        catch (error) {
            this.warn('Failed to list load balancers', { error: error.message });
        }
        this.log('ELB scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkLoadBalancer(client, lb) {
        const findings = [];
        const lbArn = lb.LoadBalancerArn;
        const lbName = lb.LoadBalancerName;
        if (lb.Scheme === 'internet-facing') {
            findings.push(this.createFinding({
                severity: 'info',
                title: `Internet-Facing Load Balancer: ${lbName}`,
                description: 'Load balancer is publicly accessible',
                analysis: 'Ensure this is intentional and properly secured.',
                resource_id: lbName,
                resource_arn: lbArn,
                scan_type: 'elb_internet_facing',
                compliance: [this.wellArchitectedCompliance('SEC', 'Protect networks')],
                evidence: { lbName, scheme: lb.Scheme },
                risk_vector: 'public_exposure',
            }));
        }
        try {
            const listeners = await client.send(new client_elastic_load_balancing_v2_1.DescribeListenersCommand({ LoadBalancerArn: lbArn }));
            for (const listener of listeners.Listeners || []) {
                if (listener.Protocol === 'HTTP' && lb.Scheme === 'internet-facing') {
                    findings.push(this.createFinding({
                        severity: 'high',
                        title: `ELB Using HTTP: ${lbName}`,
                        description: `Internet-facing load balancer has HTTP listener on port ${listener.Port}`,
                        analysis: 'HIGH RISK: Traffic is not encrypted.',
                        resource_id: lbName,
                        resource_arn: lbArn,
                        scan_type: 'elb_http_listener',
                        compliance: [
                            this.pciCompliance('4.1', 'Use strong cryptography for transmission'),
                            this.lgpdCompliance('Art.46', 'Medidas de segurança'),
                        ],
                        remediation: {
                            description: 'Use HTTPS instead of HTTP',
                            steps: ['Create HTTPS listener', 'Redirect HTTP to HTTPS', 'Remove HTTP listener'],
                            estimated_effort: 'medium',
                            automation_available: true,
                        },
                        evidence: { lbName, protocol: 'HTTP', port: listener.Port },
                        risk_vector: 'data_exposure',
                    }));
                }
                if (listener.Protocol === 'HTTPS' && listener.SslPolicy) {
                    const weakPolicies = ['ELBSecurityPolicy-2016-08', 'ELBSecurityPolicy-TLS-1-0-2015-04'];
                    if (weakPolicies.includes(listener.SslPolicy)) {
                        findings.push(this.createFinding({
                            severity: 'medium',
                            title: `ELB Using Weak SSL Policy: ${lbName}`,
                            description: `Listener uses outdated SSL policy: ${listener.SslPolicy}`,
                            analysis: 'Weak SSL policies may allow insecure connections.',
                            resource_id: lbName,
                            resource_arn: lbArn,
                            scan_type: 'elb_weak_ssl_policy',
                            compliance: [this.pciCompliance('4.1', 'Use strong cryptography')],
                            remediation: {
                                description: 'Update to a stronger SSL policy',
                                steps: ['Go to EC2 Console > Load Balancers', `Select ${lbName}`, 'Edit listener', 'Select TLS 1.2 or higher policy'],
                                estimated_effort: 'trivial',
                                automation_available: true,
                            },
                            evidence: { lbName, sslPolicy: listener.SslPolicy },
                            risk_vector: 'weak_authentication',
                        }));
                    }
                }
            }
        }
        catch (error) {
            this.warn(`Failed to get listeners for ${lbName}`, { error: error.message });
        }
        try {
            const attrs = await client.send(new client_elastic_load_balancing_v2_1.DescribeLoadBalancerAttributesCommand({ LoadBalancerArn: lbArn }));
            const attributes = attrs.Attributes || [];
            const accessLogs = attributes.find((a) => a.Key === 'access_logs.s3.enabled');
            if (!accessLogs || accessLogs.Value !== 'true') {
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: `ELB Access Logs Disabled: ${lbName}`,
                    description: 'Access logging is not enabled',
                    analysis: 'Access logs are essential for security monitoring.',
                    resource_id: lbName,
                    resource_arn: lbArn,
                    scan_type: 'elb_no_access_logs',
                    compliance: [
                        this.cisCompliance('3.1', 'Ensure logging is enabled'),
                        this.pciCompliance('10.1', 'Implement audit trails'),
                    ],
                    evidence: { lbName, accessLogsEnabled: false },
                    risk_vector: 'no_audit_trail',
                }));
            }
            const deletionProtection = attributes.find((a) => a.Key === 'deletion_protection.enabled');
            if (!deletionProtection || deletionProtection.Value !== 'true') {
                findings.push(this.createFinding({
                    severity: 'low',
                    title: `ELB Deletion Protection Disabled: ${lbName}`,
                    description: 'Load balancer can be deleted without protection',
                    analysis: 'Accidental deletion could cause service disruption.',
                    resource_id: lbName,
                    resource_arn: lbArn,
                    scan_type: 'elb_no_deletion_protection',
                    compliance: [this.wellArchitectedCompliance('REL', 'Protect data')],
                    evidence: { lbName },
                    risk_vector: 'availability',
                }));
            }
        }
        catch (error) {
            this.warn(`Failed to get attributes for ${lbName}`, { error: error.message });
        }
        return findings;
    }
}
exports.ELBScanner = ELBScanner;
async function scanELB(region, accountId, credentials, cache) {
    const scanner = new ELBScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map