/**
 * WAF Real-Time Monitoring Library
 * 
 * Exports all WAF-related modules for log parsing, threat detection,
 * campaign detection, alerting, and auto-blocking.
 */

// Parser module
export {
  parseWafLog,
  parseWafLogBatch,
  serializeWafEvent,
  isValidWafLog,
  type WafLogEvent,
  type WafLogHttpRequest,
  type WafLogHeader,
  type WafLogRuleGroupMatch,
  type ParsedWafEvent,
} from './parser.js';

// Threat detection module
export {
  analyzeWafEvent,
  detectSuspiciousUserAgent,
  detectSensitivePathAccess,
  detectAttackSignatures,
  calculateSeverity,
  type ThreatType,
  type Severity,
  type ThreatAnalysis,
} from './threat-detector.js';

// Campaign detection module
export {
  detectCampaign,
  getActiveCampaigns,
  resolveCampaign,
  cleanupOldCampaigns,
  isIpInCampaign,
  DEFAULT_CAMPAIGN_CONFIG,
  REDIS_KEYS,
  type CampaignConfig,
  type CampaignState,
  type CampaignDetectionResult,
} from './campaign-detector.js';

// Alert engine module
export {
  sendAlert,
  createAlert,
  shouldSendAlert,
  type AlertConfig,
  type WafAlert,
  type AlertDeliveryResult,
} from './alert-engine.js';

// Auto-blocker module
export {
  blockIp,
  unblockIp,
  unblockExpiredIps,
  shouldAutoBlock,
  DEFAULT_AUTO_BLOCK_CONFIG,
  type AutoBlockConfig,
  type BlockRecord,
  type BlockResult,
} from './auto-blocker.js';
