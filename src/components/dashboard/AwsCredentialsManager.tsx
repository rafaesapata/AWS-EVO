import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { Key, Trash2, Building2, TestTube, Pencil, CloudCog, Copy, AlertTriangle } from "lucide-react";
import { RegionSelector } from "./RegionSelector";
import CloudFormationDeploy from "./CloudFormationDeploy";
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

// Helper to convert CloudAccount to AwsAccountExtended
function toAwsAccountExtended(account: CloudAccount): AwsAccountExtended {
  return {
    ...account,
    access_key_id: account.roleArn ? `ROLE:${account.roleArn}` : undefined,
    account_name: account.accountName,
    is_active: account.isActive,
    external_id: undefined, // Will be fetched from API if needed
  };
}


const AwsCredentialsManager = () => {
  const { toast } = useToast();
  const { data: organizationId, isLoading: isLoadingOrg, error: orgError } = useOrganization();
  const queryClient = useQueryClient();
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);
  const [editRegions, setEditRegions] = useState<string[]>([]);
  const [editAccountName, setEditAccountName] = useState("");

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
  const legacyAccounts = allAccounts?.filter(acc => !acc.access_key_id?.startsWith('ROLE:')) || [];
  const hasLegacyAccounts = legacyAccounts.length > 0;

  // Sync organization accounts
  const syncOrgMutation = useMutation({
    mutationFn: async (payerAccountId: string) => {
      const result = await apiClient.invoke('sync-organization-accounts', {
        body: { payerAccountId }
      });
      
      if (result.error) throw new Error(result.error.message || 'Erro ao sincronizar contas');
      return result.data;
    },
    onSuccess: (data) => {
      toast({
        title: "Contas sincronizadas!",
        description: `${data.data.syncedAccounts} contas membros foram sincronizadas.`,
      });
      queryClient.invalidateQueries({ queryKey: ['aws-credentials-all'] });
    },
    onError: (error: any) => {
      console.error('Error syncing organization:', error);
      
      let errorMessage = error.message || "Não foi possível sincronizar as contas da organização";
      
      if (errorMessage.includes('AccessDenied') || errorMessage.includes("don't have permissions")) {
        errorMessage = "Permissão AWS insuficiente. É necessária a permissão 'organizations:ListAccounts' no IAM.";
      }
      
      toast({
        title: "Erro ao sincronizar",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleTestCredentials = async (accountId: string) => {
    try {
      toast({
        title: "Testando credenciais...",
        description: "Validando conexão e permissões AWS",
      });

      const result = await apiClient.invoke('validate-aws-credentials', {
        body: { accountId }
      });

      if (result.error) throw new Error(result.error.message || 'Erro ao validar credenciais');
      const data = result.data;

      await queryClient.invalidateQueries({ queryKey: ['aws-validation-status'] });
      await queryClient.refetchQueries({ queryKey: ['aws-validation-status'] });
      
      if (data.isValid) {
        if (data.has_all_permissions === false) {
          toast({
            title: "⚠️ Credenciais válidas com ressalvas",
            description: "Conexão OK, mas algumas permissões estão faltando",
            variant: "default",
          });
          window.dispatchEvent(new Event('switchToPermissionsTab'));
        } else {
          toast({
            title: "✅ Credenciais válidas",
            description: "Conexão e permissões verificadas com sucesso",
          });
        }
      } else {
        throw new Error(data.error || 'Falha na validação');
      }

      refetch();
    } catch (error) {
      console.error('Error testing credentials:', error);
      toast({
        title: "❌ Erro ao testar credenciais",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      await queryClient.invalidateQueries({ queryKey: ['aws-validation-status'] });
      await queryClient.refetchQueries({ queryKey: ['aws-validation-status'] });
    }
  };

  const confirmDelete = async () => {
    if (!accountToDelete) return;

    try {
      // Use Lambda endpoint instead of REST to avoid CORS issues
      const result = await apiClient.invoke('update-aws-credentials', {
        body: { id: accountToDelete, is_active: false }
      });

      if (result.error) throw new Error(result.error.message || 'Erro ao desativar conta');

      toast({
        title: "✅ Conta desativada",
        description: "A conta AWS foi desativada e não será mais utilizada",
      });
      
      await queryClient.invalidateQueries({ queryKey: ['aws-credentials-all'] });
      await queryClient.invalidateQueries({ queryKey: ['aws-credentials-check'] });
      await queryClient.invalidateQueries({ queryKey: ['aws-validation-status'] });
      await queryClient.invalidateQueries({ queryKey: ['aws-accounts'] });
      await refetch();
      
    } catch (error) {
      console.error('Error deactivating credentials:', error);
      toast({
        title: "❌ Erro",
        description: error instanceof Error ? error.message : "Erro ao desativar credenciais",
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
        title: "Campos obrigatórios",
        description: "Selecione pelo menos uma região",
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

      if (result.error) throw new Error(result.error.message || 'Erro ao atualizar conta');

      toast({
        title: "✅ Conta atualizada",
        description: "As configurações da conta foram atualizadas com sucesso",
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
        title: "❌ Erro",
        description: error instanceof Error ? error.message : "Erro ao atualizar conta",
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
              Você possui {legacyAccounts.length} conta(s) usando Chaves de Acesso (método descontinuado)
            </p>
            <p className="text-sm text-orange-700 dark:text-orange-300">
              Por segurança, recomendamos migrar para IAM Role via CloudFormation. 
              Desative as contas legadas e adicione novamente usando o método recomendado abaixo.
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
                <CardTitle>Contas AWS Conectadas ({allAccounts.length})</CardTitle>
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
                  {syncOrgMutation.isPending ? 'Sincronizando...' : 'Sincronizar Organização'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {allAccounts.map((account) => (
              <div key={account.id} className={`p-4 border rounded-lg ${
                account.access_key_id?.startsWith('ROLE:') 
                  ? 'bg-card border-border shadow-sm' 
                  : 'bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-800'
              }`}>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{account.account_name}</p>
                      {account.access_key_id?.startsWith('ROLE:') ? (
                        <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 rounded-md flex items-center gap-1 font-medium border border-blue-200 dark:border-blue-700">
                          <CloudCog className="w-3 h-3" />
                          IAM Role
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/60 text-orange-800 dark:text-orange-200 rounded-md flex items-center gap-1 font-medium border border-orange-200 dark:border-orange-700">
                          <AlertTriangle className="w-3 h-3" />
                          Legado (migrar)
                        </span>
                      )}
                      {!account.is_active && (
                        <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200 rounded-md font-medium border border-red-200 dark:border-red-700">
                          Inativa
                        </span>
                      )}
                    </div>
                    {account.accountId && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium">ID:</span> {account.accountId}
                      </p>
                    )}
                    <div className="mt-3 space-y-2">
                      {account.access_key_id?.startsWith('ROLE:') ? (
                        <>
                          <p className="text-xs text-foreground">
                            <span className="font-medium text-muted-foreground">Role ARN:</span>{' '}
                            <span className="font-mono bg-muted/80 px-1.5 py-0.5 rounded">{account.access_key_id.replace('ROLE:', '')}</span>
                          </p>
                          {account.external_id && (
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-foreground">
                                <span className="font-medium text-muted-foreground">External ID:</span>{' '}
                                <span className="font-mono bg-muted/80 px-1.5 py-0.5 rounded">{account.external_id}</span>
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1"
                                onClick={async () => {
                                  await navigator.clipboard.writeText(account.external_id);
                                  toast({
                                    title: "External ID copiado!",
                                    description: "O External ID foi copiado para a área de transferência",
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
                          ⚠️ Esta conta usa chaves de acesso. Recomendamos migrar para IAM Role.
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
                      size="icon"
                      onClick={() => handleTestCredentials(account.id)}
                      title="Testar credenciais"
                      disabled={!account.is_active}
                    >
                      <TestTube className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEditAccount(account)}
                      title="Editar conta"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setAccountToDelete(account.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="Desativar conta"
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
            <CardTitle>Conectar Nova Conta AWS</CardTitle>
          </div>
          <CardDescription>
            Use CloudFormation para configurar automaticamente as permissões necessárias com IAM Role
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
            <AlertDialogTitle>Confirmar desativação da conta</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Tem certeza que deseja desativar esta conta AWS?
              </p>
              <p className="text-muted-foreground">
                A conta será desativada e não aparecerá mais na lista de contas ativas.
                Os dados históricos serão mantidos e a conta não será mais usada para novas consultas.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Desativar Conta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editingAccount} onOpenChange={() => setEditingAccount(null)}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Editar Conta AWS</DialogTitle>
            <DialogDescription>
              Atualize o nome e as regiões monitoradas para esta conta
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-account-name">Nome da Conta</Label>
              <Input
                id="edit-account-name"
                value={editAccountName}
                onChange={(e) => setEditAccountName(e.target.value)}
                placeholder="Nome da conta"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-regions">Regiões AWS</Label>
              <RegionSelector 
                selectedRegions={editRegions}
                onChange={setEditRegions}
              />
              <p className="text-xs text-muted-foreground">
                Selecione as regiões AWS que você deseja monitorar
              </p>
            </div>

            {editingAccount && (
              <div className="bg-muted/80 p-4 rounded-lg space-y-2 border border-border">
                {editingAccount.access_key_id?.startsWith('ROLE:') ? (
                  <p className="text-sm text-foreground">
                    <span className="font-medium text-muted-foreground">Role ARN:</span>{' '}
                    <span className="font-mono text-xs bg-background px-2 py-1 rounded border border-border">{editingAccount.access_key_id.replace('ROLE:', '')}</span>
                  </p>
                ) : (
                  <p className="text-sm text-orange-800 dark:text-orange-200 font-medium">
                    ⚠️ Conta usando método legado. Considere migrar para IAM Role.
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAccount(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit}>
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AwsCredentialsManager;
