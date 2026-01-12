import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, Key, Calendar, Users, Shield, CreditCard } from "lucide-react";
import { SeatManagement } from "@/components/license/SeatManagement";
import { PageLayout } from "@/components/layout/PageLayout";

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

export default function LicenseManagement() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState("");

  // Get organization data
  const { data: organization, isLoading: orgLoading } = useOrganizationQuery(
    ["user-organization"],
    async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error("Não autenticado");

      const orgData = await apiClient.invoke('get-user-organization', {
        body: { userId: user.username }
      });

      if (!orgData.data) throw new Error("Organização não encontrada");
      
      // Extract organizationId from response
      const organizationId = orgData.data.organizationId || orgData.data.organization?.id || orgData.data;
      
      if (!organizationId || typeof organizationId !== 'string') {
        throw new Error("ID da organização não encontrado");
      }

      const org = await apiClient.select('organizations', {
        select: '*',
        eq: { id: organizationId }
      });

      if (org.error) throw org.error;
      return org.data[0];
    }
  );

  // Auto-fetch license data using useQuery (not mutation) for initial load
  const { data: licenseData, isLoading: licenseLoading, refetch: refetchLicense } = useQuery({
    queryKey: ['license-data', organization?.id],
    queryFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error("Não autenticado");

      const result = await apiClient.invoke<LicenseValidationResponse>("validate-license", { 
        body: {} // Empty body to just check status
      });

      if (result.error) throw result.error;
      return result.data;
    },
    enabled: !!organization?.id,
    staleTime: 0, // Always refetch
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
        title: "Licença vinculada com sucesso",
        description: `${data.total_licenses || 0} licença(s) ativa(s) encontrada(s)`,
      });
      // Refetch license data
      refetchLicense();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao vincular licença",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLinkCustomerId = () => {
    if (!customerId.trim()) {
      toast({
        title: "Customer ID obrigatório",
        description: "Por favor, informe o Customer ID fornecido pela plataforma de licenças",
        variant: "destructive",
      });
      return;
    }

    linkCustomerIdMutation.mutate(customerId);
  };

  const handleRefreshLicense = () => {
    refetchLicense();
  };

  const getStatusBadge = (status: string, isExpired: boolean) => {
    if (isExpired) {
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Expirada</Badge>;
    }
    
    switch (status) {
      case "active":
        return <Badge className="bg-green-600 gap-1"><CheckCircle2 className="h-3 w-3" />Ativa</Badge>;
      case "suspended":
        return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Suspensa</Badge>;
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

  // Check if user is admin to show seat management
  const { data: userRoles } = useQuery({
    queryKey: ['user-roles'],
    queryFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) return [];
      
      // Get roles from Cognito user attributes
      let roles: string[] = [];
      const rolesStr = user.attributes?.['custom:roles'];
      if (rolesStr) {
        try {
          roles = typeof rolesStr === 'string' ? JSON.parse(rolesStr) : rolesStr;
        } catch {
          roles = [];
        }
      }
      
      console.log('[LicenseManagement] User roles from Cognito:', roles);
      return roles;
    }
  });

  const isAdmin = userRoles?.includes('org_admin') || userRoles?.includes('super_admin');
  // Check if license is configured based on licenseData response, not organization
  const hasCustomerId = licenseData?.customer_id || licenseData?.configured;

  // Fetch real seat assignments for accurate count
  const { data: realSeatAssignments = [] } = useQuery({
    queryKey: ['real-seat-assignments', organization?.id, licenseData?.licenses?.[0]?.license_key],
    queryFn: async () => {
      if (!licenseData?.licenses?.[0]?.license_key || !organization?.id) return [];
      
      // Get license first
      const licenseResponse = await apiClient.select('licenses', { 
        eq: { license_key: licenseData.licenses[0].license_key }
      });
      
      if (licenseResponse.error || !licenseResponse.data?.[0]) return [];
      
      const license = licenseResponse.data[0];
      
      // Get seat assignments
      const seatsResponse = await apiClient.select('license_seat_assignments', { 
        eq: { license_id: license.id }
      });
      
      if (seatsResponse.error) return [];
      
      // Get organization profiles to filter valid seats
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

  // Calculate real seat counts
  const realUsedSeats = realSeatAssignments.length;
  const realAvailableSeats = (licenseData?.licenses?.[0]?.total_seats || 0) - realUsedSeats;

  if (orgLoading) {
    return (
      <PageLayout
        activeTab="license"
        title="Gerenciamento de Licença"
        subtitle="Visualize e gerencie sua licença da plataforma EVO"
        icon={CreditCard}
        showCloudAccountSelector={false}
      >
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      activeTab="license"
      title="Gerenciamento de Licença"
      subtitle="Visualize e gerencie sua licença da plataforma EVO"
      icon={CreditCard}
      showCloudAccountSelector={false}
    >
      <div className="max-w-4xl mx-auto space-y-6">

              {/* Show loading while checking license status */}
              {(licenseLoading || linkCustomerIdMutation.isPending) && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                      <span className="ml-3 text-muted-foreground">Verificando status da licença...</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Show license input form only when NOT loading AND no license data exists */}
              {!licenseLoading && !linkCustomerIdMutation.isPending && !licenseData?.valid && !hasCustomerId ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Key className="h-5 w-5 text-primary" />
                      Vincular Customer ID
                    </CardTitle>
                    <CardDescription>
                      Informe o Customer ID fornecido pela plataforma de licenças para vincular sua licença
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="customer-id">Customer ID</Label>
                      <Input
                        id="customer-id"
                        placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                        value={customerId}
                        onChange={(e) => setCustomerId(e.target.value)}
                        className="font-mono"
                      />
                      <p className="text-sm text-muted-foreground">
                        O Customer ID é um identificador único fornecido no momento da compra da licença
                      </p>
                    </div>
                    <Button
                      onClick={handleLinkCustomerId}
                      disabled={linkCustomerIdMutation.isPending || licenseLoading}
                      className="w-full"
                    >
                      {linkCustomerIdMutation.isPending || licenseLoading ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Validando...
                        </>
                      ) : (
                        <>
                          <Key className="h-4 w-4 mr-2" />
                          Vincular e Validar Licença
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ) : !licenseLoading && !linkCustomerIdMutation.isPending && (licenseData?.valid || hasCustomerId) ? (
                <div className="space-y-6">
                  {/* Customer ID Card */}
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Customer ID</p>
                          <p className="font-mono text-lg font-semibold">
                            {licenseData?.customer_id || organization?.customer_id}
                          </p>
                        </div>
                        <Button
                          onClick={handleRefreshLicense}
                          disabled={linkCustomerIdMutation.isPending || licenseLoading}
                          variant="outline"
                          size="sm"
                        >
                          {linkCustomerIdMutation.isPending || licenseLoading ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Atualizando...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Atualizar Status
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>



                  {licenseData && (
                    <Tabs defaultValue="details" className="w-full">
                      <TabsList className={`glass grid w-full ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <TabsTrigger value="details">Detalhes da Licença</TabsTrigger>
                        {isAdmin && <TabsTrigger value="seats">Gerenciar Assentos</TabsTrigger>}
                      </TabsList>

                      <TabsContent value="details" className="space-y-4 mt-4">
                        {(licenseData.licenses || []).map((license, index) => (
                          <Card key={index} className="glass border-primary/20">
                            <CardHeader className="pb-4">
                              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                <div className="space-y-1">
                                  <CardTitle className="flex items-center gap-2 text-lg">
                                    <Shield className="h-5 w-5 text-primary icon-pulse" />
                                    Licença EVO {license.is_trial && <Badge variant="outline" className="ml-2">Trial</Badge>}
                                  </CardTitle>
                                  <CardDescription className="font-mono text-xs">
                                    {license.license_key}
                                  </CardDescription>
                                </div>
                                {getStatusBadge(license.status, license.is_expired)}
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {/* Seats */}
                                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Users className="h-4 w-4" />
                                    <span>Assentos</span>
                                  </div>
                                  <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-bold">{realUsedSeats}</span>
                                    <span className="text-muted-foreground">/ {license.total_seats}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {realAvailableSeats} disponíveis
                                  </p>
                                </div>

                                {/* Validity */}
                                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Calendar className="h-4 w-4" />
                                    <span>Validade</span>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-sm">
                                      <span className="text-muted-foreground">Início:</span>{" "}
                                      <span className="font-medium">{formatDate(license.valid_from)}</span>
                                    </p>
                                    <p className="text-sm">
                                      <span className="text-muted-foreground">Término:</span>{" "}
                                      <span className="font-medium">{formatDate(license.valid_until)}</span>
                                    </p>
                                  </div>
                                </div>

                                {/* Status */}
                                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span>Status</span>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-sm">
                                      <span className="text-muted-foreground">Dias restantes:</span>{" "}
                                      <span className={`font-bold text-lg ${license.days_remaining < 30 ? "text-destructive" : "text-green-600"}`}>
                                        {license.days_remaining}
                                      </span>
                                    </p>
                                    {!license.has_available_seats && (
                                      <p className="text-xs text-destructive">
                                        Sem assentos disponíveis
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <Separator />

                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Tipo de Produto</span>
                                <Badge variant="outline" className="uppercase">{license.product_type}</Badge>
                              </div>

                              {license.is_expired && (
                                <Alert variant="destructive">
                                  <AlertTriangle className="h-4 w-4" />
                                  <AlertDescription>
                                    Esta licença expirou. Entre em contato com o suporte para renovação.
                                  </AlertDescription>
                                </Alert>
                              )}

                              {!license.has_available_seats && !license.is_expired && (
                                <Alert>
                                  <AlertTriangle className="h-4 w-4" />
                                  <AlertDescription>
                                    Todos os assentos estão em uso. Para adicionar mais usuários, entre em contato com o suporte.
                                  </AlertDescription>
                                </Alert>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </TabsContent>

                      {isAdmin && licenseData.licenses?.length > 0 && licenseData.licenses[0] && (
                        <TabsContent value="seats" className="mt-4">
                          <SeatManagement
                            organizationId={organization!.id}
                            totalSeats={licenseData.licenses[0].total_seats}
                            licenseKey={licenseData.licenses[0].license_key}
                          />
                        </TabsContent>
                      )}
                    </Tabs>
                  )}
                </div>
              ) : null}
            </div>
    </PageLayout>
  );
}
