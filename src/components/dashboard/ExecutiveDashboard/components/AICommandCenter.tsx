/**
 * AI Command Center - AI-generated insights
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Sparkles, 
  RefreshCw, 
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { AIInsight } from '../types';

interface Props {
  insights: AIInsight[];
  onRefresh: () => void;
  isLoading?: boolean;
}

export default function AICommandCenter({ insights, onRefresh, isLoading }: Props) {
  const { t } = useTranslation();

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'cost_anomaly':
        return <TrendingUp className="h-4 w-4" />;
      case 'security_risk':
        return <AlertTriangle className="h-4 w-4" />;
      case 'optimization':
        return <Lightbulb className="h-4 w-4" />;
      default:
        return <Sparkles className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'warning':
        return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      default:
        return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'destructive';
      case 'warning':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <Card className="h-full card-hover-lift card-shine">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary icon-pulse" />
            <CardTitle className="text-base">{t('executiveDashboard.aiCommandCenter', 'AI Command Center')}</CardTitle>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onRefresh}
            disabled={isLoading}
            className="h-7 w-7 p-0 transition-all hover:scale-105 active:scale-95"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
        <CardDescription className="text-xs">
          {t('executiveDashboard.aiCommandCenterDesc', 'AI-generated insights and recommendations')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center animate-in fade-in-0 zoom-in-95 duration-500">
            <Sparkles className="h-10 w-10 text-muted-foreground/50 mb-3 icon-pulse" />
            <p className="text-xs text-muted-foreground">
              {t('executiveDashboard.noInsights', 'No insights available yet')}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {t('executiveDashboard.insightsWillAppear', 'AI insights will appear as data is analyzed')}
            </p>
          </div>
        ) : (
          <div className="space-y-2 animate-stagger">
            {insights.map((insight, index) => (
              <div 
                key={insight.id}
                className={cn(
                  'p-3 rounded-lg border transition-all duration-300 hover:bg-muted/50 hover:translate-x-1 cursor-pointer',
                  getSeverityColor(insight.severity),
                  insight.severity === 'critical' && 'alert-pulse glow-danger'
                )}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-start gap-2">
                  <div className={cn(
                    'p-1.5 rounded-lg',
                    getSeverityColor(insight.severity)
                  )}>
                    {getInsightIcon(insight.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-medium text-xs">{insight.title}</span>
                      <Badge variant={getSeverityBadge(insight.severity) as any} className="text-[10px] px-1 py-0">
                        {insight.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {insight.description}
                    </p>
                    {insight.recommendation && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-primary">
                        <Lightbulb className="h-2.5 w-2.5" />
                        <span className="truncate">{insight.recommendation}</span>
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        Confidence: {(insight.confidence * 100).toFixed(0)}%
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <div className="border-t pt-3">
          <span className="text-xs font-medium mb-2 block">
            {t('executiveDashboard.quickActions', 'Quick Actions')}
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs justify-start transition-all hover:scale-[1.02] active:scale-95 btn-press">
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
              {t('executiveDashboard.runSecurityScan', 'Security Scan')}
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs justify-start transition-all hover:scale-[1.02] active:scale-95 btn-press">
              <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
              {t('executiveDashboard.costReport', 'Cost Report')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
