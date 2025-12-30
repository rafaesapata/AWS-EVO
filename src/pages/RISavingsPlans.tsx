import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient } from "@/integrations/aws/api-client";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { Layout } from "@/components/Layout";
import { toast } from "sonner";
import { 
  DollarSign, 
  TrendingDown, 
  Calendar,
  Target,
  RefreshCw,
  Download,
  BarChart3,
  Clock,
  CheckCircle,
  AlertTriangle,
  Shield,
  Loader2,
  Zap,
  PieChart,
  AlertCircle
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart as RechartsPieChart, Pie, Cell } from "recharts";

interface ReservedInstance {
  id: string;
  instanceType: string;
  instanceCount: number;
  state: string;
  start: string;
  end: string;
  offeringType: string;
}

interface SavingsPlan {
  id: string;
  type: string;
  state: string;
  commitment: string;
  start: string;
  end: string;
  paymentOption: string;
  upfrontPaymentAmount: string;
  recurringPaymentAmount: string;
}

interface Recommendation {
  type: string;
  priority: string;
  message: string;
  potentialSavings?: string;
  instances?: string[];
  currentCoverage?: { ri: number; sp: number };
}

interface AnalysisResult {
  success: boolean;
  reservedInstances: ReservedInstance[];
  savingsPlans: SavingsPlan[];
  coverage: {
    reservedInstances: number;
    savingsPlans: number;
  };
  recommendations: Recommendation[];
  summary: {
    totalRIs: number;
    activeRIs: number;
    totalSavingsPlans: number;
    activeSavingsPlans: number;
  };
}

export default function RISavingsPlans() {
  const { selectedAccountId, selectedAccount } = useAwsAccount();
  const { data: organizationId } = useOrganization();
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [lastAnalysisTime, setLastAnalysisTime] = useState<Date | null>(null);

  const handleAnalyze = async () => {
    if (!selectedAccountId) {
      toast.error("Selecione uma conta AWS", {
        description: "É necessário selecionar uma conta AWS para realizar a análise."
      });
      return;
    }

    setIsAnalyzing(true);
    
    try {
      toast.info("Iniciando análise de RI/Savings Plans...", {
        description: "Este processo pode levar alguns segundos."
      });

      const response = await apiClient.invoke<AnalysisResult>('ri-sp-analyzer', {
        body: { accountId: selectedAccountId }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao executar análise');
      }

      const data = response.data;
      if (!data) {
        throw new Error('Nenhum dado retornado da análise');
      }

      setAnalysisResult(data);
      setLastAnalysisTime(new Date());

      toast.success("Análise concluída!", {
        description: `${data.summary.totalRIs} Reserved Instances e ${data.summary.totalSavingsPlans} Savings Plans encontrados.`
      });

    } catch (error: any) {
      console.error('Erro na análise de RI/SP:', error);
      toast.error("Erro ao executar análise", {
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const exportReport = () => {
    if (!analysisResult) return;

    const riData = analysisResult.reservedInstances.map(ri => ({
      type: 'Reserved Instance',
      resource: ri.instanceType,
      state: ri.state,
      count: ri.instanceCount,
      end_date: ri.end
    }));

    const spData = analysisResult.savingsPlans.map(sp => ({
      type: 'Savings Plan',
      resource: sp.type,
      state: sp.state,
      commitment: sp.commitment,
      end_date: sp.end
    }));

    const allData = [...riData, ...spData];

    const csvContent = [
      'Tipo,Recurso,Estado,Quantidade/Compromisso,Data de Término',
      ...allData.map(item => [
        item.type,
        item.resource,
        item.state,
        'count' in item ? item.count : item.commitment,
        item.end_date
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ri_savings_plans_${selectedAccountId}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    toast.success("Relatório exportado", {
      description: "O relatório de RI e Savings Plans foi exportado com sucesso."
    });
  };

  const getStateBadge = (state: string) => {
    switch (state) {
      case 'active': return <Badge className="bg-green-500 hover:bg-green-600">Ativo</Badge>;
      case 'payment-pending': return <Badge variant="secondary">Pagamento Pendente</Badge>;
      case 'payment-failed': return <Badge variant="destructive">Pagamento Falhou</Badge>;
      case 'retired': return <Badge variant="outline">Aposentado</Badge>;
      default: return <Badge variant="outline">{state}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high': return <Badge variant="destructive">Alta</Badge>;
      case 'medium': return <Badge className="bg-yellow-500 hover:bg-yellow-600">Média</Badge>;
      case 'low': return <Badge variant="outline">Baixa</Badge>;
      default: return <Badge variant="outline">{priority}</Badge>;
    }
  };

  const getCoverageColor = (coverage: number) => {
    if (coverage >= 70) return 'text-green-500';
    if (coverage >= 40) return 'text-yellow-500';
    return 'text-red-500';
  };

  // Prepare chart data
  const coverageData = analysisResult ? [
    { name: 'Reserved Instances', value: analysisResult.coverage.reservedInstances, color: '#3b82f6' },
    { name: 'Savings Plans', value: analysisResult.coverage.savingsPlans, color: '#10b981' }
  ] : [];

  const COLORS = ['#3b82f6', '#10b981'];

  return (
    <Layout 
      title="Reserved Instances & Savings Plans" 
      description="Análise e otimização de RI e Savings Plans para maximizar economia"
      icon={<DollarSign className="h-5 w-5 text-white" />}
    >
      <Tabs defaultValue="analyze" className="w-full">
        <TabsList className="glass grid w-full grid-cols-2">
          <TabsTrigger value="analyze">Nova Análise</TabsTrigger>
          <TabsTrigger value="results" disabled={!analysisResult}>Resultados</TabsTrigger>
        </TabsList>

        <TabsContent value="analyze" className="mt-6">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Análise de Reserved Instances & Savings Plans
              </CardTitle>
              <CardDescription>
                Análise abrangente de RIs e Savings Plans para identificar oportunidades de economia na sua conta AWS
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Account Info */}
                {selectedAccount && (
                  <div className="rounded-lg bg-muted/50 p-4 border">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-4 w-4 text-primary" />
                      <span className="font-medium">Conta Selecionada</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {selectedAccount.account_name || selectedAccount.account_id}
                    </p>
                  </div>
                )}

                {/* Services Analyzed */}
                <div className="rounded-lg bg-muted/50 p-4 border space-y-2">
                  <p className="text-sm font-medium">Itens Analisados:</p>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                    <li>• EC2 Reserved Instances - Instâncias reservadas ativas</li>
                    <li>• Savings Plans - Compute e EC2 Instance Savings Plans</li>
                    <li>• Cobertura de RI - Percentual de uso coberto por RIs</li>
                    <li>• Cobertura de SP - Percentual de uso coberto por Savings Plans</li>
                    <li>• Recomendações - Oportunidades de economia identificadas</li>
                  </ul>
                </div>

                {/* Last Analysis */}
                {lastAnalysisTime && (
                  <div className="rounded-lg bg-green-500/10 p-4 border border-green-500/20">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">
                        Última análise: {lastAnalysisTime.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !selectedAccountId}
                  className="w-full"
                  size="lg"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analisando RI/Savings Plans...
                    </>
                  ) : (
                    <>
                      <Target className="mr-2 h-4 w-4" />
                      Iniciar Análise de RI/SP
                    </>
                  )}
                </Button>

                {isAnalyzing && (
                  <div className="text-center text-sm text-muted-foreground">
                    <p>Consultando Reserved Instances...</p>
                    <p className="mt-1">Verificando Savings Plans e cobertura...</p>
                  </div>
                )}

                {!selectedAccountId && (
                  <div className="rounded-lg bg-yellow-500/10 p-4 border border-yellow-500/20">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm text-yellow-600">
                        Selecione uma conta AWS no menu superior para realizar a análise.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="mt-6 space-y-6">
          {analysisResult && (
            <>
              {/* Summary Cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="glass border-primary/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Reserved Instances
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analysisResult.summary.totalRIs}</div>
                    <p className="text-xs text-muted-foreground">
                      {analysisResult.summary.activeRIs} ativas
                    </p>
                  </CardContent>
                </Card>

                <Card className="glass border-primary/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Savings Plans
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analysisResult.summary.totalSavingsPlans}</div>
                    <p className="text-xs text-muted-foreground">
                      {analysisResult.summary.activeSavingsPlans} ativos
                    </p>
                  </CardContent>
                </Card>

                <Card className="glass border-primary/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Cobertura RI
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${getCoverageColor(analysisResult.coverage.reservedInstances)}`}>
                      {analysisResult.coverage.reservedInstances.toFixed(1)}%
                    </div>
                    <Progress value={analysisResult.coverage.reservedInstances} className="h-2 mt-2" />
                  </CardContent>
                </Card>

                <Card className="glass border-primary/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <PieChart className="h-4 w-4" />
                      Cobertura SP
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${getCoverageColor(analysisResult.coverage.savingsPlans)}`}>
                      {analysisResult.coverage.savingsPlans.toFixed(1)}%
                    </div>
                    <Progress value={analysisResult.coverage.savingsPlans} className="h-2 mt-2" />
                  </CardContent>
                </Card>
              </div>

              {/* Recommendations */}
              {analysisResult.recommendations.length > 0 && (
                <Card className="glass border-primary/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                      Recomendações de Otimização
                    </CardTitle>
                    <CardDescription>
                      Oportunidades identificadas para reduzir custos
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {analysisResult.recommendations.map((rec, index) => (
                        <div key={index} className="border rounded-lg p-4 space-y-3 bg-muted/30">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{rec.type.replace('_', ' ').toUpperCase()}</Badge>
                                {getPriorityBadge(rec.priority)}
                              </div>
                              <p className="text-sm">{rec.message}</p>
                            </div>
                            {rec.potentialSavings && (
                              <div className="text-right">
                                <div className="text-lg font-bold text-green-500">
                                  {rec.potentialSavings}
                                </div>
                                <div className="text-xs text-muted-foreground">economia potencial</div>
                              </div>
                            )}
                          </div>
                          {rec.currentCoverage && (
                            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                              <div>
                                <span className="text-xs text-muted-foreground">Cobertura RI Atual:</span>
                                <div className="font-medium">{rec.currentCoverage.ri.toFixed(1)}%</div>
                              </div>
                              <div>
                                <span className="text-xs text-muted-foreground">Cobertura SP Atual:</span>
                                <div className="font-medium">{rec.currentCoverage.sp.toFixed(1)}%</div>
                              </div>
                            </div>
                          )}
                          {rec.instances && rec.instances.length > 0 && (
                            <div className="pt-2 border-t">
                              <span className="text-xs text-muted-foreground">Instâncias afetadas:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {rec.instances.map((id, i) => (
                                  <Badge key={i} variant="outline" className="font-mono text-xs">
                                    {id}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Charts */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Coverage Chart */}
                <Card className="glass border-primary/20">
                  <CardHeader>
                    <CardTitle>Cobertura de Compromissos</CardTitle>
                    <CardDescription>Percentual de uso coberto por RI e SP</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {coverageData.some(d => d.value > 0) ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={coverageData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis 
                            dataKey="name" 
                            className="text-xs"
                            tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          />
                          <YAxis 
                            className="text-xs"
                            tick={{ fill: 'hsl(var(--muted-foreground))' }}
                            domain={[0, 100]}
                          />
                          <Tooltip 
                            contentStyle={{
                              backgroundColor: 'hsl(var(--card))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                            }}
                            formatter={(value: number) => [`${value.toFixed(1)}%`, 'Cobertura']}
                          />
                          <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                        <div className="text-center">
                          <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-20" />
                          <p>Sem dados de cobertura disponíveis</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Distribution Chart */}
                <Card className="glass border-primary/20">
                  <CardHeader>
                    <CardTitle>Distribuição de Compromissos</CardTitle>
                    <CardDescription>RIs vs Savings Plans</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(analysisResult.summary.totalRIs > 0 || analysisResult.summary.totalSavingsPlans > 0) ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <RechartsPieChart>
                          <Pie
                            data={[
                              { name: 'Reserved Instances', value: analysisResult.summary.totalRIs },
                              { name: 'Savings Plans', value: analysisResult.summary.totalSavingsPlans }
                            ].filter(d => d.value > 0)}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, value }) => `${name}: ${value}`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {[
                              { name: 'Reserved Instances', value: analysisResult.summary.totalRIs },
                              { name: 'Savings Plans', value: analysisResult.summary.totalSavingsPlans }
                            ].filter(d => d.value > 0).map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                        <div className="text-center">
                          <PieChart className="h-12 w-12 mx-auto mb-2 opacity-20" />
                          <p>Nenhum compromisso encontrado</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Reserved Instances List */}
              <Card className="glass border-primary/20">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      Reserved Instances
                    </CardTitle>
                    <CardDescription>Lista de Reserved Instances encontradas</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={exportReport}>
                    <Download className="h-4 w-4 mr-2" />
                    Exportar
                  </Button>
                </CardHeader>
                <CardContent>
                  {analysisResult.reservedInstances.length > 0 ? (
                    <div className="space-y-3">
                      {analysisResult.reservedInstances.map((ri) => (
                        <div key={ri.id} className="border rounded-lg p-4 bg-muted/30">
                          <div className="flex items-start justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold">{ri.instanceType}</h4>
                                {getStateBadge(ri.state)}
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">ID:</span>
                                  <div className="font-mono text-xs">{ri.id}</div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Quantidade:</span>
                                  <div className="font-medium">{ri.instanceCount}</div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Tipo de Oferta:</span>
                                  <div className="font-medium">{ri.offeringType || 'N/A'}</div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Término:</span>
                                  <div className="font-medium">
                                    {ri.end ? new Date(ri.end).toLocaleDateString('pt-BR') : 'N/A'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
                      <h3 className="text-lg font-semibold mb-2">Nenhuma Reserved Instance</h3>
                      <p className="text-muted-foreground text-sm">
                        Nenhuma Reserved Instance foi encontrada nesta conta.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Savings Plans List */}
              <Card className="glass border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Savings Plans
                  </CardTitle>
                  <CardDescription>Lista de Savings Plans encontrados</CardDescription>
                </CardHeader>
                <CardContent>
                  {analysisResult.savingsPlans.length > 0 ? (
                    <div className="space-y-3">
                      {analysisResult.savingsPlans.map((sp) => (
                        <div key={sp.id} className="border rounded-lg p-4 bg-muted/30">
                          <div className="flex items-start justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold">{sp.type.replace('_', ' ').toUpperCase()}</h4>
                                {getStateBadge(sp.state)}
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">ID:</span>
                                  <div className="font-mono text-xs">{sp.id}</div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Compromisso:</span>
                                  <div className="font-medium">${sp.commitment}</div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Pagamento:</span>
                                  <div className="font-medium">{sp.paymentOption?.replace('_', ' ') || 'N/A'}</div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Término:</span>
                                  <div className="font-medium">
                                    {sp.end ? new Date(sp.end).toLocaleDateString('pt-BR') : 'N/A'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
                      <h3 className="text-lg font-semibold mb-2">Nenhum Savings Plan</h3>
                      <p className="text-muted-foreground text-sm">
                        Nenhum Savings Plan foi encontrado nesta conta.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Refresh Button */}
              <div className="flex justify-center">
                <Button variant="outline" onClick={handleAnalyze} disabled={isAnalyzing}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isAnalyzing ? 'animate-spin' : ''}`} />
                  Atualizar Análise
                </Button>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
