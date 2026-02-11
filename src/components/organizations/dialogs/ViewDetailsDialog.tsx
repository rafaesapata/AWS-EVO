/**
 * View Organization Details Dialog
 * Shows organization details with 4 tabs: General, Users, Cloud, License
 */
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Building2,
  FileText,
  AlertTriangle,
  Hash,
  Users,
  Cloud,
  Shield,
  Key,
  Crown,
  User,
  Settings,
  CreditCard,
  Clock,
  Edit,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { Organization, OrganizationDetails } from "../types";
import { useOrganizationDetails, useSyncLicense } from "../hooks/useOrganizations";

interface ViewDetailsDialogProps {
  organization: Organization | null;
  onClose: () => void;
  onEdit: (org: Organization) => void;
}

export function ViewDetailsDialog({ organization, onClose, onEdit }: ViewDetailsDialogProps) {
  const { t } = useTranslation();
  const { data: orgDetails, isLoading } = useOrganizationDetails(organization?.id);

  const handleEdit = () => {
    if (organization) {
      onEdit(organization);
      onClose();
    }
  };

  return (
    <Dialog open={!!organization} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {t('organizations.orgDetails', 'Detalhes da Organização')}: {organization?.name}
          </DialogTitle>
          <DialogDescription>
            {t('organizations.orgDetailsDescription', 'Informações completas da organização')}
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="flex-1 pr-4">
          {isLoading ? (
            <div className="space-y-4 p-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : orgDetails ? (
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-4 glass">
                <TabsTrigger value="general">{t('organizations.tabGeneral', 'Geral')}</TabsTrigger>
                <TabsTrigger value="users">{t('organizations.tabUsers', 'Usuários')}</TabsTrigger>
                <TabsTrigger value="cloud">{t('organizations.tabCloud', 'Cloud')}</TabsTrigger>
                <TabsTrigger value="license">{t('organizations.tabLicense', 'Licença')}</TabsTrigger>
              </TabsList>

              {/* General Tab */}
              <TabsContent value="general" className="space-y-4">
                <GeneralTab orgDetails={orgDetails} />
              </TabsContent>

              {/* Users Tab */}
              <TabsContent value="users" className="space-y-4">
                <UsersTab orgDetails={orgDetails} />
              </TabsContent>

              {/* Cloud Tab */}
              <TabsContent value="cloud" className="space-y-4">
                <CloudTab orgDetails={orgDetails} />
              </TabsContent>

              {/* License Tab */}
              <TabsContent value="license" className="space-y-4">
                <LicenseTab orgDetails={orgDetails} organizationId={organization?.id} />
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
          <Button variant="outline" onClick={onClose}>
            {t('common.close', 'Fechar')}
          </Button>
          <Button onClick={handleEdit} className="glass hover-glow">
            <Edit className="h-4 w-4 mr-2" />
            {t('organizations.editOrg', 'Editar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// General Tab Component
function GeneralTab({ orgDetails }: { orgDetails: OrganizationDetails }) {
  const { t } = useTranslation();

  return (
    <>
      <Card className="glass border-primary/20">
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
          {orgDetails.contact_email && (
            <div>
              <Label className="text-xs text-muted-foreground">{t('organizations.billingEmail', 'Email de Contato')}</Label>
              <p className="text-sm mt-1">{orgDetails.contact_email}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Demo Mode Info */}
      <Card className={`glass ${orgDetails.demo_mode ? 'border-amber-500/50 bg-amber-500/5' : 'border-primary/20'}`}>
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
      <Card className="glass border-primary/20">
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
    </>
  );
}

// Users Tab Component
function UsersTab({ orgDetails }: { orgDetails: OrganizationDetails }) {
  const { t } = useTranslation();

  return (
    <Card className="glass border-primary/20">
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
  );
}

// Cloud Tab Component
function CloudTab({ orgDetails }: { orgDetails: OrganizationDetails }) {
  const { t } = useTranslation();

  return (
    <>
      {/* AWS Credentials */}
      <Card className="glass border-primary/20">
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
      <Card className="glass border-primary/20">
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
    </>
  );
}

// License Tab Component
function LicenseTab({ orgDetails, organizationId }: { orgDetails: OrganizationDetails; organizationId?: string }) {
  const { t } = useTranslation();
  const syncLicenseMutation = useSyncLicense(organizationId);

  const handleForceSync = () => {
    if (organizationId) {
      syncLicenseMutation.mutate(organizationId);
    }
  };

  return (
    <>
      {/* License Config */}
      {orgDetails.license_config && (
        <Card className="glass border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="h-4 w-4" />
              {t('organizations.licenseConfig', 'Configuração de Licença')}
              <Button
                variant="outline"
                size="sm"
                className="ml-auto glass hover-glow"
                onClick={handleForceSync}
                disabled={syncLicenseMutation.isPending || !organizationId}
              >
                {syncLicenseMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {t('organizations.forceSync', 'Forçar Sync')}
              </Button>
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
        <Card className={`glass ${orgDetails.primary_license.is_trial ? 'border-amber-500/50' : 'border-primary/20'}`}>
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
        <Card className="glass border-primary/20">
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
    </>
  );
}
