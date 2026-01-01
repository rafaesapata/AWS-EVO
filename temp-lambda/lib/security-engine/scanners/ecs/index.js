"use strict";
/**
 * Security Engine V3 - ECS Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ECSScanner = void 0;
exports.scanECS = scanECS;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_ecs_1 = require("@aws-sdk/client-ecs");
class ECSScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'ECS'; }
    get category() { return 'Container Security'; }
    async scan() {
        this.log('Starting ECS security scan');
        const findings = [];
        const client = await this.clientFactory.getECSClient(this.region);
        const checkResults = await Promise.allSettled([
            this.checkClusters(client),
            this.checkTaskDefinitions(client),
        ]);
        for (const result of checkResults) {
            if (result.status === 'fulfilled')
                findings.push(...result.value);
            else
                this.warn('Check failed', { error: result.reason?.message });
        }
        this.log('ECS scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkClusters(client) {
        const findings = [];
        try {
            const listResponse = await client.send(new client_ecs_1.ListClustersCommand({}));
            const clusterArns = listResponse.clusterArns || [];
            if (clusterArns.length === 0)
                return findings;
            const details = await client.send(new client_ecs_1.DescribeClustersCommand({
                clusters: clusterArns,
                include: ['SETTINGS', 'CONFIGURATIONS'],
            }));
            for (const cluster of details.clusters || []) {
                if (!cluster.clusterName || !cluster.clusterArn)
                    continue;
                const containerInsights = cluster.settings?.find((s) => s.name === 'containerInsights');
                if (!containerInsights || containerInsights.value !== 'enabled') {
                    findings.push(this.createFinding({
                        severity: 'low',
                        title: `ECS Container Insights Disabled: ${cluster.clusterName}`,
                        description: 'Container Insights is not enabled',
                        analysis: 'Container Insights provides monitoring and observability.',
                        resource_id: cluster.clusterName,
                        resource_arn: cluster.clusterArn,
                        scan_type: 'ecs_no_container_insights',
                        compliance: [this.wellArchitectedCompliance('OPS', 'Implement observability')],
                        evidence: { clusterName: cluster.clusterName },
                        risk_vector: 'no_audit_trail',
                    }));
                }
            }
        }
        catch (error) {
            this.warn('Failed to check clusters', { error: error.message });
        }
        return findings;
    }
    async checkTaskDefinitions(client) {
        const findings = [];
        try {
            const listResponse = await client.send(new client_ecs_1.ListTaskDefinitionsCommand({ status: 'ACTIVE' }));
            for (const taskDefArn of (listResponse.taskDefinitionArns || []).slice(0, 20)) {
                const details = await client.send(new client_ecs_1.DescribeTaskDefinitionCommand({ taskDefinition: taskDefArn }));
                const taskDef = details.taskDefinition;
                if (!taskDef)
                    continue;
                const taskDefName = `${taskDef.family}:${taskDef.revision}`;
                for (const container of taskDef.containerDefinitions || []) {
                    if (container.privileged) {
                        findings.push(this.createFinding({
                            severity: 'high',
                            title: `ECS Privileged Container: ${taskDefName}/${container.name}`,
                            description: 'Container runs in privileged mode',
                            analysis: 'HIGH RISK: Privileged containers have full host access.',
                            resource_id: taskDefName,
                            resource_arn: taskDefArn,
                            scan_type: 'ecs_privileged_container',
                            compliance: [
                                this.cisCompliance('5.4', 'Do not run containers as privileged'),
                                this.nistCompliance('CM-7', 'Least Functionality'),
                            ],
                            evidence: { taskDefName, containerName: container.name, privileged: true },
                            risk_vector: 'excessive_permissions',
                        }));
                    }
                    if (container.user === 'root' || container.user === '0') {
                        findings.push(this.createFinding({
                            severity: 'medium',
                            title: `ECS Container Running as Root: ${taskDefName}/${container.name}`,
                            description: 'Container runs as root user',
                            analysis: 'Running as root increases risk if container is compromised.',
                            resource_id: taskDefName,
                            resource_arn: taskDefArn,
                            scan_type: 'ecs_root_user',
                            compliance: [this.cisCompliance('5.3', 'Do not run containers as root')],
                            evidence: { taskDefName, containerName: container.name, user: container.user },
                            risk_vector: 'excessive_permissions',
                        }));
                    }
                    for (const env of container.environment || []) {
                        const sensitivePatterns = [/password/i, /secret/i, /key/i, /token/i, /credential/i];
                        if (sensitivePatterns.some(p => p.test(env.name || ''))) {
                            findings.push(this.createFinding({
                                severity: 'high',
                                title: `ECS Secrets in Environment: ${taskDefName}/${container.name}`,
                                description: `Potentially sensitive variable: ${env.name}`,
                                analysis: 'HIGH RISK: Secrets in env vars can be exposed.',
                                resource_id: taskDefName,
                                resource_arn: taskDefArn,
                                scan_type: 'ecs_secrets_in_env',
                                compliance: [this.soc2Compliance('CC6.1', 'Logical and physical access controls')],
                                evidence: { taskDefName, containerName: container.name, envVar: env.name },
                                risk_vector: 'credential_exposure',
                            }));
                            break;
                        }
                    }
                    if (!container.logConfiguration) {
                        findings.push(this.createFinding({
                            severity: 'medium',
                            title: `ECS No Logging: ${taskDefName}/${container.name}`,
                            description: 'Container does not have logging configured',
                            analysis: 'Logs are essential for debugging and security.',
                            resource_id: taskDefName,
                            resource_arn: taskDefArn,
                            scan_type: 'ecs_no_logging',
                            compliance: [this.pciCompliance('10.1', 'Implement audit trails')],
                            evidence: { taskDefName, containerName: container.name },
                            risk_vector: 'no_audit_trail',
                        }));
                    }
                    if (container.readonlyRootFilesystem !== true) {
                        findings.push(this.createFinding({
                            severity: 'low',
                            title: `ECS Writable Root FS: ${taskDefName}/${container.name}`,
                            description: 'Container has writable root filesystem',
                            analysis: 'Read-only root filesystem improves security.',
                            resource_id: taskDefName,
                            resource_arn: taskDefArn,
                            scan_type: 'ecs_writable_rootfs',
                            compliance: [this.cisCompliance('5.12', 'Mount container root filesystem as read only')],
                            evidence: { taskDefName, containerName: container.name },
                            risk_vector: 'data_exposure',
                        }));
                    }
                }
                if (taskDef.networkMode !== 'awsvpc') {
                    findings.push(this.createFinding({
                        severity: 'low',
                        title: `ECS Not Using awsvpc: ${taskDefName}`,
                        description: `Task uses ${taskDef.networkMode || 'default'} network mode`,
                        analysis: 'awsvpc mode provides better network isolation.',
                        resource_id: taskDefName,
                        resource_arn: taskDefArn,
                        scan_type: 'ecs_not_awsvpc',
                        compliance: [this.wellArchitectedCompliance('SEC', 'Control traffic at all layers')],
                        evidence: { taskDefName, networkMode: taskDef.networkMode },
                        risk_vector: 'network_exposure',
                    }));
                }
            }
        }
        catch (error) {
            this.warn('Failed to check task definitions', { error: error.message });
        }
        return findings;
    }
}
exports.ECSScanner = ECSScanner;
async function scanECS(region, accountId, credentials, cache) {
    const scanner = new ECSScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map