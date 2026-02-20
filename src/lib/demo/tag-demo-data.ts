/**
 * Demo data for Tag Management feature.
 * ONLY used when isDemoMode === true (verified by backend).
 * Never imported or rendered in normal mode.
 */

import type { Tag, CoverageMetrics, CostReportResult, TagTemplate } from '@/hooks/useTags';

const DEMO_TAGS: Tag[] = [
  { id: 'demo-tag-001', key: 'environment', value: 'production', color: '#EF4444', category: 'ENVIRONMENT', description: 'Production workloads', usage_count: 142, created_at: '2025-11-15T10:00:00Z' },
  { id: 'demo-tag-002', key: 'environment', value: 'staging', color: '#F59E0B', category: 'ENVIRONMENT', description: 'Staging environment', usage_count: 87, created_at: '2025-11-15T10:05:00Z' },
  { id: 'demo-tag-003', key: 'environment', value: 'development', color: '#3B82F6', category: 'ENVIRONMENT', description: 'Development environment', usage_count: 63, created_at: '2025-11-15T10:10:00Z' },
  { id: 'demo-tag-004', key: 'cost-center', value: 'engineering', color: '#8B5CF6', category: 'COST_CENTER', description: 'Engineering department', usage_count: 198, created_at: '2025-11-20T08:00:00Z' },
  { id: 'demo-tag-005', key: 'cost-center', value: 'marketing', color: '#EC4899', category: 'COST_CENTER', description: 'Marketing department', usage_count: 45, created_at: '2025-11-20T08:05:00Z' },
  { id: 'demo-tag-006', key: 'cost-center', value: 'data-science', color: '#14B8A6', category: 'COST_CENTER', description: 'Data Science team', usage_count: 34, created_at: '2025-11-20T08:10:00Z' },
  { id: 'demo-tag-007', key: 'team', value: 'platform', color: '#06B6D4', category: 'TEAM', description: 'Platform team', usage_count: 112, created_at: '2025-12-01T09:00:00Z' },
  { id: 'demo-tag-008', key: 'team', value: 'backend', color: '#10B981', category: 'TEAM', description: 'Backend team', usage_count: 89, created_at: '2025-12-01T09:05:00Z' },
  { id: 'demo-tag-009', key: 'team', value: 'frontend', color: '#F97316', category: 'TEAM', description: 'Frontend team', usage_count: 56, created_at: '2025-12-01T09:10:00Z' },
  { id: 'demo-tag-010', key: 'project', value: 'evo-platform', color: '#6366F1', category: 'PROJECT', description: 'EVO Platform project', usage_count: 234, created_at: '2025-12-05T14:00:00Z' },
  { id: 'demo-tag-011', key: 'project', value: 'data-pipeline', color: '#0EA5E9', category: 'PROJECT', description: 'Data Pipeline project', usage_count: 67, created_at: '2025-12-05T14:05:00Z' },
  { id: 'demo-tag-012', key: 'compliance', value: 'pci-dss', color: '#DC2626', category: 'COMPLIANCE', description: 'PCI DSS compliant resources', usage_count: 28, created_at: '2025-12-10T11:00:00Z' },
  { id: 'demo-tag-013', key: 'compliance', value: 'hipaa', color: '#B91C1C', category: 'COMPLIANCE', description: 'HIPAA compliant resources', usage_count: 15, created_at: '2025-12-10T11:05:00Z' },
  { id: 'demo-tag-014', key: 'criticality', value: 'high', color: '#EF4444', category: 'CRITICALITY', description: 'High criticality resources', usage_count: 76, created_at: '2025-12-12T16:00:00Z' },
  { id: 'demo-tag-015', key: 'criticality', value: 'medium', color: '#F59E0B', category: 'CRITICALITY', description: 'Medium criticality', usage_count: 124, created_at: '2025-12-12T16:05:00Z' },
  { id: 'demo-tag-016', key: 'criticality', value: 'low', color: '#22C55E', category: 'CRITICALITY', description: 'Low criticality', usage_count: 89, created_at: '2025-12-12T16:10:00Z' },
  { id: 'demo-tag-017', key: 'backup', value: 'daily', color: '#7C3AED', category: 'CUSTOM', description: 'Daily backup policy', usage_count: 52, created_at: '2025-12-15T13:00:00Z' },
  { id: 'demo-tag-018', key: 'auto-shutdown', value: 'enabled', color: '#059669', category: 'CUSTOM', description: 'Auto-shutdown enabled', usage_count: 31, created_at: '2025-12-15T13:05:00Z' },
];

export function generateDemoTags(): { tags: Tag[]; total: number } {
  return { tags: DEMO_TAGS, total: DEMO_TAGS.length };
}

export function filterDemoTags(params?: { category?: string; search?: string }): { tags: Tag[]; total: number } {
  let filtered = [...DEMO_TAGS];
  if (params?.category) {
    filtered = filtered.filter(t => t.category === params.category);
  }
  if (params?.search) {
    const s = params.search.toLowerCase();
    filtered = filtered.filter(t => t.key.includes(s) || t.value.includes(s) || (t.description || '').toLowerCase().includes(s));
  }
  return { tags: filtered, total: filtered.length };
}

export function generateDemoCoverage(): CoverageMetrics {
  return {
    total_resources: 487,
    tagged_resources: 342,
    untagged_resources: 145,
    coverage_percentage: 70.2,
    breakdown_by_provider: {
      AWS: { total: 356, tagged: 267 },
      AZURE: { total: 131, tagged: 75 },
    },
  };
}

export function generateDemoCostReport(tagId: string): CostReportResult {
  const tag = DEMO_TAGS.find(t => t.id === tagId);
  const base = tag?.key === 'environment' && tag?.value === 'production' ? 12450 : 
               tag?.key === 'cost-center' ? 8320 : 4150;
  
  const now = new Date();
  const timeSeries = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (29 - i));
    return {
      date: d.toISOString().split('T')[0],
      cost: base / 30 + (Math.random() - 0.5) * (base / 60),
    };
  });

  return {
    totalCost: base,
    costByService: {
      'Amazon EC2': base * 0.42,
      'Amazon RDS': base * 0.23,
      'Amazon S3': base * 0.12,
      'AWS Lambda': base * 0.08,
      'Amazon CloudFront': base * 0.06,
      'Other': base * 0.09,
    },
    costByProvider: { AWS: base * 0.78, AZURE: base * 0.22 },
    timeSeries,
    resourceCount: tag?.usage_count || 50,
    disclaimer: 'Demo data — costs are illustrative and do not represent real billing.',
  };
}

export function generateDemoSecurityFindings(tagIds: string[]) {
  if (tagIds.length === 0) return { findings: [], total: 0 };
  
  const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const statuses = ['ACTIVE', 'RESOLVED', 'SUPPRESSED'];
  const titles = [
    'S3 Bucket Public Access Enabled',
    'Security Group Allows Unrestricted Ingress',
    'IAM User Without MFA',
    'RDS Instance Not Encrypted',
    'CloudTrail Logging Disabled',
    'EBS Volume Not Encrypted',
    'Lambda Function with Excessive Permissions',
    'EC2 Instance in Public Subnet Without WAF',
    'KMS Key Rotation Not Enabled',
    'VPC Flow Logs Not Enabled',
    'Root Account Access Key Active',
    'Unused IAM Credentials',
  ];

  const findings = titles.map((title, i) => ({
    id: `demo-finding-${i}`,
    title,
    severity: severities[i % severities.length],
    status: i < 8 ? 'ACTIVE' : statuses[Math.floor(Math.random() * statuses.length)],
    resource_id: `arn:aws:${['s3', 'ec2', 'iam', 'rds', 'lambda', 'kms'][i % 6]}:us-east-1:123456789012:demo-resource-${i}`,
    cloud_provider: i < 9 ? 'AWS' : 'AZURE',
    created_at: new Date(Date.now() - i * 86400000 * 3).toISOString(),
    _isDemo: true,
  }));

  return { findings, total: findings.length };
}

export function generateDemoTemplates(): TagTemplate[] {
  return [
    {
      id: 'tpl-env', name: 'Environment', description: 'Standard environment tags (production, staging, development)',
      tags: [
        { key: 'environment', value: 'production', color: '#EF4444', category: 'ENVIRONMENT' },
        { key: 'environment', value: 'staging', color: '#F59E0B', category: 'ENVIRONMENT' },
        { key: 'environment', value: 'development', color: '#3B82F6', category: 'ENVIRONMENT' },
      ],
    },
    {
      id: 'tpl-cost', name: 'Cost Center', description: 'Cost allocation tags by department',
      tags: [
        { key: 'cost-center', value: 'engineering', color: '#8B5CF6', category: 'COST_CENTER' },
        { key: 'cost-center', value: 'marketing', color: '#EC4899', category: 'COST_CENTER' },
        { key: 'cost-center', value: 'operations', color: '#14B8A6', category: 'COST_CENTER' },
      ],
    },
    {
      id: 'tpl-team', name: 'Team', description: 'Team ownership tags',
      tags: [
        { key: 'team', value: 'platform', color: '#06B6D4', category: 'TEAM' },
        { key: 'team', value: 'backend', color: '#10B981', category: 'TEAM' },
        { key: 'team', value: 'frontend', color: '#F97316', category: 'TEAM' },
      ],
    },
    {
      id: 'tpl-crit', name: 'Criticality', description: 'Resource criticality classification',
      tags: [
        { key: 'criticality', value: 'high', color: '#EF4444', category: 'CRITICALITY' },
        { key: 'criticality', value: 'medium', color: '#F59E0B', category: 'CRITICALITY' },
        { key: 'criticality', value: 'low', color: '#22C55E', category: 'CRITICALITY' },
      ],
    },
    {
      id: 'tpl-compliance', name: 'Compliance', description: 'Compliance framework tags',
      tags: [
        { key: 'compliance', value: 'pci-dss', color: '#DC2626', category: 'COMPLIANCE' },
        { key: 'compliance', value: 'hipaa', color: '#B91C1C', category: 'COMPLIANCE' },
        { key: 'compliance', value: 'soc2', color: '#9333EA', category: 'COMPLIANCE' },
      ],
    },
    {
      id: 'tpl-project', name: 'Project', description: 'Project identification tags',
      tags: [
        { key: 'project', value: 'main-app', color: '#6366F1', category: 'PROJECT' },
        { key: 'project', value: 'data-pipeline', color: '#0EA5E9', category: 'PROJECT' },
      ],
    },
  ];
}
