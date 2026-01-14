/**
 * Azure Activity Logs Dashboard Component
 * 
 * Displays Azure Activity Logs with filtering and risk analysis.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Activity, 
  AlertTriangle, 
  Shield, 
  User, 
  Clock, 
  RefreshCw,
  Filter,
  Server,
  Globe,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { apiClient } from '@/integrations/aws/api-client';
import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { useOrganization } from '@/hooks/useOrganization';
import { cn } from '@/lib/utils';

interface ActivityEvent {
  id: string;
  eventName: string;
  eventTime: string;
  userName: string;
  userType: string;
  service: string;
  action: string;
  resourceId: string;
  resourceType: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  riskReasons: string[];
  sourceIp: string;
}

interface ActivityLogsSummary {
  total: number;
  byRiskLevel: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  byService: Record<string, number>;
  byUser: Record<string, number>;
}

interface ActivityLogsResponse {
  subscriptionId: string;
  subscriptionName: string;
  period: { startDate: string; endDate: string };
  summary: ActivityLogsSummary;
  highRiskEvents: ActivityEvent[];
  events: ActivityEvent[];
}

const RISK_COLORS = {
  critical: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-green-500 text-white',
};

const TIME_RANGES = [
  { value: '1', label: 'Último dia' },
  { value: '7', label: 'Últimos 7 dias' },
  { value: '14', label: 'Últimos 14 dias' },
  { value: '30', label: 'Últimos 30 dias' },
];

export function AzureActivityLogs() {
  const { t } = useTranslation();
  const { selectedAccountId, selectedProvider } = useCloudAccount();
  const { data: organizationId } = useOrganization();
  const [timeRange, setTimeRange] = useState('7');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const isAzure = selectedProvider === 'AZURE';

  // Calculate date range
  const getDateRange = () => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(timeRange));
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    };
  };

  const { data, isLoading, refetch, isFetching } = useQuery<ActivityLogsResponse>({
    queryKey: ['azure-activity-logs', selectedAccountId, timeRange, organizationId],
    enabled: !!selectedAccountId && isAzure && !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    queryFn: async () => {
      const { startDate, endDate } = getDateRange();
      const result = await apiClient.invoke('azure-activity-logs', {
        body: {
          credentialId: selectedAccountId,
          startDate,
          endDate,
          limit: 500,
        },
      });
      if (result.error) throw new Error(result.error.message || 'Failed to fetch activity logs');
      return result.data as ActivityLogsResponse;
    },
  });

  // Filter events by risk level
  const filteredEvents = data?.events?.filter(event => {
    if (riskFilter === 'all') return true;
    return event.riskLevel === riskFilter;
  }) || [];

  // Show message if not Azure
  if (!isAzure) {
    return (
      <Card className="glass border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-blue-500/10">
              <Activity className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <h3 className="font-semibold">Azure Activity Logs</h3>
              <p className="text-sm text-muted-foreground">
                Selecione uma conta Azure para visualizar os logs de atividade.
                Para AWS, utilize o CloudTrail.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="glass border-primary/20">
        <CardHeader>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="glass border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Azure Activity Logs
              </CardTitle>
              <CardDescription>
                {data?.subscriptionName || 'Monitoramento de atividades e eventos de segurança'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-40">
                  <Clock className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGES.map(range => (
                    <SelectItem key={range.value} value={range.value}>
                      {range.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => refetch()}
                disabled={isFetching}
                className="glass hover-glow"
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
                Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Summary Cards */}
      {data?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="glass border-red-500/30">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Críticos</p>
                  <p className="text-2xl font-bold text-red-500">{data.summary.byRiskLevel.critical}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="glass border-orange-500/30">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Alto Risco</p>
                  <p className="text-2xl font-bold text-orange-500">{data.summary.byRiskLevel.high}</p>
                </div>
                <Shield className="h-8 w-8 text-orange-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="glass border-yellow-500/30">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Médio Risco</p>
                  <p className="text-2xl font-bold text-yellow-500">{data.summary.byRiskLevel.medium}</p>
                </div>
                <Activity className="h-8 w-8 text-yellow-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="glass border-green-500/30">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Baixo Risco</p>
                  <p className="text-2xl font-bold text-green-500">{data.summary.byRiskLevel.low}</p>
                </div>
                <Shield className="h-8 w-8 text-green-500/50" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Tabs defaultValue="events" className="w-full">
        <TabsList className="glass">
          <TabsTrigger value="events">Eventos ({filteredEvents.length})</TabsTrigger>
          <TabsTrigger value="high-risk">Alto Risco ({data?.highRiskEvents?.length || 0})</TabsTrigger>
          <TabsTrigger value="by-service">Por Serviço</TabsTrigger>
          <TabsTrigger value="by-user">Por Usuário</TabsTrigger>
        </TabsList>

        {/* Events Tab */}
        <TabsContent value="events" className="space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filtrar por risco" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="critical">Crítico</SelectItem>
                <SelectItem value="high">Alto</SelectItem>
                <SelectItem value="medium">Médio</SelectItem>
                <SelectItem value="low">Baixo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            {filteredEvents.length === 0 ? (
              <Card className="glass">
                <CardContent className="pt-6 text-center">
                  <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-muted-foreground">Nenhum evento encontrado para o período selecionado</p>
                </CardContent>
              </Card>
            ) : (
              filteredEvents.slice(0, 50).map(event => (
                <Card 
                  key={event.id} 
                  className="glass border-l-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  style={{ borderLeftColor: event.riskLevel === 'critical' ? '#ef4444' : event.riskLevel === 'high' ? '#f97316' : event.riskLevel === 'medium' ? '#eab308' : '#22c55e' }}
                  onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={RISK_COLORS[event.riskLevel]}>
                            {event.riskLevel}
                          </Badge>
                          <span className="font-medium">{event.eventName}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {event.userName}
                          </span>
                          <span className="flex items-center gap-1">
                            <Server className="h-3 w-3" />
                            {event.service}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(event.eventTime).toLocaleString('pt-BR')}
                          </span>
                          {event.sourceIp && (
                            <span className="flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              {event.sourceIp}
                            </span>
                          )}
                        </div>
                      </div>
                      {expandedEvent === event.id ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    
                    {expandedEvent === event.id && (
                      <div className="mt-4 pt-4 border-t space-y-2">
                        <div>
                          <span className="text-sm font-medium">Ação:</span>
                          <span className="text-sm text-muted-foreground ml-2">{event.action}</span>
                        </div>
                        <div>
                          <span className="text-sm font-medium">Recurso:</span>
                          <span className="text-sm text-muted-foreground ml-2 break-all">{event.resourceId}</span>
                        </div>
                        <div>
                          <span className="text-sm font-medium">Tipo:</span>
                          <span className="text-sm text-muted-foreground ml-2">{event.resourceType}</span>
                        </div>
                        {event.riskReasons && event.riskReasons.length > 0 && (
                          <div>
                            <span className="text-sm font-medium">Motivos do Risco:</span>
                            <ul className="list-disc list-inside text-sm text-muted-foreground ml-2">
                              {event.riskReasons.map((reason, idx) => (
                                <li key={idx}>{reason}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* High Risk Tab */}
        <TabsContent value="high-risk" className="space-y-4">
          {data?.highRiskEvents && data.highRiskEvents.length > 0 ? (
            data.highRiskEvents.map(event => (
              <Card key={event.id} className="glass border-l-4 border-l-red-500">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={RISK_COLORS[event.riskLevel]}>
                          {event.riskLevel}
                        </Badge>
                        <span className="font-medium">{event.eventName}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{event.action}</p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {event.userName}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(event.eventTime).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      {event.riskReasons && event.riskReasons.length > 0 && (
                        <div className="mt-2 p-2 bg-red-500/10 rounded">
                          <p className="text-sm font-medium text-red-600">Motivos:</p>
                          <ul className="list-disc list-inside text-sm text-red-600/80">
                            {event.riskReasons.map((reason, idx) => (
                              <li key={idx}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="glass">
              <CardContent className="pt-6 text-center">
                <Shield className="h-12 w-12 mx-auto mb-4 text-green-500/50" />
                <p className="text-muted-foreground">Nenhum evento de alto risco encontrado</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* By Service Tab */}
        <TabsContent value="by-service" className="space-y-4">
          <Card className="glass">
            <CardContent className="pt-6">
              {data?.summary?.byService && Object.keys(data.summary.byService).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(data.summary.byService)
                    .sort(([, a], [, b]) => b - a)
                    .map(([service, count]) => (
                      <div key={service} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4 text-muted-foreground" />
                          <span>{service}</span>
                        </div>
                        <Badge variant="secondary">{count} eventos</Badge>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground">Nenhum dado disponível</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* By User Tab */}
        <TabsContent value="by-user" className="space-y-4">
          <Card className="glass">
            <CardContent className="pt-6">
              {data?.summary?.byUser && Object.keys(data.summary.byUser).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(data.summary.byUser)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 20)
                    .map(([user, count]) => (
                      <div key={user} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="truncate max-w-md">{user}</span>
                        </div>
                        <Badge variant="secondary">{count} eventos</Badge>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground">Nenhum dado disponível</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
