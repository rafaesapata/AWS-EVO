import { useState, useEffect } from 'react';
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
  Info,
  Loader2,
  BookOpen,
  Lightbulb,
  ExternalLink,
  Clock,
  Percent
} from 'lucide-react';
import { awsService } from '@/services/aws-service';
import { useCloudAccount } from '@/contexts/CloudAccountContext';

interface AdvancedRISPAnalyzerV2Props {
  accountId: string;
  region?: string;
  regions?: string[];
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

export function AdvancedRISPAnalyzerV2({ accountId, region, regions }: AdvancedRISPAnalyzerV2Props) {
  const { selectedProvider } = useCloudAccount();
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingSavedData, setLoadingSavedData] = useState(true);
  
  // Use regions array if provided, otherwise fall back to single region or default
  const regionsToAnalyze = regions?.length ? regions : (region ? [region] : ['us-east-1']);

  // Load saved data on mount
  useEffect(() => {
    const loadSavedData = async () => {
      if (!accountId) return;
      
      setLoadingSavedData(true);
      try {
        const response = await awsService.getRISPData(accountId);
        
        // Response is wrapped in { data: ..., error: null }
        const data = response?.data || response;
        
        if (data?.hasData && data?.executiveSummary) {
          setAnalysis(data as AnalysisData);
        }
      } catch (error) {
        console.error('Error loading saved RI/SP data:', error);
        // Don't show error - just means no saved data exists
      } finally {
        setLoadingSavedData(false);
      }
    };
    
    loadSavedData();
  }, [accountId]);

  const runAnalysis = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await awsService.analyzeRISP(accountId, regionsToAnalyze, 'comprehensive');
      
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
    const currencyCode = selectedProvider === 'AZURE' ? 'BRL' : 'USD';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currencyCode,
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
          <h2 className="text-2xl font-semibold">Análise Avançada de Reserved Instances & Savings Plans</h2>
          <p className="text-muted-foreground">
            Análise completa de oportunidades de otimização de custos com recomendações detalhadas
          </p>
          {analysis && analysis.analysisMetadata?.dataSource === 'database' && (
            <Badge variant="outline" className="mt-2">
              <Clock className="h-3 w-3 mr-1" />
              Análise anterior carregada - {new Date(analysis.analysisMetadata.timestamp).toLocaleString('pt-BR')}
            </Badge>
          )}
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
              {analysis ? 'Atualizar Análise' : 'Executar Análise'}
            </>
          )}
        </Button>
      </div>

      {/* Loading Overlay */}
      {loading && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="relative">
                <div className="absolute inset-0 animate-ping rounded-full bg-primary/20 h-16 w-16" />
                <Loader2 className="h-16 w-16 text-primary animate-spin relative z-10" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">Analisando sua infraestrutura...</h3>
                <p className="text-muted-foreground max-w-md">
                  Estamos coletando dados de utilização, Reserved Instances e Savings Plans da sua conta AWS. 
                  Isso pode levar alguns segundos.
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Tempo estimado: 10-30 segundos</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading Saved Data */}
      {loadingSavedData && !loading && (
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50/50 to-indigo-50/50">
          <CardContent className="py-8">
            <div className="flex items-center justify-center space-x-3">
              <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
              <span className="text-sm text-muted-foreground">Carregando análise anterior...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro na Análise</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Analysis Results - Only show if not loading saved data */}
      {!loadingSavedData && analysis && analysis.executiveSummary && (
        <>
          {/* Check if there are any resources to analyze */}
          {analysis.currentResources?.ec2Instances === 0 && analysis.currentResources?.rdsInstances === 0 ? (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="py-8">
                <div className="text-center space-y-4">
                  <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
                  <div>
                    <h3 className="text-lg font-semibold text-amber-800 mb-2">
                      Nenhum Recurso Computacional Encontrado
                    </h3>
                    <p className="text-amber-700 max-w-lg mx-auto">
                      Não foram encontradas instâncias EC2 ou RDS em execução nesta conta AWS na região selecionada.
                      A análise de Reserved Instances e Savings Plans requer recursos computacionais ativos.
                    </p>
                  </div>
                  
                  <div className="bg-white/80 rounded-lg p-4 max-w-xl mx-auto text-left space-y-3 border border-amber-200">
                    <h4 className="font-medium text-amber-800 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4" />
                      Possíveis causas:
                    </h4>
                    <ul className="text-sm text-amber-700 space-y-2 ml-6">
                      <li className="flex items-start gap-2">
                        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>A conta não possui instâncias EC2 ou RDS em execução</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>Os recursos estão em outra região (atual: {analysis.analysisMetadata?.region || 'us-east-1'})</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>A role IAM não tem permissão para listar instâncias EC2/RDS</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>Os recursos usam outros serviços (Lambda, Fargate, etc.)</span>
                      </li>
                    </ul>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Tente selecionar outra conta AWS ou verifique se há recursos em outras regiões.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
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
                  <div className="text-2xl font-semibold">{getStatusText(analysis.executiveSummary.status)}</div>
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
                  <div className="text-2xl font-semibold">
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
                  <div className="text-2xl font-semibold">
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
                          <div className="text-2xl font-semibold text-green-600">
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
              <Card className="border-green-200 bg-green-50/50">
                <CardContent className="py-8">
                  <div className="text-center space-y-4">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                    <div>
                      <h3 className="text-lg font-semibold text-green-800 mb-2">
                        Nenhuma Recomendação de RI/SP no Momento
                      </h3>
                      <p className="text-green-700 max-w-lg mx-auto">
                        Com base na análise atual, não identificamos oportunidades significativas de economia 
                        através de Reserved Instances ou Savings Plans para esta conta.
                      </p>
                    </div>
                    
                    <div className="bg-white/80 rounded-lg p-4 max-w-xl mx-auto text-left space-y-3 border border-green-200">
                      <h4 className="font-medium text-green-800 flex items-center gap-2">
                        <Lightbulb className="h-4 w-4" />
                        Isso pode significar que:
                      </h4>
                      <ul className="text-sm text-green-700 space-y-2 ml-6">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>Sua infraestrutura já está bem otimizada com compromissos existentes</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>O uso atual é variável demais para justificar compromissos de longo prazo</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>Os recursos em uso não são elegíveis para RI/SP (ex: Spot Instances)</span>
                        </li>
                      </ul>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      Continue monitorando regularmente. Conforme seu uso evolui, novas oportunidades podem surgir.
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
                  <div className="text-3xl font-semibold mb-2">
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
                  <div className="text-3xl font-semibold mb-2">
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
                  <div className="text-3xl font-semibold mb-2">
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
        </>
      )}

      {/* Initial State - Only show if not loading saved data */}
      {!loadingSavedData && !analysis && !loading && !errorMessage && (
        <div className="space-y-6">
          {/* Educational Section */}
          <Card className="border-blue-200 bg-gradient-to-br from-blue-50/50 to-indigo-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-blue-600" />
                O que são Reserved Instances e Savings Plans?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-purple-100">
                      <Clock className="h-5 w-5 text-purple-600" />
                    </div>
                    <h4 className="font-semibold">Reserved Instances (RIs)</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Compromisso de uso de 1 ou 3 anos para tipos específicos de instâncias EC2 ou RDS. 
                    Oferece descontos de até <span className="font-semibold text-green-600">72%</span> comparado ao preço On-Demand.
                  </p>
                  <div className="text-xs text-muted-foreground bg-white/60 p-2 rounded">
                    <strong>Ideal para:</strong> Workloads estáveis e previsíveis com uso contínuo
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-green-100">
                      <Percent className="h-5 w-5 text-green-600" />
                    </div>
                    <h4 className="font-semibold">Savings Plans</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Compromisso de gasto por hora ($/hora) por 1 ou 3 anos, com flexibilidade de uso entre 
                    diferentes instâncias. Economia de até <span className="font-semibold text-green-600">66%</span>.
                  </p>
                  <div className="text-xs text-muted-foreground bg-white/60 p-2 rounded">
                    <strong>Ideal para:</strong> Ambientes dinâmicos que mudam tipos de instância frequentemente
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Card */}
          <Card>
            <CardHeader>
              <CardTitle>Análise de Reserved Instances & Savings Plans</CardTitle>
              <CardDescription>
                Execute uma análise completa para identificar oportunidades de otimização de custos na sua conta AWS
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-6 space-y-4">
                <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto" />
                <p className="text-muted-foreground max-w-md mx-auto">
                  A análise irá verificar seus padrões de uso, compromissos existentes e identificar 
                  oportunidades de economia com RIs e Savings Plans.
                </p>
                <Button onClick={runAnalysis} size="lg">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Executar Análise
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Next Steps if no RI/SP */}
          <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-800">
                <Lightbulb className="h-5 w-5" />
                Não possui RI ou Savings Plans ainda?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-amber-700">
                Se você ainda não utiliza Reserved Instances ou Savings Plans, aqui estão os próximos passos recomendados:
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white/60 p-4 rounded-lg space-y-2">
                  <h5 className="font-medium text-amber-800">1. Execute a Análise</h5>
                  <p className="text-xs text-amber-700">
                    Clique em "Executar Análise" para entender seus padrões de uso atuais e identificar 
                    quais recursos são candidatos para compromissos.
                  </p>
                </div>
                <div className="bg-white/60 p-4 rounded-lg space-y-2">
                  <h5 className="font-medium text-amber-800">2. Avalie as Recomendações</h5>
                  <p className="text-xs text-amber-700">
                    Revise as recomendações geradas, considerando o ROI e o período de compromisso 
                    adequado para seu negócio.
                  </p>
                </div>
                <div className="bg-white/60 p-4 rounded-lg space-y-2">
                  <h5 className="font-medium text-amber-800">3. Comece Pequeno</h5>
                  <p className="text-xs text-amber-700">
                    Inicie com compromissos de 1 ano para workloads mais estáveis antes de expandir 
                    para compromissos maiores.
                  </p>
                </div>
                <div className="bg-white/60 p-4 rounded-lg space-y-2">
                  <h5 className="font-medium text-amber-800">4. Monitore Regularmente</h5>
                  <p className="text-xs text-amber-700">
                    Acompanhe a utilização dos compromissos e ajuste conforme seu uso evolui para 
                    maximizar a economia.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-amber-600 pt-2">
                <ExternalLink className="h-3 w-3" />
                <a 
                  href="https://aws.amazon.com/savingsplans/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  Saiba mais sobre Savings Plans na documentação AWS
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
