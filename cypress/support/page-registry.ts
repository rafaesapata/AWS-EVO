/**
 * EVO Platform - Frontend Page Registry
 * All protected pages organized by domain for E2E testing
 */

export interface PageDefinition {
  path: string;
  name: string;
  domain: string;
  /** Expected text/element that confirms the page loaded correctly */
  expectedContent: string;
  /** Whether page has tabs */
  hasTabs?: boolean;
  /** Whether page loads data from API */
  loadsData?: boolean;
  /** Page does NOT use <Layout> component (has custom rendering) */
  noLayout?: boolean;
  /** Page takes longer to load (heavy API queries) */
  slowLoad?: boolean;
}

// ============================================================================
// AUTH & PUBLIC PAGES
// ============================================================================
export const PUBLIC_PAGES: PageDefinition[] = [
  { path: '/', name: 'Login', domain: 'auth', expectedContent: 'EVO' },
  { path: '/auth', name: 'Auth', domain: 'auth', expectedContent: 'EVO' },
  { path: '/features', name: 'Features', domain: 'public', expectedContent: 'EVO' },
  { path: '/terms', name: 'Terms of Service', domain: 'public', expectedContent: '' },
];

// ============================================================================
// PROTECTED PAGES - Organized by domain
// ============================================================================
export const DASHBOARD_PAGES: PageDefinition[] = [
  { path: '/app', name: 'Dashboard Executivo', domain: 'dashboard', expectedContent: 'Dashboard', loadsData: true },
  { path: '/dashboard', name: 'Dashboard (alias)', domain: 'dashboard', expectedContent: 'Dashboard', loadsData: true },
];

export const SECURITY_PAGES: PageDefinition[] = [
  { path: '/security-posture', name: 'Security Posture', domain: 'security', expectedContent: '', loadsData: true, hasTabs: true },
  { path: '/security-scans', name: 'Security Scans', domain: 'security', expectedContent: '', loadsData: true, hasTabs: true },
  { path: '/compliance', name: 'Compliance', domain: 'security', expectedContent: '', loadsData: true, hasTabs: true },
  { path: '/cloudtrail-audit', name: 'CloudTrail Audit', domain: 'security', expectedContent: '', loadsData: true },
  { path: '/threat-detection', name: 'Threat Detection', domain: 'security', expectedContent: '', loadsData: true },
  { path: '/attack-detection', name: 'Attack Detection', domain: 'security', expectedContent: '', loadsData: true },
  { path: '/waf-monitoring', name: 'WAF Monitoring', domain: 'security', expectedContent: '', loadsData: true },
  { path: '/well-architected', name: 'Well-Architected', domain: 'security', expectedContent: '', loadsData: true },
  { path: '/remediation-tickets', name: 'Remediation Tickets', domain: 'security', expectedContent: '', loadsData: true },
];

export const COST_PAGES: PageDefinition[] = [
  { path: '/cost-analysis', name: 'Cost Analysis', domain: 'cost', expectedContent: '', loadsData: true },
  { path: '/monthly-invoices', name: 'Monthly Invoices', domain: 'cost', expectedContent: '', loadsData: true },
  { path: '/cost-optimization', name: 'Cost Optimization', domain: 'cost', expectedContent: '', loadsData: true, hasTabs: true },
  { path: '/ri-savings-plans', name: 'RI & Savings Plans', domain: 'cost', expectedContent: '', loadsData: true, hasTabs: true },
];

export const MONITORING_PAGES: PageDefinition[] = [
  { path: '/resource-monitoring', name: 'Resource Monitoring', domain: 'monitoring', expectedContent: '', loadsData: true },
  { path: '/system-monitoring', name: 'System Monitoring', domain: 'monitoring', expectedContent: '', loadsData: true, noLayout: true },
  { path: '/endpoint-monitoring', name: 'Endpoint Monitoring', domain: 'monitoring', expectedContent: '', loadsData: true },
  { path: '/edge-monitoring', name: 'Edge Monitoring', domain: 'monitoring', expectedContent: '', loadsData: true, slowLoad: true, noLayout: true },
  { path: '/intelligent-alerts', name: 'Intelligent Alerts', domain: 'monitoring', expectedContent: '', loadsData: true },
  { path: '/predictive-incidents', name: 'Predictive Incidents', domain: 'monitoring', expectedContent: '', loadsData: true },
  { path: '/anomaly-detection', name: 'Anomaly Detection', domain: 'monitoring', expectedContent: '', loadsData: true },
  { path: '/ml-waste-detection', name: 'ML Waste Detection', domain: 'monitoring', expectedContent: '', loadsData: true },
  { path: '/platform-monitoring', name: 'Platform Monitoring', domain: 'monitoring', expectedContent: '', loadsData: true },
];

export const CLOUD_PAGES: PageDefinition[] = [
  { path: '/cloud-credentials', name: 'Cloud Credentials', domain: 'cloud', expectedContent: '', loadsData: true, hasTabs: true },
  { path: '/aws-settings', name: 'AWS Settings', domain: 'cloud', expectedContent: '', loadsData: true },
];

export const AI_PAGES: PageDefinition[] = [
  { path: '/copilot-ai', name: 'Copilot AI', domain: 'ai', expectedContent: '', loadsData: false },
  { path: '/knowledge-base', name: 'Knowledge Base', domain: 'ai', expectedContent: '', loadsData: true },
  { path: '/bedrock-test', name: 'Bedrock Test', domain: 'ai', expectedContent: '', loadsData: false },
];

export const OPERATIONS_PAGES: PageDefinition[] = [
  { path: '/background-jobs', name: 'Background Jobs', domain: 'operations', expectedContent: '', loadsData: true },
  { path: '/user-management', name: 'User Management', domain: 'operations', expectedContent: '', loadsData: true },
  { path: '/organizations', name: 'Organizations', domain: 'operations', expectedContent: '', loadsData: true },
  { path: '/audit-log', name: 'Audit Log', domain: 'operations', expectedContent: '', loadsData: true },
  { path: '/admin/ai-notifications', name: 'AI Notifications Admin', domain: 'operations', expectedContent: '', loadsData: true },
  { path: '/tv-dashboards', name: 'TV Dashboard Management', domain: 'operations', expectedContent: '', loadsData: true },
];

export const INTEGRATIONS_PAGES: PageDefinition[] = [
  { path: '/license-management', name: 'License Management', domain: 'integrations', expectedContent: '', loadsData: true },
  { path: '/communication-center', name: 'Communication Center', domain: 'integrations', expectedContent: '', loadsData: true },
];

export const MISC_PAGES: PageDefinition[] = [
  { path: '/change-password', name: 'Change Password', domain: 'auth', expectedContent: '', loadsData: false, noLayout: true },
  { path: '/api-docs', name: 'API Docs', domain: 'operations', expectedContent: '', loadsData: false },
];

/** All protected pages combined */
export const ALL_PROTECTED_PAGES: PageDefinition[] = [
  ...DASHBOARD_PAGES,
  ...SECURITY_PAGES,
  ...COST_PAGES,
  ...MONITORING_PAGES,
  ...CLOUD_PAGES,
  ...AI_PAGES,
  ...OPERATIONS_PAGES,
  ...INTEGRATIONS_PAGES,
  ...MISC_PAGES,
];

/** Group pages by domain */
export function getPagesByDomain(): Record<string, PageDefinition[]> {
  return ALL_PROTECTED_PAGES.reduce<Record<string, PageDefinition[]>>((acc, page) => {
    (acc[page.domain] = acc[page.domain] || []).push(page);
    return acc;
  }, {});
}
