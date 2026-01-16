/**
 * Security Posture Card - Security score and findings
 * Clean Light Design with color palette:
 *   - Primary: #003C7D (dark blue)
 *   - Secondary: #008CFF (light blue)
 *   - Success: #10B981 (green)
 *   - Background: #FFFFFF / #F9FAFB
 *   - Text: #1F2937 (dark gray)
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Play, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { SecurityPosture } from '../types';

interface Props {
  data: SecurityPosture;
}

export default function SecurityPostureCard({ data }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const hasNoData = data.score === -1 || data.lastScanDate === null;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-[#10B981]';
    if (score >= 60) return 'text-[#1F2937]';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-[#10B981]/10 border-[#10B981]/20';
    if (score >= 60) return 'bg-[#F9FAFB] border-gray-200';
    return 'bg-red-50 border-red-200';
  };

  const getTrendIcon = () => {
    if (data.trend.netChange > 0) {
      return <TrendingUp className="h-4 w-4 text-red-600" />;
    } else if (data.trend.netChange < 0) {
      return <TrendingDown className="h-4 w-4 text-[#10B981]" />;
    }
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  const getTrendText = () => {
    if (data.trend.netChange > 0) {
      return `+${data.trend.netChange} ${t('executiveDashboard.newIssues', 'new issues')}`;
    } else if (data.trend.netChange < 0) {
      return `${data.trend.netChange} ${t('executiveDashboard.issuesResolved', 'issues resolved')}`;
    }
    return t('executiveDashboard.noChange', 'No change');
  };

  const handleRunFirstScan = () => {
    navigate('/security-posture');
  };

  // Render "no data" state
  if (hasNoData) {
    return (
      <div className="h-full bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-xl font-light text-[#1F2937]">
            {t('executiveDashboard.securityPosture', 'Security Posture')}
          </h3>
          <p className="text-sm font-light text-gray-500 mt-0.5">
            {t('executiveDashboard.securityPostureDesc', 'Security score and vulnerability status')}
          </p>
        </div>
        <div className="p-6">
          <div className="text-center py-8 space-y-4">
            <div className="p-6 rounded-2xl bg-[#F9FAFB] border border-gray-200">
              <Shield className="h-14 w-14 text-gray-300 mx-auto mb-4" />
              <h3 className="text-sm font-semibold text-[#1F2937] mb-2">
                {t('executiveDashboard.noSecurityData', 'No Security Analysis Yet')}
              </h3>
              <p className="text-xs text-gray-500 mb-4 max-w-xs mx-auto">
                {t('executiveDashboard.noSecurityDataDesc', 'Run your first security scan to see your security posture and identify potential vulnerabilities.')}
              </p>
              <Button 
                onClick={handleRunFirstScan}
                className="bg-[#003C7D] hover:bg-[#002d5c] text-white rounded-xl font-medium"
              >
                <Play className="h-4 w-4 mr-2" />
                {t('executiveDashboard.runFirstScan', 'Run First Security Scan')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-xl font-light text-[#1F2937]">
          {t('executiveDashboard.securityPosture', 'Security Posture')}
        </h3>
        <p className="text-sm font-light text-gray-500 mt-0.5">
          {t('executiveDashboard.securityPostureDesc', 'Security score and vulnerability status')}
        </p>
      </div>

      <div className="p-6 space-y-5">
        {/* Security Score */}
        <div className={cn('relative p-5 rounded-2xl border', getScoreBgColor(data.score))}>
          <div className="text-center">
            <div className={cn('text-5xl font-light tabular-nums', getScoreColor(data.score))}>
              {data.score}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {t('executiveDashboard.securityScore', 'Security Score')}
            </div>
          </div>
          
          <div className="mt-3 text-center">
            <Badge 
              className={cn(
                'text-xs font-medium px-3 py-1 rounded-full',
                data.score >= 80 ? 'bg-[#10B981]/20 text-[#10B981] border-[#10B981]/30' : 
                data.score >= 60 ? 'bg-gray-100 text-gray-600 border-gray-200' : 
                'bg-red-100 text-red-600 border-red-200'
              )}
            >
              {data.score >= 80 ? t('executiveDashboard.statusGood', 'Good') : data.score >= 60 ? t('executiveDashboard.statusNeedsAttention', 'Needs Attention') : t('executiveDashboard.statusCritical', 'Critical')}
            </Badge>
          </div>
        </div>

        {/* Findings by Severity - 2x2 Grid */}
        <div className="space-y-3">
          <span className="text-base font-light text-[#1F2937]">
            {t('executiveDashboard.findingsBySeverity', 'Findings by Severity')}
          </span>
          
          <div className="grid grid-cols-4 gap-2">
            <div className={cn(
              "p-3 rounded-xl text-center border",
              data.findings.critical > 0 ? 'bg-red-50 border-red-200' : 'bg-[#F9FAFB] border-gray-100'
            )}>
              <div className={cn(
                "text-2xl font-light tabular-nums",
                data.findings.critical > 0 ? 'text-red-600' : 'text-[#1F2937]'
              )}>
                {data.findings.critical}
              </div>
              <span className="text-xs text-gray-500">{t('executiveDashboard.severityCritical', 'Critical')}</span>
            </div>
            <div className="p-3 rounded-xl bg-[#F9FAFB] border border-gray-100 text-center">
              <div className="text-2xl font-light text-[#1F2937] tabular-nums">{data.findings.high}</div>
              <span className="text-xs text-gray-500">{t('executiveDashboard.severityHigh', 'High')}</span>
            </div>
            <div className="p-3 rounded-xl bg-[#F9FAFB] border border-gray-100 text-center">
              <div className="text-2xl font-light text-[#1F2937] tabular-nums">{data.findings.medium}</div>
              <span className="text-xs text-gray-500">{t('executiveDashboard.severityMedium', 'Medium')}</span>
            </div>
            <div className="p-3 rounded-xl bg-[#F9FAFB] border border-gray-100 text-center">
              <div className="text-2xl font-light text-[#1F2937] tabular-nums">{data.findings.low}</div>
              <span className="text-xs text-gray-500">{t('executiveDashboard.severityLow', 'Low')}</span>
            </div>
          </div>
        </div>

        {/* 7-Day Trend */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-base font-light text-[#1F2937]">
              {t('executiveDashboard.last7Days', 'Last 7 Days')}
            </span>
            <div className="flex items-center gap-1.5">
              {getTrendIcon()}
              <span className={cn(
                'text-xs font-medium tabular-nums',
                data.trend.netChange > 0 ? 'text-red-600' : 
                data.trend.netChange < 0 ? 'text-[#10B981]' : 'text-gray-500'
              )}>
                {getTrendText()}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-[#F9FAFB] border border-gray-100">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <div>
                <div className="text-lg font-light text-[#1F2937] tabular-nums">{data.trend.newLast7Days}</div>
                <span className="text-xs text-gray-500">{t('executiveDashboard.newIssues', 'New Issues')}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-[#10B981]/10 border border-[#10B981]/20">
              <Shield className="h-4 w-4 text-[#10B981]" />
              <div>
                <div className="text-lg font-light text-[#10B981] tabular-nums">{data.trend.resolvedLast7Days}</div>
                <span className="text-xs text-gray-500">{t('executiveDashboard.resolved', 'Resolved')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Total Findings */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-[#F9FAFB] border border-gray-100">
          <span className="text-sm text-gray-600">
            {t('executiveDashboard.totalFindings', 'Total Active Findings')}
          </span>
          <span className="text-lg font-semibold text-[#1F2937] tabular-nums">{data.findings.total}</span>
        </div>

        {/* Last Scan */}
        {data.lastScanDate && (
          <div className="text-xs text-gray-400 text-center">
            {t('executiveDashboard.lastScan', 'Last scan')}: {new Date(data.lastScanDate).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
