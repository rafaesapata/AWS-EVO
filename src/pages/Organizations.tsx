import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/integrations/aws/api-client";
import { Layout } from "@/components/Layout";
import { 
  Building2, 
  Plus, 
  RefreshCw,
  Users,
  DollarSign,
  Settings,
  Edit,
  Trash2,
  Crown,
  Shield
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
}

export default function Organizations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [newOrg, setNewOrg] = useState({
    name: '',
    description: '',
    domain: '',
    billing_email: ''
  });

  // Get organizations (Super Admin only)
  const { data: organizations, isLoading, refetch } = useQuery({
    queryKey: ['organizations'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.select('organizations', {
        select: '*',
        order: { created_at: 'desc' }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return response.data || [];
    },
  });

  // Create organization
  const createOrgMutation = useMutation({
    mutationFn: async (orgData: typeof newOrg) => {
      const response = await apiClient.insert('organizations', {
        ...orgData,
        status: 'active',
        user_count: 0,
        aws_account_count: 0,
        monthly_cost: 0,
        admin_users: []
      });

      if (response.error) {
        throw new Error(response.error);
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
      const response = await apiClient.update('organizations', {
        ...orgData,
        updated_at: new Date().toISOString()
      });

      if (response.error) {
        throw new Error(response.error);
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
      const response = await apiClient.update('organizations', {
        id,
        status,
        updated_at: new Date().toISOString()
      });

      if (response.error) {
        throw new Error(response.error);
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

  // Calculate summary metrics
  const totalOrgs = organizations?.length || 0;
  const activeOrgs = organizations?.filter(org => org.status === 'active').length || 0;
  const totalUsers = organizations?.reduce((sum, org) => sum + org.user_count, 0) || 0;
  const totalMonthlyCost = organizations?.reduce((sum, org) => sum + org.monthly_cost, 0) || 0;

  return (
    <Layout 
      title="Gestão de Organizações" 
      description="Gestão multi-tenant de organizações - Acesso Super Admin"
      icon={<Building2 className="h-5 w-5 text-white" />}
      userRole="super_admin"
    >
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Organizações</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">{totalOrgs}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Organizações Ativas</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-green-500">{activeOrgs}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Usuários</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{totalUsers}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Custo Total Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-blue-500">
                ${totalMonthlyCost.toFixed(2)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Organizations List */}
      <Card className="glass border-primary/20">
        <CardHeader>
          <CardTitle>Lista de Organizações</CardTitle>
          <CardDescription>Gerencie todas as organizações do sistema</CardDescription>
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
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-lg">{org.name}</h4>
                        {getStatusBadge(org.status)}
                        <Badge variant="outline">{org.domain}</Badge>
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
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingOrg(org)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleStatusMutation.mutate({ 
                          id: org.id, 
                          status: org.status === 'active' ? 'inactive' : 'active' 
                        })}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
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
      </div>
    </Layout>
  );
}