/**
 * Hook for tracking Executive Dashboard section loading states
 * Enables progressive/granular loading of dashboard sections
 */

import { useMemo } from 'react';
import type { ExecutiveDashboardData } from '@/components/dashboard/ExecutiveDashboard/types';

export interface DashboardSectionStates {
  /** Summary bar (health score, SLA, MTD, alerts, savings) */
  summary: boolean;
  /** Trend analysis charts */
  trends: boolean;
  /** Financial health card */
  financial: boolean;
  /** Security posture card */
  security: boolean;
  /** Operations center card */
  operations: boolean;
  /** AI insights/recommendations */
  insights: boolean;
  /** All sections loaded */
  all: boolean;
}

/**
 * Analyzes dashboard data to determine which sections have loaded
 * Useful for showing granular skeletons per section
 */
export function useExecutiveDashboardSections(
  data: ExecutiveDashboardData | undefined,
  isLoading: boolean
): DashboardSectionStates {
  return useMemo(() => {
    // If still loading or no data, nothing is ready
    if (isLoading || !data) {
      return {
        summary: false,
        trends: false,
        financial: false,
        security: false,
        operations: false,
        insights: false,
        all: false,
      };
    }

    // Check each section for valid data
    const summary = !!(
      data.summary &&
      typeof data.summary.overallScore === 'number' &&
      typeof data.summary.uptimeSLA === 'number'
    );

    const trends = !!(
      data.trends &&
      Array.isArray(data.trends.cost) &&
      Array.isArray(data.trends.security)
    );

    const financial = !!(
      data.financial &&
      typeof data.financial.mtdCost === 'number' &&
      typeof data.financial.ytdCost === 'number'
    );

    const security = !!(
      data.security &&
      typeof data.security.score === 'number' &&
      data.security.findings
    );

    const operations = !!(
      data.operations &&
      data.operations.endpoints &&
      typeof data.operations.endpoints.total === 'number'
    );

    const insights = !!(
      data.insights &&
      Array.isArray(data.insights)
    );

    const all = summary && trends && financial && security && operations && insights;

    return {
      summary,
      trends,
      financial,
      security,
      operations,
      insights,
      all,
    };
  }, [data, isLoading]);
}

/**
 * Returns loading progress as a percentage
 */
export function useDashboardLoadingProgress(sections: DashboardSectionStates): number {
  const loadedCount = [
    sections.summary,
    sections.trends,
    sections.financial,
    sections.security,
    sections.operations,
    sections.insights,
  ].filter(Boolean).length;

  return Math.round((loadedCount / 6) * 100);
}

export default useExecutiveDashboardSections;
