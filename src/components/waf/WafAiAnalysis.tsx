import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, RefreshCw, AlertTriangle, Shield, Globe, Clock, Target, Sparkles, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import ReactMarkdown from "react-markdown";
import { WafAnalysisHistory } from "./WafAnalysisHistory";

interface WafAiAnalysisProps {
 accountId?: string;
}

interface AnalysisContext {
 metrics: {
 totalRequests: number;
 blockedRequests: number;
 blockRate: string;
 uniqueAttackers: number;
 };
 threatTypes: Array<{ type: string; count: number; percentage: string }>;
 topAttackers: Array<{ ip: string; country: string; blockedRequests: number }>;
 geoDistribution: Array<{ country: string; blockedRequests: number }>;
}

interface AnalysisResponse {
 id?: string;
 hasAnalysis?: boolean;
 analysis: string;
 context: AnalysisContext;
 riskLevel?: string;
 isFallback?: boolean;
 generatedAt: string;
 aiError?: string;
 message?: string;
}

function getTimeAgo(dateString: string): string {
 const date = new Date(dateString);
 const now = new Date();
 const diffMs = now.getTime() - date.getTime();
 const diffMins = Math.floor(diffMs / 60000);
 const diffHours = Math.floor(diffMins / 60);
 const diffDays = Math.floor(diffHours / 24);
 
 if (diffMins < 1) return 'agora mesmo';
 if (diffMins < 60) return `há ${diffMins} minuto${diffMins > 1 ? 's' : ''}`;
 if (diffHours < 24) return `há ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
 return `há ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
}

function isAnalysisStale(dateString: string): boolean {
 const date = new Date(dateString);
 const now = new Date();
 const diffMs = now.getTime() - date.getTime();
 const diffHours = diffMs / (1000 * 60 * 60);
 return diffHours > 6; // Consider stale after 6 hours
}

export function WafAiAnalysis({ accountId }: WafAiAnalysisProps) {
 const { t } = useTranslation();
 const { toast } = useToast();
 const [isLoading, setIsLoading] = useState(false);
 const [isLoadingLatest, setIsLoadingLatest] = useState(true);
 const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [activeTab, setActiveTab] = useState<string>("current");
 const [progress, setProgress] = useState(0);
 const [estimatedTime, setEstimatedTime] = useState(45);
 const [elapsedTime, setElapsedTime] = useState(0);

 // Load latest analysis on mount
 useEffect(() => {
 loadLatestAnalysis();
 }, [accountId]);

 const loadLatestAnalysis = async () => {
 setIsLoadingLatest(true);
 try {
 const response = await apiClient.invoke<AnalysisResponse>('waf-dashboard-api', {
 body: {
 action: 'get-latest-analysis',
 accountId,
 }
 });
 
 if (response.error) {
 console.warn('Failed to load latest analysis:', response.error);
 return;
 }
 
 const data = response.data;
 if (data?.hasAnalysis) {
 setAnalysis(data);
 }
 } catch (err) {
 console.warn('Failed to load latest analysis:', err);
 } finally {
 setIsLoadingLatest(false);
 }
 };

 const runAnalysis = async () => {
 setIsLoading(true);
 setError(null);
 setProgress(0);
 setElapsedTime(0);
 
 // Start progress animation
 const progressInterval = setInterval(() => {
 setProgress(prev => {
 if (prev >= 95) return prev; // Cap at 95% until real completion
 return prev + 1;
 });
 }, 450); // Increment every 450ms to reach ~95% in 45 seconds
 
 // Start elapsed time counter
 const timeInterval = setInterval(() => {
 setElapsedTime(prev => prev + 1);
 }, 1000);
 
 try {
 const response = await apiClient.invoke<AnalysisResponse>('waf-dashboard-api', {
 body: {
 action: 'ai-analysis',
 accountId,
 }
 });
 
 if (response.error) {
 clearInterval(progressInterval);
 clearInterval(timeInterval);
 throw new Error(getErrorMessage(response.error));
 }
 
 const data = response.data;
 
 if (data?.processing) {
 // Analysis is being generated in background
 toast({
 title: t('waf.aiAnalysis.processingInBackground', 'Análise em Processamento'),
 description: t('waf.aiAnalysis.processingInBackgroundDesc', 'A análise completa com IA está sendo gerada. Aguarde 30-45 segundos.'),
 variant: 'default',
 });
 
 // DON'T set analysis data yet - keep loading state active
 // DON'T set isLoading to false - keep progress UI visible
 
 // Start polling for completion (check every 10 seconds for up to 60 seconds)
 let pollCount = 0;
 const maxPolls = 6; // 60 seconds total
 
 const pollInterval = setInterval(async () => {
 pollCount++;
 
 try {
 const pollResponse = await apiClient.invoke<AnalysisResponse>('waf-dashboard-api', {
 body: {
 action: 'get-latest-analysis',
 accountId,
 }
 });
 
 if (pollResponse.data?.hasAnalysis && !pollResponse.data.processing) {
 // Analysis completed!
 clearInterval(pollInterval);
 clearInterval(progressInterval);
 clearInterval(timeInterval);
 setProgress(100);
 
 // Small delay to show 100% before switching to results
 setTimeout(() => {
 setAnalysis(pollResponse.data);
 setIsLoading(false);
 
 toast({
 title: t('waf.aiAnalysis.success', 'Análise Concluída'),
 description: t('waf.aiAnalysis.successDesc', 'A análise de IA foi gerada e salva com sucesso.'),
 });
 }, 500);
 } else if (pollCount >= maxPolls) {
 // Timeout - stop polling
 clearInterval(pollInterval);
 clearInterval(progressInterval);
 clearInterval(timeInterval);
 setIsLoading(false);
 
 toast({
 title: t('common.info', 'Informação'),
 description: 'A análise está demorando mais que o esperado. Clique em "Atualizar Análise" em alguns instantes.',
 variant: 'default',
 });
 }
 } catch (pollErr) {
 // Ignore polling errors, keep trying
 console.warn('Polling error:', pollErr);
 }
 }, 10000); // Poll every 10 seconds
 
 return;
 }
 
 // If we got here, analysis completed immediately (shouldn't happen with new async flow)
 clearInterval(progressInterval);
 clearInterval(timeInterval);
 setProgress(100);
 
 if (data?.aiError) {
 toast({
 title: t('waf.aiAnalysis.fallbackMode', 'Modo Fallback'),
 description: data.aiError,
 variant: 'default',
 });
 } else {
 toast({
 title: t('waf.aiAnalysis.success', 'Análise Concluída'),
 description: t('waf.aiAnalysis.successDesc', 'A análise de IA foi gerada e salva com sucesso.'),
 });
 }
 
 // Set analysis data
 setAnalysis(data);
 setIsLoading(false); // Only set to false if analysis completed immediately
 } catch (err) {
 clearInterval(progressInterval);
 clearInterval(timeInterval);
 const message = err instanceof Error ? err.message : 'Failed to run analysis';
 setError(message);
 setIsLoading(false);
 toast({
 title: t('common.error', 'Erro'),
 description: message,
 variant: 'destructive',
 });
 }
 };

 const isStale = analysis?.generatedAt ? isAnalysisStale(analysis.generatedAt) : false;

 return (
 <Card className="">
 <CardHeader>
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Brain className="h-5 w-5 text-primary" />
 <CardTitle>{t('waf.aiAnalysis.title', 'Análise Inteligente de Tráfego')}</CardTitle>
 </div>
 <Button
 onClick={runAnalysis}
 disabled={isLoading}
 className=" "
 >
 {isLoading ? (
 <>
 <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
 {t('waf.aiAnalysis.analyzing', 'Analisando...')}
 </>
 ) : analysis ? (
 <>
 <RefreshCw className="h-4 w-4 mr-2" />
 {t('waf.aiAnalysis.updateAnalysis', 'Atualizar Análise')}
 </>
 ) : (
 <>
 <Sparkles className="h-4 w-4 mr-2" />
 {t('waf.aiAnalysis.runAnalysis', 'Executar Análise com IA')}
 </>
 )}
 </Button>
 </div>
 <CardDescription>
 {t('waf.aiAnalysis.description', 'Análise em tempo real do tráfego WAF usando inteligência artificial para identificar padrões de ataque e ameaças')}
 </CardDescription>
 </CardHeader>
 <CardContent>
 <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
 <TabsList className="grid w-full grid-cols-2 mb-6">
 <TabsTrigger value="current" className="gap-2">
 <Brain className="h-4 w-4" />
 {t('waf.aiAnalysis.currentAnalysis', 'Análise Atual')}
 </TabsTrigger>
 <TabsTrigger value="history" className="gap-2">
 <History className="h-4 w-4" />
 {t('waf.analysisHistory.title', 'Histórico')}
 </TabsTrigger>
 </TabsList>

 <TabsContent value="current" className="mt-0">
 {isLoading ? (
 <div className="space-y-6">
 {/* Progress Header */}
 <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/20">
 <div className="flex items-center gap-3">
 <div className="relative">
 <Brain className="h-6 w-6 text-primary animate-pulse" />
 <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
 </div>
 <div>
 <h4 className="font-semibold text-primary">
 {t('waf.aiAnalysis.inProgress', 'Análise em Progresso')}
 </h4>
 <p className="text-sm text-muted-foreground">
 {t('waf.aiAnalysis.processingTraffic', 'Processando CloudWatch Metrics')}
 </p>
 </div>
 </div>
 <div className="text-right">
 <div className="text-2xl font-bold text-primary">{progress}%</div>
 <div className="text-xs text-muted-foreground">
 {elapsedTime}s / ~{estimatedTime}s
 </div>
 </div>
 </div>

 {/* Progress Bar */}
 <div className="space-y-2">
 <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
 <div 
 className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary transition-all duration-500 ease-out relative"
 style={{ width: `${progress}%` }}
 >
 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
 </div>
 </div>
 <p className="text-xs text-center text-muted-foreground">
 {t('waf.aiAnalysis.estimatedTime', 'Tempo estimado: 30-45 segundos')}
 </p>
 </div>

 {/* Processing Steps */}
 <div className="grid gap-3">
 <div className={`flex items-start gap-3 p-3 rounded-lg transition-all ${progress > 0 ? 'bg-primary/10 border border-primary/20' : 'bg-muted/30'}`}>
 <div className={`mt-0.5 ${progress > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
 {progress > 20 ? (
 <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
 <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
 </svg>
 </div>
 ) : (
 <div className="h-5 w-5 rounded-full border-2 border-primary animate-spin border-t-transparent" />
 )}
 </div>
 <div className="flex-1">
 <h5 className="font-medium text-sm">
 {t('waf.aiAnalysis.step1', 'Coletando Métricas WAF')}
 </h5>
 <p className="text-xs text-muted-foreground">
 {t('waf.aiAnalysis.step1Desc', 'Requisições, bloqueios, IPs únicos')}
 </p>
 </div>
 </div>

 <div className={`flex items-start gap-3 p-3 rounded-lg transition-all ${progress > 20 ? 'bg-primary/10 border border-primary/20' : 'bg-muted/30'}`}>
 <div className={`mt-0.5 ${progress > 20 ? 'text-primary' : 'text-muted-foreground'}`}>
 {progress > 50 ? (
 <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
 <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
 </svg>
 </div>
 ) : progress > 20 ? (
 <div className="h-5 w-5 rounded-full border-2 border-primary animate-spin border-t-transparent" />
 ) : (
 <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
 )}
 </div>
 <div className="flex-1">
 <h5 className="font-medium text-sm">
 {t('waf.aiAnalysis.step2', 'Analisando Padrões de Ataque')}
 </h5>
 <p className="text-xs text-muted-foreground">
 {t('waf.aiAnalysis.step2Desc', 'Tipos de ameaças, distribuição geográfica')}
 </p>
 </div>
 </div>

 <div className={`flex items-start gap-3 p-3 rounded-lg transition-all ${progress > 50 ? 'bg-primary/10 border border-primary/20' : 'bg-muted/30'}`}>
 <div className={`mt-0.5 ${progress > 50 ? 'text-primary' : 'text-muted-foreground'}`}>
 {progress > 80 ? (
 <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
 <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
 </svg>
 </div>
 ) : progress > 50 ? (
 <div className="h-5 w-5 rounded-full border-2 border-primary animate-spin border-t-transparent" />
 ) : (
 <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
 )}
 </div>
 <div className="flex-1">
 <h5 className="font-medium text-sm">
 {t('waf.aiAnalysis.step3', 'Gerando Insights com IA')}
 </h5>
 <p className="text-xs text-muted-foreground">
 {t('waf.aiAnalysis.step3Desc', 'Claude 3.5 Sonnet via AWS Bedrock')}
 </p>
 </div>
 </div>

 <div className={`flex items-start gap-3 p-3 rounded-lg transition-all ${progress > 80 ? 'bg-primary/10 border border-primary/20' : 'bg-muted/30'}`}>
 <div className={`mt-0.5 ${progress > 80 ? 'text-primary' : 'text-muted-foreground'}`}>
 {progress >= 100 ? (
 <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
 <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
 </svg>
 </div>
 ) : progress > 80 ? (
 <div className="h-5 w-5 rounded-full border-2 border-primary animate-spin border-t-transparent" />
 ) : (
 <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
 )}
 </div>
 <div className="flex-1">
 <h5 className="font-medium text-sm">
 {t('waf.aiAnalysis.step4', 'Salvando Análise')}
 </h5>
 <p className="text-xs text-muted-foreground">
 {t('waf.aiAnalysis.step4Desc', 'Armazenando resultados no banco de dados')}
 </p>
 </div>
 </div>
 </div>

 {/* Info Box */}
 <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
 <Sparkles className="h-5 w-5 text-blue-500 mt-0.5" />
 <div className="flex-1 text-sm">
 <p className="text-blue-700 dark:text-blue-300 font-medium mb-1">
 {t('waf.aiAnalysis.aiPowered', 'Análise Powered by AI')}
 </p>
 <p className="text-blue-600/80 dark:text-blue-400/80 text-xs">
 {t('waf.aiAnalysis.aiPoweredDesc', 'Utilizamos Claude 3.5 Sonnet via AWS Bedrock para análise avançada de padrões de tráfego e identificação de ameaças em tempo real.')}
 </p>
 </div>
 </div>
 </div>
 ) : isLoadingLatest ? (
 <div className="space-y-4">
 <Skeleton className="h-4 w-full" />
 <Skeleton className="h-4 w-3/4" />
 <Skeleton className="h-32 w-full" />
 </div>
 ) : error ? (
 <div className="flex flex-col items-center justify-center py-8 text-center">
 <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
 <p className="text-destructive font-medium">{error}</p>
 <Button variant="outline" onClick={runAnalysis} className="mt-4">
 {t('common.retry', 'Tentar Novamente')}
 </Button>
 </div>
 ) : analysis ? (
 <div className="space-y-6">
 {/* Last Updated Banner */}
 <div className={`flex items-center justify-between p-3 rounded-lg ${isStale ? 'bg-warning/10 border border-warning/30' : 'bg-muted/30'}`}>
 <div className="flex items-center gap-2">
 <History className={`h-4 w-4 ${isStale ? 'text-warning' : 'text-muted-foreground'}`} />
 <span className={`text-sm ${isStale ? 'text-warning' : 'text-muted-foreground'}`}>
 {t('waf.aiAnalysis.lastUpdated', 'Última análise')}: {getTimeAgo(analysis.generatedAt)}
 {analysis.isFallback && (
 <Badge variant="secondary" className="ml-2 text-xs">
 {t('waf.aiAnalysis.automated', 'Automático')}
 </Badge>
 )}
 </span>
 </div>
 {isStale && (
 <span className="text-xs text-warning">
 {t('waf.aiAnalysis.staleWarning', 'Recomendamos atualizar a análise')}
 </span>
 )}
 </div>

 {/* Quick Stats */}
 {analysis.context?.metrics && (
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
 <div className="p-4 rounded-lg bg-muted/50">
 <div className="flex items-center gap-2 text-muted-foreground mb-1">
 <Shield className="h-4 w-4" />
 <span className="text-xs">{t('waf.totalRequests', 'Total Requisições')}</span>
 </div>
 <p className="text-2xl font-semibold">{analysis.context.metrics.totalRequests?.toLocaleString() || 0}</p>
 </div>
 <div className="p-4 rounded-lg bg-destructive/10">
 <div className="flex items-center gap-2 text-destructive mb-1">
 <AlertTriangle className="h-4 w-4" />
 <span className="text-xs">{t('waf.blocked', 'Bloqueadas')}</span>
 </div>
 <p className="text-2xl font-semibold text-destructive">
 {analysis.context.metrics.blockedRequests?.toLocaleString() || 0}
 </p>
 </div>
 <div className="p-4 rounded-lg bg-muted/50">
 <div className="flex items-center gap-2 text-muted-foreground mb-1">
 <Target className="h-4 w-4" />
 <span className="text-xs">{t('waf.attackers', 'Atacantes')}</span>
 </div>
 <p className="text-2xl font-semibold">{analysis.context.metrics.uniqueAttackers || 0}</p>
 </div>
 <div className="p-4 rounded-lg bg-muted/50">
 <div className="flex items-center gap-2 text-muted-foreground mb-1">
 <Clock className="h-4 w-4" />
 <span className="text-xs">{t('waf.blockRate', 'Taxa de Bloqueio')}</span>
 </div>
 <p className="text-2xl font-semibold">{analysis.context.metrics.blockRate || '0%'}</p>
 </div>
 </div>
 )}

 {/* Risk Level Badge */}
 {analysis.riskLevel && (
 <div className="flex items-center gap-2">
 <span className="text-sm text-muted-foreground">{t('waf.aiAnalysis.riskLevel', 'Nível de Risco')}:</span>
 <Badge 
 variant={
 analysis.riskLevel === 'crítico' || analysis.riskLevel === 'critical' ? 'destructive' :
 analysis.riskLevel === 'alto' || analysis.riskLevel === 'high' ? 'destructive' :
 analysis.riskLevel === 'médio' || analysis.riskLevel === 'medium' ? 'default' :
 'secondary'
 }
 className="text-sm"
 >
 {analysis.riskLevel.charAt(0).toUpperCase() + analysis.riskLevel.slice(1)}
 </Badge>
 </div>
 )}

 {/* Threat Types */}
 {analysis.context?.threatTypes && analysis.context.threatTypes.length > 0 && (
 <div className="p-4 rounded-lg bg-muted/30">
 <h4 className="font-medium mb-3 flex items-center gap-2">
 <Target className="h-4 w-4 text-primary" />
 {t('waf.threatTypesDetected', 'Tipos de Ameaças Detectadas')}
 </h4>
 <div className="flex flex-wrap gap-2">
 {analysis.context.threatTypes.map((threat, idx) => (
 <Badge key={idx} variant="outline" className="text-sm">
 {threat.type}: {threat.count} ({threat.percentage})
 </Badge>
 ))}
 </div>
 </div>
 )}

 {/* AI Analysis */}
 <div className="p-4 rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
 <div className="flex items-center gap-2 mb-4">
 <Brain className="h-5 w-5 text-primary" />
 <h4 className="font-medium">{t('waf.aiAnalysis.aiInsights', 'Análise da IA')}</h4>
 </div>
 <div className="prose prose-sm dark:prose-invert max-w-none">
 <ReactMarkdown>{analysis.analysis}</ReactMarkdown>
 </div>
 </div>

 {/* Generated timestamp */}
 <p className="text-xs text-muted-foreground text-right">
 {t('waf.aiAnalysis.generatedAt', 'Gerado em')}: {new Date(analysis.generatedAt).toLocaleString()}
 </p>
 </div>
 ) : (
 <div className="flex flex-col items-center justify-center py-12 text-center">
 <Brain className="h-16 w-16 text-muted-foreground/50 mb-4" />
 <h3 className="text-lg font-medium mb-2">
 {t('waf.aiAnalysis.noAnalysis', 'Nenhuma análise realizada')}
 </h3>
 <p className="text-muted-foreground mb-4 max-w-md">
 {t('waf.aiAnalysis.clickToStart', 'Clique no botão acima para executar uma análise inteligente do tráfego WAF das últimas 24 horas usando IA.')}
 </p>
 <div className="flex flex-wrap gap-2 justify-center text-sm text-muted-foreground">
 <Badge variant="outline" className="gap-1">
 <Shield className="h-3 w-3" />
 {t('waf.aiAnalysis.feature1', 'Detecção de Padrões')}
 </Badge>
 <Badge variant="outline" className="gap-1">
 <Globe className="h-3 w-3" />
 {t('waf.aiAnalysis.feature2', 'Análise Geográfica')}
 </Badge>
 <Badge variant="outline" className="gap-1">
 <Target className="h-3 w-3" />
 {t('waf.aiAnalysis.feature3', 'Identificação de Campanhas')}
 </Badge>
 <Badge variant="outline" className="gap-1">
 <AlertTriangle className="h-3 w-3" />
 {t('waf.aiAnalysis.feature4', 'Recomendações de Segurança')}
 </Badge>
 </div>
 </div>
 )}
 </TabsContent>

 <TabsContent value="history" className="mt-0">
 <WafAnalysisHistory accountId={accountId} />
 </TabsContent>
 </Tabs>
 </CardContent>
 </Card>
 );
}
