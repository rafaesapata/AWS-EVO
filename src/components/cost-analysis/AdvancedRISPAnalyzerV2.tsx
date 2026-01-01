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
  Calendar
} from 'lucide-react';
import { awsService } from '@/services/aws-service';

interface AdvancedRISPAnalyzerV2Props {
  accountId: string;
  region?: string;
}

export function AdvancedRISPAnalyzerV2({ accountId, region = 'us-east-1' }: AdvancedRISPAnalyzerV2Props) {
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      // Chamada real para a Lambda usando o serviço AWS
      const result = await awsService.analyzeRISP(accountId, region, 'comprehensive');
      setAnalysis(result);
      
    } catch (error) {
      console.error('Error running analysis:', error);
      // Não usar fallback - mostrar erro real para o usuário
      setAnalysis({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido na análise',
        recommendations: [],
        executiveSummary: null,
        reservedInstances: { ec2: [], rds: [], total: 0 },
        savingsPlans: { plans: [], total: 0 },
        coverage: { reservedInstances: 0, savingsPlans: 0, overall: 0 },
        potentialSavings: { monthly: 0, annual: 0, maxPercentage: 0 }
      });
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
    }).format(amount);
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

      {analysis && analysis.success === false && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro na Análise</AlertTitle>
          <AlertDescription>
            {analysis.error || 'Não foi possível executar a análise. Verifique suas credenciais AWS e tente novamente.'}
          </AlertDescription>
        </Alert>
      )}

      {analysis && analysis.success !== false && (
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
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">Atenção</div>
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
                    {formatCurrency(analysis.potentialSavings.annual)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    por ano (até {analysis.potentialSavings.maxPercentage}% de economia)
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
                    {analysis.coverage.overall.toFixed(1)}%
                  </div>
                  <Progress value={analysis.coverage.overall} className="mt-2" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Recomendações</CardTitle>
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {analysis.recommendations.length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {analysis.executiveSummary.recommendationsSummary.quickWins} implementações rápidas
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
                  {analysis.executiveSummary.keyInsights.map((insight: string, index: number) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                      <p className="text-sm">{insight}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Recommendations */}
          <TabsContent value="recommendations" className="space-y-6">
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
                          {formatCurrency(rec.potentialSavings.annual)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          por ano ({rec.potentialSavings.percentage}%)
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
                              {rec.implementation.difficulty === 'easy' ? 'Fácil' : 
                               rec.implementation.difficulty === 'medium' ? 'Médio' : 'Difícil'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{rec.implementation.timeToImplement}</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2">Economia Mensal</h4>
                        <div className="text-xl font-bold text-green-600">
                          {formatCurrency(rec.potentialSavings.monthly)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
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
                    {analysis.coverage.reservedInstances.toFixed(1)}%
                  </div>
                  <Progress value={analysis.coverage.reservedInstances} className="mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {analysis.reservedInstances.total} RIs ativas
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
                    {analysis.coverage.savingsPlans.toFixed(1)}%
                  </div>
                  <Progress value={analysis.coverage.savingsPlans} className="mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {analysis.savingsPlans.total} SPs ativos
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
                    {analysis.coverage.overall.toFixed(1)}%
                  </div>
                  <Progress value={analysis.coverage.overall} className="mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Precisa melhorar
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {!analysis && !loading && (
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