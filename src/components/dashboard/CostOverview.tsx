import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import AWSService from "@/services/aws-service";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { DollarSign, TrendingUp, TrendingDown, Calendar, Zap, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "react-i18next";
import AWSRoleConfigError from "./AWSRoleConfigError";

const CostOverview = () => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [awsRoleError, setAwsRoleError] = useState<string | null>(null);
  
  // Use global account context
  const { selectedAccountId, selectedAccount, selectedProvider, isLoading: accountLoading } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();
  const { data: organizationId } = useOrganization();
  
  // Multi-cloud support
  const isAzure = selectedProvider === 'AZURE';
  
  // Get locale for date formatting
  const dateLocale = i18n.language === 'pt' ? 'pt-BR' : i18n.language === 'es' ? 'es-ES' : 'en-US';

  // Get daily costs from last 30 days - ISOLATED BY ACCOUNT
  const { data: costs, isLoading, refetch } = useQuery({
    queryKey: ['daily-costs', 'org', organizationId, 'account', selectedAccountId],
    enabled: !!selectedAccountId && !!organizationId,
    staleTime: 2 * 60 * 1000, // 2 minutos - permite refresh após atualizações
    gcTime: 60 * 60 * 1000, // Garbage collection após 1 hora
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const oneYearAgo = new Date();
      oneYearAgo.setDate(oneYearAgo.getDate() - 365);


      const filters: any = { organization_id: organizationId, ...getAccountFilter() };

      const { data, error } = await AWSService.getDailyCosts(filters);
      
      


      // Remove duplicates by date
      const uniqueCosts = data?.reduce((acc, current) => {
        const existing = acc.find(item => item.cost_date === current.cost_date);

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


      // If no data, fetch from edge function - multi-cloud support
      if (!uniqueCosts || uniqueCosts.length === 0) {
        try {
          const lambdaName = isAzure ? 'azure-fetch-costs' : 'fetch-daily-costs';
          const bodyParam = isAzure 
            ? { credentialId: selectedAccountId!, startDate: oneYearAgo.toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0] }
            : { accountId: selectedAccountId!, days: 365 };
          
          const fetchedData = await apiClient.lambda(lambdaName, {
            body: bodyParam
          });

          // Check for errors - both from fetchError and from response data
          const checkAssumeRoleError = (msg: string): boolean => {
            if (!msg) return false;
            const lowerMsg = msg.toLowerCase();
            return lowerMsg.includes('assumerole') || 
                   lowerMsg.includes('sts:assumerole') || 
                   lowerMsg.includes('not authorized to perform') ||
                   lowerMsg.includes('is not authorized');
          };

          if (fetchError) {
            const errorMsg = fetchError.message || String(fetchError);
            if (checkAssumeRoleError(errorMsg)) {
              setAwsRoleError(errorMsg);
              return [];
            }
            // Don't throw, just return empty and let the UI show empty state
            return [];
          }
          
          // Also check if the response data contains an error
          if (fetchedData && !fetchedData.success && fetchedData.error) {
            const errorMsg = fetchedData.error;
            if (checkAssumeRoleError(errorMsg)) {
              setAwsRoleError(errorMsg);
              return [];
            }
            return [];
          }
          
          setAwsRoleError(null); // Clear error on success
          
          // Refetch after edge function populates data
          const refreshResponse = await apiClient.select('daily_costs', {
            eq: filters,
            order: { column: 'cost_date', ascending: false }
          });
          return refreshResponse.data || [];
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          if (errorMsg.toLowerCase().includes('assumerole') || errorMsg.toLowerCase().includes('not authorized')) {
            setAwsRoleError(errorMsg);
          }
          return [];
        }
      }

      return uniqueCosts;
    },
  });

  const handleRefresh = async () => {
    if (!selectedAccountId) {
      toast({
        title: t('costs.noAwsAccount'),
        description: t('costs.selectAccountToRefresh'),
        variant: "destructive",
      });
      return;
    }
    
    setIsRefreshing(true);
    try {
      // Multi-cloud support
      const lambdaName = isAzure ? 'azure-fetch-costs' : 'fetch-daily-costs';
      const bodyParam = isAzure 
        ? { credentialId: selectedAccountId, startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0] }
        : { accountId: selectedAccountId, days: 365 };
      
      const result = await apiClient.lambda(lambdaName, {
        body: bodyParam
      });
      
      const checkAssumeRoleError = (msg: string): boolean => {
        if (!msg) return false;
        const lowerMsg = msg.toLowerCase();
        return lowerMsg.includes('assumerole') || 
               lowerMsg.includes('sts:assumerole') || 
               lowerMsg.includes('not authorized to perform') ||
               lowerMsg.includes('is not authorized');
      };
      
      if (invokeError) {
        const errorMsg = invokeError.message || String(invokeError);
        
        if (checkAssumeRoleError(errorMsg)) {
          setAwsRoleError(errorMsg);
          toast({
            title: t('aws.roleConfigError', 'Erro de Configuração AWS'),
            description: t('aws.checkTrustPolicy', 'Verifique a Trust Policy da IAM Role'),
            variant: "destructive",
          });
          return;
        }
        throw invokeError;
      }
      
      // Check if result contains error
      if (result && !result.success && result.error) {
        const errorMsg = result.error;
        if (checkAssumeRoleError(errorMsg)) {
          setAwsRoleError(errorMsg);
          toast({
            title: t('aws.roleConfigError', 'Erro de Configuração AWS'),
            description: t('aws.checkTrustPolicy', 'Verifique a Trust Policy da IAM Role'),
            variant: "destructive",
          });
          return;
        }
        throw new Error(errorMsg);
      }
      
      setAwsRoleError(null); // Clear error on success
      
      toast({
        title: `✅ ${t('costs.costsUpdated')}`,
        description: t('costs.awsDataLoaded'),
      });
      
      // Invalidate all cost-related queries to force refresh
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['daily-costs'], exact: false }),
        queryClient.invalidateQueries({ queryKey: ['daily-costs-history'], exact: false }),
        queryClient.invalidateQueries({ queryKey: ['cost-analysis-raw'], exact: false }),
        queryClient.invalidateQueries({ queryKey: ['aws-accounts-all'], exact: false }),
        queryClient.invalidateQueries({ queryKey: ['aws-credentials-cost'], exact: false }),
        queryClient.invalidateQueries({ queryKey: ['executive-current-month-costs'], exact: false }),
        queryClient.invalidateQueries({ queryKey: ['executive-30days-costs'], exact: false }),
      ]);
      
      // Force refetch for local query
      await refetch();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : t('common.error');
      toast({
        title: t('costs.errorRefreshing'),
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Show AWS Role configuration error if present
  if (awsRoleError) {
    return (
      <AWSRoleConfigError 
        errorMessage={awsRoleError} 
        accountName={selectedAccount?.account_name}
        externalId={(selectedAccount as any)?.external_id}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-border">
            <CardHeader>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32 mt-2" />
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  if (!costs || costs.length === 0) {
    return (
      <div className="space-y-4">
        <Card className="border-border">
          <CardHeader>
            <CardTitle>{t('costs.awsCosts')}</CardTitle>
            <CardDescription>
              {t('costs.noCostData')} {selectedAccount?.account_name || t('common.unknown')}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Calculate costs correctly - aggregate by date when showing all accounts
  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  currentMonthStart.setHours(0, 0, 0, 0);

  // Group costs by date and sum across accounts if showing all
  const dailyCostsByDate = costs.reduce((acc, c) => {
    const date = c.cost_date;
    if (!acc[date]) {
      acc[date] = { date, total: 0, costs: [] };
    }
    acc[date].total += Number(c.total_cost);
    acc[date].costs.push(c);
    return acc;
  }, {} as Record<string, { date: string; total: number; costs: typeof costs }>);

  const aggregatedCosts = Object.values(dailyCostsByDate).sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Filter only costs from current month
  const currentMonthCosts = aggregatedCosts.filter(c => {
    const costDate = new Date(c.date);
    return costDate >= currentMonthStart;
  });
  
  // Sum all daily costs in the month to get month-to-date total
  const monthToDateTotal = currentMonthCosts.reduce((sum, c) => sum + c.total, 0);

  const yesterday = aggregatedCosts[aggregatedCosts.length - 2];
  const today = aggregatedCosts[aggregatedCosts.length - 1];
  const dailyChange = today && yesterday ? today.total - yesterday.total : 0;
  const dailyChangePercent = yesterday ? (dailyChange / yesterday.total) * 100 : 0;

  const last7Days = aggregatedCosts.slice(-7);
  const averageDailyCost = last7Days.reduce((sum, c) => sum + c.total, 0) / last7Days.length;

  const daysInMonth = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + 1, 0).getDate();
  const currentDay = new Date().getDate();
  const projectedMonthEnd = (monthToDateTotal / currentDay) * daysInMonth;

  const chartData = aggregatedCosts.map(c => ({
    date: new Date(c.date).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit' }),
    cost: c.total,
  }));

  const formatDate = (date: Date | string) => new Date(date).toLocaleDateString(dateLocale);
  const formatDateTime = (date: Date | string) => new Date(date).toLocaleString(dateLocale);

  return (
    <div className="space-y-4">
      {/* Info sobre dados */}
      {costs && costs.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>✅ {t('costs.awsData')}:</strong> {t('costs.lastUpdate', { date: formatDateTime(costs[costs.length - 1]?.created_at || new Date()) })}
            {costs[costs.length - 1]?.cost_date && ` • ${t('costs.dataUpTo', { date: formatDate(costs[costs.length - 1].cost_date) })}`}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('costs.monthCost')}
            </CardTitle>
            <DollarSign className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              ${monthToDateTotal.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('costs.upTo', { date: formatDate(new Date()) })}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('costs.dailyCostToday')}
            </CardTitle>
            {dailyChange >= 0 ? (
              <TrendingUp className="w-4 h-4 text-destructive" />
            ) : (
              <TrendingDown className="w-4 h-4 text-success" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              ${today ? today.total.toFixed(2) : '0.00'}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={dailyChange >= 0 ? "destructive" : "default"} className="text-xs">
                {dailyChange >= 0 ? '+' : ''}{dailyChangePercent.toFixed(1)}%
              </Badge>
              <p className="text-xs text-muted-foreground">{t('costs.vsYesterday')}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('costs.dailyAverage7d')}
            </CardTitle>
            <Zap className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              ${averageDailyCost.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('costs.last7days')}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('costs.monthProjection')}
              </CardTitle>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground">
                    <Info className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 text-sm" side="top">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">{t('costs.howCalculated')}</h4>
                    <p className="text-muted-foreground">
                      <strong>{t('costs.linearProjection')}:</strong> {t('costs.projectsCurrentSpend')}
                    </p>
                    <div className="bg-muted p-2 rounded text-xs font-mono">
                      {t('costs.formula')}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('costs.example', { 
                        spent: monthToDateTotal.toFixed(2), 
                        days: currentDay, 
                        daily: (monthToDateTotal / currentDay).toFixed(2), 
                        totalDays: daysInMonth, 
                        total: projectedMonthEnd.toFixed(2) 
                      })}
                    </p>
                    <div className="border-t pt-2 mt-2">
                      <p className="text-xs text-muted-foreground">
                        {t('costs.methodologyNote')}
                      </p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <Calendar className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              ${projectedMonthEnd.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('costs.estimateForDays', { days: daysInMonth })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Chart */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('costs.evolutionLast30Days')}</CardTitle>
              <CardDescription>
                {t('costs.realtimeMonitoring')}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? t('costs.refreshing') : t('costs.refreshButton')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, t('costs.cost')]}
              />
              <Area 
                type="monotone" 
                dataKey="cost" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                fill="url(#costGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default CostOverview;
