/**
 * Security Posture Card - Security score and findings
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, TrendingUp, TrendingDown, Minus, AlertTriangle, Play } from 'lucide-react';
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

  // Check if this is a "no data" state (score = -1 indicates no scans performed)
  const hasNoData = data.score === -1 || data.lastScanDate === null;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'from-green-500/20 to-green-500/5';
    if (score >= 60) return 'from-yellow-500/20 to-yellow-500/5';
    return 'from-red-500/20 to-red-500/5';
  };

  const getScoreGlow = (score: number) => {
    if (score >= 80) return 'glow-success';
    if (score < 60) return 'glow-danger';
    return '';
  };

  const getTrendIcon = () => {
    if (data.trend.netChange > 0) {
      return <TrendingUp className="h-4 w-4 text-red-500" />;
    } else if (data.trend.netChange < 0) {
      return <TrendingDown className="h-4 w-4 text-green-500" />;
    }
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getTrendText = () => {
    if (data.trend.netChange > 0) {
      return `+${data.trend.netChange} new issues`;
    } else if (data.trend.netChange < 0) {
      return `${data.trend.netChange} issues resolved`;
    }
    return 'No change';
  };

  const handleRunFirstScan = () => {
    navigate('/security-posture');
  };

  // Render "no data" state
  if (hasNoData) {
    return (
      <Card className="h-full card-hover-lift card-shine">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary icon-pulse" />
            <CardTitle className="text-base">{t('executiveDashboard.securityPosture', 'Security Posture')}</CardTitle>
          </div>
          <CardDescription className="text-xs">
            {t('executiveDashboard.securityPostureDesc', 'Security score and vulnerability status')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* No Data State */}
          <div className="text-center py-6 space-y-3">
            <div className="relative p-4 rounded-xl bg-gradient-to-b from-muted/50 to-muted/20 border-2 border-dashed border-muted-foreground/20">
              <Shield className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-muted-foreground mb-1.5">
                {t('executiveDashboard.noSecurityData', 'No Security Analysis Yet')}
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                {t('executiveDashboard.noSecurityDataDesc', 'Run your first security scan to see your security posture and identify potential vulnerabilities.')}
              </p>
              <Button 
                onClick={handleRunFirstScan}
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                {t('executiveDashboard.runFirstScan', 'Run First Security Scan')}
              </Button>
            </div>
          </div>

          {/* Placeholder for what will be shown */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t('executiveDashboard.afterFirstScan', 'After your first scan, you\'ll see:')}
            </span>
            
            <div className="grid grid-cols-4 gap-1.5 opacity-50">
              <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
                <div className="text-lg font-bold text-red-500 tabular-nums">-</div>
                <span className="text-[10px] text-muted-foreground">Critical</span>
              </div>
              <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-center">
                <div className="text-lg font-bold text-orange-500 tabular-nums">-</div>
                <span className="text-[10px] text-muted-foreground">High</span>
              </div>
              <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
                <div className="text-lg font-bold text-yellow-500 tabular-nums">-</div>
                <span className="text-[10px] text-muted-foreground">Medium</span>
              </div>
              <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
                <div className="text-lg font-bold text-blue-500 tabular-nums">-</div>
                <span className="text-[10px] text-muted-foreground">Low</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render normal state with data
  return (
    <Card className="h-full card-hover-lift card-shine">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary icon-pulse" />
          <CardTitle className="text-base">{t('executiveDashboard.securityPosture', 'Security Posture')}</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {t('executiveDashboard.securityPostureDesc', 'Security score and vulnerability status')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Security Score Gauge */}
        <div className={cn(
          'relative p-4 rounded-xl bg-gradient-to-b transition-all duration-500',
          getScoreBgColor(data.score),
          getScoreGlow(data.score)
        )}>
          <div className="text-center">
            <div className={cn('text-4xl font-bold tabular-nums animate-in fade-in-0 zoom-in-95 duration-500', getScoreColor(data.score))}>
              {data.score}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {t('executiveDashboard.securityScore', 'Security Score')}
            </div>
          </div>
          
          {/* Score interpretation */}
          <div className="mt-2 text-center">
            <Badge variant={data.score >= 80 ? 'default' : data.score >= 60 ? 'secondary' : 'destructive'} className="transition-all hover:scale-105 text-[10px]">
              {data.score >= 80 ? 'Good' : data.score >= 60 ? 'Needs Attention' : 'Critical'}
            </Badge>
          </div>
        </div>

        {/* Findings by Severity */}
        <div className="space-y-2">
          <span className="text-xs font-medium">
            {t('executiveDashboard.findingsBySeverity', 'Findings by Severity')}
          </span>
          
          <div className="grid grid-cols-4 gap-1.5 animate-stagger">
            <div className={cn(
              "p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-center transition-all hover:scale-105",
              data.findings.critical > 0 && "glow-danger"
            )}>
              <div className="text-lg font-bold text-red-500 tabular-nums">{data.findings.critical}</div>
              <span className="text-[10px] text-muted-foreground">Critical</span>
            </div>
            <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-center transition-all hover:scale-105">
              <div className="text-lg font-bold text-orange-500 tabular-nums">{data.findings.high}</div>
              <span className="text-[10px] text-muted-foreground">High</span>
            </div>
            <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center transition-all hover:scale-105">
              <div className="text-lg font-bold text-yellow-500 tabular-nums">{data.findings.medium}</div>
              <span className="text-[10px] text-muted-foreground">Medium</span>
            </div>
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center transition-all hover:scale-105">
              <div className="text-lg font-bold text-blue-500 tabular-nums">{data.findings.low}</div>
              <span className="text-[10px] text-muted-foreground">Low</span>
            </div>
          </div>
        </div>

        {/* 7-Day Trend */}
        <div className="border-t pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">
              {t('executiveDashboard.last7Days', 'Last 7 Days')}
            </span>
            <div className="flex items-center gap-1">
              {getTrendIcon()}
              <span className={cn(
                'text-xs tabular-nums',
                data.trend.netChange > 0 ? 'text-red-500' : 
                data.trend.netChange < 0 ? 'text-green-500' : 'text-muted-foreground'
              )}>
                {getTrendText()}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 animate-stagger">
            <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-red-500/5 transition-all hover:scale-[1.02] hover:bg-red-500/10">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500 icon-pulse" />
              <div>
                <div className="text-sm font-semibold tabular-nums">{data.trend.newLast7Days}</div>
                <span className="text-[10px] text-muted-foreground">New Issues</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-green-500/5 transition-all hover:scale-[1.02] hover:bg-green-500/10">
              <Shield className="h-3.5 w-3.5 text-green-500 icon-pulse" />
              <div>
                <div className="text-sm font-semibold tabular-nums">{data.trend.resolvedLast7Days}</div>
                <span className="text-[10px] text-muted-foreground">Resolved</span>
              </div>
            </div>
          </div>
        </div>

        {/* Total Findings */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 transition-all hover:bg-muted/70">
          <span className="text-xs text-muted-foreground">
            {t('executiveDashboard.totalFindings', 'Total Active Findings')}
          </span>
          <span className="text-base font-bold tabular-nums">{data.findings.total}</span>
        </div>

        {/* Last Scan */}
        {data.lastScanDate && (
          <div className="text-[10px] text-muted-foreground text-center">
            Last scan: {new Date(data.lastScanDate).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
