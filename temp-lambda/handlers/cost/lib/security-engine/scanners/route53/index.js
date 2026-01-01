"use strict";
/**
 * Security Engine V2 - Route 53 Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Route53Scanner = void 0;
exports.scanRoute53 = scanRoute53;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_route_53_1 = require("@aws-sdk/client-route-53");
class Route53Scanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'Route53'; }
    get category() { return 'DNS Security'; }
    async scan() {
        this.log('Starting Route 53 security scan');
        const findings = [];
        const client = await this.clientFactory.getRoute53Client();
        try {
            const zones = await client.send(new client_route_53_1.ListHostedZonesCommand({}));
            for (const zone of zones.HostedZones || []) {
                if (!zone.Id || !zone.Name)
                    continue;
                const zoneFindings = await this.checkHostedZone(client, zone);
                findings.push(...zoneFindings);
            }
            // Check health checks
            const healthFindings = await this.checkHealthChecks(client);
            findings.push(...healthFindings);
        }
        catch (error) {
            this.warn('Route 53 scan failed', { error: error.message });
        }
        this.log('Route 53 scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkHostedZone(client, zone) {
        const findings = [];
        const zoneId = zone.Id.replace('/hostedzone/', '');
        const zoneName = zone.Name;
        const zoneArn = this.arnBuilder.route53HostedZone(zoneId);
        // Check 1: DNSSEC not enabled for public zones
        if (!zone.Config?.PrivateZone) {
            try {
                const dnssec = await client.send(new client_route_53_1.GetDNSSECCommand({ HostedZoneId: zoneId }));
                if (dnssec.Status?.ServeSignature !== 'SIGNING') {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `Route 53 DNSSEC Not Enabled: ${zoneName}`,
                        description: `Public hosted zone ${zoneName} does not have DNSSEC signing enabled`,
                        analysis: 'DNSSEC protects against DNS spoofing and cache poisoning.',
                        resource_id: zoneId,
                        resource_arn: zoneArn,
                        scan_type: 'route53_no_dnssec',
                        compliance: [
                            this.nistCompliance('SC-20', 'Secure Name/Address Resolution'),
                            this.cisCompliance('3.10', 'Enable DNSSEC'),
                        ],
                        remediation: {
                            description: 'Enable DNSSEC signing for the hosted zone',
                            steps: ['Go to Route 53 console', 'Select hosted zone', 'Enable DNSSEC signing'],
                            estimated_effort: 'medium',
                            automation_available: true,
                        },
                        evidence: { zoneName, zoneId, dnssecStatus: dnssec.Status?.ServeSignature },
                        risk_vector: 'dns_security',
                    }));
                }
            }
            catch (e) {
                // DNSSEC not configured
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: `Route 53 DNSSEC Not Configured: ${zoneName}`,
                    description: `Public hosted zone ${zoneName} does not have DNSSEC configured`,
                    analysis: 'DNSSEC protects against DNS spoofing attacks.',
                    resource_id: zoneId,
                    resource_arn: zoneArn,
                    scan_type: 'route53_no_dnssec',
                    compliance: [this.nistCompliance('SC-20', 'Secure Name/Address Resolution')],
                    evidence: { zoneName, zoneId },
                    risk_vector: 'dns_security',
                }));
            }
        }
        // Check 2: Query logging not enabled
        try {
            const logging = await client.send(new client_route_53_1.ListQueryLoggingConfigsCommand({ HostedZoneId: zoneId }));
            if (!logging.QueryLoggingConfigs?.length) {
                findings.push(this.createFinding({
                    severity: 'low',
                    title: `Route 53 Query Logging Disabled: ${zoneName}`,
                    description: `Hosted zone ${zoneName} does not have query logging enabled`,
                    analysis: 'Query logging helps detect suspicious DNS activity.',
                    resource_id: zoneId,
                    resource_arn: zoneArn,
                    scan_type: 'route53_no_query_logging',
                    compliance: [this.wellArchitectedCompliance('SEC-4', 'Detect Security Events')],
                    evidence: { zoneName, zoneId, hasQueryLogging: false },
                    risk_vector: 'observability',
                }));
            }
        }
        catch (e) {
            // Logging not configured
        }
        return findings;
    }
    async checkHealthChecks(client) {
        const findings = [];
        try {
            const healthChecks = await client.send(new client_route_53_1.ListHealthChecksCommand({}));
            for (const hc of healthChecks.HealthChecks || []) {
                if (hc.HealthCheckConfig?.Type === 'HTTP' && !hc.HealthCheckConfig?.EnableSNI) {
                    findings.push(this.createFinding({
                        severity: 'low',
                        title: `Route 53 Health Check Using HTTP: ${hc.Id}`,
                        description: `Health check ${hc.Id} is using HTTP instead of HTTPS`,
                        analysis: 'HTTP health checks transmit data in plaintext.',
                        resource_id: hc.Id,
                        resource_arn: this.arnBuilder.route53HealthCheck(hc.Id),
                        scan_type: 'route53_http_health_check',
                        compliance: [this.pciCompliance('4.1', 'Use Strong Cryptography')],
                        evidence: { healthCheckId: hc.Id, type: hc.HealthCheckConfig?.Type },
                        risk_vector: 'encryption',
                    }));
                }
            }
        }
        catch (e) {
            this.warn('Failed to check health checks', { error: e.message });
        }
        return findings;
    }
}
exports.Route53Scanner = Route53Scanner;
async function scanRoute53(region, accountId, credentials, cache) {
    const scanner = new Route53Scanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map