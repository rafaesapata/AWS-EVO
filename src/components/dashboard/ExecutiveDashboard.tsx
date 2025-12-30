/**
 * Executive Dashboard - Re-export from new modular structure
 * This file maintains backwards compatibility with existing imports
 */

// Export the new v2 dashboard as default and named export
export { default, ExecutiveDashboard } from './ExecutiveDashboard/index';

// Re-export types for consumers
export type {
  ExecutiveDashboardData,
  ExecutiveSummary,
  FinancialHealth,
  SecurityPosture,
  OperationsCenter,
  AIInsight,
  TrendData,
  DashboardMetadata
} from './ExecutiveDashboard/types';
