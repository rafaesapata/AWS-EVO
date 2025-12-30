import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useOrganization } from "@/hooks/useOrganization";
import { Layout } from "@/components/Layout";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useAuthSafe } from "@/hooks/useAuthSafe";
import { 
  Users, 
  Plus, 
  Edit, 
  Trash2, 
  Shield, 
  Key,
  Mail,
  Calendar,
  CheckCircle,
  XCircle,
  RefreshCw,
  Search,
  Filter,
  UserPlus,
  Settings,
  Building2
} from "lucide-react";

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'viewer' | 'super_admin';
  status: 'active' | 'inactive' | 'pending';
  last_login: string | null;
  created_at: string;
  updated_at: string;
  permissions: string[];
  aws_accounts: string[];
}

interface Organization {
  id: string;
  name: string;
  slug: string;
}

export default function UserManagement() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: organizationId } = useOrganization();
  const { user: authUser } = useAuthSafe();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [newUser, setNewUser] = useState({
    email: '',
    name: '',
    role: 'user' as const,
    permissions: [] as string[],
    aws_accounts: [] as string[],
    organizationId: '' // For super_admin to select target org
  });

  // Check if current user is super_admin
  const userRoles = authUser?.attributes?.['custom:roles'] || '';
  const isSuperAdmin = userRoles.includes('super_admin');
  const isAdmin = isSuperAdmin || userRoles.includes('admin');

  // Fetch all organizations (only for super_admin)
  const { data: organizations } = useQuery({
    queryKey: ['organizations-list'],
    enabled: isSuperAdmin,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.invoke('manage-organizations', {
        body: { action: 'list' }
      });
      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }
      return response.data as Organization[];
    },
  });

  // Get users
  const { data: users, isLoading, refetch } = useQuery({
    queryKey: ['users', organizationId, searchTerm, roleFilter, statusFilter],
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      // Query profiles table which has organization_id and role
      let filters: any = { organization_id: organizationId };

      if (roleFilter !== 'all') {
        filters.role = roleFilter;
      }

      const response = await apiClient.select('profiles', {
        select: '*',
        eq: filters,
        order: { column: 'created_at', ascending: false }
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      let filteredUsers = (response.data || []).map((profile: any) => ({
        id: profile.id,
        email: profile.full_name || 'N/A', // Profile doesn't have email, use full_name
        name: profile.full_name || 'Usuário',
        role: profile.role || 'user',
        status: 'active', // Default status since profiles don't have status
        last_login: null,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
        permissions: [],
        aws_accounts: [],
        user_id: profile.user_id
      }));

      // Apply search filter
      if (searchTerm) {
        filteredUsers = filteredUsers.filter((user: any) => 
          (user.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (user.name || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      // Apply status filter (simulated since profiles don't have status)
      if (statusFilter !== 'all') {
        // For now, all profiles are considered active
        if (statusFilter !== 'active') {
          filteredUsers = [];
        }
      }

      return filteredUsers;
    },
  });

  // Use centralized AWS account context instead of direct API call
  const { accounts: awsAccounts } = useAwsAccount();

  // Create user
  const createUserMutation = useMutation({
    mutationFn: async (userData: typeof newUser) => {
      // Determine target organization
      const targetOrgId = isSuperAdmin && userData.organizationId 
        ? userData.organizationId 
        : organizationId;

      // Create user in Cognito first
      const cognitoResponse = await apiClient.invoke('create-cognito-user', {
        body: {
          email: userData.email,
          name: userData.name,
          temporaryPassword: generateTemporaryPassword(),
          role: JSON.stringify([userData.role]),
          organizationId: targetOrgId // Super admin can specify different org
        }
      });

      if (cognitoResponse.error) {
        throw new Error(getErrorMessage(cognitoResponse.error));
      }

      // Create user record in database
      const response = await apiClient.insert('users', {
        ...userData,
        organization_id: targetOrgId,
        status: 'pending',
        cognito_user_id: cognitoResponse.data.userId
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Usuário criado",
        description: "O usuário foi criado com sucesso. Um email de convite foi enviado.",
      });
      setIsCreateDialogOpen(false);
      setNewUser({
        email: '',
        name: '',
        role: 'user',
        permissions: [],
        aws_accounts: [],
        organizationId: ''
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar usuário",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  });

  // Update user
  const updateUserMutation = useMutation({
    mutationFn: async (userData: Partial<User> & { id: string }) => {
      const response = await apiClient.update('users', userData);

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Usuário atualizado",
        description: "As informações do usuário foram atualizadas com sucesso.",
      });
      setEditingUser(null);
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar usuário",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  });

  // Delete user
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Disable user in Cognito first
      await apiClient.invoke('disable-cognito-user', { body: { userId } });

      // Update user status in database
      const response = await apiClient.update('users', {
        id: userId,
        status: 'inactive'
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Usuário desativado",
        description: "O usuário foi desativado com sucesso.",
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Erro ao desativar usuário",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  });

  const generateTemporaryPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const handleCreateUser = () => {
    if (!newUser.email || !newUser.name) {
      toast({
        title: "Campos obrigatórios",
        description: "Email e nome são obrigatórios.",
        variant: "destructive"
      });
      return;
    }

    createUserMutation.mutate(newUser);
  };

  const handleUpdateUser = () => {
    if (!editingUser) return;

    updateUserMutation.mutate(editingUser);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin': return <Badge className="bg-red-500">Super Admin</Badge>;
      case 'admin': return <Badge className="bg-blue-500">Admin</Badge>;
      case 'user': return <Badge variant="secondary">Usuário</Badge>;
      case 'viewer': return <Badge variant="outline">Visualizador</Badge>;
      default: return <Badge variant="outline">{role}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge className="bg-green-500">Ativo</Badge>;
      case 'inactive': return <Badge variant="destructive">Inativo</Badge>;
      case 'pending': return <Badge variant="secondary">Pendente</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'inactive': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending': return <Calendar className="h-4 w-4 text-yellow-500" />;
      default: return <XCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const availablePermissions = [
    { value: 'cost_analysis', label: 'Análise de Custos' },
    { value: 'security_management', label: 'Gerenciamento de Segurança' },
    { value: 'user_management', label: 'Gerenciamento de Usuários' },
    { value: 'aws_settings', label: 'Configurações AWS' },
    { value: 'reports_export', label: 'Exportação de Relatórios' },
    { value: 'alerts_management', label: 'Gerenciamento de Alertas' }
  ];

  return (
    <Layout 
      title="Gerenciamento de Usuários" 
      description="Gerencie usuários, permissões e acesso às contas AWS"
      icon={<Users className="h-5 w-5 text-white" />}
    >
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Usuários</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">
                {users?.length || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Usuários Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-green-500">
                {users?.filter(user => user.status === 'active').length || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Administradores</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-blue-500">
                {users?.filter(user => user.role === 'admin' || user.role === 'super_admin').length || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-yellow-500">
                {users?.filter(user => user.status === 'pending').length || 0}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="glass border-primary/20">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar usuários..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 glass"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="glass">
                <SelectValue placeholder="Filtrar por função" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Funções</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="user">Usuário</SelectItem>
                <SelectItem value="viewer">Visualizador</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="glass">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="glass border-primary/20">
        <CardHeader>
          <CardTitle>Lista de Usuários</CardTitle>
          <CardDescription>Gerencie todos os usuários da organização</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : users && users.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Último Login</TableHead>
                    <TableHead>Contas AWS</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Users className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <div className="font-medium">{user.name}</div>
                            <div className="text-sm text-muted-foreground">{user.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getRoleBadge(user.role)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(user.status)}
                          {getStatusBadge(user.status)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.last_login ? (
                          <div className="text-sm">
                            {new Date(user.last_login).toLocaleDateString('pt-BR')}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Nunca</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {user.aws_accounts?.length || 0} conta(s)
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingUser(user)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteUserMutation.mutate(user.id)}
                            disabled={user.role === 'super_admin'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">Nenhum usuário encontrado</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm || roleFilter !== 'all' || statusFilter !== 'all' 
                  ? 'Nenhum usuário corresponde aos filtros aplicados.'
                  : 'Comece adicionando o primeiro usuário à organização.'
                }
              </p>
              {!searchTerm && roleFilter === 'all' && statusFilter === 'all' && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Adicionar Primeiro Usuário
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      {editingUser && (
        <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar Usuário</DialogTitle>
              <DialogDescription>
                Atualize as informações e permissões do usuário
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={editingUser.email}
                    onChange={(e) => setEditingUser(prev => prev ? { ...prev, email: e.target.value } : null)}
                    disabled
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Nome Completo</Label>
                  <Input
                    id="edit-name"
                    value={editingUser.name}
                    onChange={(e) => setEditingUser(prev => prev ? { ...prev, name: e.target.value } : null)}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-role">Função</Label>
                  <Select 
                    value={editingUser.role} 
                    onValueChange={(value: any) => setEditingUser(prev => prev ? { ...prev, role: value } : null)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Visualizador</SelectItem>
                      <SelectItem value="user">Usuário</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select 
                    value={editingUser.status} 
                    onValueChange={(value: any) => setEditingUser(prev => prev ? { ...prev, status: value } : null)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                      <SelectItem value="pending">Pendente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Permissões</Label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                  {availablePermissions.map((permission) => (
                    <div key={permission.value} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`edit-${permission.value}`}
                        checked={editingUser.permissions?.includes(permission.value) || false}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditingUser(prev => prev ? { 
                              ...prev, 
                              permissions: [...(prev.permissions || []), permission.value] 
                            } : null);
                          } else {
                            setEditingUser(prev => prev ? { 
                              ...prev, 
                              permissions: (prev.permissions || []).filter(p => p !== permission.value) 
                            } : null);
                          }
                        }}
                      />
                      <Label htmlFor={`edit-${permission.value}`} className="text-sm">
                        {permission.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingUser(null)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdateUser} disabled={updateUserMutation.isPending}>
                {updateUserMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create User Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Criar Novo Usuário</DialogTitle>
            <DialogDescription>
              {isSuperAdmin 
                ? "Como super admin, você pode criar usuários em qualquer organização"
                : "Adicione um novo usuário à sua organização"
              }
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Organization selector - only for super_admin */}
            {isSuperAdmin && (
              <div className="space-y-2">
                <Label htmlFor="organization" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Organização
                </Label>
                <Select 
                  value={newUser.organizationId || organizationId || ''} 
                  onValueChange={(value) => setNewUser(prev => ({ ...prev, organizationId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a organização" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations?.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name} ({org.slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Selecione a organização onde o usuário será criado
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="usuario@empresa.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nome Completo</Label>
                <Input
                  id="name"
                  value={newUser.name}
                  onChange={(e) => setNewUser(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="João Silva"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="role">Função</Label>
              <Select value={newUser.role} onValueChange={(value: any) => setNewUser(prev => ({ ...prev, role: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Visualizador</SelectItem>
                  <SelectItem value="user">Usuário</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                  {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Permissões</Label>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                {availablePermissions.map((permission) => (
                  <div key={permission.value} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={permission.value}
                      checked={newUser.permissions.includes(permission.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewUser(prev => ({ ...prev, permissions: [...prev.permissions, permission.value] }));
                        } else {
                          setNewUser(prev => ({ ...prev, permissions: prev.permissions.filter(p => p !== permission.value) }));
                        }
                      }}
                    />
                    <Label htmlFor={permission.value} className="text-sm">
                      {permission.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Contas AWS</Label>
              <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto">
                {awsAccounts?.map((account) => (
                  <div key={account.aws_account_id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={account.aws_account_id}
                      checked={newUser.aws_accounts.includes(account.aws_account_id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewUser(prev => ({ ...prev, aws_accounts: [...prev.aws_accounts, account.aws_account_id] }));
                        } else {
                          setNewUser(prev => ({ ...prev, aws_accounts: prev.aws_accounts.filter(a => a !== account.aws_account_id) }));
                        }
                      }}
                    />
                    <Label htmlFor={account.aws_account_id} className="text-sm">
                      {account.account_name || account.aws_account_id}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateUser} disabled={createUserMutation.isPending || !isAdmin}>
              {createUserMutation.isPending ? 'Criando...' : 'Criar Usuário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </Layout>
  );
}