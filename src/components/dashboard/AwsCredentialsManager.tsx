import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/aws/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { Key, Trash2, Building2, ShieldCheck, Pencil, CloudCog, Copy, AlertTriangle, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { RegionSelector } from "./RegionSelector";
import CloudFormationDeploy from "./CloudFormationDeploy";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCloudAccount, CloudAccount } from "@/contexts/CloudAccountContext";

// Extended interface for AWS-specific properties used in this component
interface AwsAccountExtended extends CloudAccount {
  access_key_id?: string;
  account_name: string;
  is_active: boolean;
  external_id?: string;
}

interface PermissionResult {
  action: string;
  decision: string;
  allowed: boolean;
  matchedStatements: number;
}

interface PermissionTestResults {
  success: boolean;
  valid: boolean;
  principalArn: string;
  summary: {
    total: number;
    allowed: number;
    denied: number;
    percentage: number;
  };
  results: PermissionResult[];
  missingPermissions: string[];
}

const ROLE_PREFIX = 'ROLE:';

// Helper to convert CloudAccount to AwsAccountExtended
function toAwsAccountExtended(account: CloudAccount): AwsAccountExtended {
  return {
    ...account,
    access_key_id: account.roleArn ? `${ROLE_PREFIX}${account.roleArn}` : undefined,
    account_name: account.accountName,
    is_active: account.isActive,
    external_id: undefined, // Will be fetched from API if needed
  };
}


const AwsCredentialsManager = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { data: organizationId, isLoading: isLoadingOrg, error: orgError } = useOrganization();
  const queryClient = useQueryClient();
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);
  const [editRegions, setEditRegions] = useState<string[]>([]);
  const [editAccountName, setEditAccountName] = useState("");
  const [testingAccountId, setTestingAccountId] = useState<string | null>(null);
  const [permissionResults, setPermissionResults] = useState<PermissionTestResults | null>(null);

  // Use centralized cloud account context instead of direct API call
  const { awsAccounts, isLoading, refreshAccounts: refetch, error: queryError } = useCloudAccount();
  
  // Convert to extended format for AWS-specific properties
  const allAccounts = awsAccounts.map(toAwsAccountExtended);

  // Debug: Log organization state
  console.log('🏢 AwsCredentialsManager: Organization state', {
    organizationId,
    isLoadingOrg,
    orgError: orgError?.message,
  });

  // Debug: Log query state
  console.log('📊 AwsCredentialsManager: Query state', {
    allAccountsCount: allAccounts?.length,
    isLoading,
    queryError: queryError?.message,
    enabled: !!organizationId,
  });

  const credentials = allAccounts?.[0];

  // Check for legacy accounts using access keys
  const legacyAccounts = allAccounts?.filter(acc => !acc.access_key_id?.startsWith(ROLE_PREFIX)) || [];
  const hasLegacyAccounts = legacyAccounts.length > 0;

  // Sync organization accounts
  const syncOrgMutation = useMutation({
    mutationFn: async (payerAccountId: string) => {
      const result = await apiClient.invoke('sync-organization-accounts', {
        body: { payerAccountId }
      });
      
      if (result.error) throw new Error(result.error.message || t('aws.syncError', 'Error syncing accounts'));
      return result.data;
    },
    onSuccess: (data) => {
      toast({
        title: t('aws.accountsSynced', 'Accounts synced!'),
        description: t('aws.memberAccountsSynced', '{{count}} member accounts were synced.', { count: data.data.syncedAccounts }),
      });
      queryClient.invalidateQueries({ queryKey: ['aws-credentials-all'] });
    },
    onError: (error: any) => {
      console.error('Error syncing organization:', error);
      
      let errorMessage = error.message || t('aws.syncError', 'Could not sync organization accounts');
      
      if (errorMessage.includes('AccessDenied') || errorMessage.includes("don't have permissions")) {
        errorMessage = t('aws.syncPermissionError', "Insufficient AWS permission. The 'organizations:ListAccounts' permission is required in IAM.");
      }
      
      toast({
        title: t('aws.syncError', 'Error syncing'),
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleTestPermissions = async (accountId: string) => {
    setTestingAccountId(accountId);
    try {
      toast({
        title: t('aws.testingPermissions', 'Testing permissions...'),
        description: t('aws.validatingIamPermissions', 'Validating IAM permissions for this account'),
      });

      const result = await apiClient.invoke('validate-permissions', {
        body: { accountId }
      });

      if (result.error) throw new Error(result.error.message || t('aws.permissionTestFailed', 'Error testing permissions'));
      const data = result.data;

      setPermissionResults(data);

      if (data.valid) {
        toast({
          title: t('aws.allPermissionsOk', '✅ All permissions OK'),
          description: t('aws.allPermissionsDescription', '{{allowed}}/{{total}} permissions verified', { allowed: data.summary.allowed, total: data.summary.total }),
        });
      } else {
        toast({
          title: t('aws.missingPermissions', '⚠️ Missing permissions'),
          description: t('aws.missingPermissionsDescription', '{{denied}} of {{total}} permissions are missing', { denied: data.summary.denied, total: data.summary.total }),
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error testing permissions:', error);
      toast({
        title: t('aws.testPermissionsError', '❌ Error testing permissions'),
        description: error instanceof Error ? error.message : t('common.error', 'Unknown error'),
        variant: "destructive",
      });
    } finally {
      setTestingAccountId(null);
    }
  };

  const confirmDelete = async () => {
    if (!accountToDelete) return;

    try {
      // Use Lambda endpoint instead of REST to avoid CORS issues
      const result = await apiClient.invoke('update-aws-credentials', {
        body: { id: accountToDelete, is_active: false }
      });

      if (result.error) throw new Error(result.error.message || t('aws.deactivateError', 'Error deactivating account'));

      toast({
        title: t('aws.accountDeactivated', '✅ Account deactivated'),
        description: t('aws.accountDeactivatedDescription', 'The AWS account was deactivated and will no longer be used'),
      });
      
      await queryClient.invalidateQueries({ queryKey: ['aws-credentials-all'] });
      await queryClient.invalidateQueries({ queryKey: ['aws-credentials-check'] });
      await queryClient.invalidateQueries({ queryKey: ['aws-validation-status'] });
      await queryClient.invalidateQueries({ queryKey: ['aws-accounts'] });
      await refetch();
      
    } catch (error) {
      console.error('Error deactivating credentials:', error);
      toast({
        title: t('common.error', '❌ Error'),
        description: error instanceof Error ? error.message : t('aws.deactivateError', 'Error deactivating credentials'),
        variant: "destructive",
      });
    } finally {
      setAccountToDelete(null);
    }
  };

  const handleEditAccount = (account: any) => {
    setEditingAccount(account);
    setEditRegions(account.regions || []);
    setEditAccountName(account.account_name || "");
  };

  const handleSaveEdit = async () => {
    if (!editingAccount || editRegions.length === 0) {
      toast({
        title: t('aws.requiredFields', 'Required fields'),
        description: t('aws.selectAtLeastOneRegion', 'Select at least one region'),
        variant: "destructive",
      });
      return;
    }

    try {
      // Use Lambda endpoint instead of REST to avoid CORS issues
      const result = await apiClient.invoke('update-aws-credentials', {
        body: {
          id: editingAccount.id,
          regions: editRegions,
          account_name: editAccountName,
        }
      });

      if (result.error) throw new Error(result.error.message || t('aws.updateError', 'Error updating account'));

      toast({
        title: t('aws.accountUpdated', '✅ Account updated'),
        description: t('aws.accountUpdatedDescription', 'Account settings were updated successfully'),
      });

      await queryClient.invalidateQueries({ queryKey: ['aws-credentials-all'] });
      await queryClient.invalidateQueries({ queryKey: ['aws-accounts-status'] });
      await refetch();
      
      setEditingAccount(null);
      setEditRegions([]);
      setEditAccountName("");
    } catch (error) {
      console.error('Error updating account:', error);
      toast({
        title: t('common.error', '❌ Error'),
        description: error instanceof Error ? error.message : t('aws.updateError', 'Error updating account'),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Warning for legacy access key accounts */}
      {hasLegacyAccounts && (
        <Alert variant="destructive" className="border-orange-400 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/40">
          <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          <AlertDescription className="space-y-2">
            <p className="font-semibold text-orange-800 dark:text-orange-200">
              {t('aws.legacyAccountsWarning', 'You have {{count}} account(s) using Access Keys (deprecated method)', { count: legacyAccounts.length })}
            </p>
            <p className="text-sm text-orange-700 dark:text-orange-300">
              {t('aws.legacyAccountsRecommendation', 'For security, we recommend migrating to IAM Role via CloudFormation. Deactivate legacy accounts and add them again using the recommended method below.')}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {legacyAccounts.map(acc => (
                <span key={acc.id} className="text-xs bg-orange-100 dark:bg-orange-900/60 text-orange-800 dark:text-orange-200 px-2 py-1 rounded-md font-medium border border-orange-200 dark:border-orange-700">
                  {acc.account_name}
                </span>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Connected Accounts List */}
      {allAccounts && allAccounts.length > 0 && (
        <Card className="border-border shadow-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                <CardTitle>{t('aws.connectedAccounts', 'Connected AWS Accounts')} ({allAccounts.length})</CardTitle>
              </div>
              {credentials && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncOrgMutation.mutate(credentials.id)}
                  disabled={syncOrgMutation.isPending}
                  className="gap-2"
                >
                  <Building2 className={`w-4 h-4 ${syncOrgMutation.isPending ? 'animate-spin' : ''}`} />
                  {syncOrgMutation.isPending ? t('aws.syncing', 'Syncing...') : t('aws.syncOrganization', 'Sync Organization')}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {allAccounts.map((account) => (
              <div key={account.id} className={`p-4 border rounded-lg ${
                account.access_key_id?.startsWith(ROLE_PREFIX) 
                  ? 'bg-card border-border shadow-sm' 
                  : 'bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-800'
              }`}>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{account.account_name}</p>
                      {account.access_key_id?.startsWith(ROLE_PREFIX) ? (
                        <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 rounded-md flex items-center gap-1 font-medium border border-blue-200 dark:border-blue-700">
                          <CloudCog className="w-3 h-3" />
                          {t('aws.iamRole', 'IAM Role')}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/60 text-orange-800 dark:text-orange-200 rounded-md flex items-center gap-1 font-medium border border-orange-200 dark:border-orange-700">
                          <AlertTriangle className="w-3 h-3" />
                          {t('aws.legacy', 'Legacy (migrate)')}
                        </span>
                      )}
                      {!account.is_active && (
                        <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200 rounded-md font-medium border border-red-200 dark:border-red-700">
                          {t('aws.inactive', 'Inactive')}
                        </span>
                      )}
                    </div>
                    {account.accountId && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium">ID:</span> {account.accountId}
                      </p>
                    )}
                    <div className="mt-3 space-y-2">
                      {account.access_key_id?.startsWith(ROLE_PREFIX) ? (
                        <>
                          <p className="text-xs text-foreground">
                            <span className="font-medium text-muted-foreground">{t('aws.roleArn', 'Role ARN')}:</span>{' '}
                            <span className="font-mono bg-muted/80 px-1.5 py-0.5 rounded">{account.access_key_id.replace(ROLE_PREFIX, '')}</span>
                          </p>
                          {account.external_id && (
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-foreground">
                                <span className="font-medium text-muted-foreground">{t('aws.externalId', 'External ID')}:</span>{' '}
                                <span className="font-mono bg-muted/80 px-1.5 py-0.5 rounded">{account.external_id}</span>
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1"
                                onClick={async () => {
                                  await navigator.clipboard.writeText(account.external_id);
                                  toast({
                                    title: t('aws.externalIdCopied', 'External ID copied!'),
                                    description: t('aws.externalIdCopiedDescription', 'The External ID was copied to clipboard'),
                                  });
                                }}
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-orange-800 dark:text-orange-200 font-medium">
                          {t('aws.legacyAccountWarning', '⚠️ This account uses access keys. We recommend migrating to IAM Role.')}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {account.regions?.map((region: string) => (
                        <span 
                          key={region}
                          className="text-xs bg-primary/15 text-primary font-medium px-2 py-0.5 rounded-md border border-primary/20"
                        >
                          {region}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestPermissions(account.id)}
                      disabled={!account.is_active || testingAccountId === account.id}
                      className="gap-1.5"
                    >
                      {testingAccountId === account.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-4 h-4" />
                      )}
                      {t('aws.testPermissions', 'Test Permissions')}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEditAccount(account)}
                      title={t('aws.editAccount', 'Edit account')}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setAccountToDelete(account.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      title={t('aws.deactivateAccount', 'Deactivate account')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Add New Account - CloudFormation Only */}
      <Card className="border-border shadow-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CloudCog className="w-5 h-5 text-primary" />
            <CardTitle>{t('aws.connectNewAccount', 'Connect New AWS Account')}</CardTitle>
          </div>
          <CardDescription>
            {t('aws.connectNewAccountDescription', 'Use CloudFormation to automatically configure the required permissions with IAM Role')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CloudFormationDeploy />
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!accountToDelete} onOpenChange={() => setAccountToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('aws.confirmDeactivation', 'Confirm account deactivation')}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                {t('aws.confirmDeactivationDescription', 'Are you sure you want to deactivate this AWS account?')}
              </p>
              <p className="text-muted-foreground">
                {t('aws.deactivationExplanation', 'The account will be deactivated and will no longer appear in the active accounts list. Historical data will be kept and the account will no longer be used for new queries.')}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('aws.deactivate', 'Deactivate Account')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editingAccount} onOpenChange={() => setEditingAccount(null)}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>{t('aws.editAwsAccount', 'Edit AWS Account')}</DialogTitle>
            <DialogDescription>
              {t('aws.editAwsAccountDescription', 'Update the name and monitored regions for this account')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-account-name">{t('aws.accountName', 'Account Name')}</Label>
              <Input
                id="edit-account-name"
                value={editAccountName}
                onChange={(e) => setEditAccountName(e.target.value)}
                placeholder={t('aws.accountName', 'Account Name')}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-regions">{t('aws.awsRegions', 'AWS Regions')}</Label>
              <RegionSelector 
                selectedRegions={editRegions}
                onChange={setEditRegions}
              />
              <p className="text-xs text-muted-foreground">
                {t('aws.selectRegionsToMonitor', 'Select the AWS regions you want to monitor')}
              </p>
            </div>

            {editingAccount && (
              <div className="bg-muted/80 p-4 rounded-lg space-y-2 border border-border">
                {editingAccount.access_key_id?.startsWith(ROLE_PREFIX) ? (
                  <p className="text-sm text-foreground">
                    <span className="font-medium text-muted-foreground">{t('aws.roleArn', 'Role ARN')}:</span>{' '}
                    <span className="font-mono text-xs bg-background px-2 py-1 rounded border border-border">{editingAccount.access_key_id.replace(ROLE_PREFIX, '')}</span>
                  </p>
                ) : (
                  <p className="text-sm text-orange-800 dark:text-orange-200 font-medium">
                    {t('aws.legacyMethodWarning', '⚠️ Account using legacy method. Consider migrating to IAM Role.')}
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAccount(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSaveEdit}>
              {t('aws.saveChanges', 'Save Changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permission Test Results Dialog */}
      <Dialog open={!!permissionResults} onOpenChange={() => setPermissionResults(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              {t('aws.permissionTestResults', 'Permission Test Results')}
            </DialogTitle>
            <DialogDescription>
              {permissionResults?.principalArn && (
                <span className="font-mono text-xs">{permissionResults.principalArn}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          {permissionResults && (
            <div className="space-y-4 py-2">
              {/* Summary */}
              <div className={`p-4 rounded-lg border ${
                permissionResults.valid 
                  ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' 
                  : 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'
              }`}>
                <div className="flex items-center gap-3">
                  {permissionResults.valid ? (
                    <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400 shrink-0" />
                  )}
                  <div>
                    <p className="font-semibold text-foreground">
                      {permissionResults.valid 
                        ? t('aws.allPermissionsGranted', 'All permissions granted')
                        : t('aws.somePermissionsMissing', 'Some permissions are missing')
                      }
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('aws.permissionsSummary', '{{allowed}} of {{total}} permissions ({{percentage}}%)', {
                        allowed: permissionResults.summary.allowed,
                        total: permissionResults.summary.total,
                        percentage: permissionResults.summary.percentage,
                      })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Permission list */}
              <div className="max-h-[40vh] overflow-y-auto space-y-1 pr-1">
                {permissionResults.results?.map((perm: PermissionResult) => (
                  <div key={perm.action} className="flex items-center justify-between py-1.5 px-3 rounded-md hover:bg-muted/50 text-sm">
                    <span className="font-mono text-xs text-foreground">{perm.action}</span>
                    {perm.allowed ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
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
};

export default AwsCredentialsManager;
