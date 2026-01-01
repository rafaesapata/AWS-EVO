"use strict";
/**
 * Security Engine V3 - Base Scanner
 * Abstract base class for all service scanners
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseScanner = void 0;
const arn_builder_js_1 = require("../arn-builder.js");
const resource_cache_js_1 = require("./resource-cache.js");
const client_factory_js_1 = require("./client-factory.js");
const logging_js_1 = require("../../logging.js");
const crypto_1 = require("crypto");
class BaseScanner {
    constructor(region, accountId, credentials, cache) {
        this.region = region;
        this.accountId = accountId;
        this.arnBuilder = new arn_builder_js_1.ArnBuilder(accountId);
        this.cache = cache;
        this.clientFactory = new client_factory_js_1.AWSClientFactory(credentials);
    }
    /**
     * Create a standardized finding
     */
    createFinding(params) {
        const defaultRemediation = {
            description: 'Review and remediate this finding.',
            steps: ['Review the finding details', 'Apply recommended changes', 'Verify the fix'],
            estimated_effort: 'medium',
            automation_available: false,
            ...params.remediation,
        };
        return {
            id: `${this.serviceName.toLowerCase()}_${params.scan_type}_${params.resource_id}_${(0, crypto_1.randomUUID)().slice(0, 8)}`,
            severity: params.severity,
            title: params.title,
            description: params.description,
            analysis: params.analysis,
            resource_id: params.resource_id,
            resource_arn: params.resource_arn,
            region: this.region,
            service: this.serviceName,
            category: params.category || this.category,
            scan_type: params.scan_type,
            compliance: params.compliance || [],
            remediation: defaultRemediation,
            evidence: params.evidence || {},
            risk_vector: params.risk_vector || 'unknown',
            risk_score: params.risk_score || this.calculateRiskScore(params.severity),
            attack_vectors: params.attack_vectors || [],
            business_impact: params.business_impact || this.getDefaultBusinessImpact(params.severity),
            cve: params.cve,
            first_seen: new Date(),
            last_seen: new Date(),
        };
    }
    /**
     * Calculate risk score based on severity
     */
    calculateRiskScore(severity) {
        const scores = {
            critical: 10,
            high: 7,
            medium: 4,
            low: 2,
            info: 1,
        };
        return scores[severity];
    }
    /**
     * Get default business impact based on severity
     */
    getDefaultBusinessImpact(severity) {
        const impacts = {
            critical: 'Immediate risk of data breach or system compromise. Requires urgent attention.',
            high: 'Significant security risk that could lead to unauthorized access or data exposure.',
            medium: 'Moderate security concern that should be addressed in the near term.',
            low: 'Minor security improvement opportunity with limited immediate risk.',
            info: 'Informational finding for awareness and best practice alignment.',
        };
        return impacts[severity];
    }
    /**
     * Create CIS AWS compliance mapping
     */
    cisCompliance(controlId, controlTitle) {
        return {
            framework: 'CIS AWS Foundations Benchmark',
            version: '1.5.0',
            control_id: controlId,
            control_title: controlTitle,
        };
    }
    /**
     * Create PCI-DSS compliance mapping
     */
    pciCompliance(controlId, controlTitle) {
        return {
            framework: 'PCI-DSS',
            version: '4.0',
            control_id: controlId,
            control_title: controlTitle,
        };
    }
    /**
     * Create NIST 800-53 compliance mapping
     */
    nistCompliance(controlId, controlTitle) {
        return {
            framework: 'NIST 800-53',
            version: 'Rev5',
            control_id: controlId,
            control_title: controlTitle,
        };
    }
    /**
     * Create AWS Well-Architected compliance mapping
     */
    wellArchitectedCompliance(pillar, bestPractice) {
        return {
            framework: 'AWS Well-Architected',
            version: '2023',
            control_id: pillar,
            control_title: bestPractice,
        };
    }
    /**
     * Create LGPD compliance mapping
     */
    lgpdCompliance(article, description) {
        return {
            framework: 'LGPD',
            version: '2020',
            control_id: article,
            control_title: description,
        };
    }
    /**
     * Create SOC 2 compliance mapping
     */
    soc2Compliance(criteria, description) {
        return {
            framework: 'SOC 2',
            version: '2017',
            control_id: criteria,
            control_title: description,
        };
    }
    /**
     * Create ISO 27001 compliance mapping
     */
    iso27001Compliance(control, description) {
        return {
            framework: 'ISO 27001',
            version: '2022',
            control_id: control,
            control_title: description,
        };
    }
    /**
     * Create HIPAA compliance mapping
     */
    hipaaCompliance(section, description) {
        return {
            framework: 'HIPAA',
            version: '2023',
            control_id: section,
            control_title: description,
        };
    }
    /**
     * Log scanner activity
     */
    log(message, data) {
        logging_js_1.logger.info(`[${this.serviceName}:${this.region}] ${message}`, data);
    }
    /**
     * Log scanner warning
     */
    warn(message, data) {
        logging_js_1.logger.warn(`[${this.serviceName}:${this.region}] ${message}`, data);
    }
    /**
     * Log scanner error
     */
    error(message, error, data) {
        logging_js_1.logger.error(`[${this.serviceName}:${this.region}] ${message}`, error, data);
    }
    /**
     * Safe execution wrapper for individual checks
     */
    async safeExecute(checkName, operation, defaultValue) {
        try {
            return await operation();
        }
        catch (error) {
            this.warn(`Check failed: ${checkName}`, { error: error.message });
            return defaultValue;
        }
    }
    /**
     * Get cache key for this scanner
     */
    getCacheKey(resource, ...args) {
        return resource_cache_js_1.ResourceCache.key(this.serviceName, this.region, resource, ...args);
    }
}
exports.BaseScanner = BaseScanner;
//# sourceMappingURL=base-scanner.js.map