import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, TrendingUp, DollarSign, Activity, RefreshCw } from "lucide-react";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useTVDashboard } from "@/contexts/TVDashboardContext";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { InfoTooltip, tooltipContent } from "@/components/ui/info-tooltip";

export default function AnomalyDetection() {
  const { toast } = useToast();
  const { isTVMode } = useTVDashboard();
  const queryClient = useQueryClient();
  const [isScanning, setIsScanning] = useState(false);
  
  // Use global account context for multi-account isolation
  const { selectedAccountId, isLoading: accountLoading } = useAwsAccount();
  const { data: organizationId } = useOrganization();

  const { data: anomalies, isLoading, refetch } = useQuery({
    queryKey: ['cost-anomalies', 'org', organizationId, 'account', selectedAccountId],
    // In TV mode, only require organizationId
    enabled: !!organizationId && (isTVMode || !!selectedAccountId),
    queryFn: async () => {
      let query = apiClient.select(tableName, {
        select: '*',
        eq: filters,
        order: { column: 'created_at', ascending: false }
      });
      
      // Only filter by account if not in TV mode
      if (!isTVMode && selectedAccountId) {
        const filters =  { aws_account_id: selectedAccountId };
      }
      
      const response = await apiClient.select(tableName, {
        eq: filters,
        order: { column: 'detected_at', ascending: false }
      });
      const data = response.data;
      const error = response.error;
      
      return data;
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const scanForAnomalies = async () => {
    setIsScanning(true);
    try {
      toast({
        title: "Iniciando detecção de anomalias...",
        description: "Analisando padrões de custo nos últimos 30 dias",
      });

      const { data, error } = await apiClient.lambda('anomaly-detection');

      

      await queryClient.invalidateQueries({ queryKey: ['cost-anomalies'] });
      
      toast({
        title: "Scan concluído!",
        description: `${data.anomalies_count} anomalias detectadas. ${data.critical_count} críticas.`,
      });
    } catch (error: any) {
      console.error('Erro ao detectar anomalias:', error);
      toast({
        title: "Erro ao executar scan",
        description: error.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-destructive text-destructive-foreground';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-white';
      default: return 'bg-blue-500 text-white';
    }
  };

  const getAnomalyIcon = (type: string) => {
    switch (type) {
      case 'spike': return TrendingUp;
      case 'unusual_pattern': return Activity;
      default: return DollarSign;
    }
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Carregando anomalias...</div>;
  }

  return (
    <div className="space-y-6">
      {!isTVMode && (
        <div className="flex justify-end mb-4">
          <Button onClick={scanForAnomalies} disabled={isScanning} size="sm">
            {isScanning ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Executando Scan...
              </>
            ) : (
              <>
                <Activity className="h-4 w-4 mr-2" />
                Detectar Anomalias de Custo
              </>
            )}
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              Anomalias Ativas
              <InfoTooltip title="O que são anomalias?">
                {tooltipContent.anomalyDetection}
              </InfoTooltip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{anomalies?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Críticas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {anomalies?.filter(a => a.severity === 'critical').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Custo Extra Detectado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${anomalies?.reduce((sum, a) => sum + (a.current_cost - a.baseline_cost), 0).toFixed(2) || '0'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Desvio Médio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {anomalies?.length ? (anomalies.reduce((sum, a) => sum + a.deviation_percentage, 0) / anomalies.length).toFixed(0) : 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Anomalias de Custo Detectadas (AI)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {anomalies?.map((anomaly) => {
              const Icon = getAnomalyIcon(anomaly.anomaly_type);
              return (
                <div key={anomaly.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3">
                      <Icon className="h-5 w-5 text-primary mt-1" />
                      <div>
                        <div className="font-semibold">{anomaly.service}</div>
                        {anomaly.resource_id && (
                          <div className="font-mono text-xs bg-muted px-2 py-1 rounded mt-1 inline-block">
                            {anomaly.resource_id}
                          </div>
                        )}
                        {!anomaly.resource_id && (
                          <div className="text-sm text-muted-foreground">Account-level anomaly</div>
                        )}
                      </div>
                    </div>
                    <Badge className={getSeverityColor(anomaly.severity)}>
                      {anomaly.severity}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Custo Base</div>
                      <div className="text-lg font-semibold">${anomaly.baseline_cost.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Custo Atual</div>
                      <div className="text-lg font-semibold text-destructive">${anomaly.current_cost.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Desvio</div>
                      <div className="text-lg font-semibold">+{anomaly.deviation_percentage.toFixed(1)}%</div>
                    </div>
                  </div>

                  {anomaly.details && typeof anomaly.details === 'object' && (anomaly.details as any).analysis && (
                    <div className="bg-muted/50 rounded p-3 mb-3 text-sm">
                      {(anomaly.details as any).analysis}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline">Investigar</Button>
                    <Button size="sm" variant="ghost">Marcar Falso Positivo</Button>
                  </div>
                </div>
              );
            })}

            {!anomalies?.length && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma anomalia detectada. Sistema monitorando continuamente.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
