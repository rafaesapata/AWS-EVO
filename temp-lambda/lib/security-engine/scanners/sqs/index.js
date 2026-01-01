"use strict";
/**
 * Security Engine V3 - SQS Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQSScanner = void 0;
exports.scanSQS = scanSQS;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_sqs_1 = require("@aws-sdk/client-sqs");
class SQSScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'SQS'; }
    get category() { return 'Data Protection'; }
    async scan() {
        this.log('Starting SQS security scan');
        const findings = [];
        const client = await this.clientFactory.getSQSClient(this.region);
        try {
            const response = await client.send(new client_sqs_1.ListQueuesCommand({}));
            for (const queueUrl of response.QueueUrls || []) {
                const queueFindings = await this.checkQueue(client, queueUrl);
                findings.push(...queueFindings);
            }
        }
        catch (error) {
            this.warn('Failed to list queues', { error: error.message });
        }
        this.log('SQS scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkQueue(client, queueUrl) {
        const findings = [];
        const queueName = queueUrl.split('/').pop() || queueUrl;
        const queueArn = this.arnBuilder.sqsQueue(this.region, queueName);
        try {
            const attrs = await client.send(new client_sqs_1.GetQueueAttributesCommand({
                QueueUrl: queueUrl,
                AttributeNames: ['All'],
            }));
            const attributes = attrs.Attributes || {};
            if (!attributes.KmsMasterKeyId && !attributes.SqsManagedSseEnabled) {
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: `SQS Queue Not Encrypted: ${queueName}`,
                    description: 'Queue does not have server-side encryption enabled',
                    analysis: 'Messages should be encrypted at rest.',
                    resource_id: queueName,
                    resource_arn: queueArn,
                    scan_type: 'sqs_not_encrypted',
                    compliance: [
                        this.pciCompliance('3.4', 'Render PAN unreadable'),
                        this.lgpdCompliance('Art.46', 'Medidas de segurança'),
                    ],
                    remediation: {
                        description: 'Enable encryption for the queue',
                        steps: ['Go to SQS Console', `Select ${queueName}`, 'Edit', 'Enable encryption'],
                        estimated_effort: 'trivial',
                        automation_available: true,
                    },
                    evidence: { queueName, encrypted: false },
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
                                title: `SQS Queue Has Public Policy: ${queueName}`,
                                description: 'Queue policy allows public access',
                                analysis: 'HIGH RISK: Anyone can send or receive messages.',
                                resource_id: queueName,
                                resource_arn: queueArn,
                                scan_type: 'sqs_public_policy',
                                compliance: [this.nistCompliance('AC-3', 'Access Enforcement')],
                                evidence: { queueName, statement },
                                risk_vector: 'public_exposure',
                            }));
                        }
                    }
                }
                catch (e) {
                    this.warn(`Failed to parse policy for ${queueName}`);
                }
            }
            if (!attributes.RedrivePolicy) {
                findings.push(this.createFinding({
                    severity: 'low',
                    title: `SQS Queue Without DLQ: ${queueName}`,
                    description: 'Queue does not have a dead-letter queue configured',
                    analysis: 'Failed messages will be lost without a DLQ.',
                    resource_id: queueName,
                    resource_arn: queueArn,
                    scan_type: 'sqs_no_dlq',
                    compliance: [this.wellArchitectedCompliance('REL', 'Design for failure')],
                    evidence: { queueName },
                    risk_vector: 'data_loss',
                }));
            }
        }
        catch (error) {
            this.warn(`Failed to get queue attributes ${queueName}`, { error: error.message });
        }
        return findings;
    }
}
exports.SQSScanner = SQSScanner;
async function scanSQS(region, accountId, credentials, cache) {
    const scanner = new SQSScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map