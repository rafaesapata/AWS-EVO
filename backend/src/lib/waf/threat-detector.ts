/**
 * WAF Threat Detection Module
 * Analyzes WAF events to detect attack patterns and classify threats
 */

import { logger } from '../logging.js';
import type { ParsedWafEvent } from './parser.js';

// Threat Types
export type ThreatType =
  | 'sql_injection'
  | 'xss'
  | 'path_traversal'
  | 'command_injection'
  | 'scanner_detected'
  | 'sensitive_path_access'
  | 'rate_limit_exceeded'
  | 'suspicious_user_agent'
  | 'bot_detected'
  | 'credential_stuffing'
  | 'unknown';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface ThreatAnalysis {
  threatType: ThreatType;
  severity: Severity;
  confidence: number; // 0.0 to 1.0
  indicators: string[];
  recommendedAction: 'monitor' | 'alert' | 'block';
}

// Suspicious User-Agent patterns
const SUSPICIOUS_USER_AGENTS: Array<{ pattern: RegExp; name: string; severity: Severity }> = [
  // Security scanners
  { pattern: /sqlmap/i, name: 'SQLMap Scanner', severity: 'critical' },
  { pattern: /nikto/i, name: 'Nikto Scanner', severity: 'critical' },
  { pattern: /nmap/i, name: 'Nmap Scanner', severity: 'high' },
  { pattern: /masscan/i, name: 'Masscan Scanner', severity: 'high' },
  { pattern: /gobuster/i, name: 'Gobuster', severity: 'high' },
  { pattern: /dirbuster/i, name: 'DirBuster', severity: 'high' },
  { pattern: /burp\s*suite/i, name: 'Burp Suite', severity: 'high' },
  { pattern: /owasp/i, name: 'OWASP Scanner', severity: 'high' },
  { pattern: /acunetix/i, name: 'Acunetix Scanner', severity: 'high' },
  { pattern: /nessus/i, name: 'Nessus Scanner', severity: 'high' },
  { pattern: /qualys/i, name: 'Qualys Scanner', severity: 'medium' },
  { pattern: /nuclei/i, name: 'Nuclei Scanner', severity: 'high' },
  { pattern: /wpscan/i, name: 'WPScan', severity: 'high' },
  { pattern: /joomscan/i, name: 'JoomScan', severity: 'high' },
  
  // Bots and crawlers (suspicious)
  { pattern: /^$/i, name: 'Empty User-Agent', severity: 'medium' },
  { pattern: /^-$/i, name: 'Dash User-Agent', severity: 'medium' },
  { pattern: /python-requests/i, name: 'Python Requests', severity: 'low' },
  { pattern: /python-urllib/i, name: 'Python urllib', severity: 'low' },
  { pattern: /^curl\//i, name: 'cURL', severity: 'low' },
  { pattern: /^wget\//i, name: 'wget', severity: 'low' },
  { pattern: /libwww-perl/i, name: 'Perl LWP', severity: 'medium' },
  { pattern: /java\//i, name: 'Java Client', severity: 'low' },
  { pattern: /go-http-client/i, name: 'Go HTTP Client', severity: 'low' },
  
  // Known malicious
  { pattern: /zgrab/i, name: 'ZGrab Scanner', severity: 'high' },
  { pattern: /censys/i, name: 'Censys Scanner', severity: 'medium' },
  { pattern: /shodan/i, name: 'Shodan Scanner', severity: 'medium' },
];

// Sensitive paths that should not be accessed
const SENSITIVE_PATHS: Array<{ pattern: RegExp; name: string; severity: Severity }> = [
  // API Documentation
  { pattern: /\/swagger/i, name: 'Swagger UI', severity: 'high' },
  { pattern: /\/api-docs/i, name: 'API Docs', severity: 'high' },
  { pattern: /\/openapi/i, name: 'OpenAPI Spec', severity: 'high' },
  { pattern: /\/graphql/i, name: 'GraphQL Endpoint', severity: 'medium' },
  { pattern: /\/graphiql/i, name: 'GraphiQL', severity: 'high' },
  
  // Configuration files
  { pattern: /\/\.env/i, name: '.env file', severity: 'critical' },
  { pattern: /\/\.git/i, name: '.git directory', severity: 'critical' },
  { pattern: /\/\.svn/i, name: '.svn directory', severity: 'critical' },
  { pattern: /\/\.htaccess/i, name: '.htaccess', severity: 'high' },
  { pattern: /\/\.htpasswd/i, name: '.htpasswd', severity: 'critical' },
  { pattern: /\/config\.php/i, name: 'config.php', severity: 'high' },
  { pattern: /\/wp-config\.php/i, name: 'wp-config.php', severity: 'critical' },
  { pattern: /\/web\.config/i, name: 'web.config', severity: 'high' },
  
  // Admin panels
  { pattern: /\/admin/i, name: 'Admin Panel', severity: 'medium' },
  { pattern: /\/wp-admin/i, name: 'WordPress Admin', severity: 'high' },
  { pattern: /\/wp-login/i, name: 'WordPress Login', severity: 'medium' },
  { pattern: /\/phpmyadmin/i, name: 'phpMyAdmin', severity: 'critical' },
  { pattern: /\/adminer/i, name: 'Adminer', severity: 'critical' },
  { pattern: /\/manager\/html/i, name: 'Tomcat Manager', severity: 'critical' },
  
  // Debug/monitoring endpoints
  { pattern: /\/actuator/i, name: 'Spring Actuator', severity: 'high' },
  { pattern: /\/health/i, name: 'Health Check', severity: 'low' },
  { pattern: /\/metrics/i, name: 'Metrics Endpoint', severity: 'medium' },
  { pattern: /\/debug/i, name: 'Debug Endpoint', severity: 'high' },
  { pattern: /\/console/i, name: 'Console', severity: 'high' },
  { pattern: /\/trace/i, name: 'Trace Endpoint', severity: 'high' },
  
  // Backup files
  { pattern: /\.bak$/i, name: 'Backup File', severity: 'high' },
  { pattern: /\.backup$/i, name: 'Backup File', severity: 'high' },
  { pattern: /\.old$/i, name: 'Old File', severity: 'medium' },
  { pattern: /\.sql$/i, name: 'SQL File', severity: 'critical' },
  { pattern: /\.dump$/i, name: 'Dump File', severity: 'critical' },
];

// Attack signatures in URI/query parameters
const ATTACK_SIGNATURES: Array<{ 
  pattern: RegExp; 
  type: ThreatType; 
  name: string; 
  severity: Severity 
}> = [
  // SQL Injection
  { pattern: /union\s+(all\s+)?select/i, type: 'sql_injection', name: 'UNION SELECT', severity: 'critical' },
  { pattern: /'\s*or\s+'?1'?\s*=\s*'?1/i, type: 'sql_injection', name: 'OR 1=1', severity: 'critical' },
  { pattern: /'\s*or\s+'?'?\s*=\s*'?/i, type: 'sql_injection', name: 'OR empty', severity: 'high' },
  { pattern: /;\s*drop\s+table/i, type: 'sql_injection', name: 'DROP TABLE', severity: 'critical' },
  { pattern: /;\s*delete\s+from/i, type: 'sql_injection', name: 'DELETE FROM', severity: 'critical' },
  { pattern: /;\s*insert\s+into/i, type: 'sql_injection', name: 'INSERT INTO', severity: 'high' },
  { pattern: /;\s*update\s+\w+\s+set/i, type: 'sql_injection', name: 'UPDATE SET', severity: 'high' },
  { pattern: /sleep\s*\(\s*\d+\s*\)/i, type: 'sql_injection', name: 'SLEEP()', severity: 'high' },
  { pattern: /benchmark\s*\(/i, type: 'sql_injection', name: 'BENCHMARK()', severity: 'high' },
  { pattern: /waitfor\s+delay/i, type: 'sql_injection', name: 'WAITFOR DELAY', severity: 'high' },
  
  // XSS
  { pattern: /<script[^>]*>/i, type: 'xss', name: 'Script Tag', severity: 'high' },
  { pattern: /javascript\s*:/i, type: 'xss', name: 'JavaScript Protocol', severity: 'high' },
  { pattern: /on(error|load|click|mouse|focus|blur)\s*=/i, type: 'xss', name: 'Event Handler', severity: 'high' },
  { pattern: /<iframe[^>]*>/i, type: 'xss', name: 'Iframe Tag', severity: 'high' },
  { pattern: /<img[^>]+onerror/i, type: 'xss', name: 'Img onerror', severity: 'high' },
  { pattern: /expression\s*\(/i, type: 'xss', name: 'CSS Expression', severity: 'medium' },
  { pattern: /data\s*:\s*text\/html/i, type: 'xss', name: 'Data URI HTML', severity: 'high' },
  
  // Path Traversal
  { pattern: /\.\.\//g, type: 'path_traversal', name: 'Directory Traversal', severity: 'high' },
  { pattern: /\.\.\\/, type: 'path_traversal', name: 'Windows Traversal', severity: 'high' },
  { pattern: /%2e%2e[%\/\\]/i, type: 'path_traversal', name: 'Encoded Traversal', severity: 'high' },
  { pattern: /\/etc\/passwd/i, type: 'path_traversal', name: '/etc/passwd', severity: 'critical' },
  { pattern: /\/etc\/shadow/i, type: 'path_traversal', name: '/etc/shadow', severity: 'critical' },
  { pattern: /c:\\windows/i, type: 'path_traversal', name: 'Windows Path', severity: 'high' },
  
  // Command Injection
  { pattern: /;\s*cat\s+/i, type: 'command_injection', name: 'cat command', severity: 'critical' },
  { pattern: /\|\s*ls\s*/i, type: 'command_injection', name: 'ls command', severity: 'critical' },
  { pattern: /`[^`]+`/, type: 'command_injection', name: 'Backtick Execution', severity: 'critical' },
  { pattern: /\$\([^)]+\)/, type: 'command_injection', name: 'Command Substitution', severity: 'critical' },
  { pattern: /;\s*wget\s+/i, type: 'command_injection', name: 'wget command', severity: 'critical' },
  { pattern: /;\s*curl\s+/i, type: 'command_injection', name: 'curl command', severity: 'critical' },
  { pattern: /;\s*nc\s+/i, type: 'command_injection', name: 'netcat command', severity: 'critical' },
  { pattern: /;\s*bash\s+/i, type: 'command_injection', name: 'bash command', severity: 'critical' },
  { pattern: /;\s*sh\s+/i, type: 'command_injection', name: 'sh command', severity: 'critical' },
  { pattern: /;\s*python\s+/i, type: 'command_injection', name: 'python command', severity: 'critical' },
  { pattern: /;\s*perl\s+/i, type: 'command_injection', name: 'perl command', severity: 'critical' },
];

/**
 * Detect suspicious user-agent patterns
 */
export function detectSuspiciousUserAgent(userAgent: string | null): {
  isSuspicious: boolean;
  matches: Array<{ name: string; severity: Severity }>;
} {
  if (!userAgent) {
    return {
      isSuspicious: true,
      matches: [{ name: 'Empty User-Agent', severity: 'medium' }],
    };
  }
  
  const matches: Array<{ name: string; severity: Severity }> = [];
  
  for (const { pattern, name, severity } of SUSPICIOUS_USER_AGENTS) {
    if (pattern.test(userAgent)) {
      matches.push({ name, severity });
    }
  }
  
  return {
    isSuspicious: matches.length > 0,
    matches,
  };
}

/**
 * Detect sensitive path access attempts
 */
export function detectSensitivePathAccess(uri: string): {
  isSensitive: boolean;
  matches: Array<{ name: string; severity: Severity }>;
} {
  const matches: Array<{ name: string; severity: Severity }> = [];
  
  for (const { pattern, name, severity } of SENSITIVE_PATHS) {
    if (pattern.test(uri)) {
      matches.push({ name, severity });
    }
  }
  
  return {
    isSensitive: matches.length > 0,
    matches,
  };
}

/**
 * Detect attack signatures in URI
 */
export function detectAttackSignatures(uri: string): {
  hasAttack: boolean;
  matches: Array<{ type: ThreatType; name: string; severity: Severity }>;
} {
  const matches: Array<{ type: ThreatType; name: string; severity: Severity }> = [];
  
  // Decode URI for better detection
  let decodedUri = uri;
  try {
    decodedUri = decodeURIComponent(uri);
  } catch {
    // Keep original if decode fails
  }
  
  for (const { pattern, type, name, severity } of ATTACK_SIGNATURES) {
    if (pattern.test(decodedUri)) {
      matches.push({ type, name, severity });
    }
  }
  
  return {
    hasAttack: matches.length > 0,
    matches,
  };
}

/**
 * Get the highest severity from a list
 */
function getHighestSeverity(severities: Severity[]): Severity {
  const order: Severity[] = ['critical', 'high', 'medium', 'low'];
  for (const sev of order) {
    if (severities.includes(sev)) {
      return sev;
    }
  }
  return 'low';
}

/**
 * Analyze a WAF event for threats
 */
export function analyzeWafEvent(event: ParsedWafEvent): ThreatAnalysis {
  const indicators: string[] = [];
  const severities: Severity[] = [];
  let threatType: ThreatType = 'unknown';
  let confidence = 0.5;
  
  // Check user-agent
  const uaAnalysis = detectSuspiciousUserAgent(event.userAgent);
  if (uaAnalysis.isSuspicious) {
    for (const match of uaAnalysis.matches) {
      indicators.push(`Suspicious User-Agent: ${match.name}`);
      severities.push(match.severity);
    }
    
    // Scanner detection takes priority
    const scannerMatch = uaAnalysis.matches.find(m => 
      m.name.includes('Scanner') || m.name.includes('Scan')
    );
    if (scannerMatch) {
      threatType = 'scanner_detected';
      confidence = 0.9;
    } else {
      threatType = 'suspicious_user_agent';
      confidence = 0.7;
    }
  }
  
  // Check sensitive paths
  const pathAnalysis = detectSensitivePathAccess(event.uri);
  if (pathAnalysis.isSensitive) {
    for (const match of pathAnalysis.matches) {
      indicators.push(`Sensitive Path Access: ${match.name}`);
      severities.push(match.severity);
    }
    
    if (threatType === 'unknown' || threatType === 'suspicious_user_agent') {
      threatType = 'sensitive_path_access';
      confidence = Math.max(confidence, 0.8);
    }
  }
  
  // Check attack signatures
  const attackAnalysis = detectAttackSignatures(event.uri);
  if (attackAnalysis.hasAttack) {
    for (const match of attackAnalysis.matches) {
      indicators.push(`Attack Signature: ${match.name}`);
      severities.push(match.severity);
    }
    
    // Attack signatures take highest priority
    const primaryAttack = attackAnalysis.matches[0];
    if (primaryAttack) {
      threatType = primaryAttack.type;
      confidence = 0.95;
    }
  }
  
  // If blocked by WAF, increase confidence
  if (event.action === 'BLOCK') {
    confidence = Math.min(confidence + 0.1, 1.0);
    if (event.ruleMatched) {
      indicators.push(`WAF Rule Matched: ${event.ruleMatched}`);
    }
  }
  
  // Determine severity
  const severity = severities.length > 0 
    ? getHighestSeverity(severities) 
    : (event.action === 'BLOCK' ? 'medium' : 'low');
  
  // Determine recommended action
  let recommendedAction: 'monitor' | 'alert' | 'block' = 'monitor';
  if (severity === 'critical') {
    recommendedAction = 'block';
  } else if (severity === 'high' || (severity === 'medium' && confidence > 0.8)) {
    recommendedAction = 'alert';
  }
  
  return {
    threatType,
    severity,
    confidence,
    indicators,
    recommendedAction,
  };
}

/**
 * Calculate severity based on attack type and frequency
 */
export function calculateSeverity(
  threatType: ThreatType,
  eventCount: number = 1,
  isBlocked: boolean = false
): Severity {
  // Base severity by threat type
  const baseSeverity: Record<ThreatType, Severity> = {
    sql_injection: 'critical',
    command_injection: 'critical',
    path_traversal: 'high',
    xss: 'high',
    scanner_detected: 'high',
    sensitive_path_access: 'medium',
    rate_limit_exceeded: 'medium',
    suspicious_user_agent: 'low',
    bot_detected: 'low',
    credential_stuffing: 'high',
    unknown: 'low',
  };
  
  let severity = baseSeverity[threatType];
  
  // Escalate based on frequency
  if (eventCount >= 100) {
    severity = 'critical';
  } else if (eventCount >= 50 && severity !== 'critical') {
    severity = 'high';
  } else if (eventCount >= 10 && severity === 'low') {
    severity = 'medium';
  }
  
  // If not blocked, might be more concerning (bypassed WAF)
  if (!isBlocked && threatType !== 'unknown') {
    const severityOrder: Severity[] = ['low', 'medium', 'high', 'critical'];
    const currentIndex = severityOrder.indexOf(severity);
    if (currentIndex < severityOrder.length - 1) {
      severity = severityOrder[currentIndex + 1];
    }
  }
  
  return severity;
}
