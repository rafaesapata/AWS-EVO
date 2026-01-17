import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Calendar, 
  Download, 
  TrendingUp, 
  TrendingDown, 
  FileText,
  RefreshCw
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrganization } from "@/hooks/useOrganization";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { compareDates, getDayOfMonth } from "@/lib/utils";
import { Layout } from "@/components/Layout";

// Define type for daily cost records
interface DailyCostRecord {
  id: string;
  organization_id: string;
  aws_account_id: string;
  date: string;
  service: string;
  cost: number;
  usage?: number;
  currency?: string;
  created_at?: string;
}

// Define type for monthly aggregated data
interface MonthlyData {
  monthKey: string;
  totalCost: number;
  totalCredits: number;
  netCost: number;
  days: number;
  serviceBreakdown: Record<string, number>;
  dailyCosts: Array<{
    cost_date: string;
    total_cost: number;
    net_cost: number;
    credits_used?: number;
    service?: string;
  }>;
}

export const MonthlyInvoicesPage = () => {
  const { i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: organizationId } = useOrganization();
  const { selectedAccountId, selectedAccount, accounts: allAccounts, selectedProvider } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const hasSyncedRef = useRef<string | null>(null); // Track which account we've synced
  
  const currentLocale = i18n.language === 'pt' ? 'pt-BR' : i18n.language === 'es' ? 'es-ES' : 'en-US';

  // Sync costs from cloud provider - supports both AWS and Azure
  const syncCostsFromCloud = useCallback(async (accountId: string) => {
    if (isSyncing || !accountId) return;
    
    setIsSyncing(true);
    
    try {
      // Use provider from context for consistency
      const isAzure = selectedProvider === 'AZURE';

      if (isAzure) {
        // Azure: Call azure-fetch-costs Lambda
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const response = await apiClient.invoke<{
          success?: boolean;
          summary?: {
            totalCost: number;
            recordCount: number;
            savedCount: number;
            skippedCount: number;
          };
        }>('azure-fetch-costs', {
          body: {
            credentialId: accountId,
            startDate,
            endDate,
            granularity: 'DAILY',
          }
        });

        if (response.error) {
          console.error('Error syncing Azure costs:', response.error);
          return;
        }

        const summary = response.data?.summary;
        
        // Only show toast and refresh if new data was found
        if (summary && summary.savedCount > 0) {
          toast({
            title: '✅ Novos dados Azure sincronizados',
            description: `${summary.savedCount} novos registros de custos carregados`,
          });
          
          // Invalidate cache to reload data from database
          await queryClient.invalidateQueries({ 
            queryKey: ['monthly-invoices-data', organizationId, accountId] 
          });
        }
      } else {
        // AWS: Call fetch-daily-costs Lambda with incremental=true
        const response = await apiClient.invoke<{
          success: boolean;
          summary: {
            totalRecords: number;
            newRecords: number;
            skippedDays: number;
            uniqueDates: number;
            incremental: boolean;
          };
        }>('fetch-daily-costs', {
          body: {
            accountId: accountId,
            incremental: true, // Lambda will fetch only missing days
          }
        });

        if (response.error) {
          console.error('Error syncing costs:', response.error);
          return;
        }

        const summary = response.data?.summary;
        
        // Only show toast and refresh if new data was found
        if (summary && summary.newRecords > 0) {
          toast({
            title: '✅ Novos dados sincronizados',
            description: `${summary.newRecords} novos registros de custos carregados`,
          });
          
          // Invalidate cache to reload data from database
          await queryClient.invalidateQueries({ 
            queryKey: ['monthly-invoices-data', organizationId, accountId] 
          });
        }
      }
    } catch (error) {
      console.error('Error syncing costs from cloud:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, organizationId, queryClient, toast, selectedProvider]);

  // Get all daily costs from organization
  const { data: allCosts, isLoading: isLoadingCosts } = useQuery({
    queryKey: ['monthly-invoices-data', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.select<DailyCostRecord>('daily_costs', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          ...getAccountFilter() // Multi-cloud compatible
        },
        order: { column: 'date', ascending: false },
        limit: 50000 // Ensure we get all cost records (default is 1000)
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data || [];
    },
  });

  // Auto-sync on page load when account is selected (only once per account)
  useEffect(() => {
    if (selectedAccountId && organizationId && hasSyncedRef.current !== selectedAccountId) {
      hasSyncedRef.current = selectedAccountId;
      syncCostsFromCloud(selectedAccountId);
    }
  }, [selectedAccountId, organizationId, syncCostsFromCloud]);

  // Process monthly data from daily costs
  // Schema: id, organization_id, aws_account_id, date, service, cost, usage, currency
  const monthlyData: Record<string, MonthlyData> = (allCosts || []).reduce((acc: Record<string, MonthlyData & { _daysSet?: Set<string> }>, cost: DailyCostRecord) => {
    // Skip records without valid date
    if (!cost.date) return acc;
    
    // date can be a Date object or ISO string
    const dateStr = typeof cost.date === 'string' ? cost.date : new Date(cost.date).toISOString();
    const monthKey = dateStr.substring(0, 7); // YYYY-MM format
    
    if (!acc[monthKey]) {
      acc[monthKey] = {
        monthKey,
        totalCost: 0,
        totalCredits: 0,
        netCost: 0,
        days: 0,
        serviceBreakdown: {},
        dailyCosts: [],
        _daysSet: new Set<string>()
      };
    }

    const costValue = Number(cost.cost) || 0;
    acc[monthKey].totalCost += costValue;
    acc[monthKey].netCost += costValue; // No credits in current schema
    acc[monthKey]._daysSet!.add(dateStr.substring(0, 10)); // Count unique days
    acc[monthKey].dailyCosts.push({
      cost_date: dateStr,
      total_cost: costValue,
      net_cost: costValue,
      service: cost.service
    });

    // Aggregate by service
    if (cost.service) {
      acc[monthKey].serviceBreakdown[cost.service] = 
        (acc[monthKey].serviceBreakdown[cost.service] || 0) + costValue;
    }

    return acc;
  }, {} as Record<string, MonthlyData & { _daysSet?: Set<string> }>);

  // Convert days Set to count
  Object.values(monthlyData).forEach((data: MonthlyData & { _daysSet?: Set<string> }) => {
    data.days = data._daysSet?.size || 0;
    delete data._daysSet;
  });

  const sortedMonths = Object.keys(monthlyData).sort((a, b) => b.localeCompare(a));
  
  // Set default selected month to the most recent
  if (!selectedMonth && sortedMonths.length > 0) {
    setSelectedMonth(sortedMonths[0]);
  }

  const selectedMonthData: MonthlyData | null = selectedMonth ? monthlyData[selectedMonth] : null;

  // Prepare chart data for month comparison
  const monthComparisonData = sortedMonths.slice(0, 12).reverse().map(month => {
    const data = monthlyData[month];
    const [year, monthNum] = month.split('-');
    const monthName = new Date(parseInt(year), parseInt(monthNum) - 1).toLocaleDateString(currentLocale, { month: 'short' });
    
    return {
      month: monthName,
      total: data.totalCost,
      credits: data.totalCredits,
      net: data.netCost,
    };
  });

  // Prepare service breakdown for pie chart
  const servicePieData = selectedMonthData 
    ? Object.entries(selectedMonthData.serviceBreakdown)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 10)
        .map(([service, value]) => ({
          name: service.replace('Amazon ', '').replace('AWS ', ''),
          value: value as number,
        }))
    : [];

  const COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#a855f7'
  ];

  // Export invoice
  const exportInvoice = (monthKey: string) => {
    const data = monthlyData[monthKey as keyof typeof monthlyData];
    if (!data) return;

    const [year, month] = monthKey.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString(currentLocale, { month: 'long', year: 'numeric' });

    const csvContent = [
      `Fatura AWS - ${monthName}`,
      '',
      'Resumo',
      `Custo Total,${data.totalCost.toFixed(2)}`,
      `Créditos,${data.totalCredits.toFixed(2)}`,
      `Custo Líquido,${data.netCost.toFixed(2)}`,
      `Dias,${data.days}`,
      `Custo Médio/Dia,${(data.netCost / data.days).toFixed(2)}`,
      '',
      'Breakdown por Serviço',
      'Serviço,Custo',
      ...Object.entries(data.serviceBreakdown)
        .sort(([,a], [,b]) => b - a)
        .map(([service, value]) => `${service},${value.toFixed(2)}`),
      '',
      'Custos Diários',
      'Data,Custo Total,Créditos,Custo Líquido',
      ...data.dailyCosts
        .sort((a, b) => compareDates(a.cost_date, b.cost_date))
        .map(cost => `${cost.cost_date},${cost.total_cost},${cost.credits_used || 0},${cost.net_cost || cost.total_cost}`)
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `fatura_aws_${monthKey}.csv`;
    link.click();
  };

  const loadHistoricalData = async (forceFullRefresh = false) => {
    setIsLoadingHistory(true);
    try {
      // Use provider from context for consistency
      const isAzure = selectedProvider === 'AZURE';
      const providerName = isAzure ? 'Azure' : 'AWS';

      toast({
        title: forceFullRefresh ? 'Recarregando todos os dados...' : 'Atualizando custos...',
        description: forceFullRefresh 
          ? `Buscando histórico completo de custos ${providerName}` 
          : `Buscando apenas novos dados ${providerName} (incremental)`,
      });

      if (isAzure) {
        // Azure: Call azure-fetch-costs Lambda
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = forceFullRefresh 
          ? '2024-01-01' 
          : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const response = await apiClient.invoke<{
          success?: boolean;
          summary?: {
            totalCost: number;
            recordCount: number;
            savedCount: number;
            skippedCount: number;
          };
        }>('azure-fetch-costs', {
          body: {
            credentialId: selectedAccountId,
            startDate,
            endDate,
            granularity: 'DAILY',
          }
        });

        if (response.error) {
          throw new Error(getErrorMessage(response.error));
        }

        const summary = response.data?.summary;
        
        // Invalidar cache para recarregar dados do banco
        await queryClient.invalidateQueries({ 
          queryKey: ['monthly-invoices-data', organizationId, selectedAccountId] 
        });

        toast({
          title: '✅ Custos Azure atualizados',
          description: summary 
            ? `${summary.savedCount} registros salvos. Total: $${summary.totalCost?.toFixed(2) || '0.00'}`
            : 'Dados atualizados com sucesso',
        });
      } else {
        // AWS: Call fetch-daily-costs Lambda
        const response = await apiClient.invoke<{
          success: boolean;
          summary: {
            totalRecords: number;
            newRecords: number;
            skippedDays: number;
            uniqueDates: number;
            incremental: boolean;
          };
        }>('fetch-daily-costs', {
          body: {
            accountId: selectedAccountId,
            incremental: !forceFullRefresh,
          }
        });

        if (response.error) {
          throw new Error(getErrorMessage(response.error));
        }

        const summary = response.data?.summary;
        
        // Invalidar cache para recarregar dados do banco
        await queryClient.invalidateQueries({ 
          queryKey: ['monthly-invoices-data', organizationId, selectedAccountId] 
        });

        if (summary?.newRecords === 0 && summary?.skippedDays > 0) {
          toast({
            title: '✅ Dados já atualizados',
            description: `Nenhum novo dado encontrado. ${summary.skippedDays} dias já estavam no banco.`,
          });
        } else {
          toast({
            title: '✅ Custos atualizados',
            description: summary 
              ? `${summary.newRecords} novos registros. ${summary.uniqueDates} dias de dados.`
              : 'Dados atualizados com sucesso',
          });
        }
      }
    } catch (error) {
      console.error('Error loading historical data:', error);
      toast({
        title: 'Erro ao carregar dados',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: "destructive"
      });
    } finally {
      setIsLoadingHistory(false);
    }
  };
  
  // Use provider from context for display
  const providerDisplayName = selectedProvider === 'AZURE' ? 'Azure' : 'AWS';

  return (
    <Layout 
      title={`Faturas Mensais ${providerDisplayName}`}
      description={`Visualização e análise detalhada das faturas mensais ${selectedProvider === 'AZURE' ? 'do Azure' : 'da AWS'}`}
      icon={<FileText className="h-5 w-5" />}
    >
      <div className="space-y-6">
      {/* Main Content Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                {selectedAccount ? selectedAccount.account_name || selectedAccount.account_id : 'Selecione uma conta'}
              </CardTitle>
              <CardDescription>
                {allCosts?.length || 0} registros de custos disponíveis
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadHistoricalData(false)}
                disabled={isLoadingHistory}
                className="glass-card-float"
              >
                {isLoadingHistory ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Carregando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Atualizar Novos
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadHistoricalData(true)}
                disabled={isLoadingHistory}
                className="text-muted-foreground hover:text-foreground"
                title="Recarregar todos os dados históricos"
              >
                <Download className="h-4 w-4 mr-1" />
                Histórico Completo
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters - Month Only */}
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Mês</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="glass-card-float">
                  <SelectValue placeholder="Selecionar mês" />
                </SelectTrigger>
                <SelectContent>
                  {sortedMonths.map((month) => {
                    const [year, monthNum] = month.split('-');
                    const monthName = new Date(parseInt(year), parseInt(monthNum) - 1)
                      .toLocaleDateString(currentLocale, { month: 'long', year: 'numeric' });
                    return (
                      <SelectItem key={month} value={month}>
                        {monthName}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading Skeleton */}
      {isLoadingCosts && (
        <div className="space-y-6">
          {/* Summary Cards Skeleton */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-32 mb-2" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* Chart Skeleton */}
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[400px] w-full" />
            </CardContent>
          </Card>
          
          {/* Invoice List Skeleton */}
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40 mb-2" />
              <Skeleton className="h-4 w-56" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-5 w-5 rounded" />
                      <div>
                        <Skeleton className="h-5 w-32 mb-1" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-6 w-16 rounded-full" />
                      <Skeleton className="h-6 w-24" />
                      <Skeleton className="h-8 w-8 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Monthly Summary Cards */}
      {!isLoadingCosts && selectedMonthData && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Custo Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">${selectedMonthData.totalCost.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">{selectedMonthData.days} dias</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Créditos Aplicados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-success">
                ${selectedMonthData.totalCredits.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {((selectedMonthData.totalCredits / selectedMonthData.totalCost) * 100).toFixed(1)}% do total
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Custo Líquido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">${selectedMonthData.netCost.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">Valor a pagar</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Média Diária</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                ${(selectedMonthData.netCost / selectedMonthData.days).toFixed(2)}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full glass-card-float"
                onClick={() => exportInvoice(selectedMonth)}
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar Fatura
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs for different views */}
      {!isLoadingCosts && (
      <Tabs defaultValue="comparison" className="w-full">
        <TabsList className="glass-card-float">
          <TabsTrigger value="comparison">Comparação Mensal</TabsTrigger>
          <TabsTrigger value="services">Serviços</TabsTrigger>
          <TabsTrigger value="daily">Evolução Diária</TabsTrigger>
        </TabsList>

        {/* Monthly Comparison Tab */}
        <TabsContent value="comparison" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Comparação dos Últimos 12 Meses</CardTitle>
              <CardDescription>Evolução dos custos, créditos e valores líquidos</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={monthComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="month" 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => `$${value.toFixed(2)}`}
                  />
                  <Legend />
                  <Bar dataKey="total" fill="#3b82f6" name="Custo Total" />
                  <Bar dataKey="credits" fill="#10b981" name="Créditos" />
                  <Bar dataKey="net" fill="#f59e0b" name="Custo Líquido" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Services Tab */}
        <TabsContent value="services" className="space-y-4">
          {selectedMonthData && (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card >
                  <CardHeader>
                    <CardTitle>Distribuição por Serviços</CardTitle>
                    <CardDescription>Top 10 serviços por custo</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={servicePieData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {servicePieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card >
                  <CardHeader>
                    <CardTitle>Detalhes dos Serviços</CardTitle>
                    <CardDescription>Custos por serviço AWS</CardDescription>
                  </CardHeader>
                  <CardContent className="max-h-[400px] overflow-y-auto">
                    <div className="space-y-2">
                      {Object.entries(selectedMonthData.serviceBreakdown)
                        .sort(([,a], [,b]) => b - a)
                        .map(([service, value], index) => {
                          const percentage = (value / selectedMonthData.totalCost) * 100;
                          return (
                            <div 
                              key={service}
                              className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <div 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                />
                                <span className="text-sm font-medium truncate">{service}</span>
                              </div>
                              <div className="flex items-center gap-4">
                                <Badge variant="outline" className="font-mono">
                                  {percentage.toFixed(1)}%
                                </Badge>
                                <span className="font-mono font-semibold min-w-[100px] text-right">
                                  ${value.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* Daily Evolution Tab */}
        <TabsContent value="daily" className="space-y-4">
          {selectedMonthData && (
            <Card>
              <CardHeader>
                <CardTitle>Custos Diários</CardTitle>
                <CardDescription>Evolução dos custos durante o mês</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart 
                    data={selectedMonthData.dailyCosts
                      .sort((a, b) => compareDates(a.cost_date, b.cost_date))
                      .map(cost => ({
                        date: getDayOfMonth(cost.cost_date),
                        total: Number(cost.total_cost),
                        net: Number(cost.net_cost || cost.total_cost),
                        credits: Number(cost.credits_used || 0),
                      }))
                    }
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      label={{ value: 'Dia do Mês', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={(value) => `$${value.toFixed(0)}`}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => `$${value.toFixed(2)}`}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="total" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      name="Custo Total"
                      dot={{ r: 3 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="net" 
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      name="Custo Líquido"
                      dot={{ r: 3 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="credits" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      name="Créditos"
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      )}

      {/* Monthly Invoice List */}
      {!isLoadingCosts && (
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Faturas</CardTitle>
          <CardDescription>Todas as faturas disponíveis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {sortedMonths.map((month, index) => {
              const data = monthlyData[month as keyof typeof monthlyData];
              const [year, monthNum] = month.split('-');
              const monthName = new Date(parseInt(year), parseInt(monthNum) - 1)
                .toLocaleDateString(currentLocale, { month: 'long', year: 'numeric' });
              
              const prevMonth = sortedMonths[index + 1];
              const prevData = prevMonth ? monthlyData[prevMonth as keyof typeof monthlyData] : null;
              const change = prevData ? ((data.netCost - prevData.netCost) / prevData.netCost) * 100 : 0;

              // Badge classes with proper contrast
              const getBadgeClasses = (changeValue: number) => {
                if (changeValue >= 0) {
                  return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800';
                }
                return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800';
              };

              return (
                <div 
                  key={month}
                  className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-all cursor-pointer"
                  onClick={() => setSelectedMonth(month)}
                >
                  <div className="flex items-center gap-4">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-semibold">{monthName}</div>
                      <div className="text-sm text-muted-foreground">{data.days} dias de dados</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {prevData && (
                      <Badge variant="outline" className={`gap-1 ${getBadgeClasses(change)}`}>
                        {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                      </Badge>
                    )}
                    <div className="text-right">
                      <div className="font-mono font-semibold">${data.netCost.toFixed(2)}</div>
                      {data.totalCredits > 0 && (
                        <div className="text-sm text-success font-mono">-${data.totalCredits.toFixed(2)}</div>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        exportInvoice(month);
                      }}
                      className="glass-card-float"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      )}
      </div>
    </Layout>
  );
};