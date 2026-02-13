/**
 * Azure Credentials Manager
 * 
 * Manages Azure credentials with list, add, edit, and delete functionality.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Cloud, CheckCircle, XCircle, RefreshCw, MoreVertical, ShieldCheck, AlertTriangle, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { apiClient } from '@/integrations/aws/api-client';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AzureCredentialsForm } from './AzureCredentialsForm';
import { AzureQuickConnect } from './AzureQuickConnect';
import { AzureOAuthButton } from './AzureOAuthButton';
import { useAzureOAuthInitiate } from './useAzureOAuthInitiate';

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

export function AzureCredentialsManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showQuickConnect, setShowQuickConnect] = useState(false);
  const [deleteCredentialId, setDeleteCredentialId] = useState<string | null>(null);
  const [validatingCredentialId, setValidatingCredentialId] = useState<string | null>(null);

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
        body: {
          credentialId,
        },
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
        body: {
          credentialId,
        },
      });
      
      if (result.error) {
        throw new Error(result.error.message || 'Failed to validate permissions');
      }
      
      return result.data;
    },
    onSuccess: (data) => {
      setValidatingCredentialId(null);
      
      const missingPermissions = data.missingPermissions || [];
      const warnings = data.warnings || [];
      
      if (missingPermissions.length === 0 && warnings.length === 0) {
        toast.success(
          t('azure.permissionsValid', 'All permissions are correctly configured!'),
          {
            description: t('azure.permissionsValidDescription', 'Your Azure credentials have all required permissions.'),
          }
        );
      } else if (missingPermissions.length > 0) {
        toast.error(
          t('azure.permissionsMissing', 'Missing required permissions'),
          {
            description: `${missingPermissions.length} ${t('azure.permissionsMissingCount', 'permission(s) missing')}`,
          }
        );
      } else {
        toast.warning(
          t('azure.permissionsWarnings', 'Permissions validated with warnings'),
          {
            description: `${warnings.length} ${t('azure.permissionsWarningsCount', 'warning(s) found')}`,
          }
        );
      }
    },
    onError: (err: Error) => {
      setValidatingCredentialId(null);
      toast.error(t('azure.validationFailed', 'Validation failed'), {
        description: err.message,
      });
    },
  });

  const handleValidatePermissions = (credentialId: string) => {
    setValidatingCredentialId(credentialId);
    validatePermissionsMutation.mutate(credentialId);
  };

  const { initiate: handleReconnect } = useAzureOAuthInitiate();

  const handleAddSuccess = () => {
    setShowAddDialog(false);
    queryClient.invalidateQueries({ queryKey: ['azure-credentials'] });
    queryClient.invalidateQueries({ queryKey: ['cloud-accounts'] });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
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
        <div className="flex items-center gap-2">
          <AzureOAuthButton 
            variant="default"
            onError={(error) => toast.error(error)}
          />
          <Button variant="outline" onClick={() => setShowQuickConnect(true)}>
            {t('azure.quickConnect', 'Quick Connect')}
          </Button>
          <Button variant="outline" onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('azure.manualSetup', 'Manual Setup')}
          </Button>
        </div>
      </div>

      {/* Credentials List */}
      {credentials.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Cloud className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">{t('azure.noCredentials', 'No Azure credentials')}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('azure.noCredentialsDescription', 'Add your first Azure subscription to get started.')}
              </p>
              <div className="mt-6 flex flex-col items-center gap-3">
                <AzureOAuthButton 
                  size="lg"
                  onError={(error) => toast.error(error)}
                />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{t('common.or', 'or')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setShowQuickConnect(true)}>
                    {t('azure.quickConnect', 'Quick Connect')}
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddDialog(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('azure.manualSetup', 'Manual Setup')}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {credentials.map((credential: AzureCredential) => (
            <Card key={credential.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-5 w-5 text-blue-600" />
                    <CardTitle className="text-base">
                      {credential.subscriptionName || 'Azure Subscription'}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    {credential.authType === 'oauth' ? (
                      <Badge variant="outline" className="border-blue-500 text-blue-600">
                        OAuth
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        Service Principal
                      </Badge>
                    )}
                    <Badge variant={credential.isActive ? 'default' : 'secondary'}>
                      {credential.isActive ? (
                        <>
                          <CheckCircle className="mr-1 h-3 w-3" />
                          {t('common.active', 'Active')}
                        </>
                      ) : (
                        <>
                          <XCircle className="mr-1 h-3 w-3" />
                          {t('common.inactive', 'Inactive')}
                        </>
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
                        {credential.authType === 'oauth' && (
                          <DropdownMenuItem onClick={handleReconnect}>
                            <Link2 className="mr-2 h-4 w-4" />
                            {t('azure.reconnect', 'Reconnect')}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteCredentialId(credential.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {credential.authType === 'oauth' 
                            ? t('azure.disconnect', 'Disconnect')
                            : t('common.delete', 'Delete')
                          }
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Refresh error banner */}
                {credential.authType === 'oauth' && credential.refreshError && (
                  <div className="mb-3 flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{t('azure.refreshErrorMessage', 'Connection expired. Please reconnect your Azure account.')}</span>
                    <Button variant="outline" size="sm" className="shrink-0 h-7 text-xs" onClick={handleReconnect}>
                      <Link2 className="mr-1 h-3 w-3" />
                      {t('azure.reconnect', 'Reconnect')}
                    </Button>
                  </div>
                )}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('azure.subscriptionId', 'Subscription ID')}:</span>
                    <span className="font-mono">{maskId(credential.subscriptionId)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('azure.tenantId', 'Tenant ID (Directory ID)')}:</span>
                    <span className="font-mono">
                      {credential.authType === 'oauth' 
                        ? maskId(credential.oauthTenantId || '') 
                        : maskId(credential.tenantId || '')}
                    </span>
                  </div>
                  {credential.authType === 'oauth' && credential.oauthUserEmail && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('azure.connectedAs', 'Connected as')}:</span>
                      <span>{credential.oauthUserEmail}</span>
                    </div>
                  )}
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

      {/* Add Credential Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto p-0 gap-0 glass border-primary/20" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{t('azure.addCredential', 'Add Azure Credential')}</DialogTitle>
          <DialogDescription className="sr-only">{t('azure.addCredentialDescription', 'Enter your Azure Service Principal credentials.')}</DialogDescription>
          {/* Hero Header - same style as Profile/Settings dialogs */}
          <div className="relative overflow-hidden rounded-t-lg">
            <div className="absolute inset-0 bg-gradient-to-br from-[#003C7D] via-[#0055A4] to-[#008CFF]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15)_0%,_transparent_60%)]" />
            <div className="relative px-6 pt-8 pb-6 flex items-center gap-5">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm ring-2 ring-white/30 shadow-lg">
                <Cloud className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-light text-white">{t('azure.addCredential', 'Add Azure Credential')}</h2>
                <p className="text-sm text-white/80 mt-1">{t('azure.addCredentialDescription', 'Enter your Azure Service Principal credentials.')}</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            <AzureCredentialsForm
              onSuccess={handleAddSuccess}
              onCancel={() => setShowAddDialog(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Connect Dialog */}
      <Dialog open={showQuickConnect} onOpenChange={setShowQuickConnect}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{t('azure.quickConnect', 'Quick Connect')}</DialogTitle>
          <DialogDescription className="sr-only">{t('azure.quickConnect', 'Quick Connect')}</DialogDescription>
          <AzureQuickConnect
            onManualSetup={() => {
              setShowQuickConnect(false);
              setShowAddDialog(true);
            }}
          />
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
    </div>
  );
}
