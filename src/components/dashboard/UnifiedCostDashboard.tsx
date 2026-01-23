/**
 * Unified Cost Dashboard Component
 * 
 * Displays combined cost data from AWS and Azure in a single view.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
 ResponsiveContainer, 
 BarChart, 
 Bar, 
 XAxis, 
 YAxis, 
 CartesianGrid, 
 Tooltip, 
 Legend,
 PieChart,
 Pie,
 Cell,
 LineChart,
 Line,
} from 'recharts';
import { 
 DollarSign, 
 Cloud, 
 TrendingUp, 
 TrendingDown,
 Minus,
 Server
} from 'lucide-react';
import { apiClient } from '@/integrations/aws/api-client';
import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { useOrganization } from '@/hooks/useOrganization';
import { cn } from '@/lib/utils';

interface CostData {
 date: string;
 cost: number;
 service?: string;
 provider: 'AWS' | 'AZURE';
}

interface ProviderSummary {
 provider: 'AWS' | 'AZURE';
 totalCost: number;
 avgDailyCost: number;
 trend: number;
 topServices: Array<{ service: string; cost: number }>;
}

const PROVIDER_COLORS = {
 AWS: '#FF9900',
 AZURE: '#0078D4',
};

const SERVICE_COLORS = [
 '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00C49F',
 '#FFBB28', '#FF8042', '#0088FE', '#00C49F', '#FFBB28',
];

export function UnifiedCostDashboard() {
 const { t } = useTranslation();
 const { awsAccounts, azureAccounts } = useCloudAccount();
 const { data: organizationId } = useOrganization();

 // Calculate date range (last 30 days)
 const dateRange = useMemo(() => {
 const endDate = new Date();
 const startDate = new Date();
 startDate.setDate(startDate.getDate() - 30);
 return {
 startDate: startDate.toISOString().split('T')[0],
 endDate: endDate.toISOString().split('T')[0],
 };
 }, []);

 // Fetch AWS costs
 const { data: awsCosts, isLoading: loadingAws } = useQuery({
 queryKey: ['unified-aws-costs', organizationId, awsAccounts?.map(a => a.id)],
 enabled: !!organizationId && awsAccounts && awsAccounts.length > 0,
 staleTime: 10 * 60 * 1000,
 queryFn: async () => {
 const allCosts: CostData[] = [];
 
 for (const account of awsAccounts || []) {
 const result = await apiClient.select('daily_costs', {
 select: 'date, cost, service',
 eq: { 
 organization_id: organizationId,
 aws_account_id: account.id,
 },
 gte: { date: dateRange.startDate },
 lte: { date: dateRange.endDate },
 });
 
 if (!result.error && result.data) {
 for (const row of result.data) {
 allCosts.push({
 date: row.date,
 cost: parseFloat(row.cost) || 0,
 service: row.service,
 provider: 'AWS',
 });
 }
 }
 }
 
 return allCosts;
 },
 });

 // Fetch Azure costs
 const { data: azureCosts, isLoading: loadingAzure } = useQuery({
 queryKey: ['unified-azure-costs', organizationId, azureAccounts?.map(a => a.id)],
 enabled: !!organizationId && azureAccounts && azureAccounts.length > 0,
 staleTime: 10 * 60 * 1000,
 queryFn: async () => {
 const allCosts: CostData[] = [];
 
 for (const account of azureAccounts || []) {
 const result = await apiClient.select('daily_costs', {
 select: 'date, cost, service',
 eq: { 
 organization_id: organizationId,
 aws_account_id: account.id, // Azure uses same field
 },
 gte: { date: dateRange.startDate },
 lte: { date: dateRange.endDate },
 });
 
 if (!result.error && result.data) {
 for (const row of result.data) {
 allCosts.push({
 date: row.date,
 cost: parseFloat(row.cost) || 0,
 service: row.service,
 provider: 'AZURE',
 });
 }
 }
 }
 
 return allCosts;
 },
 });

 const isLoading = loadingAws || loadingAzure;

 // Calculate summaries
 const summaries = useMemo(() => {
 const result: ProviderSummary[] = [];
 
 // AWS Summary
 if (awsCosts && awsCosts.length > 0) {
 const totalCost = awsCosts.reduce((sum, c) => sum + c.cost, 0);
 const days = new Set(awsCosts.map(c => c.date)).size || 1;
 const avgDailyCost = totalCost / days;
 
 // Calculate trend (last 7 days vs previous 7 days)
 const recentDate = new Date();
 recentDate.setDate(recentDate.getDate() - 7);
 const recentCosts = awsCosts.filter(c => new Date(c.date) >= recentDate);
 const recentTotal = recentCosts.reduce((sum, c) => sum + c.cost, 0);
 const recentAvg = recentTotal / 7;
 const trend = avgDailyCost > 0 ? ((recentAvg - avgDailyCost) / avgDailyCost) * 100 : 0;
 
 // Top services
 const serviceMap = new Map<string, number>();
 for (const c of awsCosts) {
 if (c.service) {
 serviceMap.set(c.service, (serviceMap.get(c.service) || 0) + c.cost);
 }
 }
 const topServices = Array.from(serviceMap.entries())
 .sort((a, b) => b[1] - a[1])
 .slice(0, 5)
 .map(([service, cost]) => ({ service, cost }));
 
 result.push({
 provider: 'AWS',
 totalCost,
 avgDailyCost,
 trend,
 topServices,
 });
 }
 
 // Azure Summary
 if (azureCosts && azureCosts.length > 0) {
 const totalCost = azureCosts.reduce((sum, c) => sum + c.cost, 0);
 const days = new Set(azureCosts.map(c => c.date)).size || 1;
 const avgDailyCost = totalCost / days;
 
 const recentDate = new Date();
 recentDate.setDate(recentDate.getDate() - 7);
 const recentCosts = azureCosts.filter(c => new Date(c.date) >= recentDate);
 const recentTotal = recentCosts.reduce((sum, c) => sum + c.cost, 0);
 const recentAvg = recentTotal / 7;
 const trend = avgDailyCost > 0 ? ((recentAvg - avgDailyCost) / avgDailyCost) * 100 : 0;
 
 const serviceMap = new Map<string, number>();
 for (const c of azureCosts) {
 if (c.service) {
 serviceMap.set(c.service, (serviceMap.get(c.service) || 0) + c.cost);
 }
 }
 const topServices = Array.from(serviceMap.entries())
 .sort((a, b) => b[1] - a[1])
 .slice(0, 5)
 .map(([service, cost]) => ({ service, cost }));
 
 result.push({
 provider: 'AZURE',
 totalCost,
 avgDailyCost,
 trend,
 topServices,
 });
 }
 
 return result;
 }, [awsCosts, azureCosts]);

 // Combined daily costs for chart
 const dailyChartData = useMemo(() => {
 const dateMap = new Map<string, { date: string; AWS: number; AZURE: number; total: number }>();
 
 for (const cost of [...(awsCosts || []), ...(azureCosts || [])]) {
 if (!dateMap.has(cost.date)) {
 dateMap.set(cost.date, { date: cost.date, AWS: 0, AZURE: 0, total: 0 });
 }
 const entry = dateMap.get(cost.date)!;
 entry[cost.provider] += cost.cost;
 entry.total += cost.cost;
 }
 
 return Array.from(dateMap.values())
 .sort((a, b) => a.date.localeCompare(b.date))
 .map(d => ({
 ...d,
 date: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
 }));
 }, [awsCosts, azureCosts]);

 // Provider distribution for pie chart
 const providerDistribution = useMemo(() => {
 return summaries.map(s => ({
 name: s.provider,
 value: s.totalCost,
 color: PROVIDER_COLORS[s.provider],
 }));
 }, [summaries]);

 // Total cost
 const totalCost = summaries.reduce((sum, s) => sum + s.totalCost, 0);

 if (!awsAccounts?.length && !azureAccounts?.length) {
 return (
 <Card className="">
 <CardContent className="pt-6">
 <div className="flex items-center gap-4">
 <div className="p-3 rounded-full bg-muted">
 <Cloud className="h-6 w-6 text-muted-foreground" />
 </div>
 <div>
 <h3 className="font-semibold">{t('common.noAccountConnected', 'No account connected')}</h3>
 <p className="text-sm text-muted-foreground">
 {t('common.connectAccountsToView', 'Connect AWS or Azure accounts to view')} {t('costs.unifiedCosts', 'unified costs')}.
 </p>
 </div>
 </div>
 </CardContent>
 </Card>
 );
 }

 if (isLoading) {
 return (
 <div className="space-y-6">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 {[1, 2, 3].map(i => (
 <Card key={i} className="">
 <CardContent className="pt-6">
 <Skeleton className="h-8 w-24 mb-2" />
 <Skeleton className="h-4 w-32" />
 </CardContent>
 </Card>
 ))}
 </div>
 <Card className="">
 <CardContent className="pt-6">
 <Skeleton className="h-[300px] w-full" />
 </CardContent>
 </Card>
 </div>
 );
 }

 return (
 <div className="space-y-6">
 {/* Summary Cards */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 {/* Total Cost */}
 <Card className="">
 <CardContent className="pt-6">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm text-muted-foreground">Custo Total (30 dias)</p>
 <p className="text-3xl font-semibold">${totalCost.toFixed(2)}</p>
 <p className="text-xs text-muted-foreground mt-1">
 {summaries.length} provider{summaries.length !== 1 ? 's' : ''} conectado{summaries.length !== 1 ? 's' : ''}
 </p>
 </div>
 <DollarSign className="h-10 w-10 text-primary/50" />
 </div>
 </CardContent>
 </Card>

 {/* Provider Cards */}
 {summaries.map(summary => (
 <Card 
 key={summary.provider} 
 className={cn(
 "",
 summary.provider === 'AWS' ? "border-orange-500/30" : "border-blue-500/30"
 )}
 >
 <CardContent className="pt-6">
 <div className="flex items-center justify-between">
 <div>
 <div className="flex items-center gap-2 mb-1">
 <Badge 
 style={{ backgroundColor: PROVIDER_COLORS[summary.provider] }}
 className="text-white"
 >
 {summary.provider}
 </Badge>
 {summary.trend > 5 ? (
 <TrendingUp className="h-4 w-4 text-red-500" />
 ) : summary.trend < -5 ? (
 <TrendingDown className="h-4 w-4 text-green-500" />
 ) : (
 <Minus className="h-4 w-4 text-muted-foreground" />
 )}
 </div>
 <p className="text-2xl font-semibold">${summary.totalCost.toFixed(2)}</p>
 <p className="text-xs text-muted-foreground">
 ${summary.avgDailyCost.toFixed(2)}/dia • {summary.trend > 0 ? '+' : ''}{summary.trend.toFixed(1)}%
 </p>
 </div>
 <Server 
 className="h-8 w-8" 
 style={{ color: PROVIDER_COLORS[summary.provider] + '80' }}
 />
 </div>
 </CardContent>
 </Card>
 ))}
 </div>

 {/* Charts Row */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 {/* Daily Costs Chart */}
 <Card className=" lg:col-span-2">
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <TrendingUp className="h-5 w-5" />
 Custos Diários por Provider
 </CardTitle>
 <CardDescription>Comparação de custos AWS vs Azure nos últimos 30 dias</CardDescription>
 </CardHeader>
 <CardContent>
 <ResponsiveContainer width="100%" height={300}>
 <BarChart data={dailyChartData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="date" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
 <Tooltip 
 formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
 labelStyle={{ color: '#000' }}
 />
 <Legend />
 <Bar dataKey="AWS" stackId="a" fill={PROVIDER_COLORS.AWS} name="AWS" />
 <Bar dataKey="AZURE" stackId="a" fill={PROVIDER_COLORS.AZURE} name="Azure" />
 </BarChart>
 </ResponsiveContainer>
 </CardContent>
 </Card>

 {/* Distribution Pie Chart */}
 <Card className="">
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Cloud className="h-5 w-5" />
 Distribuição
 </CardTitle>
 <CardDescription>Proporção de custos por provider</CardDescription>
 </CardHeader>
 <CardContent>
 <ResponsiveContainer width="100%" height={300}>
 <PieChart>
 <Pie
 data={providerDistribution}
 cx="50%"
 cy="50%"
 innerRadius={60}
 outerRadius={100}
 paddingAngle={5}
 dataKey="value"
 label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
 >
 {providerDistribution.map((entry, index) => (
 <Cell key={`cell-${index}`} fill={entry.color} />
 ))}
 </Pie>
 <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'Custo']} />
 </PieChart>
 </ResponsiveContainer>
 </CardContent>
 </Card>
 </div>

 {/* Top Services by Provider */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 {summaries.map(summary => (
 <Card key={summary.provider} className="">
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Badge 
 style={{ backgroundColor: PROVIDER_COLORS[summary.provider] }}
 className="text-white"
 >
 {summary.provider}
 </Badge>
 Top 5 Serviços
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-3">
 {summary.topServices.map((service, idx) => (
 <div key={service.service} className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <div 
 className="w-3 h-3 rounded-full" 
 style={{ backgroundColor: SERVICE_COLORS[idx % SERVICE_COLORS.length] }}
 />
 <span className="text-sm truncate max-w-[200px]">{service.service}</span>
 </div>
 <span className="font-medium">${service.cost.toFixed(2)}</span>
 </div>
 ))}
 {summary.topServices.length === 0 && (
 <p className="text-sm text-muted-foreground text-center py-4">
 Nenhum dado de serviço disponível
 </p>
 )}
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 </div>
 );
}
