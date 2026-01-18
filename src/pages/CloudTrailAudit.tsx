import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layout } from "@/components/Layout";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { formatDateBR, parseDateString } from "@/lib/utils";
import { CloudTrailAnalysisHistory } from "@/components/dashboard/CloudTrailAnalysisHistory";
import { AzureActivityLogs } from "@/components/dashboard/AzureActivityLogs";
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import { 
  FileText, Search, AlertTriangle, Eye, Clock, User, MapPin,
  RefreshCw, Download, Shield, Activity, Play, TrendingUp, History,
  AlertCircle, CheckCircle2, Cloud
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CloudTrailEvent {
  id: string;
  event_time: string;
  event_name: string;
  event_source: string;
  user_name: string;
  user_type: string;
  user_arn: string;
  user_identity: any;
  source_ip_address: string;
  user_agent: string;
  aws_region: string;
  error_code: string | null;
  error_message: string | null;
  resources: any[];
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_reasons: string[];
  security_explanation: string | null;
  remediation_suggestion: string | null;
  event_category: string | null;
  is_security_event: boolean;
}

interface CloudTrailAnalysisStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  events_processed?: number;
  events_saved?: number;
  critical_count?: number;
  high_count?: number;
  medium_count?: number;
  low_count?: number;
  error_message?: string;
}

interface StartAnalysisResponse {
  success: boolean;
  analysisId?: string;
  status?: string;
  message: string;
  periodAlreadyProcessed?: boolean;
  alreadyRunning?: boolean;
  coveragePercent?: number;
  overlappingAnalyses?: Array<{
    id: string;
    periodStart: string;
    periodEnd: string;
    eventsProcessed: number;
  }>;
}

const RISK_COLORS = {
  critical: '#ef4444',
  high: '#f97316', 
  medium: '#eab308',
  low: '#22c55e',
};

export default function CloudTrailAudit() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedAccountId, selectedProvider } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();
  const { data: organizationId } = useOrganization();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const [selectedRiskLevel, setSelectedRiskLevel] = useState('all');
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showReprocessDialog, setShowReprocessDialog] = useState(false);
  const [periodOverlapInfo, setPeriodOverlapInfo] = useState<StartAnalysisResponse | null>(null);

  // Check if Azure is selected - show Azure Activity Logs instead
  const isAzure = selectedProvider === 'AZURE';
  
  // If Azure is selected, render Azure Activity Logs component
  if (isAzure) {
    return (
      <Layout 
        title={t('sidebar.cloudTrailAudit', 'Logs de Atividade')} 
        description={t('cloudTrailAudit.azureDescription', 'Analise eventos de atividade e identifique problemas de segurança')}
        icon={<FileText className="h-7 w-7" />}
      >
        <AzureActivityLogs />
      </Layout>
    );
  }

  // Get CloudTrail events from database - defined first so refetch is available
  const { data: events, isLoading, refetch } = useQuery({
    queryKey: ['cloudtrail-events', organizationId, selectedAccountId, selectedTimeRange, selectedRiskLevel],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 1 * 60 * 1000,
    queryFn: async () => {
      const getHoursBack = (range: string) => {
        switch (range) {
          case '24h': return 24;
          case '7d': return 168;
          case '30d': return 720;
          case '60d': return 1440;
          case '90d': return 2160;
          case '120d': return 2880;
          default: return 24;
        }
      };
      
      const hoursBack = getHoursBack(selectedTimeRange);
      const startTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

      const filters: any = { 
        organization_id: organizationId,
        ...getAccountFilter(), // Multi-cloud compatible
      };

      if (selectedRiskLevel !== 'all') {
        filters.risk_level = selectedRiskLevel;
      }

      const response = await apiClient.select('cloudtrail_events', {
        select: '*',
        eq: filters,
        gte: { event_time: startTime.toISOString() },
        order: { column: 'event_time', ascending: false },
        limit: 500
      });

      if (response.error) throw new Error(getErrorMessage(response.error));
      
      let filteredEvents = (response.data || []) as CloudTrailEvent[];
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredEvents = filteredEvents.filter((event: CloudTrailEvent) => 
          event.event_name?.toLowerCase().includes(term) ||
          event.user_name?.toLowerCase().includes(term) ||
          event.source_ip_address?.includes(term)
        );
      }
      return filteredEvents;
    },
  });

  // Check for running analysis on page load
  const { data: runningAnalysis } = useQuery<CloudTrailAnalysisStatus | undefined>({
    queryKey: ['cloudtrail-running-analysis', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId && !analysisId,
    staleTime: 5000,
    queryFn: async () => {
      const response = await apiClient.select('cloudtrail_analyses', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId,
          status: 'running'
        },
        order: { column: 'created_at', ascending: false },
        limit: 1
      });
      if (response.error) return undefined;
      return response.data?.[0] as CloudTrailAnalysisStatus | undefined;
    },
  });

  // Auto-detect running analysis on page load
  useEffect(() => {
    if (runningAnalysis && !analysisId && !isAnalyzing) {
      setAnalysisId(runningAnalysis.id);
      setIsAnalyzing(true);
      toast({
        title: "Análise em andamento",
        description: "Detectada análise em execução. Acompanhando progresso...",
      });
    }
  }, [runningAnalysis, analysisId, isAnalyzing, toast]);

  // Poll for analysis status when running
  const { data: analysisStatus } = useQuery<CloudTrailAnalysisStatus | undefined>({
    queryKey: ['cloudtrail-analysis-status', analysisId],
    enabled: !!analysisId && isAnalyzing,
    refetchInterval: 3000, // Poll every 3 seconds
    queryFn: async () => {
      const response = await apiClient.select('cloudtrail_analyses', {
        select: '*',
        eq: { id: analysisId },
        limit: 1
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data?.[0] as CloudTrailAnalysisStatus | undefined;
    },
  });

  // Handle analysis completion
  useEffect(() => {
    if (analysisStatus && analysisStatus.status !== 'running') {
      setIsAnalyzing(false);
      if (analysisStatus.status === 'completed') {
        toast({
          title: "Análise concluída",
          description: `${analysisStatus.events_processed || 0} eventos analisados. ${analysisStatus.critical_count || 0} críticos, ${analysisStatus.high_count || 0} altos.`,
        });
        refetch(); // Refresh the events list
        queryClient.invalidateQueries({ queryKey: ['cloudtrail-analysis-history'] });
      } else if (analysisStatus.status === 'failed') {
        toast({
          title: "Erro na análise",
          description: analysisStatus.error_message || "Erro desconhecido",
          variant: "destructive"
        });
      }
      setAnalysisId(null);
    }
  }, [analysisStatus, refetch, toast, queryClient]);

  // Start CloudTrail analysis (async)
  const startAnalysisMutation = useMutation({
    mutationFn: async (forceReprocess: boolean = false) => {
      const getHoursBack = (range: string) => {
        switch (range) {
          case '24h': return 24;
          case '7d': return 168;
          case '30d': return 720;
          case '60d': return 1440;
          case '90d': return 2160;
          case '120d': return 2880;
          default: return 24;
        }
      };
      
      const hoursBack = getHoursBack(selectedTimeRange);
      const response = await apiClient.invoke<StartAnalysisResponse>('start-cloudtrail-analysis', {
        body: {
          accountId: selectedAccountId,
          hoursBack,
          maxResults: 5000,
          forceReprocess,
        }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
    onSuccess: (data) => {
      if (!data) return;
      
      // Check if period was already processed
      if (data.periodAlreadyProcessed) {
        setPeriodOverlapInfo(data);
        setShowReprocessDialog(true);
        return;
      }
      
      // Check if analysis is already running
      if (data.alreadyRunning) {
        toast({
          title: "Análise em andamento",
          description: data.message,
          variant: "default"
        });
        if (data.analysisId) {
          setAnalysisId(data.analysisId);
          setIsAnalyzing(true);
        }
        return;
      }
      
      // Analysis started successfully
      if (data.success && data.analysisId) {
        setAnalysisId(data.analysisId);
        setIsAnalyzing(true);
        toast({
          title: "Análise iniciada",
          description: data.message || "Os eventos estão sendo buscados em background.",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Erro ao iniciar análise",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  });

  // Handle force reprocess
  const handleForceReprocess = () => {
    setShowReprocessDialog(false);
    setPeriodOverlapInfo(null);
    startAnalysisMutation.mutate(true);
  };

  // Helper function to get period description
  const getPeriodDescription = (range: string) => {
    const descriptions = {
      '24h': 'últimas 24 horas',
      '7d': 'últimos 7 dias',
      '30d': 'últimos 30 dias',
      '60d': 'últimos 60 dias',
      '90d': 'últimos 90 dias',
      '120d': 'últimos 120 dias'
    };
    return descriptions[range as keyof typeof descriptions] || 'período selecionado';
  };

  // Calculate chart data - events by date and risk level
  const chartData = useMemo(() => {
    if (!events || events.length === 0) return { byDate: [], byUser: [], byRisk: [], byEvent: [] };

    // Group by date
    const dateMap = new Map<string, { date: string; critical: number; high: number; medium: number; low: number; total: number }>();
    const userMap = new Map<string, { user: string; critical: number; high: number; medium: number; low: number; total: number }>();
    const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    const eventCounts = new Map<string, number>();

    events.forEach(event => {
      // By date
      const dateStr = formatDateBR(event.event_time, { day: '2-digit', month: '2-digit' });
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, { date: dateStr, critical: 0, high: 0, medium: 0, low: 0, total: 0 });
      }
      const dateEntry = dateMap.get(dateStr)!;
      dateEntry[event.risk_level]++;
      dateEntry.total++;

      // By user (only security events)
      if (event.is_security_event && event.user_name) {
        if (!userMap.has(event.user_name)) {
          userMap.set(event.user_name, { user: event.user_name, critical: 0, high: 0, medium: 0, low: 0, total: 0 });
        }
        const userEntry = userMap.get(event.user_name)!;
        userEntry[event.risk_level]++;
        userEntry.total++;
      }

      // Risk distribution
      riskCounts[event.risk_level]++;

      // Event types
      eventCounts.set(event.event_name, (eventCounts.get(event.event_name) || 0) + 1);
    });

    const byDate = Array.from(dateMap.values()).sort((a, b) => {
      const [dayA, monthA] = a.date.split('/').map(Number);
      const [dayB, monthB] = b.date.split('/').map(Number);
      return monthA !== monthB ? monthA - monthB : dayA - dayB;
    });

    const byUser = Array.from(userMap.values())
      .sort((a, b) => (b.critical * 100 + b.high * 10 + b.medium) - (a.critical * 100 + a.high * 10 + a.medium))
      .slice(0, 10);

    const byRisk = [
      { name: 'Crítico', value: riskCounts.critical, color: RISK_COLORS.critical },
      { name: 'Alto', value: riskCounts.high, color: RISK_COLORS.high },
      { name: 'Médio', value: riskCounts.medium, color: RISK_COLORS.medium },
      { name: 'Baixo', value: riskCounts.low, color: RISK_COLORS.low },
    ].filter(r => r.value > 0);

    const byEvent = Array.from(eventCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([event, count]) => ({ event, count }));

    return { byDate, byUser, byRisk, byEvent };
  }, [events]);

  // Summary metrics
  const summary = useMemo(() => {
    if (!events) return { total: 0, critical: 0, high: 0, medium: 0, low: 0, errors: 0, users: 0, securityEvents: 0 };
    return {
      total: events.length,
      critical: events.filter(e => e.risk_level === 'critical').length,
      high: events.filter(e => e.risk_level === 'high').length,
      medium: events.filter(e => e.risk_level === 'medium').length,
      low: events.filter(e => e.risk_level === 'low').length,
      errors: events.filter(e => e.error_code).length,
      users: new Set(events.map(e => e.user_name)).size,
      securityEvents: events.filter(e => e.is_security_event).length,
    };
  }, [events]);

  const getRiskBadge = (level: string) => {
    const variants: Record<string, any> = {
      critical: { variant: 'destructive', label: 'Crítico' },
      high: { variant: 'destructive', label: 'Alto' },
      medium: { variant: 'secondary', label: 'Médio' },
      low: { variant: 'outline', label: 'Baixo' },
    };
    const config = variants[level] || { variant: 'outline', label: level };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const exportEvents = () => {
    if (!events) return;
    const csvContent = [
      'Data/Hora,Evento,Usuário,Tipo Usuário,IP,Região,Nível Risco,Motivos,Erro',
      ...events.map(event => [
        event.event_time,
        event.event_name,
        event.user_name,
        event.user_type,
        event.source_ip_address,
        event.aws_region,
        event.risk_level,
        `"${(event.risk_reasons || []).join('; ')}"`,
        event.error_code || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cloudtrail_audit_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast({ title: "Exportado", description: "Relatório CSV gerado com sucesso." });
  };

  return (
    <Layout 
      title={t('sidebar.cloudTrailAudit', 'Auditoria CloudTrail')} 
      description={t('cloudTrailAudit.description', 'Análise de eventos AWS com identificação de usuários responsáveis por problemas de segurança')}
      icon={<FileText className="h-4 w-4" />}
    >
      {/* Reprocess Confirmation Dialog */}
      <AlertDialog open={showReprocessDialog} onOpenChange={setShowReprocessDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Período Já Processado
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Este período já foi analisado anteriormente ({periodOverlapInfo?.coveragePercent}% coberto).
              </p>
              {periodOverlapInfo?.overlappingAnalyses && periodOverlapInfo.overlappingAnalyses.length > 0 && (
                <div className="bg-muted rounded-lg p-3 text-sm">
                  <p className="font-medium mb-2">Análises anteriores:</p>
                  <ul className="space-y-1">
                    {periodOverlapInfo.overlappingAnalyses.slice(0, 3).map((a, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        {formatDateBR(a.periodStart)} - {formatDateBR(a.periodEnd)}
                        <Badge variant="outline" className="text-xs">{a.eventsProcessed} eventos</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-muted-foreground">
                Deseja reprocessar este período? Os eventos serão atualizados com as análises mais recentes.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleForceReprocess}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reprocessar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-6">
        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <Button 
            onClick={() => startAnalysisMutation.mutate(false)}
            disabled={startAnalysisMutation.isPending || isAnalyzing || !selectedAccountId}
            className="gap-2"
          >
            {startAnalysisMutation.isPending || isAnalyzing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {startAnalysisMutation.isPending ? 'Iniciando...' : isAnalyzing ? 'Analisando...' : 'Buscar Eventos'}
          </Button>
          {(['60d', '90d', '120d'].includes(selectedTimeRange)) && (
            <div className="flex items-center gap-1 text-sm text-amber-600 bg-amber-50 px-2 py-1 rounded">
              <Clock className="h-3 w-3" />
              Período extenso - pode levar vários minutos
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportEvents} disabled={!events?.length}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total de Eventos</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <>
                  <Skeleton className="h-8 w-24 mb-1" />
                  <Skeleton className="h-4 w-32" />
                </>
              ) : (
                <>
                  <div className="text-2xl font-semibold">{summary.total.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">{summary.securityEvents} eventos de segurança</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Eventos Críticos</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <>
                  <Skeleton className="h-8 w-16 mb-1" />
                  <Skeleton className="h-4 w-24" />
                </>
              ) : (
                <>
                  <div className="text-2xl font-semibold text-red-500">{summary.critical}</div>
                  <p className="text-xs text-muted-foreground">{summary.high} de alto risco</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Erros/Falhas</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <>
                  <Skeleton className="h-8 w-16 mb-1" />
                  <Skeleton className="h-4 w-28" />
                </>
              ) : (
                <>
                  <div className="text-2xl font-semibold text-orange-500">{summary.errors}</div>
                  <p className="text-xs text-muted-foreground">Tentativas negadas</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Usuários Únicos</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <>
                  <Skeleton className="h-8 w-16 mb-1" />
                  <Skeleton className="h-4 w-24" />
                </>
              ) : (
                <>
                  <div className="text-2xl font-semibold">{summary.users}</div>
                  <p className="text-xs text-muted-foreground">Identidades ativas</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card >
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar eventos, usuários, IPs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Últimas 24 horas</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="60d">Últimos 60 dias</SelectItem>
                  <SelectItem value="90d">Últimos 90 dias</SelectItem>
                  <SelectItem value="120d">Últimos 120 dias</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedRiskLevel} onValueChange={setSelectedRiskLevel}>
                <SelectTrigger><SelectValue placeholder="Nível de Risco" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Níveis</SelectItem>
                  <SelectItem value="critical">Crítico</SelectItem>
                  <SelectItem value="high">Alto</SelectItem>
                  <SelectItem value="medium">Médio</SelectItem>
                  <SelectItem value="low">Baixo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Charts Section */}
        {isLoading ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card >
              <CardHeader>
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[300px] w-full" />
              </CardContent>
            </Card>
            <Card >
              <CardHeader>
                <Skeleton className="h-6 w-40 mb-2" />
                <Skeleton className="h-4 w-56" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[300px] w-full" />
              </CardContent>
            </Card>
          </div>
        ) : events && events.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Timeline Chart - Security Events by Date */}
            <Card >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Evolução de Problemas de Segurança
                </CardTitle>
                <CardDescription>Eventos por nível de risco ao longo do tempo</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData.byDate}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="critical" stackId="1" stroke={RISK_COLORS.critical} fill={RISK_COLORS.critical} name="Crítico" />
                    <Area type="monotone" dataKey="high" stackId="1" stroke={RISK_COLORS.high} fill={RISK_COLORS.high} name="Alto" />
                    <Area type="monotone" dataKey="medium" stackId="1" stroke={RISK_COLORS.medium} fill={RISK_COLORS.medium} name="Médio" />
                    <Area type="monotone" dataKey="low" stackId="1" stroke={RISK_COLORS.low} fill={RISK_COLORS.low} name="Baixo" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Risk Distribution Pie Chart */}
            <Card >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Distribuição por Risco
                </CardTitle>
                <CardDescription>Proporção de eventos por nível de severidade</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={chartData.byRisk}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      outerRadius={100}
                      dataKey="value"
                    >
                      {chartData.byRisk.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Users with Security Issues */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Usuários com Problemas de Segurança
                </CardTitle>
                <CardDescription>Top 10 usuários que executaram ações de risco</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData.byUser} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="user" type="category" width={150} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="critical" stackId="a" fill={RISK_COLORS.critical} name="Crítico" />
                    <Bar dataKey="high" stackId="a" fill={RISK_COLORS.high} name="Alto" />
                    <Bar dataKey="medium" stackId="a" fill={RISK_COLORS.medium} name="Médio" />
                    <Bar dataKey="low" stackId="a" fill={RISK_COLORS.low} name="Baixo" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Main Content Tabs */}
        <Tabs defaultValue="events" className="w-full">
          <TabsList>
            <TabsTrigger value="events">Eventos</TabsTrigger>
            <TabsTrigger value="security">Eventos de Segurança</TabsTrigger>
            <TabsTrigger value="users">Por Usuário</TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-1" />
              Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="space-y-4">
            <Card >
              <CardHeader>
                <CardTitle>Todos os Eventos</CardTitle>
                <CardDescription>Lista completa de eventos do CloudTrail</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
                  </div>
                ) : events && events.length > 0 ? (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {events.slice(0, 100).map((event) => (
                      <div key={event.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-sm">{event.event_name}</h4>
                              {getRiskBadge(event.risk_level)}
                              {event.event_category && <Badge variant="outline" className="text-xs">{event.event_category}</Badge>}
                              {event.is_security_event && <Badge variant="outline" className="border-orange-500/50 text-orange-600">Segurança</Badge>}
                              {event.error_code && <Badge variant="destructive">Erro</Badge>}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1"><User className="h-3 w-3" />{event.user_name}</span>
                              <span className="text-xs">({event.user_type})</span>
                              {event.source_ip_address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{event.source_ip_address}</span>}
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDateBR(event.event_time)} {new Date(event.event_time).toLocaleTimeString('pt-BR')}</span>
                              <span>{event.aws_region}</span>
                            </div>
                          </div>
                        </div>
                        {event.risk_reasons && event.risk_reasons.length > 0 && (
                          <div className="flex gap-2 flex-wrap">
                            {event.risk_reasons.map((reason, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">{reason}</Badge>
                            ))}
                          </div>
                        )}
                        {/* Show explanation for security events */}
                        {event.is_security_event && event.security_explanation && (
                          <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2 text-sm">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                              <p className="text-muted-foreground">{event.security_explanation}</p>
                            </div>
                          </div>
                        )}
                        {event.is_security_event && event.remediation_suggestion && (
                          <div className="bg-green-500/10 border border-green-500/20 rounded p-2 text-sm">
                            <div className="flex items-start gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                              <p className="text-muted-foreground">{event.remediation_suggestion}</p>
                            </div>
                          </div>
                        )}
                        {event.error_code && (
                          <div className="bg-destructive/10 border border-destructive/20 rounded p-2 text-sm">
                            <span className="font-medium text-destructive">Erro: {event.error_code}</span>
                            {event.error_message && <p className="text-muted-foreground">{event.error_message}</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-xl font-semibold mb-2">Nenhum evento encontrado</h3>
                    <p className="text-muted-foreground mb-4">Clique em "Buscar Eventos" para analisar o CloudTrail.</p>
                    <Button onClick={() => startAnalysisMutation.mutate(false)} disabled={startAnalysisMutation.isPending || isAnalyzing || !selectedAccountId}>
                      <Play className="h-4 w-4 mr-2" />
                      Buscar Eventos
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <Card >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  Eventos de Segurança
                </CardTitle>
                <CardDescription>Apenas eventos que representam riscos de segurança</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
                  </div>
                ) : events?.filter(e => e.is_security_event || e.risk_level !== 'low').length ? (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {events.filter(e => e.is_security_event || e.risk_level !== 'low').map((event) => (
                      <div key={event.id} className={`border rounded-lg p-4 space-y-3 ${
                        event.risk_level === 'critical' ? 'border-red-500/50 bg-red-500/5' :
                        event.risk_level === 'high' ? 'border-orange-500/50 bg-orange-500/5' : ''
                      }`}>
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-sm">{event.event_name}</h4>
                              {getRiskBadge(event.risk_level)}
                              {event.event_category && (
                                <Badge variant="outline" className="text-xs">{event.event_category}</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1 font-medium"><User className="h-3 w-3" />{event.user_name}</span>
                              <span className="text-xs bg-muted px-2 py-0.5 rounded">{event.user_type}</span>
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDateBR(event.event_time)} {new Date(event.event_time).toLocaleTimeString('pt-BR')}</span>
                            </div>
                            {event.user_arn && <p className="text-xs text-muted-foreground font-mono">{event.user_arn}</p>}
                          </div>
                        </div>
                        
                        {/* Security Explanation */}
                        {event.security_explanation && (
                          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">Por que isso é um problema?</p>
                                <p className="text-sm text-muted-foreground">{event.security_explanation}</p>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Remediation Suggestion */}
                        {event.remediation_suggestion && (
                          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">Recomendação</p>
                                <p className="text-sm text-muted-foreground">{event.remediation_suggestion}</p>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {event.risk_reasons && event.risk_reasons.length > 0 && (
                          <div className="bg-muted/50 rounded p-2">
                            <p className="text-sm font-medium mb-1">Motivos do Risco:</p>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {event.risk_reasons.map((reason, idx) => (
                                <li key={idx} className="flex items-center gap-2">
                                  <AlertTriangle className="h-3 w-3 text-orange-500" />
                                  {reason}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Shield className="h-16 w-16 mx-auto mb-4 text-green-500" />
                    <h3 className="text-xl font-semibold mb-2">Nenhum evento de segurança</h3>
                    <p className="text-muted-foreground">Não foram encontrados eventos de risco no período selecionado.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <Card >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Atividade por Usuário
                </CardTitle>
                <CardDescription>Usuários que executaram ações de segurança</CardDescription>
              </CardHeader>
              <CardContent>
                {chartData.byUser.length > 0 ? (
                  <div className="space-y-4">
                    {chartData.byUser.map((userData, idx) => (
                      <div key={idx} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <User className="h-5 w-5" />
                            <span className="font-semibold">{userData.user}</span>
                          </div>
                          <span className="text-sm text-muted-foreground">{userData.total} eventos</span>
                        </div>
                        <div className="flex gap-2">
                          {userData.critical > 0 && <Badge variant="destructive">{userData.critical} Críticos</Badge>}
                          {userData.high > 0 && <Badge variant="destructive">{userData.high} Altos</Badge>}
                          {userData.medium > 0 && <Badge variant="secondary">{userData.medium} Médios</Badge>}
                          {userData.low > 0 && <Badge variant="outline">{userData.low} Baixos</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <User className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-xl font-semibold mb-2">Sem dados de usuários</h3>
                    <p className="text-muted-foreground">Busque eventos do CloudTrail para ver a atividade por usuário.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            {organizationId && (
              <CloudTrailAnalysisHistory 
                organizationId={organizationId} 
                accountId={selectedAccountId || undefined}
              />
            )}
          </TabsContent>
        </Tabs>

        {/* Running Analysis Status */}
        {isAnalyzing && analysisId && (
          <Card className=" border-blue-500/50 bg-blue-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
                Análise em Andamento
              </CardTitle>
              <CardDescription>
                Os eventos do CloudTrail estão sendo buscados e analisados em background
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '100%' }} />
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground">Processando...</span>
                </div>
                {analysisStatus && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <span className="ml-2 font-medium capitalize">{analysisStatus.status}</span>
                    </div>
                    {analysisStatus.events_processed !== undefined && (
                      <div>
                        <span className="text-muted-foreground">Eventos:</span>
                        <span className="ml-2 font-medium">{analysisStatus.events_processed}</span>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  A página será atualizada automaticamente quando a análise for concluída.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
