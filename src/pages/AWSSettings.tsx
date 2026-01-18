import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cloud, Shield, CheckCircle2, AlertCircle, Settings, Zap } from "lucide-react";
import { Layout } from "@/components/Layout";
import AwsCredentialsManager from "@/components/dashboard/AwsCredentialsManager";
import { AWSPermissionsGuide } from "@/components/dashboard/AWSPermissionsGuide";
import PermissionErrorAlert from "@/components/PermissionErrorAlert";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { AWSToolsConfiguration } from "@/components/dashboard/AWSToolsConfiguration";
import { AWSServicesMonitoring } from "@/components/dashboard/AWSServicesMonitoring";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function AWSSettings() {
 const { t } = useTranslation();
 const location = useLocation();
 const [activeTab, setActiveTab] = useState("credentials");
 const [hasError, setHasError] = useState(false);
 
 // Check if user was redirected here due to no AWS accounts
 const redirectState = location.state as { reason?: string; message?: string; from?: string } | null;
 const wasRedirectedForNoAccounts = redirectState?.reason === 'no_aws_accounts';
 
 // Listen for tab switch events from AwsCredentialsManager
 useEffect(() => {
 const handleSwitchTab = () => {
 setActiveTab("permissions");
 };
 
 window.addEventListener('switchToPermissionsTab', handleSwitchTab);
 return () => window.removeEventListener('switchToPermissionsTab', handleSwitchTab);
 }, []);
 
 // Use centralized AWS account context with error handling
 const { awsAccounts, error: accountsError, isLoading } = useCloudAccount();

 // Handle errors from AWS account context
 useEffect(() => {
 if (accountsError) {
 console.error('AWS Settings - Account context error:', accountsError);
 setHasError(true);
 }
 }, [accountsError]);

 const hasConnectedAccounts = Array.isArray(awsAccounts) && awsAccounts.length > 0;
 const allAccountsValid = Array.isArray(awsAccounts) && awsAccounts.every(acc => 
 acc?.aws_validation_status?.[0]?.is_connected && 
 acc?.aws_validation_status?.[0]?.has_all_permissions
 );

 // Show loading state
 if (isLoading) {
 return (
 <Layout 
 title={t('sidebar.awsSettings', 'Configurações AWS')} 
 description={t('awsSettings.description', 'Configure e gerencie suas integrações AWS com ferramentas nativas')}
 icon={<Cloud className="h-7 w-7" />}
 >
 <div className="flex items-center justify-center h-64">
 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
 </div>
 </Layout>
 );
 }

 // Show error state
 if (hasError || accountsError) {
 return (
 <Layout 
 title={t('sidebar.awsSettings', 'Configurações AWS')} 
 description={t('awsSettings.description', 'Configure e gerencie suas integrações AWS com ferramentas nativas')}
 icon={<Cloud className="h-7 w-7" />}
 >
 <div className="text-center py-12">
 <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-500" />
 <h3 className="text-xl font-semibold mb-2">Erro ao carregar configurações</h3>
 <p className="text-muted-foreground mb-4">
 Ocorreu um erro ao carregar as configurações AWS. Tente recarregar a página.
 </p>
 <Button onClick={() => window.location.reload()}>
 Recarregar Página
 </Button>
 </div>
 </Layout>
 );
 }

 return (
 <Layout 
 title={t('sidebar.awsSettings', 'Configurações AWS')} 
 description={t('awsSettings.description', 'Configure e gerencie suas integrações AWS com ferramentas nativas')}
 icon={<Cloud className="h-7 w-7" />}
 >
 <div className="space-y-6">
 {/* Friendly message when redirected for no AWS accounts */}
 {wasRedirectedForNoAccounts && (
 <div className="bg-gradient-to-r from-blue-500/10 to-primary/10 border border-blue-500/20 rounded-xl p-6">
 <div className="flex items-start gap-4">
 <div className="p-3 rounded-lg bg-blue-500/20">
 <Cloud className="h-6 w-6 text-blue-500" />
 </div>
 <div className="flex-1">
 <h3 className="text-lg font-semibold text-blue-600 mb-2">
 Bem-vindo! Configure sua primeira conta AWS
 </h3>
 <p className="text-sm text-muted-foreground mb-4">
 {redirectState?.message || 'Para começar a usar o sistema, você precisa conectar pelo menos uma conta AWS.'}
 </p>
 <div className="flex items-center gap-2 text-xs text-muted-foreground">
 <CheckCircle2 className="h-4 w-4 text-green-500" />
 <span>Licença válida</span>
 <span className="mx-2">•</span>
 <span>Próximo passo: Conectar conta AWS</span>
 </div>
 </div>
 </div>
 </div>
 )}

 {/* Status Badge */}
 {hasConnectedAccounts && (
 <div className="flex justify-end">
 {allAccountsValid ? (
 <Badge className="bg-green-500 text-white">
 <CheckCircle2 className="h-4 w-4 mr-1" />
 Todas as contas conectadas
 </Badge>
 ) : (
 <Badge variant="destructive">
 <AlertCircle className="h-4 w-4 mr-1" />
 Verificar permissões
 </Badge>
 )}
 </div>
 )}

 <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
 <TabsList className="grid w-full grid-cols-4 glass-card-float">
 <TabsTrigger value="credentials">
 <Cloud className="h-4 w-4 mr-2" />
 Credenciais
 </TabsTrigger>
 <TabsTrigger value="permissions">
 <Shield className="h-4 w-4 mr-2" />
 Permissões
 </TabsTrigger>
 <TabsTrigger value="tools">
 <Settings className="h-4 w-4 mr-2" />
 Ferramentas AWS
 </TabsTrigger>
 <TabsTrigger value="services">
 <Zap className="h-4 w-4 mr-2" />
 Serviços
 </TabsTrigger>
 </TabsList>

 <TabsContent value="credentials" className="space-y-6">
 {/* Show permission errors for accounts with missing permissions */}
 {Array.isArray(awsAccounts) && awsAccounts.map((account) => {
 const status = account?.aws_validation_status?.[0];
 const missingPerms = (status?.missing_permissions as string[]) || [];
 
 if (missingPerms.length > 0) {
 return (
 <PermissionErrorAlert
 key={account.id}
 missingPermissions={missingPerms}
 errorMessage={status?.validation_error}
 accountName={account.account_name}
 />
 );
 }
 return null;
 })}
 
 <Card className="p-6">
 <ErrorBoundary level="component" context="AwsCredentialsManager">
 <AwsCredentialsManager />
 </ErrorBoundary>
 </Card>
 </TabsContent>

 <TabsContent value="permissions">
 <ErrorBoundary level="component" context="AWSPermissionsGuide">
 <AWSPermissionsGuide />
 </ErrorBoundary>
 </TabsContent>

 <TabsContent value="tools">
 <ErrorBoundary level="component" context="AWSToolsConfiguration">
 <AWSToolsConfiguration />
 </ErrorBoundary>
 </TabsContent>

 <TabsContent value="services">
 <ErrorBoundary level="component" context="AWSServicesMonitoring">
 <AWSServicesMonitoring />
 </ErrorBoundary>
 </TabsContent>
 </Tabs>
 </div>
 </Layout>
 );
}