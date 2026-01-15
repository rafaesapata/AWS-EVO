import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { 
  Shield, 
  ShieldCheck,
  Settings,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Info,
  ExternalLink,
  RefreshCw,
  Trash2,
  Stethoscope,
  XCircle
} from "lucide-react";

interface WafConfig {
  id: string;
  webAclArn: string;
  webAclName: string;
  filterMode: string;
  isActive: boolean;
  lastEventAt: string | null;
  eventsToday: number;
  blockedToday: number;
}

interface DiagnosticCheck {
  name: string;
  status: 'success' | 'warning' | 'error';
  message: string;
  details?: any;
  recommendation?: string;
}

interface DiagnosticResult {
  configId: string;
  webAclName: string;
  webAclArn: string;
  region: string;
  awsAccountId: string;
  overallStatus: 'success' | 'warning' | 'error' | 'unknown';
  checks: DiagnosticCheck[];
}

interface WafSetupPanelProps {
  onSetupComplete?: () => void;
}

export function WafSetupPanel({ onSetupComplete }: WafSetupPanelProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedAccountId, accounts } = useCloudAccount();
  
  const [webAclArn, setWebAclArn] = useState("");
  const [filterMode, setFilterMode] = useState<string>("block_only");
  const [isScanning, setIsScanning] = useState(false);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);

  // Fetch existing WAF configurations
  const { data: configsData, isLoading: configsLoading, refetch: refetchConfigs } = useQuery({
    queryKey: ['waf-configs', selectedAccountId],
    enabled: !!selectedAccountId,
    queryFn: async () => {
      const response = await apiClient.invoke<{ configs: WafConfig[] }>('waf-dashboard-api', {
        body: { action: 'get-configs', accountId: selectedAccountId }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
  });

  // Fetch available WAFs from customer account
  const { data: availableWafs, isLoading: wafsLoading, refetch: refetchWafs } = useQuery({
    queryKey: ['available-wafs', selectedAccountId],
    enabled: !!selectedAccountId && isScanning,
    queryFn: async () => {
      const response = await apiClient.invoke<{ webAcls: any[] }>('waf-setup-monitoring', {
        body: { action: 'list-wafs', accountId: selectedAccountId }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
  });

  // Setup WAF monitoring mutation
  const setupMutation = useMutation({
    mutationFn: async (data: { webAclArn: string; filterMode: string }) => {
      const response = await apiClient.invoke('waf-setup-monitoring', {
        body: { 
          action: 'setup',
          accountId: selectedAccountId,
          webAclArn: data.webAclArn,
          filterMode: data.filterMode
        }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
    onSuccess: () => {
      toast({ 
        title: t('waf.setupSuccess'), 
        description: t('waf.setupSuccessDesc') 
      });
      queryClient.invalidateQueries({ queryKey: ['waf-configs'] });
      queryClient.invalidateQueries({ queryKey: ['waf-metrics'] });
      setWebAclArn("");
      onSetupComplete?.();
    },
    onError: (error) => {
      toast({ 
        title: t('common.error'), 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Disable WAF monitoring mutation
  const disableMutation = useMutation({
    mutationFn: async (configId: string) => {
      const response = await apiClient.invoke('waf-setup-monitoring', {
        body: { 
          action: 'disable',
          accountId: selectedAccountId,
          configId
        }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
    onSuccess: () => {
      toast({ 
        title: t('waf.monitoringDisabled'), 
        description: t('waf.monitoringDisabledDesc') 
      });
      queryClient.invalidateQueries({ queryKey: ['waf-configs'] });
    },
    onError: (error) => {
      toast({ 
        title: t('common.error'), 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Diagnose WAF monitoring mutation
  const diagnoseMutation = useMutation({
    mutationFn: async (configId: string) => {
      const response = await apiClient.invoke<DiagnosticResult>('waf-dashboard-api', {
        body: { 
          action: 'diagnose',
          configId
        }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
    onSuccess: (data) => {
      if (data) {
        setDiagnosticResult(data);
        setDiagnosticOpen(true);
      }
    },
    onError: (error) => {
      toast({ 
        title: t('common.error'), 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const handleDiagnose = (configId: string) => {
    diagnoseMutation.mutate(configId);
  };

  // Fix subscription filter mutation
  const fixSubscriptionMutation = useMutation({
    mutationFn: async (configId: string) => {
      const response = await apiClient.invoke<{ success: boolean; message: string; filterName?: string }>('waf-dashboard-api', {
        body: { 
          action: 'fix-subscription',
          configId
        }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
    onSuccess: (data) => {
      toast({ 
        title: t('waf.subscriptionFixed', 'Subscription Fixed'),
        description: data?.message || t('waf.subscriptionFixedDesc', 'EVO subscription filter created successfully. Events will start flowing within 1-2 minutes.'),
      });
      queryClient.invalidateQueries({ queryKey: ['waf-configs'] });
      setDiagnosticOpen(false);
    },
    onError: (error) => {
      toast({ 
        title: t('common.error'), 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const handleScanWafs = () => {
    setIsScanning(true);
    refetchWafs();
  };

  const handleSetup = () => {
    if (!webAclArn) {
      toast({ 
        title: t('common.error'), 
        description: t('waf.selectWaf'), 
        variant: "destructive" 
      });
      return;
    }
    setupMutation.mutate({ webAclArn, filterMode });
  };

  const configs = configsData?.configs || [];
  const wafs = availableWafs?.webAcls || [];
  const hasConfigs = configs.length > 0;

  if (!selectedAccountId) {
    return (
      <Card className="glass border-yellow-500/30">
        <CardContent className="pt-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t('waf.noAccountSelected')}</AlertTitle>
            <AlertDescription>
              {t('waf.selectAccountFirst')}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Existing Configurations */}
      {hasConfigs && (
        <Card className="glass border-green-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-500" />
              {t('waf.activeMonitoring')}
            </CardTitle>
            <CardDescription>
              {t('waf.activeMonitoringDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {configs.map((config) => (
              <div 
                key={config.id} 
                className="flex items-center justify-between p-4 rounded-lg bg-background/50 border"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{config.webAclName}</span>
                    <Badge variant={config.isActive ? "default" : "secondary"}>
                      {config.isActive ? t('common.active') : t('common.inactive')}
                    </Badge>
                    <Badge variant="outline">{config.filterMode}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate max-w-md">
                    {config.webAclArn}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{t('waf.eventsToday')}: {config.eventsToday}</span>
                    <span>{t('waf.blockedToday')}: {config.blockedToday}</span>
                    {config.lastEventAt && (
                      <span>{t('waf.lastEvent')}: {new Date(config.lastEventAt).toLocaleString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDiagnose(config.id)}
                    disabled={diagnoseMutation.isPending}
                    title={t('waf.diagnose', 'Diagnose')}
                  >
                    {diagnoseMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <Stethoscope className="h-4 w-4 text-primary" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => disableMutation.mutate(config.id)}
                    disabled={disableMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Setup New WAF */}
      <Card className="glass border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            {hasConfigs ? t('waf.addAnotherWaf') : t('waf.setupMonitoring')}
          </CardTitle>
          <CardDescription>
            {t('waf.setupDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Info Alert */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>{t('waf.howItWorks')}</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{t('waf.howItWorksDesc')}</p>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>{t('waf.step1')}</li>
                <li>{t('waf.step2')}</li>
                <li>{t('waf.step3')}</li>
              </ol>
            </AlertDescription>
          </Alert>

          <Separator />

          {/* Scan for WAFs */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>{t('waf.availableWafs')}</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleScanWafs}
                disabled={wafsLoading}
              >
                {wafsLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {t('waf.scanWafs')}
              </Button>
            </div>

            {isScanning && wafs.length > 0 && (
              <Select value={webAclArn} onValueChange={setWebAclArn}>
                <SelectTrigger>
                  <SelectValue placeholder={t('waf.selectWafPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {wafs.map((waf: any) => (
                    <SelectItem key={waf.ARN} value={waf.ARN}>
                      {waf.Name} ({waf.Scope})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {isScanning && wafs.length === 0 && !wafsLoading && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{t('waf.noWafsFound')}</AlertTitle>
                <AlertDescription>
                  {t('waf.noWafsFoundDesc')}
                </AlertDescription>
              </Alert>
            )}

            {/* Manual ARN Input */}
            <div className="space-y-2">
              <Label>{t('waf.orEnterManually')}</Label>
              <Input
                placeholder="arn:aws:wafv2:us-east-1:123456789012:regional/webacl/my-web-acl/..."
                value={webAclArn}
                onChange={(e) => setWebAclArn(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          {/* Filter Mode */}
          <div className="space-y-2">
            <Label>{t('waf.filterMode')}</Label>
            <Select value={filterMode} onValueChange={setFilterMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="block_only">
                  <div className="flex flex-col">
                    <span>{t('waf.blockOnly')}</span>
                    <span className="text-xs text-muted-foreground">{t('waf.blockOnlyDesc')}</span>
                  </div>
                </SelectItem>
                <SelectItem value="all_requests">
                  <div className="flex flex-col">
                    <span>{t('waf.allRequests')}</span>
                    <span className="text-xs text-muted-foreground">{t('waf.allRequestsDesc')}</span>
                  </div>
                </SelectItem>
                <SelectItem value="hybrid">
                  <div className="flex flex-col">
                    <span>{t('waf.hybrid')}</span>
                    <span className="text-xs text-muted-foreground">{t('waf.hybridDesc')}</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Setup Button */}
          <Button
            onClick={handleSetup}
            disabled={!webAclArn || setupMutation.isPending}
            className="w-full"
          >
            {setupMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Shield className="h-4 w-4 mr-2" />
            )}
            {t('waf.enableMonitoring')}
          </Button>
        </CardContent>
      </Card>

      {/* Requirements */}
      <Card className="glass border-muted">
        <CardHeader>
          <CardTitle className="text-sm">{t('waf.requirements')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
            <span>{t('waf.req1')}</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
            <span>{t('waf.req2')}</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
            <span>{t('waf.req3')}</span>
          </div>
          <a 
            href="https://docs.aws.amazon.com/waf/latest/developerguide/logging.html" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-primary hover:underline mt-4"
          >
            {t('waf.learnMore')}
            <ExternalLink className="h-3 w-3" />
          </a>
        </CardContent>
      </Card>

      {/* Diagnostic Modal */}
      <Dialog open={diagnosticOpen} onOpenChange={setDiagnosticOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              {t('waf.diagnosticTitle', 'WAF Monitoring Diagnostic')}
            </DialogTitle>
            <DialogDescription>
              {t('waf.diagnosticDesc', 'Check the status of monitoring configuration')}
            </DialogDescription>
          </DialogHeader>
          
          {diagnosticResult && (
            <div className="space-y-4">
              {/* Overall Status */}
              <Card className={`border-2 ${
                diagnosticResult.overallStatus === 'success' ? 'border-green-500/50 bg-green-500/5' :
                diagnosticResult.overallStatus === 'warning' ? 'border-yellow-500/50 bg-yellow-500/5' :
                diagnosticResult.overallStatus === 'error' ? 'border-red-500/50 bg-red-500/5' :
                'border-muted'
              }`}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{diagnosticResult.webAclName}</p>
                      <p className="text-sm text-muted-foreground">{diagnosticResult.region}</p>
                    </div>
                    <Badge variant={
                      diagnosticResult.overallStatus === 'success' ? 'default' :
                      diagnosticResult.overallStatus === 'warning' ? 'secondary' :
                      'destructive'
                    } className="text-sm">
                      {diagnosticResult.overallStatus === 'success' && <CheckCircle className="h-4 w-4 mr-1" />}
                      {diagnosticResult.overallStatus === 'warning' && <AlertTriangle className="h-4 w-4 mr-1" />}
                      {diagnosticResult.overallStatus === 'error' && <XCircle className="h-4 w-4 mr-1" />}
                      {t(`waf.status${diagnosticResult.overallStatus.charAt(0).toUpperCase() + diagnosticResult.overallStatus.slice(1)}`, diagnosticResult.overallStatus)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Checks */}
              <div className="space-y-3">
                {diagnosticResult.checks.map((check, index) => (
                  <div 
                    key={index}
                    className={`p-4 rounded-lg border ${
                      check.status === 'success' ? 'border-green-500/30 bg-green-500/5' :
                      check.status === 'warning' ? 'border-yellow-500/30 bg-yellow-500/5' :
                      'border-red-500/30 bg-red-500/5'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {check.status === 'success' && <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />}
                      {check.status === 'warning' && <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />}
                      {check.status === 'error' && <XCircle className="h-5 w-5 text-red-500 mt-0.5" />}
                      <div className="flex-1 space-y-1">
                        <p className="font-medium">{check.name}</p>
                        <p className="text-sm text-muted-foreground">{check.message}</p>
                        {check.recommendation && (
                          <Alert className="mt-2">
                            <Info className="h-4 w-4" />
                            <AlertDescription className="text-sm">
                              {check.recommendation}
                            </AlertDescription>
                          </Alert>
                        )}
                        {/* Show Fix button for Subscription Filter issues */}
                        {check.name === 'Subscription Filter' && (check.status === 'warning' || check.status === 'error') && (
                          <Button
                            size="sm"
                            className="mt-2"
                            onClick={() => fixSubscriptionMutation.mutate(diagnosticResult.configId)}
                            disabled={fixSubscriptionMutation.isPending}
                          >
                            {fixSubscriptionMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Settings className="h-4 w-4 mr-2" />
                            )}
                            {t('waf.fixSubscription', 'Fix Subscription Filter')}
                          </Button>
                        )}
                        {check.details && (
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                              {t('waf.checkDetails', 'Details')}
                            </summary>
                            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                              {JSON.stringify(check.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setDiagnosticOpen(false)}>
                  {t('waf.closeDiagnostic', 'Close')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
