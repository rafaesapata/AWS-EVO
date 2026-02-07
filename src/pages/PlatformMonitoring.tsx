/**
 * Platform Monitoring Dashboard
 * 
 * Monitors 100% of the system:
 * - All Lambda functions (114 functions)
 * - API Gateway endpoints (111 endpoints)
 * - Frontend errors (React, API calls, rendering)
 * - Performance metrics (execution time, response time)
 * - Dynamic error fix prompts
 * 
 * Optimized with:
 * - React Query for caching and automatic refetching
 * - Memoized computations for error patterns
 * - Skeleton loaders for better UX
 */

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { 
 AlertTriangle, 
 Activity, 
 RefreshCw, 
 ExternalLink, 
 CheckCircle, 
 XCircle, 
 AlertCircle,
 Copy,
 Download,
 Search,
 TrendingUp,
 TrendingDown,
 Minus,
 Terminal,
 Clock,
 Server,
 Globe,
 Code,
 Database,
 Shield,
 DollarSign,
 Bot,
 Heart,
} from 'lucide-react';
import { LambdaHealthMonitor } from '@/components/LambdaHealthMonitor';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/integrations/aws/api-client';
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogHeader,
 DialogTitle,
 DialogTrigger,
 DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  usePlatformMetrics, 
  useFilteredErrors, 
  useFilteredPatterns,
  type RecentError,
  type ErrorPattern,
} from '@/hooks/usePlatformMetrics';

// ==================== INTERFACES ====================

interface AlarmStatus {
 name: string;
 state: 'OK' | 'ALARM' | 'INSUFFICIENT_DATA';
 reason: string;
 metric: string;
 threshold: number;
 currentValue: number;
}

// ==================== COMPONENT ====================

export default function PlatformMonitoring() {
 const { t } = useTranslation();
 const { toast } = useToast();
 const [activeTab, setActiveTab] = useState('overview');
 const [searchTerm, setSearchTerm] = useState('');
 const [filterCategory, setFilterCategory] = useState('all');
 const [filterSeverity, setFilterSeverity] = useState('all');
 const [selectedError, setSelectedError] = useState<RecentError | null>(null);
 const [errorPrompt, setErrorPrompt] = useState('');
 const [loadingErrorPrompt, setLoadingErrorPrompt] = useState(false);
 const [selectedPattern, setSelectedPattern] = useState<ErrorPattern | null>(null);
 const [generatingPrompt, setGeneratingPrompt] = useState(false);
 const [generatedPrompt, setGeneratedPrompt] = useState('');
 
 // Performance tab filters
 const [perfSearchTerm, setPerfSearchTerm] = useState('');
 const [perfFilterCategory, setPerfFilterCategory] = useState('all');
 const [perfFilterStatus, setPerfFilterStatus] = useState('all');
 const [perfSortBy, setPerfSortBy] = useState('invocations');
 
 // Use optimized hook for metrics with React Query caching
 const {
   metrics,
   performanceMetrics,
   coverage,
   recentErrors,
   errorPatterns,
   alarms,
   isLoading,
   isRefetching,
   refresh,
 } = usePlatformMetrics();

 // Memoized filtered data
 const filteredErrors = useFilteredErrors(recentErrors, searchTerm, filterCategory);
 const filteredPatterns = useFilteredPatterns(errorPatterns, filterSeverity);

 // Memoized filtered and sorted performance metrics
 const filteredPerformanceMetrics = useMemo(() => {
   let filtered = performanceMetrics;
   
   // Filter by search term
   if (perfSearchTerm) {
     const search = perfSearchTerm.toLowerCase();
     filtered = filtered.filter(m => 
       m.name.toLowerCase().includes(search) ||
       m.category.toLowerCase().includes(search)
     );
   }
   
   // Filter by category
   if (perfFilterCategory !== 'all') {
     filtered = filtered.filter(m => m.category === perfFilterCategory);
   }
   
   // Filter by status
   if (perfFilterStatus !== 'all') {
     filtered = filtered.filter(m => m.status === perfFilterStatus);
   }
   
   // Sort
   const sorted = [...filtered].sort((a, b) => {
     switch (perfSortBy) {
       case 'invocations':
         return (b.invocations || 0) - (a.invocations || 0);
       case 'avgDuration':
         return (b.avgDuration || 0) - (a.avgDuration || 0);
       case 'p95':
         return (b.p95 || 0) - (a.p95 || 0);
       case 'errors':
         return ((b as any).errors || 0) - ((a as any).errors || 0);
       case 'name':
         return a.name.localeCompare(b.name);
       default:
         return 0;
     }
   });
   
   return sorted;
 }, [performanceMetrics, perfSearchTerm, perfFilterCategory, perfFilterStatus, perfSortBy]);

 // Generate prompt for a specific error
 const generatePromptForSpecificError = useCallback(async (error: RecentError) => {
   const prompt = `## 🔧 Correção de Erro - ${error.errorType}

### Contexto
- **Timestamp:** ${new Date(error.timestamp).toLocaleString('pt-BR')}
- **Source:** ${error.source}
- **Status Code:** ${error.statusCode || 'N/A'}
${error.lambdaName ? `- **Lambda:** ${error.lambdaName}` : ''}
${error.endpoint ? `- **Endpoint:** ${error.endpoint}` : ''}

### Erro
\`\`\`
${error.message}
\`\`\`

### Instruções
Por favor, analise este erro e:
1. Identifique a causa raiz do problema
2. Verifique os arquivos relevantes no projeto
3. Implemente a correção necessária
4. Faça o deploy se necessário

### Arquivos Relevantes
${error.lambdaName ? `- \`backend/src/handlers/**/${error.lambdaName.replace('evo-uds-v3-production-', '')}.ts\`` : ''}
- Verifique os steering files em \`.kiro/steering/\` para contexto adicional

### Prioridade
${error.statusCode && error.statusCode >= 500 ? '🔴 ALTA - Erro 5xx afetando usuários' : '🟡 MÉDIA - Investigar e corrigir'}
`;
   return prompt;
 }, []);

 // Handle error selection - generate prompt automatically
 const handleErrorClick = useCallback(async (error: RecentError) => {
   setSelectedError(error);
   setLoadingErrorPrompt(true);
   setErrorPrompt('');
   
   try {
     // Try to get dynamic prompt from API first
     const result = await apiClient.invoke('generate-error-fix-prompt', {
       body: {
         errorType: error.errorType,
         errorMessage: error.message,
         lambdaName: error.lambdaName,
         statusCode: error.statusCode,
         source: error.source,
       },
     });

     if (result.error || !result.data) {
       // Fallback to local prompt generation
       const localPrompt = await generatePromptForSpecificError(error);
       setErrorPrompt(localPrompt);
     } else {
       const data = result.data as any;
       setErrorPrompt(data.prompt);
     }
   } catch (err) {
     // Fallback to local prompt generation
     const localPrompt = await generatePromptForSpecificError(error);
     setErrorPrompt(localPrompt);
   } finally {
     setLoadingErrorPrompt(false);
   }
 }, [generatePromptForSpecificError]);

 // Generate prompt dynamically
 const generatePromptForError = useCallback(async (pattern: ErrorPattern) => {
 setGeneratingPrompt(true);
 setGeneratedPrompt('');
 
 try {
 const result = await apiClient.invoke('generate-error-fix-prompt', {
 body: {
 errorType: pattern.errorType,
 errorMessage: pattern.pattern,
 lambdaName: pattern.affectedLambdas[0],
 },
 });

 if (result.error) {
 throw new Error(result.error.message);
 }

 const data = result.data as any;
 setGeneratedPrompt(data.prompt);
 
 toast({
 title: t('platformMonitoring.promptGenerated', 'Prompt generated!'),
 description: t('platformMonitoring.promptGeneratedDesc', 'Fix prompt generated successfully'),
 });
 } catch (err) {
 toast({
 title: t('platformMonitoring.errorGeneratingPrompt', 'Error generating prompt'),
 description: err instanceof Error ? err.message : t('platformMonitoring.couldNotGeneratePrompt', 'Could not generate the fix prompt'),
 variant: 'destructive',
 });
 } finally {
 setGeneratingPrompt(false);
 }
 }, [toast]);

 // Helper functions
 const getStatusColor = (status: string) => {
 switch (status) {
 case 'ok':
 case 'OK':
 case 'fast':
 return 'text-green-500';
 case 'warning':
 case 'normal':
 return 'text-yellow-500';
 case 'critical':
 case 'ALARM':
 case 'slow':
 return 'text-red-500';
 default:
 return 'text-gray-500';
 }
 };

 const getStatusIcon = (status: string) => {
 switch (status) {
 case 'ok':
 case 'OK':
 case 'fast':
 return <CheckCircle className="h-5 w-5 text-green-500" />;
 case 'warning':
 case 'normal':
 return <AlertCircle className="h-5 w-5 text-yellow-500" />;
 case 'critical':
 case 'ALARM':
 case 'slow':
 return <XCircle className="h-5 w-5 text-red-500" />;
 default:
 return <AlertCircle className="h-5 w-5 text-gray-500" />;
 }
 };

 const getTrendIcon = (trend: string) => {
 switch (trend) {
 case 'up':
 return <TrendingUp className="h-3 w-3 text-red-500" />;
 case 'down':
 return <TrendingDown className="h-3 w-3 text-green-500" />;
 default:
 return <Minus className="h-3 w-3 text-gray-500" />;
 }
 };

 const getCategoryIcon = (category: string) => {
 switch (category) {
 case 'backend':
 case 'auth':
 case 'security':
 return <Server className="h-4 w-4" />;
 case 'frontend':
 return <Globe className="h-4 w-4" />;
 case 'api-gateway':
 return <Activity className="h-4 w-4" />;
 case 'database':
 return <Database className="h-4 w-4" />;
 case 'cost':
 return <DollarSign className="h-4 w-4" />;
 case 'ai':
 return <Bot className="h-4 w-4" />;
 default:
 return <AlertTriangle className="h-4 w-4" />;
 }
 };

 const getSeverityBadge = (severity: string) => {
 switch (severity) {
 case 'critical':
 return <Badge variant="destructive">Critical</Badge>;
 case 'high':
 return <Badge className="bg-orange-500">High</Badge>;
 case 'medium':
 return <Badge className="bg-yellow-500">Medium</Badge>;
 case 'low':
 return <Badge variant="outline">Low</Badge>;
 default:
 return <Badge variant="outline">{severity}</Badge>;
 }
 };

 const copyToClipboard = (text: string) => {
 navigator.clipboard.writeText(text);
 toast({
 title: t('platformMonitoring.copied', 'Copied!'),
 description: t('platformMonitoring.promptCopied', 'Prompt copied to clipboard'),
 });
 };

 const downloadPrompt = (prompt: string, filename: string) => {
 const blob = new Blob([prompt], { type: 'text/markdown' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = filename;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);
 };

 return (
 <Layout
 title={t('sidebar.platformMonitoring', 'Platform Monitoring - 100% Coverage')}
 description={t('platformMonitoring.description', 'Dashboard completo: 114 Lambdas, 111 Endpoints, Frontend + Performance')}
 icon={<Activity className="h-4 w-4" />}
 >
 <div className="space-y-6">
 {/* Header */}
 <div className="flex items-center justify-between flex-wrap gap-2">
 <div className="flex items-center gap-2 flex-wrap">
 <Badge variant="outline" >
 <Activity className="h-3 w-3 mr-1" />
 {t('platformMonitoring.realTime', 'Real Time')}
 </Badge>
 <Badge variant="outline" className=" bg-green-500/10 border-green-500/30">
 <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
 {coverage.overallCoverage}% Coverage
 </Badge>
 <Badge variant="outline" >
 {coverage.monitoredLambdas}/{coverage.totalLambdas} Lambdas
 </Badge>
 <Badge variant="outline" >
 {coverage.monitoredEndpoints}/{coverage.totalEndpoints} Endpoints
 </Badge>
 </div>
 <div className="flex gap-2">
 <Button 
 variant="outline" 
 size="sm" 
 onClick={() => window.open('https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=EVO-production-Error-Monitoring', '_blank')}
 
 >
 <ExternalLink className="h-4 w-4 mr-2" />
 CloudWatch
 </Button>
 <Button 
 variant="outline" 
 size="sm" 
 onClick={refresh} 
 disabled={isLoading || isRefetching} 
 
 >
 <RefreshCw className={`h-4 w-4 mr-2 ${isLoading || isRefetching ? 'animate-spin' : ''}`} />
 {t('platformMonitoring.refresh', 'Refresh')}
 </Button>
 </div>
 </div>

 {/* Coverage Card */}
 <Card >
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Shield className="h-5 w-5 text-green-500" />
 {t('platformMonitoring.systemCoverage', 'System Coverage - 100%')}
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="grid gap-4 md:grid-cols-3">
 <div className="space-y-2">
 <div className="flex justify-between text-sm">
 <span>Backend (Lambdas)</span>
 <span className="font-medium">{coverage.monitoredLambdas}/{coverage.totalLambdas}</span>
 </div>
 <div className="h-2 bg-muted rounded-full overflow-hidden">
 <div className="h-full bg-green-500" style={{ width: '100%' }} />
 </div>
 </div>
 <div className="space-y-2">
 <div className="flex justify-between text-sm">
 <span>API Gateway</span>
 <span className="font-medium">{coverage.monitoredEndpoints}/{coverage.totalEndpoints}</span>
 </div>
 <div className="h-2 bg-muted rounded-full overflow-hidden">
 <div className="h-full bg-green-500" style={{ width: '100%' }} />
 </div>
 </div>
 <div className="space-y-2">
 <div className="flex justify-between text-sm">
 <span>Frontend</span>
 <span className="font-medium">{coverage.frontendCoverage}%</span>
 </div>
 <div className="h-2 bg-muted rounded-full overflow-hidden">
 <div className="h-full bg-green-500" style={{ width: '100%' }} />
 </div>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Tabs */}
 <Tabs value={activeTab} onValueChange={setActiveTab}>
 <TabsList className="glass-card-float">
 <TabsTrigger value="overview">{t('platformMonitoring.overview', 'Overview')}</TabsTrigger>
 <TabsTrigger value="lambda-health">
 <Heart className="h-4 w-4 mr-1" />
 {t('platformMonitoring.lambdaHealth', 'Lambda Health')}
 </TabsTrigger>
 <TabsTrigger value="errors">{t('platformMonitoring.errors', 'Errors')}</TabsTrigger>
 <TabsTrigger value="patterns">{t('platformMonitoring.patterns', 'Patterns')}</TabsTrigger>
 <TabsTrigger value="performance">{t('platformMonitoring.performance', 'Performance')}</TabsTrigger>
 <TabsTrigger value="alarms">{t('platformMonitoring.alarms', 'Alarms')}</TabsTrigger>
 </TabsList>

 {/* Overview Tab */}
 <TabsContent value="overview" className="space-y-6">
 {(() => {
 if (isLoading) {
 return (
 <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
 {[...Array(9)].map((_, index) => (
 <Card key={index} >
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Skeleton className="h-5 w-5 rounded" />
 <Skeleton className="h-4 w-24" />
 </div>
 <Skeleton className="h-5 w-5 rounded-full" />
 </div>
 </CardHeader>
 <CardContent>
 <div className="space-y-2">
 <div className="flex items-baseline gap-2">
 <Skeleton className="h-10 w-16" />
 <Skeleton className="h-4 w-12" />
 </div>
 <div className="flex items-center gap-2">
 <Skeleton className="h-3 w-3 rounded" />
 <Skeleton className="h-3 w-20" />
 </div>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 );
 }
 
 if (metrics.length === 0) {
 return (
 <Card >
 <CardContent className="flex flex-col items-center justify-center py-12">
 <Activity className="h-12 w-12 text-muted-foreground mb-4" />
 <p className="text-muted-foreground text-center">
 {t('platformMonitoring.noMetricsAvailable', 'No metrics available at the moment.')}<br />
 {t('platformMonitoring.clickRefreshToLoad', 'Click "Refresh" to load data.')}
 </p>
 </CardContent>
 </Card>
 );
 }
 
 return (
 <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
 {metrics.map((metric, index) => (
 <Card key={index} >
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 {getCategoryIcon(metric.category)}
 <CardTitle className="text-sm font-medium capitalize">{metric.name}</CardTitle>
 </div>
 {getStatusIcon(metric.status)}
 </div>
 </CardHeader>
 <CardContent>
 <div className="space-y-3">
 {/* Invocations - Main metric */}
 <div>
 <div className="text-xs text-muted-foreground mb-1">{t('platformMonitoring.invocationsLastHour', 'Invocations (last hour)')}</div>
 <div className="flex items-baseline gap-2">
 <span className="text-3xl font-semibold">{(metric as any).invocations?.toLocaleString() || 0}</span>
 </div>
 </div>
 
 {/* Errors and Error Rate */}
 <div className="grid grid-cols-2 gap-4 pt-2 border-t">
 <div>
 <div className="text-xs text-muted-foreground">{t('platformMonitoring.errorsLabel', 'Errors')}</div>
 <div className={`text-lg font-medium ${metric.value > 0 ? 'text-red-500' : 'text-green-500'}`}>
 {metric.value}
 </div>
 </div>
 <div>
 <div className="text-xs text-muted-foreground">{t('platformMonitoring.errorRate', 'Error Rate')}</div>
 <div className={`text-lg font-medium ${(metric as any).errorRate > 5 ? 'text-red-500' : (metric as any).errorRate > 0 ? 'text-yellow-500' : 'text-green-500'}`}>
 {((metric as any).errorRate || 0).toFixed(1)}%
 </div>
 </div>
 </div>
 
 {/* Lambda count */}
 <div className="text-xs text-muted-foreground">
 {t('platformMonitoring.lambdasInCategory', '{{count}} Lambdas in this category', { count: (metric as any).lambdaCount || 0 })}
 </div>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 );
 })()}
 </TabsContent>

 {/* Lambda Health Tab */}
 <TabsContent value="lambda-health" className="space-y-6">
 <LambdaHealthMonitor />
 </TabsContent>

 {/* Errors Tab */}
 <TabsContent value="errors" className="space-y-6">
 <Card >
 <CardHeader>
 <div className="flex items-center justify-between">
 <CardTitle>{t('platformMonitoring.recentErrors', 'Recent Errors')}</CardTitle>
 <div className="flex gap-2">
 <div className="relative">
 <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder={t('platformMonitoring.searchErrors', 'Search errors...')}
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 className="pl-8 w-[200px]"
 />
 </div>
 <Select value={filterCategory} onValueChange={setFilterCategory}>
 <SelectTrigger className="w-[150px]">
 <SelectValue placeholder={t('platformMonitoring.category', 'Category')} />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">{t('platformMonitoring.allCategories', 'All')}</SelectItem>
 <SelectItem value="backend">Backend</SelectItem>
 <SelectItem value="frontend">Frontend</SelectItem>
 <SelectItem value="api-gateway">API Gateway</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 {isLoading ? (
 <div className="space-y-3">
 {[...Array(5)].map((_, index) => (
 <div key={index} className="p-4 rounded-lg border border-primary/20 bg-muted/30">
 <div className="flex items-start justify-between mb-2">
 <div className="flex items-center gap-2">
 <Skeleton className="h-5 w-12" />
 <Skeleton className="h-5 w-20" />
 </div>
 <Skeleton className="h-4 w-32" />
 </div>
 <Skeleton className="h-4 w-48 mb-2" />
 <Skeleton className="h-4 w-full" />
 <Skeleton className="h-4 w-3/4 mt-1" />
 </div>
 ))}
 </div>
 ) : filteredErrors.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-12">
 <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
 <p className="text-muted-foreground text-center">
 {t('platformMonitoring.noErrorsFound', 'No errors found in the last 24 hours.')}
 </p>
 </div>
 ) : (
 <ScrollArea className="h-[400px]">
 <div className="space-y-3">
 {filteredErrors.map((error) => (
 <div
 key={error.id}
 className="p-4 rounded-lg border border-primary/20 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
 onClick={() => handleErrorClick(error)}
 >
 <div className="flex items-start justify-between mb-2">
 <div className="flex items-center gap-2">
 <Badge variant="destructive">{error.statusCode}</Badge>
 <Badge variant="outline" className="capitalize">{error.source}</Badge>
 </div>
 <span className="text-xs text-muted-foreground">
 {new Date(error.timestamp).toLocaleString('pt-BR')}
 </span>
 </div>
 <div className="font-medium text-sm mb-1">{error.errorType}</div>
 <div className="text-sm text-muted-foreground line-clamp-2">{error.message}</div>
 {error.lambdaName && (
 <div className="flex gap-2 text-xs text-muted-foreground mt-2">
 <Code className="h-3 w-3" />
 <span>{error.lambdaName}</span>
 </div>
 )}
 </div>
 ))}
 </div>
 </ScrollArea>
 )}
 </CardContent>
 </Card>
 </TabsContent>

 {/* Patterns Tab with Dynamic Prompt Generation */}
 <TabsContent value="patterns" className="space-y-6">
 <Card >
 <CardContent className="pt-6">
 <Select value={filterSeverity} onValueChange={setFilterSeverity}>
 <SelectTrigger className="w-[200px]">
 <SelectValue placeholder={t('platformMonitoring.severity', 'Severity')} />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">{t('platformMonitoring.allSeverities', 'All')}</SelectItem>
 <SelectItem value="critical">Critical</SelectItem>
 <SelectItem value="high">High</SelectItem>
 <SelectItem value="medium">Medium</SelectItem>
 <SelectItem value="low">Low</SelectItem>
 </SelectContent>
 </Select>
 </CardContent>
 </Card>

 {isLoading ? (
 <div className="grid gap-4">
 {[...Array(3)].map((_, index) => (
 <Card key={index} >
 <CardHeader>
 <div className="flex items-start justify-between">
 <div className="space-y-2 flex-1">
 <div className="flex items-center gap-2">
 <Skeleton className="h-5 w-5 rounded" />
 <Skeleton className="h-6 w-48" />
 </div>
 <Skeleton className="h-3 w-64" />
 </div>
 <Skeleton className="h-6 w-20" />
 </div>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div>
 <Skeleton className="h-4 w-24 mb-2" />
 <Skeleton className="h-6 w-12" />
 </div>
 <div>
 <Skeleton className="h-4 w-32 mb-2" />
 <Skeleton className="h-6 w-12" />
 </div>
 </div>
 <div className="space-y-2">
 <Skeleton className="h-4 w-32" />
 <div className="flex flex-wrap gap-2">
 <Skeleton className="h-6 w-24" />
 <Skeleton className="h-6 w-32" />
 <Skeleton className="h-6 w-28" />
 </div>
 </div>
 <Skeleton className="h-16 w-full rounded-lg" />
 <Skeleton className="h-9 w-48" />
 </CardContent>
 </Card>
 ))}
 </div>
 ) : filteredPatterns.length === 0 ? (
 <Card >
 <CardContent className="flex flex-col items-center justify-center py-12">
 <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
 <p className="text-muted-foreground text-center">
 {t('platformMonitoring.noPatternDetected', 'No error pattern detected.')}
 </p>
 </CardContent>
 </Card>
 ) : (
 <div className="grid gap-4">
 {filteredPatterns.map((pattern, index) => (
 <Card key={index} >
 <CardHeader>
 <div className="flex items-start justify-between">
 <div className="space-y-1">
 <CardTitle className="text-lg flex items-center gap-2">
 <AlertTriangle className="h-5 w-5 text-orange-500" />
 {pattern.errorType}
 </CardTitle>
 <CardDescription className="font-mono text-xs">
 {pattern.pattern}
 </CardDescription>
 </div>
 {getSeverityBadge(pattern.severity)}
 </div>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid grid-cols-2 gap-4 text-sm">
 <div>
 <div className="text-muted-foreground">{t('platformMonitoring.occurrences', 'Occurrences')}</div>
 <div className="font-semibold text-lg">{pattern.count}</div>
 </div>
 <div>
 <div className="text-muted-foreground">{t('platformMonitoring.affectedLambdas', 'Affected Lambdas')}</div>
 <div className="font-semibold text-lg">{pattern.affectedLambdas.length}</div>
 </div>
 </div>

 <div className="space-y-2">
 <div className="text-sm font-medium">{t('platformMonitoring.affectedLambdas', 'Affected Lambdas')}:</div>
 <div className="flex flex-wrap gap-2">
 {pattern.affectedLambdas.map((lambda, i) => (
 <Badge key={i} variant="outline" className="font-mono text-xs">
 {lambda}
 </Badge>
 ))}
 </div>
 </div>

 <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
 <div className="text-sm font-medium text-blue-400 mb-1">{t('platformMonitoring.suggestedFix', 'Suggested Fix:')}</div>
 <div className="text-sm">{pattern.suggestedFix}</div>
 </div>

 <div className="flex gap-2">
 <Dialog>
 <DialogTrigger asChild>
 <Button 
 variant="outline" 
 size="sm" 
 
 onClick={() => {
 setSelectedPattern(pattern);
 generatePromptForError(pattern);
 }}
 >
 <Terminal className="h-4 w-4 mr-2" />
 {t('platformMonitoring.generateFixPrompt', 'Generate Fix Prompt')}
 </Button>
 </DialogTrigger>
 <DialogContent className="max-w-4xl max-h-[80vh]">
 <DialogHeader>
 <DialogTitle>{t('platformMonitoring.autoFixPrompt', 'Automatic Fix Prompt')}</DialogTitle>
 <DialogDescription>
 {t('platformMonitoring.pastePromptInChat', 'Paste this prompt in the chat to resolve the issue')}
 </DialogDescription>
 </DialogHeader>
 <ScrollArea className="h-[500px] w-full">
 {generatingPrompt ? (
 <div className="flex items-center justify-center h-full">
 <div className="text-center space-y-2">
 <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
 <p className="text-sm text-muted-foreground">{t('platformMonitoring.generatingPrompt', 'Generating prompt...')}</p>
 </div>
 </div>
 ) : generatedPrompt ? (
 <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
 {generatedPrompt}
 </pre>
 ) : (
 <div className="flex items-center justify-center h-full">
 <p className="text-sm text-muted-foreground">{t('platformMonitoring.clickGenerateToStart', 'Click "Generate Prompt" to start')}</p>
 </div>
 )}
 </ScrollArea>
 <DialogFooter>
 <Button 
 variant="outline" 
 onClick={() => copyToClipboard(generatedPrompt)}
 disabled={!generatedPrompt || generatingPrompt}
 >
 <Copy className="h-4 w-4 mr-2" />
 {t('platformMonitoring.copyPrompt', 'Copy Prompt')}
 </Button>
 <Button 
 onClick={() => downloadPrompt(generatedPrompt, `fix-${pattern.errorType.replace(/\s+/g, '-').toLowerCase()}.md`)}
 disabled={!generatedPrompt || generatingPrompt}
 >
 <Download className="h-4 w-4 mr-2" />
 Download .md
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 )}
 </TabsContent>

 {/* Performance Tab */}
 <TabsContent value="performance" className="space-y-6">
 <Card >
 <CardHeader>
 <div className="flex items-center justify-between flex-wrap gap-4">
 <div>
 <CardTitle>{t('platformMonitoring.lambdaPerformance', 'Lambda Performance')}</CardTitle>
 <CardDescription>
 {t('platformMonitoring.avgExecutionTimeP95', 'Average execution time and 95th percentile - {{count}} Lambdas', { count: performanceMetrics.length })}
 </CardDescription>
 </div>
 <div className="flex gap-2 flex-wrap">
 <div className="relative">
 <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder={t('platformMonitoring.searchLambda', 'Search Lambda...')}
 value={perfSearchTerm}
 onChange={(e) => setPerfSearchTerm(e.target.value)}
 className="pl-8 w-[200px]"
 />
 </div>
 <Select value={perfFilterCategory} onValueChange={setPerfFilterCategory}>
 <SelectTrigger className="w-[150px]">
 <SelectValue placeholder={t('platformMonitoring.category', 'Category')} />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">{t('platformMonitoring.allCategories', 'All')}</SelectItem>
 <SelectItem value="auth">Auth</SelectItem>
 <SelectItem value="security">Security</SelectItem>
 <SelectItem value="cost">Cost</SelectItem>
 <SelectItem value="monitoring">Monitoring</SelectItem>
 <SelectItem value="azure">Azure</SelectItem>
 <SelectItem value="admin">Admin</SelectItem>
 <SelectItem value="ai">AI</SelectItem>
 <SelectItem value="license">License</SelectItem>
 <SelectItem value="reports">Reports</SelectItem>
 <SelectItem value="onboarding">Onboarding</SelectItem>
 <SelectItem value="data">Data</SelectItem>
 <SelectItem value="organizations">Organizations</SelectItem>
 <SelectItem value="notifications">Notifications</SelectItem>
 <SelectItem value="storage">Storage</SelectItem>
 <SelectItem value="jobs">Jobs</SelectItem>
 <SelectItem value="knowledge-base">Knowledge Base</SelectItem>
 <SelectItem value="integrations">Integrations</SelectItem>
 <SelectItem value="other">Other</SelectItem>
 </SelectContent>
 </Select>
 <Select value={perfFilterStatus} onValueChange={setPerfFilterStatus}>
 <SelectTrigger className="w-[130px]">
 <SelectValue placeholder="Status" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">{t('platformMonitoring.allStatuses', 'All')}</SelectItem>
 <SelectItem value="fast">Fast (&lt;1s)</SelectItem>
 <SelectItem value="normal">Normal (1-5s)</SelectItem>
 <SelectItem value="slow">Slow (&gt;5s)</SelectItem>
 <SelectItem value="unknown">Unknown</SelectItem>
 </SelectContent>
 </Select>
 <Select value={perfSortBy} onValueChange={setPerfSortBy}>
 <SelectTrigger className="w-[150px]">
 <SelectValue placeholder={t('platformMonitoring.sortBy', 'Sort by')} />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="invocations">{t('platformMonitoring.invocations', 'Invocations')}</SelectItem>
 <SelectItem value="avgDuration">{t('platformMonitoring.avgDuration', 'Avg Duration')}</SelectItem>
 <SelectItem value="p95">P95</SelectItem>
 <SelectItem value="errors">{t('platformMonitoring.errorsLabel', 'Errors')}</SelectItem>
 <SelectItem value="name">{t('platformMonitoring.name', 'Name')}</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 {isLoading ? (
 <div className="space-y-4">
 {[...Array(6)].map((_, index) => (
 <div key={index} className="p-4 rounded-lg border border-primary/20 bg-muted/30">
 <div className="flex items-start justify-between mb-3">
 <div className="flex items-center gap-2">
 <Skeleton className="h-5 w-5 rounded" />
 <div>
 <Skeleton className="h-4 w-48 mb-1" />
 <Skeleton className="h-3 w-24" />
 </div>
 </div>
 <div className="flex items-center gap-2">
 <Skeleton className="h-4 w-4 rounded" />
 <Skeleton className="h-5 w-16" />
 </div>
 </div>
 <div className="grid grid-cols-3 gap-4">
 <div>
 <Skeleton className="h-3 w-12 mb-1" />
 <Skeleton className="h-5 w-16" />
 </div>
 <div>
 <Skeleton className="h-3 w-8 mb-1" />
 <Skeleton className="h-5 w-16" />
 </div>
 <div>
 <Skeleton className="h-3 w-20 mb-1" />
 <Skeleton className="h-5 w-16" />
 </div>
 </div>
 <Skeleton className="h-2 w-full mt-3 rounded-full" />
 </div>
 ))}
 </div>
 ) : filteredPerformanceMetrics.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-12">
 <Activity className="h-12 w-12 text-muted-foreground mb-4" />
 <p className="text-muted-foreground text-center">
 {performanceMetrics.length === 0 
 ? t('platformMonitoring.noPerformanceMetrics', 'No performance metrics available.')
 : t('platformMonitoring.noLambdaMatchFilters', 'No Lambda found matching the selected filters.')}
 </p>
 </div>
 ) : (
 <ScrollArea className="h-[600px]">
 <div className="space-y-4">
 <div className="text-sm text-muted-foreground mb-2">
 {t('platformMonitoring.showing', 'Showing {{filtered}} of {{total}} Lambdas', { filtered: filteredPerformanceMetrics.length, total: performanceMetrics.length })}
 </div>
 {filteredPerformanceMetrics.map((metric) => (
 <div key={metric.name} className="p-4 rounded-lg border border-primary/20 bg-muted/30">
 <div className="flex items-start justify-between mb-3">
 <div className="flex items-center gap-2">
 {getCategoryIcon(metric.category)}
 <div>
 <div className="font-medium">{metric.name}</div>
 <div className="text-xs text-muted-foreground capitalize">{metric.category}</div>
 </div>
 </div>
 <div className="flex items-center gap-2">
 <Clock className={`h-4 w-4 ${getStatusColor(metric.status)}`} />
 <Badge variant={metric.status === 'fast' ? 'outline' : metric.status === 'slow' ? 'destructive' : metric.status === 'unknown' ? 'secondary' : 'default'}>
 {metric.status}
 </Badge>
 </div>
 </div>
 
 <div className="grid grid-cols-4 gap-4 text-sm">
 <div>
 <div className="text-muted-foreground text-xs">{t('platformMonitoring.avg', 'Avg')}</div>
 <div className="font-semibold">{(metric.avgDuration || 0)}ms</div>
 </div>
 <div>
 <div className="text-muted-foreground text-xs">p95</div>
 <div className="font-medium">{(metric.p95 || 0)}ms</div>
 </div>
 <div>
 <div className="text-muted-foreground text-xs">{t('platformMonitoring.invocations', 'Invocations')}</div>
 <div className="font-medium">{(metric.invocations || 0).toLocaleString()}</div>
 </div>
 <div>
 <div className="text-muted-foreground text-xs">{t('platformMonitoring.errorsLabel', 'Errors')}</div>
 <div className={`font-medium ${(metric.errors || 0) > 0 ? 'text-red-500' : ''}`}>
 {(metric.errors || 0).toLocaleString()}
 {metric.errorRate && metric.errorRate > 0 && (
 <span className="text-xs ml-1">({metric.errorRate.toFixed(1)}%)</span>
 )}
 </div>
 </div>
 </div>

 <div className="mt-3">
 <div className="h-2 bg-muted rounded-full overflow-hidden">
 <div 
 className={`h-full ${
 metric.status === 'fast' ? 'bg-green-500' :
 metric.status === 'normal' ? 'bg-yellow-500' :
 metric.status === 'unknown' ? 'bg-gray-400' :
 'bg-red-500'
 }`}
 style={{ width: `${Math.min(((metric.avgDuration || 0) / Math.max(metric.p95 || 1, 1)) * 100, 100)}%` }}
 />
 </div>
 </div>
 </div>
 ))}
 </div>
 </ScrollArea>
 )}
 </CardContent>
 </Card>
 </TabsContent>

 {/* Alarms Tab */}
 <TabsContent value="alarms" className="space-y-6">
 <Card >
 <CardHeader>
 <CardTitle>{t('platformMonitoring.cloudWatchAlarms', 'CloudWatch Alarms Status')}</CardTitle>
 <CardDescription>
 {t('platformMonitoring.alarmsConfigured', 'Alarms configured for the EVO system')}
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="space-y-4">
 {alarms.map((alarm, index) => (
 <div key={index} className="p-4 rounded-lg border border-primary/20 bg-muted/30">
 <div className="flex items-start justify-between mb-2">
 <div className="flex items-center gap-2">
 {getStatusIcon(alarm.state)}
 <div>
 <div className="font-medium">{alarm.name}</div>
 <div className="text-xs text-muted-foreground">{alarm.metric}</div>
 </div>
 </div>
 <Badge variant={alarm.state === 'OK' ? 'outline' : 'destructive'}>
 {alarm.state}
 </Badge>
 </div>
 
 <div className="grid grid-cols-2 gap-4 text-sm mb-2">
 <div>
 <span className="text-muted-foreground">Threshold: </span>
 <span className="font-medium">{alarm.threshold}</span>
 </div>
 <div>
 <span className="text-muted-foreground">Valor Atual: </span>
 <span className="font-medium">{alarm.currentValue}</span>
 </div>
 </div>

 <div className="text-sm text-muted-foreground">
 {alarm.reason}
 </div>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>

 <Card >
 <CardHeader>
 <CardTitle>Configuração de Notificações</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-3 text-sm">
 <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
 <CheckCircle className="h-4 w-4 text-green-500" />
 <span>Email notifications: alerts@udstec.io</span>
 </div>
 <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
 <CheckCircle className="h-4 w-4 text-green-500" />
 <span>SNS Topic: evo-production-error-alerts</span>
 </div>
 <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
 <CheckCircle className="h-4 w-4 text-green-500" />
 <span>CloudWatch Dashboard ativo</span>
 </div>
 <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
 <CheckCircle className="h-4 w-4 text-green-500" />
 <span>Frontend error logging habilitado</span>
 </div>
 </div>
 </CardContent>
 </Card>
 </TabsContent>
 </Tabs>

 {/* Error Detail Dialog with Auto-Generated Prompt */}
 {selectedError && (
 <Dialog open={!!selectedError} onOpenChange={() => { setSelectedError(null); setErrorPrompt(''); }}>
 <DialogContent className="max-w-4xl max-h-[90vh]">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Terminal className="h-5 w-5" />
 {t('platformMonitoring.autoFixPrompt', 'Fix Prompt')} - {selectedError.errorType}
 </DialogTitle>
 <DialogDescription>
 {t('platformMonitoring.pastePromptInChat', 'Copy the prompt below and paste it in the AI chat to resolve the issue')}
 </DialogDescription>
 </DialogHeader>
 <ScrollArea className="h-[600px]">
 <div className="space-y-4">
 {/* Error Summary */}
 <div className="grid grid-cols-2 gap-4 text-sm p-4 rounded-lg bg-muted/30 border">
 <div>
 <div className="text-muted-foreground">Timestamp</div>
 <div className="font-medium">{new Date(selectedError.timestamp).toLocaleString()}</div>
 </div>
 <div>
 <div className="text-muted-foreground">Source</div>
 <Badge variant="outline" className="capitalize">{selectedError.source}</Badge>
 </div>
 <div>
 <div className="text-muted-foreground">Error Type</div>
 <div className="font-medium">{selectedError.errorType}</div>
 </div>
 <div>
 <div className="text-muted-foreground">Status Code</div>
 <Badge variant="destructive">{selectedError.statusCode}</Badge>
 </div>
 {selectedError.lambdaName && (
 <div className="col-span-2">
 <div className="text-muted-foreground">Lambda</div>
 <div className="font-mono text-xs">{selectedError.lambdaName}</div>
 </div>
 )}
 </div>

 {/* Generated Prompt */}
 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <div className="text-sm font-medium flex items-center gap-2">
 <Bot className="h-4 w-4" />
 {t('platformMonitoring.autoFixPrompt', 'AI Prompt')}
 </div>
 <div className="flex gap-2">
 <Button 
 variant="outline" 
 size="sm"
 onClick={() => copyToClipboard(errorPrompt)}
 disabled={loadingErrorPrompt || !errorPrompt}
 className="bg-white"
 >
 <Copy className="h-4 w-4 mr-2" />
 {t('platformMonitoring.copyPrompt', 'Copy')}
 </Button>
 <Button 
 size="sm"
 onClick={() => {
 copyToClipboard(errorPrompt);
 toast({
 title: t('platformMonitoring.promptCopiedSuccess', 'Prompt copied!'),
 description: t('platformMonitoring.pasteInAiChat', 'Paste in the AI chat to resolve the issue'),
 });
 }}
 disabled={loadingErrorPrompt || !errorPrompt}
 >
 <Copy className="h-4 w-4 mr-2" />
 {t('platformMonitoring.copyPrompt', 'Copy and Use')}
 </Button>
 </div>
 </div>
 
 {loadingErrorPrompt ? (
 <div className="p-6 rounded-lg bg-muted border flex items-center justify-center">
 <RefreshCw className="h-6 w-6 animate-spin mr-2" />
 <span>{t('platformMonitoring.generatingPrompt', 'Generating prompt...')}</span>
 </div>
 ) : errorPrompt ? (
 <pre className="p-4 rounded-lg bg-slate-900 text-slate-100 font-mono text-sm overflow-x-auto whitespace-pre-wrap border">
{errorPrompt}
 </pre>
 ) : (
 <div className="p-6 rounded-lg bg-muted border text-center text-muted-foreground">
 {t('platformMonitoring.errorGeneratingPromptRetry', 'Error generating prompt. Try again.')}
 </div>
 )}
 </div>
 </div>
 </ScrollArea>
 <DialogFooter>
 <Button variant="outline" onClick={() => { setSelectedError(null); setErrorPrompt(''); }}>
 {t('common.close', 'Close')}
 </Button>
 <Button 
 onClick={() => {
 copyToClipboard(errorPrompt);
 setSelectedError(null);
 setErrorPrompt('');
 toast({
 title: t('platformMonitoring.promptCopiedSuccess', 'Prompt copied!'),
 description: t('platformMonitoring.pasteInAiChat', 'Paste in the AI chat to resolve the issue'),
 });
 }}
 disabled={loadingErrorPrompt || !errorPrompt}
 >
 <Copy className="h-4 w-4 mr-2" />
 {t('platformMonitoring.copyPrompt', 'Copy and Close')}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 )}
 </div>
 </Layout>
 );
}
