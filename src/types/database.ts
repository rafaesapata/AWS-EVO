/**
 * Type-safe database interfaces
 * Replaces 'any' types with proper TypeScript interfaces
 */

// Interfaces específicas para campos JSON
export interface CloudTrailUserIdentity {
  type: 'IAMUser' | 'AssumedRole' | 'FederatedUser' | 'Root' | 'AWSService' | 'Unknown';
  principalId?: string;
  arn?: string;
  accountId?: string;
  userName?: string;
  invokedBy?: string;
  sessionContext?: {
    sessionIssuer?: {
      type: string;
      principalId: string;
      arn: string;
      accountId: string;
      userName?: string;
    };
    attributes?: {
      creationDate: string;
      mfaAuthenticated: string;
    };
  };
}

export interface FindingDetails {
  title: string;
  description: string;
  analysis?: string;
  evidence: Record<string, unknown>;
  remediation?: string;
  references?: string[];
  affectedResources?: Array<{
    resourceId: string;
    resourceType: string;
    resourceArn?: string;
  }>;
  complianceFrameworks?: string[];
  riskVector?: string;
  cvss?: {
    score: number;
    vector: string;
  };
}

// Common types (using string to maintain compatibility with database)
export type Severity = string; // 'critical' | 'high' | 'medium' | 'low' | 'info'
export type Status = string; // 'active' | 'resolved' | 'ignored' | 'pending' | 'in_progress' | 'completed'
export type Priority = string; // 'critical' | 'high' | 'medium' | 'low'

// IAM Findings
export interface IAMFinding {
  id: string;
  scan_id: string;
  finding_type: string;
  severity: Severity;
  resource_id: string;
  resource_type: string;
  resource_name?: string;
  description: string;
  remediation: string;
  details: IAMFindingDetails;
  policy_document?: PolicyDocument;
  suggested_policy?: PolicyDocument;
  compliance_impact?: string[];
  created_at: string;
  updated_at?: string;
}

export interface IAMFindingDetails {
  permissions?: string[];
  affected_resources?: string[];
  risk_level?: string;
  compliance_frameworks?: string[];
  [key: string]: unknown;
}

export interface PolicyDocument {
  Version: string;
  Statement: PolicyStatement[];
}

export interface PolicyStatement {
  Effect: 'Allow' | 'Deny';
  Action: string | string[];
  Resource: string | string[];
  Condition?: Record<string, unknown>;
}

// Findings
export interface Finding {
  id: string;
  event_name: string;
  event_time: string;
  user_identity: CloudTrailUserIdentity;
  severity: Severity;
  description: string;
  details: FindingDetails;
  ai_analysis?: string;
  status: Status;
  source?: string;
  scan_type?: string;
  ticket_id?: string;
  organization_id?: string;
  resource_id?: string;
  resource_arn?: string;
  service?: string;
  category?: string;
  region?: string;
  compliance?: string[];
  remediation?: string;
  risk_vector?: string;
  evidence?: Record<string, any>;
  created_at: string;
  updated_at?: string;
  remediation_tickets?: {
    id: string;
    title: string;
    status: string;
  };
}

export interface UserIdentity {
  type: string;
  principalId?: string;
  arn?: string;
  accountId?: string;
  userName?: string;
  sessionContext?: SessionContext;
  [key: string]: unknown;
}

export interface SessionContext {
  attributes?: {
    creationDate?: string;
    mfaAuthenticated?: boolean;
  };
  sessionIssuer?: {
    type?: string;
    principalId?: string;
    arn?: string;
    accountId?: string;
    userName?: string;
  };
  [key: string]: unknown;
}

export interface FindingDetails {
  eventID?: string;
  eventSource?: string;
  eventVersion?: string;
  awsRegion?: string;
  sourceIPAddress?: string;
  userAgent?: string;
  requestParameters?: Record<string, unknown>;
  responseElements?: Record<string, unknown>;
  [key: string]: unknown;
}

// Drift Detection
export interface DriftDetection {
  id: string;
  aws_account_id: string;
  resource_id: string;
  resource_name?: string;
  resource_type: string;
  drift_type: string;
  severity: Severity;
  expected_state: ResourceState;
  actual_state: ResourceState;
  diff: StateDiff;
  iac_source?: string;
  iac_file_path?: string;
  detected_at: string;
  status: Status;
  resolution_notes?: string;
  resolved_at?: string;
  ticket_id?: string;
  created_at: string;
}

export interface ResourceState {
  [key: string]: unknown;
}

export interface StateDiff {
  added?: Record<string, unknown>;
  removed?: Record<string, unknown>;
  changed?: Record<string, { old: unknown; new: unknown }>;
}

// Infrastructure Topology
export interface TopologyNode {
  id: string;
  resource_id: string;
  resource_type: string;
  resource_name: string | null;
  region: string | null;
  aws_account_id?: string;
  connections: NodeConnection[];
  security_groups: SecurityGroup[];
  attack_surface_score: number;
  publicly_accessible: boolean;
  position: NodePosition;
  metadata: NodeMetadata;
}

export interface NodeConnection {
  target: string;
  type: string;
  protocol?: string;
  port?: number;
}

export interface SecurityGroup {
  id: string;
  name: string;
  rules: SecurityGroupRule[];
}

export interface SecurityGroupRule {
  type: 'ingress' | 'egress';
  protocol: string;
  port?: number;
  source?: string;
  destination?: string;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface NodeMetadata {
  [key: string]: unknown;
}

// RI/SP Recommendations
export interface RISPRecommendation {
  id: string;
  aws_account_id?: string;
  recommendation_type: 'reserved_instance' | 'savings_plan';
  service: string;
  instance_family: string | null;
  region: string;
  term_length: '1_year' | '3_year';
  payment_option: 'all_upfront' | 'partial_upfront' | 'no_upfront';
  current_on_demand_cost: number;
  recommended_commitment_cost: number;
  monthly_savings: number;
  yearly_savings: number;
  break_even_months: number | null;
  coverage_percentage: number | null;
  confidence_score: number;
  status: Status;
  created_at: string;
}

// Gamification
export interface Achievement {
  id: string;
  name: string;
  description: string;
  type: string;
  points: number;
  icon?: string;
  requirement: AchievementRequirement;
  created_at: string;
}

export interface AchievementRequirement {
  type: string;
  value: number;
  [key: string]: unknown;
}

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  earned_at: string;
  achievement?: Achievement;
}

export interface LeaderboardEntry {
  id: string;
  user_id: string;
  period: 'daily' | 'weekly' | 'monthly' | 'all_time';
  total_points: number;
  total_savings: number;
  achievements_count: number;
  current_streak: number;
  team_name?: string;
  created_at: string;
  updated_at: string;
}

// Cost Anomalies
export interface CostAnomaly {
  id: string;
  aws_account_id: string;
  service: string;
  resource_id?: string;
  anomaly_type: string;
  severity: Severity;
  baseline_cost: number;
  current_cost: number;
  deviation_percentage: number;
  time_period: TimePeriod;
  detected_at: string;
  status: Status;
  details?: AnomalyDetails;
  investigated_by?: string;
  resolution_notes?: string;
  resolved_at?: string;
  ticket_id?: string;
  created_at: string;
}

export interface TimePeriod {
  start: string;
  end: string;
}

export interface AnomalyDetails {
  trend?: string;
  historical_average?: number;
  contributing_factors?: string[];
  [key: string]: unknown;
}

// Waste Detection
export interface WasteDetection {
  id: string;
  aws_account_id: string;
  resource_type: string;
  resource_id: string;
  resource_name?: string;
  region: string;
  waste_type: string;
  severity: Severity;
  monthly_waste_cost: number;
  yearly_waste_cost: number;
  recommendations: string;
  utilization_metrics?: UtilizationMetrics;
  detected_at: string;
  status: Status;
  remediation_script?: string;
  auto_remediation_available: boolean;
  can_auto_remediate: boolean;
  confidence_score: number;
  priority_score: number;
  estimated_remediation_hours: number;
  remediated_at?: string;
  created_at: string;
}

export interface UtilizationMetrics {
  cpu?: number;
  memory?: number;
  network?: number;
  disk?: number;
  [key: string]: unknown;
}

// Audit Log
export interface AuditLogEntry {
  id: string;
  user_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  details: AuditDetails;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface AuditDetails {
  old_data?: Record<string, unknown>;
  new_data?: Record<string, unknown>;
  [key: string]: unknown;
}

// API Logs
export interface APILog {
  id: string;
  user_id?: string;
  organization_id?: string;
  service: string;
  operation: string;
  aws_account_id?: string;
  region?: string;
  status_code?: number;
  duration_ms?: number;
  request_payload?: Record<string, unknown>;
  response_payload?: Record<string, unknown>;
  error_message?: string;
  ip_address?: string;
  created_at: string;
}

// Organization Settings
export interface OrganizationSettings {
  default_region?: string;
  notification_preferences?: NotificationPreferences;
  security_settings?: SecuritySettings;
  cost_thresholds?: CostThresholds;
  [key: string]: unknown;
}

export interface NotificationPreferences {
  email_enabled?: boolean;
  slack_enabled?: boolean;
  webhook_url?: string;
  [key: string]: unknown;
}

export interface SecuritySettings {
  mfa_required?: boolean;
  ip_whitelist?: string[];
  session_timeout?: number;
  [key: string]: unknown;
}

export interface CostThresholds {
  monthly_budget?: number;
  alert_threshold?: number;
  critical_threshold?: number;
  [key: string]: unknown;
}

// Chart Data
export interface ChartDataPoint {
  timestamp: string;
  value: number;
  label?: string;
}

export interface TimeSeriesData {
  dates: string[];
  values: number[];
  labels?: string[];
}

// Filter Options
export interface FilterOptions {
  severity?: Severity[];
  status?: Status[];
  resourceType?: string[];
  dateRange?: DateRange;
}

export interface DateRange {
  start: string;
  end: string;
}

// Query Results
export interface QueryResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Error Response
export interface ErrorResponse {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}
