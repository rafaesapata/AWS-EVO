import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/aws/api-client";
import { Brain, TrendingDown, Zap, BarChart3, Clock, AlertCircle, Trash2, Copy, ExternalLink, ChevronDown, ChevronUp, Terminal, AlertTriangle, Shield, History, Play, CheckCircle2, XCircle, Loader2, Eye, Filter, ArrowUpDown, Info, HelpCircle, DollarSign } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
import { useDemoAwareQuery } from "@/hooks/useDemoAwareQuery";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Layout } from "@/components/Layout";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import type { MLImplementationStep } from "@/types/database";
import { useCurrency } from "@/hooks/useCurrency";
import { CurrencyIndicator } from "@/components/ui/currency-indicator";

const dateLocales: Record<string, any> = { pt: ptBR, en: enUS, es: es };

interface MLAnalysisHistoryItem {
 id: string;
 organization_id: string;
 aws_account_id: string;
 aws_account_number?: string;
 scan_type: string;
 status: 'running' | 'completed' | 'failed';
 total_resources_analyzed: number;
 total_recommendations: number;
 total_monthly_savings: number;
 total_annual_savings: number;
 terminate_count: number;
 downsize_count: number;
 autoscale_count: number;
 optimize_count: number;
 migrate_count: number;
 by_resource_type?: Record<string, { count: number; savings: number }>;
 regions_scanned?: string[];
 analysis_depth?: string;
 execution_time_seconds?: number;
 error_message?: string;
 started_at: string;
 completed_at?: string;
}

interface MLRecommendation {
 id: string;
 organization_id: string;
 aws_account_id: string;
 resource_id: string;
 resource_arn?: string;
 resource_name?: string;
 resource_type: string;
 resource_subtype?: string;
 region: string;
 current_size?: string;
 current_monthly_cost?: number;
 current_hourly_cost?: number;
 recommendation_type?: string;
 recommendation_priority?: number;
 recommended_size?: string;
 potential_monthly_savings?: number;
 potential_annual_savings?: number;
 ml_confidence?: number;
 utilization_patterns?: any;
 resource_metadata?: any;
 dependencies?: any[];
 auto_scaling_eligible?: boolean;
 auto_scaling_config?: any;
 implementation_complexity?: string;
 implementation_steps?: MLImplementationStep[];
 risk_assessment?: string;
 analyzed_at: string;
}

// Analysis progress stages - AWS
const AWS_ANALYSIS_STAGES = [
 { key: 'init', label: 'Initializing', labelPt: 'Inicializando', labelEs: 'Inicializando', progress: 5 },
 { key: 'credentials', label: 'Validating credentials', labelPt: 'Validando credenciais', labelEs: 'Validando credenciales', progress: 15 },
 { key: 'ec2', label: 'Analyzing EC2 instances', labelPt: 'Analisando instâncias EC2', labelEs: 'Analizando instancias EC2', progress: 30 },
 { key: 'rds', label: 'Analyzing RDS databases', labelPt: 'Analisando bancos RDS', labelEs: 'Analizando bases RDS', progress: 45 },
 { key: 'ebs', label: 'Analyzing EBS volumes', labelPt: 'Analisando volumes EBS', labelEs: 'Analizando volúmenes EBS', progress: 55 },
 { key: 'lambda', label: 'Analyzing Lambda functions', labelPt: 'Analisando funções Lambda', labelEs: 'Analizando funciones Lambda', progress: 65 },
 { key: 'nat', label: 'Analyzing NAT Gateways', labelPt: 'Analisando NAT Gateways', labelEs: 'Analizando NAT Gateways', progress: 75 },
 { key: 'cloudwatch', label: 'Fetching CloudWatch metrics', labelPt: 'Buscando métricas CloudWatch', labelEs: 'Obteniendo métricas CloudWatch', progress: 85 },
 { key: 'ml', label: 'Running ML analysis', labelPt: 'Executando análise ML', labelEs: 'Ejecutando análisis ML', progress: 92 },
 { key: 'saving', label: 'Saving recommendations', labelPt: 'Salvando recomendações', labelEs: 'Guardando recomendaciones', progress: 98 },
 { key: 'complete', label: 'Analysis complete', labelPt: 'Análise concluída', labelEs: 'Análisis completado', progress: 100 },
];

// Analysis progress stages - Azure
const AZURE_ANALYSIS_STAGES = [
 { key: 'init', label: 'Initializing', labelPt: 'Inicializando', labelEs: 'Inicializando', progress: 5 },
 { key: 'credentials', label: 'Validating Azure credentials', labelPt: 'Validando credenciais Azure', labelEs: 'Validando credenciales Azure', progress: 15 },
 { key: 'vms', label: 'Analyzing Virtual Machines', labelPt: 'Analisando Máquinas Virtuais', labelEs: 'Analizando Máquinas Virtuales', progress: 30 },
 { key: 'storage', label: 'Analyzing Storage Accounts', labelPt: 'Analisando Contas de Armazenamento', labelEs: 'Analizando Cuentas de Almacenamiento', progress: 45 },
 { key: 'sql', label: 'Analyzing SQL Databases', labelPt: 'Analisando Bancos SQL', labelEs: 'Analizando Bases SQL', progress: 55 },
 { key: 'advisor', label: 'Fetching Azure Advisor recommendations', labelPt: 'Buscando recomendações do Azure Advisor', labelEs: 'Obteniendo recomendaciones de Azure Advisor', progress: 70 },
 { key: 'monitor', label: 'Fetching Azure Monitor metrics', labelPt: 'Buscando métricas do Azure Monitor', labelEs: 'Obteniendo métricas de Azure Monitor', progress: 85 },
 { key: 'saving', label: 'Saving recommendations', labelPt: 'Salvando recomendações', labelEs: 'Guardando recomendaciones', progress: 95 },
 { key: 'complete', label: 'Analysis complete', labelPt: 'Análise concluída', labelEs: 'Análisis completado', progress: 100 },
];

type SortField = 'savings' | 'priority' | 'complexity' | 'confidence' | 'type';
type SortOrder = 'asc' | 'desc';
type FilterType = 'all' | 'terminate' | 'downsize' | 'auto-scale' | 'optimize' | 'migrate' | 'purchase';
type FilterRisk = 'all' | 'high' | 'medium' | 'low';
type FilterComplexity = 'all' | 'low' | 'medium' | 'high';

export default function MLWasteDetection() {
 const { toast } = useToast();
 const { t, i18n } = useTranslation();
 const queryClient = useQueryClient();
 const [analyzing, setAnalyzing] = useState(false);
 const [analysisProgress, setAnalysisProgress] = useState(0);
 const [analysisStage, setAnalysisStage] = useState(0);
 const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
 const [activeTab, setActiveTab] = useState<'recommendations' | 'history'>('recommendations');
 const { data: organizationId } = useOrganization();
  const { selectedAccountId, selectedProvider } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();
  const { isInDemoMode } = useDemoAwareQuery();
  const { sym, convert } = useCurrency();
 
 // Filters and sorting state
 const [sortField, setSortField] = useState<SortField>('savings');
 const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
 const [filterType, setFilterType] = useState<FilterType>('all');
 const [filterRisk, setFilterRisk] = useState<FilterRisk>('all');
 const [filterComplexity, setFilterComplexity] = useState<FilterComplexity>('all');

 const currentLocale = dateLocales[i18n.language] || enUS;

 // Get the correct analysis stages based on provider
 const ANALYSIS_STAGES = selectedProvider === 'AZURE' ? AZURE_ANALYSIS_STAGES : AWS_ANALYSIS_STAGES;

 // Progress animation effect
 useEffect(() => {
 if (!analyzing) {
 setAnalysisProgress(0);
 setAnalysisStage(0);
 return;
 }

 const stages = selectedProvider === 'AZURE' ? AZURE_ANALYSIS_STAGES : AWS_ANALYSIS_STAGES;
 const interval = setInterval(() => {
 setAnalysisStage(prev => {
 const nextStage = prev + 1;
 if (nextStage >= stages.length - 1) {
 return prev;
 }
 setAnalysisProgress(stages[nextStage].progress);
 return nextStage;
 });
 }, 2500);

 return () => clearInterval(interval);
 }, [analyzing, selectedProvider]);

 const getStageLabel = (stage: typeof AWS_ANALYSIS_STAGES[0]) => {
 if (i18n.language === 'pt') return stage.labelPt;
 if (i18n.language === 'es') return stage.labelEs;
 return stage.label;
 };

 const toggleSteps = (id: string) => {
 setExpandedSteps(prev => ({ ...prev, [id]: !prev[id] }));
 };

 const copyToClipboard = (text: string) => {
 navigator.clipboard.writeText(text);
 toast({ title: t('mlWaste.copiedToClipboard', 'Copied to clipboard'), description: text.substring(0, 50) + "..." });
 };

 const getConsoleUrl = (arn: string): string | null => {
 if (!arn) return null;
 const parts = arn.split(':');
 if (parts.length < 6) return null;
 const service = parts[2];
 const region = parts[3];
 const resourcePart = parts.slice(5).join(':');
 
 switch (service) {
 case 'ec2':
 if (resourcePart.startsWith('instance/')) {
 return `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#InstanceDetails:instanceId=${resourcePart.replace('instance/', '')}`;
 }
 if (resourcePart.startsWith('volume/')) {
 return `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#VolumeDetails:volumeId=${resourcePart.replace('volume/', '')}`;
 }
 if (resourcePart.startsWith('nat-gateway/')) {
 return `https://${region}.console.aws.amazon.com/vpc/home?region=${region}#NatGatewayDetails:natGatewayId=${resourcePart.replace('nat-gateway/', '')}`;
 }
 return null;
 case 'rds':
 return `https://${region}.console.aws.amazon.com/rds/home?region=${region}#database:id=${resourcePart.replace('db:', '')}`;
 case 'lambda':
 return `https://${region}.console.aws.amazon.com/lambda/home?region=${region}#/functions/${resourcePart.replace('function:', '')}`;
 default:
 return null;
 }
 };

 const getPriorityBadge = (priority: number | undefined) => {
 if (!priority) return null;
 const colors: Record<number, string> = {
 5: 'bg-red-500 text-white',
 4: 'bg-orange-500 text-white',
 3: 'bg-yellow-500 text-black',
 2: 'bg-blue-500 text-white',
 1: 'bg-gray-500 text-white',
 };
 return (
 <Badge className={colors[priority] || 'bg-gray-500'}>
 P{priority}
 </Badge>
 );
 };

 const getRiskBadge = (risk: string | undefined) => {
 if (!risk) return null;
 const colors: Record<string, string> = {
 'high': 'bg-red-100 text-red-800 border-red-200',
 'medium': 'bg-yellow-100 text-yellow-800 border-yellow-200',
 'low': 'bg-green-100 text-green-800 border-green-200',
 };
 const labels: Record<string, string> = {
 'high': t('mlWaste.riskHigh', 'high risk'),
 'medium': t('mlWaste.riskMedium', 'medium risk'),
 'low': t('mlWaste.riskLow', 'low risk'),
 };
 return (
 <Badge variant="outline" className={colors[risk] || ''}>
 <Shield className="h-3 w-3 mr-1" />
 {labels[risk] || risk}
 </Badge>
 );
 };

 const getComplexityBadge = (complexity: string | undefined) => {
 if (!complexity) return null;
 const colors: Record<string, string> = {
 'low': 'bg-green-100 text-green-800 border-green-200',
 'medium': 'bg-yellow-100 text-yellow-800 border-yellow-200',
 'high': 'bg-red-100 text-red-800 border-red-200',
 };
 return (
 <Badge variant="outline" className={`text-xs ${colors[complexity] || ''}`}>
 {complexity} {t('mlWaste.complexity', 'complexity')}
 </Badge>
 );
 };

 const getStatusBadge = (status: string) => {
 switch (status) {
 case 'running':
 return (
 <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
 <Loader2 className="h-3 w-3 mr-1 animate-spin" />
 {t('mlWaste.statusRunning', 'Running')}
 </Badge>
 );
 case 'completed':
 return (
 <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
 <CheckCircle2 className="h-3 w-3 mr-1" />
 {t('mlWaste.statusCompleted', 'Completed')}
 </Badge>
 );
 case 'failed':
 return (
 <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">
 <XCircle className="h-3 w-3 mr-1" />
 {t('mlWaste.statusFailed', 'Failed')}
 </Badge>
 );
 default:
 return <Badge variant="outline">{status}</Badge>;
 }
 };

 // Query for ML recommendations
 const { data: mlRecommendations, refetch, isLoading: recommendationsLoading } = useQuery<MLRecommendation[]>({
 queryKey: ['ml-waste-detection', 'org', organizationId, 'account', selectedAccountId, 'provider', selectedProvider, 'demo', isInDemoMode],
 enabled: !!organizationId && (isInDemoMode || !!selectedAccountId),
 staleTime: 0,
 queryFn: async () => {
 if (!organizationId) throw new Error('No organization');
 
 // In demo mode, call the backend endpoint which will return demo data
 if (isInDemoMode) {
 const result = await apiClient.invoke('ml-waste-detection', {
 body: { accountId: 'demo' }
 });
 if (result.error) throw result.error;
 const data = result.data as { recommendations?: MLRecommendation[] };
 return data.recommendations || [];
 }

 if (!selectedAccountId) throw new Error('No account');

 // For Azure, call azure-ml-waste-detection endpoint OR read from DB
 if (selectedProvider === 'AZURE') {
 // First try to read existing ML results from database
 const dbResult = await apiClient.select('resource_utilization_ml', {
 select: '*',
 eq: { organization_id: organizationId, azure_credential_id: selectedAccountId, cloud_provider: 'AZURE' },
 order: { column: 'potential_monthly_savings', ascending: false },
 limit: 100
 });
 
 if (!dbResult.error && dbResult.data && dbResult.data.length > 0) {
 return (dbResult.data || []) as MLRecommendation[];
 }
 
 // No cached results — return empty (user needs to run analysis)
 return [];
 }

 // For AWS, fetch from resource_utilization_ml table
 const result = await apiClient.select('resource_utilization_ml', {
 select: '*',
 eq: { organization_id: organizationId, ...getAccountFilter() },
 order: { column: 'potential_monthly_savings', ascending: false },
 limit: 100
 });
 
 if (result.error) throw result.error;
 return (result.data || []) as MLRecommendation[];
 },
 });

 // Query for analysis history
 const { data: analysisHistory, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
 queryKey: ['ml-analysis-history', 'org', organizationId, 'account', selectedAccountId, 'provider', selectedProvider, 'demo', isInDemoMode],
 enabled: !!organizationId && (isInDemoMode || !!selectedAccountId),
 refetchInterval: analyzing ? 3000 : false,
 queryFn: async () => {
 if (!organizationId) throw new Error('No organization');
 
 // In demo mode, return empty history (demo data doesn't have history)
 if (isInDemoMode) {
 return [] as MLAnalysisHistoryItem[];
 }

 if (!selectedAccountId) throw new Error('No account');

 // For Azure, fetch ML analysis history from database
 if (selectedProvider === 'AZURE') {
 const result = await apiClient.select('ml_analysis_history', {
 select: '*',
 eq: { organization_id: organizationId, azure_credential_id: selectedAccountId, cloud_provider: 'AZURE' },
 order: { column: 'started_at', ascending: false },
 limit: 20
 });
 
 if (result.error) throw result.error;
 return (result.data || []) as MLAnalysisHistoryItem[];
 }

 const result = await apiClient.select('ml_analysis_history', {
 select: '*',
 eq: { organization_id: organizationId, ...getAccountFilter() },
 order: { column: 'started_at', ascending: false },
 limit: 20
 });
 
 if (result.error) throw result.error;
 return (result.data || []) as MLAnalysisHistoryItem[];
 },
 });

 const runningAnalysis = analysisHistory?.find(h => h.status === 'running');

 const runMLAnalysis = async () => {
 // In demo mode, show a toast that this is demo data
 if (isInDemoMode) {
 toast({
 title: t('mlWaste.demoMode', 'Demo Mode'),
 description: t('mlWaste.demoModeDesc', 'In demo mode, analysis shows sample data. Connect a cloud account to analyze real resources.'),
 });
 return;
 }

 if (!selectedAccountId) {
 toast({
 title: t('mlWaste.noAccountSelected', 'No account selected'),
 description: t('mlWaste.selectAccountHeader', 'Please select a cloud account from the header'),
 variant: "destructive",
 });
 return;
 }

 setAnalyzing(true);
 setAnalysisProgress(5);
 setAnalysisStage(0);
 
 try {
 let result;
 let data: { analyzed_resources?: number; total_monthly_savings?: number; recommendations?: any[]; totalPotentialSavings?: number };
 
 if (selectedProvider === 'AZURE') {
 // For Azure, call azure-ml-waste-detection endpoint with real ML analysis
 result = await apiClient.invoke('azure-ml-waste-detection', {
 body: { credentialId: selectedAccountId, analysisDepth: 'deep' }
 });
 
 if (result.error) throw result.error;
 data = result.data as { analyzed_resources?: number; total_monthly_savings?: number; recommendations?: any[] };
 } else {
 // For AWS, call ml-waste-detection endpoint
 result = await apiClient.invoke('ml-waste-detection', {
 body: { accountId: selectedAccountId }
 });

 if (result.error) throw result.error;
 data = result.data as { analyzed_resources?: number; total_monthly_savings?: number };
 }

 setAnalysisProgress(100);
 setAnalysisStage(ANALYSIS_STAGES.length - 1);

 toast({
 title: t('mlWaste.analysisCompleted', 'ML Analysis completed'),
 description: t('mlWaste.analysisResults', 'Analyzed {{count}} resources. Potential savings: {{currency}}{{amount}}/month', {
 count: data.analyzed_resources || 0,
 amount: data.total_monthly_savings?.toFixed(2) || '0.00', currency: sym
 }),
 });

 await Promise.all([refetch(), refetchHistory()]);
 setActiveTab('recommendations');
 } catch (error: any) {
 const errorMessage = typeof error?.message === 'string' 
 ? error.message 
 : (typeof error === 'string' ? error : t('common.unknownError', 'Unknown error occurred'));
 toast({
 title: t('mlWaste.analysisFailed', 'Analysis failed'),
 description: errorMessage,
 variant: "destructive",
 });
 await refetchHistory();
 } finally {
 setTimeout(() => {
 setAnalyzing(false);
 }, 1000);
 }
 };

 // Filter and sort recommendations
 const filteredAndSortedRecommendations = (() => {
 if (!mlRecommendations) return [];
 
 let filtered = [...mlRecommendations];
 
 // Apply filters
 if (filterType !== 'all') {
 filtered = filtered.filter(r => r.recommendation_type === filterType);
 }
 if (filterRisk !== 'all') {
 filtered = filtered.filter(r => r.risk_assessment === filterRisk);
 }
 if (filterComplexity !== 'all') {
 filtered = filtered.filter(r => r.implementation_complexity === filterComplexity);
 }
 
 // Apply sorting
 filtered.sort((a, b) => {
 let comparison = 0;
 switch (sortField) {
 case 'savings':
 comparison = (a.potential_monthly_savings || 0) - (b.potential_monthly_savings || 0);
 break;
 case 'priority':
 comparison = (a.recommendation_priority || 0) - (b.recommendation_priority || 0);
 break;
 case 'complexity':
 const complexityOrder = { 'low': 1, 'medium': 2, 'high': 3 };
 comparison = (complexityOrder[a.implementation_complexity as keyof typeof complexityOrder] || 0) - 
 (complexityOrder[b.implementation_complexity as keyof typeof complexityOrder] || 0);
 break;
 case 'confidence':
 comparison = (a.ml_confidence || 0) - (b.ml_confidence || 0);
 break;
 case 'type':
 comparison = (a.recommendation_type || '').localeCompare(b.recommendation_type || '');
 break;
 }
 return sortOrder === 'desc' ? -comparison : comparison;
 });
 
 return filtered;
 })();

 // Compute summary metrics in a single pass for better performance
 const summaryMetrics = (() => {
   if (!mlRecommendations) return { totalSavings: 0, downsizeCount: 0, autoScaleEligible: 0, terminateCount: 0, purchaseCount: 0 };
   return mlRecommendations.reduce((acc, r) => {
     acc.totalSavings += r.potential_monthly_savings || 0;
     if (r.recommendation_type === 'downsize') acc.downsizeCount++;
     if (r.recommendation_type === 'terminate') acc.terminateCount++;
     if (r.recommendation_type === 'purchase') acc.purchaseCount++;
     if (r.auto_scaling_eligible) acc.autoScaleEligible++;
     return acc;
   }, { totalSavings: 0, downsizeCount: 0, autoScaleEligible: 0, terminateCount: 0, purchaseCount: 0 });
 })();
 const { totalSavings, downsizeCount, autoScaleEligible, terminateCount, purchaseCount } = summaryMetrics;

 // Script explanation helper
 const getScriptExplanation = (step: MLImplementationStep) => {
 const explanations: Record<string, { where: string; what: string }> = {
 'terminate': {
 where: t('mlWaste.scriptWhereTerminal', 'Run this command in your terminal with AWS CLI configured, or in AWS CloudShell'),
 what: t('mlWaste.scriptWhatTerminate', 'This command will permanently terminate the resource. Make sure you have backups if needed.')
 },
 'stop': {
 where: t('mlWaste.scriptWhereTerminal', 'Run this command in your terminal with AWS CLI configured, or in AWS CloudShell'),
 what: t('mlWaste.scriptWhatStop', 'This command will stop the resource. You can restart it later if needed.')
 },
 'modify': {
 where: t('mlWaste.scriptWhereTerminal', 'Run this command in your terminal with AWS CLI configured, or in AWS CloudShell'),
 what: t('mlWaste.scriptWhatModify', 'This command will modify the resource configuration to optimize costs.')
 },
 'create-snapshot': {
 where: t('mlWaste.scriptWhereTerminal', 'Run this command in your terminal with AWS CLI configured, or in AWS CloudShell'),
 what: t('mlWaste.scriptWhatSnapshot', 'This command creates a backup snapshot before making changes. Recommended before any destructive action.')
 },
 'delete': {
 where: t('mlWaste.scriptWhereTerminal', 'Run this command in your terminal with AWS CLI configured, or in AWS CloudShell'),
 what: t('mlWaste.scriptWhatDelete', 'This command will permanently delete the resource. This action cannot be undone.')
 },
 'resize': {
 where: t('mlWaste.scriptWhereTerminal', 'Run this command in your terminal with AWS CLI configured, or in AWS CloudShell'),
 what: t('mlWaste.scriptWhatResize', 'This command will resize the resource to a smaller/optimized instance type.')
 },
 };
 
 const action = step.action?.toLowerCase() || '';
 for (const [key, value] of Object.entries(explanations)) {
 if (action.includes(key)) return value;
 }
 
 return {
 where: t('mlWaste.scriptWhereDefault', 'Run this command in your terminal with AWS CLI configured'),
 what: t('mlWaste.scriptWhatDefault', 'This command will apply the recommended optimization.')
 };
 };

 if (!selectedAccountId && !isInDemoMode) {
 return (
 <Layout 
 title={t('mlWaste.title', 'ML-Powered Waste Detection 3.0')}
 description={t('mlWaste.description', 'Machine Learning analysis of resource utilization patterns')}
 icon={<Trash2 className="h-5 w-5" />}
 >
 <Alert>
 <AlertCircle className="h-4 w-4" />
 <AlertTitle>{t('mlWaste.noAccountTitle', 'No Cloud Account Selected')}</AlertTitle>
 <AlertDescription>
 {t('mlWaste.noAccountDesc', 'Please select a cloud account from the header to run waste detection analysis.')}
 </AlertDescription>
 </Alert>
 </Layout>
 );
 }

 return (
 <Layout 
 title={t('mlWaste.title', 'ML-Powered Waste Detection 3.0')}
 description={t('mlWaste.description', 'Machine Learning analysis of resource utilization patterns')}
 icon={<Trash2 className="h-5 w-5" />}
 >
 <div className="space-y-6">
 {/* Analysis Progress Banner */}
 {(analyzing || runningAnalysis) && (
 <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
 <CardContent className="pt-6">
 <div className="space-y-4">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="relative">
 <Brain className="h-8 w-8 text-blue-600 animate-pulse" />
 <div className="absolute -top-1 -right-1 h-3 w-3 bg-blue-500 rounded-full animate-ping" />
 </div>
 <div>
 <h3 className="font-semibold text-blue-800 dark:text-blue-200">
 {t('mlWaste.analysisInProgress', 'ML Analysis in Progress')}
 </h3>
 <p className="text-sm text-blue-600 dark:text-blue-300">
 {getStageLabel(ANALYSIS_STAGES[analysisStage])}...
 </p>
 </div>
 </div>
 <div className="text-right">
 <span className="text-2xl font-semibold text-blue-700 dark:text-blue-300">
 {analysisProgress}%
 </span>
 </div>
 </div>
 <Progress value={analysisProgress} className="h-3" />
 <div className="flex justify-between text-xs text-blue-600 dark:text-blue-400">
 <span>{t('mlWaste.estimatedTime', 'Estimated time: 20-30 seconds')}</span>
 <span>{t('mlWaste.stage', 'Stage')} {analysisStage + 1}/{ANALYSIS_STAGES.length}</span>
 </div>
 </div>
 </CardContent>
 </Card>
 )}

 {/* Header with action button */}
 <div className="flex items-center justify-between flex-wrap gap-4">
 <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
 <TabsList>
 <TabsTrigger value="recommendations" className="flex items-center gap-2">
 <Brain className="h-4 w-4" />
 {t('mlWaste.recommendations', 'Recommendations')}
 </TabsTrigger>
 <TabsTrigger value="history" className="flex items-center gap-2">
 <History className="h-4 w-4" />
 {t('mlWaste.executionHistory', 'Execution History')}
 </TabsTrigger>
 </TabsList>
 </Tabs>
 <Button onClick={runMLAnalysis} disabled={analyzing || !!runningAnalysis} className="glass-card-float">
 {analyzing || runningAnalysis ? (
 <Loader2 className="h-4 w-4 mr-2 animate-spin" />
 ) : (
 <Play className="h-4 w-4 mr-2" />
 )}
 {analyzing || runningAnalysis ? t('mlWaste.analyzing', 'Analyzing...') : t('mlWaste.runAnalysis', 'Run ML Analysis')}
 </Button>
 </div>

 {/* Summary Cards */}
 <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
 <Card>
 <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
 <CardTitle className="text-sm font-medium flex items-center gap-1.5">{t('mlWaste.potentialSavings', 'Potential Savings')} <CurrencyIndicator /></CardTitle>
 <TrendingDown className="h-4 w-4 text-success" />
 </CardHeader>
 <CardContent>
 <div className="text-2xl font-semibold">{sym}{convert(totalSavings).toFixed(2)}</div>
 <p className="text-xs text-muted-foreground">{t('mlWaste.perMonth', 'Per month')}</p>
 </CardContent>
 </Card>

 <Card>
 <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
 <CardTitle className="text-sm font-medium">{t('mlWaste.terminate', 'Terminate')}</CardTitle>
 <Trash2 className="h-4 w-4 text-destructive" />
 </CardHeader>
 <CardContent>
 <div className="text-2xl font-semibold">{terminateCount}</div>
 <p className="text-xs text-muted-foreground">{t('mlWaste.unusedResources', 'Unused resources')}</p>
 </CardContent>
 </Card>

 <Card>
 <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
 <CardTitle className="text-sm font-medium">{t('mlWaste.purchase', 'Reserve/Savings Plan')}</CardTitle>
 <DollarSign className="h-4 w-4 text-blue-500" />
 </CardHeader>
 <CardContent>
 <div className="text-2xl font-semibold">{purchaseCount}</div>
 <p className="text-xs text-muted-foreground">{t('mlWaste.riSpOpportunities', 'RI/SP opportunities')}</p>
 </CardContent>
 </Card>

 <Card>
 <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
 <CardTitle className="text-sm font-medium">{t('mlWaste.downsize', 'Downsize')}</CardTitle>
 <BarChart3 className="h-4 w-4 text-primary" />
 </CardHeader>
 <CardContent>
 <div className="text-2xl font-semibold">{downsizeCount}</div>
 <p className="text-xs text-muted-foreground">{t('mlWaste.oversizedResources', 'Oversized resources')}</p>
 </CardContent>
 </Card>

 <Card>
 <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
 <CardTitle className="text-sm font-medium">{t('mlWaste.autoScalingReady', 'Auto-Scaling Ready')}</CardTitle>
 <Zap className="h-4 w-4 text-warning" />
 </CardHeader>
 <CardContent>
 <div className="text-2xl font-semibold">{autoScaleEligible}</div>
 <p className="text-xs text-muted-foreground">{t('mlWaste.canUseAutoScaling', 'Can use auto-scaling')}</p>
 </CardContent>
 </Card>
 </div>

 {/* Tab Content */}
 {activeTab === 'recommendations' && (
 <Card>
 <CardHeader>
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
 <div>
 <CardTitle>{t('mlWaste.mlOptimizationRecommendations', 'ML Optimization Recommendations')}</CardTitle>
 <CardDescription>{t('mlWaste.aiPoweredAnalysis', 'AI-powered analysis with real CloudWatch usage patterns')}</CardDescription>
 </div>
 
 {/* Filters and Sorting */}
 <div className="flex flex-wrap items-center gap-2">
 <TooltipProvider>
 <Tooltip>
 <TooltipTrigger asChild>
 <div className="flex items-center gap-1">
 <Filter className="h-4 w-4 text-muted-foreground" />
 </div>
 </TooltipTrigger>
 <TooltipContent>
 <p>{t('mlWaste.filterResults', 'Filter results')}</p>
 </TooltipContent>
 </Tooltip>
 </TooltipProvider>
 
 <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
 <SelectTrigger className="w-[130px] h-8 text-xs">
 <SelectValue placeholder={t('mlWaste.type', 'Type')} />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">{t('mlWaste.allTypes', 'All Types')}</SelectItem>
 <SelectItem value="terminate">{t('mlWaste.terminate', 'Terminate')}</SelectItem>
 <SelectItem value="downsize">{t('mlWaste.downsize', 'Downsize')}</SelectItem>
 <SelectItem value="auto-scale">{t('mlWaste.autoScale', 'Auto-Scale')}</SelectItem>
 <SelectItem value="optimize">{t('mlWaste.optimize', 'Optimize')}</SelectItem>
 <SelectItem value="migrate">{t('mlWaste.migrate', 'Migrate')}</SelectItem>
 <SelectItem value="purchase">{t('mlWaste.purchase', 'Reserve/Savings Plan')}</SelectItem>
 </SelectContent>
 </Select>

 <Select value={filterRisk} onValueChange={(v) => setFilterRisk(v as FilterRisk)}>
 <SelectTrigger className="w-[120px] h-8 text-xs">
 <SelectValue placeholder={t('mlWaste.risk', 'Risk')} />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">{t('mlWaste.allRisks', 'All Risks')}</SelectItem>
 <SelectItem value="low">{t('mlWaste.lowRisk', 'Low Risk')}</SelectItem>
 <SelectItem value="medium">{t('mlWaste.mediumRisk', 'Medium Risk')}</SelectItem>
 <SelectItem value="high">{t('mlWaste.highRisk', 'High Risk')}</SelectItem>
 </SelectContent>
 </Select>

 <Select value={filterComplexity} onValueChange={(v) => setFilterComplexity(v as FilterComplexity)}>
 <SelectTrigger className="w-[140px] h-8 text-xs">
 <SelectValue placeholder={t('mlWaste.complexity', 'Complexity')} />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">{t('mlWaste.allComplexities', 'All Complexities')}</SelectItem>
 <SelectItem value="low">{t('mlWaste.lowComplexity', 'Low')}</SelectItem>
 <SelectItem value="medium">{t('mlWaste.mediumComplexity', 'Medium')}</SelectItem>
 <SelectItem value="high">{t('mlWaste.highComplexity', 'High')}</SelectItem>
 </SelectContent>
 </Select>

 <div className="h-4 w-px bg-border mx-1" />

 <TooltipProvider>
 <Tooltip>
 <TooltipTrigger asChild>
 <div className="flex items-center gap-1">
 <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
 </div>
 </TooltipTrigger>
 <TooltipContent>
 <p>{t('mlWaste.sortResults', 'Sort results')}</p>
 </TooltipContent>
 </Tooltip>
 </TooltipProvider>

 <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
 <SelectTrigger className="w-[130px] h-8 text-xs">
 <SelectValue placeholder={t('mlWaste.sortBy', 'Sort by')} />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="savings">{t('mlWaste.sortBySavings', 'Savings')}</SelectItem>
 <SelectItem value="priority">{t('mlWaste.sortByPriority', 'Priority')}</SelectItem>
 <SelectItem value="complexity">{t('mlWaste.sortByComplexity', 'Complexity')}</SelectItem>
 <SelectItem value="confidence">{t('mlWaste.sortByConfidence', 'Confidence')}</SelectItem>
 <SelectItem value="type">{t('mlWaste.sortByType', 'Type')}</SelectItem>
 </SelectContent>
 </Select>

 <Button
 variant="ghost"
 size="sm"
 className="h-8 w-8 p-0"
 onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
 >
 <ArrowUpDown className={`h-4 w-4 ${sortOrder === 'asc' ? 'rotate-180' : ''} transition-transform`} />
 </Button>
 </div>
 </div>
 
 {/* Active filters indicator */}
 {(filterType !== 'all' || filterRisk !== 'all' || filterComplexity !== 'all') && (
 <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
 <span>{t('mlWaste.activeFilters', 'Active filters')}:</span>
 {filterType !== 'all' && <Badge variant="secondary">{filterType}</Badge>}
 {filterRisk !== 'all' && <Badge variant="secondary">{filterRisk} risk</Badge>}
 {filterComplexity !== 'all' && <Badge variant="secondary">{filterComplexity} complexity</Badge>}
 <Button
 variant="ghost"
 size="sm"
 className="h-6 text-xs"
 onClick={() => { setFilterType('all'); setFilterRisk('all'); setFilterComplexity('all'); }}
 >
 {t('mlWaste.clearFilters', 'Clear all')}
 </Button>
 </div>
 )}
 </CardHeader>
 <CardContent>
 <div className="space-y-4">
 {/* Results count */}
 {mlRecommendations && mlRecommendations.length > 0 && (
 <div className="text-sm text-muted-foreground">
 {t('mlWaste.showingResults', 'Showing {{count}} of {{total}} recommendations', {
 count: filteredAndSortedRecommendations.length,
 total: mlRecommendations.length
 })}
 </div>
 )}

 {filteredAndSortedRecommendations.map((rec) => (
 <div key={rec.id} className="border rounded-lg p-4 space-y-3">
 <div className="flex items-center justify-between">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <h4 className="font-semibold text-sm truncate">{rec.resource_name || rec.resource_id}</h4>
 {getPriorityBadge(rec.recommendation_priority)}
 {getRiskBadge(rec.risk_assessment)}
 {getComplexityBadge(rec.implementation_complexity)}
 </div>
 <p className="text-sm text-muted-foreground">{rec.resource_type}</p>
 {rec.resource_arn && (
 <div className="flex items-center gap-2 mt-1">
 <code className="text-xs bg-muted px-2 py-0.5 rounded truncate max-w-[400px]">
 {rec.resource_arn}
 </code>
 <Button
 variant="ghost"
 size="sm"
 className="h-6 w-6 p-0"
 onClick={() => copyToClipboard(rec.resource_arn!)}
 >
 <Copy className="h-3 w-3" />
 </Button>
 {getConsoleUrl(rec.resource_arn) && (
 <a
 href={getConsoleUrl(rec.resource_arn)!}
 target="_blank"
 rel="noopener noreferrer"
 className="text-primary hover:underline"
 >
 <ExternalLink className="h-3 w-3" />
 </a>
 )}
 </div>
 )}
 </div>
 <Badge variant={
 rec.recommendation_type === 'terminate' ? 'destructive' :
 rec.recommendation_type === 'downsize' ? 'default' :
 rec.recommendation_type === 'auto-scale' ? 'secondary' :
 rec.recommendation_type === 'purchase' ? 'default' : 'outline'
 } className={rec.recommendation_type === 'purchase' ? 'bg-blue-500 hover:bg-blue-600 text-white' : ''}>
 {rec.recommendation_type === 'purchase' 
 ? t('mlWaste.reserveOrSavingsPlan', 'RESERVE/SAVINGS PLAN')
 : rec.recommendation_type === 'terminate' && rec.current_size?.includes('stopped')
 ? t('mlWaste.terminateStopped', 'TERMINATE (STOPPED)')
 : rec.recommendation_type?.replace('-', ' ').toUpperCase()}
 </Badge>
 </div>

 {/* Explanation/Reason Section - Azure Advisor insights */}
 {((rec as any)._azure_description || (rec as any)._azure_reason || (rec as any)._azure_solution) && (
 <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-2">
 <div className="flex items-start gap-2">
 <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
 <div className="space-y-1">
 <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
 {t('mlWaste.whyThisRecommendation', 'Why this recommendation?')}
 </p>
 {(rec as any)._azure_description && (
 <p className="text-sm text-blue-700 dark:text-blue-300">
 <strong>{t('mlWaste.issue', 'Issue')}:</strong> {(rec as any)._azure_description}
 </p>
 )}
 {(rec as any)._azure_reason && (rec as any)._azure_reason !== (rec as any)._azure_description && (
 <p className="text-sm text-blue-700 dark:text-blue-300">
 <strong>{t('mlWaste.reason', 'Reason')}:</strong> {(rec as any)._azure_reason}
 </p>
 )}
 {(rec as any)._azure_solution && (
 <p className="text-sm text-blue-700 dark:text-blue-300">
 <strong>{t('mlWaste.solution', 'Solution')}:</strong> {(rec as any)._azure_solution}
 </p>
 )}
 </div>
 </div>
 </div>
 )}

 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
 <div>
 <span className="text-muted-foreground">{t('mlWaste.currentSize', 'Current Size')}:</span>
 <p className="font-medium">{rec.current_size}</p>
 </div>
 {rec.recommended_size && (
 <div>
 <span className="text-muted-foreground">{t('mlWaste.recommended', 'Recommended')}:</span>
 <p className="font-medium">{rec.recommended_size}</p>
 </div>
 )}
 <div>
 <span className="text-muted-foreground">{t('mlWaste.monthlySavings', 'Monthly Savings')}:</span>
 <p className="font-medium text-success">{sym}{convert(rec.potential_monthly_savings ?? 0).toFixed(2)}</p>
 </div>
 <div>
 <span className="text-muted-foreground">{t('mlWaste.annualSavings', 'Annual Savings')}:</span>
 <p className="font-medium text-success">{sym}{convert(rec.potential_annual_savings ?? (rec.potential_monthly_savings ? rec.potential_monthly_savings * 12 : 0)).toFixed(2)}</p>
 </div>
 <div>
 <span className="text-muted-foreground">{t('mlWaste.mlConfidence', 'ML Confidence')}:</span>
 <p className="font-medium">{((rec.ml_confidence || 0) * 100).toFixed(0)}%</p>
 </div>
 {rec.current_hourly_cost !== undefined && rec.current_hourly_cost > 0 && (
 <div>
 <span className="text-muted-foreground">{t('mlWaste.hourlyCost', 'Hourly Cost')}:</span>
 <p className="font-medium">{sym}{convert(rec.current_hourly_cost ?? 0).toFixed(4)}</p>
 </div>
 )}
 </div>

 {rec.utilization_patterns && typeof rec.utilization_patterns === 'object' && (
 <div className="space-y-2">
 <p className="text-sm font-medium flex items-center gap-2">
 {t('mlWaste.utilizationPatterns', 'Utilization Patterns')}
 {(rec.utilization_patterns as any)?.hasRealMetrics && (
 <Badge variant="outline" className="text-xs">{t('mlWaste.realMetrics', 'Real Metrics')}</Badge>
 )}
 </p>
 <div className="grid grid-cols-3 gap-2 text-xs">
 <div className="bg-secondary/50 p-2 rounded">
 <span className="text-muted-foreground">{t('mlWaste.avgCpu', 'Avg CPU')}:</span>
 <p className="font-medium">{(rec.utilization_patterns as any)?.avgCpuUsage?.toFixed(1)}%</p>
 </div>
 <div className="bg-secondary/50 p-2 rounded">
 <span className="text-muted-foreground">{t('mlWaste.avgMemory', 'Avg Memory')}:</span>
 <p className="font-medium">{(rec.utilization_patterns as any)?.avgMemoryUsage?.toFixed(1)}%</p>
 </div>
 <div className="bg-secondary/50 p-2 rounded">
 <span className="text-muted-foreground">{t('mlWaste.peakHours', 'Peak Hours')}:</span>
 <p className="font-medium">{(rec.utilization_patterns as any)?.peakHours?.join(', ') || 'N/A'}</p>
 </div>
 </div>
 </div>
 )}

 {rec.auto_scaling_eligible && rec.auto_scaling_config && typeof rec.auto_scaling_config === 'object' && (
 <div className="bg-primary/10 p-3 rounded space-y-1">
 <div className="flex items-center gap-2">
 <Zap className="h-4 w-4 text-primary" />
 <span className="font-medium text-sm">{t('mlWaste.autoScalingConfigReady', 'Auto-Scaling Configuration Ready')}</span>
 </div>
 <div className="text-xs space-y-1 pl-6">
 <p>{t('mlWaste.minCapacity', 'Min Capacity')}: {(rec.auto_scaling_config as any).min_capacity}</p>
 <p>{t('mlWaste.maxCapacity', 'Max Capacity')}: {(rec.auto_scaling_config as any).max_capacity}</p>
 <p>{t('mlWaste.targetCpu', 'Target CPU')}: {(rec.auto_scaling_config as any).target_cpu}%</p>
 </div>
 </div>
 )}

 {/* Implementation Steps with Enhanced Explanations */}
 {rec.implementation_steps && Array.isArray(rec.implementation_steps) && rec.implementation_steps.length > 0 && (
 <Collapsible open={expandedSteps[rec.id]} onOpenChange={() => toggleSteps(rec.id)}>
 <CollapsibleTrigger asChild>
 <Button variant="ghost" size="sm" className="w-full justify-between">
 <span className="flex items-center gap-2">
 <Terminal className="h-4 w-4" />
 {t('mlWaste.implementationSteps', 'Implementation Steps')} ({rec.implementation_steps.length})
 </span>
 {expandedSteps[rec.id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
 </Button>
 </CollapsibleTrigger>
 <CollapsibleContent className="mt-2 space-y-3">
 {/* Script Usage Guide */}
 <Alert className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200">
 <Info className="h-4 w-4 text-blue-600" />
 <AlertTitle className="text-blue-800 dark:text-blue-200 text-sm">
 {t('mlWaste.howToUseScripts', 'How to use these scripts')}
 </AlertTitle>
 <AlertDescription className="text-blue-700 dark:text-blue-300 text-xs space-y-1">
 <p>
 {t('mlWaste.scriptsExplanation1', '1. These are AWS CLI commands that can be run in your terminal or AWS CloudShell.')}
 </p>
 <p>
 {t('mlWaste.scriptsExplanation2', '2. Make sure you have AWS CLI configured with appropriate credentials and permissions.')}
 </p>
 <p>
 {t('mlWaste.scriptsExplanation3', '3. Review each command carefully before executing, especially those marked as "destructive".')}
 </p>
 <p>
 {t('mlWaste.scriptsExplanation4', '4. We recommend creating snapshots/backups before any destructive operations.')}
 </p>
 </AlertDescription>
 </Alert>

 {(rec.implementation_steps as MLImplementationStep[]).map((step, idx) => {
 const explanation = getScriptExplanation(step);
 return (
 <div key={idx} className="border rounded p-3 space-y-2">
 <div className="flex items-center justify-between">
 <span className="font-medium text-sm">
 {t('mlWaste.step', 'Step')} {step.order}: {step.action}
 </span>
 <Badge variant={
 step.riskLevel === 'destructive' ? 'destructive' :
 step.riskLevel === 'review' ? 'secondary' : 'outline'
 }>
 {step.riskLevel === 'destructive' && <AlertTriangle className="h-3 w-3 mr-1" />}
 {step.riskLevel}
 </Badge>
 </div>
 
 {/* What this command does */}
 <div className="bg-muted/50 p-2 rounded text-xs space-y-1">
 <div className="flex items-start gap-2">
 <HelpCircle className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
 <div>
 <p className="font-medium text-muted-foreground">{t('mlWaste.whatThisDoes', 'What this does')}:</p>
 <p>{explanation.what}</p>
 </div>
 </div>
 <div className="flex items-start gap-2">
 <Terminal className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
 <div>
 <p className="font-medium text-muted-foreground">{t('mlWaste.whereToRun', 'Where to run')}:</p>
 <p>{explanation.where}</p>
 </div>
 </div>
 </div>

 {step.command && (
 <div className="flex items-start gap-2">
 <code className="flex-1 text-xs bg-muted p-2 rounded block overflow-x-auto font-mono">
 {step.command}
 </code>
 <TooltipProvider>
 <Tooltip>
 <TooltipTrigger asChild>
 <Button
 variant="ghost"
 size="sm"
 className="h-8 w-8 p-0 shrink-0"
 onClick={() => copyToClipboard(step.command!)}
 >
 <Copy className="h-3 w-3" />
 </Button>
 </TooltipTrigger>
 <TooltipContent>
 <p>{t('mlWaste.copyCommand', 'Copy command')}</p>
 </TooltipContent>
 </Tooltip>
 </TooltipProvider>
 </div>
 )}
 {step.notes && (
 <p className="text-xs text-muted-foreground italic">💡 {step.notes}</p>
 )}
 </div>
 );
 })}
 </CollapsibleContent>
 </Collapsible>
 )}

 <div className="flex items-center justify-between text-xs text-muted-foreground">
 <div className="flex items-center gap-1">
 <Clock className="h-3 w-3" />
 <span>{t('mlWaste.analyzed', 'Analyzed')}: {new Date(rec.analyzed_at).toLocaleString()}</span>
 </div>
 </div>
 </div>
 ))}

 {recommendationsLoading && (
 <div className="text-center py-8 text-muted-foreground">
 <Loader2 className="h-12 w-12 mx-auto mb-2 animate-spin opacity-50" />
 <p>{t('mlWaste.loadingRecommendations', 'Loading recommendations...')}</p>
 </div>
 )}
 {!recommendationsLoading && (!mlRecommendations || mlRecommendations.length === 0) && (
 <div className="text-center py-8 text-muted-foreground">
 <Brain className="h-12 w-12 mx-auto mb-2 opacity-50" />
 <p>{t('mlWaste.noDataYet', 'No ML analysis data yet.')}</p>
 <p className="text-sm">{t('mlWaste.runAnalysisToGet', 'Run an analysis to get AI-powered optimization recommendations based on real CloudWatch metrics.')}</p>
 </div>
 )}
 {!recommendationsLoading && mlRecommendations && mlRecommendations.length > 0 && filteredAndSortedRecommendations.length === 0 && (
 <div className="text-center py-8 text-muted-foreground">
 <Filter className="h-12 w-12 mx-auto mb-2 opacity-50" />
 <p>{t('mlWaste.noMatchingResults', 'No recommendations match your filters.')}</p>
 <Button
 variant="link"
 onClick={() => { setFilterType('all'); setFilterRisk('all'); setFilterComplexity('all'); }}
 >
 {t('mlWaste.clearFilters', 'Clear all filters')}
 </Button>
 </div>
 )}
 </div>
 </CardContent>
 </Card>
 )}

 {/* History Tab */}
 {activeTab === 'history' && (
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <History className="h-5 w-5" />
 {t('mlWaste.executionHistory', 'Execution History')}
 </CardTitle>
 <CardDescription>{t('mlWaste.trackAllAnalysis', 'Track all ML waste detection analysis runs')}</CardDescription>
 </CardHeader>
 <CardContent>
 {historyLoading ? (
 <div className="space-y-4">
 {[1, 2, 3].map((i) => (
 <Skeleton key={i} className="h-24 w-full" />
 ))}
 </div>
 ) : analysisHistory && analysisHistory.length > 0 ? (
 <div className="space-y-4">
 {analysisHistory.map((history) => (
 <div key={history.id} className="border rounded-lg p-4 space-y-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 {getStatusBadge(history.status)}
 <div>
 <p className="font-medium">
 {format(new Date(history.started_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm:ss", { locale: currentLocale })}
 </p>
 <p className="text-sm text-muted-foreground">
 {history.analysis_depth === 'deep' ? t('mlWaste.deepAnalysis', 'Deep Analysis') : t('mlWaste.standardAnalysis', 'Standard Analysis')}
 {history.regions_scanned && ` • ${(history.regions_scanned as string[]).join(', ')}`}
 </p>
 </div>
 </div>
 {history.execution_time_seconds && (
 <Badge variant="outline" className="text-xs">
 <Clock className="h-3 w-3 mr-1" />
 {history.execution_time_seconds.toFixed(1)}s
 </Badge>
 )}
 </div>

 {history.status === 'completed' && (
 <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
 <div className="bg-secondary/50 p-2 rounded">
 <span className="text-muted-foreground text-xs">{t('mlWaste.resourcesAnalyzed', 'Resources Analyzed')}</span>
 <p className="font-semibold text-lg">{history.total_resources_analyzed}</p>
 </div>
 <div className="bg-secondary/50 p-2 rounded">
 <span className="text-muted-foreground text-xs">{t('mlWaste.recommendations', 'Recommendations')}</span>
 <p className="font-semibold text-lg">{history.total_recommendations}</p>
 </div>
 <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded">
 <span className="text-muted-foreground text-xs">{t('mlWaste.monthlySavings', 'Monthly Savings')}</span>
 <p className="font-semibold text-lg text-green-600">{sym}{convert(history.total_monthly_savings).toFixed(2)}</p>
 </div>
 <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded">
 <span className="text-muted-foreground text-xs">{t('mlWaste.annualSavings', 'Annual Savings')}</span>
 <p className="font-semibold text-lg text-green-600">{sym}{convert(history.total_annual_savings).toFixed(2)}</p>
 </div>
 <div className="bg-secondary/50 p-2 rounded">
 <span className="text-muted-foreground text-xs">{t('mlWaste.byType', 'By Type')}</span>
 <div className="flex flex-wrap gap-1 mt-1">
 {history.terminate_count > 0 && (
 <Badge variant="destructive" className="text-xs">T:{history.terminate_count}</Badge>
 )}
 {history.downsize_count > 0 && (
 <Badge variant="default" className="text-xs">D:{history.downsize_count}</Badge>
 )}
 {history.autoscale_count > 0 && (
 <Badge variant="secondary" className="text-xs">A:{history.autoscale_count}</Badge>
 )}
 {history.optimize_count > 0 && (
 <Badge variant="outline" className="text-xs">O:{history.optimize_count}</Badge>
 )}
 {history.migrate_count > 0 && (
 <Badge variant="outline" className="text-xs">M:{history.migrate_count}</Badge>
 )}
 </div>
 </div>
 </div>
 )}

 {history.status === 'failed' && history.error_message && (
 <Alert variant="destructive">
 <XCircle className="h-4 w-4" />
 <AlertTitle>{t('mlWaste.analysisFailed', 'Analysis Failed')}</AlertTitle>
 <AlertDescription>{history.error_message}</AlertDescription>
 </Alert>
 )}

 {history.status === 'running' && (
 <div className="flex items-center gap-2 text-blue-600">
 <Loader2 className="h-4 w-4 animate-spin" />
 <span className="text-sm">{t('mlWaste.analysisInProgressShort', 'Analysis in progress...')}</span>
 </div>
 )}
 </div>
 ))}
 </div>
 ) : (
 <div className="text-center py-8 text-muted-foreground">
 <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
 <p>{t('mlWaste.noHistoryYet', 'No analysis history yet.')}</p>
 <p className="text-sm">{t('mlWaste.runFirstAnalysis', 'Run your first ML analysis to see execution history here.')}</p>
 </div>
 )}
 </CardContent>
 </Card>
 )}
 </div>
 </Layout>
 );
}
