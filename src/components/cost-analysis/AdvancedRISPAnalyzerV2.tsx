import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  TrendingUp, 
  DollarSign, 
  Target, 
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Calendar,
  Info
} from 'lucide-react';
import { awsService } from '@/services/aws-service';

interface AdvancedRISPAnalyzerV2Props {
  accountId: string;
  region?: string;
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
}

export function AdvancedRISPAnalyzerV2({ accountId, region = 'us-east-1' }: AdvancedRISPAnalyzerV2Props) {
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runAnalysis = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await awsService.analyzeRISP(accountId, region, 'comprehensive');
      
      if (response.error) {
        setErrorMessage(response.error.message || 'Erro na análise');
        setAnalysis(null);
        return;
      }
      
      const data = response.data as AnalysisData;
      
      if (!data || !data.executiveSummary) {
        setErrorMessage('Resposta inválida da API');
        setAnalysis(null);
        return;
      }
      
      setAnalysis(data);
      
    } catch (error) {
      console.error('Error running analysis:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Erro desconhecido na análise');
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'destructive';
      case 'high': return 'default';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
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

  const getStatusIcon = (status: string) => {
    if (status === 'optimized') {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    return <AlertTriangle className="h-4 w-4 text-orange-500" />;
  };

  const getStatusText = (status: string) => {
    if (status === 'optimized') return 'Otimizado';
    if (status === 'needs_attention') return 'Atenção';
    return 'Analisando';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Análise Avançada de Reserved Instances & Savings Plans</h2>
          <p className="text-muted-foreground">
            Análise completa de oportunidades de otimização de custos com recomendações detalhadas
          </p>
        </div>
        <Button onClick={runAnalysis} disabled={loading}>
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Analisando...
            </>
          ) : (
            <>
              <BarChart3 className="h-4 w-4 mr-2" />
              Executar Análise
            </>
          )}
        </Button>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro na Análise</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Analysis Results */}
      {analysis && analysis.executiveSummary && (
        <Tabs defaultValue="summary" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="summary">Resumo Executivo</TabsTrigger>
            <TabsTrigger value="recommendations">Recomendações</TabsTrigger>
            <TabsTrigger value="coverage">Cobertura</TabsTrigger>
          </TabsList>

          {/* Executive Summary */}
          <TabsContent value="summary" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Status Geral</CardTitle>
                  {getStatusIcon(analysis.executiveSummary.status)}
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{getStatusText(analysis.executiveSummary.status)}</div>
                  <p className="text-xs text-muted-foreground">
                    {analysis.executiveSummary.totalCommitments} compromissos ativos
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Economia Potencial</CardTitle>
                  <DollarSign className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(analysis.potentialSavings?.annual || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    por ano (até {analysis.potentialSavings?.maxPercentage || 0}% de economia)
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Score de Cobertura</CardTitle>
                  <Target className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {(analysis.coverage?.overall || 0).toFixed(1)}%
                  </div>
                  <Progress value={analysis.coverage?.overall || 0} className="mt-2" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Recomendações</CardTitle>
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {analysis.recommendations?.length || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {analysis.executiveSummary.recommendationsSummary?.quickWins || 0} implementações rápidas
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Key Insights */}
            <Card>
              <CardHeader>
                <CardTitle>Principais Insights</CardTitle>
                <CardDescription>
                  Resumo dos pontos mais importantes da análise
                </CardDescription>
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

            {/* Resources Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Recursos Analisados</CardTitle>
                <CardDescription>
                  Resumo dos recursos AWS analisados
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-2xl font-bold">{analysis.reservedInstances?.ec2?.length || 0}</div>
                    <div className="text-sm text-muted-foreground">EC2 RIs</div>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-2xl font-bold">{analysis.reservedInstances?.rds?.length || 0}</div>
                    <div className="text-sm text-muted-foreground">RDS RIs</div>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-2xl font-bold">{analysis.savingsPlans?.total || 0}</div>
                    <div className="text-sm text-muted-foreground">Savings Plans</div>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-2xl font-bold">{analysis.executiveSummary.totalCommitments}</div>
                    <div className="text-sm text-muted-foreground">Total Compromissos</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Recommendations */}
          <TabsContent value="recommendations" className="space-y-6">
            {analysis.recommendations && analysis.recommendations.length > 0 ? (
              <div className="space-y-4">
                {analysis.recommendations.map((rec: any, index: number) => (
                  <Card key={index} className="border-l-4 border-l-blue-500">
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
                          <div className="text-2xl font-bold text-green-600">
                            {formatCurrency(rec.potentialSavings?.annual || 0)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            por ano ({rec.potentialSavings?.percentage || 0}%)
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-semibold mb-2">Implementação</h4>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Dificuldade:</span>
                              <span className="text-sm font-medium">
                                {rec.implementation?.difficulty === 'easy' ? 'Fácil' : 
                                 rec.implementation?.difficulty === 'medium' ? 'Médio' : 'Difícil'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">{rec.implementation?.timeToImplement || 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                        <div>
                          <h4 className="font-semibold mb-2">Economia Mensal</h4>
                          <div className="text-xl font-bold text-green-600">
                            {formatCurrency(rec.potentialSavings?.monthly || 0)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Nenhuma Recomendação</h3>
                    <p className="text-muted-foreground">
                      Sua infraestrutura está bem otimizada! Não foram encontradas oportunidades de economia significativas.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Coverage */}
          <TabsContent value="coverage" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Reserved Instances</CardTitle>
                  <CardDescription>Cobertura de instâncias reservadas</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold mb-2">
                    {(analysis.coverage?.reservedInstances || 0).toFixed(1)}%
                  </div>
                  <Progress value={analysis.coverage?.reservedInstances || 0} className="mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {analysis.reservedInstances?.total || 0} RIs ativas
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Savings Plans</CardTitle>
                  <CardDescription>Cobertura de planos de economia</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold mb-2">
                    {(analysis.coverage?.savingsPlans || 0).toFixed(1)}%
                  </div>
                  <Progress value={analysis.coverage?.savingsPlans || 0} className="mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {analysis.savingsPlans?.total || 0} SPs ativos
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cobertura Geral</CardTitle>
                  <CardDescription>Score combinado de otimização</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold mb-2">
                    {(analysis.coverage?.overall || 0).toFixed(1)}%
                  </div>
                  <Progress value={analysis.coverage?.overall || 0} className="mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {(analysis.coverage?.overall || 0) >= 70 ? 'Bom' : 
                     (analysis.coverage?.overall || 0) >= 40 ? 'Regular' : 'Precisa melhorar'}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Initial State */}
      {!analysis && !loading && !errorMessage && (
        <Card>
          <CardHeader>
            <CardTitle>Análise de Reserved Instances & Savings Plans</CardTitle>
            <CardDescription>
              Execute uma análise completa para identificar oportunidades de otimização de custos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                Clique em "Executar Análise" para começar a análise avançada de otimização de custos
              </p>
              <Button onClick={runAnalysis}>
                <BarChart3 className="h-4 w-4 mr-2" />
                Executar Análise
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
