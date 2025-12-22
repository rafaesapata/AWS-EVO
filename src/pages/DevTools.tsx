import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient } from "@/integrations/aws/api-client";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { 
  Code, 
  Terminal, 
  Bug,
  Activity,
  Database,
  RefreshCw,
  Play,
  Download,
  Crown,
  Zap,
  Eye,
  Settings,
  FileText,
  BarChart3
} from "lucide-react";

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  service: string;
  message: string;
  metadata: any;
  trace_id: string;
}

interface PerformanceMetric {
  id: string;
  service_name: string;
  endpoint: string;
  method: string;
  response_time_ms: number;
  memory_usage_mb: number;
  cpu_usage_percent: number;
  timestamp: string;
  status_code: number;
}

export default function DevTools() {
  const { toast } = useToast();
  const { selectedAccountId } = useAwsAccount();
  const { data: organizationId } = useOrganization();
  const [selectedLogLevel, setSelectedLogLevel] = useState<string>('all');
  const [selectedService, setSelectedService] = useState<string>('all');
  const [logQuery, setLogQuery] = useState('');
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM daily_costs LIMIT 10;');

  // Get application logs
  const { data: logs, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['application-logs', organizationId, selectedAccountId, selectedLogLevel, selectedService],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      let filters: any = { 
        organization_id: organizationId,
        aws_account_id: selectedAccountId
      };

      if (selectedLogLevel !== 'all') {
        filters.level = selectedLogLevel;
      }

      if (selectedService !== 'all') {
        filters.service = selectedService;
      }

      const response = await apiClient.select('application_logs', {
        select: '*',
        eq: filters,
        order: { timestamp: 'desc' },
        limit: 100
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return response.data || [];
    },
  });

  // Get performance metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['performance-metrics', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 1 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.select('performance_metrics', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId
        },
        order: { timestamp: 'desc' },
        limit: 50
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return response.data || [];
    },
  });

  const handleRefresh = async () => {
    try {
      await Promise.all([refetchLogs()]);
      toast({
        title: "Dados atualizados",
        description: "Os logs e métricas foram atualizados.",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar os dados.",
        variant: "destructive"
      });
    }
  };

  const executeQuery = async () => {
    try {
      // Simulate query execution
      toast({
        title: "Query executada",
        description: "A query foi executada com sucesso (simulação).",
      });
    } catch (error) {
      toast({
        title: "Erro na query",
        description: "Erro ao executar a query.",
        variant: "destructive"
      });
    }
  };

  const exportLogs = () => {
    if (!logs) return;

    const csvContent = [
      'Timestamp,Level,Service,Message,Trace ID',
      ...logs.map(log => [
        log.timestamp,
        log.level,
        log.service,
        `"${log.message}"`,
        log.trace_id
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `application_logs_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    toast({
      title: "Logs exportados",
      description: "Os logs foram exportados com sucesso.",
    });
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'error': return <Badge variant="destructive">ERROR</Badge>;
      case 'warn': return <Badge className="bg-yellow-500">WARN</Badge>;
      case 'info': return <Badge className="bg-blue-500">INFO</Badge>;
      case 'debug': return <Badge variant="outline">DEBUG</Badge>;
      default: return <Badge variant="outline">{level.toUpperCase()}</Badge>;
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error': return <Bug className="h-4 w-4 text-red-500" />;
      case 'warn': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'info': return <Eye className="h-4 w-4 text-blue-500" />;
      case 'debug': return <Code className="h-4 w-4 text-gray-500" />;
      default: return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (statusCode: number) => {
    if (statusCode >= 200 && statusCode < 300) return 'text-green-500';
    if (statusCode >= 400 && statusCode < 500) return 'text-yellow-500';
    if (statusCode >= 500) return 'text-red-500';
    return 'text-gray-500';
  };

  // Calculate summary metrics
  const errorCount = logs?.filter(log => log.level === 'error').length || 0;
  const warnCount = logs?.filter(log => log.level === 'warn').length || 0;
  const avgResponseTime = metrics?.length > 0 
    ? metrics.reduce((sum, m) => sum + m.response_time_ms, 0) / metrics.length 
    : 0;
  const avgMemoryUsage = metrics?.length > 0 
    ? metrics.reduce((sum, m) => sum + m.memory_usage_mb, 0) / metrics.length 
    : 0;

  const services = ['all', 'api-gateway', 'lambda', 'cognito', 'bedrock', 'cost-explorer'];
  const logLevels = ['all', 'error', 'warn', 'info', 'debug'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="glass border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-6 w-6 text-primary" />
                Ferramentas de Desenvolvimento
                <Crown className="h-5 w-5 text-yellow-500" />
              </CardTitle>
              <CardDescription>
                Debug, logs, performance e ferramentas avançadas - Acesso Super Admin
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={logsLoading}
                className="glass"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${logsLoading ? 'animate-spin' : ''}`} />
                {logsLoading ? 'Atualizando...' : 'Atualizar'}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportLogs}
                className="glass"
                disabled={!logs || logs.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar Logs
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Logs de Erro</CardTitle>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-red-500">{errorCount}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Warnings</CardTitle>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-yellow-500">{warnCount}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tempo de Resposta Médio</CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{avgResponseTime.toFixed(0)}ms</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Uso de Memória Médio</CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{avgMemoryUsage.toFixed(0)}MB</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="logs" className="w-full">
        <TabsList className="glass">
          <TabsTrigger value="logs">Logs da Aplicação</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="database">Database Query</TabsTrigger>
          <TabsTrigger value="debug">Debug Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="space-y-4">
          {/* Log Filters */}
          <Card className="glass border-primary/20">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select value={selectedLogLevel} onValueChange={setSelectedLogLevel}>
                  <SelectTrigger className="glass">
                    <SelectValue placeholder="Filtrar por nível" />
                  </SelectTrigger>
                  <SelectContent>
                    {logLevels.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level === 'all' ? 'Todos os Níveis' : level.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedService} onValueChange={setSelectedService}>
                  <SelectTrigger className="glass">
                    <SelectValue placeholder="Filtrar por serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((service) => (
                      <SelectItem key={service} value={service}>
                        {service === 'all' ? 'Todos os Serviços' : service}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Buscar nos logs..."
                  value={logQuery}
                  onChange={(e) => setLogQuery(e.target.value)}
                  className="glass"
                />
              </div>
            </CardContent>
          </Card>

          {/* Logs List */}
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Logs da Aplicação</CardTitle>
              <CardDescription>Logs em tempo real dos serviços AWS</CardDescription>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="space-y-4">
                  {[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : logs && logs.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {logs
                    .filter(log => !logQuery || log.message.toLowerCase().includes(logQuery.toLowerCase()))
                    .map((log) => (
                    <div key={log.id} className="border rounded p-3 font-mono text-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          {getLevelIcon(log.level)}
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">
                                {new Date(log.timestamp).toLocaleString('pt-BR')}
                              </span>
                              {getLevelBadge(log.level)}
                              <Badge variant="outline">{log.service}</Badge>
                            </div>
                            <div className="text-foreground">{log.message}</div>
                            {log.trace_id && (
                              <div className="text-xs text-muted-foreground">
                                Trace ID: {log.trace_id}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Terminal className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">Nenhum log encontrado</h3>
                  <p className="text-muted-foreground">
                    Nenhum log corresponde aos filtros aplicados.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Métricas de Performance</CardTitle>
              <CardDescription>Monitoramento de performance dos serviços</CardDescription>
            </CardHeader>
            <CardContent>
              {metricsLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : metrics && metrics.length > 0 ? (
                <div className="space-y-4">
                  {metrics.map((metric) => (
                    <div key={metric.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{metric.service_name}</h4>
                            <Badge variant="outline">{metric.method}</Badge>
                            <Badge className={getStatusColor(metric.status_code)}>
                              {metric.status_code}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{metric.endpoint}</p>
                          <div className="text-xs text-muted-foreground">
                            {new Date(metric.timestamp).toLocaleString('pt-BR')}
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <div className="text-lg font-bold">
                            {metric.response_time_ms}ms
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {metric.memory_usage_mb}MB • {metric.cpu_usage_percent}% CPU
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <BarChart3 className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">Nenhuma métrica disponível</h3>
                  <p className="text-muted-foreground">
                    As métricas de performance aparecerão aqui.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="database" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Database Query Tool</CardTitle>
              <CardDescription>Execute queries SQL diretamente no banco de dados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">SQL Query</label>
                <Textarea
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  placeholder="Digite sua query SQL aqui..."
                  rows={6}
                  className="font-mono"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={executeQuery} className="gap-2">
                  <Play className="h-4 w-4" />
                  Executar Query
                </Button>
                <Button variant="outline" onClick={() => setSqlQuery('')}>
                  Limpar
                </Button>
              </div>
              <div className="border rounded-lg p-4 bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  ⚠️ Cuidado: Esta ferramenta executa queries diretamente no banco de produção. 
                  Use apenas queries SELECT para consultas seguras.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="debug" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Ferramentas de Debug</CardTitle>
              <CardDescription>Ferramentas avançadas para debug e troubleshooting</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Button variant="outline" className="h-24 flex flex-col items-center gap-2 glass">
                  <Database className="h-8 w-8 text-primary" />
                  <span className="text-sm font-medium">Cache Inspector</span>
                </Button>
                <Button variant="outline" className="h-24 flex flex-col items-center gap-2 glass">
                  <Zap className="h-8 w-8 text-primary" />
                  <span className="text-sm font-medium">API Tester</span>
                </Button>
                <Button variant="outline" className="h-24 flex flex-col items-center gap-2 glass">
                  <Settings className="h-8 w-8 text-primary" />
                  <span className="text-sm font-medium">Config Viewer</span>
                </Button>
                <Button variant="outline" className="h-24 flex flex-col items-center gap-2 glass">
                  <FileText className="h-8 w-8 text-primary" />
                  <span className="text-sm font-medium">Error Reports</span>
                </Button>
                <Button variant="outline" className="h-24 flex flex-col items-center gap-2 glass">
                  <Activity className="h-8 w-8 text-primary" />
                  <span className="text-sm font-medium">Health Checks</span>
                </Button>
                <Button variant="outline" className="h-24 flex flex-col items-center gap-2 glass">
                  <Eye className="h-8 w-8 text-primary" />
                  <span className="text-sm font-medium">Request Tracer</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}