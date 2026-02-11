/**
 * Menu Items Definition
 * Complete mapping of all sidebar menu items in EVO UDS
 */

export interface MenuItem {
  name: string;
  value: string;
  route: string;
  hasSubItems: boolean;
  subItems?: MenuItem[];
  requiresSuperAdmin: boolean;
  selector?: string;
}

export const MENU_ITEMS: MenuItem[] = [
  { 
    name: 'Executive Dashboard', 
    value: 'executive', 
    route: '/app', 
    hasSubItems: false, 
    requiresSuperAdmin: false 
  },
  { 
    name: 'Cost Analysis', 
    value: 'costs', 
    route: '/app?tab=costs', 
    hasSubItems: true, 
    requiresSuperAdmin: false,
    subItems: [
      { name: 'Detailed Analysis', value: 'cost-analysis', route: '/app?tab=cost-analysis', hasSubItems: false, requiresSuperAdmin: false },
      { name: 'Monthly Invoices', value: 'invoices', route: '/app?tab=invoices', hasSubItems: false, requiresSuperAdmin: false },
    ]
  },
  { 
    name: 'Copilot AI', 
    value: 'copilot', 
    route: '/copilot-ai', 
    hasSubItems: false, 
    requiresSuperAdmin: false 
  },
  {
    name: 'ML Predictions', 
    value: 'ml', 
    route: '/predictive-incidents', 
    hasSubItems: true, 
    requiresSuperAdmin: false,
    subItems: [
      { name: 'Predictive Incidents', value: 'ml', route: '/predictive-incidents', hasSubItems: false, requiresSuperAdmin: false },
      { name: 'Anomaly Detection', value: 'anomalies', route: '/anomaly-detection', hasSubItems: false, requiresSuperAdmin: false },
    ]
  },
  {
    name: 'Monitoring', 
    value: 'monitoring', 
    route: '/app?tab=monitoring', 
    hasSubItems: true, 
    requiresSuperAdmin: false,
    subItems: [
      { name: 'Endpoints', value: 'endpoint-monitoring', route: '/endpoint-monitoring', hasSubItems: false, requiresSuperAdmin: false },
      { name: 'Resources', value: 'resource-monitoring', route: '/resource-monitoring', hasSubItems: false, requiresSuperAdmin: false },
      { name: 'Edge/LB/CF/WAF', value: 'edge-monitoring', route: '/edge-monitoring', hasSubItems: false, requiresSuperAdmin: false },
    ]
  },
  { 
    name: 'Attack Detection', 
    value: 'attack-detection', 
    route: '/attack-detection', 
    hasSubItems: false, 
    requiresSuperAdmin: false 
  },
  {
    name: 'Analysis & Scans', 
    value: 'scans', 
    route: '/security-scans', 
    hasSubItems: true, 
    requiresSuperAdmin: false,
    subItems: [
      { name: 'Security Scans', value: 'scans', route: '/security-scans', hasSubItems: false, requiresSuperAdmin: false },
      { name: 'Audit Logs', value: 'cloudtrail-audit', route: '/cloudtrail-audit', hasSubItems: false, requiresSuperAdmin: false },
      { name: 'Compliance', value: 'compliance', route: '/compliance', hasSubItems: false, requiresSuperAdmin: false },
      { name: 'Well-Architected', value: 'well-architected', route: '/well-architected', hasSubItems: false, requiresSuperAdmin: false },
      { name: 'AWS Security Analysis', value: 'security-analysis', route: '/app?tab=security-analysis', hasSubItems: false, requiresSuperAdmin: false },
    ]
  },
  {
    name: 'Optimization', 
    value: 'optimization', 
    route: '/app?tab=optimization', 
    hasSubItems: true, 
    requiresSuperAdmin: false,
    subItems: [
      { name: 'Cost Optimization', value: 'advanced', route: '/cost-optimization', hasSubItems: false, requiresSuperAdmin: false },
      { name: 'RI & Savings Plans', value: 'risp', route: '/ri-savings-plans', hasSubItems: false, requiresSuperAdmin: false },
      { name: 'Waste Detection', value: 'waste', route: '/app?tab=waste', hasSubItems: false, requiresSuperAdmin: false },
    ]
  },
  { 
    name: 'Intelligent Alerts', 
    value: 'alerts', 
    route: '/intelligent-alerts', 
    hasSubItems: false, 
    requiresSuperAdmin: false 
  },
  { 
    name: 'Security Posture', 
    value: 'security', 
    route: '/security-posture', 
    hasSubItems: false, 
    requiresSuperAdmin: false 
  },
  { 
    name: 'Remediation Tickets', 
    value: 'tickets', 
    route: '/remediation-tickets', 
    hasSubItems: false, 
    requiresSuperAdmin: false 
  },
  { 
    name: 'Knowledge Base', 
    value: 'knowledge-base', 
    route: '/knowledge-base', 
    hasSubItems: false, 
    requiresSuperAdmin: false 
  },
  { 
    name: 'TV Dashboards', 
    value: 'tv-dashboards', 
    route: '/tv', 
    hasSubItems: false, 
    requiresSuperAdmin: false 
  },
  { 
    name: 'Audit', 
    value: 'audit', 
    route: '/app?tab=audit', 
    hasSubItems: false, 
    requiresSuperAdmin: false 
  },
  { 
    name: 'Communication Center', 
    value: 'communication-center', 
    route: '/communication-center', 
    hasSubItems: false, 
    requiresSuperAdmin: false 
  },
  { 
    name: 'License', 
    value: 'license', 
    route: '/license-management', 
    hasSubItems: false, 
    requiresSuperAdmin: false 
  },
  { 
    name: 'AWS Settings', 
    value: 'aws-settings', 
    route: '/aws-settings', 
    hasSubItems: false, 
    requiresSuperAdmin: false 
  },
  { 
    name: 'Manage Users', 
    value: 'users', 
    route: '/app?tab=users', 
    hasSubItems: false, 
    requiresSuperAdmin: false 
  },
  { 
    name: 'Organizations', 
    value: 'organizations', 
    route: '/app?tab=organizations', 
    hasSubItems: false, 
    requiresSuperAdmin: true 
  },
  { 
    name: 'Scheduled Jobs', 
    value: 'scheduled-jobs', 
    route: '/background-jobs', 
    hasSubItems: false, 
    requiresSuperAdmin: true 
  },
  { 
    name: 'Dev Tools', 
    value: 'devtools', 
    route: '/bedrock-test', 
    hasSubItems: false, 
    requiresSuperAdmin: true 
  },
  { 
    name: 'Setup', 
    value: 'setup', 
    route: '/app?tab=setup', 
    hasSubItems: false, 
    requiresSuperAdmin: false 
  },
];

/**
 * Get all menu items flattened (including sub-items)
 */
export function getAllMenuItems(includeSuperAdmin = false): MenuItem[] {
  const items: MenuItem[] = [];
  
  for (const item of MENU_ITEMS) {
    if (item.requiresSuperAdmin && !includeSuperAdmin) continue;
    
    if (item.hasSubItems && item.subItems) {
      // Add parent for reference
      items.push({ ...item, subItems: undefined });
      // Add all sub-items
      for (const subItem of item.subItems) {
        if (subItem.requiresSuperAdmin && !includeSuperAdmin) continue;
        items.push(subItem);
      }
    } else {
      items.push(item);
    }
  }
  
  return items;
}

/**
 * Get menu item by value
 */
export function getMenuItemByValue(value: string): MenuItem | undefined {
  for (const item of MENU_ITEMS) {
    if (item.value === value) return item;
    if (item.subItems) {
      const subItem = item.subItems.find(s => s.value === value);
      if (subItem) return subItem;
    }
  }
  return undefined;
}
