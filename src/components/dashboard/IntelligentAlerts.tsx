import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, Bell, Settings, RefreshCw, AlertTriangle, DollarSign, Shield, Zap, TrendingUp, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useOrganizationId } from "@/hooks/useOrganizationId";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { InfoTooltip, tooltipContent } from "@/components/ui/info-tooltip";

interface AlertConfig {
  id: string;
  alert_type: string;
  threshold_value: number;
  threshold_unit: string;
  is_enabled: boolean;
}

export function IntelligentAlerts() {
  const { t } = useTranslation();
  const organizationId = useOrganizationId();
  const queryClient = useQueryClient();
  const [editingConfig, setEditingConfig] = useState<AlertConfig | null>(null);
  
  // CRITICAL: Get selected AWS account for multi-account isolation
  const { selectedAccountId } = useCloudAccount();

  const { data: alertConfigs = [] } = useQuery({
    queryKey: ['alert-configs', organizationId, selectedAccountId],
    queryFn: async () => {
      const response = await apiClient.select('alert_configurations', { 
        eq: { organization_id: organizationId } 
      });
      if (response.error) throw response.error;
      return response.data as AlertConfig[];
    },
    enabled: !!organizationId,
  });

  const { data: recentAlerts = [] } = useQuery({
    queryKey: ['recent-alerts', organizationId, selectedAccountId],
    queryFn: async () => {
      const response = await apiClient.select('intelligent_alerts', { 
        eq: { organization_id: organizationId },
        order: { column: 'created_at', ascending: false },
        limit: 20
      });
      if (response.error) throw response.error;
      
      // Filter by account on client-side if needed (column may not exist)
      if (selectedAccountId && response.data) {
        return response.data.filter((alert: any) => 
          !alert.aws_account_id || alert.aws_account_id === selectedAccountId
        );
      }
      
      return response.data;
    },
    enabled: !!organizationId,
  });

  const updateConfigMutation = useMutation({
    mutationFn: async ({ id, is_enabled, threshold_value }: { id: string; is_enabled?: boolean; threshold_value?: number }) => {
      if (!organizationId) throw new Error('No organization');
      
      const updates: any = { updated_at: new Date().toISOString() };
      if (is_enabled !== undefined) updates.is_enabled = is_enabled;
      if (threshold_value !== undefined) updates.threshold_value = threshold_value;

      // Security: Only update if config belongs to user's organization
      const response = await apiClient.update('alert_configurations', updates, { 
        id, 
        organization_id: organizationId 
      });
      if (response.error) throw response.error;
    },
    onSuccess: () => {
      toast.success(t('intelligentAlerts.configUpdated'));
      queryClient.invalidateQueries({ queryKey: ['alert-configs'] });
      setEditingConfig(null);
    },
    onError: (error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    }
  });

  const triggerCheckMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await apiClient.lambda('intelligent-alerts-analyzer');
      
      return data;
    },
    onSuccess: (data: any) => {
      const alertsCreated = data?.alerts_created || 0;
      if (alertsCreated > 0) {
        toast.success(`${t('intelligentAlerts.analysisCompleted')}: ${alertsCreated} ${t('intelligentAlerts.newAlertsGenerated')}`);
      } else {
        toast.info(t('intelligentAlerts.noProblemsDetected'), {
          description: t('intelligentAlerts.infraOperatingNormally')
        });
      }
      queryClient.invalidateQueries({ queryKey: ['recent-alerts'] });
    },
    onError: (error: Error) => {
      toast.error(t('intelligentAlerts.analysisError'), {
        description: error.message
      });
    }
  });

  const getAlertTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      cost_spike: t('intelligentAlerts.costSpike'),
      security_critical: t('intelligentAlerts.securityCritical'),
      waste_detected: t('intelligentAlerts.wasteDetected'),
      compliance_violation: t('intelligentAlerts.complianceViolation'),
      correlated_incident: t('intelligentAlerts.correlatedIncident'),
      job_failure_rate: t('intelligentAlerts.jobFailureRate'),
      dlq_growth: t('intelligentAlerts.dlqGrowth'),
      health_degraded: t('intelligentAlerts.healthDegraded'),
      high_error_rate: t('intelligentAlerts.highErrorRate'),
    };
    return labels[type] || type;
  };

  const getAlertIcon = (type: string) => {
    const icons: Record<string, any> = {
      cost_spike: TrendingUp,
      security_critical: Shield,
      waste_detected: DollarSign,
      compliance_violation: AlertTriangle,
      correlated_incident: Zap,
    };
    const Icon = icons[type] || Bell;
    return <Icon className="h-4 w-4" />;
  };

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, any> = {
      critical: "destructive",
      high: "default",
      warning: "secondary",
      info: "outline"
    };
    return <Badge variant={variants[severity] || "outline"}>{severity}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">{t('intelligentAlerts.title')}</h2>
          <p className="text-muted-foreground">
            {t('intelligentAlerts.description')}
          </p>
        </div>
        <Button
          onClick={() => triggerCheckMutation.mutate()}
          disabled={triggerCheckMutation.isPending}
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${triggerCheckMutation.isPending ? 'animate-spin' : ''}`} />
          {t('intelligentAlerts.analyzeNow')}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {t('intelligentAlerts.alertConfigurations')}
            </CardTitle>
            <CardDescription>
              {t('intelligentAlerts.configureThresholds')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {alertConfigs.map((config) => (
                  <Card key={config.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-1">
                            <Label className="font-medium">
                              {getAlertTypeLabel(config.alert_type)}
                            </Label>
                            <InfoTooltip title="O que este alerta detecta?" side="right">
                              <p className="text-muted-foreground">
                                {tooltipContent.alertTypes[config.alert_type as keyof typeof tooltipContent.alertTypes] || 
                                  "Alerta configurável para monitorar métricas específicas do sistema."}
                              </p>
                            </InfoTooltip>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Limite: {config.threshold_value} {config.threshold_unit}
                          </p>
                        </div>
                        <Switch
                          checked={config.is_enabled}
                          onCheckedChange={(checked) =>
                            updateConfigMutation.mutate({ id: config.id, is_enabled: checked })
                          }
                        />
                      </div>
                      
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingConfig(config)}
                            className="w-full"
                          >
                            <Settings className="h-4 w-4 mr-2" />
                            Configurar Limite
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Configurar {getAlertTypeLabel(config.alert_type)}</DialogTitle>
                            <DialogDescription>
                              Ajuste o valor do limite para este alerta
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="threshold">
                                Valor do Limite ({config.threshold_unit})
                              </Label>
                              <Input
                                id="threshold"
                                type="number"
                                defaultValue={config.threshold_value}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value);
                                  if (!isNaN(value)) {
                                    setEditingConfig({ ...config, threshold_value: value });
                                  }
                                }}
                                className="mt-1"
                              />
                            </div>
                            <Button
                              onClick={() => {
                                if (editingConfig) {
                                  updateConfigMutation.mutate({
                                    id: editingConfig.id,
                                    threshold_value: editingConfig.threshold_value
                                  });
                                }
                              }}
                              disabled={updateConfigMutation.isPending}
                              className="w-full"
                            >
                              Salvar
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Alertas Recentes
            </CardTitle>
            <CardDescription>
              Últimos alertas gerados automaticamente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              {recentAlerts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p>Nenhum alerta recente</p>
                  <p className="text-sm mt-1">Infraestrutura AWS operando normalmente</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentAlerts.map((alert: any) => {
                    const metadata = alert.metadata || {};
                    const borderColor = alert.severity === 'critical' ? 'border-l-destructive' : 
                                       alert.severity === 'high' ? 'border-l-orange-500' : 
                                       'border-l-yellow-500';
                    
                    return (
                      <Card key={alert.id} className={`border-l-4 ${borderColor}`}>
                        <CardContent className="pt-4 space-y-3">
                          {/* Header */}
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-2 flex-1">
                              {getAlertIcon(alert.alert_type)}
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-semibold text-sm">{alert.title}</h4>
                                  {getSeverityBadge(alert.severity)}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {alert.message}
                                </p>
                              </div>
                            </div>
                            <Badge variant="outline" className="ml-2">
                              {getAlertTypeLabel(alert.alert_type)}
                            </Badge>
                          </div>

                          {/* Financial Impact */}
                          {metadata.financial_impact && (
                            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded text-xs">
                              <DollarSign className="h-3 w-3 text-green-600" />
                              <span className="font-medium">Impacto Financeiro:</span>
                              <span className="text-muted-foreground">{metadata.financial_impact}</span>
                            </div>
                          )}

                          {/* Affected Resources */}
                          {metadata.affected_resources && metadata.affected_resources.length > 0 && (
                            <>
                              <Separator />
                              <div>
                                <p className="text-xs font-medium mb-2">Recursos Afetados:</p>
                                <div className="flex flex-wrap gap-1">
                                  {metadata.affected_resources.slice(0, 3).map((resource: string, idx: number) => (
                                    <Badge key={idx} variant="secondary" className="text-xs font-mono">
                                      {resource.length > 20 ? resource.slice(0, 20) + '...' : resource}
                                    </Badge>
                                  ))}
                                  {metadata.affected_resources.length > 3 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{metadata.affected_resources.length - 3} mais
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </>
                          )}

                          {/* AI Insights */}
                          {metadata.ai_insights && (
                            <>
                              <Separator />
                              <div className="p-2 bg-primary/5 rounded border border-primary/20">
                                <p className="text-xs font-medium flex items-center gap-1 mb-1">
                                  <Zap className="h-3 w-3" />
                                  Análise IA:
                                </p>
                                <p className="text-xs text-muted-foreground">{metadata.ai_insights}</p>
                              </div>
                            </>
                          )}

                          {/* Recommended Actions */}
                          {metadata.recommended_actions && metadata.recommended_actions.length > 0 && (
                            <>
                              <Separator />
                              <div>
                                <p className="text-xs font-medium mb-2">Ações Recomendadas:</p>
                                <ul className="space-y-1">
                                  {metadata.recommended_actions.slice(0, 3).map((action: string, idx: number) => (
                                    <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1">
                                      <span className="text-primary mt-0.5">•</span>
                                      <span>{action}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </>
                          )}

                          {/* Correlated Events */}
                          {metadata.correlated_events && metadata.correlated_events.length > 0 && (
                            <>
                              <Separator />
                              <div>
                                <p className="text-xs font-medium mb-2">Eventos Correlacionados:</p>
                                <div className="space-y-1">
                                  {metadata.correlated_events.map((event: string, idx: number) => (
                                    <div key={idx} className="text-xs text-muted-foreground flex items-start gap-1">
                                      <span className="text-muted-foreground/50">→</span>
                                      <span>{event}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}

                          {/* Footer */}
                          <Separator />
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{new Date(alert.created_at).toLocaleString('pt-BR')}</span>
                            {alert.action_url && (
                              <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                                <a href={alert.action_url} target="_blank" rel="noopener noreferrer">
                                  Ver Detalhes
                                  <ExternalLink className="h-3 w-3 ml-1" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
