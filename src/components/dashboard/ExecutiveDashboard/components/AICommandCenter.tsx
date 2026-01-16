/**
 * AI Command Center - AI-generated insights with checkmarks
 * Clean Light Design with color palette:
 *   - Primary: #003C7D (dark blue)
 *   - Secondary: #008CFF (light blue)
 *   - Success: #10B981 (green)
 *   - Background: #FFFFFF / #F9FAFB
 *   - Text: #1F2937 (dark gray)
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Sparkles, 
  RefreshCw, 
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  ChevronRight,
  CheckCircle2
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

  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-amber-50 border-amber-200';
      default:
        return 'bg-[#F9FAFB] border-gray-100';
    }
  };

  const getSeverityBadgeStyles = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-600 border-red-200';
      case 'warning':
        return 'bg-amber-100 text-amber-600 border-amber-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#003C7D]/10 rounded-xl">
              <Sparkles className="h-4 w-4 text-[#003C7D]" />
            </div>
            <h3 className="text-base font-semibold text-[#1F2937]">
              {t('executiveDashboard.aiCommandCenter', 'AI Command Center')}
            </h3>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onRefresh}
            disabled={isLoading}
            className="h-8 w-8 p-0 text-gray-500 hover:text-[#003C7D] hover:bg-[#003C7D]/10 rounded-xl"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-1 ml-10">
          {t('executiveDashboard.aiCommandCenterDesc', 'AI-generated insights and recommendations')}
        </p>
      </div>

      <div className="p-6 space-y-4">
        {insights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="p-4 bg-[#F9FAFB] rounded-2xl mb-4">
              <Sparkles className="h-12 w-12 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-[#1F2937]">
              {t('executiveDashboard.noInsights', 'No insights available yet')}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {t('executiveDashboard.insightsWillAppear', 'AI insights will appear as data is analyzed')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* AI Summary Section with Checkmarks */}
            <div className="p-4 rounded-2xl bg-[#10B981]/5 border border-[#10B981]/20">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-[#10B981]" />
                <span className="text-sm font-semibold text-[#1F2937]">{t('executiveDashboard.aiSummary', 'AI Summary')}</span>
              </div>
              <div className="space-y-2">
                {insights.slice(0, 3).map((insight, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#10B981] mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-600">{insight.title}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Detailed Insights */}
            {insights.map((insight) => (
              <div 
                key={insight.id}
                className={cn(
                  'p-4 rounded-2xl border transition-all hover:shadow-sm cursor-pointer',
                  getSeverityStyles(insight.severity)
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'p-2 rounded-xl',
                    insight.severity === 'critical' ? 'bg-red-100 text-red-600' : 
                    insight.severity === 'warning' ? 'bg-amber-100 text-amber-600' :
                    'bg-[#003C7D]/10 text-[#003C7D]'
                  )}>
                    {getInsightIcon(insight.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm text-[#1F2937]">{insight.title}</span>
                      <Badge 
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-medium",
                          getSeverityBadgeStyles(insight.severity)
                        )}
                      >
                        {insight.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2">
                      {insight.description}
                    </p>
                    {insight.recommendation && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                        <Lightbulb className="h-3.5 w-3.5 text-gray-400" />
                        <span className="truncate font-medium">{insight.recommendation}</span>
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-gray-400 tabular-nums">
                        {t('executiveDashboard.confidence', 'Confidence')}: {(insight.confidence * 100).toFixed(0)}%
                      </span>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <div className="border-t border-gray-100 pt-4">
          <span className="text-sm font-semibold text-[#1F2937] mb-3 block">
            {t('executiveDashboard.quickActions', 'Quick Actions')}
          </span>
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-10 text-sm justify-start rounded-xl border-gray-200 bg-[#F9FAFB] text-[#1F2937] hover:bg-[#003C7D]/5 hover:border-[#003C7D]/30 hover:text-[#003C7D]"
            >
              <AlertTriangle className="h-4 w-4 mr-2 text-[#003C7D]" />
              {t('executiveDashboard.runSecurityScan', 'Security Scan')}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-10 text-sm justify-start rounded-xl border-gray-200 bg-[#F9FAFB] text-[#1F2937] hover:bg-[#003C7D]/5 hover:border-[#003C7D]/30 hover:text-[#003C7D]"
            >
              <TrendingUp className="h-4 w-4 mr-2 text-[#003C7D]" />
              {t('executiveDashboard.costReport', 'Cost Report')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
