import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  DollarSign, 
  Target, 
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Calendar,
  Info,
  Loader2,
  Clock,
  RefreshCw,
  ChevronRight,
  ArrowLeft,
  Server,
  MapPin,
  TrendingDown,
  Layers,
  FileText
} from 'lucide-react';
import { apiClient } from '@/integrations/aws/api-client';
import { useTranslation } from 'react-i18next';

interface AzureReservationsAnalyzerProps {
  credentialId: string;
}

interface Reservation {
  id: string;
  displayName: string;
  skuName: string;
  skuDescription: string;
  location: string;
  quantity: number;
  term: string;
  effectiveDate: string;
  expiryDate: string;
  utilizationPercentage: number;
  provisioningState: string;
  appliedScopeType: string;
}

interface Recommendation {
  type: string;
  reservationId?: string;
  reservationName?: string;
  currentUtilization?: number;
  recommendation: string;
  description?: string;
  solution?: string;
  potentialSavings?: number;
  estimatedSavings?: number;
  annualSavings?: number;
  priority: string;
  impact?: string;
  expiryDate?: string;
  daysToExpiry?: number;
  term?: string;
  quantity?: number;
  resourceType?: string;
  impactedValue?: string;
  skuName?: string;
  location?: string;
  currentSku?: string;
  targetSku?: string;
  scope?: string;
  lookbackPeriod?: string;
  currentOnDemandCost?: number;
  costWithRI?: number;
  savingsPercentage?: number;
  normalizedSize?: string;
  reservedResourceType?: string;
  recommendationId?: string;
  lastUpdated?: string;
  groupKey?: string;
  allExtendedProperties?: Record<string, string>;
}

interface RecommendationGroup {
  groupKey: string;
  skuName: string;
  location: string;
  resourceType: string;
  bestSavings: number;
  priority: string;
  options: Recommendation[];
}

interface Summary {
  totalReservations: number;
  averageUtilization: number;
  totalMonthlySavings: number;
  totalUnusedValue: number;
  byTerm: {
    oneYear: number;
    threeYear: number;
  };
  byUtilization: {
    high: number;
    medium: number;
    low: number;
  };
  message?: string;
}

interface AnalysisData {
  reservations: Reservation[];
  recommendations: Recommendation[];
  summary: Summary;
  subscriptionId: string;
  subscriptionName: string;
}

export function AzureReservationsAnalyzer({ credentialId }: AzureReservationsAnalyzerProps) {
  const { t } = useTranslation();
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<RecommendationGroup | null>(null);

  // Group recommendations by resource (SKU + location)
  const groupedRecommendations: RecommendationGroup[] = (() => {
    if (!analysis?.recommendations?.length) return [];
    const groups = new Map<string, RecommendationGroup>();
    for (const rec of analysis.recommendations) {
      const key = rec.groupKey || `${rec.skuName || 'unknown'}__${rec.location || 'unknown'}`;
      if (!groups.has(key)) {
        groups.set(key, {
          groupKey: key,
          skuName: rec.skuName || 'Unknown',
          location: rec.location || 'Unknown',
          resourceType: rec.resourceType || 'Virtual Machine',
          bestSavings: 0,
          priority: rec.priority,
          options: [],
        });
      }
      const group = groups.get(key)!;
      group.options.push(rec);
      const savings = rec.estimatedSavings || rec.potentialSavings || 0;
      if (savings > group.bestSavings) {
        group.bestSavings = savings;
        group.priority = rec.priority;
      }
    }
    // Sort options within each group by term (P3Y first = more savings usually)
    for (const group of groups.values()) {
      group.options.sort((a, b) => (b.estimatedSavings || 0) - (a.estimatedSavings || 0));
    }
    return Array.from(groups.values()).sort((a, b) => b.bestSavings - a.bestSavings);
  })();

  // Auto-load on mount
  useEffect(() => {
    if (credentialId) {
      runAnalysis();
    }
  }, [credentialId]);

  const runAnalysis = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await apiClient.invoke<AnalysisData>('azure-reservations-analyzer', {
        body: { credentialId, includeRecommendations: true }
      });
      
      if (response.error) {
        setErrorMessage(response.error.message || 'Erro na análise');
        setAnalysis(null);
        return;
      }
      
      setAnalysis(response.data as AnalysisData);
    } catch (error) {
      console.error('Error running Azure reservations analysis:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Erro desconhecido na análise');
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  // Auto-run analysis on mount
  useEffect(() => {
    if (credentialId) {
      runAnalysis();
    }
  }, [credentialId]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  const getUtilizationColor = (utilization: number) => {
    if (utilization >= 80) return 'text-green-600';
    if (utilization >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getTermLabel = (term: string) => {
    return term === 'P1Y' ? '1 Ano' : term === 'P3Y' ? '3 Anos' : term;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">
            {t('azureReservations.title', 'Análise de Azure Reserved Instances')}
          </h2>
          <p className="text-muted-foreground">
            {t('azureReservations.description', 'Análise de utilização e recomendações para Azure Reserved Instances')}
          </p>
        </div>
        <Button onClick={runAnalysis} disabled={loading} className="glass hover-glow">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('common.analyzing', 'Analisando...')}
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('common.refresh', 'Atualizar')}
            </>
          )}
        </Button>
      </div>

      {/* Loading - structured skeletons matching real layout */}
      {loading && (
        <div className="space-y-6">
          {/* Stats Cards Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="glass border-primary/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-4 rounded" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-20 mb-1" />
                  <Skeleton className="h-3 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Utilization Breakdown Skeleton */}
          <Card className="glass border-primary/20">
            <CardHeader>
              <Skeleton className="h-5 w-48" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="text-center p-4 bg-muted/30 rounded-lg">
                    <Skeleton className="h-8 w-8 mx-auto mb-2" />
                    <Skeleton className="h-3 w-20 mx-auto" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          {/* Tabs Skeleton */}
          <Skeleton className="h-10 w-80 rounded-lg" />
        </div>
      )}

      {/* Error */}
      {errorMessage && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('common.error', 'Erro')}</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {!loading && analysis && (
        <Tabs defaultValue="summary" className="space-y-6">
          <TabsList className="glass">
            <TabsTrigger value="summary">{t('azureReservations.summary', 'Resumo')}</TabsTrigger>
            <TabsTrigger value="reservations">{t('azureReservations.reservations', 'Reservas')}</TabsTrigger>
            <TabsTrigger value="recommendations">{t('azureReservations.recommendations', 'Recomendações')}</TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="space-y-6">
            {/* Message when no reservations */}
            {analysis.summary.message && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>{t('azureReservations.noReservationsTitle', 'Informação')}</AlertTitle>
                <AlertDescription>{analysis.summary.message}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="glass border-primary/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {t('azureReservations.totalReservations', 'Total de Reservas')}
                  </CardTitle>
                  <Target className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">{analysis.summary.totalReservations}</div>
                  <p className="text-xs text-muted-foreground">
                    {analysis.summary.byTerm.oneYear} x 1 ano, {analysis.summary.byTerm.threeYear} x 3 anos
                  </p>
                </CardContent>
              </Card>

              <Card className="glass border-primary/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {t('azureReservations.avgUtilization', 'Utilização Média')}
                  </CardTitle>
                  <BarChart3 className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-semibold ${getUtilizationColor(analysis.summary.averageUtilization)}`}>
                    {analysis.summary.averageUtilization.toFixed(1)}%
                  </div>
                  <Progress value={analysis.summary.averageUtilization} className="mt-2" />
                </CardContent>
              </Card>

              <Card className="glass border-primary/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {t('azureReservations.monthlySavings', 'Economia Mensal')}
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold text-green-600">
                    {formatCurrency(analysis.summary.totalMonthlySavings)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('azureReservations.vsOnDemand', 'vs preço on-demand')}
                  </p>
                </CardContent>
              </Card>

              <Card className="glass border-primary/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {t('azureReservations.unusedValue', 'Valor Não Utilizado')}
                  </CardTitle>
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold text-orange-600">
                    {formatCurrency(analysis.summary.totalUnusedValue)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('azureReservations.potentialOptimization', 'potencial de otimização')}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Utilization Breakdown */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>{t('azureReservations.utilizationBreakdown', 'Distribuição por Utilização')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="text-2xl font-semibold text-green-600">{analysis.summary.byUtilization.high}</div>
                    <div className="text-sm text-muted-foreground">{t('azureReservations.highUtil', 'Alta (≥80%)')}</div>
                  </div>
                  <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <div className="text-2xl font-semibold text-yellow-600">{analysis.summary.byUtilization.medium}</div>
                    <div className="text-sm text-muted-foreground">{t('azureReservations.mediumUtil', 'Média (50-79%)')}</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <div className="text-2xl font-semibold text-red-600">{analysis.summary.byUtilization.low}</div>
                    <div className="text-sm text-muted-foreground">{t('azureReservations.lowUtil', 'Baixa (<50%)')}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reservations Tab */}
          <TabsContent value="reservations" className="space-y-4">
            {analysis.reservations.length === 0 ? (
              <Card className="glass border-primary/20">
                <CardContent className="py-8 text-center">
                  <Info className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    {t('azureReservations.noReservations', 'Nenhuma reserva encontrada nesta subscription.')}
                  </p>
                </CardContent>
              </Card>
            ) : (
              analysis.reservations.map((reservation) => (
                <Card key={reservation.id} className="glass border-primary/20">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{reservation.displayName}</CardTitle>
                        <CardDescription>{reservation.skuDescription}</CardDescription>
                      </div>
                      <Badge variant={reservation.utilizationPercentage >= 80 ? 'default' : reservation.utilizationPercentage >= 50 ? 'secondary' : 'destructive'}>
                        {reservation.utilizationPercentage.toFixed(1)}% utilização
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">{t('azureReservations.location', 'Localização')}:</span>
                        <span className="ml-2 font-medium">{reservation.location}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('azureReservations.quantity', 'Quantidade')}:</span>
                        <span className="ml-2 font-medium">{reservation.quantity}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('azureReservations.term', 'Termo')}:</span>
                        <span className="ml-2 font-medium">{getTermLabel(reservation.term)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('azureReservations.scope', 'Escopo')}:</span>
                        <span className="ml-2 font-medium">{reservation.appliedScopeType}</span>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">{t('azureReservations.utilization', 'Utilização')}</span>
                        <span className={getUtilizationColor(reservation.utilizationPercentage)}>
                          {reservation.utilizationPercentage.toFixed(1)}%
                        </span>
                      </div>
                      <Progress value={reservation.utilizationPercentage} />
                    </div>
                    <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{t('azureReservations.expires', 'Expira')}: {new Date(reservation.expiryDate).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Recommendations Tab */}
          <TabsContent value="recommendations" className="space-y-4">
            {selectedGroup ? (
              /* Group Detail View - shows all options for a resource */
              <div className="space-y-6">
                <Button 
                  variant="ghost" 
                  onClick={() => setSelectedGroup(null)}
                  className="mb-2"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t('common.back', 'Voltar')}
                </Button>

                {/* Group Header */}
                <Card className="glass border-primary/20">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <CardTitle className="text-xl">{selectedGroup.skuName}</CardTitle>
                        <CardDescription className="flex items-center gap-3 text-base">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {selectedGroup.location}
                          </span>
                          <span className="flex items-center gap-1">
                            <Server className="h-4 w-4" />
                            {selectedGroup.resourceType}
                          </span>
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">{t('azureReservations.bestOption', 'Melhor opção')}</div>
                        <div className="text-2xl font-semibold text-green-600">
                          {formatCurrency(selectedGroup.bestSavings)}
                          <span className="text-sm text-muted-foreground font-normal">/mês</span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        {t('azureReservations.optionsExplanation', 'O Azure Advisor sugere diferentes opções de reserva para este recurso. Cada opção varia em termo (1 ou 3 anos) e quantidade. Escolha a que melhor se adequa ao seu planejamento. Os valores não devem ser somados — você escolhe apenas uma opção.')}
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>

                {/* Options comparison */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">
                    {t('azureReservations.availableOptions', 'Opções Disponíveis')} ({selectedGroup.options.length})
                  </h3>
                  {selectedGroup.options.map((option, idx) => (
                    <Card 
                      key={idx} 
                      className={`glass border-l-4 ${idx === 0 ? 'border-l-green-500 ring-1 ring-green-200 dark:ring-green-800' : 'border-l-blue-500'}`}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-base">
                                {t('azureReservations.option', 'Opção')} {idx + 1}: {option.term || 'N/A'}
                                {option.quantity && option.quantity > 1 ? ` · ${option.quantity}x` : ''}
                              </CardTitle>
                              {idx === 0 && (
                                <Badge variant="default" className="bg-green-600">
                                  {t('azureReservations.bestSavings', 'Maior economia')}
                                </Badge>
                              )}
                              <Badge variant={getPriorityColor(option.priority) as any}>
                                {option.priority === 'high' ? t('common.high', 'Alta') : 
                                 option.priority === 'medium' ? t('common.medium', 'Média') : t('common.low', 'Baixa')}
                              </Badge>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-semibold text-green-600">
                              {formatCurrency(option.estimatedSavings || option.potentialSavings || 0)}
                              <span className="text-sm text-muted-foreground font-normal">/mês</span>
                            </div>
                            {option.annualSavings ? (
                              <div className="text-xs text-muted-foreground">
                                {formatCurrency(option.annualSavings)}/ano
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          {option.term && (
                            <div>
                              <span className="text-muted-foreground">{t('azureReservations.term', 'Termo')}:</span>
                              <span className="ml-2 font-medium">{option.term}</span>
                            </div>
                          )}
                          {option.quantity && (
                            <div>
                              <span className="text-muted-foreground">{t('azureReservations.quantity', 'Quantidade')}:</span>
                              <span className="ml-2 font-medium">{option.quantity}</span>
                            </div>
                          )}
                          {option.currentOnDemandCost !== undefined && (
                            <div>
                              <span className="text-muted-foreground">{t('azureReservations.onDemandCost', 'Custo On-Demand')}:</span>
                              <span className="ml-2 font-medium">{formatCurrency(option.currentOnDemandCost)}</span>
                            </div>
                          )}
                          {option.costWithRI !== undefined && (
                            <div>
                              <span className="text-muted-foreground">{t('azureReservations.costWithRI', 'Custo com RI')}:</span>
                              <span className="ml-2 font-medium text-green-600">{formatCurrency(option.costWithRI)}</span>
                            </div>
                          )}
                          {option.savingsPercentage !== undefined && (
                            <div>
                              <span className="text-muted-foreground">{t('azureReservations.savingsPct', '% Economia')}:</span>
                              <span className="ml-2 font-medium text-green-600">{option.savingsPercentage}%</span>
                            </div>
                          )}
                          {option.lookbackPeriod && (
                            <div>
                              <span className="text-muted-foreground">{t('azureReservations.lookback', 'Análise')}:</span>
                              <span className="ml-2 font-medium">{option.lookbackPeriod}</span>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-3">{option.recommendation}</p>

                        {/* Raw data toggle */}
                        {option.allExtendedProperties && Object.keys(option.allExtendedProperties).length > 0 && (
                          <details className="mt-4">
                            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                              {t('azureReservations.rawData', 'Dados do Azure Advisor')}
                            </summary>
                            <div className="bg-muted/30 rounded-lg p-3 mt-2 max-h-40 overflow-y-auto">
                              <div className="grid grid-cols-1 gap-1">
                                {Object.entries(option.allExtendedProperties).map(([key, value]) => (
                                  <div key={key} className="flex gap-2 text-xs">
                                    <span className="text-muted-foreground font-mono min-w-[160px]">{key}:</span>
                                    <span className="font-mono break-all">{String(value)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </details>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              /* Grouped List View */
              <>
                {groupedRecommendations.length === 0 ? (
                  <Card className="glass border-green-200 bg-green-50/50 dark:bg-green-900/10">
                    <CardContent className="py-8 text-center">
                      <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-2">
                        {t('azureReservations.noRecommendations', 'Nenhuma Recomendação')}
                      </h3>
                      <p className="text-green-700 dark:text-green-300">
                        {t('azureReservations.wellOptimized', 'Suas reservas Azure estão bem otimizadas!')}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  groupedRecommendations.map((group) => (
                    <Card 
                      key={group.groupKey} 
                      className="glass border-l-4 border-l-blue-500 cursor-pointer transition-all hover:shadow-md hover:border-l-blue-400"
                      onClick={() => setSelectedGroup(group)}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-lg">{group.skuName}</CardTitle>
                              <Badge variant={getPriorityColor(group.priority) as any}>
                                {group.priority === 'high' ? t('common.high', 'Alta') : 
                                 group.priority === 'medium' ? t('common.medium', 'Média') : t('common.low', 'Baixa')}
                              </Badge>
                              {group.options.length > 1 && (
                                <Badge variant="outline">
                                  {group.options.length} {t('azureReservations.options', 'opções')}
                                </Badge>
                              )}
                            </div>
                            <CardDescription className="flex items-center gap-3 flex-wrap">
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {group.location}
                              </span>
                              <span className="flex items-center gap-1">
                                <Server className="h-3 w-3" />
                                {group.resourceType}
                              </span>
                              {group.options.length > 1 && (
                                <span className="flex items-center gap-1 text-blue-600">
                                  <Info className="h-3 w-3" />
                                  {t('azureReservations.clickToCompare', 'Clique para comparar opções')}
                                </span>
                              )}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-xl font-semibold text-green-600">
                                {formatCurrency(group.bestSavings)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {group.options.length > 1 
                                  ? t('azureReservations.bestOfOptions', 'melhor das {{count}} opções', { count: group.options.length })
                                  : t('azureReservations.potentialSavings', 'economia potencial')
                                }
                              </div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </div>
                      </CardHeader>
                      {group.options.length > 1 && (
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {group.options.map((opt, idx) => (
                              <div key={idx} className="text-xs bg-muted/50 rounded-md px-2 py-1 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {opt.term}{opt.quantity && opt.quantity > 1 ? ` · ${opt.quantity}x` : ''} — {formatCurrency(opt.estimatedSavings || 0)}/mês
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  ))
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Initial State */}
      {!loading && !analysis && !errorMessage && (
        <Card className="glass border-primary/20">
          <CardHeader>
            <CardTitle>{t('azureReservations.title', 'Análise de Azure Reserved Instances')}</CardTitle>
            <CardDescription>
              {t('azureReservations.initialDesc', 'Clique em Atualizar para analisar suas reservas Azure')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-6">
              <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <Button onClick={runAnalysis} className="glass hover-glow">
                <BarChart3 className="h-4 w-4 mr-2" />
                {t('azureReservations.runAnalysis', 'Executar Análise')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
