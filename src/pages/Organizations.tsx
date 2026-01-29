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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Settings,
  Ban,
  CheckCircle,
  Key,
  CreditCard,
  Cloud,
  Globe,
  Hash,
  FileText,
  Loader2,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
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

interface OrganizationLicense {
  id: string;
  license_key: string;
  customer_id: string | null;
  plan_type: string;
  product_type: string | null;
  max_accounts: number;
  max_users: number;
  used_seats: number;
  available_seats: number;
  assigned_seats: number;
  features: string[];
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  is_trial: boolean;
  is_expired: boolean;
  days_remaining: number | null;
  last_sync_at: string | null;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

interface LicensesResponse {
  licenses: OrganizationLicense[];
  config: {
    customer_id: string;
    auto_sync: boolean;
    last_sync_at: string | null;
    sync_status: string | null;
    sync_error: string | null;
  } | null;
  summary: {
    total_licenses: number;
    active_licenses: number;
    expired_licenses: number;
    trial_licenses: number;
    total_max_users: number;
    total_used_seats: number;
  };
}

interface OrganizationDetails {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
  demo_mode: boolean;
  demo_activated_at: string | null;
  demo_expires_at: string | null;
  demo_activated_by: string | null;
  user_count: number;
  aws_account_count: number;
  azure_account_count: number;
  security_scan_count: number;
  license_count: number;
  admin_users: Array<{
    user_id: string;
    full_name: string | null;
    email?: string;
    role: string | null;
  }>;
  aws_credentials: Array<{
    id: string;
    account_id: string | null;
    account_name: string | null;
    is_active: boolean;
    created_at: string;
  }>;
  azure_credentials: Array<{
    id: string;
    subscription_id: string | null;
    subscription_name: string | null;
    tenant_id: string | null;
    is_active: boolean;
    created_at: string;
  }>;
  primary_license: {
    id: string;
    license_key: string;
    customer_id: string | null;
    plan_type: string;
    product_type: string | null;
    max_users: number;
    used_seats: number;
    assigned_seats: number;
    is_active: boolean;
    is_trial: boolean;
    is_expired: boolean;
    days_remaining: number | null;
    valid_from: string;
    valid_until: string;
  } | null;
  license_config: {
    customer_id: string;
    auto_sync: boolean;
    last_sync_at: string | null;
    sync_status: string | null;
    sync_error: string | null;
  } | null;
}

export default function Organizations() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [viewingOrgDetails, setViewingOrgDetails] = useState<Organization | null>(null);
  const [demoDialogOrg, setDemoDialogOrg] = useState<Organization | null>(null);
  const [demoAction, setDemoAction] = useState<'activate' | 'deactivate' | null>(null);
  const [demoDays, setDemoDays] = useState('30');
  const [demoReason, setDemoReason] = useState('');
  const [viewingUsersOrg, setViewingUsersOrg] = useState<Organization | null>(null);
  const [viewingLicensesOrg, setViewingLicensesOrg] = useState<Organization | null>(null);
  const [suspendDialogOrg, setSuspendDialogOrg] = useState<Organization | null>(null);
  const [suspendAction, setSuspendAction] = useState<'suspend' | 'unsuspend' | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  
  // Search, Filter, and Pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [demoFilter, setDemoFilter] = useState<string>('all');
  const [hasAwsFilter, setHasAwsFilter] = useState<string>('all');
  const [hasUsersFilter, setHasUsersFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
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

  // Get licenses for a specific organization
  const { data: organizationLicenses, isLoading: isLoadingLicenses } = useQuery({
    queryKey: ['organization-licenses', viewingLicensesOrg?.id],
    enabled: !!viewingLicensesOrg,
    queryFn: async () => {
      if (!viewingLicensesOrg) return null;
      
      const response = await apiClient.invoke<LicensesResponse>('manage-organizations', {
        body: { action: 'list_licenses', id: viewingLicensesOrg.id }
      });

      if (response.error) {
        throw new Error(typeof response.error === 'string' ? response.error : response.error.message);
      }

      return response.data;
    },
  });

  // Get organization details for viewing/editing
  const { data: orgDetails, isLoading: isLoadingOrgDetails } = useQuery({
    queryKey: ['organization-details', viewingOrgDetails?.id],
    enabled: !!viewingOrgDetails,
    queryFn: async () => {
      if (!viewingOrgDetails) return null;
      
      const response = await apiClient.invoke<OrganizationDetails>('manage-organizations', {
        body: { action: 'get', id: viewingOrgDetails.id }
      });

      if (response.error) {
        throw new Error(typeof response.error === 'string' ? response.error : response.error.message);
      }

      return response.data;
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

  // Suspend/Unsuspend organization
  const suspendOrgMutation = useMutation({
    mutationFn: async ({ organizationId, action, reason }: { 
      organizationId: string; 
      action: 'suspend' | 'unsuspend'; 
      reason?: string;
    }) => {
      const response = await apiClient.invoke('manage-organizations', {
        body: {
          action,
          id: organizationId,
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
        title: variables.action === 'suspend' 
          ? t('organizations.suspended', 'Organização suspensa com sucesso')
          : t('organizations.unsuspended', 'Organização reativada com sucesso'),
        description: variables.action === 'suspend'
          ? t('organizations.suspendedDesc', 'Todas as licenças foram desativadas')
          : t('organizations.unsuspendedDesc', 'Licenças válidas foram reativadas'),
      });
      setSuspendDialogOrg(null);
      setSuspendAction(null);
      setSuspendReason('');
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

  // Sync license for organization
  const syncLicenseMutation = useMutation({
    mutationFn: async (organizationId: string) => {
      const response = await apiClient.invoke('admin-sync-license', {
        body: {
          organization_ids: [organizationId]
        }
      });

      if (response.error) {
        throw new Error(typeof response.error === 'string' ? response.error : response.error.message);
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: t('organizations.licenseSynced', 'Licença sincronizada'),
        description: t('organizations.licenseSyncedDesc', 'A licença foi sincronizada com sucesso.'),
      });
      // Refetch licenses data
      queryClient.invalidateQueries({ queryKey: ['organization-licenses', viewingLicensesOrg?.id] });
    },
    onError: (error) => {
      toast({
        title: t('organizations.licenseSyncError', 'Erro ao sincronizar licença'),
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

  const handleSuspendAction = (org: Organization, action: 'suspend' | 'unsuspend') => {
    setSuspendDialogOrg(org);
    setSuspendAction(action);
  };

  const confirmSuspendAction = () => {
    if (!suspendDialogOrg || !suspendAction) return;
    
    suspendOrgMutation.mutate({
      organizationId: suspendDialogOrg.id,
      action: suspendAction,
      reason: suspendReason || undefined
    });
  };

  // Calculate summary metrics
  const totalOrgs = organizations?.length || 0;
  const activeOrgs = organizations?.filter(org => org.status === 'active').length || 0;
  const totalUsers = organizations?.reduce((sum, org) => sum + org.user_count, 0) || 0;
  const totalMonthlyCost = organizations?.reduce((sum, org) => sum + org.monthly_cost, 0) || 0;

  // Filter organizations
  const filteredOrganizations = (organizations || []).filter(org => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        org.name.toLowerCase().includes(query) ||
        org.domain.toLowerCase().includes(query) ||
        org.billing_email.toLowerCase().includes(query) ||
        (org.description && org.description.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }
    
    // Status filter
    if (statusFilter !== 'all' && org.status !== statusFilter) return false;
    
    // Demo mode filter
    if (demoFilter === 'demo' && !org.demo_mode) return false;
    if (demoFilter === 'production' && org.demo_mode) return false;
    
    // Has AWS accounts filter
    if (hasAwsFilter === 'with' && org.aws_account_count === 0) return false;
    if (hasAwsFilter === 'without' && org.aws_account_count > 0) return false;
    
    // Has users filter
    if (hasUsersFilter === 'with' && org.user_count === 0) return false;
    if (hasUsersFilter === 'without' && org.user_count > 0) return false;
    
    return true;
  });

  // Pagination
  const totalFilteredOrgs = filteredOrganizations.length;
  const totalPages = Math.ceil(totalFilteredOrgs / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedOrganizations = filteredOrganizations.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  const handleFilterChange = (setter: (value: string) => void, value: string) => {
    setter(value);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setDemoFilter('all');
    setHasAwsFilter('all');
    setHasUsersFilter('all');
    setCurrentPage(1);
  };

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || demoFilter !== 'all' || hasAwsFilter !== 'all' || hasUsersFilter !== 'all';

  return (
    <Layout 
      title={t('sidebar.organizations', 'Gestão de Organizações')} 
      description={t('organizations.description', 'Gestão multi-tenant de organizações - Acesso Super Admin')}
      icon={<Building2 className="h-5 w-5" />}
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
            <CardTitle>{t('organizations.listTitle', 'Lista de Organizações')}</CardTitle>
            <CardDescription>{t('organizations.listDescription', 'Gerencie todas as organizações do sistema')}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('common.refresh', 'Atualizar')}
            </Button>
            <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('organizations.newOrg', 'Nova Organização')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Filters */}
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('organizations.searchPlaceholder', 'Buscar por nome, domínio ou email...')}
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Filters Row */}
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{t('common.filters', 'Filtros')}:</span>
              </div>
              
              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={(v) => handleFilterChange(setStatusFilter, v)}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder={t('organizations.filterStatus', 'Status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('organizations.allStatuses', 'Todos os status')}</SelectItem>
                  <SelectItem value="active">{t('organizations.statusActive', 'Ativas')}</SelectItem>
                  <SelectItem value="inactive">{t('organizations.statusInactive', 'Inativas')}</SelectItem>
                  <SelectItem value="suspended">{t('organizations.statusSuspended', 'Suspensas')}</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Demo Mode Filter */}
              <Select value={demoFilter} onValueChange={(v) => handleFilterChange(setDemoFilter, v)}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder={t('organizations.filterDemo', 'Modo')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('organizations.allModes', 'Todos os modos')}</SelectItem>
                  <SelectItem value="demo">{t('organizations.modeDemo', 'Em Demo')}</SelectItem>
                  <SelectItem value="production">{t('organizations.modeProduction', 'Produção')}</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Has AWS Accounts Filter */}
              <Select value={hasAwsFilter} onValueChange={(v) => handleFilterChange(setHasAwsFilter, v)}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder={t('organizations.filterAws', 'Contas AWS')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('organizations.allAwsAccounts', 'Todas')}</SelectItem>
                  <SelectItem value="with">{t('organizations.withAwsAccounts', 'Com contas AWS')}</SelectItem>
                  <SelectItem value="without">{t('organizations.withoutAwsAccounts', 'Sem contas AWS')}</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Has Users Filter */}
              <Select value={hasUsersFilter} onValueChange={(v) => handleFilterChange(setHasUsersFilter, v)}>
                <SelectTrigger className="w-[150px] h-9">
                  <SelectValue placeholder={t('organizations.filterUsers', 'Usuários')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('organizations.allUsers', 'Todos')}</SelectItem>
                  <SelectItem value="with">{t('organizations.withUsers', 'Com usuários')}</SelectItem>
                  <SelectItem value="without">{t('organizations.withoutUsers', 'Sem usuários')}</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Clear Filters Button */}
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
                  <X className="h-4 w-4 mr-1" />
                  {t('common.clearFilters', 'Limpar')}
                </Button>
              )}
            </div>
            
            {/* Results Summary */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {t('organizations.showingResults', 'Exibindo {{start}}-{{end}} de {{total}} organizações', {
                  start: totalFilteredOrgs === 0 ? 0 : startIndex + 1,
                  end: Math.min(endIndex, totalFilteredOrgs),
                  total: totalFilteredOrgs
                })}
                {hasActiveFilters && ` (${t('organizations.filtered', 'filtrado de {{total}}', { total: totalOrgs })})`}
              </span>
              
              {/* Page Size Selector */}
              <div className="flex items-center gap-2">
                <span>{t('organizations.perPage', 'Por página')}:</span>
                <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(parseInt(v)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[70px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          <Separator />
          
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : paginatedOrganizations.length > 0 ? (
            <div className="space-y-4">
              {paginatedOrganizations.map((org) => (
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
                      
                      {/* View Licenses Button with Tooltip */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setViewingLicensesOrg(org)}
                              className="text-purple-600 border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950"
                            >
                              <Key className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('organizations.viewLicenses', 'Ver licenças')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      {/* Suspend/Unsuspend Button with Tooltip */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {org.status === 'suspended' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSuspendAction(org, 'unsuspend')}
                                className="text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSuspendAction(org, 'suspend')}
                                className="text-red-600 border-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              {org.status === 'suspended'
                                ? t('organizations.unsuspendOrg', 'Reativar organização')
                                : t('organizations.suspendOrg', 'Suspender organização')
                              }
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      {/* View Details Button with Tooltip */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setViewingOrgDetails(org)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('organizations.viewDetails', 'Ver detalhes da organização')}</p>
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
              <h3 className="text-xl font-semibold mb-2">
                {hasActiveFilters 
                  ? t('organizations.noResultsFiltered', 'Nenhuma organização encontrada com os filtros aplicados')
                  : t('organizations.noOrganizations', 'Nenhuma organização encontrada')
                }
              </h3>
              <p className="text-muted-foreground mb-4">
                {hasActiveFilters 
                  ? t('organizations.tryDifferentFilters', 'Tente ajustar os filtros ou limpar a busca.')
                  : t('organizations.createFirstOrg', 'Crie a primeira organização para começar.')
                }
              </p>
              {hasActiveFilters ? (
                <Button variant="outline" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-2" />
                  {t('common.clearFilters', 'Limpar Filtros')}
                </Button>
              ) : (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('organizations.createFirstOrgButton', 'Criar Primeira Organização')}
                </Button>
              )}
            </div>
          )}
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t('organizations.pageInfo', 'Página {{current}} de {{total}}', { current: currentPage, total: totalPages })}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  {/* Page Numbers */}
                  <div className="flex items-center gap-1 mx-2">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          className="w-8 h-8 p-0"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Organization Dialog */}
      {editingOrg && (
        <Dialog open={!!editingOrg} onOpenChange={() => setEditingOrg(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('organizations.editOrg', 'Editar Organização')}</DialogTitle>
              <DialogDescription>
                {t('organizations.editOrgDescription', 'Atualize as informações da organização')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">{t('organizations.orgName', 'Nome da Organização')}</Label>
                  <Input
                    id="edit-name"
                    value={editingOrg.name}
                    onChange={(e) => setEditingOrg(prev => prev ? { ...prev, name: e.target.value } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-domain">{t('organizations.domain', 'Domínio')}</Label>
                  <Input
                    id="edit-domain"
                    value={editingOrg.domain}
                    onChange={(e) => setEditingOrg(prev => prev ? { ...prev, domain: e.target.value } : null)}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-description">{t('organizations.description', 'Descrição')}</Label>
                <Textarea
                  id="edit-description"
                  value={editingOrg.description}
                  onChange={(e) => setEditingOrg(prev => prev ? { ...prev, description: e.target.value } : null)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-billing-email">{t('organizations.billingEmail', 'Email de Cobrança')}</Label>
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
                {t('common.cancel', 'Cancelar')}
              </Button>
              <Button onClick={handleUpdateOrg} disabled={updateOrgMutation.isPending}>
                {updateOrgMutation.isPending ? t('common.saving', 'Salvando...') : t('common.saveChanges', 'Salvar Alterações')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* View Organization Details Dialog */}
      <Dialog open={!!viewingOrgDetails} onOpenChange={(open) => !open && setViewingOrgDetails(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {t('organizations.orgDetails', 'Detalhes da Organização')}: {viewingOrgDetails?.name}
            </DialogTitle>
            <DialogDescription>
              {t('organizations.orgDetailsDescription', 'Informações completas da organização')}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 pr-4">
            {isLoadingOrgDetails ? (
              <div className="space-y-4 p-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : orgDetails ? (
              <Tabs defaultValue="general" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-4">
                  <TabsTrigger value="general">{t('organizations.tabGeneral', 'Geral')}</TabsTrigger>
                  <TabsTrigger value="users">{t('organizations.tabUsers', 'Usuários')}</TabsTrigger>
                  <TabsTrigger value="cloud">{t('organizations.tabCloud', 'Cloud')}</TabsTrigger>
                  <TabsTrigger value="license">{t('organizations.tabLicense', 'Licença')}</TabsTrigger>
                </TabsList>

                {/* General Tab */}
                <TabsContent value="general" className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        {t('organizations.basicInfo', 'Informações Básicas')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs text-muted-foreground">{t('organizations.orgId', 'ID da Organização')}</Label>
                          <p className="font-mono text-xs mt-1 bg-muted p-2 rounded">{orgDetails.id}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">{t('organizations.slug', 'Slug')}</Label>
                          <p className="font-mono text-xs mt-1 bg-muted p-2 rounded">{orgDetails.slug}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs text-muted-foreground">{t('organizations.createdAt', 'Criado em')}</Label>
                          <p className="text-sm mt-1">{new Date(orgDetails.created_at).toLocaleString('pt-BR')}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">{t('organizations.updatedAt', 'Atualizado em')}</Label>
                          <p className="text-sm mt-1">{new Date(orgDetails.updated_at).toLocaleString('pt-BR')}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Demo Mode Info */}
                  <Card className={orgDetails.demo_mode ? 'border-amber-500/50 bg-amber-500/5' : ''}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className={`h-4 w-4 ${orgDetails.demo_mode ? 'text-amber-500' : ''}`} />
                        {t('organizations.demoMode', 'Modo Demo')}
                        {orgDetails.demo_mode && <Badge className="bg-amber-500 ml-2">ATIVO</Badge>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {orgDetails.demo_mode ? (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs text-muted-foreground">{t('organizations.demoActivatedAt', 'Ativado em')}</Label>
                            <p className="text-sm mt-1">
                              {orgDetails.demo_activated_at 
                                ? new Date(orgDetails.demo_activated_at).toLocaleString('pt-BR')
                                : '-'
                              }
                            </p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">{t('organizations.demoExpiresAt', 'Expira em')}</Label>
                            <p className="text-sm mt-1">
                              {orgDetails.demo_expires_at 
                                ? new Date(orgDetails.demo_expires_at).toLocaleString('pt-BR')
                                : '-'
                              }
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t('organizations.demoNotActive', 'Modo demo não está ativo')}</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Statistics */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Hash className="h-4 w-4" />
                        {t('organizations.statistics', 'Estatísticas')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="p-3 rounded-lg bg-muted/50 text-center">
                          <Users className="h-5 w-5 mx-auto mb-1 text-blue-500" />
                          <p className="text-xl font-semibold">{orgDetails.user_count}</p>
                          <p className="text-xs text-muted-foreground">{t('organizations.users', 'Usuários')}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50 text-center">
                          <Cloud className="h-5 w-5 mx-auto mb-1 text-orange-500" />
                          <p className="text-xl font-semibold">{orgDetails.aws_account_count}</p>
                          <p className="text-xs text-muted-foreground">AWS</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50 text-center">
                          <Cloud className="h-5 w-5 mx-auto mb-1 text-blue-600" />
                          <p className="text-xl font-semibold">{orgDetails.azure_account_count}</p>
                          <p className="text-xs text-muted-foreground">Azure</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50 text-center">
                          <Shield className="h-5 w-5 mx-auto mb-1 text-green-500" />
                          <p className="text-xl font-semibold">{orgDetails.security_scan_count}</p>
                          <p className="text-xs text-muted-foreground">{t('organizations.scans', 'Scans')}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50 text-center">
                          <Key className="h-5 w-5 mx-auto mb-1 text-purple-500" />
                          <p className="text-xl font-semibold">{orgDetails.license_count}</p>
                          <p className="text-xs text-muted-foreground">{t('organizations.licenses', 'Licenças')}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Users Tab */}
                <TabsContent value="users" className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Crown className="h-4 w-4 text-amber-500" />
                        {t('organizations.administrators', 'Administradores')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {orgDetails.admin_users.length > 0 ? (
                        <div className="space-y-2">
                          {orgDetails.admin_users.map((admin, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                  <User className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium">{admin.full_name || t('organizations.noName', 'Sem nome')}</p>
                                  <p className="text-xs text-muted-foreground">{admin.email || t('organizations.noEmail', 'Email não disponível')}</p>
                                </div>
                              </div>
                              <Badge variant={admin.role === 'super_admin' ? 'default' : 'secondary'}>
                                {admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          {t('organizations.noAdmins', 'Nenhum administrador encontrado')}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Cloud Tab */}
                <TabsContent value="cloud" className="space-y-4">
                  {/* AWS Credentials */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Cloud className="h-4 w-4 text-orange-500" />
                        {t('organizations.awsCredentials', 'Credenciais AWS')} ({orgDetails.aws_credentials.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {orgDetails.aws_credentials.length > 0 ? (
                        <div className="space-y-2">
                          {orgDetails.aws_credentials.map((cred) => (
                            <div key={cred.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center">
                                  <Cloud className="h-4 w-4 text-orange-500" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium">{cred.account_name || t('organizations.unnamed', 'Sem nome')}</p>
                                  <p className="text-xs text-muted-foreground font-mono">{cred.account_id || 'N/A'}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={cred.is_active ? 'default' : 'secondary'}>
                                  {cred.is_active ? t('organizations.active', 'Ativa') : t('organizations.inactive', 'Inativa')}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(cred.created_at).toLocaleDateString('pt-BR')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          {t('organizations.noAwsCredentials', 'Nenhuma credencial AWS cadastrada')}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Azure Credentials */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Cloud className="h-4 w-4 text-blue-600" />
                        {t('organizations.azureCredentials', 'Credenciais Azure')} ({orgDetails.azure_credentials.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {orgDetails.azure_credentials.length > 0 ? (
                        <div className="space-y-2">
                          {orgDetails.azure_credentials.map((cred) => (
                            <div key={cred.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-blue-600/10 flex items-center justify-center">
                                  <Cloud className="h-4 w-4 text-blue-600" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium">{cred.subscription_name || t('organizations.unnamed', 'Sem nome')}</p>
                                  <p className="text-xs text-muted-foreground font-mono">{cred.subscription_id || 'N/A'}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={cred.is_active ? 'default' : 'secondary'}>
                                  {cred.is_active ? t('organizations.active', 'Ativa') : t('organizations.inactive', 'Inativa')}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(cred.created_at).toLocaleDateString('pt-BR')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          {t('organizations.noAzureCredentials', 'Nenhuma credencial Azure cadastrada')}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* License Tab */}
                <TabsContent value="license" className="space-y-4">
                  {/* License Config */}
                  {orgDetails.license_config && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Settings className="h-4 w-4" />
                          {t('organizations.licenseConfig', 'Configuração de Licença')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs text-muted-foreground">Customer ID</Label>
                            <p className="font-mono text-xs mt-1 bg-muted p-2 rounded">{orgDetails.license_config.customer_id}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Auto Sync</Label>
                            <p className="mt-1">
                              <Badge variant={orgDetails.license_config.auto_sync ? 'default' : 'secondary'}>
                                {orgDetails.license_config.auto_sync ? t('organizations.enabled', 'Ativado') : t('organizations.disabled', 'Desativado')}
                              </Badge>
                            </p>
                          </div>
                          {orgDetails.license_config.last_sync_at && (
                            <div>
                              <Label className="text-xs text-muted-foreground">{t('organizations.lastSync', 'Último Sync')}</Label>
                              <p className="text-sm mt-1">{new Date(orgDetails.license_config.last_sync_at).toLocaleString('pt-BR')}</p>
                            </div>
                          )}
                          {orgDetails.license_config.sync_status && (
                            <div>
                              <Label className="text-xs text-muted-foreground">{t('organizations.syncStatus', 'Status do Sync')}</Label>
                              <p className="mt-1">
                                <Badge variant={orgDetails.license_config.sync_status === 'success' ? 'default' : 'destructive'}>
                                  {orgDetails.license_config.sync_status}
                                </Badge>
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Primary License */}
                  {orgDetails.primary_license ? (
                    <Card className={orgDetails.primary_license.is_trial ? 'border-amber-500/50' : ''}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <CreditCard className="h-4 w-4" />
                          {t('organizations.primaryLicense', 'Licença Principal')}
                          {orgDetails.primary_license.is_trial && (
                            <Badge variant="outline" className="text-amber-600 border-amber-600 ml-2">Trial</Badge>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs text-muted-foreground">{t('organizations.licenseKey', 'Chave da Licença')}</Label>
                            <p className="font-mono text-xs mt-1 bg-muted p-2 rounded truncate">{orgDetails.primary_license.license_key}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">{t('organizations.planType', 'Tipo de Plano')}</Label>
                            <p className="text-sm mt-1 font-medium">{orgDetails.primary_license.plan_type}</p>
                          </div>
                        </div>
                        
                        <Separator />
                        
                        <div className="grid grid-cols-3 gap-4">
                          <div className="p-3 rounded-lg bg-muted/50 text-center">
                            <p className="text-2xl font-semibold">{orgDetails.primary_license.max_users}</p>
                            <p className="text-xs text-muted-foreground">{t('organizations.maxSeats', 'Seats Máx.')}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-muted/50 text-center">
                            <p className="text-2xl font-semibold">{orgDetails.primary_license.used_seats}</p>
                            <p className="text-xs text-muted-foreground">{t('organizations.usedSeats', 'Usados')}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-muted/50 text-center">
                            <p className="text-2xl font-semibold">{orgDetails.primary_license.max_users - orgDetails.primary_license.used_seats}</p>
                            <p className="text-xs text-muted-foreground">{t('organizations.availableSeats', 'Disponíveis')}</p>
                          </div>
                        </div>

                        <Separator />

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs text-muted-foreground">{t('organizations.validFrom', 'Válido de')}</Label>
                            <p className="text-sm mt-1">{new Date(orgDetails.primary_license.valid_from).toLocaleDateString('pt-BR')}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">{t('organizations.validUntil', 'Válido até')}</Label>
                            <p className="text-sm mt-1">{new Date(orgDetails.primary_license.valid_until).toLocaleDateString('pt-BR')}</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{t('organizations.daysRemaining', 'Dias restantes')}:</span>
                          </div>
                          <span className={`text-lg font-semibold ${
                            orgDetails.primary_license.days_remaining !== null && orgDetails.primary_license.days_remaining <= 7 
                              ? 'text-red-500' 
                              : orgDetails.primary_license.days_remaining !== null && orgDetails.primary_license.days_remaining <= 30 
                                ? 'text-amber-500' 
                                : 'text-green-500'
                          }`}>
                            {orgDetails.primary_license.days_remaining ?? 'N/A'}
                          </span>
                        </div>

                        <div className="flex gap-2">
                          <Badge variant={orgDetails.primary_license.is_active ? 'default' : 'secondary'}>
                            {orgDetails.primary_license.is_active ? t('organizations.active', 'Ativa') : t('organizations.inactive', 'Inativa')}
                          </Badge>
                          {orgDetails.primary_license.is_expired && (
                            <Badge variant="destructive">{t('organizations.expired', 'Expirada')}</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center">
                          <CreditCard className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                          <p className="text-muted-foreground">
                            {t('organizations.noLicense', 'Nenhuma licença cadastrada para esta organização')}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">{t('common.loading', 'Carregando...')}</p>
              </div>
            )}
          </ScrollArea>
          
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setViewingOrgDetails(null)}>
              {t('common.close', 'Fechar')}
            </Button>
            <Button onClick={() => {
              if (viewingOrgDetails) {
                setEditingOrg(viewingOrgDetails);
                setViewingOrgDetails(null);
              }
            }}>
              <Edit className="h-4 w-4 mr-2" />
              {t('organizations.editOrg', 'Editar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* View Licenses Dialog */}
      <Dialog open={!!viewingLicensesOrg} onOpenChange={(open) => !open && setViewingLicensesOrg(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {t('organizations.licensesOf', 'Licenças de')} {viewingLicensesOrg?.name}
            </DialogTitle>
            <DialogDescription>
              {t('organizations.licensesDescription', 'Licenças e configurações de licenciamento desta organização')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto">
            {isLoadingLicenses ? (
              <div className="space-y-3 p-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : organizationLicenses ? (
              <div className="space-y-4">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">{t('organizations.totalLicenses', 'Total de Licenças')}</p>
                    <p className="text-xl font-semibold">{organizationLicenses.summary.total_licenses}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-500/10">
                    <p className="text-xs text-muted-foreground">{t('organizations.activeLicenses', 'Ativas')}</p>
                    <p className="text-xl font-semibold text-green-600">{organizationLicenses.summary.active_licenses}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-500/10">
                    <p className="text-xs text-muted-foreground">{t('organizations.totalSeats', 'Total de Seats')}</p>
                    <p className="text-xl font-semibold text-blue-600">{organizationLicenses.summary.total_max_users}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-500/10">
                    <p className="text-xs text-muted-foreground">{t('organizations.usedSeats', 'Seats Usados')}</p>
                    <p className="text-xl font-semibold text-amber-600">{organizationLicenses.summary.total_used_seats}</p>
                  </div>
                </div>

                {/* License Config */}
                {organizationLicenses.config && (
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <p className="text-sm font-medium mb-2">{t('organizations.licenseConfig', 'Configuração de Licença')}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Customer ID:</span>
                        <span className="ml-2 font-mono text-xs">{organizationLicenses.config.customer_id}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Auto Sync:</span>
                        <Badge variant={organizationLicenses.config.auto_sync ? 'default' : 'secondary'} className="ml-2">
                          {organizationLicenses.config.auto_sync ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status:</span>
                        <Badge 
                          variant={organizationLicenses.config.sync_status === 'success' ? 'default' : 'secondary'} 
                          className="ml-2"
                        >
                          {organizationLicenses.config.sync_status || 'N/A'}
                        </Badge>
                      </div>
                      {organizationLicenses.config.last_sync_at && (
                        <div>
                          <span className="text-muted-foreground">Último Sync:</span>
                          <span className="ml-2">{new Date(organizationLicenses.config.last_sync_at).toLocaleString('pt-BR')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Licenses Table */}
                {organizationLicenses.licenses.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('organizations.licenseKey', 'Chave')}</TableHead>
                        <TableHead>{t('organizations.licensePlan', 'Plano')}</TableHead>
                        <TableHead>{t('organizations.licenseSeats', 'Seats')}</TableHead>
                        <TableHead>{t('organizations.licenseValidity', 'Validade')}</TableHead>
                        <TableHead>{t('organizations.licenseStatus', 'Status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {organizationLicenses.licenses.map((license) => (
                        <TableRow key={license.id}>
                          <TableCell className="font-mono text-xs">
                            {license.license_key.substring(0, 20)}...
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{license.plan_type}</span>
                              {license.product_type && (
                                <span className="text-xs text-muted-foreground">{license.product_type}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{license.used_seats} / {license.max_users}</span>
                              <span className="text-xs text-muted-foreground">
                                {license.available_seats} {t('organizations.available', 'disponíveis')}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-xs">
                                {new Date(license.valid_from).toLocaleDateString('pt-BR')} - {new Date(license.valid_until).toLocaleDateString('pt-BR')}
                              </span>
                              {license.days_remaining !== null && (
                                <span className={`text-xs ${license.days_remaining <= 7 ? 'text-red-500' : license.days_remaining <= 30 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                                  {license.days_remaining} {t('common.daysRemaining', 'dias restantes')}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {license.is_active ? (
                                <Badge className="bg-green-500">{t('organizations.active', 'Ativa')}</Badge>
                              ) : (
                                <Badge variant="secondary">{t('organizations.inactive', 'Inativa')}</Badge>
                              )}
                              {license.is_trial && (
                                <Badge variant="outline" className="text-amber-600 border-amber-600">Trial</Badge>
                              )}
                              {license.is_expired && (
                                <Badge variant="destructive">{t('organizations.expired', 'Expirada')}</Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <Key className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {t('organizations.noLicenses', 'Nenhuma licença encontrada para esta organização')}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Key className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {t('organizations.noLicenses', 'Nenhuma licença encontrada para esta organização')}
                </p>
              </div>
            )}
          </div>
          
          <DialogFooter className="mt-4">
            <Button 
              variant="outline" 
              onClick={() => viewingLicensesOrg && syncLicenseMutation.mutate(viewingLicensesOrg.id)}
              disabled={syncLicenseMutation.isPending || isLoadingLicenses}
              className="glass hover-glow"
            >
              {syncLicenseMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  {t('organizations.syncingLicense', 'Sincronizando...')}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t('organizations.syncLicense', 'Sincronizar Licença')}
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => setViewingLicensesOrg(null)}>
              {t('common.close', 'Fechar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend/Unsuspend Confirmation Dialog */}
      <AlertDialog open={!!suspendDialogOrg && !!suspendAction} onOpenChange={(open) => {
        if (!open) {
          setSuspendDialogOrg(null);
          setSuspendAction(null);
          setSuspendReason('');
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {suspendAction === 'suspend' ? (
                <>
                  <Ban className="h-5 w-5 text-red-500" />
                  {t('organizations.suspendTitle', 'Suspender Organização')}
                </>
              ) : (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  {t('organizations.unsuspendTitle', 'Reativar Organização')}
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                {suspendAction === 'suspend'
                  ? t('organizations.confirmSuspend', 'Tem certeza que deseja suspender esta organização? Todas as licenças serão desativadas e os usuários não poderão acessar o sistema.')
                  : t('organizations.confirmUnsuspend', 'Tem certeza que deseja reativar esta organização? As licenças válidas serão reativadas.')
                }
              </p>
              {suspendDialogOrg && (
                <p className="font-medium">
                  {t('common.organization', 'Organização')}: {suspendDialogOrg.name}
                </p>
              )}
              
              <div className="space-y-2 pt-2">
                <Label htmlFor="suspend-reason">{t('organizations.suspendReason', 'Motivo')} ({t('common.optional', 'opcional')})</Label>
                <Textarea
                  id="suspend-reason"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder={suspendAction === 'suspend' 
                    ? t('organizations.suspendReasonPlaceholder', 'Motivo da suspensão...')
                    : t('organizations.unsuspendReasonPlaceholder', 'Motivo da reativação...')
                  }
                  rows={2}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancelar')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmSuspendAction}
              disabled={suspendOrgMutation.isPending}
              className={suspendAction === 'suspend' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}
            >
              {suspendOrgMutation.isPending 
                ? t('common.processing', 'Processando...')
                : suspendAction === 'suspend' 
                  ? t('organizations.suspend', 'Suspender')
                  : t('organizations.unsuspend', 'Reativar')
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </Layout>
  );
}