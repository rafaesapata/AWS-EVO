import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Clock, Zap, History, Search, ChevronLeft, ChevronRight, Loader2, TrendingUp, Shield, Activity } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { toast } from "sonner";
import { format } from "date-fns";
import { PredictiveIncidentsHistory } from "./PredictiveIncidentsHistory";
import { useTVDashboard } from "@/contexts/TVDashboardContext";
import { InfoTooltip, tooltipContent } from "@/components/ui/info-tooltip";

export default function PredictiveIncidents() {
  const queryClient = useQueryClient();
  const { isTVMode } = useTVDashboard();
  const { data: organizationId } = useOrganization();
  const { selectedAccountId } = useAwsAccount();
  const [activeTab, setActiveTab] = useState<'predictions' | 'history'>('predictions');
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const { data: incidents, isLoading } = useQuery({
    queryKey: ['predictive-incidents', organizationId, selectedAccountId],
    queryFn: async () => {
      const response = await apiClient.select('predictive_incidents', { 
        eq: { organization_id: organizationId, status: 'active' },
        order: { column: 'probability', ascending: false }
      });
      const data = response.data;
      const error = response.error;
      // Filter by account on client-side if needed
      if (selectedAccountId && data) {
        return data.filter((i: any) => !i.aws_account_id || i.aws_account_id === selectedAccountId);
      }
      
      return data;
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const { data: scanHistory } = useQuery({
    queryKey: ['predictive-incidents-history', organizationId, selectedAccountId],
    queryFn: async () => {
      const response = await apiClient.select('predictive_incidents_history', { 
        eq: { organization_id: organizationId },
        order: { column: 'scan_date', ascending: false },
        limit: 50
      });
      const data = response.data;
      const error = response.error;
      // Filter by account on client-side if needed
      if (selectedAccountId && data) {
        return data.filter((h: any) => !h.aws_account_id || h.aws_account_id === selectedAccountId);
      }
      
      return data || [];
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const runPrediction = useMutation({
    mutationFn: async () => {
      const { data, error } = await apiClient.lambda('predict-incidents');
      
      
      
      if (data?.error) {
        throw new Error(data.error);
      }
      
      return data;
    },
    onSuccess: (data) => {
      const count = data?.predictions_count || 0;
      const message = data?.message;
      
      if (count === 0 && message) {
        toast.success(message, {
          duration: 5000,
          position: 'top-center',
        });
      } else if (count > 0) {
        toast.success(`Predição executada com sucesso! ${count} incidente(s) previsto(s).`, {
          duration: 5000,
          position: 'top-center',
        });
      } else {
        toast.success('Predição executada com sucesso', {
          duration: 5000,
          position: 'top-center',
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ['predictive-incidents'] });
      queryClient.invalidateQueries({ queryKey: ['predictive-incidents-history'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao executar predição: ' + (error.message || 'Erro desconhecido'));
    }
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-destructive text-destructive-foreground';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-white';
      default: return 'bg-blue-500 text-white';
    }
  };

  const getProbabilityColor = (probability: number) => {
    if (probability >= 80) return 'text-destructive';
    if (probability >= 60) return 'text-orange-600';
    return 'text-yellow-600';
  };

  const highRiskCount = incidents?.filter(i => i.probability >= 80).length || 0;

  // Filter incidents
  const filteredIncidents = incidents?.filter((incident: any) => {
    const matchesSearch = searchTerm === '' || 
      incident.resource_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      incident.resource_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      incident.incident_type?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSeverity = severityFilter === 'all' || incident.severity === severityFilter;
    const matchesType = typeFilter === 'all' || incident.incident_type === typeFilter;
    
    return matchesSearch && matchesSeverity && matchesType;
  }) || [];

  // Pagination
  const totalPages = Math.ceil(filteredIncidents.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedIncidents = filteredIncidents.slice(startIndex, endIndex);

  if (isLoading) {
    return <div className="text-muted-foreground">Carregando predições...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">Predição de Incidentes (ML)</h2>
            <InfoTooltip title="Como funciona a predição?">
              {tooltipContent.predictiveIncidents}
            </InfoTooltip>
          </div>
          <p className="text-muted-foreground">Previna problemas antes que aconteçam usando Machine Learning</p>
        </div>
        {!isTVMode && activeTab === 'predictions' && (
          <Button onClick={() => runPrediction.mutate()} disabled={runPrediction.isPending}>
            {runPrediction.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Executar Predição
              </>
            )}
          </Button>
        )}
      </div>
      
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'predictions' | 'history')}>
        <TabsList className="glass grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="predictions">Predições Atuais</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="predictions" className="space-y-6">

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 animate-stagger">
        <Card className="glass border-primary/20 card-hover-lift">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Incidentes Previstos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{incidents?.length || 0}</div>
          </CardContent>
        </Card>
        <Card className="glass border-primary/20 card-hover-lift">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Alto Risco (&gt;80%)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive tabular-nums">{highRiskCount}</div>
          </CardContent>
        </Card>
        <Card className="glass border-primary/20 card-hover-lift">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Próximas 48h</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600 tabular-nums">
              {incidents?.filter(i => i.time_to_incident_hours <= 48).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card className="glass border-primary/20 card-hover-lift">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Críticos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive tabular-nums">
              {incidents?.filter(i => i.severity === 'critical').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card className="glass border-primary/20 card-hover-lift">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <History className="h-4 w-4" />
              Última Execução
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold">
              {scanHistory?.[0]?.scan_date 
                ? format(new Date(scanHistory[0].scan_date), 'dd/MM/yy HH:mm')
                : 'Nenhuma'}
            </div>
            {scanHistory?.[0]?.execution_time_seconds && (
              <div className="text-xs text-muted-foreground mt-1">
                {scanHistory[0].execution_time_seconds.toFixed(1)}s
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="glass border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 icon-pulse" />
            Incidentes Previstos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por recurso, tipo..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10"
              />
            </div>
            
            <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setCurrentPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Severidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Severidades</SelectItem>
                <SelectItem value="critical">Crítica</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setCurrentPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Tipos</SelectItem>
                <SelectItem value="performance_degradation">Degradação de Performance</SelectItem>
                <SelectItem value="capacity_saturation">Saturação de Capacidade</SelectItem>
                <SelectItem value="cost_spike">Pico de Custo</SelectItem>
                <SelectItem value="security_risk">Risco de Segurança</SelectItem>
                <SelectItem value="availability_risk">Risco de Disponibilidade</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Results count */}
          <div className="text-sm text-muted-foreground">
            Mostrando {startIndex + 1}-{Math.min(endIndex, filteredIncidents.length)} de {filteredIncidents.length} incidentes
          </div>

          <div className="space-y-4">
            {paginatedIncidents.map((incident) => (
              <div key={incident.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="font-semibold">{incident.resource_name || 'N/A'}</div>
                    <div className="font-mono text-xs bg-muted px-2 py-1 rounded mt-1 inline-block">
                      {incident.resource_id}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {incident.resource_type} • {incident.region}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge className={getSeverityColor(incident.severity)}>
                      {incident.severity}
                    </Badge>
                    <Badge variant="outline">
                      {incident.incident_type}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5" />
                      Probabilidade:
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${
                            incident.probability >= 90 ? 'bg-red-500' :
                            incident.probability >= 80 ? 'bg-orange-500' :
                            incident.probability >= 70 ? 'bg-yellow-500' :
                            'bg-blue-500'
                          }`}
                          style={{ width: `${incident.probability}%` }}
                        />
                      </div>
                      <span className="font-semibold tabular-nums min-w-[3rem] text-right">{incident.probability}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" />
                      Confiança:
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all"
                          style={{ width: `${incident.confidence_score}%` }}
                        />
                      </div>
                      <span className="font-semibold tabular-nums min-w-[3rem] text-right">{incident.confidence_score}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Tempo estimado:
                    </span>
                    <span className="font-semibold tabular-nums min-w-[3rem] text-right">
                      {incident.time_to_incident_hours < 48 
                        ? `${incident.time_to_incident_hours}h`
                        : `${Math.round(incident.time_to_incident_hours / 24)}d`}
                    </span>
                  </div>
                </div>

                {incident.contributing_factors && Array.isArray(incident.contributing_factors) && (
                  <div className="mb-4">
                    <h5 className="font-medium text-sm mb-3 flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Fatores Contribuintes:
                    </h5>
                    <div className="space-y-2">
                      {incident.contributing_factors.map((factor: any, idx: number) => (
                        <div key={idx} className="flex items-start gap-3 bg-muted/30 p-2 rounded">
                          <div className="flex-shrink-0 mt-1">
                            <div className="w-12 text-center">
                              <div className="text-xs font-semibold text-primary">{(factor.weight * 100).toFixed(0)}%</div>
                              <div className="h-1.5 bg-muted rounded-full mt-1">
                                <div 
                                  className="h-full bg-primary rounded-full transition-all" 
                                  style={{ width: `${factor.weight * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{factor.factor}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{factor.value}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-blue-500/10 rounded p-3 mb-3">
                  <div className="text-sm font-semibold mb-1">Ações Recomendadas:</div>
                  <div className="text-sm whitespace-pre-line">{incident.recommended_actions}</div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant="outline">Criar Ticket</Button>
                  <Button size="sm" variant="ghost">Marcar como Mitigado</Button>
                </div>
              </div>
            ))}

            {!paginatedIncidents.length && (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm || severityFilter !== 'all' || typeFilter !== 'all' 
                  ? 'Nenhum incidente encontrado com os filtros aplicados.'
                  : 'Nenhum incidente previsto no momento. Execute uma análise preditiva.'}
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Página {currentPage} de {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
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
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="history">
          {organizationId && <PredictiveIncidentsHistory organizationId={organizationId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
