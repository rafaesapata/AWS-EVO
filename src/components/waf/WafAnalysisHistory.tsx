import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  History, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  Brain,
  AlertTriangle,
  Shield,
  Target,
  TrendingUp
} from "lucide-react";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface AnalysisHistoryItem {
  id: string;
  analysis: string;
  context: {
    metrics: {
      totalRequests: number;
      blockedRequests: number;
      blockRate: string;
      uniqueAttackers: number;
    };
    threatTypes: Array<{ type: string; count: number; percentage: string }>;
  };
  riskLevel?: string;
  isFallback?: boolean;
  generatedAt: string;
}

interface WafAnalysisHistoryProps {
  accountId?: string;
}

function getTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'agora mesmo';
  if (diffMins < 60) return `há ${diffMins} minuto${diffMins > 1 ? 's' : ''}`;
  if (diffHours < 24) return `há ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
  return `há ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
}

export function WafAnalysisHistory({ accountId }: WafAnalysisHistoryProps) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [limit] = useState(10);
  const [offset, setOffset] = useState(0);

  const { data, isLoading, error: queryError } = useQuery({
    queryKey: ['waf-analysis-history', accountId, limit, offset],
    queryFn: async () => {
      const response = await apiClient.invoke<{
        analyses: AnalysisHistoryItem[];
        pagination: {
          total: number;
          limit: number;
          offset: number;
          hasMore: boolean;
        };
      }>('waf-dashboard-api', {
        body: {
          action: 'get-analysis-history',
          accountId,
          limit,
          offset,
        }
      });
      
      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }
      
      return response.data;
    },
  });

  const analyses = data?.analyses || [];
  const pagination = data?.pagination;

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleLoadMore = () => {
    setOffset(prev => prev + limit);
  };

  const handleLoadPrevious = () => {
    setOffset(prev => Math.max(0, prev - limit));
  };

  return (
    <Card className="glass border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <CardTitle>{t('waf.analysisHistory.title', 'Histórico de Análises')}</CardTitle>
        </div>
        <CardDescription>
          {t('waf.analysisHistory.description', 'Consulte análises anteriores e compare tendências ao longo do tempo')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="p-4 rounded-lg border border-muted">
                <Skeleton className="h-4 w-1/3 mb-2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3 mt-2" />
              </div>
            ))}
          </div>
        ) : queryError ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <p className="text-destructive font-medium">
              {queryError instanceof Error ? queryError.message : 'Erro ao carregar histórico'}
            </p>
          </div>
        ) : analyses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <History className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {t('waf.analysisHistory.noHistory', 'Nenhuma análise no histórico')}
            </h3>
            <p className="text-muted-foreground">
              {t('waf.analysisHistory.noHistoryDesc', 'Execute análises de IA para começar a construir seu histórico')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Pagination Info */}
            {pagination && pagination.total > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground pb-2 border-b">
                <span>
                  {t('waf.analysisHistory.showing', 'Mostrando')} {offset + 1}-{Math.min(offset + limit, pagination.total)} {t('waf.analysisHistory.of', 'de')} {pagination.total}
                </span>
                <Badge variant="outline" className="gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {pagination.total} {t('waf.analysisHistory.analyses', 'análises')}
                </Badge>
              </div>
            )}

            {/* Analysis List */}
            {analyses.map((analysis, index) => {
              const isExpanded = expandedId === analysis.id;
              const isLatest = index === 0 && offset === 0;
              
              return (
                <div
                  key={analysis.id}
                  className={cn(
                    "p-4 rounded-lg border transition-all",
                    isLatest ? "border-primary/40 bg-primary/5" : "border-muted hover:border-primary/30"
                  )}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {new Date(analysis.generatedAt).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({getTimeAgo(analysis.generatedAt)})
                        </span>
                        {isLatest && (
                          <Badge variant="default" className="text-xs">
                            {t('waf.analysisHistory.latest', 'Mais recente')}
                          </Badge>
                        )}
                        {analysis.isFallback && (
                          <Badge variant="secondary" className="text-xs">
                            {t('waf.analysisHistory.automated', 'Automático')}
                          </Badge>
                        )}
                      </div>
                      
                      {/* Quick Stats */}
                      <div className="flex flex-wrap gap-3 mt-2">
                        <div className="flex items-center gap-1 text-xs">
                          <Shield className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground">{t('waf.totalRequests', 'Total')}:</span>
                          <span className="font-medium">{analysis.context.metrics.totalRequests.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <AlertTriangle className="h-3 w-3 text-destructive" />
                          <span className="text-muted-foreground">{t('waf.blocked', 'Bloqueadas')}:</span>
                          <span className="font-medium text-destructive">{analysis.context.metrics.blockedRequests.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <Target className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground">{t('waf.attackers', 'Atacantes')}:</span>
                          <span className="font-medium">{analysis.context.metrics.uniqueAttackers}</span>
                        </div>
                        {analysis.riskLevel && (
                          <Badge 
                            variant={
                              analysis.riskLevel === 'crítico' || analysis.riskLevel === 'critical' ? 'destructive' :
                              analysis.riskLevel === 'alto' || analysis.riskLevel === 'high' ? 'destructive' :
                              analysis.riskLevel === 'médio' || analysis.riskLevel === 'medium' ? 'default' :
                              'secondary'
                            }
                            className="text-xs"
                          >
                            {analysis.riskLevel.charAt(0).toUpperCase() + analysis.riskLevel.slice(1)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpand(analysis.id)}
                      className="shrink-0"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-4 w-4 mr-1" />
                          {t('common.collapse', 'Recolher')}
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 mr-1" />
                          {t('common.expand', 'Expandir')}
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      {/* Threat Types */}
                      {analysis.context.threatTypes && analysis.context.threatTypes.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                            <Target className="h-4 w-4 text-primary" />
                            {t('waf.threatTypesDetected', 'Tipos de Ameaças')}
                          </h5>
                          <div className="flex flex-wrap gap-2">
                            {analysis.context.threatTypes.map((threat, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {threat.type}: {threat.count} ({threat.percentage})
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* AI Analysis */}
                      <div className="p-4 rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                        <div className="flex items-center gap-2 mb-3">
                          <Brain className="h-4 w-4 text-primary" />
                          <h5 className="text-sm font-medium">{t('waf.aiAnalysis.aiInsights', 'Análise da IA')}</h5>
                        </div>
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown>{analysis.analysis}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Pagination Controls */}
            {pagination && (pagination.hasMore || offset > 0) && (
              <div className="flex items-center justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadPrevious}
                  disabled={offset === 0}
                  className="glass hover-glow"
                >
                  {t('common.previous', 'Anterior')}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {t('waf.analysisHistory.page', 'Página')} {Math.floor(offset / limit) + 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={!pagination.hasMore}
                  className="glass hover-glow"
                >
                  {t('common.next', 'Próximo')}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
