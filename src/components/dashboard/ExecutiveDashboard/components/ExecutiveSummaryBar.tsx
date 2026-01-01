/**
 * Executive Summary Bar - Top-level KPIs
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Shield, 
  Activity,
  AlertTriangle 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { ExecutiveSummary } from '../types';

interface Props {
  data: ExecutiveSummary;
}

export default function ExecutiveSummaryBar({ data }: Props) {
  const { t } = useTranslation();

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-500/10 border-green-500/20';
    if (score >= 60) return 'bg-yellow-500/10 border-yellow-500/20';
    return 'bg-red-500/10 border-red-500/20';
  };

  const budgetPercentage = Math.min(100, data.budgetUtilization);
  const getBudgetColor = () => {
    if (budgetPercentage >= 90) return 'bg-red-500';
    if (budgetPercentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const totalAlerts = data.activeAlerts.critical + data.activeAlerts.high + data.activeAlerts.medium;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 animate-stagger">
      {/* Overall Health Score */}
      <Card className={cn('border card-hover-lift card-shine', getScoreBg(data.overallScore))}>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('executiveDashboard.healthScore', 'Health Score')}
            </span>
            <Shield className={cn('h-4 w-4 icon-pulse', getScoreColor(data.overallScore))} />
          </div>
          <div className="flex items-baseline gap-1">
            <span className={cn('text-2xl font-bold tabular-nums', getScoreColor(data.overallScore))}>
              {data.overallScore}
            </span>
            <span className="text-xs text-muted-foreground">/100</span>
            {data.scoreChange !== 0 && (
              <Badge variant={data.scoreChange > 0 ? 'default' : 'destructive'} className="ml-1 text-[10px] px-1 py-0">
                {data.scoreChange > 0 ? <TrendingUp className="h-2.5 w-2.5 mr-0.5" /> : <TrendingDown className="h-2.5 w-2.5 mr-0.5" />}
                {data.scoreChange > 0 ? '+' : ''}{data.scoreChange}%
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* MTD Spend */}
      <Card className="card-hover-lift card-shine">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('executiveDashboard.mtdSpend', 'MTD Spend')}
            </span>
            <DollarSign className="h-4 w-4 text-muted-foreground icon-bounce" />
          </div>
          <div className="text-xl font-bold mb-1.5 tabular-nums">
            ${data.mtdSpend.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <div className="space-y-0.5">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{t('executiveDashboard.budget', 'Budget')}</span>
              <span className="tabular-nums">{budgetPercentage.toFixed(0)}%</span>
            </div>
            <Progress value={budgetPercentage} className={cn('h-1', getBudgetColor())} />
          </div>
        </CardContent>
      </Card>

      {/* Potential Savings */}
      <Card className="bg-green-500/5 border-green-500/20 card-hover-lift card-shine glow-success">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('executiveDashboard.savingsPotential', 'Savings Potential')}
            </span>
            <TrendingUp className="h-4 w-4 text-green-500 icon-bounce" />
          </div>
          <div className="text-xl font-bold text-green-500 tabular-nums">
            ${data.potentialSavings.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <span className="text-[10px] text-muted-foreground">/month</span>
        </CardContent>
      </Card>

      {/* Uptime SLA */}
      <Card className="card-hover-lift card-shine">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('executiveDashboard.uptimeSLA', 'Uptime SLA')}
            </span>
            <Activity className="h-4 w-4 text-muted-foreground icon-pulse" />
          </div>
          <div className={cn(
            'text-xl font-bold tabular-nums',
            data.uptimeSLA >= 99.9 ? 'text-green-500' : 
            data.uptimeSLA >= 99 ? 'text-yellow-500' : 'text-red-500'
          )}>
            {data.uptimeSLA.toFixed(2)}%
          </div>
          <span className="text-[10px] text-muted-foreground">Target: 99.9%</span>
        </CardContent>
      </Card>

      {/* Active Alerts */}
      <Card className={cn(
        'card-hover-lift card-shine',
        totalAlerts > 0 ? 'bg-red-500/5 border-red-500/20 glow-danger' : ''
      )}>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('executiveDashboard.activeAlerts', 'Active Alerts')}
            </span>
            <AlertTriangle className={cn(
              'h-4 w-4',
              totalAlerts > 0 ? 'text-red-500 icon-pulse' : 'text-muted-foreground'
            )} />
          </div>
          <div className="flex items-baseline gap-2">
            {data.activeAlerts.critical > 0 && (
              <div className="flex items-center gap-0.5">
                <span className="text-lg font-bold text-red-500 tabular-nums">{data.activeAlerts.critical}</span>
                <span className="text-[10px] text-red-500">CRIT</span>
              </div>
            )}
            {data.activeAlerts.high > 0 && (
              <div className="flex items-center gap-0.5">
                <span className="text-base font-bold text-orange-500 tabular-nums">{data.activeAlerts.high}</span>
                <span className="text-[10px] text-orange-500">HIGH</span>
              </div>
            )}
            {data.activeAlerts.medium > 0 && (
              <div className="flex items-center gap-0.5">
                <span className="text-sm font-semibold text-yellow-500 tabular-nums">{data.activeAlerts.medium}</span>
                <span className="text-[10px] text-yellow-500">MED</span>
              </div>
            )}
            {totalAlerts === 0 && (
              <span className="text-xl font-bold text-green-500 tabular-nums">0</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
