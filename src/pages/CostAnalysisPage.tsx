import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Calendar, Download, TrendingUp, TrendingDown, RefreshCw, ChevronLeft, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { CostForecast } from "@/components/dashboard/cost-analysis/CostForecast";
import { CostTrends } from "@/components/dashboard/cost-analysis/CostTrends";
import { ExportManager } from "@/components/dashboard/cost-analysis/ExportManager";
import { RiSpAnalysis } from "@/components/cost/RiSpAnalysis";
import { formatDateBR, compareDates, calculatePercentageChange } from "@/lib/utils";
import { Layout } from "@/components/Layout";

import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useDemoAwareQuery } from "@/hooks/useDemoAwareQuery";
import { getCostErrorDescription } from "@/lib/cost-error-utils";

interface CostAnalysisPageProps {
 embedded?: boolean; // When true, doesn't render Layout wrapper (for use inside Index.tsx)
}

export const CostAnalysisPage = ({ embedded = false }: CostAnalysisPageProps) => {
 const { toast } = useToast();
 const { t } = useTranslation();
 const queryClient = useQueryClient();
 const [selectedRegion, setSelectedRegion] = useState<string>('all');
 const [selectedTag, setSelectedTag] = useState<string>('all');
 const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
 const [expandedOther, setExpandedOther] = useState<Set<string>>(new Set());
 const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'custom'>('30d');
 
 // Custom date range
 const [customStartDate, setCustomStartDate] = useState<string>(() => {
 const d = new Date();
 d.setDate(d.getDate() - 30);
 return d.toISOString().split('T')[0];
 });
 const [customEndDate, setCustomEndDate] = useState<string>(() => {
 return new Date().toISOString().split('T')[0];
 });
 
 // Pagination state
 const [currentPage, setCurrentPage] = useState(1);
 const [itemsPerPage, setItemsPerPage] = useState(10);

 // Use global account context for multi-account isolation
 const { selectedAccountId, accounts: allAccounts, selectedProvider } = useCloudAccount();
 const { getAccountFilter } = useAccountFilter();
 const { data: organizationId } = useOrganization();
 const { shouldEnableAccountQuery } = useDemoAwareQuery();

 // Get available tags from organization - filtered by selected account
 const { data: availableTags } = useQuery({
 queryKey: ['cost-allocation-tags', organizationId, selectedAccountId],
 enabled: shouldEnableAccountQuery(),
 staleTime: Infinity,
 gcTime: 60 * 60 * 1000,
 queryFn: async () => {
 // Query tags filtered by selected account
 const response = await apiClient.select('cost_allocation_tags', { 
 eq: { organization_id: organizationId, ...getAccountFilter() } 
 });
 const data = response.data;
 const error = response.error;
 // Group by tag_key and collect unique values
 const tagMap = (data || []).reduce((acc, tag) => {
 const key = `${tag.tag_key}:${tag.tag_value}`;
 if (!acc.some(t => t.key === key)) {
 acc.push({ key, label: `${tag.tag_key}: ${tag.tag_value}` });
 }
 return acc;
 }, [] as { key: string; label: string }[]);
 
 return tagMap;
 },
 });

 // Get daily costs - FILTERED BY SELECTED ACCOUNT - enabled in demo mode
 const { data: allCosts, isLoading } = useQuery({
 queryKey: ['cost-analysis-raw', 'org', organizationId, 'account', selectedAccountId, dateRange, customStartDate, customEndDate],
 enabled: shouldEnableAccountQuery(),
 staleTime: 5 * 60 * 1000, // 5 minutes - allow refetch on account change
 gcTime: 60 * 60 * 1000,
 refetchOnWindowFocus: false,
 queryFn: async () => {
 
 let startDate: Date;
 let endDate = new Date();
 
 if (dateRange === 'custom') {
 startDate = new Date(customStartDate);
 endDate = new Date(customEndDate);
 } else {
 const daysAgo = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
 startDate = new Date();
 startDate.setDate(startDate.getDate() - daysAgo);
 }
 
 // Format dates for comparison
 const startDateStr = startDate.toISOString().split('T')[0];
 const endDateStr = endDate.toISOString().split('T')[0];
 
 // Multi-cloud support: Use different Lambda based on provider
 const isAzure = selectedProvider === 'AZURE';
 const lambdaName = isAzure ? 'azure-fetch-costs' : 'fetch-daily-costs';
 const bodyParams = isAzure 
   ? { 
       credentialId: selectedAccountId,
       startDate: startDateStr,
       endDate: endDateStr,
       granularity: 'DAILY'
     }
   : {
       accountId: selectedAccountId,
       startDate: startDateStr,
       endDate: endDateStr,
       granularity: 'DAILY',
       incremental: true  // Use incremental fetch to avoid re-fetching all data
     };
 
 // IMPORTANT: Parameters must be inside 'body' for the Lambda to receive them correctly
 const lambdaResponse = await apiClient.invoke<any>(lambdaName, {
   body: bodyParams
 });
 
 if (lambdaResponse.error) {
   console.error('CostAnalysisPage: Lambda error:', lambdaResponse.error);
   // Fallback to direct DB query if Lambda fails
   const response = await apiClient.select('daily_costs', { 
     eq: { organization_id: organizationId, ...getAccountFilter() },
     gte: { date: startDateStr },
     lte: { date: endDateStr },
     order: { column: 'date', ascending: false }
   });
   
   return response.data || [];
 }
 
 // Lambda returns different formats for AWS vs Azure
 const lambdaData = lambdaResponse.data;
 
 // For Azure: Lambda saves to DB and returns summary (byService), so we need to query DB
 // For AWS: Lambda returns costs array directly
 let costs: any[] = [];
 
 if (isAzure) {
   // Azure Lambda saves data to DB, query it directly
   const dbResponse = await apiClient.select('daily_costs', { 
     eq: { organization_id: organizationId, ...getAccountFilter() },
     gte: { date: startDateStr },
     lte: { date: endDateStr },
     order: { column: 'date', ascending: false }
   });
   costs = dbResponse.data || [];
 } else {
   // AWS: Extract costs array from Lambda response
   costs = lambdaData?.costs || lambdaData?.data?.dailyCosts || [];
 }
 
 if (!costs || costs.length === 0) {
   return [];
 }
 
 
 // Transform raw data (per service) into aggregated format (per date)
 // Raw schema: { id, organization_id, aws_account_id, date, service, cost, usage, currency }
 // Expected format: { cost_date, aws_account_id, total_cost, service_breakdown, ... }
 const dateMap = new Map<string, {
 cost_date: string;
 aws_account_id: string;
 total_cost: number;
 service_breakdown: Record<string, number>;
 credits_used: number;
 net_cost: number;
 created_at: string;
 id: string;
 }>();
 
 for (const row of costs) {
 // Handle both 'date' and 'cost_date' field names
 // Prisma returns Date objects, API might return strings
 const dateValue = row.date || row.cost_date;
 if (!dateValue) {
 console.warn('Skipping row with no date:', row);
 continue;
 }
 
 let dateStr: string;
 try {
 if (typeof dateValue === 'string') {
 dateStr = dateValue.split('T')[0];
 } else if (dateValue instanceof Date) {
 dateStr = dateValue.toISOString().split('T')[0];
 } else {
 // Try to parse as date
 const parsed = new Date(dateValue);
 if (isNaN(parsed.getTime())) {
 console.warn('Invalid date value:', dateValue);
 continue;
 }
 dateStr = parsed.toISOString().split('T')[0];
 }
 } catch (e) {
 console.warn('Error parsing date:', dateValue, e);
 continue;
 }
 
 const accountId = row.aws_account_id || selectedAccountId;
 
 if (!dateMap.has(dateStr)) {
 dateMap.set(dateStr, {
 cost_date: dateStr,
 aws_account_id: accountId,
 total_cost: 0,
 service_breakdown: {},
 credits_used: 0,
 net_cost: 0,
 created_at: row.created_at || new Date().toISOString(),
 id: row.id || crypto.randomUUID(),
 });
 }
 
 const entry = dateMap.get(dateStr)!;
 const rawCost = typeof row.cost === 'number' ? row.cost : parseFloat(String(row.cost || '0'));
 const cost = isNaN(rawCost) ? 0 : rawCost;
 entry.total_cost += cost;
 entry.net_cost += cost;
 if (row.service) {
 entry.service_breakdown[row.service] = (entry.service_breakdown[row.service] || 0) + cost;
 }
 }
 
 return Array.from(dateMap.values()).sort((a, b) => 
 compareDates(b.cost_date, a.cost_date)
 );
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

 // Mutation to refresh costs - supports both AWS and Azure
 const refreshCostsMutation = useMutation({
 mutationFn: async () => {
 const accountId = selectedAccountId === 'all' ? allAccounts?.[0]?.id : selectedAccountId;
 
 if (!accountId) {
 throw new Error(t('costAnalysis.noCloudAccount'));
 }

 // Use provider from context for consistency
 const isAzure = selectedProvider === 'AZURE';

 if (isAzure) {
 // Azure: First trigger azure-fetch-costs in background (fire-and-forget)
 // Then immediately return data from database via fetch-daily-costs
 const endDate = new Date().toISOString().split('T')[0];
 const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
 
 // Fire-and-forget: trigger Azure cost sync (don't await)
 apiClient.invoke('azure-fetch-costs', {
 body: { 
 credentialId: accountId, 
 startDate,
 endDate,
 granularity: 'DAILY'
 },
 timeoutMs: 120000,
 }).then((res) => {
 if (!res.error) {
 // Refresh UI after background sync completes
 queryClient.invalidateQueries({ queryKey: ['cost-analysis-raw'], exact: false });
 queryClient.invalidateQueries({ queryKey: ['daily-costs'], exact: false });
 }
 }).catch(() => { /* silent - background sync */ });
 
 // Return existing data from database immediately
 const result = await apiClient.invoke<any>('fetch-daily-costs', {
 body: { accountId, days: 90, incremental: true }
 });
 
 if (result.error) {
 throw new Error(result.error.message || t('costAnalysis.updateError'));
 }
 
 const data = result.data;
 return data?.success ? data : {
 success: true,
 data: { dailyCosts: data?.costs || [] },
 summary: data?.summary || { totalRecords: 0, newRecords: 0 },
 };
 } else {
 // AWS: Call fetch-daily-costs Lambda with incremental fetch
 const result = await apiClient.invoke<any>('fetch-daily-costs', {
 body: { accountId: accountId, days: 90, incremental: true }
 });
 
 if (result.error) {
 throw new Error(result.error.message || t('costAnalysis.updateError'));
 }
 
 const data = result.data;
 
 if (!data?.success) {
 const errorMsg = typeof data?.error === 'string' 
 ? data.error 
 : data?.error?.message || t('costAnalysis.updateError');
 throw new Error(errorMsg);
 }

 return data;
 }
 },
 onSuccess: (data) => {
 const summary = data.summary || {};
 const daysUpdated = summary.uniqueDates || 0;
 const newRecords = summary.newRecords || 0;
 
 // Invalidate queries to refresh UI - pattern matching for all organization variants
 queryClient.invalidateQueries({ queryKey: ['cost-analysis-raw'], exact: false });
 queryClient.invalidateQueries({ queryKey: ['daily-costs'], exact: false });
 queryClient.invalidateQueries({ queryKey: ['daily-costs-history'], exact: false });
 
 // Only show toast if not background refresh
 if (!document.hidden) {
 const message = newRecords > 0 
 ? t('costAnalysis.daysUpdated', { count: daysUpdated })
 : t('costAnalysis.noNewData');
 
 toast({
 title: newRecords > 0 ? t('costAnalysis.costsUpdated') : t('common.information'),
 description: message,
 });
 }
 },
 onError: (error: any) => {
 console.error('Error refreshing costs:', error);
 
 // Only show error toast if not background refresh
 if (!document.hidden) {
 const errorMsg = error?.message || t('common.unknownError');
 
 toast({
 title: t('costAnalysis.updateError'),
 description: getCostErrorDescription(errorMsg, selectedProvider, t),
 variant: "destructive",
 });
 }
 },
 });

 // Mutation for full cost data fetch (non-incremental) - supports both AWS and Azure
 const fullFetchCostsMutation = useMutation({
 mutationFn: async () => {
 const accountId = selectedAccountId === 'all' ? allAccounts?.[0]?.id : selectedAccountId;
 
 if (!accountId) {
 throw new Error(t('costAnalysis.noCloudAccount'));
 }

 // Use provider from context for consistency
 const isAzure = selectedProvider === 'AZURE';

 if (isAzure) {
 // Azure: First trigger azure-fetch-costs in background (fire-and-forget)
 // Then immediately return data from database via fetch-daily-costs
 const endDate = new Date().toISOString().split('T')[0];
 const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Azure API max 1 year
 
 // Fire-and-forget: trigger Azure cost sync (don't await)
 apiClient.invoke('azure-fetch-costs', {
 body: { 
 credentialId: accountId, 
 startDate,
 endDate,
 granularity: 'DAILY'
 },
 timeoutMs: 120000,
 }).then((res) => {
 if (!res.error) {
 // Refresh UI after background sync completes
 queryClient.invalidateQueries({ queryKey: ['cost-analysis-raw'], exact: false });
 queryClient.invalidateQueries({ queryKey: ['daily-costs'], exact: false });
 }
 }).catch(() => { /* silent - background sync */ });
 
 // Return existing data from database immediately
 const result = await apiClient.invoke<any>('fetch-daily-costs', {
 body: { 
 accountId,
 incremental: false,
 granularity: 'DAILY',
 startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
 }
 });
 
 if (result.error) {
 throw new Error(result.error.message || t('costAnalysis.updateError'));
 }
 
 const data = result.data;
 return data?.success ? data : {
 success: true,
 data: { dailyCosts: data?.costs || [] },
 summary: data?.summary || { totalRecords: 0, newRecords: 0 },
 };
 } else {
 // AWS: Call fetch-daily-costs Lambda
 const result = await apiClient.invoke<any>('fetch-daily-costs', {
 body: { 
 accountId: accountId, 
 incremental: false, // Force full fetch
 granularity: 'DAILY',
 startDate: '2024-01-01' // Fetch from beginning of 2024
 }
 });
 
 if (result.error) {
 throw new Error(result.error.message || t('costAnalysis.updateError'));
 }
 
 const data = result.data;
 
 if (!data?.success) {
 const errorMsg = typeof data?.error === 'string' 
 ? data.error 
 : data?.error?.message || t('costAnalysis.updateError');
 throw new Error(errorMsg);
 }

 return data;
 }
 },
 onSuccess: (data) => {
 const summary = data.summary || {};
 const daysUpdated = summary.uniqueDates || 0;
 const newRecords = summary.newRecords || 0;
 
 toast({
 title: t('costAnalysis.fullFetchSuccess'),
 description: newRecords > 0 
 ? t('costAnalysis.fullFetchDaysLoaded', { count: daysUpdated })
 : t('costAnalysis.fullFetchNoNewData'),
 });
 
 // Invalidate and refetch immediately
 queryClient.invalidateQueries({ queryKey: ['cost-analysis-raw'], exact: false });
 queryClient.invalidateQueries({ queryKey: ['daily-costs'], exact: false });
 queryClient.invalidateQueries({ queryKey: ['daily-costs-history'], exact: false });
 },
 onError: (error: any) => {
 console.error('Error in full fetch costs:', error);
 
 const errorMsg = error?.message || t('common.unknownError');
 
 toast({
 title: t('costAnalysis.fullFetchError'),
 description: getCostErrorDescription(errorMsg, selectedProvider, t),
 variant: "destructive",
 });
 },
 });

 // Auto-refresh on component mount (background) - only when no cached data
 useEffect(() => {
 const accountId = selectedAccountId === 'all' ? allAccounts?.[0]?.id : selectedAccountId;
 
 if (accountId && (!allCosts || allCosts.length === 0)) {
 // If no data at all, refresh immediately
 refreshCostsMutation.mutate();
 }
 // If has cached data, skip auto-refresh - user can manually refresh
 // This eliminates the 2s delay that caused perceived slowness
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

 // Pagination calculations
 const totalPages = Math.ceil(sortedDates.length / itemsPerPage);
 const paginatedDates = useMemo(() => {
 const startIndex = (currentPage - 1) * itemsPerPage;
 return sortedDates.slice(startIndex, startIndex + itemsPerPage);
 }, [sortedDates, currentPage, itemsPerPage]);

 // Reset page when filters change
 useEffect(() => {
 setCurrentPage(1);
 }, [selectedRegion, selectedTag, selectedAccountId]);

 // Skeleton that mirrors the real page structure for perceived performance
 const mainContentSkeleton = (
 <>
 {/* Summary Stats Skeleton */}
 <div className="grid gap-4 md:grid-cols-4">
 {Array.from({ length: 4 }).map((_, i) => (
 <Card key={i} className="glass border-primary/20">
 <CardHeader className="pb-2">
 <Skeleton className="h-4 w-24" />
 </CardHeader>
 <CardContent>
 <Skeleton className="h-8 w-32" />
 </CardContent>
 </Card>
 ))}
 </div>
 {/* Chart Skeleton */}
 <Card className="glass border-primary/20">
 <CardHeader>
 <Skeleton className="h-6 w-48" />
 <Skeleton className="h-4 w-72 mt-1" />
 </CardHeader>
 <CardContent>
 <Skeleton className="h-[400px] w-full rounded-md" />
 </CardContent>
 </Card>
 {/* Table Skeleton */}
 <Card className="glass border-primary/20">
 <CardHeader>
 <div className="flex items-center justify-between">
 <div>
 <Skeleton className="h-6 w-56" />
 <Skeleton className="h-4 w-80 mt-1" />
 </div>
 <div className="flex gap-2">
 <Skeleton className="h-9 w-28" />
 <Skeleton className="h-9 w-28" />
 </div>
 </div>
 </CardHeader>
 <CardContent className="space-y-3">
 {/* Filter skeletons */}
 <div className="flex gap-4">
 {Array.from({ length: 3 }).map((_, i) => (
 <Skeleton key={i} className="h-10 flex-1 min-w-[200px]" />
 ))}
 </div>
 {/* Table rows skeleton */}
 {Array.from({ length: 6 }).map((_, i) => (
 <Skeleton key={i} className="h-12 w-full" />
 ))}
 </CardContent>
 </Card>
 </>
 );

 const content = (
 <div className="space-y-4">
 {/* Reserved Instances & Savings Plans - renders independently with own loading */}
 <RiSpAnalysis />
 
 {/* Previsão e Tendências - render independently with own loading */}
 <div className="grid gap-4 md:grid-cols-2">
 <CostForecast accountId={selectedAccountId} />
 <CostTrends accountId={selectedAccountId} costs={isLoading ? [] : (costs || [])} />
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
 disabled={refreshCostsMutation.isPending || isLoading}
 >
 <RefreshCw className={`h-4 w-4 mr-2 ${refreshCostsMutation.isPending ? 'animate-spin' : ''}`} />
 {refreshCostsMutation.isPending ? t('costAnalysis.refreshing') : t('costAnalysis.refresh')}
 </Button>
 <Button 
 variant="outline" 
 size="sm" 
 onClick={() => fullFetchCostsMutation.mutate()}
 disabled={fullFetchCostsMutation.isPending || isLoading}
 className="bg-blue-50 hover:bg-blue-100 border-blue-200"
 >
 <RefreshCw className={`h-4 w-4 mr-2 ${fullFetchCostsMutation.isPending ? 'animate-spin' : ''}`} />
 {fullFetchCostsMutation.isPending ? t('costAnalysis.fullFetchLoading') : t('costAnalysis.fullFetchButton')}
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
 {/* Show skeleton for main content area while loading */}
 {isLoading ? mainContentSkeleton : (
 <>
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
 <Select value={dateRange} onValueChange={(v) => {
 setDateRange(v as '7d' | '30d' | '90d' | 'custom');
 setCurrentPage(1); // Reset pagination on filter change
 }}>
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="7d">{t('costAnalysis.last7days')}</SelectItem>
 <SelectItem value="30d">{t('costAnalysis.last30days')}</SelectItem>
 <SelectItem value="90d">{t('costAnalysis.last90days')}</SelectItem>
 <SelectItem value="custom">Personalizado</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 
 {/* Custom Date Range */}
 {dateRange === 'custom' && (
 <div className="flex gap-4 flex-wrap items-end">
 <div className="flex-1 min-w-[150px] max-w-[200px]">
 <label className="text-sm font-medium mb-2 block">Data Início</label>
 <Input
 type="date"
 value={customStartDate}
 onChange={(e) => {
 setCustomStartDate(e.target.value);
 setCurrentPage(1);
 }}
 max={customEndDate}
 />
 </div>
 <div className="flex-1 min-w-[150px] max-w-[200px]">
 <label className="text-sm font-medium mb-2 block">Data Fim</label>
 <Input
 type="date"
 value={customEndDate}
 onChange={(e) => {
 setCustomEndDate(e.target.value);
 setCurrentPage(1);
 }}
 min={customStartDate}
 max={new Date().toISOString().split('T')[0]}
 />
 </div>
 </div>
 )}

 {/* Empty State */}
 {(!costs || costs.length === 0) && (
 <Card className="border-dashed">
 <CardContent className="flex flex-col items-center justify-center py-12">
 <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
 <h3 className="text-lg font-semibold mb-2">{t('costAnalysis.noDataAvailable')}</h3>
 <p className="text-sm text-muted-foreground text-center mb-4 max-w-md">
 {t('costAnalysis.noDataDescription')}
 </p>
 <div className="flex gap-2">
 <Button 
 onClick={() => refreshCostsMutation.mutate()}
 disabled={refreshCostsMutation.isPending}
 className="gap-2"
 >
 <RefreshCw className={`h-4 w-4 ${refreshCostsMutation.isPending ? 'animate-spin' : ''}`} />
 {refreshCostsMutation.isPending ? t('costAnalysis.fetchingData') : t('costAnalysis.fetchAwsData')}
 </Button>
 <Button 
 onClick={() => fullFetchCostsMutation.mutate()}
 disabled={fullFetchCostsMutation.isPending}
 variant="outline"
 className="gap-2 bg-blue-50 hover:bg-blue-100 border-blue-200"
 >
 <RefreshCw className={`h-4 w-4 ${fullFetchCostsMutation.isPending ? 'animate-spin' : ''}`} />
 {fullFetchCostsMutation.isPending ? t('costAnalysis.fullFetchLoading') : t('costAnalysis.fullFetchButton')}
 </Button>
 </div>
 </CardContent>
 </Card>
 )}

 {/* Summary Stats */}
 {costs && costs.length > 0 && (
 <div className="grid gap-4 md:grid-cols-4 ">
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-medium text-muted-foreground">{t('costAnalysis.periodTotal')}</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="text-2xl font-semibold tabular-nums">
 ${costs.reduce((sum, c) => {
 const val = Number(c.total_cost);
 return sum + (isNaN(val) ? 0 : val);
 }, 0).toFixed(2)}
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-medium text-muted-foreground">{t('costAnalysis.creditsUsed')}</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="text-2xl font-semibold text-green-600 tabular-nums">
 ${costs.reduce((sum, c) => {
 const val = Number(c.credits_used || 0);
 return sum + (isNaN(val) ? 0 : val);
 }, 0).toFixed(2)}
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-medium text-muted-foreground">{t('costAnalysis.netCost')}</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="text-2xl font-semibold tabular-nums">
 ${costs.reduce((sum, c) => {
 const val = Number(c.net_cost || c.total_cost);
 return sum + (isNaN(val) ? 0 : val);
 }, 0).toFixed(2)}
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-medium text-muted-foreground">{t('costAnalysis.daysAnalyzed')}</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="text-2xl font-semibold tabular-nums">{sortedDates.length}</div>
 </CardContent>
 </Card>
 </div>
 )}

 {/* Service Cost Chart */}
 {chartData.length > 0 && (
 <Card>
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
 paginatedDates.map((date, idx) => {
 const dateCosts = costsByDate[date];
 const totalCost = dateCosts.reduce((sum, c) => {
 const val = Number(c.total_cost);
 return sum + (isNaN(val) ? 0 : val);
 }, 0);
 const totalCredits = dateCosts.reduce((sum, c) => {
 const val = Number(c.credits_used || 0);
 return sum + (isNaN(val) ? 0 : val);
 }, 0);
 const netCost = dateCosts.reduce((sum, c) => {
 const val = Number(c.net_cost || c.total_cost);
 return sum + (isNaN(val) ? 0 : val);
 }, 0);
 const isExpanded = expandedDates.has(date);
 
 // Calculate day-over-day change
 const prevDate = sortedDates[idx + 1];
 const prevCosts = prevDate ? costsByDate[prevDate] : null;
 const prevNetCost = prevCosts?.reduce((sum, c) => {
 const val = Number(c.net_cost || c.total_cost);
 return sum + (isNaN(val) ? 0 : val);
 }, 0) || 0;
 const change = calculatePercentageChange(netCost, prevNetCost);

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
 {change !== 0 && (
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
 
 {/* Pagination Controls */}
 {sortedDates.length > 0 && (
 <div className="flex items-center justify-between mt-4">
 <div className="flex items-center gap-2">
 <span className="text-sm text-muted-foreground">
 Mostrando {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, sortedDates.length)} de {sortedDates.length} dias
 </span>
 <Select value={String(itemsPerPage)} onValueChange={(v) => {
 setItemsPerPage(Number(v));
 setCurrentPage(1);
 }}>
 <SelectTrigger className="w-[100px]">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="10">10 / página</SelectItem>
 <SelectItem value="25">25 / página</SelectItem>
 <SelectItem value="50">50 / página</SelectItem>
 <SelectItem value="100">100 / página</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="flex items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
 disabled={currentPage === 1}
 >
 <ChevronLeft className="h-4 w-4" />
 Anterior
 </Button>
 <span className="text-sm px-2">
 Página {currentPage} de {totalPages}
 </span>
 <Button
 variant="outline"
 size="sm"
 onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
 disabled={currentPage === totalPages}
 >
 Próxima
 <ChevronRight className="h-4 w-4" />
 </Button>
 </div>
 </div>
 )}
 </>
 )}
 </CardContent>
 </Card>
 </div>
 );

 if (embedded) {
 return content;
 }

 return (
 <Layout
 title={t('costAnalysis.title', 'Análise Detalhada de Custos')}
 description={t('costAnalysis.description', 'Visualize e analise seus custos AWS em detalhes')}
 icon={<DollarSign className="h-4 w-4" />}
 >
 {content}
 </Layout>
 );
};
