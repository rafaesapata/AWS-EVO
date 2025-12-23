import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Shield, AlertTriangle, Activity, TrendingUp, RefreshCw, Users, Network } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrganization } from "@/hooks/useOrganization";
import VirtualTable from "@/components/dashboard/VirtualTable";
import { PageHeader } from "@/components/ui/page-header";
import { Layout } from "@/components/Layout";

export default function ThreatDetection() {
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const { data: organizationId } = useOrganization();

  const { data: guarddutyFindings, refetch: refetchGuardDuty } = useQuery({
    queryKey: ['guardduty-findings', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) throw new Error('No organization');

      const result = await apiClient.select('guardduty_findings', {
        select: '*',
        eq: { organization_id: organizationId },
        order: { severity: 'desc' },
        limit: 100
      });
      
      if (result.error) throw result.error;
      return result.data || [];
    },
  });

  const { data: iamBehavior } = useQuery({
    queryKey: ['iam-behavior', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) throw new Error('No organization');

      const result = await apiClient.select('iam_behavior_analysis', {
        select: '*',
        eq: { organization_id: organizationId },
        order: { risk_score: 'desc' },
        limit: 50
      });
      
      if (result.error) throw result.error;
      return result.data || [];
    },
  });

  const { data: lateralMovement } = useQuery({
    queryKey: ['lateral-movement', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) throw new Error('No organization');

      const result = await apiClient.select('lateral_movement_detections', {
        select: '*',
        eq: { organization_id: organizationId, status: 'active' },
        order: { detected_at: 'desc' }
      });
      
      if (result.error) throw result.error;
      return result.data || [];
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

    setScanning(true);
    try {
      // Use Lambda endpoint instead of REST to avoid CORS issues
      const result = await apiClient.invoke<any>('list-aws-credentials', {});
      
      if (result.error) throw result.error;

      // Handle both formats: direct array or wrapped in { success, data }
      let credentialsData: any[] = [];
      if (Array.isArray(result.data)) {
        credentialsData = result.data;
      } else if (result.data?.success && Array.isArray(result.data.data)) {
        credentialsData = result.data.data;
      } else {
        credentialsData = result.data?.data || [];
      }

      if (credentialsData.length === 0) {
        throw new Error('No active AWS credentials found. Please connect your AWS account first.');
      }

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
        accountId: credentialsData[0].id
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
    <div className="space-y-6">
      <PageHeader
        title="Threat Detection & Analysis"
        description="Advanced security threat detection powered by AI"
        icon={Shield}
        actions={
          <Button onClick={() => runScan('guardduty')} disabled={scanning}>
            <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? 'animate-spin' : ''}`} />
            Scan All
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Threats</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{criticalFindings}</div>
            <p className="text-xs text-muted-foreground">From GuardDuty</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Risk Users</CardTitle>
            <Users className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{highRiskUsers}</div>
            <p className="text-xs text-muted-foreground">Anomalous behavior detected</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lateral Movement</CardTitle>
            <Network className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeLateralMovements}</div>
            <p className="text-xs text-muted-foreground">Active detections</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="guardduty" className="w-full">
        <TabsList>
          <TabsTrigger value="guardduty">GuardDuty Findings</TabsTrigger>
          <TabsTrigger value="iam">IAM Behavior</TabsTrigger>
          <TabsTrigger value="lateral">Lateral Movement</TabsTrigger>
        </TabsList>

        <TabsContent value="guardduty" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>GuardDuty Security Findings</CardTitle>
                <Button size="sm" onClick={() => runScan('guardduty')} disabled={scanning}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? 'animate-spin' : ''}`} />
                  Scan
                </Button>
              </div>
              <CardDescription>AWS GuardDuty threat intelligence findings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {guarddutyFindings?.map((finding) => (
                  <div key={finding.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">{finding.title}</h4>
                      <Badge variant={
                        finding.severity_label === 'Critical' ? 'destructive' :
                        finding.severity_label === 'High' ? 'default' : 'secondary'
                      }>
                        {finding.severity_label} ({finding.severity})
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{finding.description}</p>
                    <div className="flex gap-2 text-xs">
                      <Badge variant="outline">{finding.finding_type}</Badge>
                      <Badge variant="outline">{finding.region}</Badge>
                      {finding.resource_type && <Badge variant="outline">{finding.resource_type}</Badge>}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>First seen: {new Date(finding.first_seen).toLocaleString()}</span>
                      <span>Count: {finding.count}</span>
                    </div>
                  </div>
                ))}
                {(!guarddutyFindings || guarddutyFindings.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    No GuardDuty findings. Run a scan to detect threats.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="iam" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>IAM Behavior Analysis</CardTitle>
                <Button size="sm" onClick={() => runScan('iam')} disabled={scanning}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? 'animate-spin' : ''}`} />
                  Analyze
                </Button>
              </div>
              <CardDescription>ML-powered behavioral analysis of IAM users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {iamBehavior?.map((user) => (
                  <div key={user.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">{user.user_identity}</h4>
                      <div className="flex items-center gap-2">
                        <Badge variant={user.risk_score >= 70 ? 'destructive' : user.risk_score >= 40 ? 'default' : 'secondary'}>
                          Risk: {user.risk_score}/100
                        </Badge>
                        <Badge variant="outline">{user.user_type}</Badge>
                      </div>
                    </div>
                    {user.anomalous_actions && Array.isArray(user.anomalous_actions) && user.anomalous_actions.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Anomalous Actions:</p>
                        {(user.anomalous_actions as any[]).slice(0, 3).map((action: any, i: number) => (
                          <div key={i} className="text-sm pl-4 border-l-2 border-warning">
                            <span className="font-medium">{action.action}</span>: {action.reason}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Last analyzed: {new Date(user.last_analyzed).toLocaleString()}
                    </div>
                  </div>
                ))}
                {(!iamBehavior || iamBehavior.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    No IAM behavior data. Run analysis to detect anomalies.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lateral" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Lateral Movement Detection</CardTitle>
                <Button size="sm" onClick={() => runScan('lateral')} disabled={scanning}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? 'animate-spin' : ''}`} />
                  Detect
                </Button>
              </div>
              <CardDescription>AI-powered detection of lateral movement attacks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {lateralMovement?.map((detection) => (
                  <div key={detection.id} className="border rounded-lg p-4 space-y-2 border-l-4 border-l-destructive">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">{detection.source_identity}</h4>
                      <Badge variant="destructive">{detection.severity.toUpperCase()}</Badge>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm"><span className="font-medium">Pattern:</span> {detection.movement_pattern.replace(/_/g, ' ')}</p>
                      <p className="text-sm"><span className="font-medium">Confidence:</span> {(detection.detection_confidence * 100).toFixed(0)}%</p>
                      {detection.target_resources && Array.isArray(detection.target_resources) && detection.target_resources.length > 0 && (
                        <p className="text-sm"><span className="font-medium">Targets:</span> {(detection.target_resources as string[]).join(', ')}</p>
                      )}
                    </div>
                    {detection.indicators && Array.isArray(detection.indicators) && detection.indicators.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium">Indicators:</p>
                        <ul className="text-xs pl-4 space-y-1">
                          {(detection.indicators as string[]).map((indicator: string, i: number) => (
                            <li key={i} className="list-disc">{indicator}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Detected: {new Date(detection.detected_at).toLocaleString()}
                    </div>
                  </div>
                ))}
                {(!lateralMovement || lateralMovement.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    No lateral movement detected. System is monitoring...
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}