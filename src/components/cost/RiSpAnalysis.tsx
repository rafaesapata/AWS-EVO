import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/aws/api-client";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useDemoAwareQuery } from "@/hooks/useDemoAwareQuery";
import { 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2,
  DollarSign,
  Clock,
  Target,
  Zap,
  History,
  TrendingUp,
  TrendingDown
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

// Interface for RI/SP analysis data from Lambda
interface RiSpAnalysisData {
  success?: boolean;
  hasData?: boolean; // Flag from backend indicating if there's data in database
  analyzedAt?: string;
  executiveSummary?: {
    status: string;
    totalCommitments: number;
    coverageScore: number;
    potentialAnnualSavings: number;
    recommendationsSummary?: {
      total: number;
      critical: number;
      high: number;
      quickWins: number;
    };
    keyInsights?: string[];
  };
  reservedInstances?: {
    ec2?: any[];
    rds?: any[];
    total?: number;
    count?: number;
    active?: number;
    averageUtilization?: number;
    totalMonthlySavings?: number;
    underutilized?: any[];
    underutilizedCount?: number;
  };
  savingsPlans?: {
    plans?: any[];
    total?: number;
    count?: number;
    active?: number;
    averageUtilization?: number;
    averageCoverage?: number;
    totalMonthlySavings?: number;
    underutilized?: any[];
  };
  recommendations?: any[] | {
    count?: number;
    topRecommendations?: any[];
    totalPotentialAnnualSavings?: number;
  };
  coverage?: {
    reservedInstances?: number;
    savingsPlans?: number;
    overall?: number;
  };
  potentialSavings?: {
    monthly?: number;
    annual?: number;
    maxPercentage?: number;
  };
  currentResources?: {
    ec2Instances?: number;
    rdsInstances?: number;
    totalMonthlyCost?: number;
  };
  analysisMetadata?: {
    analysisDepth?: string;
    region?: string;
    regions?: string[];
    timestamp?: string;
    accountId?: string;
  };
}

export const RiSpAnalysis = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedAccountId, selectedProvider, selectedAccount } = useCloudAccount();
  const { data: organizationId } = useOrganization();
  const { shouldEnableAccountQuery, isInDemoMode } = useDemoAwareQuery();
  const [activeTab, setActiveTab] = useState<'overview' | 'ri' | 'sp' | 'recommendations' | 'history'>('overview');

  // Get regions from selected account (default to us-east-1 if not set)
  const accountRegions = selectedAccount?.regions?.length ? selectedAccount.regions : ['us-east-1'];

  // Detect if Azure
  const isAzure = selectedProvider === 'AZURE';

  // Fetch RI/SP analysis data from DATABASE - supports both AWS and Azure
  // Data is automatically saved to database by ri-sp-analyzer Lambda
  const { data: analysisData, isLoading, isFetching } = useQuery<RiSpAnalysisData>({
    queryKey: ['ri-sp-analysis', organizationId, selectedAccountId, selectedProvider, accountRegions, 'demo', isInDemoMode],
    enabled: shouldEnableAccountQuery(),
    staleTime: 30 * 60 * 1000, // 30 minutes - data stays fresh
    gcTime: 60 * 60 * 1000, // 1 hour - keep in cache
    queryFn: async () => {
      console.log('🔄 Fetching RI/SP analysis from database...', {
        organizationId,
        selectedAccountId,
        selectedProvider,
        isInDemoMode
      });
      
      // In demo mode, call the Lambda which returns demo data
      if (isInDemoMode) {
        const response = await apiClient.invoke<RiSpAnalysisData>('ri-sp-analyzer', {
          body: { accountId: 'demo', analysisType: 'all' }
        });
        
        if (response.error) {
          console.error('❌ Error fetching demo RI/SP analysis:', response.error);
          throw new Error(response.error.message);
        }
        
        console.log('✅ Demo RI/SP analysis loaded');
        return response.data;
      }
      
      // Get saved data from database
      const response = await apiClient.invoke<RiSpAnalysisData>('get-ri-sp-analysis', {
        body: { accountId: selectedAccountId, includeHistory: false }
      });
      
      if (response.error) {
        console.error('❌ Error fetching RI/SP analysis:', response.error);
        throw new Error(response.error.message);
      }
      
      console.log('✅ RI/SP analysis loaded from database:', {
        hasData: response.data?.hasData,
        riCount: response.data?.reservedInstances?.total,
        spCount: response.data?.savingsPlans?.total,
        recommendationsCount: Array.isArray(response.data?.recommendations) ? response.data.recommendations.length : 0
      });
      
      return response.data;
    },
  });

  // Refresh mutation - runs NEW analysis and saves to database
  // In demo mode, just show a toast
  const refreshMutation = useMutation<RiSpAnalysisData>({
    mutationFn: async () => {
      if (isInDemoMode) {
        // In demo mode, just return the current data
        toast({
          title: "Modo Demo",
          description: "No modo demo, os dados são exemplos. Conecte uma conta cloud para análises reais.",
        });
        return analysisData || {} as RiSpAnalysisData;
      }
      
      console.log('🔄 Running NEW RI/SP analysis...');
      
      const lambdaName = isAzure ? 'azure-reservations-analyzer' : 'ri-sp-analyzer';
      const bodyParam = isAzure 
        ? { credentialId: selectedAccountId, lookbackDays: 30 }
        : { accountId: selectedAccountId, analysisType: 'all', lookbackDays: 30, regions: accountRegions };
      
      // Run analysis (Lambda will automatically save to database)
      const result = await apiClient.invoke<RiSpAnalysisData>(lambdaName, {
        body: bodyParam
      });
      
      if (result.error) {
        throw new Error(result.error.message);
      }
      
      console.log('✅ New analysis completed and saved to database');
      return result.data;
    },
    onSuccess: (data) => {
      if (isInDemoMode) return; // Don't update cache in demo mode
      
      // Update the query cache directly with the new data
      queryClient.setQueryData(['ri-sp-analysis', organizationId, selectedAccountId, selectedProvider, accountRegions, 'demo', isInDemoMode], data);
      // Invalidate history to refresh it
      queryClient.invalidateQueries({ queryKey: ['ri-sp-history', organizationId, selectedAccountId] });
      toast({
        title: "Análise Atualizada",
        description: `Dados de Reserved Instances e Savings Plans atualizados para ${accountRegions.length} região(ões).`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro na Atualização",
        description: error.message || "Falha ao atualizar análise de RI/SP.",
        variant: "destructive",
      });
    },
  });

  // Fetch analysis history - not available in demo mode
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['ri-sp-history', organizationId, selectedAccountId, 'demo', isInDemoMode],
    enabled: shouldEnableAccountQuery() && activeTab === 'history' && !isInDemoMode,
    staleTime: 5 * 60 * 1000, // 5 minutes
    queryFn: async () => {
      if (isInDemoMode) return []; // No history in demo mode
      
      const response = await apiClient.invoke('list-ri-sp-history', {
        body: { accountId: selectedAccountId, limit: 30 }
      });
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      return response.data;
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Normalize data from Lambda response format
  const ri = analysisData?.reservedInstances;
  const sp = analysisData?.savingsPlans;
  const recommendations = analysisData?.recommendations;
  
  // Calculate counts from Lambda response format
  const riCount = ri?.total ?? ri?.count ?? 0;
  const spCount = sp?.total ?? sp?.count ?? 0;
  const recommendationsCount = Array.isArray(recommendations) ? recommendations.length : (recommendations?.count ?? 0);
  
  // Get recommendations array (normalize both formats)
  const recommendationsArray = Array.isArray(recommendations) 
    ? recommendations 
    : (recommendations?.topRecommendations ?? []);
  
  // Get total potential savings
  const totalPotentialAnnualSavings = analysisData?.potentialSavings?.annual ?? 
    (Array.isArray(recommendations) 
      ? recommendations.reduce((sum: number, r: any) => sum + (r.potentialSavings?.annual || r.annualSavings || 0), 0)
      : (recommendations?.totalPotentialAnnualSavings ?? 0));

  // Verificar se os dados foram realmente analisados
  // Usar o campo hasData do backend como fonte de verdade
  const hasRealData = analysisData?.hasData === true || (
    analysisData && (
      riCount > 0 || 
      spCount > 0 || 
      recommendationsCount > 0
    )
  );

  console.log('📊 Data check:', {
    hasData: analysisData?.hasData,
    hasRealData,
    riCount,
    spCount,
    recommendationsCount,
    analyzedAt: analysisData?.analyzedAt
  });

  // Se não há dados reais, mostrar instruções para primeira execução
  if (!isLoading && !hasRealData) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Reserved Instances & Savings Plans
                </CardTitle>
                <CardDescription>
                  Análise de utilização, cobertura e recomendações de otimização
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-amber-900">Primeira Execução Necessária</CardTitle>
            </div>
            <CardDescription className="text-amber-700">
              As rotinas de análise de Reserved Instances e Savings Plans ainda não foram executadas para esta conta AWS.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <h4 className="font-semibold text-amber-900">Para executar a análise pela primeira vez:</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-amber-800">
                <li>Clique no botão "Executar Análise" abaixo</li>
                <li>Aguarde o processamento (pode levar alguns minutos)</li>
                <li>Os dados de utilização e recomendações serão coletados da AWS</li>
                <li>A análise será atualizada automaticamente a cada execução</li>
              </ol>
            </div>
            
            <div className="pt-4 border-t border-amber-200">
              <Button 
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                {refreshMutation.isPending ? 'Executando Análise...' : 'Executar Análise'}
              </Button>
            </div>

            <div className="text-xs text-amber-600 bg-amber-100 p-3 rounded-lg">
              <strong>Nota:</strong> A primeira execução pode demorar mais tempo pois precisa coletar dados históricos 
              de utilização dos últimos 30 dias da AWS Cost Explorer.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Reserved Instances & Savings Plans
              </CardTitle>
              <CardDescription>
                Análise de utilização, cobertura e recomendações de otimização
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Reserved Instances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{riCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {ri?.active || riCount} ativas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Savings Plans
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{spCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {sp?.active || spCount} ativos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Economia Mensal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-green-600">
              ${((ri?.totalMonthlySavings || 0) + (sp?.totalMonthlySavings || 0) + (analysisData?.potentialSavings?.monthly || 0)).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Economia atual
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Potencial Adicional
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-blue-600">
              ${(totalPotentialAnnualSavings / 12).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {recommendationsCount} recomendações
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="ri">Reserved Instances</TabsTrigger>
          <TabsTrigger value="sp">Savings Plans</TabsTrigger>
          <TabsTrigger value="recommendations">
            Recomendações
            {recommendationsCount > 0 && (
              <Badge variant="secondary" className="ml-2">{recommendationsCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* RI Utilization */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Utilização de RIs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Utilização Média</span>
                    <span className="text-sm font-semibold">{ri?.averageUtilization || 0}%</span>
                  </div>
                  <Progress value={ri?.averageUtilization || 0} />
                </div>
                
                {(ri?.underutilizedCount ?? 0) > 0 && (
                  <div className="flex items-center gap-2 text-sm text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                    <span>{ri?.underutilizedCount} RIs subutilizadas (&lt;75%)</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* SP Utilization */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Utilização de Savings Plans</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Utilização Média</span>
                    <span className="text-sm font-semibold">{sp?.averageUtilization || 0}%</span>
                  </div>
                  <Progress value={sp?.averageUtilization || 0} />
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Cobertura Média</span>
                    <span className="text-sm font-semibold">{sp?.averageCoverage || 0}%</span>
                  </div>
                  <Progress value={sp?.averageCoverage || 0} className="bg-blue-100" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Recommendations - Support both array format and topRecommendations format */}
          {recommendationsArray.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Recomendações</CardTitle>
                <CardDescription>
                  Maiores oportunidades de economia identificadas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recommendationsArray.slice(0, 5).map((rec: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                          rec.type === 'reserved_instance' || rec.type === 'ri_purchase' ? 'bg-purple-100' : 'bg-blue-100'
                        }`}>
                          {rec.type === 'reserved_instance' || rec.type === 'ri_purchase' ? (
                            <Clock className="h-4 w-4 text-purple-600" />
                          ) : (
                            <Zap className="h-4 w-4 text-blue-600" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-sm">
                            {rec.title || (rec.type === 'reserved_instance' ? 'Reserved Instance' : 'Savings Plan')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {rec.instanceType || rec.savingsPlanType || rec.service} • {rec.service}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-green-600">
                          ${(rec.potentialSavings?.annual || rec.annualSavings || 0).toFixed(2)}/ano
                        </div>
                        <Badge variant={rec.priority === 1 || rec.priority === 'critical' || rec.priority === 'high' ? 'default' : 'secondary'} className="text-xs">
                          {typeof rec.priority === 'string' ? rec.priority.toUpperCase() : `Prioridade ${rec.priority}`}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="ri" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Reserved Instances Ativas</CardTitle>
              <CardDescription>
                Detalhes de utilização e economia de suas Reserved Instances
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ri?.underutilized && ri.underutilized.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Tipo de Instância</TableHead>
                      <TableHead>Utilização</TableHead>
                      <TableHead>Desperdício Potencial</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ri.underutilized.map((instance: any) => (
                      <TableRow key={instance.id}>
                        <TableCell className="font-mono text-xs">{instance.id}</TableCell>
                        <TableCell>{instance.instanceType}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={instance.utilization} className="w-20" />
                            <span className="text-sm">{instance.utilization.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-amber-600 font-medium">
                          ${instance.potentialWaste.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {instance.utilization < 50 ? (
                            <Badge variant="destructive">Crítico</Badge>
                          ) : (
                            <Badge variant="secondary">Atenção</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : ri && riCount > 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                  <p>Todas as Reserved Instances estão bem utilizadas!</p>
                  <p className="text-sm mt-1">Utilização média: {ri.averageUtilization || analysisData?.coverage?.reservedInstances?.toFixed(1) || 0}%</p>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                  <p>Nenhuma Reserved Instance encontrada</p>
                  <p className="text-sm mt-1">Esta conta não possui Reserved Instances ativas</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sp" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Savings Plans Ativos</CardTitle>
              <CardDescription>
                Detalhes de utilização e cobertura de seus Savings Plans
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sp?.underutilized && sp.underutilized.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Utilização</TableHead>
                      <TableHead>Compromisso Não Usado</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sp.underutilized.map((plan: any) => (
                      <TableRow key={plan.id}>
                        <TableCell className="font-mono text-xs">{plan.id}</TableCell>
                        <TableCell>{plan.type}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={plan.utilization} className="w-20" />
                            <span className="text-sm">{plan.utilization.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-amber-600 font-medium">
                          ${plan.unusedCommitment.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {plan.utilization < 50 ? (
                            <Badge variant="destructive">Crítico</Badge>
                          ) : (
                            <Badge variant="secondary">Atenção</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : sp && spCount > 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                  <p>Todos os Savings Plans estão bem utilizados!</p>
                  <p className="text-sm mt-1">Utilização média: {sp.averageUtilization || analysisData?.coverage?.savingsPlans?.toFixed(1) || 0}% | Cobertura: {sp.averageCoverage || analysisData?.coverage?.overall?.toFixed(1) || 0}%</p>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Zap className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                  <p>Nenhum Savings Plan encontrado</p>
                  <p className="text-sm mt-1">Esta conta não possui Savings Plans ativos</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recomendações de Compra</CardTitle>
              <CardDescription>
                Oportunidades identificadas para otimizar custos com compromissos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recommendationsArray.length > 0 ? (
                <div className="space-y-4">
                  {recommendationsArray.map((rec: any, idx: number) => (
                    <Card key={idx} className="border-2">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant={rec.priority === 'critical' || rec.priority === 'high' || rec.priority === 1 ? 'default' : 'secondary'}>
                                {typeof rec.priority === 'string' ? rec.priority.toUpperCase() : `Prioridade ${rec.priority}`}
                              </Badge>
                              <Badge variant="outline">
                                {rec.type === 'reserved_instance' || rec.type === 'ri_purchase' ? 'Reserved Instance' : 
                                 rec.type === 'sp_purchase' ? 'Savings Plan' : rec.service || rec.type}
                              </Badge>
                            </div>
                            <h4 className="font-semibold">
                              {rec.title || rec.instanceType || rec.savingsPlanType}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {rec.description || `Serviço: ${rec.service}`}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-semibold text-green-600">
                              ${(rec.potentialSavings?.annual || rec.annualSavings || 0).toFixed(2)}
                            </div>
                            <p className="text-xs text-muted-foreground">economia anual</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  
                  <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="h-5 w-5 text-blue-600" />
                      <span className="font-semibold text-blue-900">Economia Total Potencial</span>
                    </div>
                    <div className="text-3xl font-semibold text-blue-600">
                      ${totalPotentialAnnualSavings.toFixed(2)}/ano
                    </div>
                    <p className="text-sm text-blue-700 mt-1">
                      Implementando todas as recomendações
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                  <p>Nenhuma recomendação no momento.</p>
                  <p className="text-sm mt-1">Seu uso atual está otimizado!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Histórico de Análises
              </CardTitle>
              <CardDescription>
                Acompanhe a evolução das suas Reserved Instances e Savings Plans ao longo do tempo
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : historyData?.history && historyData.history.length > 0 ? (
                <div className="space-y-3">
                  {historyData.history.map((entry: any, idx: number) => {
                    const prevEntry = historyData.history[idx + 1];
                    const utilizationChange = prevEntry 
                      ? ((entry.avgRiUtilization + entry.avgSpUtilization) / 2) - ((prevEntry.avgRiUtilization + prevEntry.avgSpUtilization) / 2)
                      : 0;
                    const savingsChange = prevEntry 
                      ? entry.totalSavings - prevEntry.totalSavings
                      : 0;

                    return (
                      <Card key={idx} className="border-2">
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between">
                            <div className="space-y-2 flex-1">
                              <div className="flex items-center gap-3">
                                <div className="text-sm font-medium text-muted-foreground">
                                  {new Date(entry.date).toLocaleDateString('pt-BR', {
                                    day: '2-digit',
                                    month: 'long',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </div>
                                {idx === 0 && (
                                  <Badge variant="default" className="text-xs">Mais recente</Badge>
                                )}
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                                <div>
                                  <div className="text-xs text-muted-foreground">RIs Ativas</div>
                                  <div className="text-lg font-semibold">{entry.activeRiCount}</div>
                                  <div className="text-xs text-muted-foreground">
                                    de {entry.riCount} total
                                  </div>
                                </div>

                                <div>
                                  <div className="text-xs text-muted-foreground">SPs Ativos</div>
                                  <div className="text-lg font-semibold">{entry.activeSpCount}</div>
                                  <div className="text-xs text-muted-foreground">
                                    de {entry.spCount} total
                                  </div>
                                </div>

                                <div>
                                  <div className="text-xs text-muted-foreground">Utilização Média</div>
                                  <div className="text-lg font-semibold flex items-center gap-1">
                                    {((entry.avgRiUtilization + entry.avgSpUtilization) / 2).toFixed(1)}%
                                    {utilizationChange !== 0 && (
                                      utilizationChange > 0 ? (
                                        <TrendingUp className="h-4 w-4 text-green-500" />
                                      ) : (
                                        <TrendingDown className="h-4 w-4 text-red-500" />
                                      )
                                    )}
                                  </div>
                                  {utilizationChange !== 0 && (
                                    <div className={`text-xs ${utilizationChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {utilizationChange > 0 ? '+' : ''}{utilizationChange.toFixed(1)}% vs anterior
                                    </div>
                                  )}
                                </div>

                                <div>
                                  <div className="text-xs text-muted-foreground">Economia Total</div>
                                  <div className="text-lg font-semibold text-green-600 flex items-center gap-1">
                                    ${(entry.totalSavings / 12).toFixed(2)}/mês
                                    {savingsChange !== 0 && (
                                      savingsChange > 0 ? (
                                        <TrendingUp className="h-4 w-4 text-green-500" />
                                      ) : (
                                        <TrendingDown className="h-4 w-4 text-red-500" />
                                      )
                                    )}
                                  </div>
                                  {savingsChange !== 0 && (
                                    <div className={`text-xs ${savingsChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {savingsChange > 0 ? '+' : ''}${(savingsChange / 12).toFixed(2)}/mês
                                    </div>
                                  )}
                                </div>
                              </div>

                              {entry.recommendationsCount > 0 && (
                                <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                  <div className="flex items-center justify-between">
                                    <div className="text-sm font-medium text-blue-900">
                                      {entry.recommendationsCount} recomendações ativas
                                    </div>
                                    <div className="text-sm font-semibold text-blue-600">
                                      Potencial: ${(entry.potentialSavings / 12).toFixed(2)}/mês
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                  <p>Nenhum histórico disponível</p>
                  <p className="text-sm mt-1">Execute uma análise para começar a rastrear o histórico</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
