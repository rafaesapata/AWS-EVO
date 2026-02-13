/**
 * Security Posture Card - Security score and findings
 * Design aligned with Executive Summary Bar:
 *   - Primary: #00B2FF (light blue)
 *   - Text: #393939 (dark gray)
 *   - Labels: #5F5F5F (medium gray)
 *   - Background: #FFFFFF
 *   - Border: border-gray-200
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Play, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import InfoIcon from './InfoIcon';
import type { SecurityPosture } from '../types';

interface Props {
  data: SecurityPosture;
}

// Reusable hover styles for clickable indicator boxes
const HOVER_BOX = 'transition-all duration-200 hover:shadow-md hover:border-[#00B2FF]/40 hover:bg-[#00B2FF]/5 cursor-pointer group';
const HOVER_TEXT = 'group-hover:text-[#00B2FF] transition-colors duration-200';
const HOVER_LABEL = 'group-hover:text-[#00B2FF]/70 transition-colors duration-200';

// SVG circle circumference for r=85: 2 * π * 85
const CIRCLE_CIRCUMFERENCE = 534.07;

export default function SecurityPostureCard({ data }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const hasNoData = data.score === -1 || data.lastScanDate === null;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-[#00B2FF]';
    if (score >= 60) return 'text-[#393939]';
    return 'text-red-500';
  };

  const getTrendIcon = () => {
    if (data.trend.netChange > 0) {
      return <TrendingUp className="h-4 w-4 text-red-500" />;
    } else if (data.trend.netChange < 0) {
      return <TrendingDown className="h-4 w-4 text-[#00B2FF]" />;
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
      <div className="h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <p className="text-base font-light text-[#5F5F5F]">
              {t('executiveDashboard.securityPosture', 'Security Posture')}
            </p>
            <InfoIcon tooltip={t('executiveDashboard.securityPostureTooltip', 'Security analysis based on AWS best practices and compliance frameworks. Run regular scans to keep your security posture up to date.')} />
          </div>
        </div>
        <div className="p-6">
          <div className="text-center py-8 space-y-4">
            <div className="p-6 rounded-2xl bg-white border border-gray-200">
              <Shield className="h-14 w-14 text-gray-300 mx-auto mb-4" />
              <h3 className="text-sm font-light text-[#393939] mb-2">
                {t('executiveDashboard.noSecurityData', 'No Security Analysis Yet')}
              </h3>
              <p className="text-xs font-light text-[#5F5F5F] mb-4 max-w-xs mx-auto">
                {t('executiveDashboard.noSecurityDataDesc', 'Run your first security scan to see your security posture and identify potential vulnerabilities.')}
              </p>
              <Button 
                onClick={handleRunFirstScan}
                className="bg-[#00B2FF] hover:bg-[#0090CC] text-white rounded-xl font-light"
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
    <div className="h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <p className="text-base font-light text-[#5F5F5F]">
            {t('executiveDashboard.securityPosture', 'Security Posture')}
          </p>
          <InfoIcon tooltip={t('executiveDashboard.securityPostureTooltip', 'Security analysis based on AWS best practices and compliance frameworks. Run regular scans to keep your security posture up to date.')} />
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Security Score - Circular Progress */}
        <div className="flex flex-col items-center justify-center py-4">
          <div className="relative w-48 h-48">
            {/* Background Circle */}
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
              {/* Background track */}
              <circle
                cx="100"
                cy="100"
                r="85"
                fill="none"
                stroke="#E5E5E5"
                strokeWidth="16"
              />
              {/* Progress arc */}
              <circle
                cx="100"
                cy="100"
                r="85"
                fill="none"
                stroke={data.score >= 80 ? '#00B2FF' : data.score >= 60 ? '#393939' : '#EF4444'}
                strokeWidth="16"
                strokeLinecap="round"
                strokeDasharray={`${(data.score / 100) * CIRCLE_CIRCUMFERENCE} ${CIRCLE_CIRCUMFERENCE}`}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            
            {/* Center Content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-sm font-light text-[#5F5F5F] mb-1">
                {t('executiveDashboard.securityScore', 'Score de Saúde')}
              </div>
              <div className={cn('tabular-nums', getScoreColor(data.score))} style={{ fontSize: '48px', lineHeight: '1', fontWeight: '300' }}>
                {data.score}
              </div>
              <div className="text-lg font-light text-[#5F5F5F]">/100</div>
            </div>
          </div>
          
          {/* Status Badge */}
          <div className="mt-4">
            <Badge 
              className={cn(
                'text-xs font-light px-3 py-1 rounded-full',
                data.score >= 80 ? 'bg-[#00B2FF]/20 text-[#00B2FF] border-[#00B2FF]/30' : 
                data.score >= 60 ? 'bg-gray-100 text-[#5F5F5F] border-gray-200' : 
                'bg-red-100 text-red-500 border-red-200'
              )}
            >
              {data.score >= 80 ? t('executiveDashboard.statusGood', 'Good') : data.score >= 60 ? t('executiveDashboard.statusNeedsAttention', 'Needs Attention') : t('executiveDashboard.statusCritical', 'Critical')}
            </Badge>
          </div>
        </div>

        {/* Findings by Severity - 2x2 Grid */}
        <div className="space-y-3">
          <span className="text-base font-light text-[#5F5F5F]">
            {t('executiveDashboard.findingsBySeverity', 'Findings by Severity')}
          </span>
          
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => navigate('/security-posture?severity=critical')}
              className={cn(
                `p-3 rounded-xl text-center border ${HOVER_BOX}`,
                data.findings.critical > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
              )}
            >
              <div className={cn(
                `text-2xl font-light tabular-nums ${HOVER_TEXT}`,
                data.findings.critical > 0 ? 'text-red-500' : 'text-[#393939]'
              )}>
                {data.findings.critical}
              </div>
              <span className={`text-xs font-light text-[#5F5F5F] ${HOVER_LABEL}`}>{t('executiveDashboard.severityCritical', 'Critical')}</span>
            </button>
            <button
              onClick={() => navigate('/security-posture?severity=high')}
              className={`p-3 rounded-xl bg-white border border-gray-200 text-center ${HOVER_BOX}`}
            >
              <div className={`text-2xl font-light text-[#393939] tabular-nums ${HOVER_TEXT}`}>{data.findings.high}</div>
              <span className={`text-xs font-light text-[#5F5F5F] ${HOVER_LABEL}`}>{t('executiveDashboard.severityHigh', 'High')}</span>
            </button>
            <button
              onClick={() => navigate('/security-posture?severity=medium')}
              className={`p-3 rounded-xl bg-white border border-gray-200 text-center ${HOVER_BOX}`}
            >
              <div className={`text-2xl font-light text-[#393939] tabular-nums ${HOVER_TEXT}`}>{data.findings.medium}</div>
              <span className={`text-xs font-light text-[#5F5F5F] ${HOVER_LABEL}`}>{t('executiveDashboard.severityMedium', 'Medium')}</span>
            </button>
            <button
              onClick={() => navigate('/security-posture?severity=low')}
              className={`p-3 rounded-xl bg-white border border-gray-200 text-center ${HOVER_BOX}`}
            >
              <div className={`text-2xl font-light text-[#393939] tabular-nums ${HOVER_TEXT}`}>{data.findings.low}</div>
              <span className={`text-xs font-light text-[#5F5F5F] ${HOVER_LABEL}`}>{t('executiveDashboard.severityLow', 'Low')}</span>
            </button>
          </div>
        </div>

        {/* 7-Day Trend */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-base font-light text-[#5F5F5F]">
              {t('executiveDashboard.last7Days', 'Last 7 Days')}
            </span>
            <div className="flex items-center gap-1.5">
              {getTrendIcon()}
              <span className={cn(
                'text-xs font-light tabular-nums',
                data.trend.netChange > 0 ? 'text-red-500' : 
                data.trend.netChange < 0 ? 'text-[#00B2FF]' : 'text-[#5F5F5F]'
              )}>
                {getTrendText()}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/security-posture?status=new')}
              className={`flex items-center gap-2 p-3 rounded-xl bg-white border border-gray-200 text-left ${HOVER_BOX}`}
            >
              <AlertTriangle className={`h-4 w-4 text-amber-500 ${HOVER_TEXT}`} />
              <div>
                <div className={`text-lg font-light text-[#393939] tabular-nums ${HOVER_TEXT}`}>{data.trend.newLast7Days}</div>
                <span className={`text-xs font-light text-[#5F5F5F] ${HOVER_LABEL}`}>{t('executiveDashboard.newIssues', 'New Issues')}</span>
              </div>
            </button>
            <button
              onClick={() => navigate('/security-posture?status=resolved')}
              className="flex items-center gap-2 p-3 rounded-xl bg-[#00B2FF]/10 border border-[#00B2FF]/20 text-left transition-all duration-200 hover:shadow-md hover:border-[#00B2FF]/40 hover:bg-[#00B2FF]/20 cursor-pointer group"
            >
              <Shield className="h-4 w-4 text-[#00B2FF]" />
              <div>
                <div className="text-lg font-light text-[#00B2FF] tabular-nums">{data.trend.resolvedLast7Days}</div>
                <span className={`text-xs font-light text-[#5F5F5F] ${HOVER_LABEL}`}>{t('executiveDashboard.resolved', 'Resolved')}</span>
              </div>
            </button>
          </div>
        </div>

        {/* Total Findings */}
        <button
          onClick={() => navigate('/security-posture?severity=all')}
          className={`w-full flex items-center justify-between p-3 rounded-xl bg-white border border-gray-200 text-left ${HOVER_BOX}`}
        >
          <span className={`text-sm font-light text-[#5F5F5F] ${HOVER_LABEL}`}>
            {t('executiveDashboard.totalFindings', 'Total Active Findings')}
          </span>
          <span className={`text-lg font-light text-[#393939] tabular-nums ${HOVER_TEXT}`}>{data.findings.total}</span>
        </button>

        {/* Last Scan */}
        {data.lastScanDate && (
          <div className="text-xs font-light text-[#5F5F5F] text-center">
            {t('executiveDashboard.lastScan', 'Last scan')}: {new Date(data.lastScanDate).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
