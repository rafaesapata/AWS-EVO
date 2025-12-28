import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { Layout } from "@/components/Layout";
import { 
  DollarSign, 
  TrendingDown, 
  Calendar,
  Target,
  RefreshCw,
  Download,
  BarChart3,
  PieChart,
  Clock,
  CheckCircle,
  AlertTriangle
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, PieChart as RechartsPieChart, Pie, Cell } from "recharts";

interface ReservedInstance {
  id: string;
  instance_type: string;
  availability_zone: string;
  platform: string;
  tenancy: string;
  offering_class: string;
  offering_type: string;
  duration: number;
  fixed_price: number;
  usage_price: number;
  currency_code: string;
  instance_count: number;
  product_description: string;
  state: 'active' | 'payment-pending' | 'retired' | 'payment-failed';
  start: string;
  end: string;
  utilization_percentage: number;
  estimated_savings: number;
}

interface SavingsPlan {
  id: string;
  savings_plan_type: 'compute' | 'ec2_instance' | 'sagemaker';
  payment_option: 'all_upfront' | 'partial_upfront' | 'no_upfront';
  term: number;
  commitment: number;
  currency: string;
  start_time: string;
  end_time: string;
  state: 'active' | 'payment-pending' | 'payment-failed' | 'retired';
  hourly_commitment: number;
  upfront_payment: number;
  utilization_percentage: number;
  estimated_savings: number;
}

interface RIRecommendation {
  id: string;
  service: string;
  instance_type: string;
  region: string;
  recommended_instance_count: number;
  estimated_monthly_savings: number;
  estimated_savings_percentage: number;
  payback_period_months: number;
  upfront_cost: number;
  monthly_cost_with_ri: number;
  monthly_cost_without_ri: number;
  confidence_level: 'high' | 'medium' | 'low';
}

export default function RISavingsPlans() {
  const { toast } = useToast();
  const { selectedAccountId } = useAwsAccount();
  const { data: organizationId } = useOrganization();
  const [selectedView, setSelectedView] = useState<string>('overview');

  // Get Reserved Instances
  const { data: reservedInstances, isLoading: riLoading, refetch: refetchRI } = useQuery({
    queryKey: ['reserved-instances', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.select('reserved_instances', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId
        },
        order: { utilization_percentage: 'asc' }
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data || [];
    },
  });

  // Get Savings Plans
  const { data: savingsPlans, isLoading: spLoading, refetch: refetchSP } = useQuery({
    queryKey: ['savings-plans', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.select('savings_plans', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId
        },
        order: { utilization_percentage: 'asc' }
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data || [];
    },
  });

  // Get RI Recommendations
  const { data: recommendations, isLoading: recLoading } = useQuery({
    queryKey: ['ri-recommendations', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.select('ri_recommendations', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId
        },
        order: { estimated_monthly_savings: 'desc' }
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data || [];
    },
  });

  const handleRefresh = async () => {
    try {
      await Promise.all([refetchRI(), refetchSP()]);
      toast({
        title: "Dados atualizados",
        description: "Os dados de RI e Savings Plans foram atualizados.",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar os dados.",
        variant: "destructive"
      });
    }
  };

  const exportReport = () => {
    const riData = reservedInstances?.map(ri => ({
      type: 'Reserved Instance',
      resource: ri.instance_type,
      utilization: ri.utilization_percentage,
      savings: ri.estimated_savings,
      end_date: ri.end
    })) || [];

    const spData = savingsPlans?.map(sp => ({
      type: 'Savings Plan',
      resource: sp.savings_plan_type,
      utilization: sp.utilization_percentage,
      savings: sp.estimated_savings,
      end_date: sp.end_time
    })) || [];

    const allData = [...riData, ...spData];

    const csvContent = [
      'Tipo,Recurso,Utilização (%),Economia Estimada ($),Data de Término',
      ...allData.map(item => [
        item.type,
        item.resource,
        item.utilization.toFixed(1),
        item.savings.toFixed(2),
        item.end_date
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ri_savings_plans_${selectedAccountId}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    toast({
      title: "Relatório exportado",
      description: "O relatório de RI e Savings Plans foi exportado com sucesso.",
    });
  };

  const getStateBadge = (state: string) => {
    switch (state) {
      case 'active': return <Badge className="bg-green-500">Ativo</Badge>;
      case 'payment-pending': return <Badge variant="secondary">Pagamento Pendente</Badge>;
      case 'payment-failed': return <Badge variant="destructive">Pagamento Falhou</Badge>;
      case 'retired': return <Badge variant="outline">Aposentado</Badge>;
      default: return <Badge variant="outline">{state}</Badge>;
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

  const getUtilizationColor = (utilization: number) => {
    if (utilization >= 80) return 'text-green-500';
    if (utilization >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  // Calculate summary metrics
  const totalRIs = reservedInstances?.length || 0;
  const totalSPs = savingsPlans?.length || 0;
  const totalRISavings = reservedInstances?.reduce((sum, ri) => sum + ri.estimated_savings, 0) || 0;
  const totalSPSavings = savingsPlans?.reduce((sum, sp) => sum + sp.estimated_savings, 0) || 0;
  const avgRIUtilization = reservedInstances?.length > 0 
    ? reservedInstances.reduce((sum, ri) => sum + ri.utilization_percentage, 0) / reservedInstances.length 
    : 0;
  const avgSPUtilization = savingsPlans?.length > 0 
    ? savingsPlans.reduce((sum, sp) => sum + sp.utilization_percentage, 0) / savingsPlans.length 
    : 0;
  const potentialSavings = recommendations?.reduce((sum, rec) => sum + rec.estimated_monthly_savings, 0) || 0;

  // Prepare chart data
  const utilizationData = [
    ...(reservedInstances?.map(ri => ({
      name: ri.instance_type,
      type: 'RI',
      utilization: ri.utilization_percentage,
      savings: ri.estimated_savings
    })) || []),
    ...(savingsPlans?.map(sp => ({
      name: sp.savings_plan_type,
      type: 'SP',
      utilization: sp.utilization_percentage,
      savings: sp.estimated_savings
    })) || [])
  ];

  const savingsData = [
    { name: 'Reserved Instances', value: totalRISavings, color: '#3b82f6' },
    { name: 'Savings Plans', value: totalSPSavings, color: '#10b981' }
  ];

  const COLORS = ['#3b82f6', '#10b981'];

  return (
    <Layout 
      title="Reserved Instances & Savings Plans" 
      description="Gestão e otimização de RI e Savings Plans para maximizar economia"
      icon={<DollarSign className="h-5 w-5 text-white" />}
    >
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Reserved Instances</CardTitle>
          </CardHeader>
          <CardContent>
            {riLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">{totalRIs}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Savings Plans</CardTitle>
          </CardHeader>
          <CardContent>
            {spLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">{totalSPs}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Economia RI</CardTitle>
          </CardHeader>
          <CardContent>
            {riLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-green-500">
                ${totalRISavings.toFixed(0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Economia SP</CardTitle>
          </CardHeader>
          <CardContent>
            {spLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-green-500">
                ${totalSPSavings.toFixed(0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Utilização RI</CardTitle>
          </CardHeader>
          <CardContent>
            {riLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="space-y-2">
                <div className={`text-2xl font-bold ${getUtilizationColor(avgRIUtilization)}`}>
                  {avgRIUtilization.toFixed(1)}%
                </div>
                <Progress value={avgRIUtilization} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Economia Potencial</CardTitle>
          </CardHeader>
          <CardContent>
            {recLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-blue-500">
                ${potentialSavings.toFixed(0)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="glass">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="reserved-instances">Reserved Instances</TabsTrigger>
          <TabsTrigger value="savings-plans">Savings Plans</TabsTrigger>
          <TabsTrigger value="recommendations">Recomendações</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Utilization Chart */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>Utilização por Recurso</CardTitle>
                <CardDescription>Comparação de utilização entre RIs e SPs</CardDescription>
              </CardHeader>
              <CardContent>
                {riLoading || spLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : utilizationData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={utilizationData}>
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
                        formatter={(value: number, name: string) => [
                          name === 'utilization' ? `${value}%` : `$${value}`,
                          name === 'utilization' ? 'Utilização' : 'Economia'
                        ]}
                      />
                      <Bar dataKey="utilization" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Nenhum dado disponível
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Savings Distribution */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>Distribuição de Economia</CardTitle>
                <CardDescription>Economia por tipo de compromisso</CardDescription>
              </CardHeader>
              <CardContent>
                {riLoading || spLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : savingsData.some(d => d.value > 0) ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPieChart>
                      <Pie
                        data={savingsData.filter(d => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: $${value.toFixed(0)}`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {savingsData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Nenhuma economia registrada
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reserved-instances" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Reserved Instances Ativas</CardTitle>
              <CardDescription>Lista de todas as Reserved Instances</CardDescription>
            </CardHeader>
            <CardContent>
              {riLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : reservedInstances && reservedInstances.length > 0 ? (
                <div className="space-y-4">
                  {reservedInstances.map((ri) => (
                    <div key={ri.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{ri.instance_type}</h4>
                            {getStateBadge(ri.state)}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Plataforma:</span>
                              <div className="font-medium">{ri.platform}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">AZ:</span>
                              <div className="font-medium">{ri.availability_zone}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Duração:</span>
                              <div className="font-medium">{ri.duration} meses</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Instâncias:</span>
                              <div className="font-medium">{ri.instance_count}</div>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Período: {new Date(ri.start).toLocaleDateString('pt-BR')} - {new Date(ri.end).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                        <div className="text-right space-y-2">
                          <div className="text-2xl font-bold text-green-500">
                            ${ri.estimated_savings.toFixed(0)}
                          </div>
                          <div className="text-sm text-muted-foreground">economia</div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Utilização</span>
                          <span className={`text-sm font-medium ${getUtilizationColor(ri.utilization_percentage)}`}>
                            {ri.utilization_percentage.toFixed(1)}%
                          </span>
                        </div>
                        <Progress value={ri.utilization_percentage} className="h-2" />
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Preço Fixo:</span>
                          <div className="font-medium">${ri.fixed_price.toFixed(2)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Preço por Uso:</span>
                          <div className="font-medium">${ri.usage_price.toFixed(4)}/h</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Tipo de Oferta:</span>
                          <div className="font-medium">{ri.offering_type}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">Nenhuma Reserved Instance</h3>
                  <p className="text-muted-foreground">
                    Nenhuma Reserved Instance foi encontrada nesta conta.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="savings-plans" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Savings Plans Ativos</CardTitle>
              <CardDescription>Lista de todos os Savings Plans</CardDescription>
            </CardHeader>
            <CardContent>
              {spLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : savingsPlans && savingsPlans.length > 0 ? (
                <div className="space-y-4">
                  {savingsPlans.map((sp) => (
                    <div key={sp.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{sp.savings_plan_type.replace('_', ' ').toUpperCase()}</h4>
                            {getStateBadge(sp.state)}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Termo:</span>
                              <div className="font-medium">{sp.term} anos</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Pagamento:</span>
                              <div className="font-medium">{sp.payment_option.replace('_', ' ')}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Compromisso:</span>
                              <div className="font-medium">${sp.commitment.toFixed(2)}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Por Hora:</span>
                              <div className="font-medium">${sp.hourly_commitment.toFixed(4)}</div>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Período: {new Date(sp.start_time).toLocaleDateString('pt-BR')} - {new Date(sp.end_time).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                        <div className="text-right space-y-2">
                          <div className="text-2xl font-bold text-green-500">
                            ${sp.estimated_savings.toFixed(0)}
                          </div>
                          <div className="text-sm text-muted-foreground">economia</div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Utilização</span>
                          <span className={`text-sm font-medium ${getUtilizationColor(sp.utilization_percentage)}`}>
                            {sp.utilization_percentage.toFixed(1)}%
                          </span>
                        </div>
                        <Progress value={sp.utilization_percentage} className="h-2" />
                      </div>
                      
                      {sp.upfront_payment > 0 && (
                        <div className="bg-muted/30 rounded p-3">
                          <div className="text-sm">
                            <span className="text-muted-foreground">Pagamento Antecipado:</span>
                            <span className="font-medium ml-2">${sp.upfront_payment.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Target className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">Nenhum Savings Plan</h3>
                  <p className="text-muted-foreground">
                    Nenhum Savings Plan foi encontrado nesta conta.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Recomendações de RI</CardTitle>
              <CardDescription>Oportunidades identificadas para Reserved Instances</CardDescription>
            </CardHeader>
            <CardContent>
              {recLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))}
                </div>
              ) : recommendations && recommendations.length > 0 ? (
                <div className="space-y-4">
                  {recommendations.map((rec) => (
                    <div key={rec.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{rec.instance_type}</h4>
                            {getConfidenceBadge(rec.confidence_level)}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Serviço:</span>
                              <div className="font-medium">{rec.service}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Região:</span>
                              <div className="font-medium">{rec.region}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Instâncias:</span>
                              <div className="font-medium">{rec.recommended_instance_count}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Payback:</span>
                              <div className="font-medium">{rec.payback_period_months} meses</div>
                            </div>
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <div className="text-2xl font-bold text-green-500">
                            ${rec.estimated_monthly_savings.toFixed(0)}
                          </div>
                          <div className="text-sm text-muted-foreground">economia/mês</div>
                          <div className="text-sm font-medium text-green-600">
                            {rec.estimated_savings_percentage.toFixed(1)}% economia
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-muted/30 rounded p-3">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Custo Antecipado:</span>
                            <div className="font-medium">${rec.upfront_cost.toFixed(2)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Com RI:</span>
                            <div className="font-medium">${rec.monthly_cost_with_ri.toFixed(2)}/mês</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Sem RI:</span>
                            <div className="font-medium">${rec.monthly_cost_without_ri.toFixed(2)}/mês</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex justify-end">
                        <Button size="sm" className="gap-2">
                          <CheckCircle className="h-4 w-4" />
                          Aplicar Recomendação
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <TrendingDown className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">Nenhuma recomendação disponível</h3>
                  <p className="text-muted-foreground">
                    Não há oportunidades de Reserved Instances identificadas no momento.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </Layout>
  );
}