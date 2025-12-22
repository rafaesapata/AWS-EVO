import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layout } from "@/components/Layout";
import { apiClient } from "@/integrations/aws/api-client";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { 
  Zap, 
  TrendingDown, 
  DollarSign, 
  Server,
  Database,
  HardDrive,
  Cpu,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Download,
  Lightbulb,
  Target,
  TrendingUp
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from "recharts";

interface OptimizationRecommendation {
  id: string;
  type: 'rightsizing' | 'reserved_instances' | 'storage_optimization' | 'unused_resources' | 'scheduling';
  resource_type: string;
  resource_id: string;
  resource_name: string;
  current_cost: number;
  optimized_cost: number;
  potential_savings: number;
  savings_percentage: number;
  confidence: 'high' | 'medium' | 'low';
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  description: string;
  recommendation: string;
  implementation_steps: string[];
  risk_level: 'low' | 'medium' | 'high';
  created_at: string;
  status: 'pending' | 'implemented' | 'dismissed';
}

interface CostMetrics {
  total_monthly_cost: number;
  total_potential_savings: number;
  optimization_score: number;
  recommendations_count: number;
  implemented_savings: number;
}

export default function CostOptimization() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { selectedAccountId } = useAwsAccount();
  const { data: organizationId } = useOrganization();
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedConfidence, setSelectedConfidence] = useState<string>('all');

  // Get optimization recommendations
  const { data: recommendations, isLoading, refetch } = useQuery({
    queryKey: ['cost-optimization', organizationId, selectedAccountId, selectedType, selectedConfidence],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let filters: any = { 
        organization_id: organizationId,
        aws_account_id: selectedAccountId
      };

      if (selectedType !== 'all') {
        filters.type = selectedType;
      }

      if (selectedConfidence !== 'all') {
        filters.confidence = selectedConfidence;
      }

      const response = await apiClient.select('optimization_recommendations', {
        select: '*',
        eq: filters,
        order: { potential_savings: 'desc' }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return response.data || [];
    },
  });

  // Get cost metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['cost-metrics', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Get current month costs
      const currentDate = new Date();
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      
      const costsResponse = await apiClient.select('daily_costs', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId
        },
        gte: { cost_date: startOfMonth.toISOString().split('T')[0] }
      });

      const costs = costsResponse.data || [];
      const totalMonthlyCost = costs.reduce((sum, cost) => sum + Number(cost.total_cost), 0);
      
      // Calculate metrics from recommendations
      const totalPotentialSavings = (recommendations || []).reduce((sum, rec) => sum + rec.potential_savings, 0);
      const implementedSavings = (recommendations || []).filter(rec => rec.status === 'implemented').reduce((sum, rec) => sum + rec.potential_savings, 0);
      
      // Calculate optimization score (0-100)
      const optimizationScore = totalMonthlyCost > 0 ? Math.min(100, Math.max(0, 100 - (totalPotentialSavings / totalMonthlyCost) * 100)) : 100;

      return {
        total_monthly_cost: totalMonthlyCost,
        total_potential_savings: totalPotentialSavings,
        optimization_score: optimizationScore,
        recommendations_count: (recommendations || []).length,
        implemented_savings: implementedSavings
      };
    },
  });

  const handleRefresh = async () => {
    try {
      await refetch();
      toast({
        title: "Dados atualizados",
        description: "As recomendações de otimização foram atualizadas.",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar as recomendações.",
        variant: "destructive"
      });
    }
  };

  const exportRecommendations = () => {
    if (!recommendations) return;

    const csvContent = [
      'Tipo,Recurso,Custo Atual,Custo Otimizado,Economia Potencial,Confiança,Esforço,Impacto,Descrição',
      ...recommendations.map(rec => [
        rec.type,
        rec.resource_name,
        rec.current_cost.toFixed(2),
        rec.optimized_cost.toFixed(2),
        rec.potential_savings.toFixed(2),
        rec.confidence,
        rec.effort,
        rec.impact,
        `"${rec.description}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cost_optimization_${selectedAccountId}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    toast({
      title: "Relatório exportado",
      description: "As recomendações foram exportadas com sucesso.",
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'rightsizing': return Cpu;
      case 'reserved_instances': return Server;
      case 'storage_optimization': return HardDrive;
      case 'unused_resources': return AlertTriangle;
      case 'scheduling': return Clock;
      default: return Zap;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'rightsizing': return 'text-blue-500';
      case 'reserved_instances': return 'text-green-500';
      case 'storage_optimization': return 'text-purple-500';
      case 'unused_resources': return 'text-red-500';
      case 'scheduling': return 'text-orange-500';
      default: return 'text-gray-500';
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'high': return <Badge className="bg-green-500">Alta</Badge>;
      case 'medium': return <Badge variant="secondary">Média</Badge>;
      case 'low': return <Badge variant="outline">Baixa</Badge>;
      default: return <Badge variant="outline">{confidence}</Badge>;
    }
  };

  const getEffortBadge = (effort: string) => {
    switch (effort) {
      case 'low': return <Badge className="bg-green-500">Baixo</Badge>;
      case 'medium': return <Badge variant="secondary">Médio</Badge>;
      case 'high': return <Badge variant="destructive">Alto</Badge>;
      default: return <Badge variant="outline">{effort}</Badge>;
    }
  };

  const getImpactBadge = (impact: string) => {
    switch (impact) {
      case 'high': return <Badge className="bg-blue-500">Alto</Badge>;
      case 'medium': return <Badge variant="secondary">Médio</Badge>;
      case 'low': return <Badge variant="outline">Baixo</Badge>;
      default: return <Badge variant="outline">{impact}</Badge>;
    }
  };

  // Prepare chart data
  const typeDistribution = recommendations?.reduce((acc, rec) => {
    acc[rec.type] = (acc[rec.type] || 0) + rec.potential_savings;
    return acc;
  }, {} as Record<string, number>) || {};

  const chartData = Object.entries(typeDistribution).map(([type, savings]) => ({
    type: type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    savings: Math.round(savings),
    color: getTypeColor(type)
  }));

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <Layout 
      title="Otimização de Custos" 
      description="Identifique oportunidades de economia e otimize seus gastos AWS"
      icon={<Zap className="h-7 w-7 text-white" />}
    >
      <div className="space-y-6">
      {/* Header */}
      <Card className="glass border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-6 w-6 text-primary" />
                Otimização de Custos
              </CardTitle>
              <CardDescription>
                Recomendações inteligentes baseadas em ML para reduzir custos AWS
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={isLoading}
                className="glass"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'Atualizando...' : 'Atualizar'}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportRecommendations}
                className="glass"
                disabled={!recommendations || recommendations.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Metrics Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Custo Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                ${metrics?.total_monthly_cost?.toFixed(2) || '0.00'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Economia Potencial</CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="space-y-1">
                <div className="text-2xl font-bold text-green-500">
                  ${metrics?.total_potential_savings?.toFixed(2) || '0.00'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {metrics?.total_monthly_cost && metrics?.total_potential_savings 
                    ? `${((metrics.total_potential_savings / metrics.total_monthly_cost) * 100).toFixed(1)}% do total`
                    : '0% do total'
                  }
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Score de Otimização</CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="space-y-2">
                <div className="text-2xl font-bold">
                  {Math.round(metrics?.optimization_score || 0)}/100
                </div>
                <Progress value={metrics?.optimization_score || 0} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recomendações</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">
                {recommendations?.length || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Economia Implementada</CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-blue-500">
                ${metrics?.implemented_savings?.toFixed(2) || '0.00'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="glass border-primary/20">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Tipo de Otimização</label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="glass">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Tipos</SelectItem>
                  <SelectItem value="rightsizing">Right-sizing</SelectItem>
                  <SelectItem value="reserved_instances">Reserved Instances</SelectItem>
                  <SelectItem value="storage_optimization">Otimização de Storage</SelectItem>
                  <SelectItem value="unused_resources">Recursos Não Utilizados</SelectItem>
                  <SelectItem value="scheduling">Agendamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Nível de Confiança</label>
              <Select value={selectedConfidence} onValueChange={setSelectedConfidence}>
                <SelectTrigger className="glass">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Níveis</SelectItem>
                  <SelectItem value="high">Alta Confiança</SelectItem>
                  <SelectItem value="medium">Média Confiança</SelectItem>
                  <SelectItem value="low">Baixa Confiança</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs defaultValue="recommendations" className="w-full">
        <TabsList className="glass">
          <TabsTrigger value="recommendations">Recomendações</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="implemented">Implementadas</TabsTrigger>
        </TabsList>

        <TabsContent value="recommendations" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Recomendações de Otimização</CardTitle>
              <CardDescription>Oportunidades identificadas para redução de custos</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))}
                </div>
              ) : recommendations && recommendations.length > 0 ? (
                <div className="space-y-4">
                  {recommendations.map((rec) => {
                    const TypeIcon = getTypeIcon(rec.type);
                    return (
                      <div key={rec.id} className="border rounded-lg p-6 space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-4">
                            <TypeIcon className={`h-6 w-6 mt-1 ${getTypeColor(rec.type)}`} />
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-lg">{rec.resource_name}</h4>
                                <Badge variant="outline">{rec.resource_type}</Badge>
                              </div>
                              <p className="text-muted-foreground">{rec.description}</p>
                              <div className="flex items-center gap-4 text-sm">
                                <span>Confiança: {getConfidenceBadge(rec.confidence)}</span>
                                <span>Esforço: {getEffortBadge(rec.effort)}</span>
                                <span>Impacto: {getImpactBadge(rec.impact)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right space-y-1">
                            <div className="text-2xl font-bold text-green-500">
                              ${rec.potential_savings.toFixed(2)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {rec.savings_percentage.toFixed(1)}% economia
                            </div>
                            <div className="text-xs text-muted-foreground">
                              ${rec.current_cost.toFixed(2)} → ${rec.optimized_cost.toFixed(2)}
                            </div>
                          </div>
                        </div>

                        <div className="bg-muted/30 rounded-lg p-4">
                          <h5 className="font-medium mb-2 flex items-center gap-2">
                            <Lightbulb className="h-4 w-4" />
                            Recomendação
                          </h5>
                          <p className="text-sm text-muted-foreground mb-3">{rec.recommendation}</p>
                          
                          {rec.implementation_steps && rec.implementation_steps.length > 0 && (
                            <div>
                              <h6 className="font-medium text-sm mb-2">Passos para Implementação:</h6>
                              <ol className="text-sm text-muted-foreground space-y-1">
                                {rec.implementation_steps.map((step, idx) => (
                                  <li key={idx} className="flex gap-2">
                                    <span className="font-medium">{idx + 1}.</span>
                                    <span>{step}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <AlertTriangle className="h-4 w-4" />
                            <span>Risco: {rec.risk_level}</span>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">
                              Mais Detalhes
                            </Button>
                            <Button size="sm">
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Implementar
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Target className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">Nenhuma recomendação encontrada</h3>
                  <p className="text-muted-foreground mb-4">
                    Sua infraestrutura está bem otimizada ou ainda estamos analisando os dados.
                  </p>
                  <Button onClick={handleRefresh}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Verificar Novamente
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Savings by Type */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>Economia por Tipo</CardTitle>
                <CardDescription>Distribuição das oportunidades de economia</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ type, savings }) => `${type}: $${savings}`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="savings"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Nenhum dado disponível
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Confidence Distribution */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>Distribuição por Confiança</CardTitle>
                <CardDescription>Recomendações por nível de confiança</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : recommendations && recommendations.length > 0 ? (
                  <div className="space-y-4">
                    {['high', 'medium', 'low'].map((confidence) => {
                      const count = recommendations.filter(rec => rec.confidence === confidence).length;
                      const savings = recommendations
                        .filter(rec => rec.confidence === confidence)
                        .reduce((sum, rec) => sum + rec.potential_savings, 0);
                      const percentage = recommendations.length > 0 ? (count / recommendations.length) * 100 : 0;

                      return (
                        <div key={confidence} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="font-medium capitalize">{confidence} Confiança</span>
                            <span className="text-sm text-muted-foreground">
                              {count} recomendações • ${savings.toFixed(2)}
                            </span>
                          </div>
                          <Progress value={percentage} className="h-2" />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Nenhum dado disponível
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="implemented" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Recomendações Implementadas</CardTitle>
              <CardDescription>Otimizações já aplicadas e suas economias</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <CheckCircle className="h-16 w-16 mx-auto mb-4 text-success" />
                <h3 className="text-xl font-semibold mb-2">Implementações em Desenvolvimento</h3>
                <p className="text-muted-foreground">
                  O tracking de implementações será exibido aqui em breve.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </Layout>
  );
}