/**
 * Advanced RI/SP Analyzer V3
 * Features: Phased parallel loading with skeletons
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useTranslation } from 'react-i18next';
import { 
  TrendingUp, DollarSign, Target, AlertTriangle, CheckCircle,
  BarChart3, Calendar, Info, Loader2, BookOpen, Lightbulb,
  ExternalLink, Clock, Percent, RefreshCw
} from 'lucide-react';
import { awsService } from '@/services/aws-service';
import {
  SummaryStatsSkeleton,
  InsightsSkeleton,
  ResourcesSummarySkeleton,
  RecommendationsSkeleton,
  CoverageSkeleton,
  TabsSkeleton,
  PhaseLoadingIndicator
} from './RISPSkeletons';

interface AdvancedRISPAnalyzerV3Props {
  accountId: string;
  region?: string;
  regions?: string[];
}

// Loading phases enum
enum LoadingPhase {
  IDLE = 0,
  LOADING_SAVED = 1,
  LOADING_SUMMARY = 2,
  LOADING_RECOMMENDATIONS = 3,
  LOADING_COVERAGE = 4,
  COMPLETE = 5
}

interface AnalysisData {
  success: boolean;
  error?: string;
  executiveSummary?: {
    status: string;
    totalCommitments: number;
    coverageScore: number;
    potentialAnnualSavings: number;
    recommendationsSummary: {
      total: number;
      critical: number;
      high: number;
      quickWins: number;
    };
    keyInsights: string[];
  };
  reservedInstances?: {
    ec2: any[];
    rds: any[];
    total: number;
  };
  savingsPlans?: {
    plans: any[];
    total: number;
  };
  coverage?: {
    reservedInstances: number;
    savingsPlans: number;
    overall: number;
  };
  recommendations?: any[];
  potentialSavings?: {
    monthly: number;
    annual: number;
    maxPercentage: number;
  };
  currentResources?: {
    ec2Instances: number;
    rdsInstances: number;
  };
  analysisMetadata?: {
    region?: string;
    regions?: string[];
    regionsCount?: number;
    accountId: string;
    timestamp: string;
    dataSource?: string;
  };
}

// Phase loading state
interface PhaseState {
  summary: boolean;
  insights: boolean;
  resources: boolean;
  recommendations: boolean;
  coverage: boolean;
}

export function AdvancedRISPAnalyzerV3({ accountId, region, regions }: AdvancedRISPAnalyzerV3Props) {
  const { t } = useTranslation();
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState<LoadingPhase>(LoadingPhase.IDLE);
  const [activeTab, setActiveTab] = useState('summary');
  
  // Phased loading states - each section loads independently
  const [phaseLoaded, setPhaseLoaded] = useState<PhaseState>({
    summary: false,
    insights: false,
    resources: false,
    recommendations: false,
    coverage: false
  });

  const regionsToAnalyze = useMemo(() => 
    regions?.length ? regions : (region ? [region] : ['us-east-1']),
    [regions, region]
  );

  // Phase 1: Load saved data on mount (fast)
  useEffect(() => {
    const loadSavedData = async () => {
      if (!accountId) return;
      
      setCurrentPhase(LoadingPhase.LOADING_SAVED);
      try {
        const response = await awsService.getRISPData(accountId);
        const data = response?.data || response;
        
        if (data?.hasData && data?.executiveSummary) {
          setAnalysis(data as AnalysisData);
          // Simulate phased reveal for better UX
          simulatePhasedReveal();
        }
      } catch (error) {
        console.error('Error loading saved RI/SP data:', error);
      } finally {
        setCurrentPhase(LoadingPhase.IDLE);
      }
    };
    
    loadSavedData();
  }, [accountId]);

  // Simulate phased reveal for smooth UX
  const simulatePhasedReveal = useCallback(() => {
    const delays = [100, 200, 350, 500, 700];
    const phases: (keyof PhaseState)[] = ['summary', 'insights', 'resources', 'recommendations', 'coverage'];
    
    phases.forEach((phase, index) => {
      setTimeout(() => {
        setPhaseLoaded(prev => ({ ...prev, [phase]: true }));
      }, delays[index]);
    });
  }, []);

  // Reset phases for new analysis
  const resetPhases = useCallback(() => {
    setPhaseLoaded({
      summary: false,
      insights: false,
      resources: false,
      recommendations: false,
      coverage: false
    });
  }, []);

  // Run full analysis with phased loading
  const runAnalysis = async () => {
    setLoading(true);
    setErrorMessage(null);
    resetPhases();
    setCurrentPhase(LoadingPhase.LOADING_SUMMARY);
    
    try {
      const response = await awsService.analyzeRISP(accountId, regionsToAnalyze, 'comprehensive');
      
      if (response.error) {
        setErrorMessage(response.error.message || t('risp.error.analysis', 'Erro na análise'));
        setAnalysis(null);
        return;
      }
      
      const data = response.data as AnalysisData;
      
      if (!data || !data.executiveSummary) {
        setErrorMessage(t('risp.error.invalidResponse', 'Resposta inválida da API'));
        setAnalysis(null);
        return;
      }
      
      setAnalysis(data);
      
      // Phased reveal after data loads
      setCurrentPhase(LoadingPhase.LOADING_SUMMARY);
      setTimeout(() => {
        setPhaseLoaded(prev => ({ ...prev, summary: true }));
        setCurrentPhase(LoadingPhase.LOADING_RECOMMENDATIONS);
      }, 150);
      
      setTimeout(() => {
        setPhaseLoaded(prev => ({ ...prev, insights: true }));
      }, 300);
      
      setTimeout(() => {
        setPhaseLoaded(prev => ({ ...prev, resources: true }));
        setCurrentPhase(LoadingPhase.LOADING_COVERAGE);
      }, 450);
      
      setTimeout(() => {
        setPhaseLoaded(prev => ({ ...prev, recommendations: true }));
      }, 600);
      
      setTimeout(() => {
        setPhaseLoaded(prev => ({ ...prev, coverage: true }));
        setCurrentPhase(LoadingPhase.COMPLETE);
      }, 750);
      
    } catch (error) {
      console.error('Error running analysis:', error);
      setErrorMessage(error instanceof Error ? error.message : t('risp.error.unknown', 'Erro desconhecido'));
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  // Utility functions
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'destructive';
      case 'high': return 'default';
      case 'medium': return 'secondary';
      default: return 'outline';
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === 'optimized') {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    return <AlertTriangle className="h-4 w-4 text-orange-500" />;
  };

  const getStatusText = (status: string) => {
    if (status === 'optimized') return t('risp.status.optimized', 'Otimizado');
    if (status === 'needs_attention') return t('risp.status.needsAttention', 'Atenção');
    return t('risp.status.analyzing', 'Analisando');
  };

  const getPhaseMessage = () => {
    switch (currentPhase) {
      case LoadingPhase.LOADING_SAVED: return t('risp.loading.saved', 'Carregando análise anterior...');
      case LoadingPhase.LOADING_SUMMARY: return t('risp.loading.summary', 'Carregando resumo...');
      case LoadingPhase.LOADING_RECOMMENDATIONS: return t('risp.loading.recommendations', 'Processando recomendações...');
      case LoadingPhase.LOADING_COVERAGE: return t('risp.loading.coverage', 'Calculando cobertura...');
      default: return '';
    }
  };

  // Check if has no resources
  const hasNoResources = analysis?.currentResources?.ec2Instances === 0 && 
                         analysis?.currentResources?.rdsInstances === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">
            {t('risp.title', 'Análise Avançada de Reserved Instances & Savings Plans')}
          </h2>
          <p className="text-muted-foreground">
            {t('risp.subtitle', 'Análise completa de oportunidades de otimização de custos')}
          </p>
          {analysis?.analysisMetadata?.dataSource === 'database' && (
            <Badge variant="outline" className="mt-2">
              <Clock className="h-3 w-3 mr-1" />
              {t('risp.previousAnalysis', 'Análise anterior')} - {new Date(analysis.analysisMetadata.timestamp).toLocaleString('pt-BR')}
            </Badge>
          )}
        </div>
        <Button onClick={runAnalysis} disabled={loading} className="glass hover-glow">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('risp.analyzing', 'Analisando...')}
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              {analysis ? t('risp.updateAnalysis', 'Atualizar Análise') : t('risp.runAnalysis', 'Executar Análise')}
            </>
          )}
        </Button>
      </div>

      {/* Phase Loading Indicator */}
      {currentPhase > LoadingPhase.IDLE && currentPhase < LoadingPhase.COMPLETE && (
        <PhaseLoadingIndicator 
          phase={currentPhase} 
          totalPhases={4} 
          message={getPhaseMessage()} 
        />
      )}

      {/* Loading Overlay for Full Analysis */}
      {loading && !analysis && (
        <Card className="glass border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="relative">
                <div className="absolute inset-0 animate-ping rounded-full bg-primary/20 h-16 w-16" />
                <Loader2 className="h-16 w-16 text-primary animate-spin relative z-10" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">{t('risp.analyzingInfra', 'Analisando sua infraestrutura...')}</h3>
                <p className="text-muted-foreground max-w-md">
                  {t('risp.analyzingDesc', 'Coletando dados de utilização, Reserved Instances e Savings Plans.')}
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{t('risp.estimatedTime', 'Tempo estimado: 10-30 segundos')}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('risp.error.title', 'Erro na Análise')}</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* No Resources Warning */}
      {analysis && hasNoResources && (
        <Card className="glass border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="py-8">
            <div className="text-center space-y-4">
              <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
              <div>
                <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-200 mb-2">
                  {t('risp.noResources.title', 'Nenhum Recurso Computacional Encontrado')}
                </h3>
                <p className="text-amber-700 dark:text-amber-300 max-w-lg mx-auto">
                  {t('risp.noResources.desc', 'Não foram encontradas instâncias EC2 ou RDS em execução.')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analysis Results with Phased Loading */}
      {analysis && analysis.executiveSummary && !hasNoResources && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {phaseLoaded.summary ? (
            <TabsList className="glass grid w-full grid-cols-3">
              <TabsTrigger value="summary">{t('risp.tabs.summary', 'Resumo Executivo')}</TabsTrigger>
              <TabsTrigger value="recommendations">{t('risp.tabs.recommendations', 'Recomendações')}</TabsTrigger>
              <TabsTrigger value="coverage">{t('risp.tabs.coverage', 'Cobertura')}</TabsTrigger>
            </TabsList>
          ) : (
            <TabsSkeleton />
          )}

          {/* Executive Summary Tab */}
          <TabsContent value="summary" className="space-y-6">
            {/* Stats Cards */}
            {phaseLoaded.summary ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="glass border-primary/20">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('risp.stats.status', 'Status Geral')}</CardTitle>
                    {getStatusIcon(analysis.executiveSummary.status)}
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{getStatusText(analysis.executiveSummary.status)}</div>
                    <p className="text-xs text-muted-foreground">
                      {analysis.executiveSummary.totalCommitments} {t('risp.stats.activeCommitments', 'compromissos ativos')}
                    </p>
                  </CardContent>
                </Card>

                <Card className="glass border-primary/20">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('risp.stats.potentialSavings', 'Economia Potencial')}</CardTitle>
                    <DollarSign className="h-4 w-4 text-green-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold text-green-600">
                      {formatCurrency(analysis.potentialSavings?.annual || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('risp.stats.perYear', 'por ano')} ({t('risp.stats.upTo', 'até')} {analysis.potentialSavings?.maxPercentage || 0}%)
                    </p>
                  </CardContent>
                </Card>

                <Card className="glass border-primary/20">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('risp.stats.coverageScore', 'Score de Cobertura')}</CardTitle>
                    <Target className="h-4 w-4 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">
                      {(analysis.coverage?.overall || 0).toFixed(1)}%
                    </div>
                    <Progress value={analysis.coverage?.overall || 0} className="mt-2" />
                  </CardContent>
                </Card>

                <Card className="glass border-primary/20">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('risp.stats.recommendations', 'Recomendações')}</CardTitle>
                    <TrendingUp className="h-4 w-4 text-purple-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">
                      {analysis.recommendations?.length || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {analysis.executiveSummary.recommendationsSummary?.quickWins || 0} {t('risp.stats.quickWins', 'implementações rápidas')}
                    </p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <SummaryStatsSkeleton />
            )}

            {/* Key Insights */}
            {phaseLoaded.insights ? (
              <Card className="glass border-primary/20">
                <CardHeader>
                  <CardTitle>{t('risp.insights.title', 'Principais Insights')}</CardTitle>
                  <CardDescription>{t('risp.insights.desc', 'Resumo dos pontos mais importantes')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {analysis.executiveSummary.keyInsights?.map((insight: string, index: number) => (
                      <div key={index} className="flex items-start gap-3">
                        <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <p className="text-sm">{insight}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <InsightsSkeleton />
            )}

            {/* Resources Summary */}
            {phaseLoaded.resources ? (
              <Card className="glass border-primary/20">
                <CardHeader>
                  <CardTitle>{t('risp.resources.title', 'Recursos Analisados')}</CardTitle>
                  <CardDescription>{t('risp.resources.desc', 'Resumo dos recursos AWS analisados')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-semibold">{analysis.reservedInstances?.ec2?.length || 0}</div>
                      <div className="text-sm text-muted-foreground">EC2 RIs</div>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-semibold">{analysis.reservedInstances?.rds?.length || 0}</div>
                      <div className="text-sm text-muted-foreground">RDS RIs</div>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-semibold">{analysis.savingsPlans?.total || 0}</div>
                      <div className="text-sm text-muted-foreground">Savings Plans</div>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-semibold">{analysis.executiveSummary.totalCommitments}</div>
                      <div className="text-sm text-muted-foreground">{t('risp.resources.totalCommitments', 'Total')}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <ResourcesSummarySkeleton />
            )}
          </TabsContent>

          {/* Recommendations Tab */}
          <TabsContent value="recommendations" className="space-y-6">
            {phaseLoaded.recommendations ? (
              analysis.recommendations && analysis.recommendations.length > 0 ? (
                <div className="space-y-4">
                  {analysis.recommendations.map((rec: any, index: number) => (
                    <Card key={index} className="glass border-primary/20 border-l-4 border-l-blue-500">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-lg">{rec.title}</CardTitle>
                              <Badge variant={getPriorityColor(rec.priority) as any}>
                                {rec.priority.toUpperCase()}
                              </Badge>
                              <Badge variant="outline">{rec.service}</Badge>
                            </div>
                            <CardDescription>{rec.description}</CardDescription>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-semibold text-green-600">
                              {formatCurrency(rec.potentialSavings?.annual || 0)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {t('risp.rec.perYear', 'por ano')} ({rec.potentialSavings?.percentage || 0}%)
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <h4 className="font-semibold mb-2">{t('risp.rec.implementation', 'Implementação')}</h4>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">{t('risp.rec.difficulty', 'Dificuldade')}:</span>
                                <span className="text-sm font-medium">
                                  {rec.implementation?.difficulty === 'easy' ? t('risp.rec.easy', 'Fácil') : 
                                   rec.implementation?.difficulty === 'medium' ? t('risp.rec.medium', 'Médio') : t('risp.rec.hard', 'Difícil')}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">{rec.implementation?.timeToImplement || 'N/A'}</span>
                              </div>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-semibold mb-2">{t('risp.rec.monthlySavings', 'Economia Mensal')}</h4>
                            <div className="text-xl font-semibold text-green-600">
                              {formatCurrency(rec.potentialSavings?.monthly || 0)}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="glass border-green-200 bg-green-50/50 dark:bg-green-950/20">
                  <CardContent className="py-8">
                    <div className="text-center space-y-4">
                      <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                      <div>
                        <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-2">
                          {t('risp.noRec.title', 'Nenhuma Recomendação no Momento')}
                        </h3>
                        <p className="text-green-700 dark:text-green-300 max-w-lg mx-auto">
                          {t('risp.noRec.desc', 'Sua infraestrutura já está bem otimizada.')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            ) : (
              <RecommendationsSkeleton count={3} />
            )}
          </TabsContent>

          {/* Coverage Tab */}
          <TabsContent value="coverage" className="space-y-6">
            {phaseLoaded.coverage ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="glass border-primary/20">
                  <CardHeader>
                    <CardTitle>{t('risp.coverage.ri', 'Reserved Instances')}</CardTitle>
                    <CardDescription>{t('risp.coverage.riDesc', 'Cobertura de instâncias reservadas')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold mb-2">
                      {(analysis.coverage?.reservedInstances || 0).toFixed(1)}%
                    </div>
                    <Progress value={analysis.coverage?.reservedInstances || 0} className="mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {analysis.reservedInstances?.total || 0} RIs {t('risp.coverage.active', 'ativas')}
                    </p>
                  </CardContent>
                </Card>

                <Card className="glass border-primary/20">
                  <CardHeader>
                    <CardTitle>{t('risp.coverage.sp', 'Savings Plans')}</CardTitle>
                    <CardDescription>{t('risp.coverage.spDesc', 'Cobertura de planos de economia')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold mb-2">
                      {(analysis.coverage?.savingsPlans || 0).toFixed(1)}%
                    </div>
                    <Progress value={analysis.coverage?.savingsPlans || 0} className="mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {analysis.savingsPlans?.total || 0} SPs {t('risp.coverage.active', 'ativos')}
                    </p>
                  </CardContent>
                </Card>

                <Card className="glass border-primary/20">
                  <CardHeader>
                    <CardTitle>{t('risp.coverage.overall', 'Cobertura Geral')}</CardTitle>
                    <CardDescription>{t('risp.coverage.overallDesc', 'Score combinado de otimização')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold mb-2">
                      {(analysis.coverage?.overall || 0).toFixed(1)}%
                    </div>
                    <Progress value={analysis.coverage?.overall || 0} className="mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {(analysis.coverage?.overall || 0) >= 70 ? t('risp.coverage.good', 'Bom') : 
                       (analysis.coverage?.overall || 0) >= 40 ? t('risp.coverage.regular', 'Regular') : t('risp.coverage.needsImprovement', 'Precisa melhorar')}
                    </p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <CoverageSkeleton />
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Initial State - No Analysis Yet */}
      {!analysis && !loading && !errorMessage && (
        <div className="space-y-6">
          {/* Educational Section */}
          <Card className="glass border-blue-200 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-blue-600" />
                {t('risp.edu.title', 'O que são Reserved Instances e Savings Plans?')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                      <Clock className="h-5 w-5 text-purple-600" />
                    </div>
                    <h4 className="font-semibold">{t('risp.edu.ri', 'Reserved Instances (RIs)')}</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('risp.edu.riDesc', 'Compromisso de 1 ou 3 anos para tipos específicos de instâncias. Descontos de até')} <span className="font-semibold text-green-600">72%</span>.
                  </p>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                      <Percent className="h-5 w-5 text-green-600" />
                    </div>
                    <h4 className="font-semibold">{t('risp.edu.sp', 'Savings Plans')}</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('risp.edu.spDesc', 'Compromisso de gasto por hora com flexibilidade. Economia de até')} <span className="font-semibold text-green-600">66%</span>.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Card */}
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>{t('risp.action.title', 'Análise de Reserved Instances & Savings Plans')}</CardTitle>
              <CardDescription>
                {t('risp.action.desc', 'Execute uma análise completa para identificar oportunidades de otimização')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-6 space-y-4">
                <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto" />
                <p className="text-muted-foreground max-w-md mx-auto">
                  {t('risp.action.info', 'A análise verificará seus padrões de uso e identificará oportunidades de economia.')}
                </p>
                <Button onClick={runAnalysis} size="lg" className="glass hover-glow">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  {t('risp.runAnalysis', 'Executar Análise')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tips Card */}
          <Card className="glass border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                <Lightbulb className="h-5 w-5" />
                {t('risp.tips.title', 'Não possui RI ou Savings Plans ainda?')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {t('risp.tips.desc', 'Aqui estão os próximos passos recomendados:')}
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white/60 dark:bg-white/5 p-4 rounded-lg space-y-2">
                  <h5 className="font-medium text-amber-800 dark:text-amber-200">1. {t('risp.tips.step1', 'Execute a Análise')}</h5>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {t('risp.tips.step1Desc', 'Entenda seus padrões de uso atuais.')}
                  </p>
                </div>
                <div className="bg-white/60 dark:bg-white/5 p-4 rounded-lg space-y-2">
                  <h5 className="font-medium text-amber-800 dark:text-amber-200">2. {t('risp.tips.step2', 'Avalie as Recomendações')}</h5>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {t('risp.tips.step2Desc', 'Considere o ROI e período de compromisso.')}
                  </p>
                </div>
                <div className="bg-white/60 dark:bg-white/5 p-4 rounded-lg space-y-2">
                  <h5 className="font-medium text-amber-800 dark:text-amber-200">3. {t('risp.tips.step3', 'Comece Pequeno')}</h5>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {t('risp.tips.step3Desc', 'Inicie com compromissos de 1 ano.')}
                  </p>
                </div>
                <div className="bg-white/60 dark:bg-white/5 p-4 rounded-lg space-y-2">
                  <h5 className="font-medium text-amber-800 dark:text-amber-200">4. {t('risp.tips.step4', 'Monitore Regularmente')}</h5>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {t('risp.tips.step4Desc', 'Acompanhe a utilização dos compromissos.')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 pt-2">
                <ExternalLink className="h-3 w-3" />
                <a 
                  href="https://aws.amazon.com/savingsplans/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {t('risp.tips.learnMore', 'Saiba mais sobre Savings Plans na documentação AWS')}
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
