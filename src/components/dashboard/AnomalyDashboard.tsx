import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { cognitoAuth } from '@/integrations/aws/cognito-client-simple';
import { apiClient } from '@/integrations/aws/api-client';
import { useOrganization } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, TrendingUp, Activity, Shield, CheckCircle, X, Search, ChevronLeft, ChevronRight, Loader2, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { AnomalyHistoryView } from './AnomalyHistoryView';
import { PageHeader } from '@/components/ui/page-header';

export function AnomalyDashboard() {
  const { t } = useTranslation();
  const { data: organizationId } = useOrganization();
  const { toast } = useToast();
  const [selectedAnomaly, setSelectedAnomaly] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'detection' | 'history'>('detection');
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [isExecuting, setIsExecuting] = useState(false);

  // Fetch anomalies
  const { data: anomalies, isLoading, refetch } = useQuery({
    queryKey: ['anomaly-detections', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const result = await apiClient.select('anomaly_detections', {
        select: '*',
        eq: { organization_id: organizationId },
        order: { detected_at: 'desc' },
        limit: 100
      });
      const { data, error } = { data: result.data, error: result.error };

      
      return data || [];
    },
    enabled: !!organizationId,
  });

  const runDetection = async () => {
    if (isExecuting) return;
    
    setIsExecuting(true);
    try {
      toast({
        title: t('common.executing'),
        description: t('anomalyDetection.detectionInProgress'),
      });

      const result = await apiClient.invoke('detect-anomalies', {
        body: { organization_id: organizationId }
      });
      const { error } = { error: result.error };

      if (error) {
        toast({
          title: t('common.error'),
          description: t('anomalyDetection.detectionInProgress'),
          variant: 'destructive',
        });
      } else {
        toast({
          title: t('common.success'),
          description: t('anomalyDetection.detectionCompleted'),
        });
        refetch();
      }
    } finally {
      setIsExecuting(false);
    }
  };

  const createTicket = async (anomaly: any) => {
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('User not authenticated');

      const result = await apiClient.insert('remediation_tickets', {
        title: `Anomalia: ${anomaly.detection_type} - ${anomaly.resource_type || 'Sistema'}`,
        description: `${t('anomalyDetection.title')}: ${anomaly.detection_type} - ${anomaly.resource_type || t('common.system')}
        
${t('anomalyDetection.detected')}: ${new Date(anomaly.detected_at).toLocaleString()}
${t('common.type')}: ${anomaly.detection_type}
${t('common.severity')}: ${anomaly.severity}
${t('anomalyDetection.score')}: ${(anomaly.anomaly_score * 100).toFixed(0)}%
${t('common.deviation')}: ${anomaly.deviation_percentage?.toFixed(2)}%

${t('anomalyDetection.method')}: ${anomaly.detection_method}

${t('anomalyDetection.dimensions')}:
${JSON.stringify(anomaly.dimensions, null, 2)}

${t('anomalyDetection.recommendations')}:
${anomaly.recommendations?.join('\n') || t('anomalyDetection.noRecommendations')}`,
        severity: anomaly.severity,
        status: 'pending',
        source: 'anomaly_detection',
        source_id: anomaly.id,
        assigned_to: user.username,
        organization_id: organizationId
      });

      if (result.error) throw new Error(result.error);

      toast({
        title: t('anomalyDetection.ticketCreated'),
        description: t('anomalyDetection.ticketCreatedSuccess'),
      });
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      toast({
        title: t('common.error'),
        description: `${t('anomalyDetection.errorCreatingTicket')}: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  const acknowledgeAnomaly = async (anomalyId: string) => {
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('User not authenticated');

      // SECURITY: Filter by organization_id
      const result = await apiClient.update('anomaly_detections', {
        status: 'investigating',
        acknowledged_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        acknowledged_by: user.username,
      }, { 
        eq: { id: anomalyId, organization_id: organizationId }
      });

      if (result.error) {
        throw new Error(result.error);
      }

      toast({
        title: t('common.success'),
        description: t('anomalyDetection.anomalyAcknowledged'),
      });
      refetch();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const resolveAnomaly = async (anomalyId: string) => {
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('User not authenticated');

      // SECURITY: Filter by organization_id
      const result = await apiClient.update('anomaly_detections', {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        resolved_by: user.username,
      }, { 
        eq: { id: anomalyId, organization_id: organizationId }
      });

      if (result.error) {
        throw new Error(result.error);
      }

      toast({
        title: t('common.success'),
        description: t('anomalyDetection.anomalyResolved'),
      });
      refetch();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const markFalsePositive = async (anomalyId: string) => {
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('User not authenticated');

      // SECURITY: Filter by organization_id
      const result = await apiClient.update('anomaly_detections', {
        status: 'false_positive',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        resolved_by: user.username,
      }, { 
        eq: { id: anomalyId, organization_id: organizationId }
      });

      if (result.error) {
        throw new Error(result.error);
      }

      toast({
        title: t('common.success'),
        description: t('anomalyDetection.markedFalsePositive'),
      });
      refetch();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'cost':
        return <TrendingUp className="h-4 w-4" />;
      case 'usage':
        return <Activity className="h-4 w-4" />;
      case 'performance':
        return <Activity className="h-4 w-4" />;
      case 'security':
        return <Shield className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 dark:text-red-400';
      case 'high':
        return 'text-orange-600 dark:text-orange-400';
      case 'medium':
        return 'text-yellow-600 dark:text-yellow-400';
      default:
        return 'text-blue-600 dark:text-blue-400';
    }
  };

  // Filter anomalies based on search and filters
  const filteredAnomalies = anomalies?.filter((a: any) => {
    const matchesSearch = searchTerm === '' || 
      a.resource_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.resource_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.detection_method?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSeverity = severityFilter === 'all' || a.severity === severityFilter;
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    const matchesType = typeFilter === 'all' || a.detection_type === typeFilter;
    
    return matchesSearch && matchesSeverity && matchesStatus && matchesType;
  }) || [];

  // Pagination
  const totalPages = Math.ceil(filteredAnomalies.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedAnomalies = filteredAnomalies.slice(startIndex, endIndex);

  const stats = {
    total: anomalies?.length || 0,
    active: anomalies?.filter((a: any) => a.status === 'active').length || 0,
    investigating: anomalies?.filter((a: any) => a.status === 'investigating').length || 0,
    resolved: anomalies?.filter((a: any) => a.status === 'resolved').length || 0,
    critical: anomalies?.filter((a: any) => a.severity === 'critical').length || 0,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('anomalyDetection.title')}
        description={t('anomalyDetection.description')}
        icon={Activity}
        actions={
          activeTab === 'detection' ? (
            <Button onClick={runDetection} disabled={isExecuting || isLoading}>
              {isExecuting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('anomalyDetection.executing')}
                </>
              ) : (
                <>
                  <Activity className="h-4 w-4 mr-2" />
                  {t('anomalyDetection.runDetection')}
                </>
              )}
            </Button>
          ) : undefined
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'detection' | 'history')}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="detection">{t('anomalyDetection.currentDetection')}</TabsTrigger>
          <TabsTrigger value="history">{t('anomalyDetection.history')}</TabsTrigger>
        </TabsList>

        <TabsContent value="detection" className="space-y-6">
          {isLoading ? (
            <div className="text-center py-12">
              <Activity className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
              <p className="text-muted-foreground">{t('anomalyDetection.loadingAnomalies')}</p>
            </div>
          ) : !anomalies || anomalies.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <AlertTriangle className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">{t('anomalyDetection.noAnomaliesDetected')}</h3>
                  <p className="text-muted-foreground mb-6">
                    {t('anomalyDetection.runDetectionToAnalyze')}
                  </p>
                  <Button onClick={runDetection} size="lg">
                    <Activity className="h-5 w-5 mr-2" />
                    {t('anomalyDetection.runFirstDetection')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">{t('anomalyDetection.totalAnomalies')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">{t('anomalyDetection.active')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{stats.active}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">{t('anomalyDetection.critical')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
              </CardContent>
            </Card>
          </div>

          {/* Filters and Search */}
          <Card>
            <CardHeader>
              <CardTitle>{t('anomalyDetection.detectedAnomalies')}</CardTitle>
              <CardDescription>{t('anomalyDetection.analysisResults')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search and Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('anomalyDetection.searchPlaceholder')}
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
                    <SelectValue placeholder={t('common.severity')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('anomalyDetection.allSeverities')}</SelectItem>
                    <SelectItem value="critical">{t('anomalyDetection.severityCritical')}</SelectItem>
                    <SelectItem value="high">{t('anomalyDetection.severityHigh')}</SelectItem>
                    <SelectItem value="medium">{t('anomalyDetection.severityMedium')}</SelectItem>
                    <SelectItem value="low">{t('anomalyDetection.severityLow')}</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Status</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="investigating">Investigando</SelectItem>
                    <SelectItem value="resolved">Resolvido</SelectItem>
                    <SelectItem value="false_positive">Falso Positivo</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Tipos</SelectItem>
                    <SelectItem value="cost">Custo</SelectItem>
                    <SelectItem value="usage">Uso</SelectItem>
                    <SelectItem value="performance">Performance</SelectItem>
                    <SelectItem value="multi_dimensional">Multi-Dimensional</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Results count */}
              <div className="text-sm text-muted-foreground">
                {t('anomalyDetection.showing')} {startIndex + 1}-{Math.min(endIndex, filteredAnomalies.length)} {t('anomalyDetection.of')} {filteredAnomalies.length} {t('anomalyDetection.anomalies')}
              </div>

              {/* Anomalies List */}
              <div className="space-y-3">
                  {paginatedAnomalies.length > 0 ? (
                    <>
                      {paginatedAnomalies.map((anomaly: any) => (
                        <Card
                          key={anomaly.id}
                          className={`cursor-pointer transition-colors overflow-hidden ${
                            selectedAnomaly === anomaly.id ? 'ring-2 ring-primary' : ''
                          }`}
                          onClick={() => setSelectedAnomaly(anomaly.id)}
                        >
                          <CardContent className="p-4">
                            <div className="space-y-3">
                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {getTypeIcon(anomaly.detection_type)}
                                  <Badge variant="outline">{anomaly.detection_type}</Badge>
                                  <Badge className={getSeverityColor(anomaly.severity)}>{anomaly.severity}</Badge>
                                  <Badge variant="secondary">Score: {(anomaly.anomaly_score * 100).toFixed(0)}%</Badge>
                                </div>
                                <div className="flex gap-2 flex-shrink-0">
                                  <Button 
                                    variant="default" 
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      createTicket(anomaly);
                                    }}
                                    className="gap-1"
                                  >
                                    <FileText className="h-4 w-4" />
                                    {t('anomalyDetection.createTicket')}
                                  </Button>
                                  {anomaly.status === 'active' && (
                                    <Button variant="ghost" size="sm" onClick={(e) => {
                                      e.stopPropagation();
                                      acknowledgeAnomaly(anomaly.id);
                                    }}>
                                      <CheckCircle className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {anomaly.status === 'investigating' && (
                                    <>
                                      <Button variant="ghost" size="sm" onClick={(e) => {
                                        e.stopPropagation();
                                        resolveAnomaly(anomaly.id);
                                      }}>
                                        <CheckCircle className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          markFalsePositive(anomaly.id);
                                        }}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-1">
                                <p className="text-sm truncate">
                                  <span className="font-medium">Resource:</span> {anomaly.resource_type}
                                  {anomaly.resource_id && ` (${anomaly.resource_id})`}
                                </p>
                                {anomaly.metadata?.arn && (
                                  <div className="overflow-x-auto">
                                    <p className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                                      <span className="font-medium">ARN:</span> {anomaly.metadata.arn}
                                    </p>
                                  </div>
                                )}
                                <p className="text-sm">
                                  <span className="font-medium">Method:</span> {anomaly.detection_method}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Detected {formatDistanceToNow(new Date(anomaly.detected_at))} ago • Confidence:{' '}
                                  {(anomaly.confidence_level * 100).toFixed(0)}%
                                </p>
                              </div>

                              {anomaly.dimensions && (
                                <div className="p-2 bg-muted rounded-md overflow-x-auto">
                                  <p className="text-xs font-medium mb-1">Dimensions:</p>
                                  <pre className="text-xs whitespace-pre-wrap break-words">
                                    {JSON.stringify(anomaly.dimensions, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {anomaly.recommendations && anomaly.recommendations.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-xs font-medium">Recommendations:</p>
                                  <ul className="text-xs space-y-1">
                                    {anomaly.recommendations.map((rec: string, idx: number) => (
                                      <li key={idx} className="flex items-start gap-1">
                                        <span className="text-primary flex-shrink-0">•</span>
                                        <span className="break-words">{rec}</span>
                                      </li>
                                     ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="font-semibold text-lg">
                        {(anomalies?.length || 0) === 0 
                          ? 'Nenhuma anomalia detectada ainda' 
                          : 'Nenhuma anomalia encontrada com os filtros aplicados'}
                      </p>
                      {(anomalies?.length || 0) === 0 && (
                        <>
                          <p className="text-sm mt-2">
                            Execute uma detecção para identificar anomalias no seu ambiente AWS
                          </p>
                          <Button 
                            onClick={runDetection}
                            disabled={isExecuting}
                            className="mt-4"
                            size="lg"
                          >
                            {isExecuting ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Analisando...
                              </>
                            ) : (
                              'Executar Detecção Agora'
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>

              {/* Pagination Controls */}
              {filteredAnomalies.length > 0 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-muted-foreground">
                      Página {currentPage} de {totalPages}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {itemsPerPage} itens por página
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Anterior
                    </Button>
                    <div className="flex items-center gap-1 px-2">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(pageNum)}
                            className="w-8 h-8 p-0"
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Próxima
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
              </CardContent>
            </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="history">
          {organizationId && <AnomalyHistoryView organizationId={organizationId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
