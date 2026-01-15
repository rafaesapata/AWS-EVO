/**
 * WAF Log Parser Module
 * Parses AWS WAF logs from CloudWatch Logs Subscription Filter
 * 
 * Supports WAF log format versions 1 and 2
 */

import { logger } from '../logging.js';

/**
 * Normaliza timestamp do WAF log
 * AWS WAF envia timestamp em milissegundos (13 dígitos)
 * Mas alguns logs antigos podem estar em segundos (10 dígitos)
 * 
 * @param timestamp - Timestamp em segundos ou milissegundos
 * @returns Date object normalizado
 */
function normalizeTimestamp(timestamp: number): Date {
  // Validar que é um número válido
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    logger.warn('Invalid timestamp: not a positive finite number', { timestamp });
    return new Date();
  }
  
  // Limites razoáveis para timestamps
  // Min: 2020-01-01 00:00:00 UTC em milissegundos = 1577836800000
  // Max: 2030-01-01 00:00:00 UTC em milissegundos = 1893456000000
  const MIN_VALID_MS = 1577836800000; // 2020-01-01
  const MAX_VALID_MS = 1893456000000; // 2030-01-01
  const MIN_VALID_SEC = 1577836800;   // 2020-01-01 em segundos
  const MAX_VALID_SEC = 1893456000;   // 2030-01-01 em segundos
  
  // Primeiro, verificar se está em milissegundos (13 dígitos, valor típico ~1.7 trilhão)
  if (timestamp >= MIN_VALID_MS && timestamp <= MAX_VALID_MS) {
    return new Date(timestamp);
  }
  
  // Verificar se está em segundos (10 dígitos, valor típico ~1.7 bilhão)
  if (timestamp >= MIN_VALID_SEC && timestamp <= MAX_VALID_SEC) {
    logger.debug('Converting timestamp from seconds to milliseconds', { 
      original: timestamp,
      converted: timestamp * 1000 
    });
    return new Date(timestamp * 1000);
  }
  
  // Se o timestamp é muito grande (> 2030 em ms), pode ser um bug no log
  // Tentar dividir por 1000 para ver se faz sentido
  if (timestamp > MAX_VALID_MS) {
    const asSeconds = Math.floor(timestamp / 1000);
    if (asSeconds >= MIN_VALID_SEC && asSeconds <= MAX_VALID_SEC) {
      logger.warn('Timestamp appears to be in microseconds, converting', { 
        original: timestamp,
        converted: asSeconds * 1000 
      });
      return new Date(asSeconds * 1000);
    }
  }
  
  // Timestamp inválido - usar data atual como fallback
  logger.warn('Invalid timestamp detected, using current time', { 
    timestamp,
    timestampLength: String(timestamp).length
  });
  return new Date();
}

// WAF Log Types
export interface WafLogHeader {
  name: string;
  value: string;
}

export interface WafLogRuleGroupMatch {
  ruleGroupId: string;
  terminatingRule?: {
    ruleId: string;
    action: string;
    ruleMatchDetails?: unknown[];
  };
  nonTerminatingMatchingRules?: Array<{
    ruleId: string;
    action: string;
    ruleMatchDetails?: unknown[];
  }>;
  excludedRules?: unknown[];
}

export interface WafLogHttpRequest {
  clientIp: string;
  country: string;
  headers: WafLogHeader[];
  uri: string;
  args: string;
  httpVersion: string;
  httpMethod: string;
  requestId: string;
}

export interface WafLogEvent {
  timestamp: number;
  formatVersion: number;
  webaclId: string;
  terminatingRuleId: string;
  terminatingRuleType: string;
  action: 'ALLOW' | 'BLOCK' | 'COUNT' | 'CAPTCHA' | 'CHALLENGE';
  terminatingRuleMatchDetails?: unknown[];
  httpSourceName: string;
  httpSourceId: string;
  ruleGroupList: WafLogRuleGroupMatch[];
  rateBasedRuleList?: unknown[];
  nonTerminatingMatchingRules?: unknown[];
  requestHeadersInserted?: unknown[];
  responseCodeSent?: number;
  httpRequest: WafLogHttpRequest;
  labels?: Array<{ name: string }>;
  captchaResponse?: unknown;
  challengeResponse?: unknown;
  ja3Fingerprint?: string;
}

export interface ParsedWafEvent {
  timestamp: Date;
  action: string;
  sourceIp: string;
  country: string | null;
  region: string | null;
  userAgent: string | null;
  uri: string;
  httpMethod: string;
  ruleMatched: string | null;
  webaclId: string;
  rawLog: WafLogEvent;
}

/**
 * Extract User-Agent header from WAF log headers
 */
function extractUserAgent(headers: WafLogHeader[]): string | null {
  const uaHeader = headers.find(
    h => h.name.toLowerCase() === 'user-agent'
  );
  return uaHeader?.value || null;
}

/**
 * Extract region from country code (simplified)
 * In production, you might want a more comprehensive mapping
 */
function extractRegion(country: string | null): string | null {
  if (!country) return null;
  
  const regionMap: Record<string, string> = {
    // Americas
    'US': 'North America', 'CA': 'North America', 'MX': 'North America',
    'BR': 'South America', 'AR': 'South America', 'CL': 'South America',
    'CO': 'South America', 'PE': 'South America', 'VE': 'South America',
    // Europe
    'GB': 'Europe', 'DE': 'Europe', 'FR': 'Europe', 'IT': 'Europe',
    'ES': 'Europe', 'NL': 'Europe', 'BE': 'Europe', 'PT': 'Europe',
    'PL': 'Europe', 'RU': 'Europe', 'UA': 'Europe', 'SE': 'Europe',
    'NO': 'Europe', 'FI': 'Europe', 'DK': 'Europe', 'CH': 'Europe',
    // Asia
    'CN': 'Asia', 'JP': 'Asia', 'KR': 'Asia', 'IN': 'Asia',
    'SG': 'Asia', 'HK': 'Asia', 'TW': 'Asia', 'TH': 'Asia',
    'VN': 'Asia', 'MY': 'Asia', 'ID': 'Asia', 'PH': 'Asia',
    // Middle East
    'AE': 'Middle East', 'SA': 'Middle East', 'IL': 'Middle East',
    'TR': 'Middle East', 'IR': 'Middle East',
    // Africa
    'ZA': 'Africa', 'EG': 'Africa', 'NG': 'Africa', 'KE': 'Africa',
    // Oceania
    'AU': 'Oceania', 'NZ': 'Oceania',
  };
  
  return regionMap[country] || 'Unknown';
}

/**
 * Get the primary rule that matched (terminated the request)
 */
function extractRuleMatched(log: WafLogEvent): string | null {
  // First check terminatingRuleId
  if (log.terminatingRuleId && log.terminatingRuleId !== 'Default_Action') {
    return log.terminatingRuleId;
  }
  
  // Check rule group list for terminating rules
  for (const ruleGroup of log.ruleGroupList || []) {
    if (ruleGroup.terminatingRule?.ruleId) {
      return `${ruleGroup.ruleGroupId}:${ruleGroup.terminatingRule.ruleId}`;
    }
  }
  
  return null;
}

/**
 * Parse a single WAF log event
 * @param rawLog - Raw WAF log JSON object
 * @returns Parsed WAF event or null if parsing fails
 */
export function parseWafLog(rawLog: unknown): ParsedWafEvent | null {
  try {
    const log = rawLog as WafLogEvent;
    
    // Validate required fields
    if (!log.timestamp || !log.httpRequest || !log.action) {
      logger.warn('WAF log missing required fields', { 
        hasTimestamp: !!log.timestamp,
        hasHttpRequest: !!log.httpRequest,
        hasAction: !!log.action
      });
      return null;
    }
    
    const httpRequest = log.httpRequest;
    
    // Validate HTTP request fields
    if (!httpRequest.clientIp || !httpRequest.uri || !httpRequest.httpMethod) {
      logger.warn('WAF log HTTP request missing required fields', {
        hasClientIp: !!httpRequest.clientIp,
        hasUri: !!httpRequest.uri,
        hasHttpMethod: !!httpRequest.httpMethod
      });
      return null;
    }
    
    const country = httpRequest.country || null;
    
    return {
      timestamp: normalizeTimestamp(log.timestamp),
      action: log.action,
      sourceIp: httpRequest.clientIp,
      country,
      region: extractRegion(country),
      userAgent: extractUserAgent(httpRequest.headers || []),
      uri: httpRequest.uri,
      httpMethod: httpRequest.httpMethod,
      ruleMatched: extractRuleMatched(log),
      webaclId: log.webaclId,
      rawLog: log,
    };
  } catch (error) {
    logger.error('Failed to parse WAF log', error, { rawLog });
    return null;
  }
}

/**
 * Parse multiple WAF log events (batch processing)
 * @param rawLogs - Array of raw WAF log JSON objects
 * @returns Array of successfully parsed events
 */
export function parseWafLogBatch(rawLogs: unknown[]): ParsedWafEvent[] {
  const parsed: ParsedWafEvent[] = [];
  
  for (const rawLog of rawLogs) {
    const event = parseWafLog(rawLog);
    if (event) {
      parsed.push(event);
    }
  }
  
  return parsed;
}

/**
 * Serialize a parsed WAF event back to essential fields
 * Used for round-trip testing
 */
export function serializeWafEvent(event: ParsedWafEvent): {
  timestamp: number;
  action: string;
  sourceIp: string;
  uri: string;
  httpMethod: string;
} {
  return {
    timestamp: event.timestamp.getTime(),
    action: event.action,
    sourceIp: event.sourceIp,
    uri: event.uri,
    httpMethod: event.httpMethod,
  };
}

/**
 * Validate that a WAF log has the expected structure
 */
export function isValidWafLog(log: unknown): log is WafLogEvent {
  if (!log || typeof log !== 'object') return false;
  
  const wafLog = log as Partial<WafLogEvent>;
  
  return (
    typeof wafLog.timestamp === 'number' &&
    typeof wafLog.action === 'string' &&
    typeof wafLog.webaclId === 'string' &&
    wafLog.httpRequest !== undefined &&
    typeof wafLog.httpRequest === 'object' &&
    typeof wafLog.httpRequest.clientIp === 'string' &&
    typeof wafLog.httpRequest.uri === 'string' &&
    typeof wafLog.httpRequest.httpMethod === 'string'
  );
}
