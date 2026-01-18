/**
 * AI Command Center - AI-generated insights with checkmarks
 * Design aligned with Executive Summary Bar:
 *   - Primary: #00B2FF (light blue)
 *   - Text: #393939 (dark gray)
 *   - Labels: #5F5F5F (medium gray)
 *   - Background: #FFFFFF
 *   - Border: border-gray-200
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
  XCircle,
  DollarSign,
  Play,
  FileText,
  AlertCircle,
  Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { AIInsight } from '../types';
import InfoIcon from './InfoIcon';

interface Props {
  insights: AIInsight[];
  onRefresh: () => void;
  isLoading?: boolean;
}

export default function AICommandCenter({ insights, onRefresh, isLoading }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'cost_anomaly':
        return <TrendingUp className="h-4 w-4" />;
      case 'security_risk':
        return <AlertTriangle className="h-4 w-4" />;
      case 'optimization':
        return <DollarSign className="h-4 w-4" />;
      default:
        return <Sparkles className="h-4 w-4" />;
    }
  };

  // Get appropriate icon and color for AI summary items based on content
  const getSummaryItemStyle = (insight: AIInsight) => {
    const title = insight.title.toLowerCase();
    const isNegative = title.includes('fora do ar') || 
                       title.includes('down') || 
                       title.includes('erro') || 
                       title.includes('error') ||
                       title.includes('crítico') ||
                       title.includes('critical') ||
                       title.includes('falha') ||
                       title.includes('fail') ||
                       insight.severity === 'critical';
    
    const isCost = title.includes('custo') || 
                   title.includes('cost') || 
                   title.includes('economia') || 
                   title.includes('saving') ||
                   title.includes('$') ||
                   insight.type === 'optimization' ||
                   insight.type === 'cost_anomaly';
    
    const isSecurity = title.includes('segurança') || 
                       title.includes('security') || 
                       title.includes('vulnerab') ||
                       insight.type === 'security_risk';

    if (isNegative) {
      return {
        icon: <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />,
        textColor: 'text-red-500',
        bgColor: 'bg-red-50 border-red-200'
      };
    }
    if (isCost) {
      return {
        icon: <DollarSign className="h-4 w-4 text-[#00B2FF] mt-0.5 flex-shrink-0" />,
        textColor: 'text-[#393939]',
        bgColor: 'bg-[#00B2FF]/5 border-[#00B2FF]/20'
      };
    }
    if (isSecurity) {
      return {
        icon: <Shield className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />,
        textColor: 'text-[#393939]',
        bgColor: 'bg-amber-50 border-amber-200'
      };
    }
    return {
      icon: <AlertCircle className="h-4 w-4 text-[#00B2FF] mt-0.5 flex-shrink-0" />,
      textColor: 'text-[#393939]',
      bgColor: 'bg-white border-gray-200'
    };
  };

  const getSeverityBadgeStyles = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-500 border-red-200';
      case 'warning':
        return 'bg-amber-100 text-amber-500 border-amber-200';
      default:
        return 'bg-gray-100 text-[#5F5F5F] border-gray-200';
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <p className="text-base font-light text-[#5F5F5F]">
            {t('executiveDashboard.aiCommandCenter', 'Ações Recomendadas')}
          </p>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onRefresh}
              disabled={isLoading}
              className="h-7 w-7 p-0 text-[#5F5F5F] hover:text-[#00B2FF] hover:bg-[#00B2FF]/10 rounded-lg"
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>
            <InfoIcon tooltip={t('executiveDashboard.aiCommandCenterTooltip', 'AI-powered recommendations based on your infrastructure analysis.')} />
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4 flex-1">
        {insights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="p-3 bg-white border border-gray-200 rounded-xl mb-3">
              <Sparkles className="h-8 w-8 text-gray-300" />
            </div>
            <p className="text-sm font-light text-[#393939]">
              {t('executiveDashboard.noInsights', 'No insights available yet')}
            </p>
            <p className="text-xs font-light text-[#5F5F5F] mt-1">
              {t('executiveDashboard.insightsWillAppear', 'AI insights will appear as data is analyzed')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* AI Summary Section */}
            <div className="space-y-2">
              <span className="text-sm font-light text-[#5F5F5F] block">
                {t('executiveDashboard.aiSummary', 'AI Summary')}
              </span>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {insights.slice(0, 3).map((insight, idx) => {
                  const style = getSummaryItemStyle(insight);
                  
                  return (
                    <div 
                      key={idx} 
                      className={cn(
                        "p-3 rounded-xl border cursor-default",
                        style.bgColor
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {style.icon}
                        <span className={cn("text-sm font-light", style.textColor)}>{insight.title}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detailed Insights */}
            <div className="space-y-2">
              {insights.slice(0, 2).map((insight) => (
                <div 
                  key={insight.id}
                  className="p-3 rounded-xl border border-gray-200 bg-white transition-all hover:border-[#00B2FF]/30 cursor-pointer"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 rounded-lg bg-[#00B2FF]/10 text-[#00B2FF]">
                      {getInsightIcon(insight.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-light text-sm text-[#393939]">{insight.title}</span>
                        <Badge 
                          className={cn(
                            "text-xs px-1.5 py-0 rounded-full font-light",
                            getSeverityBadgeStyles(insight.severity)
                          )}
                        >
                          {insight.severity}
                        </Badge>
                      </div>
                      <p className="text-xs font-light text-[#5F5F5F] line-clamp-1">
                        {insight.description}
                      </p>
                      {insight.recommendation && (
                        <div className="mt-1.5 flex items-center gap-1 text-xs text-[#5F5F5F]">
                          <Lightbulb className="h-3 w-3 text-[#00B2FF]" />
                          <span className="truncate font-light">{insight.recommendation}</span>
                        </div>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#5F5F5F] flex-shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="border-t border-gray-100 pt-4 mt-auto">
          <span className="text-sm font-light text-[#5F5F5F] mb-2 block">
            {t('executiveDashboard.quickActions', 'Quick Actions')}
          </span>
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate('/security-posture')}
              className="h-10 text-sm font-light justify-start rounded-xl border-gray-200 bg-white text-[#393939] hover:bg-[#00B2FF]/5 hover:border-[#00B2FF]/30 hover:text-[#00B2FF] shadow-sm transition-all"
            >
              <Play className="h-4 w-4 mr-2 text-[#00B2FF]" />
              {t('executiveDashboard.runSecurityScan', 'Security Scan')}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate('/cost-analysis')}
              className="h-10 text-sm font-light justify-start rounded-xl border-gray-200 bg-white text-[#393939] hover:bg-[#00B2FF]/5 hover:border-[#00B2FF]/30 hover:text-[#00B2FF] shadow-sm transition-all"
            >
              <FileText className="h-4 w-4 mr-2 text-[#00B2FF]" />
              {t('executiveDashboard.costReport', 'Cost Report')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
