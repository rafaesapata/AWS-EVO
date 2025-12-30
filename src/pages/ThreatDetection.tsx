import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/aws/api-client";
import { Shield, AlertTriangle, RefreshCw, Users, Network } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrganization } from "@/hooks/useOrganization";
import { Layout } from "@/components/Layout";
import { useAwsAccount } from "@/contexts/AwsAccountContext";

interface GuardDutyFinding {
  id: string;
  title: string;
  description: string;
  severity: number;
  severity_label: string;
  finding_type: string;
  region: string;
  resource_type?: string;
  first_seen: string;
  count: number;
}

interface IAMBehavior {
  id: string;
  user_identity: string;
  user_type: string;
  risk_score: number;
  anomalous_actions?: any[];
  last_analyzed: string;
}

interface LateralMovement {
  id: string;
  source_identity: string;
  severity: string;
  movement_pattern: string;
  detection_confidence: number;
  target_resources?: string[];
  indicators?: string[];
  detected_at: string;
}

export default function ThreatDetection() {
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const { data: organizationId } = useOrganization();
  // Use centralized AWS account context instead of direct API call
  const { accounts: awsAccounts } = useAwsAccount();

  const { data: guarddutyFindings, refetch: refetchGuardDuty } = useQuery<GuardDutyFinding[]>({
    queryKey: ['guardduty-findings', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) throw new Error('No organization');

      const result = await apiClient.select('guardduty_findings', {
        select: '*',
        eq: { organization_id: organizationId },
        order: { column: 'severity', ascending: false },
        limit: 100
      });
      
      if (result.error) throw result.error;
      return (result.data || []) as GuardDutyFinding[];
    },
  });

  const { data: iamBehavior } = useQuery<IAMBehavior[]>({
    queryKey: ['iam-behavior', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) throw new Error('No organization');

      const result = await apiClient.select('iam_behavior_analysis', {
        select: '*',
        eq: { organization_id: organizationId },
        order: { column: 'risk_score', ascending: false },
        limit: 50
      });
      
      if (result.error) throw result.error;
      return (result.data || []) as IAMBehavior[];
    },
  });

  const { data: lateralMovement } = useQuery<LateralMovement[]>({
    queryKey: ['lateral-movement', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) throw new Error('No organization');

      const result = await apiClient.select('lateral_movement_detections', {
        select: '*',
        eq: { organization_id: organizationId, status: 'active' },
        order: { column: 'detected_at', ascending: false }
      });
      
      if (result.error) throw result.error;
      return (result.data || []) as LateralMovement[];
    },
  });

  const runScan = async (scanType: string) => {
    if (!organizationId) {
      toast({
        title: "No organization",
        description: "Please ensure you're part of an organization",
        variant: "destructive",
      });
      return;
    }

    // Use centralized AWS accounts from context
    if (!awsAccounts || awsAccounts.length === 0) {
      toast({
        title: "No AWS credentials",
        description: "No active AWS credentials found. Please connect your AWS account first.",
        variant: "destructive",
      });
      return;
    }

    setScanning(true);
    try {
      let functionName = '';
      switch (scanType) {
        case 'guardduty':
          functionName = 'guardduty-scan';
          break;
        case 'iam':
          functionName = 'iam-behavior-analysis';
          break;
        case 'lateral':
          functionName = 'lateral-movement-detection';
          break;
      }

      const scanResult = await apiClient.invoke(functionName, {
        body: { accountId: awsAccounts[0].id }
      });

      if (scanResult.error) throw scanResult.error;

      toast({
        title: "Scan completed",
        description: `${scanType} scan finished successfully`,
      });

      refetchGuardDuty();
    } catch (error: any) {
      toast({
        title: "Scan failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  const criticalFindings = guarddutyFindings?.filter(f => f.severity_label === 'Critical').length || 0;
  const highRiskUsers = iamBehavior?.filter(u => u.risk_score >= 70).length || 0;
  const activeLateralMovements = lateralMovement?.length || 0;

  return (
    <Layout 
      title="Detecção de Ameaças" 
      description="Detecção avançada de ameaças de segurança com IA"
      icon={<Shield className="h-7 w-7 text-white" />}
    >
      <div className="space-y-6">
        {/* Header Card */}
        <Card className="glass border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-6 w-6 text-primary icon-pulse" />
                  Detecção de Ameaças
                </CardTitle>
                <CardDescription>
                  Análise de ameaças com GuardDuty, comportamento IAM e movimentação lateral
                </CardDescription>
              </div>
              <Button onClick={() => runScan('guardduty')} disabled={scanning} className="glass hover-glow btn-press">
                <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? 'animate-spin' : ''}`} />
                Escanear Tudo
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-stagger">
          <Card className="glass border-primary/20 card-hover-lift">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ameaças Críticas</CardTitle>
              <AlertTriangle className={`h-4 w-4 text-destructive ${criticalFindings > 0 ? 'icon-pulse' : ''}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold tabular-nums ${criticalFindings > 0 ? 'text-red-500' : ''}`}>{criticalFindings}</div>
              <p className="text-xs text-muted-foreground">Do GuardDuty</p>
            </CardContent>
          </Card>

          <Card className="glass border-primary/20 card-hover-lift">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Usuários de Alto Risco</CardTitle>
              <Users className={`h-4 w-4 text-yellow-500 ${highRiskUsers > 0 ? 'icon-pulse' : ''}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold tabular-nums ${highRiskUsers > 0 ? 'text-yellow-500' : ''}`}>{highRiskUsers}</div>
              <p className="text-xs text-muted-foreground">Comportamento anômalo detectado</p>
            </CardContent>
          </Card>

          <Card className="glass border-primary/20 card-hover-lift">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Movimentação Lateral</CardTitle>
              <Network className={`h-4 w-4 text-primary ${activeLateralMovements > 0 ? 'icon-pulse' : ''}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold tabular-nums ${activeLateralMovements > 0 ? 'text-orange-500' : ''}`}>{activeLateralMovements}</div>
              <p className="text-xs text-muted-foreground">Detecções ativas</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="guardduty" className="w-full">
          <TabsList className="glass">
            <TabsTrigger value="guardduty">GuardDuty</TabsTrigger>
            <TabsTrigger value="iam">Comportamento IAM</TabsTrigger>
            <TabsTrigger value="lateral">Movimentação Lateral</TabsTrigger>
          </TabsList>

          <TabsContent value="guardduty" className="space-y-4">
            <Card className="glass border-primary/20 card-shine">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary icon-bounce" />
                      Achados do GuardDuty
                    </CardTitle>
                    <CardDescription>Inteligência de ameaças do AWS GuardDuty</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => runScan('guardduty')} disabled={scanning} className="glass hover-glow btn-press">
                    <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? 'animate-spin' : ''}`} />
                    Escanear
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 animate-stagger">
                  {guarddutyFindings?.map((finding) => (
                    <div key={finding.id} className="border rounded-lg p-4 space-y-2 transition-all hover:translate-x-1 hover:bg-muted/30">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold">{finding.title}</h4>
                        <Badge 
                          variant={finding.severity_label === 'Critical' ? 'destructive' : finding.severity_label === 'High' ? 'default' : 'secondary'}
                          className={finding.severity_label === 'Critical' ? 'alert-pulse' : ''}
                        >
                          {finding.severity_label} (<span className="tabular-nums">{finding.severity}</span>)
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{finding.description}</p>
                      <div className="flex gap-2 text-xs flex-wrap">
                        <Badge variant="outline">{finding.finding_type}</Badge>
                        <Badge variant="outline">{finding.region}</Badge>
                        {finding.resource_type && <Badge variant="outline">{finding.resource_type}</Badge>}
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Primeira vez: {new Date(finding.first_seen).toLocaleString('pt-BR')}</span>
                        <span className="tabular-nums">Contagem: {finding.count}</span>
                      </div>
                    </div>
                  ))}
                  {(!guarddutyFindings || guarddutyFindings.length === 0) && (
                    <div className="text-center py-12">
                      <Shield className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-20" />
                      <h3 className="text-lg font-semibold mb-2">Nenhum achado do GuardDuty</h3>
                      <p className="text-muted-foreground">Execute um scan para detectar ameaças.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="iam" className="space-y-4">
            <Card className="glass border-primary/20 card-shine">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary icon-bounce" />
                      Análise de Comportamento IAM
                    </CardTitle>
                    <CardDescription>Análise comportamental de usuários IAM com ML</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => runScan('iam')} disabled={scanning} className="glass hover-glow btn-press">
                    <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? 'animate-spin' : ''}`} />
                    Analisar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 animate-stagger">
                  {iamBehavior?.map((user) => (
                    <div key={user.id} className="border rounded-lg p-4 space-y-2 transition-all hover:translate-x-1 hover:bg-muted/30">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold">{user.user_identity}</h4>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={user.risk_score >= 70 ? 'destructive' : user.risk_score >= 40 ? 'default' : 'secondary'}
                            className={user.risk_score >= 70 ? 'alert-pulse' : ''}
                          >
                            Risco: <span className="tabular-nums">{user.risk_score}/100</span>
                          </Badge>
                          <Badge variant="outline">{user.user_type}</Badge>
                        </div>
                      </div>
                      {user.anomalous_actions && Array.isArray(user.anomalous_actions) && user.anomalous_actions.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Ações Anômalas:</p>
                          {(user.anomalous_actions as any[]).slice(0, 3).map((action: any, i: number) => (
                            <div key={i} className="text-sm pl-4 border-l-2 border-yellow-500">
                              <span className="font-medium">{action.action}</span>: {action.reason}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Última análise: {new Date(user.last_analyzed).toLocaleString('pt-BR')}
                      </div>
                    </div>
                  ))}
                  {(!iamBehavior || iamBehavior.length === 0) && (
                    <div className="text-center py-12">
                      <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-20" />
                      <h3 className="text-lg font-semibold mb-2">Nenhum dado de comportamento IAM</h3>
                      <p className="text-muted-foreground">Execute uma análise para detectar anomalias.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lateral" className="space-y-4">
            <Card className="glass border-primary/20 card-shine">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Network className="h-5 w-5 text-primary icon-bounce" />
                      Detecção de Movimentação Lateral
                    </CardTitle>
                    <CardDescription>Detecção de ataques de movimentação lateral com IA</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => runScan('lateral')} disabled={scanning} className="glass hover-glow btn-press">
                    <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? 'animate-spin' : ''}`} />
                    Detectar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 animate-stagger">
                  {lateralMovement?.map((detection) => (
                    <div key={detection.id} className="border rounded-lg p-4 space-y-2 border-l-4 border-l-destructive transition-all hover:translate-x-1 hover:bg-muted/30">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold">{detection.source_identity}</h4>
                        <Badge variant="destructive" className="alert-pulse">{detection.severity.toUpperCase()}</Badge>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm"><span className="font-medium">Padrão:</span> {detection.movement_pattern.replace(/_/g, ' ')}</p>
                        <p className="text-sm"><span className="font-medium">Confiança:</span> <span className="tabular-nums">{(detection.detection_confidence * 100).toFixed(0)}%</span></p>
                        {detection.target_resources && Array.isArray(detection.target_resources) && detection.target_resources.length > 0 && (
                          <p className="text-sm"><span className="font-medium">Alvos:</span> {(detection.target_resources as string[]).join(', ')}</p>
                        )}
                      </div>
                      {detection.indicators && Array.isArray(detection.indicators) && detection.indicators.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium">Indicadores:</p>
                          <ul className="text-xs pl-4 space-y-1">
                            {(detection.indicators as string[]).map((indicator: string, i: number) => (
                              <li key={i} className="list-disc">{indicator}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Detectado: {new Date(detection.detected_at).toLocaleString('pt-BR')}
                      </div>
                    </div>
                  ))}
                  {(!lateralMovement || lateralMovement.length === 0) && (
                    <div className="text-center py-12">
                      <Network className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-20" />
                      <h3 className="text-lg font-semibold mb-2">Nenhuma movimentação lateral detectada</h3>
                      <p className="text-muted-foreground">O sistema está monitorando...</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}