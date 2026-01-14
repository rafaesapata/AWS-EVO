/**
 * Azure Credentials Manager
 * 
 * Manages Azure credentials with list, add, edit, and delete functionality.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Cloud, CheckCircle, XCircle, RefreshCw, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { apiClient } from '@/integrations/aws/api-client';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AzureCredentialsForm } from './AzureCredentialsForm';
import { AzureQuickConnect } from './AzureQuickConnect';
import { AzureOAuthButton } from './AzureOAuthButton';

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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('azure.addCredential', 'Add Azure Credential')}</DialogTitle>
            <DialogDescription>
              {t('azure.addCredentialDescription', 'Enter your Azure Service Principal credentials.')}
            </DialogDescription>
          </DialogHeader>
          <AzureCredentialsForm
            onSuccess={handleAddSuccess}
            onCancel={() => setShowAddDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Quick Connect Dialog */}
      <Dialog open={showQuickConnect} onOpenChange={setShowQuickConnect}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
