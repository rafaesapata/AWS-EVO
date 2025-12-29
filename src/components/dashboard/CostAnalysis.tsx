import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Calendar, Download, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { CostForecast } from "./cost-analysis/CostForecast";
import { CostTrends } from "./cost-analysis/CostTrends";
import { ExportManager } from "./cost-analysis/ExportManager";
import { useQueryCache, CACHE_CONFIGS } from "@/hooks/useQueryCache";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { formatDateBR } from "@/lib/utils";

export const CostAnalysis = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedOther, setExpandedOther] = useState<Set<string>>(new Set());
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');

  // Use global account context for multi-account isolation
  const { selectedAccountId, accounts: allAccounts } = useAwsAccount();
  const { data: organizationId } = useOrganization();

  // Get available tags from organization - filtered by selected account
  const { data: availableTags } = useQuery({
    queryKey: ['cost-allocation-tags', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    queryFn: async () => {
      // Query tags filtered by selected account
      const response = await apiClient.select('cost_allocation_tags', { 
        eq: { organization_id: organizationId, aws_account_id: selectedAccountId } 
      });
      if (response.error) throw response.error;
      
      // Group by tag_key and collect unique values
      const tagMap = (response.data || []).reduce((acc, tag) => {
        const key = `${tag.tag_key}:${tag.tag_value}`;
        if (!acc.some(t => t.key === key)) {
          acc.push({ key, label: `${tag.tag_key}: ${tag.tag_value}` });
        }
        return acc;
      }, [] as { key: string; label: string }[]);
      
      return tagMap;
    },
  });

  // Get daily costs - FILTERED BY SELECTED ACCOUNT
  const { data: allCosts, isLoading } = useQuery({
    queryKey: ['cost-analysis-raw', 'org', organizationId, 'account', selectedAccountId, dateRange],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const daysAgo = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);

      // Always filter by selected account - no 'all' option
      const response = await apiClient.select('daily_costs', { 
        eq: { organization_id: organizationId, aws_account_id: selectedAccountId } 
      });
      if (response.error) throw response.error;
      const data = response.data;
      
      // Remove duplicates by keeping only the latest entry per date and account
      const uniqueCosts = data?.reduce((acc, current) => {
        const key = `${current.aws_account_id}_${current.cost_date}`;
        const existing = acc.find(item => `${item.aws_account_id}_${item.cost_date}` === key);
        
        if (!existing) {
          acc.push(current);
        } else {
          const existingIndex = acc.indexOf(existing);
          if (new Date(current.created_at) > new Date(existing.created_at)) {
            acc[existingIndex] = current;
          }
        }
        return acc;
      }, [] as typeof data) || [];

      return uniqueCosts;
    },
  });

  // Get all unique regions from unfiltered costs
  const allRegions = allCosts?.reduce((regions, cost) => {
    if (cost.cost_by_region) {
      Object.entries(cost.cost_by_region).forEach(([region, regionCost]) => {
        // Only include regions with actual cost > 0
        if (typeof regionCost === 'number' && regionCost > 0 && !regions.includes(region)) {
          regions.push(region);
        }
      });
    }
    return regions;
  }, [] as string[]).sort() || [];

  // Apply filters to get final costs
  const costs = (() => {
    if (!allCosts) return [];
    
    let filteredCosts = [...allCosts];

    // Filter by region if selected
    if (selectedRegion !== 'all') {
      filteredCosts = filteredCosts.map(cost => {
        if (!cost.cost_by_region) return null;
        
        // Check if this cost entry has data for the selected region
        const regionCost = cost.cost_by_region[selectedRegion];
        if (!regionCost || regionCost === 0) return null;

        // Return a modified cost object showing only the selected region
        return {
          ...cost,
          total_cost: typeof regionCost === 'number' ? regionCost : cost.total_cost,
          cost_by_region: { [selectedRegion]: regionCost }
        };
      }).filter(cost => cost !== null);
    }

    // Filter by tag if selected (synchronously for now, tags should be pre-loaded)
    if (selectedTag !== 'all') {
      // This is a client-side filter, ideally tags should be pre-loaded
      // For now, we'll keep all costs if tag is selected
    }

    return filteredCosts;
  })();

  // Mutation to refresh costs
  const refreshCostsMutation = useMutation({
    mutationFn: async () => {
      const accountId = selectedAccountId === 'all' ? allAccounts?.[0]?.id : selectedAccountId;
      
      if (!accountId) {
        throw new Error(t('costAnalysis.noAwsAccount'));
      }

      const data = await apiClient.lambda('fetch-daily-costs', {
        body: { accountId: accountId, days: 90 }
      });
      
      if (!data?.success) {
        throw new Error(data?.error || t('costAnalysis.updateError'));
      }

      return data;
    },
    onSuccess: (data) => {
      const daysUpdated = data.data?.dailyCosts?.length || 0;
      
      // Invalidate queries to refresh UI - pattern matching for all organization variants
      queryClient.invalidateQueries({ queryKey: ['cost-analysis-raw'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['daily-costs'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['daily-costs-history'], exact: false });
      
      // Only show toast if not background refresh
      if (!document.hidden) {
        const message = daysUpdated > 0 
          ? t('costAnalysis.daysUpdated', { count: daysUpdated })
          : t('costAnalysis.noNewData');
          
        toast({
          title: daysUpdated > 0 ? t('costAnalysis.costsUpdated') : t('common.information'),
          description: message,
        });
      }
    },
    onError: (error: any) => {
      console.error('Error refreshing costs:', error);
      
      // Only show error toast if not background refresh
      if (!document.hidden) {
        const errorMsg = error?.message || t('common.unknownError');
        const isPermissionError = errorMsg.includes('AccessDenied') || 
                                  errorMsg.includes('not authorized') ||
                                  errorMsg.includes('UnauthorizedOperation');
        
        toast({
          title: t('costAnalysis.updateError'),
          description: isPermissionError 
            ? t('costAnalysis.insufficientPermission')
            : `${errorMsg}. ${t('costAnalysis.checkCredentials')}`,
          variant: "destructive",
        });
      }
    },
  });

  // Auto-refresh on component mount (background)
  useEffect(() => {
    const accountId = selectedAccountId === 'all' ? allAccounts?.[0]?.id : selectedAccountId;
    
    if (accountId && allCosts && allCosts.length === 0) {
      // If no data, refresh immediately
      refreshCostsMutation.mutate();
    } else if (accountId) {
      // If has data, refresh in background after 2 seconds
      const timer = setTimeout(() => {
        refreshCostsMutation.mutate();
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [selectedAccountId, allAccounts]);

  const toggleExpanded = (date: string) => {
    const newExpanded = new Set(expandedDates);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedDates(newExpanded);
  };

  const toggleOtherExpanded = (key: string) => {
    const newExpanded = new Set(expandedOther);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedOther(newExpanded);
  };

  const exportToCSV = () => {
    if (!costs) return;

    const headers = ['Data', 'Conta AWS', 'Custo Total', 'Créditos', 'Custo Líquido', 'Principais Serviços'];
    const rows = costs.map(cost => {
      const topServices = cost.service_breakdown 
        ? Object.entries(cost.service_breakdown)
            .sort(([,a], [,b]) => (b as number) - (a as number))
            .slice(0, 3)
            .map(([service, value]) => `${service}: $${(value as number).toFixed(2)}`)
            .join('; ')
        : '';
      
      return [
        formatDateBR(cost.cost_date),
        allAccounts?.find(a => a.id === cost.aws_account_id)?.account_name || cost.aws_account_id,
        cost.total_cost.toString(),
        (cost.credits_used || 0).toString(),
        (cost.net_cost || cost.total_cost).toString(),
        topServices
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `custos_aws_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Prepare data for stacked bar chart with top services + Other
  const prepareChartData = () => {
    if (!costs) return [];

    // First, calculate total spend per service across all dates
    const serviceTotals: Record<string, number> = {};
    costs.forEach(cost => {
      if (cost.service_breakdown) {
        Object.entries(cost.service_breakdown).forEach(([service, value]) => {
          const shortService = service.replace('Amazon ', '').replace('AWS ', '');
          serviceTotals[shortService] = (serviceTotals[shortService] || 0) + (value as number);
        });
      }
    });

    // Get top 8 services by total spend
    const topServices = Object.entries(serviceTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([service]) => service);

    // Group by date and aggregate services
    const dateServiceMap: Record<string, Record<string, number>> = {};
    
    costs.forEach(cost => {
      const date = formatDateBR(cost.cost_date, { day: '2-digit', month: '2-digit' });
      
      if (!dateServiceMap[date]) {
        dateServiceMap[date] = {};
      }
      
      if (cost.service_breakdown) {
        Object.entries(cost.service_breakdown).forEach(([service, value]) => {
          const shortService = service.replace('Amazon ', '').replace('AWS ', '');
          
          if (topServices.includes(shortService)) {
            dateServiceMap[date][shortService] = (dateServiceMap[date][shortService] || 0) + (value as number);
          } else {
            dateServiceMap[date]['Other'] = (dateServiceMap[date]['Other'] || 0) + (value as number);
          }
        });
      }
    });

    // Convert to array and sort by date
    return Object.entries(dateServiceMap)
      .map(([date, services]) => ({
        date,
        ...services,
        total: Object.values(services).reduce((sum, val) => sum + val, 0)
      }))
      .sort((a, b) => {
        const [dayA, monthA] = a.date.split('/').map(Number);
        const [dayB, monthB] = b.date.split('/').map(Number);
        return monthA === monthB ? dayA - dayB : monthA - monthB;
      });
  };

  // Get top services for the chart
  const getTopServices = () => {
    if (!costs) return [];
    
    const serviceTotals: Record<string, number> = {};
    costs.forEach(cost => {
      if (cost.service_breakdown) {
        Object.entries(cost.service_breakdown).forEach(([service, value]) => {
          const shortService = service.replace('Amazon ', '').replace('AWS ', '');
          serviceTotals[shortService] = (serviceTotals[shortService] || 0) + (value as number);
        });
      }
    });
    
    const topServices = Object.entries(serviceTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([service]) => service);
    
    // Check if there are other services
    const hasOther = Object.keys(serviceTotals).length > 8;
    
    return hasOther ? [...topServices, 'Other'] : topServices;
  };

  // Color palette for services with distinct colors
  const CHART_COLORS = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#14b8a6', // teal
    '#f97316', // orange
    '#6366f1', // indigo
  ];

  const getServiceColor = (service: string, index: number) => {
    return CHART_COLORS[index % CHART_COLORS.length];
  };

  const chartData = prepareChartData();
  const topServices = getTopServices();

  // Group costs by date
  const costsByDate = costs?.reduce((acc, cost) => {
    const date = cost.cost_date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(cost);
    return acc;
  }, {} as Record<string, typeof costs>) || {};

  const sortedDates = Object.keys(costsByDate).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  );

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

  return (
    <div className="space-y-4">
      {/* Previsão e Tendências */}
      <div className="grid gap-4 md:grid-cols-2">
        <CostForecast accountId={selectedAccountId === 'all' ? (allAccounts?.[0]?.id || 'all') : selectedAccountId} />
        <CostTrends accountId={selectedAccountId} costs={costs || []} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle>{t('costAnalysis.title')}</CardTitle>
              <CardDescription>
                {t('costAnalysis.description')}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => refreshCostsMutation.mutate()}
                disabled={refreshCostsMutation.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshCostsMutation.isPending ? 'animate-spin' : ''}`} />
                {refreshCostsMutation.isPending ? t('costAnalysis.refreshing') : t('costAnalysis.refresh')}
              </Button>
              <ExportManager 
                costs={costs || []} 
                accounts={allAccounts || []} 
                selectedAccountId={selectedAccountId} 
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">{t('costAnalysis.region')}</label>
              <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                <SelectTrigger>
                  <SelectValue placeholder={t('costAnalysis.selectRegion')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('costAnalysis.allRegions')}</SelectItem>
                  {allRegions.map((region) => (
                    <SelectItem key={region} value={region}>
                      {region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">{t('costAnalysis.tag')}</label>
              <Select value={selectedTag} onValueChange={setSelectedTag}>
                <SelectTrigger>
                  <SelectValue placeholder={t('costAnalysis.selectTag')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('costAnalysis.allTags')}</SelectItem>
                  {availableTags?.map((tag) => (
                    <SelectItem key={tag.key} value={tag.key}>
                      {tag.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">{t('costAnalysis.period')}</label>
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as '7d' | '30d' | '90d')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">{t('costAnalysis.last7days')}</SelectItem>
                  <SelectItem value="30d">{t('costAnalysis.last30days')}</SelectItem>
                  <SelectItem value="90d">{t('costAnalysis.last90days')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Empty State */}
          {(!costs || costs.length === 0) && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t('costAnalysis.noDataAvailable')}</h3>
                <p className="text-sm text-muted-foreground text-center mb-4 max-w-md">
                  {t('costAnalysis.noDataDescription')}
                </p>
                <Button 
                  onClick={() => refreshCostsMutation.mutate()}
                  disabled={refreshCostsMutation.isPending}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshCostsMutation.isPending ? 'animate-spin' : ''}`} />
                  {refreshCostsMutation.isPending ? t('costAnalysis.fetchingData') : t('costAnalysis.fetchAwsData')}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Summary Stats */}
          {costs && costs.length > 0 && (
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t('costAnalysis.periodTotal')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${costs.reduce((sum, c) => sum + Number(c.total_cost), 0).toFixed(2)}
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t('costAnalysis.creditsUsed')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    ${costs.reduce((sum, c) => sum + Number(c.credits_used || 0), 0).toFixed(2)}
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t('costAnalysis.netCost')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${costs.reduce((sum, c) => sum + Number(c.net_cost || c.total_cost), 0).toFixed(2)}
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t('costAnalysis.daysAnalyzed')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{sortedDates.length}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Service Cost Chart */}
          {chartData.length > 0 && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle>{t('costAnalysis.costDistribution')}</CardTitle>
                <CardDescription>{t('costAnalysis.costDistributionDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
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
                    <Legend 
                      wrapperStyle={{
                        paddingTop: '20px'
                      }}
                      iconType="square"
                    />
                    {topServices.map((service, index) => (
                      <Bar 
                        key={service}
                        dataKey={service}
                        stackId="a"
                        fill={getServiceColor(service, index)}
                        name={service}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}


          {/* Daily Costs Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Conta AWS</TableHead>
                  <TableHead className="text-right">Custo Total</TableHead>
                  <TableHead className="text-right">Créditos</TableHead>
                  <TableHead className="text-right">Custo Líquido</TableHead>
                  <TableHead className="text-right">Variação</TableHead>
                  <TableHead>Principais Serviços</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum dado de custo disponível
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedDates.map((date, idx) => {
                    const dateCosts = costsByDate[date];
                    const totalCost = dateCosts.reduce((sum, c) => sum + Number(c.total_cost), 0);
                    const totalCredits = dateCosts.reduce((sum, c) => sum + Number(c.credits_used || 0), 0);
                    const netCost = dateCosts.reduce((sum, c) => sum + Number(c.net_cost || c.total_cost), 0);
                    const isExpanded = expandedDates.has(date);
                    
                    // Calculate day-over-day change
                    const prevDate = sortedDates[idx + 1];
                    const prevCosts = prevDate ? costsByDate[prevDate] : null;
                    const prevNetCost = prevCosts?.reduce((sum, c) => sum + Number(c.net_cost || c.total_cost), 0) || 0;
                    const change = prevNetCost > 0 ? ((netCost - prevNetCost) / prevNetCost) * 100 : 0;

                    return (
                      <>
                        <TableRow key={date} className="cursor-pointer hover:bg-muted/50" onClick={() => toggleExpanded(date)}>
                          <TableCell>
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              {formatDateBR(date, { 
                                weekday: 'short', 
                                day: '2-digit', 
                                month: 'short',
                                year: 'numeric'
                              })}
                            </div>
                          </TableCell>
                          <TableCell>
                            {dateCosts.length > 1 ? (
                              <Badge variant="outline">{dateCosts.length} contas</Badge>
                            ) : (
                              allAccounts?.find(a => a.id === dateCosts[0].aws_account_id)?.account_name || 'N/A'
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            ${totalCost.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-green-600">
                            {totalCredits > 0 ? `$${totalCredits.toFixed(2)}` : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            ${netCost.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            {prevNetCost > 0 && (
                              <Badge variant={change >= 0 ? "destructive" : "default"} className="gap-1">
                                {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {dateCosts[0].service_breakdown && (
                              <div className="flex gap-1 flex-wrap">
                                {Object.entries(dateCosts[0].service_breakdown)
                                  .sort(([,a], [,b]) => (b as number) - (a as number))
                                  .slice(0, 3)
                                  .map(([service, value]) => (
                                    <Badge key={service} variant="outline" className="text-xs">
                                      {service.replace('Amazon ', '').replace('AWS ', '')}: ${(value as number).toFixed(2)}
                                    </Badge>
                                  ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${date}-breakdown`}>
                            <TableCell colSpan={8} className="bg-muted/30 p-0">
                              <div className="p-4 space-y-4">
                                <h4 className="font-semibold text-sm">Breakdown de Serviços - {formatDateBR(date)}</h4>
                                {dateCosts.map((cost) => {
                                  if (!cost.service_breakdown) return null;

                                  // Calculate total to determine top services
                                  const serviceTotals = Object.entries(cost.service_breakdown)
                                    .filter(([, value]) => (value as number) > 0)
                                    .sort(([,a], [,b]) => (b as number) - (a as number));

                                  const topServices = serviceTotals.slice(0, 8);
                                  const otherServices = serviceTotals.slice(8);
                                  const otherTotal = otherServices.reduce((sum, [, value]) => sum + (value as number), 0);
                                  const otherKey = `${date}-${cost.id}`;
                                  const isOtherExpanded = expandedOther.has(otherKey);

                                  return (
                                    <div key={cost.id} className="space-y-2">
                                      <div className="grid gap-1">
                                        {topServices.map(([service, value]) => (
                                          <div key={service} className="flex items-center justify-between p-2 bg-background rounded border border-border">
                                            <span className="text-sm">{service}</span>
                                            <span className="font-mono font-semibold">${(value as number).toFixed(4)}</span>
                                          </div>
                                        ))}
                                        {otherServices.length > 0 && (
                                          <>
                                            <div 
                                              className="flex items-center justify-between p-2 bg-background rounded border border-border cursor-pointer hover:bg-muted/50"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleOtherExpanded(otherKey);
                                              }}
                                            >
                                              <div className="flex items-center gap-2">
                                                {isOtherExpanded ? (
                                                  <ChevronDown className="h-4 w-4" />
                                                ) : (
                                                  <ChevronRight className="h-4 w-4" />
                                                )}
                                                <span className="text-sm font-medium">Other ({otherServices.length} serviços)</span>
                                              </div>
                                              <span className="font-mono font-semibold">${otherTotal.toFixed(4)}</span>
                                            </div>
                                            {isOtherExpanded && (
                                              <div className="ml-6 grid gap-1 mt-2">
                                                {otherServices.map(([service, value]) => (
                                                  <div key={service} className="flex items-center justify-between p-2 bg-muted/30 rounded border border-border">
                                                    <span className="text-sm text-muted-foreground">{service}</span>
                                                    <span className="font-mono text-sm">${(value as number).toFixed(4)}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
