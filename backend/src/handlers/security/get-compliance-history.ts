/**
 * Get Compliance History Handler
 * Returns historical compliance data for trends analysis
 */

import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { isOrganizationInDemoMode } from '../../lib/demo-data-service.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

const getHistorySchema = z.object({
  days: z.number().min(1).max(365).optional().default(30),
  framework: z.string().optional(),
  accountId: z.string().optional(), // Can be UUID or AWS account ID
});

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  logger.info('Get Compliance History handler invoked');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    // Validate input
    const validation = parseAndValidateBody(getHistorySchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { days = 30, framework, accountId } = validation.data;
    // Ensure days is always defined (Zod default + destructuring default)
    const effectiveDays = days ?? 30;
    
    const prisma = getPrismaClient();
    
    // Demo mode check
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    if (isDemo === true) {
      logger.info('Returning demo compliance history', { organizationId });
      const now = new Date();
      const scores = [];
      for (let i = effectiveDays - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const base = 72 + Math.sin(i / 5) * 8;
        scores.push({
          date: d.toISOString(),
          compliance_score: Math.round(base + (Math.random() - 0.5) * 4),
          overall_score: Math.round(base + 5 + (Math.random() - 0.5) * 4),
          critical_findings: Math.max(0, Math.round(3 - i * 0.05)),
          high_findings: Math.round(5 + Math.sin(i / 3) * 2),
          medium_findings: Math.round(8 + Math.cos(i / 4) * 3),
          low_findings: Math.round(15 + Math.sin(i / 6) * 4),
          risk_level: base > 75 ? 'medium' : 'high',
        });
      }
      return success({
        period_days: effectiveDays,
        overall_trend: 'improving',
        posture_history: scores,
        framework_stats: {
          'CIS': { total_scans: 8, avg_score: 76, latest_score: 82, trend: 'improving', scores: scores.filter((_, i) => i % 4 === 0).map(s => ({ date: s.date, score: s.compliance_score })) },
          'LGPD': { total_scans: 4, avg_score: 68, latest_score: 74, trend: 'improving', scores: scores.filter((_, i) => i % 7 === 0).map(s => ({ date: s.date, score: Math.round(s.compliance_score * 0.9) })) },
          'PCI-DSS': { total_scans: 3, avg_score: 71, latest_score: 78, trend: 'stable', scores: scores.filter((_, i) => i % 10 === 0).map(s => ({ date: s.date, score: Math.round(s.compliance_score * 0.95) })) },
        },
        recent_critical_findings: [
          { control_id: 'CIS-1.5', control_name: 'Ensure MFA is enabled for root account', framework: 'CIS', severity: 'critical', remediation_steps: 'Enable MFA on root account', created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() },
          { control_id: 'CIS-2.1.1', control_name: 'Ensure S3 Bucket Policy is set to deny HTTP requests', framework: 'CIS', severity: 'critical', remediation_steps: 'Add bucket policy to deny non-HTTPS', created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString() },
        ],
        total_scans: 15,
        summary: { current_score: 82, previous_score: 78, score_change: 4 },
        _isDemo: true,
      }, 200, origin);
    }
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - effectiveDays);
    
    // Get security posture history (compliance scores over time)
    const postureHistory = await prisma.securityPosture.findMany({
      where: {
        organization_id: organizationId,
        calculated_at: { gte: startDate },
      },
      orderBy: { calculated_at: 'asc' },
      select: {
        overall_score: true,
        compliance_score: true,
        critical_findings: true,
        high_findings: true,
        medium_findings: true,
        low_findings: true,
        risk_level: true,
        calculated_at: true,
      },
    });
    
    // Get compliance scans history
    const scanFilters: any = {
      organization_id: organizationId,
      scan_type: { startsWith: 'compliance-' },
      status: 'completed',
      completed_at: { gte: startDate },
    };
    
    if (accountId) {
      scanFilters.aws_account_id = accountId;
    }
    
    const scansHistory = await prisma.securityScan.findMany({
      where: scanFilters,
      orderBy: { completed_at: 'desc' },
      take: 100,
      select: {
        id: true,
        scan_type: true,
        scan_config: true,
        completed_at: true,
        aws_account_id: true,
      },
    });
    
    // Get compliance checks grouped by framework
    const frameworkStats: Record<string, {
      total_scans: number;
      avg_score: number;
      latest_score: number;
      trend: 'improving' | 'declining' | 'stable';
      scores: { date: string; score: number }[];
    }> = {};
    
    for (const scan of scansHistory) {
      const config = scan.scan_config as any;
      const frameworkId = config?.framework || scan.scan_type.replace('compliance-', '');
      
      if (framework && frameworkId !== framework) continue;
      
      // Get compliance checks for this scan
      const checks = await prisma.complianceCheck.findMany({
        where: { scan_id: scan.id },
        select: { status: true },
      });
      
      const passed = checks.filter(c => c.status === 'passed').length;
      const total = checks.filter(c => c.status !== 'not_applicable' && c.status !== 'error').length;
      const score = total > 0 ? Math.round((passed / total) * 100) : 0;
      
      if (!frameworkStats[frameworkId]) {
        frameworkStats[frameworkId] = {
          total_scans: 0,
          avg_score: 0,
          latest_score: 0,
          trend: 'stable',
          scores: [],
        };
      }
      
      frameworkStats[frameworkId].total_scans++;
      frameworkStats[frameworkId].scores.push({
        date: scan.completed_at?.toISOString() || '',
        score,
      });
    }
    
    // Calculate averages and trends
    for (const [fwId, stats] of Object.entries(frameworkStats)) {
      if (stats.scores.length > 0) {
        stats.avg_score = Math.round(
          stats.scores.reduce((sum, s) => sum + s.score, 0) / stats.scores.length
        );
        stats.latest_score = stats.scores[0].score;
        
        // Calculate trend
        if (stats.scores.length >= 2) {
          const recentScores = stats.scores.slice(0, Math.min(5, stats.scores.length));
          const olderScores = stats.scores.slice(Math.min(5, stats.scores.length));
          
          if (olderScores.length > 0) {
            const recentAvg = recentScores.reduce((sum, s) => sum + s.score, 0) / recentScores.length;
            const olderAvg = olderScores.reduce((sum, s) => sum + s.score, 0) / olderScores.length;
            
            if (recentAvg > olderAvg + 5) {
              stats.trend = 'improving';
            } else if (recentAvg < olderAvg - 5) {
              stats.trend = 'declining';
            }
          }
        }
        
        // Sort scores by date ascending for chart
        stats.scores.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }
    }
    
    // Get recent critical findings
    const recentCriticalFindings = await prisma.complianceCheck.findMany({
      where: {
        scan: {
          organization_id: organizationId,
          completed_at: { gte: startDate },
        },
        status: 'failed',
        severity: 'critical',
      },
      orderBy: { created_at: 'desc' },
      take: 10,
      select: {
        control_id: true,
        control_name: true,
        framework: true,
        severity: true,
        remediation_steps: true,
        created_at: true,
      },
    });
    
    // Calculate overall trend
    let overallTrend: 'improving' | 'declining' | 'stable' = 'stable';
    if (postureHistory.length >= 2) {
      const recentPosture = postureHistory.slice(-5);
      const olderPosture = postureHistory.slice(0, -5);
      
      if (olderPosture.length > 0) {
        const recentAvg = recentPosture.reduce((sum, p) => sum + (p.compliance_score || 0), 0) / recentPosture.length;
        const olderAvg = olderPosture.reduce((sum, p) => sum + (p.compliance_score || 0), 0) / olderPosture.length;
        
        if (recentAvg > olderAvg + 5) {
          overallTrend = 'improving';
        } else if (recentAvg < olderAvg - 5) {
          overallTrend = 'declining';
        }
      }
    }
    
    return success({
      period_days: days,
      overall_trend: overallTrend,
      posture_history: postureHistory.map(p => ({
        date: p.calculated_at.toISOString(),
        compliance_score: p.compliance_score,
        overall_score: p.overall_score,
        critical_findings: p.critical_findings,
        high_findings: p.high_findings,
        medium_findings: p.medium_findings,
        low_findings: p.low_findings,
        risk_level: p.risk_level,
      })),
      framework_stats: frameworkStats,
      recent_critical_findings: recentCriticalFindings,
      total_scans: scansHistory.length,
      summary: {
        current_score: postureHistory.length > 0 
          ? postureHistory[postureHistory.length - 1].compliance_score 
          : null,
        previous_score: postureHistory.length > 1 
          ? postureHistory[postureHistory.length - 2].compliance_score 
          : null,
        score_change: postureHistory.length > 1 
          ? (postureHistory[postureHistory.length - 1].compliance_score || 0) - 
            (postureHistory[postureHistory.length - 2].compliance_score || 0)
          : 0,
      },
    }, 200, origin);
    
  } catch (err) {
    logger.error('Get compliance history error', err as Error);
    return error('An unexpected error occurred. Please try again.', 500, undefined, origin);
  }
}
