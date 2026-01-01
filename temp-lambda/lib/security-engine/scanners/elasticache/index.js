"use strict";
/**
 * Security Engine V3 - ElastiCache Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElastiCacheScanner = void 0;
exports.scanElastiCache = scanElastiCache;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_elasticache_1 = require("@aws-sdk/client-elasticache");
class ElastiCacheScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'ElastiCache'; }
    get category() { return 'Data Protection'; }
    async scan() {
        this.log('Starting ElastiCache security scan');
        const findings = [];
        const client = await this.clientFactory.getElastiCacheClient(this.region);
        const checkResults = await Promise.allSettled([
            this.checkClusters(client),
            this.checkReplicationGroups(client),
        ]);
        for (const result of checkResults) {
            if (result.status === 'fulfilled')
                findings.push(...result.value);
            else
                this.warn('Check failed', { error: result.reason?.message });
        }
        this.log('ElastiCache scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkClusters(client) {
        const findings = [];
        try {
            const response = await client.send(new client_elasticache_1.DescribeCacheClustersCommand({}));
            for (const cluster of response.CacheClusters || []) {
                if (!cluster.CacheClusterId)
                    continue;
                const clusterArn = cluster.ARN || this.arnBuilder.elastiCacheCluster(this.region, cluster.CacheClusterId);
                if (!cluster.TransitEncryptionEnabled) {
                    findings.push(this.createFinding({
                        severity: 'high',
                        title: `ElastiCache No Transit Encryption: ${cluster.CacheClusterId}`,
                        description: 'In-transit encryption is not enabled',
                        analysis: 'HIGH RISK: Data transmitted to/from cache is not encrypted.',
                        resource_id: cluster.CacheClusterId,
                        resource_arn: clusterArn,
                        scan_type: 'elasticache_no_transit_encryption',
                        compliance: [
                            this.pciCompliance('4.1', 'Use strong cryptography for transmission'),
                            this.lgpdCompliance('Art.46', 'Medidas de segurança'),
                        ],
                        evidence: { clusterId: cluster.CacheClusterId, transitEncryption: false },
                        risk_vector: 'data_exposure',
                    }));
                }
                if (!cluster.AtRestEncryptionEnabled) {
                    findings.push(this.createFinding({
                        severity: 'high',
                        title: `ElastiCache No At-Rest Encryption: ${cluster.CacheClusterId}`,
                        description: 'At-rest encryption is not enabled',
                        analysis: 'HIGH RISK: Cached data is not encrypted at rest.',
                        resource_id: cluster.CacheClusterId,
                        resource_arn: clusterArn,
                        scan_type: 'elasticache_no_rest_encryption',
                        compliance: [
                            this.pciCompliance('3.4', 'Render PAN unreadable'),
                            this.lgpdCompliance('Art.46', 'Medidas de segurança'),
                        ],
                        evidence: { clusterId: cluster.CacheClusterId, atRestEncryption: false },
                        risk_vector: 'data_exposure',
                    }));
                }
                if (!cluster.AuthTokenEnabled) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `ElastiCache No Auth Token: ${cluster.CacheClusterId}`,
                        description: 'AUTH token is not enabled',
                        analysis: 'Without AUTH, anyone with network access can use the cache.',
                        resource_id: cluster.CacheClusterId,
                        resource_arn: clusterArn,
                        scan_type: 'elasticache_no_auth',
                        compliance: [this.nistCompliance('AC-3', 'Access Enforcement')],
                        evidence: { clusterId: cluster.CacheClusterId },
                        risk_vector: 'weak_authentication',
                    }));
                }
                if (!cluster.AutoMinorVersionUpgrade) {
                    findings.push(this.createFinding({
                        severity: 'low',
                        title: `ElastiCache Auto Upgrade Disabled: ${cluster.CacheClusterId}`,
                        description: 'Automatic minor version upgrades are disabled',
                        analysis: 'Security patches may not be applied automatically.',
                        resource_id: cluster.CacheClusterId,
                        resource_arn: clusterArn,
                        scan_type: 'elasticache_no_auto_upgrade',
                        compliance: [this.nistCompliance('SI-2', 'Flaw Remediation')],
                        evidence: { clusterId: cluster.CacheClusterId },
                        risk_vector: 'outdated_software',
                    }));
                }
            }
        }
        catch (error) {
            this.warn('Failed to describe clusters', { error: error.message });
        }
        return findings;
    }
    async checkReplicationGroups(client) {
        const findings = [];
        try {
            const response = await client.send(new client_elasticache_1.DescribeReplicationGroupsCommand({}));
            for (const group of response.ReplicationGroups || []) {
                if (!group.ReplicationGroupId)
                    continue;
                const groupArn = group.ARN || this.arnBuilder.elastiCacheReplicationGroup(this.region, group.ReplicationGroupId);
                if (!group.AutomaticFailover || group.AutomaticFailover === 'disabled') {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `ElastiCache No Auto Failover: ${group.ReplicationGroupId}`,
                        description: 'Automatic failover is not enabled',
                        analysis: 'Manual intervention required during node failure.',
                        resource_id: group.ReplicationGroupId,
                        resource_arn: groupArn,
                        scan_type: 'elasticache_no_auto_failover',
                        compliance: [this.wellArchitectedCompliance('REL', 'Design for failure')],
                        evidence: { groupId: group.ReplicationGroupId },
                        risk_vector: 'availability',
                    }));
                }
                const nodeCount = group.MemberClusters?.length || 0;
                if (nodeCount < 2) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `ElastiCache Single Node: ${group.ReplicationGroupId}`,
                        description: `Replication group has only ${nodeCount} node(s)`,
                        analysis: 'Single node has no redundancy.',
                        resource_id: group.ReplicationGroupId,
                        resource_arn: groupArn,
                        scan_type: 'elasticache_single_node',
                        compliance: [this.wellArchitectedCompliance('REL', 'Design for failure')],
                        evidence: { groupId: group.ReplicationGroupId, nodeCount },
                        risk_vector: 'availability',
                    }));
                }
            }
        }
        catch (error) {
            this.warn('Failed to describe replication groups', { error: error.message });
        }
        return findings;
    }
}
exports.ElastiCacheScanner = ElastiCacheScanner;
async function scanElastiCache(region, accountId, credentials, cache) {
    const scanner = new ElastiCacheScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map