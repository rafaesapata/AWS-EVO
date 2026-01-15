import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Brain, RefreshCw, AlertTriangle, Shield, Globe, Clock, Target, Sparkles, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import ReactMarkdown from "react-markdown";

interface WafAiAnalysisProps {
  accountId?: string;
}

interface AnalysisContext {
  metrics: {
    totalRequests: number;
    blockedRequests: number;
    blockRate: string;
    uniqueAttackers: number;
  };
  threatTypes: Array<{ type: string; count: number; percentage: string }>;
  topAttackers: Array<{ ip: string; country: string; blockedRequests: number }>;
  geoDistribution: Array<{ country: string; blockedRequests: number }>;
}

interface AnalysisResponse {
  id?: string;
  hasAnalysis?: boolean;
  analysis: string;
  context: AnalysisContext;
  riskLevel?: string;
  isFallback?: boolean;
  generatedAt: string;
  aiError?: string;
  message?: string;
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

function isAnalysisStale(dateString: string): boolean {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours > 6; // Consider stale after 6 hours
}

export function WafAiAnalysis({ accountId }: WafAiAnalysisProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingLatest, setIsLoadingLatest] = useState(true);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load latest analysis on mount
  useEffect(() => {
    loadLatestAnalysis();
  }, [accountId]);

  const loadLatestAnalysis = async () => {
    setIsLoadingLatest(true);
    try {
      const response = await apiClient.invoke<AnalysisResponse>('waf-dashboard-api', {
        body: {
          action: 'get-latest-analysis',
          accountId,
        }
      });
      
      if (response.error) {
        console.warn('Failed to load latest analysis:', response.error);
        return;
      }
      
      const data = response.data;
      if (data?.hasAnalysis) {
        setAnalysis(data);
      }
    } catch (err) {
      console.warn('Failed to load latest analysis:', err);
    } finally {
      setIsLoadingLatest(false);
    }
  };

  const runAnalysis = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiClient.invoke<AnalysisResponse>('waf-dashboard-api', {
        body: {
          action: 'ai-analysis',
          accountId,
        }
      });
      
      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }
      
      const data = response.data;
      setAnalysis(data);
      
      if (data?.aiError) {
        toast({
          title: t('waf.aiAnalysis.fallbackMode', 'Modo Fallback'),
          description: data.aiError,
          variant: 'default',
        });
      } else {
        toast({
          title: t('waf.aiAnalysis.success', 'Análise Concluída'),
          description: t('waf.aiAnalysis.successDesc', 'A análise de IA foi gerada e salva com sucesso.'),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to run analysis';
      setError(message);
      toast({
        title: t('common.error', 'Erro'),
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isStale = analysis?.generatedAt ? isAnalysisStale(analysis.generatedAt) : false;

  return (
    <Card className="glass border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle>{t('waf.aiAnalysis.title', 'Análise Inteligente de Tráfego')}</CardTitle>
          </div>
          <Button
            onClick={runAnalysis}
            disabled={isLoading}
            className="glass hover-glow"
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                {t('waf.aiAnalysis.analyzing', 'Analisando...')}
              </>
            ) : analysis ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('waf.aiAnalysis.updateAnalysis', 'Atualizar Análise')}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                {t('waf.aiAnalysis.runAnalysis', 'Executar Análise com IA')}
              </>
            )}
          </Button>
        </div>
        <CardDescription>
          {t('waf.aiAnalysis.description', 'Análise em tempo real do tráfego WAF usando inteligência artificial para identificar padrões de ataque e ameaças')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Brain className="h-5 w-5 animate-pulse" />
              <span>{t('waf.aiAnalysis.processingData', 'Processando dados de tráfego...')}</span>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : isLoadingLatest ? (
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <p className="text-destructive font-medium">{error}</p>
            <Button variant="outline" onClick={runAnalysis} className="mt-4">
              {t('common.retry', 'Tentar Novamente')}
            </Button>
          </div>
        ) : analysis ? (
          <div className="space-y-6">
            {/* Last Updated Banner */}
            <div className={`flex items-center justify-between p-3 rounded-lg ${isStale ? 'bg-warning/10 border border-warning/30' : 'bg-muted/30'}`}>
              <div className="flex items-center gap-2">
                <History className={`h-4 w-4 ${isStale ? 'text-warning' : 'text-muted-foreground'}`} />
                <span className={`text-sm ${isStale ? 'text-warning' : 'text-muted-foreground'}`}>
                  {t('waf.aiAnalysis.lastUpdated', 'Última análise')}: {getTimeAgo(analysis.generatedAt)}
                  {analysis.isFallback && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {t('waf.aiAnalysis.automated', 'Automático')}
                    </Badge>
                  )}
                </span>
              </div>
              {isStale && (
                <span className="text-xs text-warning">
                  {t('waf.aiAnalysis.staleWarning', 'Recomendamos atualizar a análise')}
                </span>
              )}
            </div>

            {/* Quick Stats */}
            {analysis.context?.metrics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Shield className="h-4 w-4" />
                    <span className="text-xs">{t('waf.totalRequests', 'Total Requisições')}</span>
                  </div>
                  <p className="text-2xl font-bold">{analysis.context.metrics.totalRequests?.toLocaleString() || 0}</p>
                </div>
                <div className="p-4 rounded-lg bg-destructive/10">
                  <div className="flex items-center gap-2 text-destructive mb-1">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-xs">{t('waf.blocked', 'Bloqueadas')}</span>
                  </div>
                  <p className="text-2xl font-bold text-destructive">
                    {analysis.context.metrics.blockedRequests?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Target className="h-4 w-4" />
                    <span className="text-xs">{t('waf.attackers', 'Atacantes')}</span>
                  </div>
                  <p className="text-2xl font-bold">{analysis.context.metrics.uniqueAttackers || 0}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Clock className="h-4 w-4" />
                    <span className="text-xs">{t('waf.blockRate', 'Taxa de Bloqueio')}</span>
                  </div>
                  <p className="text-2xl font-bold">{analysis.context.metrics.blockRate || '0%'}</p>
                </div>
              </div>
            )}

            {/* Risk Level Badge */}
            {analysis.riskLevel && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{t('waf.aiAnalysis.riskLevel', 'Nível de Risco')}:</span>
                <Badge 
                  variant={
                    analysis.riskLevel === 'crítico' || analysis.riskLevel === 'critical' ? 'destructive' :
                    analysis.riskLevel === 'alto' || analysis.riskLevel === 'high' ? 'destructive' :
                    analysis.riskLevel === 'médio' || analysis.riskLevel === 'medium' ? 'default' :
                    'secondary'
                  }
                  className="text-sm"
                >
                  {analysis.riskLevel.charAt(0).toUpperCase() + analysis.riskLevel.slice(1)}
                </Badge>
              </div>
            )}

            {/* Threat Types */}
            {analysis.context?.threatTypes && analysis.context.threatTypes.length > 0 && (
              <div className="p-4 rounded-lg bg-muted/30">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  {t('waf.threatTypesDetected', 'Tipos de Ameaças Detectadas')}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.context.threatTypes.map((threat, idx) => (
                    <Badge key={idx} variant="outline" className="text-sm">
                      {threat.type}: {threat.count} ({threat.percentage})
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* AI Analysis */}
            <div className="p-4 rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="h-5 w-5 text-primary" />
                <h4 className="font-medium">{t('waf.aiAnalysis.aiInsights', 'Análise da IA')}</h4>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{analysis.analysis}</ReactMarkdown>
              </div>
            </div>

            {/* Generated timestamp */}
            <p className="text-xs text-muted-foreground text-right">
              {t('waf.aiAnalysis.generatedAt', 'Gerado em')}: {new Date(analysis.generatedAt).toLocaleString()}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Brain className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {t('waf.aiAnalysis.noAnalysis', 'Nenhuma análise realizada')}
            </h3>
            <p className="text-muted-foreground mb-4 max-w-md">
              {t('waf.aiAnalysis.clickToStart', 'Clique no botão acima para executar uma análise inteligente do tráfego WAF das últimas 24 horas usando IA.')}
            </p>
            <div className="flex flex-wrap gap-2 justify-center text-sm text-muted-foreground">
              <Badge variant="outline" className="gap-1">
                <Shield className="h-3 w-3" />
                {t('waf.aiAnalysis.feature1', 'Detecção de Padrões')}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Globe className="h-3 w-3" />
                {t('waf.aiAnalysis.feature2', 'Análise Geográfica')}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Target className="h-3 w-3" />
                {t('waf.aiAnalysis.feature3', 'Identificação de Campanhas')}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {t('waf.aiAnalysis.feature4', 'Recomendações de Segurança')}
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
