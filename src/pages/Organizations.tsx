import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiClient } from "@/integrations/aws/api-client";
import { Layout } from "@/components/Layout";
import { 
  Building2, 
  Plus, 
  RefreshCw,
  Users,
  DollarSign,
  Edit,
  Crown,
  Shield,
  Play,
  Square,
  Clock,
  AlertTriangle,
  Mail,
  User,
  Calendar,
  Eye,
  X,
  Settings
} from "lucide-react";

interface Organization {
  id: string;
  name: string;
  description: string;
  domain: string;
  status: 'active' | 'inactive' | 'suspended';
  created_at: string;
  updated_at: string;
  user_count: number;
  aws_account_count: number;
  monthly_cost: number;
  billing_email: string;
  admin_users: string[];
  demo_mode?: boolean;
  demo_activated_at?: string | null;
  demo_expires_at?: string | null;
}

interface OrganizationUser {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
  email?: string;
}

export default function Organizations() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [demoDialogOrg, setDemoDialogOrg] = useState<Organization | null>(null);
  const [demoAction, setDemoAction] = useState<'activate' | 'deactivate' | null>(null);
  const [demoDays, setDemoDays] = useState('30');
  const [demoReason, setDemoReason] = useState('');
  const [viewingUsersOrg, setViewingUsersOrg] = useState<Organization | null>(null);
  const [newOrg, setNewOrg] = useState({
    name: '',
    description: '',
    domain: '',
    billing_email: ''
  });

  // Get organizations (Super Admin only) - uses dedicated Lambda handler
  const { data: organizations, isLoading, refetch } = useQuery({
    queryKey: ['organizations'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.invoke<Organization[]>('manage-organizations', {
        body: { action: 'list' }
      });

      if (response.error) {
        throw new Error(typeof response.error === 'string' ? response.error : response.error.message);
      }

      return response.data || [];
    },
  });

  // Get users for a specific organization
  const { data: organizationUsers, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['organization-users', viewingUsersOrg?.id],
    enabled: !!viewingUsersOrg,
    queryFn: async () => {
      if (!viewingUsersOrg) return [];
      
      const response = await apiClient.invoke<OrganizationUser[]>('manage-organizations', {
        body: { action: 'list_users', id: viewingUsersOrg.id }
      });

      if (response.error) {
        throw new Error(typeof response.error === 'string' ? response.error : response.error.message);
      }

      return response.data || [];
    },
  });

  // Create organization
  const createOrgMutation = useMutation({
    mutationFn: async (orgData: typeof newOrg) => {
      const response = await apiClient.invoke('manage-organizations', {
        body: {
          action: 'create',
          name: orgData.name,
          description: orgData.description,
          domain: orgData.domain,
          billing_email: orgData.billing_email,
        }
      });

      if (response.error) {
        throw new Error(typeof response.error === 'string' ? response.error : response.error.message);
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Organização criada",
        description: "A organização foi criada com sucesso.",
      });
      setIsCreateDialogOpen(false);
      setNewOrg({
        name: '',
        description: '',
        domain: '',
        billing_email: ''
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar organização",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  });

  // Update organization
  const updateOrgMutation = useMutation({
    mutationFn: async (orgData: Partial<Organization> & { id: string }) => {
      const response = await apiClient.invoke('manage-organizations', {
        body: {
          action: 'update',
          id: orgData.id,
          name: orgData.name,
          description: orgData.description,
          domain: orgData.domain,
          billing_email: orgData.billing_email,
        }
      });

      if (response.error) {
        throw new Error(typeof response.error === 'string' ? response.error : response.error.message);
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Organização atualizada",
        description: "A organização foi atualizada com sucesso.",
      });
      setEditingOrg(null);
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar organização",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  });

  // Toggle organization status
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiClient.invoke('manage-organizations', {
        body: {
          action: 'toggle_status',
          id,
          status,
        }
      });

      if (response.error) {
        throw new Error(typeof response.error === 'string' ? response.error : response.error.message);
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Status atualizado",
        description: "O status da organização foi atualizado.",
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar status",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  });

  // Toggle demo mode
  const toggleDemoMutation = useMutation({
    mutationFn: async ({ organizationId, action, expiresInDays, reason }: { 
      organizationId: string; 
      action: 'activate' | 'deactivate'; 
      expiresInDays?: number;
      reason?: string;
    }) => {
      const response = await apiClient.invoke('manage-demo-mode', {
        body: {
          action,
          organizationId,
          expiresInDays,
          reason
        }
      });

      if (response.error) {
        throw new Error(typeof response.error === 'string' ? response.error : response.error.message);
      }

      return response.data;
    },
    onSuccess: (_, variables) => {
      toast({
        title: variables.action === 'activate' 
          ? t('demo.admin.activated', 'Modo demo ativado com sucesso')
          : t('demo.admin.deactivated', 'Modo demo desativado com sucesso'),
      });
      setDemoDialogOrg(null);
      setDemoAction(null);
      setDemoDays('30');
      setDemoReason('');
      refetch();
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Erro'),
        description: error instanceof Error ? error.message : t('common.unknownError', 'Erro desconhecido'),
        variant: "destructive"
      });
    }
  });

  const handleCreateOrg = () => {
    if (!newOrg.name || !newOrg.domain || !newOrg.billing_email) {
      toast({
        title: "Campos obrigatórios",
        description: "Nome, domínio e email de cobrança são obrigatórios.",
        variant: "destructive"
      });
      return;
    }

    createOrgMutation.mutate(newOrg);
  };

  const handleUpdateOrg = () => {
    if (!editingOrg) return;

    updateOrgMutation.mutate(editingOrg);
  };

  const handleRefresh = async () => {
    try {
      await refetch();
      toast({
        title: "Dados atualizados",
        description: "As organizações foram atualizadas.",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar os dados.",
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge className="bg-green-500">Ativa</Badge>;
      case 'inactive': return <Badge variant="secondary">Inativa</Badge>;
      case 'suspended': return <Badge variant="destructive">Suspensa</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDemoExpirationDays = (expiresAt: string | null | undefined): number | null => {
    if (!expiresAt) return null;
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffTime = expires.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleDemoAction = (org: Organization, action: 'activate' | 'deactivate') => {
    setDemoDialogOrg(org);
    setDemoAction(action);
  };

  const confirmDemoAction = () => {
    if (!demoDialogOrg || !demoAction) return;
    
    toggleDemoMutation.mutate({
      organizationId: demoDialogOrg.id,
      action: demoAction,
      expiresInDays: demoAction === 'activate' ? parseInt(demoDays) : undefined,
      reason: demoReason || undefined
    });
  };

  // Calculate summary metrics
  const totalOrgs = organizations?.length || 0;
  const activeOrgs = organizations?.filter(org => org.status === 'active').length || 0;
  const totalUsers = organizations?.reduce((sum, org) => sum + org.user_count, 0) || 0;
  const totalMonthlyCost = organizations?.reduce((sum, org) => sum + org.monthly_cost, 0) || 0;

  return (
    <Layout 
      title={t('sidebar.organizations', 'Gestão de Organizações')} 
      description={t('organizations.description', 'Gestão multi-tenant de organizações - Acesso Super Admin')}
      icon={<Building2 className="h-5 w-5" />}
      userRole="super_admin"
    >
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Organizações</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-semibold">{totalOrgs}</div>
            )}
          </CardContent>
        </Card>

        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Organizações Ativas</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-semibold text-green-500">{activeOrgs}</div>
            )}
          </CardContent>
        </Card>

        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Usuários</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-semibold">{totalUsers}</div>
            )}
          </CardContent>
        </Card>

        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Custo Total Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-semibold text-blue-500">
                ${totalMonthlyCost.toFixed(2)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Organizations List */}
      <Card >
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Lista de Organizações</CardTitle>
            <CardDescription>Gerencie todas as organizações do sistema</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Organização
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : organizations && organizations.length > 0 ? (
            <div className="space-y-4">
              {organizations.map((org) => (
                <div key={org.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-sm">{org.name}</h4>
                        {getStatusBadge(org.status)}
                        <Badge variant="outline">{org.domain}</Badge>
                        {org.demo_mode && (
                          <Badge className="bg-amber-500 text-white">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {t('demo.explainer.badge', 'DEMO')}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{org.description}</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>{org.user_count} usuários</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-muted-foreground" />
                          <span>{org.aws_account_count} contas AWS</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <span>${org.monthly_cost.toFixed(2)}/mês</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Criada: {new Date(org.created_at).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Email de cobrança:</span>
                        <span className="ml-2">{org.billing_email}</span>
                      </div>
                      
                      {/* Demo Mode Info */}
                      {org.demo_mode && org.demo_expires_at && (
                        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                          <Clock className="h-4 w-4" />
                          <span>
                            {t('demo.admin.expiresIn', 'Expira em')}: {getDemoExpirationDays(org.demo_expires_at)} {t('common.days', 'dias')}
                          </span>
                          {org.demo_activated_at && (
                            <span className="text-muted-foreground">
                              ({t('demo.admin.activatedAt', 'Ativado em')}: {new Date(org.demo_activated_at).toLocaleDateString('pt-BR')})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {/* View Users Button with Tooltip */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setViewingUsersOrg(org)}
                              className="text-blue-600 border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                            >
                              <Users className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('organizations.viewUsers', 'Ver usuários')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      {/* Demo Mode Toggle Button with Tooltip */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {org.demo_mode ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDemoAction(org, 'deactivate')}
                                className="text-amber-600 border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
                              >
                                <Square className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDemoAction(org, 'activate')}
                                className="text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              {org.demo_mode 
                                ? t('demo.admin.tooltipDeactivate', 'Desativar modo demo - Exibir dados reais')
                                : t('demo.admin.tooltipActivate', 'Ativar modo demo - Exibir dados fictícios')
                              }
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      {/* Edit Button with Tooltip */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingOrg(org)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('organizations.editOrg', 'Editar organização')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                  
                  {org.admin_users && org.admin_users.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Administradores:</p>
                      <div className="flex gap-2 flex-wrap">
                        {org.admin_users.map((admin, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs gap-1">
                            <Crown className="h-3 w-3" />
                            {admin}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Building2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">Nenhuma organização encontrada</h3>
              <p className="text-muted-foreground mb-4">
                Crie a primeira organização para começar.
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeira Organização
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Organization Dialog */}
      {editingOrg && (
        <Dialog open={!!editingOrg} onOpenChange={() => setEditingOrg(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar Organização</DialogTitle>
              <DialogDescription>
                Atualize as informações da organização
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Nome da Organização</Label>
                  <Input
                    id="edit-name"
                    value={editingOrg.name}
                    onChange={(e) => setEditingOrg(prev => prev ? { ...prev, name: e.target.value } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-domain">Domínio</Label>
                  <Input
                    id="edit-domain"
                    value={editingOrg.domain}
                    onChange={(e) => setEditingOrg(prev => prev ? { ...prev, domain: e.target.value } : null)}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-description">Descrição</Label>
                <Textarea
                  id="edit-description"
                  value={editingOrg.description}
                  onChange={(e) => setEditingOrg(prev => prev ? { ...prev, description: e.target.value } : null)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-billing-email">Email de Cobrança</Label>
                <Input
                  id="edit-billing-email"
                  type="email"
                  value={editingOrg.billing_email}
                  onChange={(e) => setEditingOrg(prev => prev ? { ...prev, billing_email: e.target.value } : null)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingOrg(null)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdateOrg} disabled={updateOrgMutation.isPending}>
                {updateOrgMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Organization Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Criar Nova Organização</DialogTitle>
            <DialogDescription>
              Adicione uma nova organização ao sistema multi-tenant
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Organização</Label>
                <Input
                  id="name"
                  value={newOrg.name}
                  onChange={(e) => setNewOrg(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Acme Corporation"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">Domínio</Label>
                <Input
                  id="domain"
                  value={newOrg.domain}
                  onChange={(e) => setNewOrg(prev => ({ ...prev, domain: e.target.value }))}
                  placeholder="acme.com"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={newOrg.description}
                onChange={(e) => setNewOrg(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descrição da organização"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="billing_email">Email de Cobrança</Label>
              <Input
                id="billing_email"
                type="email"
                value={newOrg.billing_email}
                onChange={(e) => setNewOrg(prev => ({ ...prev, billing_email: e.target.value }))}
                placeholder="billing@acme.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateOrg} disabled={createOrgMutation.isPending}>
              {createOrgMutation.isPending ? 'Criando...' : 'Criar Organização'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Demo Mode Confirmation Dialog */}
      <AlertDialog open={!!demoDialogOrg && !!demoAction} onOpenChange={(open) => {
        if (!open) {
          setDemoDialogOrg(null);
          setDemoAction(null);
          setDemoDays('30');
          setDemoReason('');
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {demoAction === 'activate' 
                ? t('demo.admin.activate', 'Ativar Demo')
                : t('demo.admin.deactivate', 'Desativar Demo')
              }
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                {demoAction === 'activate'
                  ? t('demo.admin.confirmActivate', 'Tem certeza que deseja ativar o modo demo? Todos os dados exibidos serão fictícios.')
                  : t('demo.admin.confirmDeactivate', 'Tem certeza que deseja desativar o modo demo? Os dados reais serão exibidos.')
                }
              </p>
              {demoDialogOrg && (
                <p className="font-medium">
                  {t('common.organization', 'Organização')}: {demoDialogOrg.name}
                </p>
              )}
              
              {demoAction === 'activate' && (
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="demo-days">{t('demo.admin.daysToExtend', 'Dias para estender')}</Label>
                    <Select value={demoDays} onValueChange={setDemoDays}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 {t('common.days', 'dias')}</SelectItem>
                        <SelectItem value="14">14 {t('common.days', 'dias')}</SelectItem>
                        <SelectItem value="30">30 {t('common.days', 'dias')}</SelectItem>
                        <SelectItem value="60">60 {t('common.days', 'dias')}</SelectItem>
                        <SelectItem value="90">90 {t('common.days', 'dias')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="demo-reason">{t('demo.admin.reason', 'Motivo')} ({t('common.optional', 'opcional')})</Label>
                    <Textarea
                      id="demo-reason"
                      value={demoReason}
                      onChange={(e) => setDemoReason(e.target.value)}
                      placeholder={t('demo.admin.reasonPlaceholder', 'Motivo da ativação/desativação...')}
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancelar')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDemoAction}
              disabled={toggleDemoMutation.isPending}
              className={demoAction === 'activate' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-500 hover:bg-red-600'}
            >
              {toggleDemoMutation.isPending 
                ? t('common.processing', 'Processando...')
                : demoAction === 'activate' 
                  ? t('demo.admin.activate', 'Ativar Demo')
                  : t('demo.admin.deactivate', 'Desativar Demo')
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Users Dialog */}
      <Dialog open={!!viewingUsersOrg} onOpenChange={(open) => !open && setViewingUsersOrg(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t('organizations.usersOf', 'Usuários de')} {viewingUsersOrg?.name}
            </DialogTitle>
            <DialogDescription>
              {t('organizations.usersDescription', 'Lista de usuários cadastrados nesta organização')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto">
            {isLoadingUsers ? (
              <div className="space-y-3 p-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : organizationUsers && organizationUsers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('organizations.userName', 'Nome')}</TableHead>
                    <TableHead>{t('organizations.userEmail', 'Email')}</TableHead>
                    <TableHead>{t('organizations.userRole', 'Função')}</TableHead>
                    <TableHead>{t('organizations.userCreatedAt', 'Cadastrado em')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {organizationUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {user.full_name || t('organizations.noName', 'Sem nome')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          {user.email || t('organizations.noEmail', 'Não disponível')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'org_admin' ? 'default' : 'secondary'}>
                          {user.role === 'org_admin' 
                            ? t('organizations.roleAdmin', 'Admin') 
                            : user.role === 'super_admin'
                              ? t('organizations.roleSuperAdmin', 'Super Admin')
                              : t('organizations.roleUser', 'Usuário')
                          }
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          {new Date(user.created_at).toLocaleDateString('pt-BR')}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {t('organizations.noUsers', 'Nenhum usuário encontrado nesta organização')}
                </p>
              </div>
            )}
          </div>
          
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setViewingUsersOrg(null)}>
              {t('common.close', 'Fechar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </Layout>
  );
}