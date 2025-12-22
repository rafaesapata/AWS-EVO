import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layout } from "@/components/Layout";
import { apiClient } from "@/integrations/aws/api-client";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { 
  FileText, 
  Search, 
  AlertTriangle, 
  Eye,
  Clock,
  User,
  MapPin,
  RefreshCw,
  Download,
  Filter,
  Shield,
  Activity
} from "lucide-react";

interface CloudTrailEvent {
  id: string;
  event_time: string;
  event_name: string;
  event_source: string;
  user_identity: {
    type: string;
    user_name: string;
    arn: string;
  };
  source_ip_address: string;
  user_agent: string;
  aws_region: string;
  error_code: string | null;
  error_message: string | null;
  resources: Array<{
    resource_type: string;
    resource_name: string;
  }>;
  request_parameters: any;
  response_elements: any;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
}

interface AuditInsight {
  id: string;
  insight_type: 'suspicious_activity' | 'policy_violation' | 'unusual_access' | 'failed_authentication';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  event_count: number;
  first_seen: string;
  last_seen: string;
  affected_resources: string[];
  recommendations: string[];
}

export default function CloudTrailAudit() {
  const { toast } = useToast();
  const { selectedAccountId } = useAwsAccount();
  const { data: organizationId } = useOrganization();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const [selectedEventSource, setSelectedEventSource] = useState('all');
  const [selectedRiskLevel, setSelectedRiskLevel] = useState('all');

  // Get CloudTrail events
  const { data: events, isLoading, refetch } = useQuery({
    queryKey: ['cloudtrail-events', organizationId, selectedAccountId, selectedTimeRange, selectedEventSource, selectedRiskLevel, searchTerm],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 1 * 60 * 1000,
    queryFn: async () => {
      const hoursBack = selectedTimeRange === '24h' ? 24 : selectedTimeRange === '7d' ? 168 : 720;
      const startTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

      let filters: any = { 
        organization_id: organizationId,
        aws_account_id: selectedAccountId,
        gte: { event_time: startTime.toISOString() }
      };

      if (selectedEventSource !== 'all') {
        filters.event_source = selectedEventSource;
      }

      if (selectedRiskLevel !== 'all') {
        filters.risk_level = selectedRiskLevel;
      }

      const response = await apiClient.select('cloudtrail_events', {
        select: '*',
        eq: filters,
        order: { event_time: 'desc' },
        limit: 100
      });

      if (response.error) {
        throw new Error(response.error);
      }

      let filteredEvents = response.data || [];

      // Apply search filter
      if (searchTerm) {
        filteredEvents = filteredEvents.filter(event => 
          event.event_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          event.user_identity.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          event.source_ip_address.includes(searchTerm)
        );
      }

      return filteredEvents;
    },
  });

  // Get audit insights
  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ['audit-insights', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.select('audit_insights', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId
        },
        order: { severity: 'desc', last_seen: 'desc' }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return response.data || [];
    },
  });

  const handleRefresh = async () => {
    try {
      await refetch();
      toast({
        title: "Dados atualizados",
        description: "Os logs do CloudTrail foram atualizados.",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar os dados.",
        variant: "destructive"
      });
    }
  };

  const exportEvents = () => {
    if (!events) return;

    const csvContent = [
      'Timestamp,Event Name,User,Source IP,Region,Risk Level,Error',
      ...events.map(event => [
        event.event_time,
        event.event_name,
        event.user_identity.user_name,
        event.source_ip_address,
        event.aws_region,
        event.risk_level,
        event.error_code || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cloudtrail_audit_${selectedAccountId}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    toast({
      title: "Relatório exportado",
      description: "Os eventos do CloudTrail foram exportados com sucesso.",
    });
  };

  const getRiskLevelBadge = (riskLevel: string) => {
    switch (riskLevel) {
      case 'critical': return <Badge variant="destructive">Crítico</Badge>;
      case 'high': return <Badge variant="destructive">Alto</Badge>;
      case 'medium': return <Badge variant="secondary">Médio</Badge>;
      case 'low': return <Badge variant="outline">Baixo</Badge>;
      default: return <Badge variant="outline">{riskLevel}</Badge>;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive">Crítico</Badge>;
      case 'high': return <Badge variant="destructive">Alto</Badge>;
      case 'medium': return <Badge variant="secondary">Médio</Badge>;
      case 'low': return <Badge variant="outline">Baixo</Badge>;
      default: return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getInsightIcon = (insightType: string) => {
    switch (insightType) {
      case 'suspicious_activity': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'policy_violation': return <Shield className="h-4 w-4 text-orange-500" />;
      case 'unusual_access': return <Eye className="h-4 w-4 text-yellow-500" />;
      case 'failed_authentication': return <User className="h-4 w-4 text-red-600" />;
      default: return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  // Calculate summary metrics
  const totalEvents = events?.length || 0;
  const criticalEvents = events?.filter(event => event.risk_level === 'critical').length || 0;
  const failedEvents = events?.filter(event => event.error_code).length || 0;
  const uniqueUsers = new Set(events?.map(event => event.user_identity.user_name)).size || 0;

  const eventSources = [
    { value: 'all', label: 'Todos os Serviços' },
    { value: 'iam.amazonaws.com', label: 'IAM' },
    { value: 's3.amazonaws.com', label: 'S3' },
    { value: 'ec2.amazonaws.com', label: 'EC2' },
    { value: 'lambda.amazonaws.com', label: 'Lambda' },
    { value: 'rds.amazonaws.com', label: 'RDS' },
    { value: 'cloudformation.amazonaws.com', label: 'CloudFormation' }
  ];

  return (
    <Layout 
      title="Auditoria CloudTrail" 
      description="Analise logs e eventos do AWS CloudTrail para auditoria"
      icon={<FileText className="h-7 w-7 text-white" />}
    >
      <div className="space-y-6">
      {/* Header */}
      <Card className="glass border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-6 w-6 text-primary" />
                Auditoria CloudTrail
              </CardTitle>
              <CardDescription>
                Análise e monitoramento de logs do AWS CloudTrail para detecção de atividades suspeitas
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={isLoading}
                className="glass"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'Atualizando...' : 'Atualizar'}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportEvents}
                className="glass"
                disabled={!events || events.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Eventos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{totalEvents.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Eventos Críticos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-red-500">{criticalEvents}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Eventos com Falha</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-orange-500">{failedEvents}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Usuários Únicos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">{uniqueUsers}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="glass border-primary/20">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar eventos, usuários, IPs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 glass"
              />
            </div>
            <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
              <SelectTrigger className="glass">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Últimas 24h</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedEventSource} onValueChange={setSelectedEventSource}>
              <SelectTrigger className="glass">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {eventSources.map((source) => (
                  <SelectItem key={source.value} value={source.value}>
                    {source.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedRiskLevel} onValueChange={setSelectedRiskLevel}>
              <SelectTrigger className="glass">
                <SelectValue placeholder="Nível de Risco" />
              </SelectTrigger>
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

      {/* Main Content */}
      <Tabs defaultValue="events" className="w-full">
        <TabsList className="glass">
          <TabsTrigger value="events">Eventos</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Eventos do CloudTrail</CardTitle>
              <CardDescription>Lista detalhada de eventos de auditoria</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : events && events.length > 0 ? (
                <div className="space-y-4">
                  {events.map((event) => (
                    <div key={event.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{event.event_name}</h4>
                            {getRiskLevelBadge(event.risk_level)}
                            {event.error_code && (
                              <Badge variant="destructive">Erro</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              <span>{event.user_identity.user_name}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              <span>{event.source_ip_address}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{new Date(event.event_time).toLocaleString('pt-BR')}</span>
                            </div>
                            <span>{event.aws_region}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Serviço: {event.event_source}
                          </p>
                        </div>
                      </div>
                      
                      {event.error_code && (
                        <div className="bg-destructive/10 border border-destructive/20 rounded p-3">
                          <p className="text-sm font-medium text-destructive">
                            Erro: {event.error_code}
                          </p>
                          {event.error_message && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {event.error_message}
                            </p>
                          )}
                        </div>
                      )}
                      
                      {event.resources && event.resources.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Recursos Afetados:</p>
                          <div className="flex gap-2 flex-wrap">
                            {event.resources.map((resource, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {resource.resource_type}: {resource.resource_name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">Nenhum evento encontrado</h3>
                  <p className="text-muted-foreground">
                    Nenhum evento do CloudTrail corresponde aos filtros aplicados.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Insights de Auditoria</CardTitle>
              <CardDescription>Análises automáticas e detecção de padrões suspeitos</CardDescription>
            </CardHeader>
            <CardContent>
              {insightsLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))}
                </div>
              ) : insights && insights.length > 0 ? (
                <div className="space-y-4">
                  {insights.map((insight) => (
                    <div key={insight.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          {getInsightIcon(insight.insight_type)}
                          <div className="space-y-1">
                            <h4 className="font-semibold">{insight.title}</h4>
                            <p className="text-sm text-muted-foreground">{insight.description}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{insight.event_count} eventos</span>
                              <span>•</span>
                              <span>Primeiro: {new Date(insight.first_seen).toLocaleString('pt-BR')}</span>
                              <span>•</span>
                              <span>Último: {new Date(insight.last_seen).toLocaleString('pt-BR')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          {getSeverityBadge(insight.severity)}
                        </div>
                      </div>
                      
                      {insight.affected_resources && insight.affected_resources.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Recursos Afetados:</p>
                          <div className="flex gap-2 flex-wrap">
                            {insight.affected_resources.map((resource, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {resource}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {insight.recommendations && insight.recommendations.length > 0 && (
                        <div className="bg-muted/30 rounded p-3">
                          <p className="text-sm font-medium mb-2">Recomendações:</p>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            {insight.recommendations.map((rec, idx) => (
                              <li key={idx} className="flex gap-2">
                                <span>•</span>
                                <span>{rec}</span>
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
                  <Eye className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">Nenhum insight disponível</h3>
                  <p className="text-muted-foreground">
                    Nenhuma atividade suspeita ou padrão anômalo foi detectado.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Analytics Avançados</CardTitle>
              <CardDescription>Análises estatísticas e tendências dos logs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Activity className="h-12 w-12 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Analytics em desenvolvimento</h3>
                  <p>Análises estatísticas avançadas serão implementadas em breve.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </Layout>
  );
}