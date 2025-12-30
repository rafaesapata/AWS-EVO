/**
 * Executive Dashboard Types
 */

export interface ExecutiveSummary {
  overallScore: number;
  scoreChange: number;
  mtdSpend: number;
  budget: number;
  budgetUtilization: number;
  potentialSavings: number;
  uptimeSLA: number;
  activeAlerts: {
    critical: number;
    high: number;
    medium: number;
  };
}

export interface FinancialHealth {
  mtdCost: number;
  ytdCost: number;
  credits: number;
  netCost: number;
  budget: number;
  budgetUtilization: number;
  topServices: Array<{
    service: string;
    cost: number;
    percentage: number;
    rank: number;
  }>;
  savings: {
    potential: number;
    costRecommendations: number;
    riSpRecommendations: number;
    recommendationsCount: number;
  };
  lastCostUpdate: string | null;
}

export interface SecurityPosture {
  score: number;
  findings: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  trend: {
    newLast7Days: number;
    resolvedLast7Days: number;
    netChange: number;
  };
  mttr: Record<string, number>;
  lastScanDate: string | null;
}

export interface OperationsCenter {
  endpoints: {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
  };
  uptime: {
    current: number;
    target: number;
  };
  responseTime: {
    avg: number;
  };
  alerts: {
    active: Array<{
      id: string;
      severity: string;
      title: string;
      since: string;
    }>;
    count: {
      critical: number;
      high: number;
    };
  };
  remediations: {
    pending: number;
    inProgress: number;
    resolved: number;
    total: number;
  };
  lastCheckDate: string | null;
}

export interface AIInsight {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  recommendation: string | null;
  confidence: number;
  generatedAt: string;
}

export interface TrendData {
  cost: Array<{
    date: string;
    cost: number;
    credits: number;
    net: number;
  }>;
  security: Array<{
    date: string;
    score: number;
    findings: number;
  }>;
  period: string;
}

export interface DashboardMetadata {
  generatedAt: string;
  dataFreshness: {
    costs: string | null;
    security: string | null;
    endpoints: string | null;
  };
  organizationId: string;
  accountId: string;
  trendPeriod: string;
}

export interface ExecutiveDashboardData {
  summary: ExecutiveSummary;
  financial: FinancialHealth;
  security: SecurityPosture;
  operations: OperationsCenter;
  insights: AIInsight[];
  trends: TrendData | null;
  metadata: DashboardMetadata;
}
