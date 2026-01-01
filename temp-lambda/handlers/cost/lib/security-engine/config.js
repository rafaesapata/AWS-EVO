"use strict";
/**
 * Security Engine V2 - Configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CACHE_TTL = exports.SEVERITY_WEIGHTS = exports.COMPLIANCE_VERSIONS = exports.SENSITIVE_ENV_PATTERNS = exports.DEPRECATED_RUNTIMES = exports.MEDIUM_RISK_PORTS = exports.HIGH_RISK_PORTS = exports.CRITICAL_PORTS = exports.PRIORITY_2_SERVICES = exports.PRIORITY_1_SERVICES = exports.REGIONAL_SERVICES = exports.GLOBAL_SERVICES = exports.DEFAULT_PARALLELIZATION_CONFIG = void 0;
exports.DEFAULT_PARALLELIZATION_CONFIG = {
    maxRegionConcurrency: 5,
    maxServiceConcurrency: 10,
    maxCheckConcurrency: 20,
    batchSize: 50,
    timeout: 30000,
    retryCount: 3,
    retryDelay: 1000,
};
// Global services (executed only once, not per region)
exports.GLOBAL_SERVICES = [
    'IAM',
    'S3',
    'CloudFront',
    'Route53',
    'Organizations',
];
// Regional services (executed per region)
exports.REGIONAL_SERVICES = [
    'EC2',
    'RDS',
    'Lambda',
    'EKS',
    'ECS',
    'ElastiCache',
    'DynamoDB',
    'APIGateway',
    'SecretsManager',
    'KMS',
    'CloudTrail',
    'GuardDuty',
    'SecurityHub',
    'WAF',
    'ELB',
    'VPC',
    'SNS',
    'SQS',
    'OpenSearch',
    'Kinesis',
    'ACM',
    'Cognito',
];
// Priority 1 services (critical for security)
exports.PRIORITY_1_SERVICES = [
    'IAM',
    'Lambda',
    'SecretsManager',
    'GuardDuty',
    'SecurityHub',
    'EKS',
    'ECS',
    'APIGateway',
    'ECR',
    'WAF',
    'ACM',
    'Organizations',
];
// Priority 2 services (data and network)
exports.PRIORITY_2_SERVICES = [
    'DynamoDB',
    'ElastiCache',
    'OpenSearch',
    'CloudFront',
    'ELB',
    'Route53',
    'DocumentDB',
    'Redshift',
    'EFS',
    'Cognito',
];
// Critical ports that should never be exposed
exports.CRITICAL_PORTS = {
    22: 'SSH',
    3389: 'RDP',
    3306: 'MySQL',
    5432: 'PostgreSQL',
    1433: 'SQL Server',
    27017: 'MongoDB',
    6379: 'Redis',
    9200: 'Elasticsearch',
    5984: 'CouchDB',
    11211: 'Memcached',
};
// High risk ports
exports.HIGH_RISK_PORTS = {
    21: 'FTP',
    23: 'Telnet',
    25: 'SMTP',
    110: 'POP3',
    143: 'IMAP',
    445: 'SMB',
    1521: 'Oracle',
    5900: 'VNC',
    2049: 'NFS',
    135: 'RPC',
    139: 'NetBIOS',
};
// Medium risk ports
exports.MEDIUM_RISK_PORTS = {
    80: 'HTTP',
    8080: 'HTTP-Alt',
    8443: 'HTTPS-Alt',
    9000: 'SonarQube',
    5000: 'Flask/Docker',
    3000: 'Node.js',
    4000: 'GraphQL',
    8000: 'Django',
    9090: 'Prometheus',
    9092: 'Kafka',
};
// Deprecated Lambda runtimes
exports.DEPRECATED_RUNTIMES = [
    'python2.7',
    'python3.6',
    'python3.7',
    'nodejs10.x',
    'nodejs12.x',
    'nodejs14.x',
    'dotnetcore2.1',
    'dotnetcore3.1',
    'ruby2.5',
    'ruby2.7',
    'go1.x',
];
// Sensitive environment variable patterns
exports.SENSITIVE_ENV_PATTERNS = [
    /password/i,
    /secret/i,
    /key/i,
    /token/i,
    /api_key/i,
    /apikey/i,
    /private/i,
    /credential/i,
    /auth/i,
    /bearer/i,
    /jwt/i,
    /access/i,
    /connection_string/i,
    /database_url/i,
];
// Compliance framework versions
exports.COMPLIANCE_VERSIONS = {
    CIS_AWS: '1.5.0',
    PCI_DSS: '4.0',
    HIPAA: '2023',
    SOC2: '2017',
    ISO27001: '2022',
    NIST_800_53: 'Rev5',
    NIST_CSF: '1.1',
    GDPR: '2018',
    LGPD: '2020',
    FEDRAMP: 'Rev5',
    AWS_WELL_ARCHITECTED: '2023',
};
// Risk score weights by severity
exports.SEVERITY_WEIGHTS = {
    critical: 10,
    high: 7,
    medium: 4,
    low: 2,
    info: 1,
};
// Cache TTL in milliseconds
exports.CACHE_TTL = 300000; // 5 minutes
//# sourceMappingURL=config.js.map