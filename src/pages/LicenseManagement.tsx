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
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { SeatManagement } from "@/components/license/SeatManagement";
import { PageHeader } from "@/components/ui/page-header";

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
}

export default function LicenseManagement() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState("");
  const [licenseData, setLicenseData] = useState<LicenseValidationResponse | null>(null);

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

      const org = await apiClient.select('organizations', {
        select: '*',
        eq: { id: orgData.data }
      });

      if (org.error) throw org.error;
      return org.data[0];
    }
  );

  const validateLicenseMutation = useMutation({
    mutationFn: async (customerIdToValidate?: string) => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error("Não autenticado");

      const body: any = {};
      if (customerIdToValidate) {
        body.customer_id = customerIdToValidate;
      }

      const result = await apiClient.invoke("validate-license", { body });

      if (result.error) throw result.error;
      if (!result.data?.valid) throw new Error("Licença inválida ou expirada");

      // If linking a new customer_id, refresh the organization data
      if (customerIdToValidate) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      return result.data as LicenseValidationResponse;
    },
    onSuccess: (data) => {
      setLicenseData(data);
      
      const isNewLink = !organization?.customer_id;
      
      toast({
        title: "Licença validada com sucesso",
        description: isNewLink 
          ? "Customer ID vinculado! Redirecionando..."
          : `${data.total_licenses} licença(s) ativa(s) encontrada(s)`,
      });

      if (isNewLink) {
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao validar licença",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Auto-fetch license data when organization has customer_id
  useEffect(() => {
    if (organization?.customer_id && !licenseData && !validateLicenseMutation.isPending) {
      validateLicenseMutation.mutate(undefined);
    }
  }, [organization?.customer_id]);

  const handleLinkCustomerId = () => {
    if (!customerId.trim()) {
      toast({
        title: "Customer ID obrigatório",
        description: "Por favor, informe o Customer ID fornecido pela plataforma de licenças",
        variant: "destructive",
      });
      return;
    }

    validateLicenseMutation.mutate(customerId);
  };

  const handleRefreshLicense = () => {
    validateLicenseMutation.mutate(undefined);
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
      
      const result = await apiClient.select('user_roles', {
        select: 'role',
        eq: { user_id: user.username }
      });
      
      return result.data?.map(r => r.role) || [];
    }
  });

  const isAdmin = userRoles?.includes('org_admin') || userRoles?.includes('super_admin');
  const hasCustomerId = organization?.customer_id;

  if (orgLoading) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar activeTab="license" onTabChange={() => {}} />
          <main className="flex-1 p-6">
            <div className="max-w-4xl mx-auto space-y-6">
              <Skeleton className="h-12 w-64" />
              <Skeleton className="h-96 w-full" />
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar activeTab="license" onTabChange={(tab) => navigate(`/?tab=${tab}`)} />
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <PageHeader
                  icon={CreditCard}
                  title="Gerenciamento de Licença"
                  description="Visualize e gerencie sua licença da plataforma EVO"
                />
              </div>

              {!hasCustomerId && !licenseData && (
                <Alert className="border-primary/20 bg-primary/5">
                  <Key className="h-4 w-4 text-primary" />
                  <AlertDescription>
                    Sua organização ainda não possui um Customer ID vinculado. Vincule seu Customer ID para ativar sua licença.
                  </AlertDescription>
                </Alert>
              )}

              {!hasCustomerId && !licenseData ? (
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
                      disabled={validateLicenseMutation.isPending}
                      className="w-full"
                    >
                      {validateLicenseMutation.isPending ? (
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
              ) : (
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
                          disabled={validateLicenseMutation.isPending}
                          variant="outline"
                          size="sm"
                        >
                          {validateLicenseMutation.isPending ? (
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

                  {/* Loading state */}
                  {validateLicenseMutation.isPending && !licenseData && (
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-center py-8">
                          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                          <span className="ml-3 text-muted-foreground">Carregando dados da licença...</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {licenseData && (
                    <Tabs defaultValue="details" className="w-full">
                      <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <TabsTrigger value="details">Detalhes da Licença</TabsTrigger>
                        {isAdmin && <TabsTrigger value="seats">Gerenciar Assentos</TabsTrigger>}
                      </TabsList>

                      <TabsContent value="details" className="space-y-4 mt-4">
                        {licenseData.licenses.map((license, index) => (
                          <Card key={index}>
                            <CardHeader className="pb-4">
                              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                <div className="space-y-1">
                                  <CardTitle className="flex items-center gap-2 text-lg">
                                    <Shield className="h-5 w-5 text-primary" />
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
                                    <span className="text-3xl font-bold">{license.used_seats}</span>
                                    <span className="text-muted-foreground">/ {license.total_seats}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {license.available_seats} disponíveis
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

                      {isAdmin && licenseData.licenses[0] && (
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
              )}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
