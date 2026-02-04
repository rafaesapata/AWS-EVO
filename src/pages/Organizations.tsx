/**
 * Organizations Management Page
 * 
 * Refactored version with components extracted to src/components/organizations/
 * Original: 2,402 lines → Refactored: ~300 lines
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Layout } from "@/components/Layout";
import { Building2, Plus, RefreshCw, X } from "lucide-react";

// Import refactored components
import {
  // Types
  type Organization,
  type NewOrganization,
  // Utils
  filterOrganizations,
  paginateArray,
  calculateOrgMetrics,
  // Hooks
  useOrganizationsList,
  useOrganizationUsers,
  useCreateOrganization,
  useUpdateOrganization,
  useToggleDemoMode,
  useSuspendOrganization,
  // Components
  OrganizationSummaryCards,
  OrganizationFilters,
  OrganizationCard,
  Pagination,
  // Dialogs
  CreateOrganizationDialog,
  EditOrganizationDialog,
  DemoModeDialog,
  SuspendDialog,
  ViewUsersDialog,
  ViewDetailsDialog,
  ViewLicensesDialog,
} from "@/components/organizations";

export default function Organizations() {
  const { t } = useTranslation();
  const { toast } = useToast();

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [viewingUsersOrg, setViewingUsersOrg] = useState<Organization | null>(null);
  const [viewingDetailsOrg, setViewingDetailsOrg] = useState<Organization | null>(null);
  const [viewingLicensesOrg, setViewingLicensesOrg] = useState<Organization | null>(null);
  const [demoDialogOrg, setDemoDialogOrg] = useState<Organization | null>(null);
  const [demoAction, setDemoAction] = useState<'activate' | 'deactivate' | null>(null);
  const [demoDays, setDemoDays] = useState('30');
  const [demoReason, setDemoReason] = useState('');
  const [suspendDialogOrg, setSuspendDialogOrg] = useState<Organization | null>(null);
  const [suspendAction, setSuspendAction] = useState<'suspend' | 'unsuspend' | null>(null);
  const [suspendReason, setSuspendReason] = useState('');

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // Default to active organizations
  const [demoFilter, setDemoFilter] = useState('all');
  const [hasAwsFilter, setHasAwsFilter] = useState('all');
  const [hasUsersFilter, setHasUsersFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // New organization form
  const [newOrg, setNewOrg] = useState<NewOrganization>({
    name: '',
    description: '',
    domain: '',
    billing_email: ''
  });

  // Queries
  const { data: organizations, isLoading, refetch } = useOrganizationsList();
  const { data: organizationUsers, isLoading: isLoadingUsers } = useOrganizationUsers(viewingUsersOrg?.id);

  // Mutations
  const createOrgMutation = useCreateOrganization(() => {
    setIsCreateDialogOpen(false);
    setNewOrg({ name: '', description: '', domain: '', billing_email: '' });
  });

  const updateOrgMutation = useUpdateOrganization(() => {
    setEditingOrg(null);
  });

  const toggleDemoMutation = useToggleDemoMode(() => {
    setDemoDialogOrg(null);
    setDemoAction(null);
    setDemoDays('30');
    setDemoReason('');
  });

  const suspendOrgMutation = useSuspendOrganization(() => {
    setSuspendDialogOrg(null);
    setSuspendAction(null);
    setSuspendReason('');
  });

  // Computed values
  const hasActiveFilters = Boolean(searchQuery || statusFilter !== 'all' || demoFilter !== 'all' || hasAwsFilter !== 'all' || hasUsersFilter !== 'all');
  
  const filteredOrganizations = filterOrganizations(organizations || [], {
    searchQuery,
    statusFilter,
    demoFilter,
    hasAwsFilter,
    hasUsersFilter,
  });

  const { paginatedItems, totalPages, startIndex, endIndex } = paginateArray(
    filteredOrganizations,
    currentPage,
    pageSize
  );

  const metrics = calculateOrgMetrics(organizations || []);

  // Handlers
  const handleFilterChange = (setter: (value: string) => void, value: string) => {
    setter(value);
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

  return (
    <Layout 
      title={t('sidebar.organizations', 'Gestão de Organizações')} 
      description={t('organizations.description', 'Gestão multi-tenant de organizações - Acesso Super Admin')}
      icon={<Building2 className="h-5 w-5" />}
    >
      <div className="space-y-6">
        {/* Summary Cards */}
        <OrganizationSummaryCards
          totalOrgs={metrics.totalOrgs}
          activeOrgs={metrics.activeOrgs}
          totalUsers={metrics.totalUsers}
          totalMonthlyCost={metrics.totalMonthlyCost}
          isLoading={isLoading}
        />

        {/* Organizations List */}
        <Card>
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
            {/* Filters */}
            <OrganizationFilters
              searchQuery={searchQuery}
              onSearchChange={(v) => handleFilterChange(setSearchQuery, v)}
              statusFilter={statusFilter}
              onStatusFilterChange={(v) => handleFilterChange(setStatusFilter, v)}
              demoFilter={demoFilter}
              onDemoFilterChange={(v) => handleFilterChange(setDemoFilter, v)}
              hasAwsFilter={hasAwsFilter}
              onHasAwsFilterChange={(v) => handleFilterChange(setHasAwsFilter, v)}
              hasUsersFilter={hasUsersFilter}
              onHasUsersFilterChange={(v) => handleFilterChange(setHasUsersFilter, v)}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={clearFilters}
            />

            {/* Pagination Info */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={organizations?.length || 0}
              filteredItems={filteredOrganizations.length}
              startIndex={startIndex}
              endIndex={endIndex}
              hasActiveFilters={hasActiveFilters}
              onPageChange={setCurrentPage}
              onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
            />

            <Separator />

            {/* Organizations List */}
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : paginatedItems.length > 0 ? (
              <div className="space-y-4">
                {paginatedItems.map((org) => (
                  <OrganizationCard
                    key={org.id}
                    org={org}
                    onViewUsers={setViewingUsersOrg}
                    onViewLicenses={setViewingLicensesOrg}
                    onViewDetails={setViewingDetailsOrg}
                    onDemoAction={handleDemoAction}
                    onSuspendAction={handleSuspendAction}
                  />
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
          </CardContent>
        </Card>

        {/* Dialogs */}
        <CreateOrganizationDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          newOrg={newOrg}
          onNewOrgChange={setNewOrg}
          onSubmit={handleCreateOrg}
          isPending={createOrgMutation.isPending}
        />

        <EditOrganizationDialog
          organization={editingOrg}
          onClose={() => setEditingOrg(null)}
          onOrganizationChange={setEditingOrg}
          onSubmit={handleUpdateOrg}
          isPending={updateOrgMutation.isPending}
        />

        <DemoModeDialog
          organization={demoDialogOrg}
          action={demoAction}
          demoDays={demoDays}
          demoReason={demoReason}
          onDemoDaysChange={setDemoDays}
          onDemoReasonChange={setDemoReason}
          onClose={() => { setDemoDialogOrg(null); setDemoAction(null); }}
          onConfirm={confirmDemoAction}
          isPending={toggleDemoMutation.isPending}
        />

        <SuspendDialog
          organization={suspendDialogOrg}
          action={suspendAction}
          reason={suspendReason}
          onReasonChange={setSuspendReason}
          onClose={() => { setSuspendDialogOrg(null); setSuspendAction(null); }}
          onConfirm={confirmSuspendAction}
          isPending={suspendOrgMutation.isPending}
        />

        <ViewUsersDialog
          organization={viewingUsersOrg}
          users={organizationUsers}
          isLoading={isLoadingUsers}
          onClose={() => setViewingUsersOrg(null)}
        />

        <ViewDetailsDialog
          organization={viewingDetailsOrg}
          onClose={() => setViewingDetailsOrg(null)}
          onEdit={setEditingOrg}
        />

        <ViewLicensesDialog
          organization={viewingLicensesOrg}
          onClose={() => setViewingLicensesOrg(null)}
        />
      </div>
    </Layout>
  );
}
