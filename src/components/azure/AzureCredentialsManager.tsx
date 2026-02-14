/**
 * Azure Credentials Manager
 * 
 * Manages Azure credentials with script-based setup flow.
 * Only supports Service Principal via automated script.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Cloud, CheckCircle, XCircle, RefreshCw, MoreVertical, ShieldCheck, AlertTriangle, CheckCircle2, Clock, Copy, Terminal, Apple, Monitor, FileText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiClient } from '@/integrations/aws/api-client';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AzureCredentialsForm } from './AzureCredentialsForm';

interface AzureCredential {
  id: string;
  tenantId: string | null;
  clientId: string | null;
  subscriptionId: string;
  subscriptionName: string | null;
  regions: string[];
  isActive: boolean;
  authType?: 'service_principal' | 'oauth';
  oauthTenantId?: string | null;
  oauthUserEmail?: string | null;
  tokenExpiresAt?: string | null;
  lastRefreshAt?: string | null;
  refreshError?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AzureTestResult {
  id: string;
  name: string;
  feature: string;
  critical: boolean;
  permissions: string[];
  status: 'ok' | 'error' | 'warning';
  detail: string;
  durationMs: number;
}

interface AzurePermissionResults {
  summary: {
    total: number;
    ok: number;
    errors: number;
    warnings: number;
    isValid: boolean;
    totalDurationMs: number;
  };
  results: AzureTestResult[];
  byFeature: Record<string, AzureTestResult[]>;
  missingPermissions: string[];
  subscriptionMismatch?: {
    available: string[];
    requested: string;
  };
  credential: {
    id: string;
    subscriptionId: string;
    subscriptionName: string | null;
    authType: string;
  };
}

export function AzureCredentialsManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteCredentialId, setDeleteCredentialId] = useState<string | null>(null);
  const [validatingCredentialId, setValidatingCredentialId] = useState<string | null>(null);
  const [permissionResults, setPermissionResults] = useState<AzurePermissionResults | null>(null);
  const [copiedStep, setCopiedStep] = useState<string | null>(null);

  const copyToClipboard = async (text: string, stepId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStep(stepId);
      toast.success(t('common.copied', 'Copied to clipboard'));
      setTimeout(() => setCopiedStep(null), 2000);
    } catch {
      toast.error(t('common.copyFailed', 'Failed to copy'));
    }
  };

  const CopyButton = ({ text, stepId }: { text: string; stepId: string }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => copyToClipboard(text, stepId)}
      className="h-8 px-2 shrink-0"
    >
      {copiedStep === stepId ? (
        <CheckCircle2 className="h-4 w-4 text-green-600" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  );

  // Fetch Azure credentials
  const { data: credentials = [], isLoading, error, refetch } = useQuery({
    queryKey: ['azure-credentials'],
    queryFn: async () => {
      const result = await apiClient.invoke<any>('list-azure-credentials', {});
      if (result.error) {
        throw new Error(result.error.message || 'Failed to fetch Azure credentials');
      }
      const data = result.data?.data || result.data || [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 2 * 60 * 1000,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (credentialId: string) => {
      const result = await apiClient.invoke<any>('delete-azure-credentials', {
        body: { credentialId },
      });
      if (result.error) {
        throw new Error(result.error.message || 'Failed to delete credential');
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success(t('azure.credentialDeleted', 'Azure credential deleted'));
      queryClient.invalidateQueries({ queryKey: ['azure-credentials'] });
      queryClient.invalidateQueries({ queryKey: ['cloud-accounts'] });
      setDeleteCredentialId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Validate permissions mutation
  const validatePermissionsMutation = useMutation({
    mutationFn: async (credentialId: string) => {
      const result = await apiClient.invoke<any>('validate-azure-permissions', {
        body: { credentialId },
      });
      if (result.error) {
        throw new Error(result.error.message || 'Failed to validate permissions');
      }
      return result.data;
    },
    onSuccess: (data) => {
      setValidatingCredentialId(null);
      setPermissionResults(data);
      const missingPermissions = data.missingPermissions || [];
      const warnings = data.results?.filter((r: AzureTestResult) => r.status === 'warning') || [];
      if (missingPermissions.length === 0 && warnings.length === 0) {
        toast.success(
          t('azure.permissionsValid', 'All permissions are correctly configured!'),
          { description: t('azure.permissionsValidDescription', 'Your Azure credentials have all required permissions.') }
        );
      }
    },
    onError: (err: Error) => {
      setValidatingCredentialId(null);
      toast.error(t('azure.validationFailed', 'Validation failed'), { description: err.message });
    },
  });

  const handleValidatePermissions = (credentialId: string) => {
    setValidatingCredentialId(credentialId);
    validatePermissionsMutation.mutate(credentialId);
  };

  const handleAddSuccess = () => {
    setShowAddDialog(false);
    queryClient.invalidateQueries({ queryKey: ['azure-credentials'] });
    queryClient.invalidateQueries({ queryKey: ['cloud-accounts'] });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const maskId = (id: string) => {
    if (!id || id.length < 8) return id;
    return `${id.substring(0, 8)}...${id.substring(id.length - 4)}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-destructive">
            <p>{t('common.error', 'Error')}: {(error as Error).message}</p>
            <Button variant="outline" onClick={() => refetch()} className="mt-4">
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('common.retry', 'Retry')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Cloud className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{t('azure.credentials', 'Azure Credentials')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('azure.credentialsDescription', 'Manage your Azure subscription connections')}
            </p>
          </div>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className="glass hover-glow">
          <Plus className="mr-2 h-4 w-4" />
          {t('azure.connectAzure', 'Connect Azure')}
        </Button>
      </div>

      {/* Credentials List */}
      {credentials.length === 0 ? (
        <Card className="glass border-primary/20">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Cloud className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">{t('azure.noCredentials', 'No Azure credentials')}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('azure.noCredentialsDescription', 'Add your first Azure subscription to get started.')}
              </p>
              <Button onClick={() => setShowAddDialog(true)} className="mt-6 glass hover-glow">
                <Plus className="mr-2 h-4 w-4" />
                {t('azure.connectAzure', 'Connect Azure')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {credentials.map((credential: AzureCredential) => (
            <Card key={credential.id} className="glass border-primary/20">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-5 w-5 text-blue-600" />
                    <CardTitle className="text-base">
                      {credential.subscriptionName || 'Azure Subscription'}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Service Principal</Badge>
                    <Badge variant={credential.isActive ? 'default' : 'secondary'}>
                      {credential.isActive ? (
                        <><CheckCircle className="mr-1 h-3 w-3" />{t('common.active', 'Active')}</>
                      ) : (
                        <><XCircle className="mr-1 h-3 w-3" />{t('common.inactive', 'Inactive')}</>
                      )}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleValidatePermissions(credential.id)}
                          disabled={validatingCredentialId === credential.id}
                        >
                          {validatingCredentialId === credential.id ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <ShieldCheck className="mr-2 h-4 w-4" />
                          )}
                          {t('azure.validatePermissions', 'Validate Permissions')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteCredentialId(credential.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('common.delete', 'Delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subscription ID:</span>
                    <span className="font-mono">{maskId(credential.subscriptionId)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tenant ID:</span>
                    <span className="font-mono">{maskId(credential.tenantId || '')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('azure.regions', 'Regions')}:</span>
                    <span>{credential.regions?.length || 0} {t('azure.regionsConfigured', 'configured')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('common.created', 'Created')}:</span>
                    <span>{formatDate(credential.createdAt)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Credential Dialog - Script-first flow */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 glass border-primary/20" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{t('azure.connectAzure', 'Connect Azure')}</DialogTitle>
          <DialogDescription className="sr-only">{t('azure.connectAzureDesc', 'Connect your Azure subscription using the automated script.')}</DialogDescription>
          
          {/* Hero Header */}
          <div className="relative overflow-hidden rounded-t-lg">
            <div className="absolute inset-0 bg-gradient-to-br from-[#003C7D] via-[#0055A4] to-[#008CFF]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15)_0%,_transparent_60%)]" />
            <div className="relative px-6 pt-8 pb-6 flex items-center gap-5">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm ring-2 ring-white/30 shadow-lg">
                <Cloud className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-light text-white">{t('azure.connectAzure', 'Connect Azure')}</h2>
                <p className="text-sm text-white/80 mt-1">{t('azure.connectAzureDesc', 'Connect your Azure subscription using the automated script.')}</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Step 1: Run the script */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-semibold shrink-0">1</div>
                <div>
                  <h3 className="font-semibold">{t('azure.step1RunScript', 'Run the setup script')}</h3>
                  <p className="text-sm text-muted-foreground">{t('azure.step1RunScriptDesc', 'Download and run the script on your machine. It will automatically create the Service Principal with all required permissions.')}</p>
                </div>
              </div>

              <Card className="glass border-primary/10">
                <CardContent className="pt-4 space-y-4">
                  {/* Download buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {([
                      { label: 'Windows (PowerShell)', icon: Monitor, script: '/scripts/azure-quick-connect.ps1' },
                      { label: 'macOS', icon: Apple, script: '/scripts/azure-quick-connect.sh' },
                      { label: 'Linux', icon: Terminal, script: '/scripts/azure-quick-connect.sh' },
                    ] as const).map(({ label, icon: Icon, script }) => (
                      <Button
                        key={label}
                        variant="outline"
                        className="glass hover-glow flex items-center justify-center gap-2"
                        onClick={() => {
                          window.open(script, '_blank');
                          toast.success(t('azure.scriptDownloaded', 'Script downloaded!'));
                        }}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </Button>
                    ))}
                  </div>

                  {/* Run instructions */}
                  <div className="space-y-3">
                    <div className="text-sm space-y-2">
                      <p className="font-medium flex items-center gap-2">
                        <Monitor className="h-4 w-4" /> Windows:
                      </p>
                      <div className="bg-muted p-3 rounded-md font-mono text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">PS&gt;</span>
                          <code className="flex-1">Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser</code>
                          <CopyButton text="Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser" stepId="ps-policy" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">PS&gt;</span>
                          <code className="flex-1">.\azure-quick-connect.ps1</code>
                          <CopyButton text=".\azure-quick-connect.ps1" stepId="ps-run" />
                        </div>
                      </div>
                    </div>

                    <div className="text-sm space-y-2">
                      <p className="font-medium flex items-center gap-2">
                        <Apple className="h-4 w-4" /> macOS / Linux:
                      </p>
                      <div className="bg-muted p-3 rounded-md font-mono text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">$</span>
                          <code className="flex-1">chmod +x azure-quick-connect.sh</code>
                          <CopyButton text="chmod +x azure-quick-connect.sh" stepId="chmod" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">$</span>
                          <code className="flex-1">./azure-quick-connect.sh</code>
                          <CopyButton text="./azure-quick-connect.sh" stepId="run" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <Alert>
                    <Terminal className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      {t('azure.scriptRequirements', 'Requires Azure CLI installed and logged in. The script will guide you through the login if needed.')}
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </div>

            {/* Step 2: Copy credentials from script output */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-semibold shrink-0">2</div>
                <div>
                  <h3 className="font-semibold">{t('azure.step2FillForm', 'Fill in the credentials below')}</h3>
                  <p className="text-sm text-muted-foreground">{t('azure.step2FillFormDesc', 'Copy the values from the script output and paste them in the corresponding fields.')}</p>
                </div>
              </div>

              {/* Field mapping guide */}
              <Card className="glass border-amber-500/20 bg-amber-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-2 mb-3">
                    <FileText className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      {t('azure.fieldMappingTitle', 'Script output → Form fields')}
                    </p>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    {[
                      { script: 'Tenant ID', form: t('azure.tenantId', 'Tenant ID') },
                      { script: 'Client ID (Application ID)', form: t('azure.clientId', 'Client ID (Application ID)') },
                      { script: 'Client Secret', form: t('azure.clientSecret', 'Client Secret') },
                      { script: 'Subscription ID', form: t('azure.subscriptionId', 'Subscription ID') },
                      { script: 'Subscription Name', form: t('azure.subscriptionName', 'Subscription Name') },
                    ].map(({ script, form }) => (
                      <div key={script} className="flex items-center gap-2 text-muted-foreground">
                        <code className="bg-muted px-1.5 py-0.5 rounded font-mono">{script}</code>
                        <ArrowRight className="h-3 w-3 shrink-0" />
                        <span className="font-medium text-foreground">{form}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Credentials Form */}
              <AzureCredentialsForm
                onSuccess={handleAddSuccess}
                onCancel={() => setShowAddDialog(false)}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteCredentialId} onOpenChange={() => setDeleteCredentialId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('azure.deleteCredential', 'Delete Azure Credential')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('azure.deleteCredentialConfirm', 'Are you sure you want to delete this Azure credential? This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCredentialId && deleteMutation.mutate(deleteCredentialId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permission Validation Results Dialog */}
      <Dialog open={!!permissionResults} onOpenChange={() => setPermissionResults(null)}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              {t('azure.permissionTestResults', 'Permission Validation Results')}
            </DialogTitle>
            <DialogDescription>
              {permissionResults?.credential?.subscriptionName || permissionResults?.credential?.subscriptionId}
            </DialogDescription>
          </DialogHeader>
          {permissionResults && (
            <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0">
              {/* Summary banner */}
              <div className={`p-4 rounded-lg border ${
                permissionResults.summary.isValid
                  ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                  : 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'
              }`}>
                <div className="flex items-center gap-3">
                  {permissionResults.summary.isValid ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-6 w-6 text-orange-600 dark:text-orange-400 shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">
                      {permissionResults.summary.isValid
                        ? t('azure.allPermissionsGranted', 'All permissions granted')
                        : t('azure.somePermissionsMissing', 'Some permissions are missing')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('azure.permissionsSummary', '{{ok}} of {{total}} tests passed ({{errors}} errors, {{warnings}} warnings)', {
                        ok: permissionResults.summary.ok,
                        total: permissionResults.summary.total,
                        errors: permissionResults.summary.errors,
                        warnings: permissionResults.summary.warnings,
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="h-3 w-3" />
                    {(permissionResults.summary.totalDurationMs / 1000).toFixed(1)}s
                  </div>
                </div>
              </div>

              {/* Subscription Mismatch Alert */}
              {permissionResults.subscriptionMismatch && (
                <div className="p-4 rounded-lg border bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <p className="font-semibold text-red-700 dark:text-red-300">
                        {t('azure.subscriptionNotFound', 'Subscription ID not found')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t('azure.subscriptionMismatchDesc', 'The Subscription ID "{{requested}}" saved in this credential was not found among the subscriptions accessible by this token. This is NOT a permission error — the subscription does not exist or does not belong to the authenticated tenant/account.', {
                          requested: permissionResults.subscriptionMismatch.requested,
                        })}
                      </p>
                      {permissionResults.subscriptionMismatch.available.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('azure.availableSubscriptions', 'Subscriptions accessible by this token:')}
                          </p>
                          <div className="bg-muted/50 rounded p-2 space-y-1">
                            {permissionResults.subscriptionMismatch.available.map((sub, idx) => (
                              <p key={idx} className="text-xs font-mono">{sub}</p>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-red-600 dark:text-red-400">
                          {t('azure.noSubscriptionsAccessible', 'This token has no accessible subscriptions. The OAuth token may have expired or the user may not have access to any Azure subscription.')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Results grouped by feature */}
              <div className="space-y-3 pr-1">
                {Object.entries(permissionResults.byFeature).map(([feature, tests]) => {
                  const featureOk = tests.every(t => t.status === 'ok');
                  const featureErrors = tests.filter(t => t.status === 'error').length;
                  return (
                    <div key={feature} className="border rounded-lg overflow-hidden">
                      <div className={`px-4 py-2 flex items-center justify-between text-sm font-medium ${
                        featureOk
                          ? 'bg-green-50 dark:bg-green-950/20 text-green-800 dark:text-green-300'
                          : featureErrors > 0
                            ? 'bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300'
                            : 'bg-yellow-50 dark:bg-yellow-950/20 text-yellow-800 dark:text-yellow-300'
                      }`}>
                        <span className="flex items-center gap-2">
                          {featureOk ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : featureErrors > 0 ? (
                            <XCircle className="h-4 w-4" />
                          ) : (
                            <AlertTriangle className="h-4 w-4" />
                          )}
                          {feature}
                        </span>
                        <span className="text-xs opacity-75">
                          {tests.filter(t => t.status === 'ok').length}/{tests.length}
                        </span>
                      </div>
                      <div className="divide-y">
                        {tests.map((test) => (
                          <div key={test.id} className="px-4 py-2 flex items-start justify-between gap-2 text-sm">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {test.status === 'ok' ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
                                ) : test.status === 'error' ? (
                                  <XCircle className="h-3.5 w-3.5 text-red-500 dark:text-red-400 shrink-0" />
                                ) : (
                                  <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 dark:text-yellow-400 shrink-0" />
                                )}
                                <span className="font-medium text-foreground">{test.name}</span>
                                {test.critical && (
                                  <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
                                    {t('azure.critical', 'Critical')}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 ml-5.5">{test.detail}</p>
                              {test.status !== 'ok' && test.permissions.length > 0 && (
                                <div className="mt-1 ml-5.5 flex flex-wrap gap-1">
                                  {test.permissions.map((perm) => (
                                    <span key={perm} className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">
                                      {perm}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                              {test.durationMs}ms
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Missing permissions summary with copy */}
              {permissionResults.missingPermissions.length > 0 && (
                <div className="border border-destructive/30 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-destructive">
                      {t('azure.missingPermissionsList', '{{count}} missing permission(s)', {
                        count: permissionResults.missingPermissions.length,
                      })}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => {
                        navigator.clipboard.writeText(permissionResults.missingPermissions.join('\n'));
                        toast.success(t('azure.permissionsCopied', 'Permissions copied to clipboard'));
                      }}
                    >
                      <Copy className="h-3 w-3" />
                      {t('common.copy', 'Copy')}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {permissionResults.missingPermissions.map((perm) => (
                      <span key={perm} className="text-xs font-mono bg-destructive/10 text-destructive px-2 py-0.5 rounded border border-destructive/20">
                        {perm}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('azure.missingPermissionsHint', 'Add these permissions to the Service Principal or user in Azure Portal → Subscriptions → Access Control (IAM) → Add role assignment.')}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermissionResults(null)}>
              {t('common.close', 'Close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
