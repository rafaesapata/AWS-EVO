import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { TrendingUp, TrendingDown, Shield, DollarSign, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardAlerts from "./DashboardAlerts";
import AIInsights from "./AIInsights";
import MetricsWithTargets from "./MetricsWithTargets";
import { useQueryCache, CACHE_CONFIGS } from "@/hooks/useQueryCache";
import { useOrganization } from "@/hooks/useOrganization";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useExecutiveDashboardRefresh } from "@/hooks/useAutoRefresh";
import { useTVDashboard } from "@/contexts/TVDashboardContext";
import { InfoTooltip, tooltipContent } from "@/components/ui/info-tooltip";

export const ExecutiveDashboard = () => {
  const { t } = useTranslation();
  const { isTVMode } = useTVDashboard();
  
  // Auto-refresh em background a cada 2 minutos (disable in TV mode)
  useExecutiveDashboardRefresh();

  // Get organization from user (com cache isolado)
  const { data: organizationId } = useOrganization();
  
  // CRITICAL: Get selected AWS account for multi-account isolation
  const { selectedAccountId, isLoading: accountLoading } = useAwsAccount();

  // Custos do mês atual com cache - FILTERED BY ACCOUNT
  const { data: currentMonthCosts, refetch: refetchCosts } = useQuery<any[], Error>({
    queryKey: ['executive-current-month-costs', organizationId, selectedAccountId],
    // CRITICAL: Wait for account to be loaded/selected before querying
    enabled: !!organizationId && (isTVMode || (!accountLoading && !!selectedAccountId)),
    queryFn: async () => {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      
      // Build filters
      const filters: any = { 
        organization_id: organizationId,
        cost_date: { gte: firstDayOfMonth }
      };
      
      // Only filter by account if not in TV mode
      if (!isTVMode && selectedAccountId) {
        filters.aws_account_id = selectedAccountId;
      }
      
      const response = await apiClient.select('daily_costs', {
        select: '*',
        eq: filters,
        order: { column: 'cost_date', ascending: false }
      });
      
      return response.data || [];
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Últimos 30 dias de custos para gráfico - FILTERED BY ACCOUNT
  const { data: last30DaysCosts } = useQuery<any[], Error>({
    queryKey: ['executive-30days-costs', organizationId, selectedAccountId],
    // CRITICAL: Wait for account to be loaded/selected before querying
    enabled: !!organizationId && (isTVMode || (!accountLoading && !!selectedAccountId)),
    queryFn: async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      
      // Build filters
      const filters: any = { 
        organization_id: organizationId,
        cost_date: { gte: startDate.toISOString().split('T')[0] }
      };
      
      // Only filter by account if not in TV mode
      if (!isTVMode && selectedAccountId) {
        filters.aws_account_id = selectedAccountId;
      }
      
      const response = await apiClient.select('daily_costs', {
        select: '*',
        eq: filters,
        order: { column: 'cost_date', ascending: true }
      });
      
      return response.data || [];
      
      
      
      // Agrupar por data (remover duplicatas)
      const uniqueCosts = data?.reduce((acc: any[], current: any) => {
        const key = current.cost_date;
        const existing = acc.find(item => item.cost_date === key);
        
        if (!existing) {
          acc.push(current);
        } else {
          const existingIndex = acc.indexOf(existing);
          if (new Date(current.created_at) > new Date(existing.created_at)) {
            acc[existingIndex] = current;
          }
        }
        return acc;
      }, []) || [];
      
      return uniqueCosts;
    },
    refetchInterval: 2 * 60 * 1000
  });

  // Recomendações de custo (isolado por organização)
  const { data: costRecommendations, refetch: refetchRecommendations } = useQuery<any[], Error>({
    queryKey: ['executive-cost-recommendations', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const response = await apiClient.select(tableName, { eq: filters });
      const data = response.data;
      const error = response.error;
      return data || [];
    },
    refetchInterval: 2 * 60 * 1000
  });

  // Recomendações RI/SP (isolado por organização)
  const { data: riSpRecommendations } = useQuery<any[], Error>({
    queryKey: ['executive-risp-recommendations', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const response = await apiClient.select(tableName, { eq: filters });
      const data = response.data;
      const error = response.error;
            return data || [];
    },
    refetchInterval: 2 * 60 * 1000
  });

  // Findings de segurança (isolado por organização com LIMIT)
  const { data: findings, refetch: refetchFindings } = useQuery<any[], Error>({
    queryKey: ['executive-findings', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const response = await apiClient.select(tableName, { 
        eq: filters, 
        limit: 100 // Limited to avoid overload
      });
      const data = response.data;
      const error = response.error;
      
      
      return data || [];
    },
    refetchInterval: 2 * 60 * 1000
  });

  // Tickets de remediação (isolado por organização)
  const { data: tickets, refetch: refetchTickets } = useQuery<any[], Error>({
    queryKey: ['executive-tickets', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const response = await apiClient.select(tableName, { eq: filters });
      const data = response.data;
      const error = response.error;
            return data || [];
    },
    refetchInterval: 2 * 60 * 1000
  });

  // Score de segurança (isolado por organização)
  const { data: securityPosture, refetch: refetchSecurityPosture } = useQuery({
    queryKey: ['executive-security-posture', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      // In TV mode, fetch directly from database
      if (isTVMode) {
        const response = await apiClient.select(tableName, { eq: filters });
      const data = response.data;
      const error = response.error;
              if (!findings) return null;
        
        const critical = findings.filter(f => f.severity === 'critical').length;
        const high = findings.filter(f => f.severity === 'high').length;
        const medium = findings.filter(f => f.severity === 'medium').length;
        const low = findings.filter(f => f.severity === 'low').length;
        const total = findings.length;
        
        // Calculate simple score
        const score = Math.max(0, 100 - (critical * 10 + high * 5 + medium * 2 + low * 0.5));
        
        return {
          score: Math.round(score),
          critical_count: critical,
          high_count: high,
          medium_count: medium,
          low_count: low,
          total_findings: total
        };
      }
      
      // Normal mode: use edge function
      const session = await cognitoAuth.getCurrentSession();
      if (!session) throw new Error('Not authenticated');
      
      const data = await apiClient.lambda('get-security-posture', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      
      return data?.data || null;
    },
    refetchInterval: isTVMode ? 30 * 1000 : 2 * 60 * 1000 // Faster refresh in TV mode
  });

  // Métricas de endpoints (isolado por organização)
  const { data: endpointMetrics, refetch: refetchEndpoints } = useQuery<any, Error>({
    queryKey: ['executive-endpoint-metrics', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const response = await apiClient.select(tableName, { eq: filters });
      const data = response.data;
      const error = response.error;
            if (!monitors || monitors.length === 0) return null;

      let totalHealthy = 0;
      let totalFailed = 0;
      const allResults: Record<string, any> = {};

      for (const monitor of monitors) {
        // Check if monitor is failing
        if (monitor.consecutive_failures >= monitor.alert_threshold) {
          totalFailed++;
        } else {
          totalHealthy++;
        }

        const response = await apiClient.select(tableName, { eq: filters });
      const data = response.data;
      const error = response.error;
        if (data && data.length > 0) {
          const recentResults = data.slice(0, 5);
          const olderResults = data.slice(5, 10);

          const avgRecentTime = recentResults.reduce((sum, r) => sum + r.response_time_ms, 0) / recentResults.length;
          const avgOlderTime = olderResults.length > 0
            ? olderResults.reduce((sum, r) => sum + r.response_time_ms, 0) / olderResults.length
            : avgRecentTime;

          allResults[monitor.id] = {
            avgResponseTime: avgRecentTime,
            trend: avgRecentTime > avgOlderTime ? 'up' : avgRecentTime < avgOlderTime ? 'down' : 'stable',
          };
        }
      }

      const allAvgTimes = Object.values(allResults).map((r: any) => r.avgResponseTime);
      const allTrends = Object.values(allResults).map((r: any) => r.trend);

      const overallAvg = allAvgTimes.length > 0
        ? Math.round(allAvgTimes.reduce((sum, t) => sum + t, 0) / allAvgTimes.length)
        : 0;

      const trendingUp = allTrends.filter(t => t === 'up').length;
      const trendingDown = allTrends.filter(t => t === 'down').length;
      const overallTrend = trendingUp > trendingDown ? 'up' : trendingDown > trendingUp ? 'down' : 'stable';

      return {
        avgResponseTime: overallAvg,
        trend: overallTrend,
        monitorsCount: monitors.length,
        healthyCount: totalHealthy,
        failedCount: totalFailed,
      };
    },
    refetchInterval: 30000,
  });

  // Cálculos de métricas
  const totalMonthCost = currentMonthCosts?.reduce((sum, c) => sum + Number(c.total_cost || 0), 0) || 0;
  const totalCredits = currentMonthCosts?.reduce((sum, c) => sum + Number(c.credits_used || 0), 0) || 0;
  const netMonthCost = currentMonthCosts?.reduce((sum, c) => sum + Number(c.net_cost || c.total_cost), 0) || 0;
  
  // Agrupar recomendações por tipo para evitar duplicatas
  const uniqueCostRecommendations = costRecommendations?.reduce((acc: any[], rec) => {
    const existing = acc.find(r => 
      r.recommendation_type === rec.recommendation_type && 
      r.service === rec.service
    );
    if (!existing || Number(rec.projected_savings_monthly || 0) > Number(existing.projected_savings_monthly || 0)) {
      return [...acc.filter(r => !(r.recommendation_type === rec.recommendation_type && r.service === rec.service)), rec];
    }
    return acc;
  }, []) || [];

  const totalCostSavings = uniqueCostRecommendations.reduce((sum, r) => sum + Number(r.projected_savings_monthly || 0), 0);
  const totalRiSpSavings = riSpRecommendations?.reduce((sum, r) => sum + Number(r.monthly_savings || 0), 0) || 0;
  const totalPotentialSavings = totalCostSavings + totalRiSpSavings;
  
  const criticalFindings = findings?.filter(f => f.severity === 'critical').length || 0;
  const highFindings = findings?.filter(f => f.severity === 'high').length || 0;
  const pendingFindings = findings?.filter(f => f.status === 'pending').length || 0;
  
  const pendingTickets = tickets?.filter(t => t.status === 'pending' || t.status === 'in_progress').length || 0;
  const resolvedTickets = tickets?.filter(t => t.status === 'resolved').length || 0;
  const totalTickets = tickets?.length || 0;

  // Dados do gráfico de custos
  const costChartData = last30DaysCosts?.map(c => ({
    date: new Date(c.cost_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    custo: Number(c.total_cost || 0),
    creditos: Number(c.credits_used || 0),
    liquido: Number(c.net_cost || c.total_cost),
  })) || [];

  // Usar score real da tabela security_posture
  const healthScore = securityPosture?.overall_score || 0;
  const scoreTrend = securityPosture?.trend || 'stable';
  const scoreChange = securityPosture?.score_change || 0;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Loading state - include account loading to prevent showing $0 while loading
  const isLoading = accountLoading || !currentMonthCosts || !findings || !tickets || !costRecommendations;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold">{t('executiveDashboard.title')}</h2>
            <p className="text-muted-foreground">{t('executiveDashboard.description')}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="lg:col-span-2 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-24 mb-2" />
                  <Skeleton className="h-3 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alerts Section */}
      {organizationId && (
        <DashboardAlerts organizationId={organizationId} />
      )}

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">{t('executiveDashboard.title')}</h2>
          <p className="text-muted-foreground">{t('executiveDashboard.description')}</p>
        </div>
      </div>

      {/* KPIs and Targets */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-2 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('executiveDashboard.awsHealthScore')}</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className={`text-2xl font-bold ${getScoreColor(healthScore)}`}>
                {healthScore.toFixed(1)}/100
              </div>
              {scoreChange !== 0 && (
                <span className={`text-xs ${scoreChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {scoreChange > 0 ? '+' : ''}{scoreChange.toFixed(1)}%
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {securityPosture ? (
                <>
                  {securityPosture.critical_findings} {t('executiveDashboard.criticals')}, {securityPosture.high_findings} {t('executiveDashboard.high')}
                  {securityPosture.calculated_at && (
                    <span className="block text-[10px] mt-0.5">
                      {t('executiveDashboard.updated')}: {new Date(securityPosture.calculated_at).toLocaleString()}
                    </span>
                  )}
                </>
              ) : (
                t('executiveDashboard.runSecurityScan')
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('executiveDashboard.monthlyCost')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${netMonthCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalCredits > 0 && (
                <span className="text-green-600">-${totalCredits.toFixed(2)} {t('executiveDashboard.credits')}</span>
              )}
              {!totalCredits && `${currentMonthCosts?.length || 0} ${t('executiveDashboard.days')}`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-1">
              <CardTitle className="text-sm font-medium">{t('executiveDashboard.potentialSavings')}</CardTitle>
              <InfoTooltip title="O que é economia potencial?">
                {tooltipContent.potentialSavings}
              </InfoTooltip>
            </div>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${totalPotentialSavings.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{t('executiveDashboard.perMonth')}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {costRecommendations?.length || 0} {t('executiveDashboard.costRecommendations')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-1">
              <CardTitle className="text-sm font-medium">{t('executiveDashboard.avgEndpointTime')}</CardTitle>
              <InfoTooltip title="O que é monitorado?">
                {tooltipContent.endpointMonitoring}
              </InfoTooltip>
            </div>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {endpointMetrics && endpointMetrics.monitorsCount > 0 ? (
              <>
                <div className="flex items-baseline gap-2">
                  <div className="text-2xl font-bold">
                    {endpointMetrics.avgResponseTime}ms
                  </div>
                  {endpointMetrics.trend === 'up' && (
                    <TrendingUp className="h-5 w-5 text-red-500" />
                  )}
                  {endpointMetrics.trend === 'down' && (
                    <TrendingUp className="h-5 w-5 text-green-500 rotate-180" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {endpointMetrics.monitorsCount} {t('executiveDashboard.endpointsMonitored')}
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-muted-foreground">
                  --
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('executiveDashboard.noEndpointsConfigured')}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-1">
              <CardTitle className="text-sm font-medium">{t('executiveDashboard.remediations')}</CardTitle>
              <InfoTooltip title="O que são remediações?">
                {tooltipContent.remediations}
              </InfoTooltip>
            </div>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {resolvedTickets}/{totalTickets}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {pendingTickets} {t('executiveDashboard.pendingTickets')}
            </p>
          </CardContent>
        </Card>
        </div>

        {/* Metrics with Targets */}
        {organizationId && (
          <MetricsWithTargets organizationId={organizationId} />
        )}
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('executiveDashboard.costEvolution')}</CardTitle>
            <CardDescription>{t('executiveDashboard.costEvolutionDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={costChartData}>
                <defs>
                  <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="date" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                  formatter={(value: number) => `$${value.toFixed(2)}`}
                />
                <Area 
                  type="monotone" 
                  dataKey="custo" 
                  stroke="hsl(var(--primary))" 
                  fill="url(#totalGradient)"
                  strokeWidth={2}
                  name={t('executiveDashboard.totalCost')}
                />
                <Area 
                  type="monotone" 
                  dataKey="liquido" 
                  stroke="#10b981" 
                  fill="url(#netGradient)"
                  strokeWidth={2}
                  name={t('executiveDashboard.netCost')}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('executiveDashboard.savingsBreakdown')}</CardTitle>
            <CardDescription>
              {t('executiveDashboard.savingsBreakdownDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span className="text-sm">{t('executiveDashboard.costOptimizations')}</span>
                </div>
                <div className="text-right">
                  <div className="font-semibold">${totalCostSavings.toFixed(0)}{t('executiveDashboard.perMonth')}</div>
                  <div className="text-xs text-muted-foreground">
                    {uniqueCostRecommendations.length} {t('executiveDashboard.recommendations')}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-sm">{t('executiveDashboard.riSavingsPlans')}</span>
                </div>
                <div className="text-right">
                  <div className="font-semibold">${totalRiSpSavings.toFixed(0)}{t('executiveDashboard.perMonth')}</div>
                  <div className="text-xs text-muted-foreground">
                    {riSpRecommendations?.length || 0} {t('executiveDashboard.recommendations')}
                  </div>
                </div>
              </div>
              <div className="border-t pt-3 mt-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{t('executiveDashboard.totalPotential')}</span>
                  <span className="text-lg font-bold text-green-600">
                    ${totalPotentialSavings.toFixed(0)}{t('executiveDashboard.perMonth')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  ${(totalPotentialSavings * 12).toFixed(0)} {t('executiveDashboard.perYear')}
                </p>
                <p className="text-xs text-amber-600 mt-2 flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>{t('executiveDashboard.estimatedValuesWarning')}</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Insights */}
      {organizationId && (
        <AIInsights organizationId={organizationId} />
      )}

      {/* Saúde dos Endpoints */}
      <Card className="glass border-primary/20 hover-scale">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>{t('executiveDashboard.endpointHealth')}</CardTitle>
            </div>
          </div>
          <CardDescription>{t('executiveDashboard.realtimeMonitoringStatus')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="flex flex-col items-center p-3 rounded-lg glass">
              <Shield className="h-5 w-5 text-primary mb-1" />
              <span className="text-2xl font-bold text-primary">{endpointMetrics?.monitorsCount || 0}</span>
              <span className="text-xs text-muted-foreground">{t('executiveDashboard.totalMonitored')}</span>
            </div>

            <div className="flex flex-col items-center p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="h-5 w-5 text-green-500 mb-1" />
              <span className="text-2xl font-bold text-green-500">{endpointMetrics?.healthyCount || 0}</span>
              <span className="text-xs text-muted-foreground">{t('executiveDashboard.healthy')}</span>
            </div>

            <div className="flex flex-col items-center p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="h-5 w-5 text-red-500 mb-1" />
              <span className="text-2xl font-bold text-red-500">{endpointMetrics?.failedCount || 0}</span>
              <span className="text-xs text-muted-foreground">{t('executiveDashboard.withFailure')}</span>
            </div>

            <div className="flex flex-col items-center p-3 rounded-lg glass">
              <Clock className="h-5 w-5 text-primary mb-1" />
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">{endpointMetrics?.avgResponseTime || 0}</span>
                <span className="text-xs text-muted-foreground">ms</span>
                {endpointMetrics?.trend === 'up' && (
                  <TrendingUp className="h-4 w-4 text-red-500" />
                )}
                {endpointMetrics?.trend === 'down' && (
                  <TrendingDown className="h-4 w-4 text-green-500" />
                )}
              </div>
              <span className="text-xs text-muted-foreground">{t('executiveDashboard.avgTime')}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo de Findings */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              {t('executiveDashboard.criticalIssues')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{criticalFindings}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('executiveDashboard.requiresImmediateAction')}</p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 dark:border-orange-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              {t('executiveDashboard.highPriorityIssues')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{highFindings}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('executiveDashboard.priorityAction')}</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 dark:border-blue-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              {t('executiveDashboard.totalPending')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{pendingFindings}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('executiveDashboard.awaitingAnalysis')}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
