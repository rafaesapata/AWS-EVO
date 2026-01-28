import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useOrganizationQuery } from "@/hooks/useOrganizationQuery";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { 
  RefreshCw, CheckCircle2, XCircle, AlertTriangle, Key, Calendar, 
  Users, Shield, CreditCard, Sparkles, Clock, TrendingUp, Award, ExternalLink, ShoppingCart
} from "lucide-react";
import { SeatManagement } from "@/components/license/SeatManagement";
import { Layout } from "@/components/Layout";

interface Organization {
  id: string;
  name: string;
  customer_id?: string;
}

interface License {
  license_key: string;
  product_type: string;
  status: string;
  total_seats: number;
  used_seats: number;
  available_seats: number;
  valid_from: string;
  valid_until: string;
  is_expired: boolean;
  has_available_seats: boolean;
  is_trial: boolean;
  days_remaining: number;
}

interface LicenseValidationResponse {
  valid: boolean;
  customer_id: string;
  total_licenses: number;
  licenses: License[];
  organization_id: string;
  configured?: boolean;
  _isNewLink?: boolean;
}

// Stat Card Component - Modern Design
function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  subValue, 
  color = "blue",
  highlight = false
}: { 
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subValue?: string;
  color?: "blue" | "green" | "amber" | "red";
  highlight?: boolean;
}) {
  const colorClasses = {
    blue: "bg-[#003C7D]/10 text-[#003C7D]",
    green: "bg-emerald-500/10 text-emerald-600",
    amber: "bg-amber-500/10 text-amber-600",
    red: "bg-red-500/10 text-red-600"
  };

  return (
    <div className={`relative p-5 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 ${highlight ? 'ring-2 ring-[#003C7D]/20' : ''}`}>
      {highlight && (
        <div className="absolute -top-1 -right-1">
          <span className="flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#003C7D] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#003C7D]"></span>
          </span>
        </div>
      )}
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-xl ${colorClasses[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-semibold text-[#1F2937] mt-1">{value}</p>
          {subValue && <p className="text-xs text-gray-400 mt-0.5">{subValue}</p>}
        </div>
      </div>
    </div>
  );
}

export default function LicenseManagement() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [customerId, setCustomerId] = useState("");

  // Get organization data
  const { data: organization, isLoading: orgLoading } = useOrganizationQuery<Organization>(
    ["user-organization"],
    async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error("Não autenticado");

      const orgData = await apiClient.invoke<{ organizationId?: string; organization?: { id: string }; data?: string }>('get-user-organization', {
        body: { userId: user.id }
      });

      if (!orgData.data) throw new Error("Organização não encontrada");
      
      const organizationId = (orgData.data as any).organizationId || (orgData.data as any).organization?.id || orgData.data;
      
      if (!organizationId || typeof organizationId !== 'string') {
        throw new Error("ID da organização não encontrado");
      }

      const org = await apiClient.select<Organization>('organizations', {
        select: '*',
        eq: { id: organizationId }
      });

      if (org.error) throw org.error;
      return org.data?.[0] as Organization;
    }
  );

  // Auto-fetch license data
  const { data: licenseData, isLoading: licenseLoading, refetch: refetchLicense } = useQuery({
    queryKey: ['license-data', organization?.id],
    queryFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error("Não autenticado");

      const result = await apiClient.invoke<LicenseValidationResponse>("validate-license", { 
        body: {}
      });

      if (result.error) throw result.error;
      return result.data;
    },
    enabled: !!organization?.id,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Mutation for linking new customer_id
  const linkCustomerIdMutation = useMutation({
    mutationFn: async (newCustomerId: string) => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error("Não autenticado");

      const result = await apiClient.invoke<LicenseValidationResponse>("validate-license", { 
        body: { customer_id: newCustomerId }
      });

      if (result.error) throw result.error;
      if (!result.data?.valid) {
        throw new Error("Licença inválida ou expirada");
      }

      return result.data;
    },
    onSuccess: (data) => {
      toast({
        title: t('licenseManagement.linkSuccess', 'Licença vinculada com sucesso'),
        description: `${data.total_licenses || 0} ${t('licenseManagement.activeLicenses', 'licença(s) ativa(s) encontrada(s)')}`,
      });
      refetchLicense();
    },
    onError: (error: Error) => {
      toast({
        title: t('licenseManagement.linkError', 'Erro ao vincular licença'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation for syncing licenses
  const syncLicenseMutation = useMutation({
    mutationFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error("Não autenticado");

      const result = await apiClient.invoke("sync-license", { body: {} });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: (data: any) => {
      const syncResult = data?.sync_result;
      if (syncResult?.success) {
        toast({
          title: t('licenseManagement.syncSuccess', 'Licenças sincronizadas'),
          description: `${syncResult.licenses_synced || 0} ${t('licenseManagement.licensesSynced', 'licença(s) sincronizada(s)')}`,
        });
      } else {
        toast({
          title: t('licenseManagement.syncPartial', 'Sync parcial'),
          description: syncResult?.errors?.join(', ') || t('licenseManagement.syncPartialDesc', 'Algumas licenças não foram sincronizadas'),
          variant: "destructive",
        });
      }
      refetchLicense();
    },
    onError: (error: Error) => {
      toast({
        title: t('licenseManagement.syncError', 'Erro ao sincronizar'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLinkCustomerId = () => {
    if (!customerId.trim()) {
      toast({
        title: t('licenseManagement.customerIdRequired', 'Customer ID obrigatório'),
        description: t('licenseManagement.customerIdRequiredDesc', 'Por favor, informe o Customer ID fornecido'),
        variant: "destructive",
      });
      return;
    }
    linkCustomerIdMutation.mutate(customerId);
  };

  const handleRefreshLicense = () => {
    syncLicenseMutation.mutate();
  };

  const getStatusBadge = (status: string, isExpired: boolean) => {
    if (isExpired) {
      return (
        <Badge className="bg-red-500/10 text-red-600 border-red-200 gap-1.5 px-3 py-1">
          <XCircle className="h-3.5 w-3.5" />
          {t('licenseManagement.expired', 'Expirada')}
        </Badge>
      );
    }
    
    switch (status) {
      case "active":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 gap-1.5 px-3 py-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t('licenseManagement.active', 'Ativa')}
          </Badge>
        );
      case "suspended":
        return (
          <Badge className="bg-amber-500/10 text-amber-600 border-amber-200 gap-1.5 px-3 py-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('licenseManagement.suspended', 'Suspensa')}
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // Check user roles
  const { data: userRoles } = useQuery({
    queryKey: ['user-roles'],
    queryFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) return [];
      
      let roles: string[] = [];
      const rolesStr = user.attributes?.['custom:roles'];
      if (rolesStr) {
        try {
          roles = typeof rolesStr === 'string' ? JSON.parse(rolesStr) : rolesStr;
        } catch {
          roles = [];
        }
      }
      return roles;
    }
  });

  const isAdmin = userRoles?.includes('org_admin') || userRoles?.includes('super_admin');
  const hasCustomerId = licenseData?.customer_id || licenseData?.configured;

  // Fetch real seat assignments
  const { data: realSeatAssignments = [] } = useQuery({
    queryKey: ['real-seat-assignments', organization?.id, licenseData?.licenses?.[0]?.license_key],
    queryFn: async () => {
      if (!licenseData?.licenses?.[0]?.license_key || !organization?.id) return [];
      
      const licenseResponse = await apiClient.select<{ id: string; license_key: string }>('licenses', { 
        eq: { license_key: licenseData.licenses[0].license_key }
      });
      
      if (licenseResponse.error || !licenseResponse.data?.[0]) return [];
      
      const licenseRecord = licenseResponse.data[0];
      
      const seatsResponse = await apiClient.select('license_seat_assignments', { 
        eq: { license_id: licenseRecord.id }
      });
      
      if (seatsResponse.error) return [];
      
      const profilesResponse = await apiClient.select('profiles', { 
        eq: { organization_id: organization.id }
      });
      
      if (profilesResponse.error) return [];
      
      const validUserIds = new Set(profilesResponse.data?.map((p: any) => p.user_id) || []);
      const validSeats = (seatsResponse.data || []).filter((seat: any) => validUserIds.has(seat.user_id));
      
      return validSeats;
    },
    enabled: !!licenseData?.licenses?.[0]?.license_key && !!organization?.id
  });

  const realUsedSeats = realSeatAssignments.length;
  const realAvailableSeats = (licenseData?.licenses?.[0]?.total_seats || 0) - realUsedSeats;
  const license = licenseData?.licenses?.[0];

  // Loading state
  if (orgLoading) {
    return (
      <Layout
        title={t('sidebar.licenseManagement', 'Gerenciamento de Licenças')}
        description={t('licenseManagement.description', 'Visualize e gerencie sua licença da plataforma EVO')}
        icon={<CreditCard className="h-4 w-4" />}
      >
        <div className="min-h-[80vh] bg-[#F1F3F7] -m-6 p-6">
          <div className="space-y-6">
            <Skeleton className="h-12 w-96 rounded-xl" />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title={t('sidebar.licenseManagement', 'Gerenciamento de Licenças')}
      description={t('licenseManagement.description', 'Visualize e gerencie sua licença da plataforma EVO')}
      icon={<CreditCard className="h-4 w-4" />}
    >
      <div className="min-h-[80vh] bg-[#F1F3F7] -m-6 p-6 space-y-6">
        {/* Loading State */}
        {(licenseLoading || linkCustomerIdMutation.isPending) && (
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <div className="flex flex-col items-center justify-center py-8">
              <div className="relative">
                <div className="absolute inset-0 bg-[#003C7D]/20 rounded-full blur-xl animate-pulse"></div>
                <RefreshCw className="h-12 w-12 animate-spin text-[#003C7D] relative" />
              </div>
              <span className="mt-4 text-gray-500 font-medium">
                {t('licenseManagement.checkingStatus', 'Verificando status da licença...')}
              </span>
            </div>
          </div>
        )}

        {/* Link Customer ID Form */}
        {!licenseLoading && !linkCustomerIdMutation.isPending && !licenseData?.valid && !hasCustomerId ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Header with gradient */}
            <div className="bg-gradient-to-r from-[#003C7D] to-[#008CFF] p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Key className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {t('licenseManagement.linkTitle', 'Vincular Customer ID')}
                  </h2>
                  <p className="text-white/80 text-sm mt-0.5">
                    {t('licenseManagement.linkDescription', 'Informe o Customer ID para ativar sua licença')}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="customer-id" className="text-sm font-medium text-gray-700">
                  Customer ID
                </Label>
                <Input
                  id="customer-id"
                  placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="font-mono h-12 rounded-xl border-gray-200 focus:border-[#003C7D] focus:ring-[#003C7D]/20"
                />
                <p className="text-xs text-gray-500">
                  {t('licenseManagement.customerIdHint', 'O Customer ID é um identificador único fornecido no momento da compra')}
                </p>
              </div>
              
              <Button
                onClick={handleLinkCustomerId}
                disabled={linkCustomerIdMutation.isPending || licenseLoading}
                className="w-full h-12 rounded-xl bg-[#003C7D] hover:bg-[#002d5e] text-white font-medium shadow-lg shadow-[#003C7D]/25 transition-all duration-300"
              >
                {linkCustomerIdMutation.isPending || licenseLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    {t('licenseManagement.validating', 'Validando...')}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {t('licenseManagement.linkAndValidate', 'Vincular e Validar Licença')}
                  </>
                )}
              </Button>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-3 text-gray-400">
                    {t('licenseManagement.or', 'ou')}
                  </span>
                </div>
              </div>

              {/* Buy License Button */}
              <Button
                onClick={() => window.open('https://app.nuevacore.com', '_blank')}
                variant="outline"
                className="w-full h-12 rounded-xl border-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-600 font-medium transition-all duration-300 group"
              >
                <ShoppingCart className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" />
                {t('licenseManagement.buyLicense', 'Comprar Licença')}
                <ExternalLink className="h-3.5 w-3.5 ml-2 opacity-50" />
              </Button>
            </div>
          </div>
        ) : !licenseLoading && !linkCustomerIdMutation.isPending && (licenseData?.valid || hasCustomerId) ? (
          <div className="space-y-6">

            {/* Header Card with Customer ID */}
            <div className="bg-gradient-to-r from-[#003C7D] to-[#008CFF] rounded-2xl p-6 shadow-lg">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                    <Award className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-white/80 text-sm">{t('licenseManagement.customerId', 'Customer ID')}</p>
                    <p className="font-mono text-lg font-semibold text-white">
                      {licenseData?.customer_id || organization?.customer_id}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleRefreshLicense}
                  disabled={syncLicenseMutation.isPending || licenseLoading}
                  className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm rounded-xl h-11 px-5"
                >
                  {syncLicenseMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      {t('licenseManagement.syncing', 'Sincronizando...')}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      {t('licenseManagement.updateStatus', 'Atualizar Status')}
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Stats Grid */}
            {license && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  icon={Users}
                  label={t('licenseManagement.seats', 'Assentos')}
                  value={`${realUsedSeats}/${license.total_seats}`}
                  subValue={`${realAvailableSeats} ${t('licenseManagement.available', 'disponíveis')}`}
                  color={realAvailableSeats > 0 ? "blue" : "amber"}
                  highlight={realAvailableSeats === 0}
                />
                <StatCard
                  icon={Clock}
                  label={t('licenseManagement.daysRemaining', 'Dias Restantes')}
                  value={license.days_remaining}
                  subValue={t('licenseManagement.untilExpiration', 'até expiração')}
                  color={license.days_remaining < 30 ? "red" : license.days_remaining < 90 ? "amber" : "green"}
                  highlight={license.days_remaining < 30}
                />
                <StatCard
                  icon={Calendar}
                  label={t('licenseManagement.validUntil', 'Válida Até')}
                  value={formatDate(license.valid_until)}
                  subValue={`${t('licenseManagement.since', 'Desde')} ${formatDate(license.valid_from)}`}
                  color="blue"
                />
                <StatCard
                  icon={TrendingUp}
                  label={t('licenseManagement.productType', 'Tipo de Produto')}
                  value={license.product_type.toUpperCase()}
                  subValue={license.is_trial ? t('licenseManagement.trialVersion', 'Versão Trial') : t('licenseManagement.fullVersion', 'Versão Completa')}
                  color={license.is_trial ? "amber" : "green"}
                />
              </div>
            )}

            {/* Upgrade/Buy License Card - Show for trial or expiring licenses */}
            {license && (license.is_trial || license.days_remaining < 30) && (
              <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl p-6 shadow-lg">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                      <ShoppingCart className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {license.is_trial 
                          ? t('licenseManagement.upgradeTitle', 'Faça o Upgrade para a Versão Completa')
                          : t('licenseManagement.renewTitle', 'Renove sua Licença')
                        }
                      </h3>
                      <p className="text-white/80 text-sm mt-0.5">
                        {license.is_trial 
                          ? t('licenseManagement.upgradeDescription', 'Desbloqueie todos os recursos e remova as limitações do trial')
                          : t('licenseManagement.renewDescription', 'Sua licença expira em breve. Renove para continuar usando a plataforma')
                        }
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => window.open('https://app.nuevacore.com', '_blank')}
                    className="bg-white text-emerald-600 hover:bg-emerald-50 border-0 rounded-xl h-12 px-6 font-semibold shadow-lg transition-all duration-300 group"
                  >
                    <ShoppingCart className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" />
                    {license.is_trial 
                      ? t('licenseManagement.buyNow', 'Comprar Agora')
                      : t('licenseManagement.renewNow', 'Renovar Agora')
                    }
                    <ExternalLink className="h-3.5 w-3.5 ml-2 opacity-70" />
                  </Button>
                </div>
              </div>
            )}

            {/* Tabs Section */}
            {licenseData && (
              <Tabs defaultValue="details" className="w-full">
                <TabsList className={`bg-white rounded-xl p-1 shadow-sm border border-gray-100 h-12 ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'} grid w-full max-w-md`}>
                  <TabsTrigger 
                    value="details" 
                    className="rounded-lg data-[state=active]:bg-[#003C7D] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
                  >
                    {t('licenseManagement.licenseDetails', 'Detalhes da Licença')}
                  </TabsTrigger>
                  {isAdmin && (
                    <TabsTrigger 
                      value="seats"
                      className="rounded-lg data-[state=active]:bg-[#003C7D] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
                    >
                      {t('licenseManagement.manageSeats', 'Gerenciar Assentos')}
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="details" className="space-y-4 mt-6">
                  {(licenseData.licenses || []).map((lic, index) => (
                    <div key={index} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                      {/* License Header */}
                      <div className="p-6 border-b border-gray-100">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-[#003C7D]/10 rounded-xl">
                              <Shield className="h-6 w-6 text-[#003C7D]" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-lg font-semibold text-[#1F2937]">
                                  {t('licenseManagement.evoLicense', 'Licença EVO')}
                                </h3>
                                {lic.is_trial && (
                                  <Badge className="bg-amber-500/10 text-amber-600 border-amber-200">
                                    Trial
                                  </Badge>
                                )}
                              </div>
                              <p className="font-mono text-xs text-gray-400 mt-1">
                                {lic.license_key}
                              </p>
                            </div>
                          </div>
                          {getStatusBadge(lic.status, lic.is_expired)}
                        </div>
                      </div>

                      {/* License Details Grid */}
                      <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Seats Card */}
                          <div className="p-5 rounded-xl bg-gradient-to-br from-[#003C7D]/5 to-[#008CFF]/5 border border-[#003C7D]/10">
                            <div className="flex items-center gap-2 text-sm text-[#003C7D] mb-3">
                              <Users className="h-4 w-4" />
                              <span className="font-medium">{t('licenseManagement.seats', 'Assentos')}</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-4xl font-bold text-[#003C7D]">{realUsedSeats}</span>
                              <span className="text-gray-400 text-lg">/ {lic.total_seats}</span>
                            </div>
                            <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-[#003C7D] to-[#008CFF] rounded-full transition-all duration-500"
                                style={{ width: `${(realUsedSeats / lic.total_seats) * 100}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              {realAvailableSeats} {t('licenseManagement.available', 'disponíveis')}
                            </p>
                          </div>

                          {/* Validity Card */}
                          <div className="p-5 rounded-xl bg-gradient-to-br from-emerald-500/5 to-emerald-600/5 border border-emerald-500/10">
                            <div className="flex items-center gap-2 text-sm text-emerald-600 mb-3">
                              <Calendar className="h-4 w-4" />
                              <span className="font-medium">{t('licenseManagement.validity', 'Validade')}</span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-500">{t('licenseManagement.start', 'Início')}</span>
                                <span className="text-sm font-medium text-[#1F2937]">{formatDate(lic.valid_from)}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-500">{t('licenseManagement.end', 'Término')}</span>
                                <span className="text-sm font-medium text-[#1F2937]">{formatDate(lic.valid_until)}</span>
                              </div>
                            </div>
                            {/* Time Progress Bar */}
                            {(() => {
                              const startDate = new Date(lic.valid_from).getTime();
                              const endDate = new Date(lic.valid_until).getTime();
                              const now = Date.now();
                              const totalDuration = endDate - startDate;
                              const elapsed = now - startDate;
                              const percentUsed = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
                              const percentRemaining = 100 - percentUsed;
                              
                              return (
                                <div className="mt-3">
                                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full transition-all duration-500 ${
                                        percentRemaining < 20 
                                          ? 'bg-gradient-to-r from-red-400 to-red-500' 
                                          : percentRemaining < 50 
                                            ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                                            : 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                                      }`}
                                      style={{ width: `${percentRemaining}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-gray-500 mt-2">
                                    {Math.round(percentRemaining)}% {t('licenseManagement.timeRemaining', 'do tempo restante')}
                                  </p>
                                </div>
                              );
                            })()}
                          </div>

                          {/* Status Card */}
                          <div className={`p-5 rounded-xl border ${
                            lic.days_remaining < 30 
                              ? 'bg-gradient-to-br from-red-500/5 to-red-600/5 border-red-500/10' 
                              : 'bg-gradient-to-br from-amber-500/5 to-amber-600/5 border-amber-500/10'
                          }`}>
                            <div className={`flex items-center gap-2 text-sm mb-3 ${
                              lic.days_remaining < 30 ? 'text-red-600' : 'text-amber-600'
                            }`}>
                              <AlertTriangle className="h-4 w-4" />
                              <span className="font-medium">{t('licenseManagement.status', 'Status')}</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                              <span className={`text-4xl font-bold ${
                                lic.days_remaining < 30 ? 'text-red-600' : lic.days_remaining < 90 ? 'text-amber-600' : 'text-emerald-600'
                              }`}>
                                {lic.days_remaining}
                              </span>
                              <span className="text-gray-500 text-sm">{t('licenseManagement.days', 'dias')}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              {t('licenseManagement.remaining', 'restantes')}
                            </p>
                          </div>
                        </div>

                        <Separator className="my-4" />

                        {/* Product Type */}
                        <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50">
                          <span className="text-sm text-gray-500">{t('licenseManagement.productType', 'Tipo de Produto')}</span>
                          <Badge className="bg-[#003C7D]/10 text-[#003C7D] border-[#003C7D]/20 uppercase font-semibold">
                            {lic.product_type}
                          </Badge>
                        </div>

                        {/* Alerts */}
                        {lic.is_expired && (
                          <Alert className="bg-red-50 border-red-200 rounded-xl">
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                            <AlertDescription className="text-red-700">
                              {t('licenseManagement.expiredAlert', 'Esta licença expirou. Entre em contato com o suporte para renovação.')}
                            </AlertDescription>
                          </Alert>
                        )}

                        {!lic.has_available_seats && !lic.is_expired && (
                          <Alert className="bg-amber-50 border-amber-200 rounded-xl">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            <AlertDescription className="text-amber-700">
                              {t('licenseManagement.noSeatsAlert', 'Todos os assentos estão em uso. Para adicionar mais usuários, entre em contato com o suporte.')}
                            </AlertDescription>
                          </Alert>
                        )}

                        {lic.days_remaining < 30 && !lic.is_expired && (
                          <Alert className="bg-amber-50 border-amber-200 rounded-xl">
                            <Clock className="h-4 w-4 text-amber-600" />
                            <AlertDescription className="text-amber-700">
                              {t('licenseManagement.expiringAlert', 'Sua licença expira em menos de 30 dias. Considere renovar para evitar interrupções.')}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>
                  ))}
                </TabsContent>

                {isAdmin && licenseData.licenses?.length > 0 && licenseData.licenses[0] && (
                  <TabsContent value="seats" className="mt-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                      <SeatManagement
                        organizationId={organization!.id}
                        totalSeats={licenseData.licenses[0].total_seats}
                        licenseKey={licenseData.licenses[0].license_key}
                      />
                    </div>
                  </TabsContent>
                )}
              </Tabs>
            )}
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
