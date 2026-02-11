/**
 * EVO Platform - Domain Map
 * 
 * This file documents the logical domain organization of the backend.
 * Handlers are grouped by business domain for clarity.
 * 
 * IMPORTANT: Do NOT move handler files - the SAM template and CI/CD
 * pipeline reference them by their current paths.
 */

export const DOMAIN_MAP = {
  // ============================================================
  // SECURITY DOMAIN - Security scanning, compliance, WAF, threats
  // ============================================================
  security: {
    description: 'Security scanning, compliance, WAF, threat detection',
    handlers: [
      'handlers/security/*',      // 28 handlers - core security
    ],
    sharedLibs: [
      'lib/security-engine/',
      'lib/waf/',
      'lib/advanced-security-scanner.ts',
      'lib/security-explanations.ts',
      'lib/security-headers.ts',
      'lib/container-security.ts',
    ],
  },

  // ============================================================
  // CLOUD PROVIDERS DOMAIN - AWS, Azure, multi-cloud
  // ============================================================
  cloud: {
    description: 'Cloud provider integrations (AWS, Azure)',
    handlers: [
      'handlers/aws/*',           // 3 handlers - AWS credentials
      'handlers/azure/*',         // 22 handlers - Azure integration
      'handlers/cloud/*',         // 1 handler - multi-cloud listing
    ],
    sharedLibs: [
      'lib/aws-helpers.ts',
      'lib/azure-helpers.ts',
      'lib/azure-retry.ts',
      'lib/cloud-provider/',
      'lib/oauth-utils.ts',
    ],
  },

  // ============================================================
  // COST & FINOPS DOMAIN - Cost analysis, optimization, RI/SP
  // ============================================================
  cost: {
    description: 'Cost analysis, optimization, RI/SP, waste detection',
    handlers: [
      'handlers/cost/*',          // 12 handlers
      'handlers/ml/*',            // 5 handlers - ML anomaly/waste
    ],
    sharedLibs: [
      'lib/cost/',
      'lib/pricing/',
      'lib/analyzers/',
      'lib/machine-learning-engine.ts',
      'lib/ml-analysis/',
      'lib/ml-models/',
    ],
  },

  // ============================================================
  // AUTH & IDENTITY DOMAIN - Authentication, MFA, profiles
  // ============================================================
  auth: {
    description: 'Authentication, MFA, WebAuthn, user profiles',
    handlers: [
      'handlers/auth/*',          // 8 handlers - MFA, WebAuthn
      'handlers/profiles/*',      // 3 handlers - user profiles
      'handlers/user/*',          // 1 handler - notification settings
    ],
    sharedLibs: [
      'lib/auth.ts',
      'lib/token-encryption.ts',
      'lib/permissions.ts',
      'lib/tenant-isolation.ts',
      'lib/tenant-isolation-verifier.ts',
    ],
  },

  // ============================================================
  // MONITORING DOMAIN - Health, metrics, alerts, endpoints
  // ============================================================
  monitoring: {
    description: 'Platform monitoring, alerts, health checks, metrics',
    handlers: [
      'handlers/monitoring/*',    // 17 handlers
      'handlers/dashboard/*',     // 3 handlers - executive dashboard
    ],
    sharedLibs: [
      'lib/real-time-monitoring.ts',
      'lib/monitoring-alerting.ts',
      'lib/metrics-collector.ts',
      'lib/metrics-cache.ts',
      'lib/cloudwatch-batch.ts',
      'lib/advanced-analytics.ts',
      'lib/advanced-dashboard-engine.ts',
    ],
  },

  // ============================================================
  // OPERATIONS DOMAIN - Jobs, admin, system, maintenance
  // ============================================================
  operations: {
    description: 'Background jobs, admin, system management, maintenance',
    handlers: [
      'handlers/jobs/*',          // 16 handlers - background jobs
      'handlers/admin/*',         // 16 handlers - admin operations
      'handlers/system/*',        // 8 handlers - DB init, migrations
      'handlers/maintenance/*',   // 2 handlers - cleanup
      'handlers/debug/*',         // 1 handler - diagnostics
    ],
    sharedLibs: [
      'lib/database.ts',
      'lib/database-migrations.ts',
      'lib/demo-data-service.ts',
      'lib/batch-operations.ts',
      'lib/execution/',
    ],
  },

  // ============================================================
  // AI & KNOWLEDGE DOMAIN - Bedrock, KB, reports
  // ============================================================
  ai: {
    description: 'AI/Bedrock chat, knowledge base, reports',
    handlers: [
      'handlers/ai/*',            // 8 handlers - AI features
      'handlers/kb/*',            // 7 handlers - knowledge base
      'handlers/reports/*',       // 5 handlers - PDF/Excel reports
    ],
    sharedLibs: [
      'lib/bedrock-client.ts',
    ],
  },

  // ============================================================
  // INTEGRATIONS DOMAIN - Notifications, integrations, data, storage
  // ============================================================
  integrations: {
    description: 'Notifications, Jira, data queries, storage, websocket',
    handlers: [
      'handlers/notifications/*', // 4 handlers - email, webhooks
      'handlers/integrations/*',  // 2 handlers - Jira, CloudFormation
      'handlers/data/*',          // 5 handlers - table queries
      'handlers/storage/*',       // 1 handler
      'handlers/websocket/*',     // 2 handlers - real-time
      'handlers/organizations/*', // 2 handlers - org sync
      'handlers/license/*',       // 9 handlers - licensing
    ],
    sharedLibs: [
      'lib/email-service.ts',
      'lib/license-service.ts',
    ],
  },

  // ============================================================
  // SHARED / CORE - Used across all domains
  // ============================================================
  shared: {
    description: 'Core libraries used by all domains',
    libs: [
      'lib/response.ts',
      'lib/logging.ts',
      'lib/structured-logging.ts',
      'lib/middleware.ts',
      'lib/handler-middleware.ts',
      'lib/audit-service.ts',
      'lib/validation.ts',
      'lib/schemas.ts',
      'lib/request-parser.ts',
      'lib/request-context.ts',
      'lib/environment-config.ts',
      'lib/version.ts',
      'lib/tracing.ts',
      'lib/circuit-breaker.ts',
      'lib/redis-cache.ts',
      'lib/caching/',
      'lib/distributed-rate-limiter.ts',
      'lib/performance-optimizer.ts',
      'lib/metrics.ts',
    ],
    types: [
      'types/lambda.ts',
      'types/cloud.ts',
    ],
  },
} as const;
