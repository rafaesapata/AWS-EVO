/**
 * Dialog for editing an organization (super admin)
 * Includes: basic info, license config with customer_id editing and sync
 */
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Key, RefreshCw, Settings, CreditCard, Clock, AlertCircle } from "lucide-react";
import type { Organization } from "../types";
import { useOrganizationDetails, useUpdateLicenseConfig, useSyncLicense } from "../hooks/useOrganizations";

interface EditOrganizationDialogProps {
  organization: Organization | null;
  onClose: () => void;
  onOrganizationChange: (org: Organization | null) => void;
  onSubmit: () => void;
  isPending: boolean;
}

export function EditOrganizationDialog({
  organization,
  onClose,
  onOrganizationChange,
  onSubmit,
  isPending,
}: EditOrganizationDialogProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'general' | 'license'>('general');

  // License config state
  const [customerId, setCustomerId] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [licenseConfigDirty, setLicenseConfigDirty] = useState(false);

  const { data: orgDetails, isLoading: isLoadingDetails } = useOrganizationDetails(organization?.id);
  const updateLicenseConfigMutation = useUpdateLicenseConfig(() => {
    setLicenseConfigDirty(false);
  });
  const syncLicenseMutation = useSyncLicense(organization?.id);

  // Populate license config from org details
  useEffect(() => {
    if (orgDetails?.license_config) {
      setCustomerId(orgDetails.license_config.customer_id || '');
      setAutoSync(orgDetails.license_config.auto_sync ?? true);
      setLicenseConfigDirty(false);
    } else {
      setCustomerId('');
      setAutoSync(true);
      setLicenseConfigDirty(false);
    }
  }, [orgDetails]);

  if (!organization) return null;

  const handleClose = () => {
    setActiveTab('general');
    setLicenseConfigDirty(false);
    onClose();
  };

  const handleSaveLicenseConfig = (triggerSync: boolean) => {
    if (!organization) return;
    updateLicenseConfigMutation.mutate({
      organizationId: organization.id,
      customer_id: customerId,
      auto_sync: autoSync,
      trigger_sync: triggerSync,
    });
  };

  const handleCustomerIdChange = (value: string) => {
    setCustomerId(value);
    setLicenseConfigDirty(true);
  };

  const handleAutoSyncChange = (value: boolean) => {
    setAutoSync(value);
    setLicenseConfigDirty(true);
  };

  return (
    <Dialog open={!!organization} onOpenChange={() => handleClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {t('organizations.editOrg', 'Editar Organização')}: {organization.name}
          </DialogTitle>
          <DialogDescription>
            {t('organizations.editOrgDescription', 'Atualize as informações da organização')}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'general' | 'license')} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="glass mb-4">
            <TabsTrigger value="general">
              <Building2 className="h-4 w-4 mr-2" />
              {t('organizations.tabGeneral', 'Geral')}
            </TabsTrigger>
            <TabsTrigger value="license">
              <Key className="h-4 w-4 mr-2" />
              {t('organizations.tabLicense', 'Licença')}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto">
            <TabsContent value="general" className="space-y-4 mt-0">
              <GeneralTab
                organization={organization}
                onOrganizationChange={onOrganizationChange}
              />
            </TabsContent>

            <TabsContent value="license" className="space-y-4 mt-0">
              <LicenseConfigTab
                orgDetails={orgDetails}
                isLoading={isLoadingDetails}
                customerId={customerId}
                autoSync={autoSync}
                onCustomerIdChange={handleCustomerIdChange}
                onAutoSyncChange={handleAutoSyncChange}
              />
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="mt-4 flex-shrink-0">
          <Button variant="outline" onClick={handleClose}>
            {t('common.cancel', 'Cancelar')}
          </Button>

          {activeTab === 'general' && (
            <Button onClick={onSubmit} disabled={isPending} className="glass hover-glow">
              {isPending ? t('common.saving', 'Salvando...') : t('common.saveChanges', 'Salvar Alterações')}
            </Button>
          )}

          {activeTab === 'license' && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => organization && syncLicenseMutation.mutate(organization.id)}
                disabled={syncLicenseMutation.isPending || !orgDetails?.license_config}
                className="glass hover-glow"
              >
                {syncLicenseMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t('organizations.syncingLicense', 'Sincronizando...')}</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" />{t('organizations.syncLicense', 'Sincronizar')}</>
                )}
              </Button>
              <Button
                onClick={() => handleSaveLicenseConfig(false)}
                disabled={updateLicenseConfigMutation.isPending || !customerId.trim() || !licenseConfigDirty}
                className="glass hover-glow"
              >
                {updateLicenseConfigMutation.isPending
                  ? t('common.saving', 'Salvando...')
                  : t('common.saveChanges', 'Salvar')}
              </Button>
              <Button
                onClick={() => handleSaveLicenseConfig(true)}
                disabled={updateLicenseConfigMutation.isPending || !customerId.trim()}
                className="glass hover-glow"
              >
                {updateLicenseConfigMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t('common.saving', 'Salvando...')}</>
                ) : (
                  <>{t('organizations.saveAndSync', 'Salvar e Sincronizar')}</>
                )}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// General Tab - basic org info editing
function GeneralTab({
  organization,
  onOrganizationChange,
}: {
  organization: Organization;
  onOrganizationChange: (org: Organization | null) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="edit-name">{t('organizations.orgName', 'Nome da Organização')}</Label>
          <Input
            id="edit-name"
            value={organization.name}
            onChange={(e) => onOrganizationChange({ ...organization, name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-domain">{t('organizations.domain', 'Domínio')}</Label>
          <Input
            id="edit-domain"
            value={organization.domain}
            onChange={(e) => onOrganizationChange({ ...organization, domain: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-description">{t('organizations.description', 'Descrição')}</Label>
        <Textarea
          id="edit-description"
          value={organization.description}
          onChange={(e) => onOrganizationChange({ ...organization, description: e.target.value })}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-billing-email">{t('organizations.billingEmail', 'Email de Cobrança')}</Label>
        <Input
          id="edit-billing-email"
          type="email"
          value={organization.billing_email}
          onChange={(e) => onOrganizationChange({ ...organization, billing_email: e.target.value })}
        />
      </div>
    </div>
  );
}

// License Config Tab - customer_id, auto_sync, current license info
function LicenseConfigTab({
  orgDetails,
  isLoading,
  customerId,
  autoSync,
  onCustomerIdChange,
  onAutoSyncChange,
}: {
  orgDetails: import("../types").OrganizationDetails | null | undefined;
  isLoading: boolean;
  customerId: string;
  autoSync: boolean;
  onCustomerIdChange: (value: string) => void;
  onAutoSyncChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* License Config Card */}
      <Card className="glass border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings className="h-4 w-4" />
            {t('organizations.licenseConfig', 'Configuração de Licença')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-customer-id">Customer ID</Label>
            <Input
              id="edit-customer-id"
              value={customerId}
              onChange={(e) => onCustomerIdChange(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {t('organizations.customerIdHelp', 'UUID do cliente no sistema de licenciamento externo')}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="edit-auto-sync">{t('organizations.autoSync', 'Sincronização Automática')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('organizations.autoSyncHelp', 'Sincronizar licenças automaticamente com o servidor externo')}
              </p>
            </div>
            <Switch
              id="edit-auto-sync"
              checked={autoSync}
              onCheckedChange={onAutoSyncChange}
            />
          </div>

          {/* Current sync status */}
          {orgDetails?.license_config && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-4 text-sm">
                {orgDetails.license_config.last_sync_at && (
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('organizations.lastSync', 'Último Sync')}</Label>
                    <p className="mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      {new Date(orgDetails.license_config.last_sync_at).toLocaleString('pt-BR')}
                    </p>
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
                {orgDetails.license_config.sync_error && (
                  <div className="col-span-2">
                    <Label className="text-xs text-muted-foreground">{t('organizations.syncError', 'Erro de Sync')}</Label>
                    <p className="mt-1 text-xs text-red-500 flex items-start gap-1">
                      <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      {orgDetails.license_config.sync_error}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Current Primary License (read-only summary) */}
      {orgDetails?.primary_license ? (
        <Card className={`glass ${orgDetails.primary_license.is_trial ? 'border-amber-500/50' : 'border-primary/20'}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              {t('organizations.primaryLicense', 'Licença Atual')}
              {orgDetails.primary_license.is_trial && (
                <Badge variant="outline" className="text-amber-600 border-amber-600 ml-2">Trial</Badge>
              )}
              <Badge variant={orgDetails.primary_license.is_active ? 'default' : 'secondary'} className="ml-auto">
                {orgDetails.primary_license.is_active ? t('organizations.active', 'Ativa') : t('organizations.inactive', 'Inativa')}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">{t('organizations.planType', 'Plano')}</Label>
                <p className="mt-1 font-medium">{orgDetails.primary_license.plan_type}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t('organizations.licenseKey', 'Chave')}</Label>
                <p className="mt-1 font-mono text-xs truncate">{orgDetails.primary_license.license_key}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-2 rounded-lg bg-muted/50 text-center">
                <p className="text-lg font-semibold">{orgDetails.primary_license.max_users}</p>
                <p className="text-xs text-muted-foreground">{t('organizations.maxSeats', 'Máx.')}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/50 text-center">
                <p className="text-lg font-semibold">{orgDetails.primary_license.used_seats}</p>
                <p className="text-xs text-muted-foreground">{t('organizations.usedSeats', 'Usados')}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/50 text-center">
                <p className="text-lg font-semibold">{orgDetails.primary_license.max_users - orgDetails.primary_license.used_seats}</p>
                <p className="text-xs text-muted-foreground">{t('organizations.availableSeats', 'Livres')}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">{t('organizations.validUntil', 'Válido até')}</Label>
                <p className="mt-1">{new Date(orgDetails.primary_license.valid_until).toLocaleDateString('pt-BR')}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t('organizations.daysRemaining', 'Dias restantes')}</Label>
                <p className={`mt-1 font-semibold ${
                  orgDetails.primary_license.days_remaining !== null && orgDetails.primary_license.days_remaining <= 7
                    ? 'text-red-500'
                    : orgDetails.primary_license.days_remaining !== null && orgDetails.primary_license.days_remaining <= 30
                      ? 'text-amber-500'
                      : 'text-green-500'
                }`}>
                  {orgDetails.primary_license.days_remaining ?? 'N/A'}
                </p>
              </div>
            </div>

            {orgDetails.primary_license.is_expired && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 text-red-600 text-sm">
                <AlertCircle className="h-4 w-4" />
                {t('organizations.licenseExpired', 'Esta licença está expirada')}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="glass border-primary/20">
          <CardContent className="py-6">
            <div className="text-center">
              <CreditCard className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t('organizations.noLicense', 'Nenhuma licença cadastrada')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('organizations.noLicenseHint', 'Configure o Customer ID acima e sincronize para vincular uma licença')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
