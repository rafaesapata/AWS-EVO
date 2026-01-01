"use strict";
/**
 * Security Engine V3 - SNS Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SNSScanner = void 0;
exports.scanSNS = scanSNS;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_sns_1 = require("@aws-sdk/client-sns");
class SNSScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'SNS'; }
    get category() { return 'Data Protection'; }
    async scan() {
        this.log('Starting SNS security scan');
        const findings = [];
        const client = await this.clientFactory.getSNSClient(this.region);
        try {
            const response = await client.send(new client_sns_1.ListTopicsCommand({}));
            for (const topic of response.Topics || []) {
                if (!topic.TopicArn)
                    continue;
                const topicFindings = await this.checkTopic(client, topic.TopicArn);
                findings.push(...topicFindings);
            }
        }
        catch (error) {
            this.warn('Failed to list topics', { error: error.message });
        }
        this.log('SNS scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkTopic(client, topicArn) {
        const findings = [];
        const topicName = topicArn.split(':').pop() || topicArn;
        try {
            const attrs = await client.send(new client_sns_1.GetTopicAttributesCommand({ TopicArn: topicArn }));
            const attributes = attrs.Attributes || {};
            if (!attributes.KmsMasterKeyId) {
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: `SNS Topic Not Encrypted: ${topicName}`,
                    description: 'Topic does not have server-side encryption enabled',
                    analysis: 'Messages in transit and at rest should be encrypted.',
                    resource_id: topicName,
                    resource_arn: topicArn,
                    scan_type: 'sns_not_encrypted',
                    compliance: [
                        this.pciCompliance('3.4', 'Render PAN unreadable'),
                        this.lgpdCompliance('Art.46', 'Medidas de segurança'),
                    ],
                    remediation: {
                        description: 'Enable encryption for the topic',
                        steps: ['Go to SNS Console', `Select ${topicName}`, 'Edit', 'Enable encryption'],
                        estimated_effort: 'trivial',
                        automation_available: true,
                    },
                    evidence: { topicName, encrypted: false },
                    risk_vector: 'data_exposure',
                }));
            }
            if (attributes.Policy) {
                try {
                    const policy = JSON.parse(attributes.Policy);
                    for (const statement of policy.Statement || []) {
                        if (statement.Effect === 'Allow' && statement.Principal === '*' && !statement.Condition) {
                            findings.push(this.createFinding({
                                severity: 'high',
                                title: `SNS Topic Has Public Policy: ${topicName}`,
                                description: 'Topic policy allows public access',
                                analysis: 'HIGH RISK: Anyone can publish or subscribe to this topic.',
                                resource_id: topicName,
                                resource_arn: topicArn,
                                scan_type: 'sns_public_policy',
                                compliance: [this.nistCompliance('AC-3', 'Access Enforcement')],
                                evidence: { topicName, statement },
                                risk_vector: 'public_exposure',
                            }));
                        }
                    }
                }
                catch (e) {
                    this.warn(`Failed to parse policy for ${topicName}`);
                }
            }
        }
        catch (error) {
            this.warn(`Failed to get topic attributes ${topicName}`, { error: error.message });
        }
        return findings;
    }
}
exports.SNSScanner = SNSScanner;
async function scanSNS(region, accountId, credentials, cache) {
    const scanner = new SNSScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map