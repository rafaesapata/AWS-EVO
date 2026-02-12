/**
 * Administrative Settings - Super Admin Only
 * Manage and test Azure credentials across all organizations
 */

import { useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/integrations/aws/api-client';
import {
  Settings2, ShieldCheck, RefreshCw, Pencil, CheckCircle, XCircle,
  AlertTriangle, Clock, Key, Building2,
} from 'lucide-react';

interface AzureCredential {
  id: string;
  organization_id: string;
  organizationName: string;
  subscription_id: string;
  subscription_name: string | null;
  auth_type: string;
  tenant_id: string | null;
  tenant_id_full: string | null;
  client_id: string | null;
  client_id_full: string | null;
  oauth_tenant_id: string | null;
  oauth_user_email: string | null;
  token_expires_at: string | null;
  last_refresh_at: string | null;
  refresh_error: string | null;
  regions: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface TestResult {
  credentialId: string;
  valid: boolean;
  error?: string;
  secretExpiresAt?: string | null;
  appDisplayName?: string | null;
}

const MS_PER_DAY = 86_400_000;

function getExpiryBadge(expiresAt: string | null, t: (key: string, fallback: string) => string) {
  if (!expiresAt) return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />{t('adminSettings.unknown', 'Unknown')}</Badge>;
  const daysLeft = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / MS_PER_DAY);

  if (daysLeft < 0) return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />{t('adminSettings.expired', 'Expired')}</Badge>;
  if (daysLeft <= 30) return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><AlertTriangle className="h-3 w-3 mr-1" />{daysLeft}d</Badge>;
  return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="h-3 w-3 mr-1" />{daysLeft}d</Badge>;
}

export default function AdminSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingCredential, setEditingCredential] = useState<AzureCredential | null>(null);
  const [editForm, setEditForm] = useState({ tenant_id: '', client_id: '', client_secret: '', subscription_id: '' });
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testingId, setTestingId] = useState<string | null>(null);

  // Fetch all Azure credentials
  const { data: credentialsData, isLoading } = useQuery({
    queryKey: ['admin-azure-credentials'],
    queryFn: async () => {
      const res = await apiClient.invoke<{ credentials: AzureCredential[] }>('admin-azure-credentials', {
        body: { action: 'list' },
      });
      if ('error' in res) throw new Error(res.error);
      return res.data.credentials;
    },
  });

  // Test credential mutation
  const testMutation = useMutation({
    mutationFn: async (credentialId: string) => {
      const res = await apiClient.invoke<TestResult>('admin-azure-credentials', {
        body: { action: 'test', credentialId },
      });
      if ('error' in res) throw new Error(res.error);
      return res.data;
    },
    onMutate: (credentialId) => {
      setTestingId(credentialId);
    },
    onSuccess: (data) => {
      setTestResults(prev => ({ ...prev, [data.credentialId]: data }));
      toast({
        title: data.valid
          ? t('adminSettings.testSuccess', 'Credentials valid')
          : t('adminSettings.testFailed', 'Credentials invalid'),
        description: data.error || (data.appDisplayName ? `App: ${data.appDisplayName}` : undefined),
        variant: data.valid ? 'default' : 'destructive',
      });
      setTestingId(null);
    },
    onError: (err: Error) => {
      toast({ title: t('adminSettings.testError', 'Test error'), description: err.message, variant: 'destructive' });
      setTestingId(null);
    },
  });

  // Update credential mutation
  const updateMutation = useMutation({
    mutationFn: async ({ credentialId, updates }: { credentialId: string; updates: Record<string, string> }) => {
      const res = await apiClient.invoke<{ updated: boolean }>('admin-azure-credentials', {
        body: { action: 'update', credentialId, updates },
      });
      if ('error' in res) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: t('adminSettings.updateSuccess', 'Credential updated successfully') });
      setEditingCredential(null);
      queryClient.invalidateQueries({ queryKey: ['admin-azure-credentials'] });
    },
    onError: (err: Error) => {
      toast({ title: t('adminSettings.updateError', 'Update failed'), description: err.message, variant: 'destructive' });
    },
  });

  const handleEdit = (cred: AzureCredential) => {
    setEditingCredential(cred);
    setEditForm({
      tenant_id: cred.tenant_id_full || '',
      client_id: cred.client_id_full || '',
      client_secret: '',
      subscription_id: cred.subscription_id || '',
    });
  };

  const handleSave = () => {
    if (!editingCredential) return;
    const updates: Record<string, string> = {};
    if (editForm.tenant_id && editForm.tenant_id !== editingCredential.tenant_id_full) updates.tenant_id = editForm.tenant_id;
    if (editForm.client_id && editForm.client_id !== editingCredential.client_id_full) updates.client_id = editForm.client_id;
    if (editForm.client_secret) updates.client_secret = editForm.client_secret;
    if (editForm.subscription_id && editForm.subscription_id !== editingCredential.subscription_id) updates.subscription_id = editForm.subscription_id;

    if (Object.keys(updates).length === 0) {
      toast({ title: t('adminSettings.noChanges', 'No changes to save') });
      return;
    }
    updateMutation.mutate({ credentialId: editingCredential.id, updates });
  };

  const testAll = async () => {
    if (!credentialsData) return;
    for (const cred of credentialsData.filter(c => c.auth_type === 'service_principal' && c.is_active)) {
      testMutation.mutate(cred.id);
    }
  };

  const credentials: AzureCredential[] = credentialsData || [];

  return (
    <Layout
      title={t('adminSettings.title', 'Administrative Settings')}
      description={t('adminSettings.description', 'Manage cloud credentials across all organizations')}
      icon={<Settings2 className="h-4 w-4 text-white" />}
    >
      <div className="space-y-6">
        <Tabs defaultValue="azure">
          <TabsList className="glass">
            <TabsTrigger value="azure">
              <Key className="h-4 w-4 mr-2" />
              {t('adminSettings.azureCredentials', 'Azure Credentials')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="azure" className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card className="glass border-primary/20">
                <CardHeader className="pb-2">
                  <CardDescription>{t('adminSettings.totalCredentials', 'Total Credentials')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{credentials.length}</div>
                </CardContent>
              </Card>
              <Card className="glass border-primary/20">
                <CardHeader className="pb-2">
                  <CardDescription>{t('adminSettings.activeCredentials', 'Active')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-400">{credentials.filter(c => c.is_active).length}</div>
                </CardContent>
              </Card>
              <Card className="glass border-primary/20">
                <CardHeader className="pb-2">
                  <CardDescription>{t('adminSettings.withErrors', 'With Errors')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-400">{credentials.filter(c => c.refresh_error).length}</div>
                </CardContent>
              </Card>
              <Card className="glass border-primary/20">
                <CardHeader className="pb-2">
                  <CardDescription>{t('adminSettings.organizations', 'Organizations')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{new Set(credentials.map(c => c.organization_id)).size}</div>
                </CardContent>
              </Card>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button className="glass hover-glow" onClick={testAll} disabled={testingId !== null}>
                <ShieldCheck className="h-4 w-4 mr-2" />
                {t('adminSettings.testAll', 'Test All Credentials')}
              </Button>
              <Button variant="outline" className="glass" onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-azure-credentials'] })}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('adminSettings.refresh', 'Refresh')}
              </Button>
            </div>

            {/* Credentials Table */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>{t('adminSettings.allCredentials', 'All Azure Credentials')}</CardTitle>
                <CardDescription>{t('adminSettings.allCredentialsDesc', 'Manage credentials across all organizations')}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('adminSettings.organization', 'Organization')}</TableHead>
                          <TableHead>{t('adminSettings.subscription', 'Subscription')}</TableHead>
                          <TableHead>{t('adminSettings.authType', 'Auth Type')}</TableHead>
                          <TableHead>{t('adminSettings.tenantId', 'Tenant ID')}</TableHead>
                          <TableHead>{t('adminSettings.clientId', 'Client ID')}</TableHead>
                          <TableHead>{t('adminSettings.status', 'Status')}</TableHead>
                          <TableHead>{t('adminSettings.secretExpiry', 'Secret Expiry')}</TableHead>
                          <TableHead>{t('adminSettings.actions', 'Actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {credentials.map(cred => {
                          const result = testResults[cred.id];
                          return (
                            <TableRow key={cred.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm">{cred.organizationName}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="text-sm font-mono">{cred.subscription_name || cred.subscription_id}</span>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{cred.auth_type}</Badge>
                              </TableCell>
                              <TableCell>
                                <span className="text-sm font-mono">{cred.tenant_id || '-'}</span>
                              </TableCell>
                              <TableCell>
                                <span className="text-sm font-mono">{cred.client_id || '-'}</span>
                              </TableCell>
                              <TableCell>
                                {result ? (
                                  result.valid
                                    ? <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="h-3 w-3 mr-1" />{t('adminSettings.valid', 'Valid')}</Badge>
                                    : <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />{t('adminSettings.invalid', 'Invalid')}</Badge>
                                ) : cred.refresh_error ? (
                                  <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />{t('adminSettings.error', 'Error')}</Badge>
                                ) : cred.is_active ? (
                                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">{t('adminSettings.active', 'Active')}</Badge>
                                ) : (
                                  <Badge variant="secondary">{t('adminSettings.inactive', 'Inactive')}</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {result?.secretExpiresAt
                                  ? getExpiryBadge(result.secretExpiresAt, t)
                                  : <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />{t('adminSettings.notTested', 'Not tested')}</Badge>
                                }
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => testMutation.mutate(cred.id)}
                                    disabled={testingId === cred.id}
                                    title={t('adminSettings.testCredential', 'Test credential')}
                                  >
                                    {testingId === cred.id
                                      ? <RefreshCw className="h-4 w-4 animate-spin" />
                                      : <ShieldCheck className="h-4 w-4" />
                                    }
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEdit(cred)}
                                    title={t('adminSettings.editCredential', 'Edit credential')}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {credentials.length === 0 && !isLoading && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                              {t('adminSettings.noCredentials', 'No Azure credentials found')}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit Dialog */}
        <Dialog open={!!editingCredential} onOpenChange={(open: boolean) => !open && setEditingCredential(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('adminSettings.editTitle', 'Edit Azure Credential')}</DialogTitle>
              <DialogDescription>
                {editingCredential?.organizationName} — {editingCredential?.subscription_name || editingCredential?.subscription_id}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('adminSettings.tenantIdLabel', 'Tenant ID')}</Label>
                <Input
                  value={editForm.tenant_id}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm(prev => ({ ...prev, tenant_id: e.target.value }))}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('adminSettings.clientIdLabel', 'Client ID')}</Label>
                <Input
                  value={editForm.client_id}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm(prev => ({ ...prev, client_id: e.target.value }))}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('adminSettings.clientSecretLabel', 'Client Secret (leave empty to keep current)')}</Label>
                <Input
                  type="password"
                  value={editForm.client_secret}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm(prev => ({ ...prev, client_secret: e.target.value }))}
                  placeholder={t('adminSettings.clientSecretPlaceholder', 'Enter new secret or leave empty')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('adminSettings.subscriptionIdLabel', 'Subscription ID')}</Label>
                <Input
                  value={editForm.subscription_id}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm(prev => ({ ...prev, subscription_id: e.target.value }))}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="font-mono"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingCredential(null)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button className="glass hover-glow" onClick={handleSave} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
                {t('common.save', 'Save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
