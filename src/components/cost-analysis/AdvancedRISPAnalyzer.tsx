import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Clock, 
  Target, 
  AlertTriangle,
  CheckCircle,
  Info,
  Zap,
  Calendar,
  BarChart3,
  PieChart,
  Settings
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { awsService } from '@/services/aws-service';

interface CostOptimizationRecommendation {
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  service: string;
  title: string;
  description: string;
  potentialSavings: {
    monthly: number;
    annual: number;
    percentage: number;
  };
  implementation: {
    difficulty: 'easy' | 'medium' | 'hard';
    timeToImplement: string;
    steps: string[];
  };
  details?: any;
}

interface UsagePattern {
  instanceType: string;
  averageHoursPerDay: number;
  consistencyScore: number;
  recommendedCommitment: 'none' | 'partial' | 'full';
  instances: number;
  monthlyCost: number;
}

interface RISPAnalysisResult {
  success: boolean;
  executiveSummary: {
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
  reservedInstances: {
    ec2: any[];
    rds: any[];
    total: number;
  };
  savingsPlans: {
    plans: any[];
    total: number;
  };
  currentResources: {
    ec2Instances: number;
    rdsInstances: number;
    totalMonthlyCost: number;
  };
  usagePatterns: UsagePattern[];
  coverage: {
    reservedInstances: number;
    savingsPlans: number;
    overall: number;
  };
  recommendations: CostOptimizationRecommendation[];
  potentialSavings: {
    monthly: number;
    annual: number;
    maxPercentage: number;
  };
  analysisMetadata: {
    analysisDepth: string;
    region: string;
    timestamp: string;
    accountId: string;
  };
}

interface AdvancedRISPAnalyzerProps {
  accountId: string;
  region?: string;
}

export function AdvancedRISPAnalyzer({ accountId, region = 'us-east-1' }: AdvancedRISPAnalyzerProps) {
  const [analysis, setAnalysis] = useState<RISPAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisDepth, setAnalysisDepth] = useState<'basic' | 'detailed' | 'comprehensive'>('comprehensive');
  const { toast } = useToast();

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const response = await awsService.analyzeRISP(accountId, region, analysisDepth);
      
      // Extract data from API response { data, error }
      if (response.error) {
        throw new Error(response.error.message || 'Erro na análise');
      }
      
      const result = response.data as RISPAnalysisResult;
      setAnalysis(result);
      
      if (!result.recommendations || result.recommendations.length === 0) {
        toast({
          title: "Análise Concluída",
          description: "Nenhuma recomendação de otimização encontrada. Sua infraestrutura está bem otimizada!",
        });
      } else {
        toast({
          title: "Análise Concluída",
          description: `${result.recommendations.length} oportunidades de otimização identificadas`,
        });
      }
    } catch (error) {
      console.error('Error running RI/SP analysis:', error);
      toast({
        title: "Erro na Análise",
        description: error instanceof Error ? error.message : "Não foi possível executar a análise. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'critical': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'high': return <TrendingUp className="h-4 w-4 text-orange-500" />;
      case 'medium': return <Info className="h-4 w-4 text-yellow-500" />;
      case 'low': return <CheckCircle className="h-4 w-4 text-green-500" />;
      default: return <Info className="h-4 w-4" />;
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

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'hard': return 'text-red-600';
      default: return 'text-gray-600';
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

  const getCommitmentRecommendation = (commitment: string) => {
    switch (commitment) {
      case 'full': return { text: 'Reserva Total', color: 'bg-green-100 text-green-800' };
      case 'partial': return { text: 'Reserva Parcial', color: 'bg-yellow-100 text-yellow-800' };
      case 'none': return { text: 'Sem Reserva', color: 'bg-gray-100 text-gray-800' };
      default: return { text: 'Não Definido', color: 'bg-gray-100 text-gray-800' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Análise Avançada de Reserved Instances & Savings Plans</h2>
          <p className="text-muted-foreground">
            Análise completa de oportunidades de otimização de custos com recomendações detalhadas
          </p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={analysisDepth}
            onChange={(e) => setAnalysisDepth(e.target.value as any)}
            className="px-3 py-2 border rounded-md"
          >
            <option value="basic">Análise Básica</option>
            <option value="detailed">Análise Detalhada</option>
            <option value="comprehensive">Análise Completa</option>
          </select>
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
      </div>

      {analysis && (
        <Tabs defaultValue="summary" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="summary">Resumo Executivo</TabsTrigger>
            <TabsTrigger value="recommendations">Recomendações</TabsTrigger>
            <TabsTrigger value="patterns">Padrões de Uso</TabsTrigger>
            <TabsTrigger value="coverage">Cobertura</TabsTrigger>
            <TabsTrigger value="current">Estado Atual</TabsTrigger>
          </TabsList>

          {/* Executive Summary */}
          <TabsContent value="summary" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Status Geral</CardTitle>
                  {analysis.executiveSummary.status === 'needs_attention' ? (
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">
                    {analysis.executiveSummary.status === 'needs_attention' ? 'Atenção' : 'Otimizado'}
                  </div>
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
                  <div className="text-2xl font-semibold text-green-600">
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
                  <div className="text-2xl font-semibold">
                    {analysis.coverage.overall.toFixed(1)}%
                  </div>
                  <Progress value={analysis.coverage.overall} className="mt-2" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Recomendações</CardTitle>
                  <Zap className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">
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
                  {analysis.executiveSummary.keyInsights.map((insight, index) => (
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
            {analysis.recommendations.length === 0 ? (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Parabéns!</AlertTitle>
                <AlertDescription>
                  Nenhuma recomendação de otimização encontrada. Sua infraestrutura está bem otimizada para custos.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                {analysis.recommendations.map((rec, index) => (
                  <Card key={index} className="border-l-4 border-l-blue-500">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            {getPriorityIcon(rec.priority)}
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
                              <span className={`text-sm font-medium ${getDifficultyColor(rec.implementation.difficulty)}`}>
                                {rec.implementation.difficulty === 'easy' ? 'Fácil' : 
                                 rec.implementation.difficulty === 'medium' ? 'Médio' : 'Difícil'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">{rec.implementation.timeToImplement}</span>
                            </div>
                          </div>
                        </div>
                        <div>
                          <h4 className="font-semibold mb-2">Economia Mensal</h4>
                          <div className="text-xl font-semibold text-green-600">
                            {formatCurrency(rec.potentialSavings.monthly)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-4">
                        <h4 className="font-semibold mb-2">Passos para Implementação</h4>
                        <ol className="list-decimal list-inside space-y-1">
                          {rec.implementation.steps.map((step, stepIndex) => (
                            <li key={stepIndex} className="text-sm text-muted-foreground">
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Usage Patterns */}
          <TabsContent value="patterns" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Padrões de Uso por Tipo de Instância</CardTitle>
                <CardDescription>
                  Análise detalhada dos padrões de uso para identificar oportunidades de Reserved Instances
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analysis.usagePatterns.map((pattern, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold">{pattern.instanceType}</h3>
                          <Badge variant="outline">{pattern.instances} instâncias</Badge>
                          <span className={`px-2 py-1 rounded-full text-xs ${getCommitmentRecommendation(pattern.recommendedCommitment).color}`}>
                            {getCommitmentRecommendation(pattern.recommendedCommitment).text}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{formatCurrency(pattern.monthlyCost)}</div>
                          <div className="text-sm text-muted-foreground">por mês</div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <div className="text-sm text-muted-foreground">Uso Médio Diário</div>
                          <div className="text-lg font-semibold">
                            {pattern.averageHoursPerDay.toFixed(1)}h
                          </div>
                          <Progress value={(pattern.averageHoursPerDay / 24) * 100} className="mt-1" />
                        </div>
                        
                        <div>
                          <div className="text-sm text-muted-foreground">Score de Consistência</div>
                          <div className="text-lg font-semibold">
                            {pattern.consistencyScore.toFixed(0)}%
                          </div>
                          <Progress value={pattern.consistencyScore} className="mt-1" />
                        </div>
                        
                        <div>
                          <div className="text-sm text-muted-foreground">Economia Potencial com RI</div>
                          <div className="text-lg font-semibold text-green-600">
                            {formatCurrency(pattern.monthlyCost * 0.4)}
                          </div>
                          <div className="text-xs text-muted-foreground">40% de economia</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
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
                  <div className="text-3xl font-semibold mb-2">
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
                  <div className="text-3xl font-semibold mb-2">
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
                  <div className="text-3xl font-semibold mb-2">
                    {analysis.coverage.overall.toFixed(1)}%
                  </div>
                  <Progress value={analysis.coverage.overall} className="mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {analysis.coverage.overall >= 70 ? 'Excelente' : 
                     analysis.coverage.overall >= 50 ? 'Bom' : 'Precisa melhorar'}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Current State */}
          <TabsContent value="current" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recursos Atuais</CardTitle>
                  <CardDescription>Inventário de recursos em execução</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>Instâncias EC2</span>
                      <Badge variant="outline">{analysis.currentResources.ec2Instances}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Instâncias RDS</span>
                      <Badge variant="outline">{analysis.currentResources.rdsInstances}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Custo Mensal Estimado</span>
                      <span className="font-semibold">
                        {formatCurrency(analysis.currentResources.totalMonthlyCost)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Compromissos Ativos</CardTitle>
                  <CardDescription>Reserved Instances e Savings Plans em vigor</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>Reserved Instances EC2</span>
                      <Badge variant="outline">{analysis.reservedInstances.ec2.length}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Reserved Instances RDS</span>
                      <Badge variant="outline">{analysis.reservedInstances.rds.length}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Savings Plans</span>
                      <Badge variant="outline">{analysis.savingsPlans.total}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Metadados da Análise</CardTitle>
                <CardDescription>Informações sobre a execução da análise</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Profundidade:</span>
                    <div className="font-medium">{analysis.analysisMetadata.analysisDepth}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Região:</span>
                    <div className="font-medium">{analysis.analysisMetadata.region}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Executado em:</span>
                    <div className="font-medium">
                      {new Date(analysis.analysisMetadata.timestamp).toLocaleString('pt-BR')}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Account ID:</span>
                    <div className="font-medium font-mono text-xs">
                      {analysis.analysisMetadata.accountId}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
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