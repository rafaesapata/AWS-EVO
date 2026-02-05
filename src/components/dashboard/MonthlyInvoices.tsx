import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Calendar, 
  Download, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  ChevronDown,
  ChevronRight,
  FileText,
  RefreshCw
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrganization } from "@/hooks/useOrganization";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
import { parseDateString, compareDates, getDayOfMonth, calculatePercentageChange } from "@/lib/utils";

export const MonthlyInvoices = () => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: organizationId } = useOrganization();
  const { selectedAccountId, accounts } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  const currentLocale = i18n.language === 'pt' ? 'pt-BR' : i18n.language === 'es' ? 'es-ES' : 'en-US';

  // Get all daily costs from organization
  const { data: allCosts, isLoading } = useQuery({
    queryKey: ['monthly-invoices-data', organizationId, selectedAccountId],
    enabled: !!organizationId,
    queryFn: async () => {
      const filters: any = { 
        organization_id: organizationId,
        ...getAccountFilter() // Multi-cloud compatible
      };

      const response = await apiClient.select('daily_costs', {
        eq: filters,
        order: { column: 'date', ascending: false }
      });
      
      if (response.error) throw response.error;
      const data = response.data || [];

      // Data is per service per day - aggregate by date
      // Group by date and account, summing costs and building service breakdown
      const aggregatedByDate = data.reduce((acc: Record<string, any>, current: any) => {
        const dateStr = current.date?.split('T')[0] || current.date;
        const key = `${current.aws_account_id}_${dateStr}`;
        
        if (!acc[key]) {
          acc[key] = {
            aws_account_id: current.aws_account_id,
            date: dateStr,
            total_cost: 0,
            credits_used: 0,
            net_cost: 0,
            service_breakdown: {} as Record<string, number>,
            created_at: current.created_at,
          };
        }
        
        const cost = Number(current.cost) || 0;
        acc[key].total_cost += cost;
        acc[key].net_cost += cost; // No credits in this schema
        
        // Build service breakdown
        if (current.service) {
          acc[key].service_breakdown[current.service] = 
            (acc[key].service_breakdown[current.service] || 0) + cost;
        }
        
        return acc;
      }, {});

      return Object.values(aggregatedByDate);
    },
  });

  // Aggregate costs by month
  const monthlyData = allCosts?.reduce((acc, cost: any) => {
    const dateStr = cost.date?.split('T')[0] || cost.date;
    const date = parseDateString(dateStr);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!acc[monthKey]) {
      acc[monthKey] = {
        monthKey,
        totalCost: 0,
        totalCredits: 0,
        netCost: 0,
        days: 0,
        serviceBreakdown: {} as Record<string, number>,
        dailyCosts: [] as any[],
      };
    }
    
    acc[monthKey].totalCost += Number(cost.total_cost) || 0;
    acc[monthKey].totalCredits += Number(cost.credits_used || 0);
    acc[monthKey].netCost += Number(cost.net_cost || cost.total_cost) || 0;
    acc[monthKey].days += 1;
    acc[monthKey].dailyCosts.push(cost);
    
    // Aggregate service breakdown
    if (cost.service_breakdown) {
      Object.entries(cost.service_breakdown).forEach(([service, value]) => {
        acc[monthKey].serviceBreakdown[service] = 
          (acc[monthKey].serviceBreakdown[service] || 0) + (value as number);
      });
    }
    
    return acc;
  }, {} as Record<string, {
    monthKey: string;
    totalCost: number;
    totalCredits: number;
    netCost: number;
    days: number;
    serviceBreakdown: Record<string, number>;
    dailyCosts: any[];
  }>) || {};

  const sortedMonths = Object.keys(monthlyData).sort((a, b) => b.localeCompare(a));
  
  // Set initial selected month
  if (!selectedMonth && sortedMonths.length > 0) {
    setSelectedMonth(sortedMonths[0]);
  }

  const selectedMonthData = selectedMonth ? monthlyData[selectedMonth] : null;

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
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([service, value]) => ({
          name: service.replace('Amazon ', '').replace('AWS ', ''),
          value: value,
        }))
    : [];

  const COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#a855f7'
  ];

  // Export invoice
  const exportInvoice = (monthKey: string) => {
    const data = monthlyData[monthKey];
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
        .sort((a: any, b: any) => compareDates(a.date, b.date))
        .map((cost: any) => `${cost.date},${cost.total_cost},${cost.credits_used || 0},${cost.net_cost || cost.total_cost}`)
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `fatura_aws_${monthKey}.csv`;
    link.click();
  };

  const loadHistoricalData = async () => {
    setIsLoadingHistory(true);
    try {
      // Get account for loading historical data
      const accountId = selectedAccountId || accounts?.[0]?.id;

      if (!accountId) {
        toast({
          title: t('common.error'),
          description: t('monthlyInvoices.noAwsAccount'),
          variant: "destructive"
        });
        return;
      }

      toast({
        title: t('monthlyInvoices.loadingHistorical'),
        description: t('monthlyInvoices.fetchingLast12Months'),
      });

      const result = await apiClient.lambda('fetch-daily-costs', {
        body: { accountId, days: 365, incremental: true }
      });

      

      await queryClient.invalidateQueries({ queryKey: ['monthly-invoices-data'] });

      toast({
        title: `✅ ${t('monthlyInvoices.historicalDataLoaded')}`,
        description: `${result?.data?.dailyCosts?.length || 0} ${t('monthlyInvoices.daysLoaded')}`,
      });
    } catch (error) {
      console.error('Error loading historical data:', error);
      toast({
        title: t('monthlyInvoices.errorLoadingData'),
        description: error instanceof Error ? error.message : t('common.unknownError'),
        variant: "destructive"
      });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-6 w-6" />
                {t('monthlyInvoices.title')}
              </CardTitle>
              <CardDescription>
                {t('monthlyInvoices.description')}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadHistoricalData}
              disabled={isLoadingHistory}
            >
            {isLoadingHistory ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  {t('monthlyInvoices.loading')}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t('monthlyInvoices.loadHistory')}
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters - Month Only (Account uses global selector) */}
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">{t('monthlyInvoices.month')}</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue placeholder={t('monthlyInvoices.selectMonth')} />
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

      {/* Monthly Summary Cards */}
      {selectedMonthData && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('monthlyInvoices.totalCost')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">${selectedMonthData.totalCost.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">{selectedMonthData.days} {t('monthlyInvoices.days')}</p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('monthlyInvoices.appliedCredits')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-green-600">
                ${selectedMonthData.totalCredits.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {((selectedMonthData.totalCredits / selectedMonthData.totalCost) * 100).toFixed(1)}% {t('monthlyInvoices.ofTotal')}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('monthlyInvoices.netCost')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">${selectedMonthData.netCost.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">{t('monthlyInvoices.amountDue')}</p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('monthlyInvoices.dailyAverage')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                ${(selectedMonthData.netCost / selectedMonthData.days).toFixed(2)}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => exportInvoice(selectedMonth)}
              >
                <Download className="h-4 w-4 mr-2" />
                {t('monthlyInvoices.exportInvoice')}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs for different views */}
      <Tabs defaultValue="comparison" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="comparison">{t('monthlyInvoices.monthlyComparison')}</TabsTrigger>
          <TabsTrigger value="services">{t('monthlyInvoices.services')}</TabsTrigger>
          <TabsTrigger value="daily">{t('monthlyInvoices.dailyEvolution')}</TabsTrigger>
        </TabsList>

        {/* Monthly Comparison Tab */}
        <TabsContent value="comparison" className="space-y-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle>{t('monthlyInvoices.last12MonthsComparison')}</CardTitle>
              <CardDescription>{t('monthlyInvoices.costCreditsEvolution')}</CardDescription>
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
                  <Bar dataKey="total" fill="#3b82f6" name={t('monthlyInvoices.totalCost')} />
                  <Bar dataKey="credits" fill="#10b981" name={t('monthlyInvoices.credits')} />
                  <Bar dataKey="net" fill="#f59e0b" name={t('monthlyInvoices.netCost')} />
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
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle>{t('monthlyInvoices.serviceDistribution')}</CardTitle>
                    <CardDescription>{t('monthlyInvoices.top10Services')}</CardDescription>
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

                <Card className="border-border">
                  <CardHeader>
                    <CardTitle>{t('monthlyInvoices.serviceDetails')}</CardTitle>
                    <CardDescription>{t('monthlyInvoices.costsByAwsService')}</CardDescription>
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
            <Card className="border-border">
              <CardHeader>
                <CardTitle>{t('monthlyInvoices.dailyCosts')}</CardTitle>
                <CardDescription>{t('monthlyInvoices.costEvolutionDuringMonth')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart 
                    data={selectedMonthData.dailyCosts
                      .sort((a: any, b: any) => compareDates(a.date, b.date))
                      .map((cost: any) => ({
                        date: getDayOfMonth(cost.date),
                        total: Number(cost.total_cost) || 0,
                        net: Number(cost.net_cost || cost.total_cost) || 0,
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
                      name={t('monthlyInvoices.totalCost')}
                      dot={{ r: 3 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="net" 
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      name={t('monthlyInvoices.netCost')}
                      dot={{ r: 3 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="credits" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      name={t('monthlyInvoices.credits')}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Monthly Invoice List */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle>{t('monthlyInvoices.invoiceHistory')}</CardTitle>
          <CardDescription>{t('monthlyInvoices.allAvailableInvoices')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {sortedMonths.map((month, index) => {
              const data = monthlyData[month];
              const [year, monthNum] = month.split('-');
              const monthName = new Date(parseInt(year), parseInt(monthNum) - 1)
                .toLocaleDateString(currentLocale, { month: 'long', year: 'numeric' });
              
              const prevMonth = sortedMonths[index + 1];
              const prevData = prevMonth ? monthlyData[prevMonth] : null;
              const change = prevData ? calculatePercentageChange(data.netCost, prevData.netCost) : 0;

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
                      <div className="text-sm text-muted-foreground">{data.days} {t('monthlyInvoices.daysOfData')}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {change !== 0 && (
                      <Badge variant={change >= 0 ? "destructive" : "default"} className="gap-1">
                        {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                      </Badge>
                    )}
                    <div className="text-right">
                      <div className="font-mono font-semibold">${data.netCost.toFixed(2)}</div>
                      {data.totalCredits > 0 && (
                        <div className="text-sm text-green-600 font-mono">-${data.totalCredits.toFixed(2)}</div>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        exportInvoice(month);
                      }}
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
    </div>
  );
};
