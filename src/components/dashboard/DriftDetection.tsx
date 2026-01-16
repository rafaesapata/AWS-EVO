import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
import { format } from "date-fns";
import { GitBranch, AlertTriangle, CheckCircle2, XCircle, Clock, RefreshCw, Code2, History } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DriftDetection {
  id: string;
  resource_id: string;
  resource_type: string;
  resource_name: string | null;
  drift_type: string;
  severity: string;
  detected_at: string;
  expected_state: any;
  actual_state: any;
  diff: any;
  iac_source: string | null;
  iac_file_path: string | null;
  status: string;
  resolution_notes: string | null;
}

export default function DriftDetection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: organizationId } = useOrganization();
  const [drifts, setDrifts] = useState<DriftDetection[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedDrift, setSelectedDrift] = useState<DriftDetection | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  
  // CRITICAL: Get selected AWS account for multi-account isolation
  const { selectedAccountId } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();

  useEffect(() => {
    loadDrifts();
  }, [selectedAccountId]); // Re-load when account changes

  const loadDrifts = async () => {
    if (!organizationId) return;
    
    setLoading(true);
    try {
      // CRITICAL: Filter by selected account (multi-cloud compatible)
      const filters: any = { 
        organization_id: organizationId,
        ...getAccountFilter()
      };
      
      const response = await apiClient.select('drift_detections', {
        select: '*',
        eq: filters,
        order: { detected_at: 'desc' },
        limit: 50
      });
      
      if (response.error) throw new Error(response.error);
      setDrifts(response.data || []);
      // Removed auto-scan to prevent infinite loop - user must click Scan button
    } catch (error: any) {
      // Don't show error if it's just missing credentials
      if (!error.message.includes('AWS credentials')) {
        toast({
          title: t('common.error'),
          description: error.message,
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const scanForDrift = async () => {
    setScanning(true);
    try {
      toast({
        title: "Escaneando...",
        description: "Detectando alterações de infraestrutura vs IaC"
      });

      // Call real drift detection edge function
      const { data, error } = await apiClient.lambda('drift-detection');

      if (error) {
        throw error;
      }

      await loadDrifts();
      
      toast({
        title: t('common.success'),
        description: `Drift detection concluído. ${data?.drifts_detected || 0} drifts encontrados em ${data?.execution_time?.toFixed(2)}s`
      });
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setScanning(false);
    }
  };

  const updateDriftStatus = async (id: string, status: string) => {
    try {
      if (!organizationId) throw new Error('No organization');

      // SECURITY: Verify drift belongs to user's organization before updating
      const fetchResponse = await apiClient.select('drift_detections', {
        select: 'id',
        eq: { id, organization_id: organizationId },
        limit: 1
      });
      
      if (fetchResponse.error || !fetchResponse.data?.[0]) {
        throw new Error('Drift not found or access denied');
      }

      const updateResponse = await apiClient.update('drift_detections',
        { status },
        { eq: { id, organization_id: organizationId } }
      );
      
      if (updateResponse.error) throw new Error(updateResponse.error);

      toast({
        title: t('common.success'),
        description: `Drift marked as ${status}`
      });

      await loadDrifts();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const viewDetails = (drift: DriftDetection) => {
    setSelectedDrift(drift);
    setShowDetails(true);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const getDriftTypeIcon = (type: string) => {
    switch (type) {
      case 'manual_change': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'configuration_drift': return <GitBranch className="h-4 w-4 text-blue-500" />;
      case 'deleted': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'created': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  // Query for execution history
  const { data: historyData } = useQuery({
    queryKey: ['drift-detection-history', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      
      const response = await apiClient.select('drift_detection_history', {
        select: '*',
        eq: { organization_id: organizationId },
        order: { scan_date: 'desc' },
        limit: 10
      });
      
      if (response.error) throw new Error(response.error);
      return response.data || [];
    },
    enabled: !!organizationId,
  });

  const lastExecution = historyData?.[0];

  const openDrifts = drifts.filter(d => d.status === 'open').length;
  const criticalDrifts = drifts.filter(d => d.severity === 'critical' && d.status === 'open').length;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                {t('dashboard.driftDetection') || 'Infrastructure Drift Detection'}
              </CardTitle>
              <CardDescription>
                {t('dashboard.driftDescription') || 'Detect manual changes vs Infrastructure as Code'}
              </CardDescription>
            </div>
            <Button onClick={scanForDrift} disabled={scanning} size="sm">
              {scanning ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Code2 className="h-4 w-4 mr-2" />
                  Scan
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Total Drifts</div>
                  <div className="text-2xl font-semibold">{drifts.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Open Drifts</div>
                  <div className="text-2xl font-semibold text-yellow-600">{openDrifts}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Critical</div>
                  <div className="text-2xl font-semibold text-red-600">{criticalDrifts}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <History className="h-4 w-4" />
                    Última Execução
                  </div>
                  {lastExecution ? (
                    <div className="space-y-1">
                      <div className="text-lg font-semibold">
                        {format(new Date(lastExecution.scan_date), 'dd/MM/yyyy')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(lastExecution.scan_date), 'HH:mm:ss')} • {lastExecution.execution_time_seconds?.toFixed(2)}s
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Nenhum scan</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Drifts Table */}
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resource</TableHead>
                    <TableHead>Resource ID</TableHead>
                    <TableHead>Drift Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>IaC Source</TableHead>
                    <TableHead>Detected</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drifts.map((drift) => (
                    <TableRow key={drift.id}>
                      <TableCell>
                        <div className="font-medium">{drift.resource_name || 'N/A'}</div>
                        <div className="text-xs text-muted-foreground">{drift.resource_type}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-xs max-w-[180px]">
                          <div className="truncate" title={drift.resource_id}>
                            {drift.resource_id}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getDriftTypeIcon(drift.drift_type)}
                          <span className="capitalize">{drift.drift_type.replace('_', ' ')}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getSeverityColor(drift.severity)}>
                          {drift.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {drift.iac_source || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {new Date(drift.detected_at).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={drift.status === 'resolved' ? 'default' : 'secondary'}>
                          {drift.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => viewDetails(drift)}>
                            Details
                          </Button>
                          {drift.status === 'open' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateDriftStatus(drift.id, 'resolved')}
                            >
                              Resolve
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {drifts.length === 0 && !loading && (
              <div className="text-center py-12 text-muted-foreground">
                <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No drift detected. Click "Scan" to check for infrastructure changes.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Drift Details</DialogTitle>
            <DialogDescription>
              {selectedDrift?.resource_name || selectedDrift?.resource_id}
            </DialogDescription>
          </DialogHeader>
          {selectedDrift && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-semibold mb-2">Expected State</div>
                  <pre className="bg-secondary/20 p-3 rounded text-xs overflow-auto max-h-40">
                    {JSON.stringify(selectedDrift.expected_state, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="text-sm font-semibold mb-2">Actual State</div>
                  <pre className="bg-secondary/20 p-3 rounded text-xs overflow-auto max-h-40">
                    {JSON.stringify(selectedDrift.actual_state, null, 2)}
                  </pre>
                </div>
              </div>

              {selectedDrift.diff && (
                <div>
                  <div className="text-sm font-semibold mb-2">Changes</div>
                  <div className="bg-secondary/20 p-3 rounded text-sm space-y-1">
                    {selectedDrift.diff.changed?.length > 0 && (
                      <div>
                        <span className="text-yellow-600 font-semibold">Modified: </span>
                        {selectedDrift.diff.changed.join(', ')}
                      </div>
                    )}
                    {selectedDrift.diff.added?.length > 0 && (
                      <div>
                        <span className="text-green-600 font-semibold">Added: </span>
                        {selectedDrift.diff.added.join(', ')}
                      </div>
                    )}
                    {selectedDrift.diff.removed?.length > 0 && (
                      <div>
                        <span className="text-red-600 font-semibold">Removed: </span>
                        {selectedDrift.diff.removed.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedDrift.iac_file_path && (
                <div>
                  <div className="text-sm font-semibold mb-2">IaC File</div>
                  <code className="bg-secondary/20 p-2 rounded text-sm block">
                    {selectedDrift.iac_file_path}
                  </code>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}