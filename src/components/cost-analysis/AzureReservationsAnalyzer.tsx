import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  RefreshCw
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
  potentialSavings?: number;
  estimatedSavings?: number;
  priority: string;
  expiryDate?: string;
  daysToExpiry?: number;
  term?: string;
  quantity?: number;
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
      currency: 'USD',
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

      {/* Loading */}
      {loading && (
        <Card className="glass border-primary/30">
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-16 w-16 text-primary animate-spin" />
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">
                  {t('azureReservations.analyzing', 'Analisando suas reservas Azure...')}
                </h3>
                <p className="text-muted-foreground max-w-md">
                  {t('azureReservations.analyzingDesc', 'Coletando dados de utilização e gerando recomendações.')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
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
            {analysis.recommendations.length === 0 ? (
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
              analysis.recommendations.map((rec, index) => (
                <Card key={index} className="glass border-l-4 border-l-blue-500">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">
                            {rec.type === 'OPTIMIZE_UTILIZATION' && t('azureReservations.optimizeUtil', 'Otimizar Utilização')}
                            {rec.type === 'RENEWAL_NEEDED' && t('azureReservations.renewalNeeded', 'Renovação Necessária')}
                            {rec.type === 'NEW_PURCHASE' && t('azureReservations.newPurchase', 'Nova Compra Recomendada')}
                          </CardTitle>
                          <Badge variant={getPriorityColor(rec.priority) as any}>
                            {rec.priority === 'high' ? t('common.high', 'Alta') : 
                             rec.priority === 'medium' ? t('common.medium', 'Média') : t('common.low', 'Baixa')}
                          </Badge>
                        </div>
                        {rec.reservationName && (
                          <CardDescription>{rec.reservationName}</CardDescription>
                        )}
                      </div>
                      {(rec.potentialSavings || rec.estimatedSavings) && (
                        <div className="text-right">
                          <div className="text-xl font-semibold text-green-600">
                            {formatCurrency(rec.potentialSavings || rec.estimatedSavings || 0)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t('azureReservations.potentialSavings', 'economia potencial')}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{rec.recommendation}</p>
                    {rec.daysToExpiry && (
                      <div className="mt-3 flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-orange-500" />
                        <span className="text-orange-600">
                          {t('azureReservations.expiresIn', 'Expira em')} {rec.daysToExpiry} {t('common.days', 'dias')}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
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
