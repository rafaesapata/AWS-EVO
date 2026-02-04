import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  TrendingDown,
  ExternalLink,
  Copy,
  ChevronRight,
  Server,
  Database,
  Info,
  LucideIcon
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

// Constants for recommendation types
const RECOMMENDATION_TYPES = {
  RESERVED_INSTANCE: 'reserved_instance',
  RI_PURCHASE: 'ri_purchase',
  SP_PURCHASE: 'sp_purchase',
  RIGHT_SIZING: 'right_sizing',
  SPOT_INSTANCES: 'spot_instances',
} as const;

// Helper to get icon and color for recommendation type
const getRecommendationStyle = (type: string): { icon: LucideIcon; bgColor: string; iconColor: string } => {
  switch (type) {
    case RECOMMENDATION_TYPES.RESERVED_INSTANCE:
    case RECOMMENDATION_TYPES.RI_PURCHASE:
      return { icon: Clock, bgColor: 'bg-purple-100', iconColor: 'text-purple-600' };
    case RECOMMENDATION_TYPES.RIGHT_SIZING:
      return { icon: TrendingDown, bgColor: 'bg-amber-100', iconColor: 'text-amber-600' };
    case RECOMMENDATION_TYPES.SPOT_INSTANCES:
      return { icon: TrendingUp, bgColor: 'bg-green-100', iconColor: 'text-green-600' };
    default:
      return { icon: Zap, bgColor: 'bg-blue-100', iconColor: 'text-blue-600' };
  }
};

// Helper to format currency
const formatCurrency = (value: number, decimals = 0): string => {
  return value.toLocaleString('en-US', { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
};

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
  const [selectedRecommendation, setSelectedRecommendation] = useState<any>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Copy to clipboard helper
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado!",
      description: "Texto copiado para a área de transferência",
    });
  };
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
      console.log('🔄 Fetching RI/SP analysis...', {
        organizationId,
        selectedAccountId,
        selectedProvider,
        isAzure,
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
      
      // For Azure, call azure-reservations-analyzer directly
      if (isAzure) {
        console.log('🔵 Fetching Azure reservations analysis...');
        const response = await apiClient.invoke<any>('azure-reservations-analyzer', {
          body: { credentialId: selectedAccountId, includeRecommendations: true }
        });
        
        if (response.error) {
          console.error('❌ Error fetching Azure reservations:', response.error);
          throw new Error(response.error.message);
        }
        
        // Transform Azure response to match RiSpAnalysisData format
        const azureData = response.data;
        const transformedData: RiSpAnalysisData = {
          success: true,
          hasData: (azureData?.reservations?.length > 0) || (azureData?.recommendations?.length > 0),
          analyzedAt: new Date().toISOString(),
          executiveSummary: {
            status: azureData?.reservations?.length > 0 ? 'analyzed' : 'no_data',
            totalCommitments: azureData?.summary?.totalReservations || 0,
            coverageScore: azureData?.summary?.averageUtilization || 0,
            potentialAnnualSavings: (azureData?.summary?.totalMonthlySavings || 0) * 12,
            recommendationsSummary: {
              total: azureData?.recommendations?.length || 0,
              critical: azureData?.recommendations?.filter((r: any) => r.priority === 'high').length || 0,
              high: azureData?.recommendations?.filter((r: any) => r.priority === 'medium').length || 0,
              quickWins: azureData?.recommendations?.filter((r: any) => r.type === 'NEW_PURCHASE').length || 0,
            },
          },
          reservedInstances: {
            total: azureData?.summary?.totalReservations || 0,
            count: azureData?.summary?.totalReservations || 0,
            active: azureData?.reservations?.length || 0,
            averageUtilization: azureData?.summary?.averageUtilization || 0,
            totalMonthlySavings: azureData?.summary?.totalMonthlySavings || 0,
            underutilized: azureData?.reservations?.filter((r: any) => (r.utilizationPercentage || 0) < 75).map((r: any) => ({
              id: r.id,
              instanceType: r.skuName,
              utilization: r.utilizationPercentage || 0,
              potentialWaste: (100 - (r.utilizationPercentage || 0)) * r.quantity * 0.5,
            })) || [],
            underutilizedCount: azureData?.summary?.byUtilization?.low || 0,
          },
          savingsPlans: {
            total: 0, // Azure doesn't have Savings Plans, only Reserved Instances
            count: 0,
            active: 0,
            averageUtilization: 0,
            averageCoverage: 0,
            totalMonthlySavings: 0,
            underutilized: [],
          },
          recommendations: azureData?.recommendations?.map((rec: any) => ({
            type: rec.type === 'NEW_PURCHASE' ? 'reserved_instance' : rec.type,
            service: rec.resourceType || 'Azure',
            instanceType: rec.skuName,
            priority: rec.priority === 'high' ? 1 : rec.priority === 'medium' ? 2 : 3,
            potentialSavings: {
              monthly: rec.estimatedSavings || rec.potentialSavings || 0,
              annual: (rec.estimatedSavings || rec.potentialSavings || 0) * 12,
            },
            annualSavings: (rec.estimatedSavings || rec.potentialSavings || 0) * 12,
            title: rec.recommendation,
            description: rec.recommendation,
          })) || [],
          coverage: {
            reservedInstances: azureData?.summary?.averageUtilization || 0,
            savingsPlans: 0,
            overall: azureData?.summary?.averageUtilization || 0,
          },
          potentialSavings: {
            monthly: azureData?.summary?.totalMonthlySavings || 0,
            annual: (azureData?.summary?.totalMonthlySavings || 0) * 12,
          },
          analysisMetadata: {
            analysisDepth: 'full',
            region: 'Azure',
            timestamp: new Date().toISOString(),
            accountId: selectedAccountId,
          },
        };
        
        console.log('✅ Azure RI analysis loaded:', {
          hasData: transformedData.hasData,
          reservationsCount: azureData?.reservations?.length || 0,
          recommendationsCount: azureData?.recommendations?.length || 0,
        });
        
        return transformedData;
      }
      
      // For AWS, get saved data from database
      const response = await apiClient.invoke<RiSpAnalysisData>('get-ri-sp-analysis', {
        body: { accountId: selectedAccountId, includeHistory: false }
      });
      
      if (response.error) {
        console.error('❌ Error fetching RI/SP analysis:', response.error);
        throw new Error(response.error.message);
      }
      
      console.log('✅ AWS RI/SP analysis loaded from database:', {
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

  // Show message when no specific account is selected
  if (!selectedAccountId || selectedAccountId === 'all') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Reserved Instances & Savings Plans
          </CardTitle>
          <CardDescription>
            Selecione uma conta específica no header para ver a análise de RI/SP
          </CardDescription>
        </CardHeader>
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

  // Helper function to get default implementation steps based on recommendation type
  const getDefaultSteps = (type: string): string[] => {
    switch (type) {
      case RECOMMENDATION_TYPES.RI_PURCHASE:
      case RECOMMENDATION_TYPES.RESERVED_INSTANCE:
        return [
          'Acesse o AWS Cost Explorer em console.aws.amazon.com/cost-management',
          'Navegue até "Reservations" > "Recommendations" no menu lateral',
          'Analise as recomendações baseadas no seu histórico de uso (30-60 dias)',
          'Escolha entre Standard RI (maior desconto, menos flexível) ou Convertible RI (menor desconto, mais flexível)',
          'Selecione o termo: 1 ano (menor compromisso) ou 3 anos (maior desconto)',
          'Escolha a opção de pagamento: No Upfront, Partial Upfront ou All Upfront',
          'Revise o resumo e confirme a compra',
          'Configure alertas de utilização de RI no CloudWatch para monitorar o uso'
        ];
      case RECOMMENDATION_TYPES.SP_PURCHASE:
        return [
          'Acesse o AWS Cost Management em console.aws.amazon.com/cost-management',
          'Navegue até "Savings Plans" > "Recommendations"',
          'Revise as recomendações automáticas baseadas no seu uso',
          'Escolha o tipo: Compute SP (mais flexível, cobre EC2, Lambda, Fargate) ou EC2 Instance SP (maior desconto, menos flexível)',
          'Defina o commitment por hora (recomendado: 70-80% do uso médio)',
          'Selecione o termo: 1 ano ou 3 anos',
          'Escolha a opção de pagamento',
          'Confirme a compra e monitore a utilização mensalmente'
        ];
      case RECOMMENDATION_TYPES.RIGHT_SIZING:
        return [
          'Acesse o AWS Compute Optimizer em console.aws.amazon.com/compute-optimizer',
          'Revise as recomendações de right-sizing para suas instâncias',
          'Analise as métricas de CPU, memória e rede no CloudWatch (últimos 14 dias)',
          'Identifique instâncias com utilização consistentemente baixa (<20%)',
          'Crie um snapshot/AMI da instância antes de fazer alterações',
          'Teste o novo tipo de instância em ambiente de staging primeiro',
          'Agende a mudança para um período de baixo tráfego',
          'Monitore a performance após a mudança por pelo menos 1 semana'
        ];
      case RECOMMENDATION_TYPES.SPOT_INSTANCES:
        return [
          'Identifique workloads tolerantes a interrupções (dev, test, batch processing)',
          'Acesse o EC2 Console e navegue até "Spot Requests"',
          'Configure um Spot Fleet com múltiplos tipos de instância para maior disponibilidade',
          'Defina o preço máximo (recomendado: preço On-Demand para evitar interrupções frequentes)',
          'Implemente tratamento de interrupções (AWS envia aviso 2 minutos antes)',
          'Use Auto Scaling Groups com mixed instances (On-Demand + Spot)',
          'Configure CloudWatch Alarms para monitorar interrupções',
          'Considere usar Spot Blocks para workloads com duração definida (1-6 horas)'
        ];
      default:
        return [
          'Acesse o AWS Cost Management Console',
          'Revise as recomendações de otimização',
          'Analise o impacto potencial antes de implementar',
          'Implemente as mudanças em ambiente de teste primeiro',
          'Monitore os resultados após a implementação'
        ];
    }
  };

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
              <CardTitle className="text-amber-900">
                {isAzure ? 'Análise Azure Necessária' : 'Primeira Execução Necessária'}
              </CardTitle>
            </div>
            <CardDescription className="text-amber-700">
              {isAzure 
                ? 'As rotinas de análise de Azure Reserved Instances ainda não foram executadas para esta subscription.'
                : 'As rotinas de análise de Reserved Instances e Savings Plans ainda não foram executadas para esta conta AWS.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <h4 className="font-semibold text-amber-900">Para executar a análise pela primeira vez:</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-amber-800">
                <li>Clique no botão "Executar Análise" abaixo</li>
                <li>Aguarde o processamento (pode levar alguns minutos)</li>
                <li>
                  {isAzure 
                    ? 'Os dados de reservas e recomendações serão coletados do Azure Advisor'
                    : 'Os dados de utilização e recomendações serão coletados da AWS'}
                </li>
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
              <strong>Nota:</strong> {isAzure 
                ? 'Azure Reserved Instances são compradas no nível da conta de cobrança. As recomendações vêm do Azure Advisor.'
                : 'A primeira execução pode demorar mais tempo pois precisa coletar dados históricos de utilização dos últimos 30 dias da AWS Cost Explorer.'}
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
                  Maiores oportunidades de economia identificadas • Clique para ver detalhes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recommendationsArray.slice(0, 5).map((rec: any, idx: number) => {
                    // Format subtitle with useful info
                    const getSubtitle = () => {
                      const parts: string[] = [];
                      if (rec.service) parts.push(rec.service);
                      if (rec.implementation?.difficulty) {
                        const difficultyMap: Record<string, string> = {
                          'easy': 'Fácil',
                          'medium': 'Médio',
                          'hard': 'Difícil'
                        };
                        parts.push(`Implementação: ${difficultyMap[rec.implementation.difficulty] || rec.implementation.difficulty}`);
                      }
                      if (rec.implementation?.timeToImplement) {
                        parts.push(rec.implementation.timeToImplement);
                      }
                      return parts.join(' • ') || rec.description?.substring(0, 80) || '';
                    };
                    
                    const { icon: RecIcon, bgColor, iconColor } = getRecommendationStyle(rec.type);
                    const annualSavings = rec.potentialSavings?.annual || rec.annualSavings || 0;
                    const monthlySavings = rec.potentialSavings?.monthly || annualSavings / 12;
                    
                    return (
                      <div 
                        key={idx} 
                        className="flex items-start justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                        onClick={() => {
                          setSelectedRecommendation(rec);
                          setIsDetailModalOpen(true);
                        }}
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`p-2 rounded-full shrink-0 ${bgColor}`}>
                            <RecIcon className={`h-4 w-4 ${iconColor}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm flex items-center gap-2">
                              {rec.title || (rec.type === RECOMMENDATION_TYPES.RESERVED_INSTANCE ? 'Reserved Instance' : 'Savings Plan')}
                              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {getSubtitle()}
                            </div>
                            {rec.description && (
                              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {rec.description}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <div className="font-semibold text-green-600">
                            ${formatCurrency(annualSavings)}/ano
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ${formatCurrency(monthlySavings)}/mês
                          </div>
                          <Badge variant={rec.priority === 1 || rec.priority === 'critical' || rec.priority === 'high' ? 'default' : 'secondary'} className="text-xs mt-1">
                            {typeof rec.priority === 'string' ? rec.priority.toUpperCase() : `P${rec.priority}`}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommendation Detail Modal */}
          <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
            <DialogContent className="max-w-3xl max-h-[90vh]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => {
                    const { icon: ModalIcon, iconColor } = getRecommendationStyle(selectedRecommendation?.type);
                    return <ModalIcon className={`h-5 w-5 ${iconColor}`} />;
                  })()}
                  {selectedRecommendation?.title || 'Detalhes da Recomendação'}
                </DialogTitle>
                <DialogDescription>
                  {selectedRecommendation?.description}
                </DialogDescription>
              </DialogHeader>
              
              <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
                <div className="space-y-6">
                  {/* Savings Summary */}
                  <div className="grid grid-cols-3 gap-4">
                    <Card className="bg-green-50 border-green-200">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-green-600">
                          ${formatCurrency(selectedRecommendation?.potentialSavings?.annual || selectedRecommendation?.annualSavings || 0)}
                        </div>
                        <div className="text-xs text-green-700">Economia Anual</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-blue-50 border-blue-200">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-blue-600">
                          ${formatCurrency(selectedRecommendation?.potentialSavings?.monthly || (selectedRecommendation?.annualSavings || 0) / 12)}
                        </div>
                        <div className="text-xs text-blue-700">Economia Mensal</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-purple-50 border-purple-200">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-purple-600">
                          {selectedRecommendation?.potentialSavings?.percentage || 31}%
                        </div>
                        <div className="text-xs text-purple-700">Redução de Custo</div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Affected Instances */}
                  {(selectedRecommendation?.details?.currentInstances?.length > 0 || 
                    selectedRecommendation?.details?.underutilizedInstances?.length > 0 ||
                    selectedRecommendation?.details?.currentDatabases?.length > 0) && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Server className="h-4 w-4" />
                          Recursos Afetados
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-lg border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead className="text-xs">ID</TableHead>
                                <TableHead className="text-xs">Tipo</TableHead>
                                <TableHead className="text-xs">CPU</TableHead>
                                <TableHead className="text-xs text-right">Custo/Mês</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(selectedRecommendation?.details?.currentInstances || 
                                selectedRecommendation?.details?.underutilizedInstances || 
                                []).slice(0, 10).map((instance: any, idx: number) => (
                                <TableRow key={idx}>
                                  <TableCell className="font-mono text-xs py-2">
                                    <div className="flex items-center gap-1">
                                      {instance.instanceId?.substring(0, 19) || instance.identifier || '-'}
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-5 w-5 p-0"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyToClipboard(instance.instanceId || instance.identifier || '');
                                        }}
                                      >
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs py-2">{instance.instanceType || instance.instanceClass || '-'}</TableCell>
                                  <TableCell className="py-2">
                                    <div className="flex items-center gap-2">
                                      <Progress value={instance.cpuUtilization || 0} className="w-12 h-2" />
                                      <span className="text-xs">{(instance.cpuUtilization || 0).toFixed(0)}%</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs text-right py-2">
                                    ${(instance.monthlyCost || 0).toFixed(2)}
                                  </TableCell>
                                </TableRow>
                              ))}
                              {(selectedRecommendation?.details?.currentDatabases || []).slice(0, 10).map((db: any, idx: number) => (
                                <TableRow key={`db-${idx}`}>
                                  <TableCell className="font-mono text-xs py-2">
                                    <div className="flex items-center gap-1">
                                      <Database className="h-3 w-3 text-muted-foreground" />
                                      {db.identifier?.substring(0, 19) || '-'}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs py-2">{db.instanceClass || '-'}</TableCell>
                                  <TableCell className="py-2">
                                    <div className="flex items-center gap-2">
                                      <Progress value={db.cpuUtilization || 0} className="w-12 h-2" />
                                      <span className="text-xs">{(db.cpuUtilization || 0).toFixed(0)}%</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs text-right py-2">
                                    ${(db.monthlyCost || 0).toFixed(2)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        {((selectedRecommendation?.details?.currentInstances?.length || 0) > 10 ||
                          (selectedRecommendation?.details?.underutilizedInstances?.length || 0) > 10) && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Mostrando 10 de {selectedRecommendation?.details?.currentInstances?.length || 
                              selectedRecommendation?.details?.underutilizedInstances?.length} recursos
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Implementation Steps */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        Tutorial de Implementação
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Siga os passos abaixo para implementar esta recomendação
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {(selectedRecommendation?.implementation?.steps || getDefaultSteps(selectedRecommendation?.type)).map((step: string, idx: number) => (
                          <div key={idx} className="flex gap-3 items-start">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">
                              {idx + 1}
                            </div>
                            <div className="flex-1 pt-0.5">
                              <p className="text-sm">{step}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* AWS Console Links */}
                  <Card className="bg-amber-50 border-amber-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
                        <ExternalLink className="h-4 w-4" />
                        Links Úteis
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selectedRecommendation?.type === RECOMMENDATION_TYPES.RI_PURCHASE || selectedRecommendation?.type === RECOMMENDATION_TYPES.RESERVED_INSTANCE ? (
                        <>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full justify-start text-amber-800 border-amber-300 hover:bg-amber-100"
                            onClick={() => window.open('https://console.aws.amazon.com/cost-management/home#/ri/recommendations', '_blank')}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            AWS Cost Explorer - Recomendações de RI
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full justify-start text-amber-800 border-amber-300 hover:bg-amber-100"
                            onClick={() => window.open('https://console.aws.amazon.com/ec2/home#ReservedInstances:', '_blank')}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            EC2 Console - Reserved Instances
                          </Button>
                        </>
                      ) : selectedRecommendation?.type === RECOMMENDATION_TYPES.SP_PURCHASE ? (
                        <>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full justify-start text-amber-800 border-amber-300 hover:bg-amber-100"
                            onClick={() => window.open('https://console.aws.amazon.com/cost-management/home#/savings-plans/recommendations', '_blank')}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            AWS Cost Management - Savings Plans
                          </Button>
                        </>
                      ) : selectedRecommendation?.type === RECOMMENDATION_TYPES.RIGHT_SIZING ? (
                        <>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full justify-start text-amber-800 border-amber-300 hover:bg-amber-100"
                            onClick={() => window.open('https://console.aws.amazon.com/compute-optimizer/home#/recommendations', '_blank')}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            AWS Compute Optimizer
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full justify-start text-amber-800 border-amber-300 hover:bg-amber-100"
                            onClick={() => window.open('https://console.aws.amazon.com/cloudwatch/home#metricsV2:', '_blank')}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            CloudWatch Metrics
                          </Button>
                        </>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full justify-start text-amber-800 border-amber-300 hover:bg-amber-100"
                          onClick={() => window.open('https://console.aws.amazon.com/cost-management/home', '_blank')}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          AWS Cost Management Console
                        </Button>
                      )}
                    </CardContent>
                  </Card>

                  {/* Additional Info */}
                  <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                    <div className="text-xs text-blue-800">
                      <strong>Dica:</strong> Antes de comprar Reserved Instances ou Savings Plans, analise o histórico de uso dos últimos 30-60 dias para garantir que o compromisso seja adequado ao seu padrão de consumo.
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
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
                                {rec.type === RECOMMENDATION_TYPES.RESERVED_INSTANCE || rec.type === RECOMMENDATION_TYPES.RI_PURCHASE ? 'Reserved Instance' : 
                                 rec.type === RECOMMENDATION_TYPES.SP_PURCHASE ? 'Savings Plan' : rec.service || rec.type}
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
