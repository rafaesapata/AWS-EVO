import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
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
import { useAwsAccount } from "@/contexts/AwsAccountContext";

export default function AWSSettings() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("credentials");
  
  // Listen for tab switch events from AwsCredentialsManager
  useEffect(() => {
    const handleSwitchTab = () => {
      setActiveTab("permissions");
    };
    
    window.addEventListener('switchToPermissionsTab', handleSwitchTab);
    return () => window.removeEventListener('switchToPermissionsTab', handleSwitchTab);
  }, []);
  
  // Use centralized AWS account context instead of direct API call
  const { accounts: awsAccounts } = useAwsAccount();

  const hasConnectedAccounts = awsAccounts && awsAccounts.length > 0;
  const allAccountsValid = awsAccounts?.every(acc => 
    acc.aws_validation_status?.[0]?.is_connected && 
    acc.aws_validation_status?.[0]?.has_all_permissions
  );

  return (
    <Layout 
      title="Configurações AWS" 
      description="Configure e gerencie suas integrações AWS com ferramentas nativas"
      icon={<Cloud className="h-7 w-7 text-white" />}
    >
      <div className="space-y-6">
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
        <TabsList className="grid w-full grid-cols-4 glass">
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
          {awsAccounts?.map((account) => {
            const status = account.aws_validation_status?.[0];
            const missingPerms = status?.missing_permissions as string[] || [];
            
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
          
          <Card className="p-6 glass border-primary/20">
            <AwsCredentialsManager />
          </Card>
        </TabsContent>

        <TabsContent value="permissions">
          <AWSPermissionsGuide />
        </TabsContent>

        <TabsContent value="tools">
          <AWSToolsConfiguration />
        </TabsContent>

        <TabsContent value="services">
          <AWSServicesMonitoring />
        </TabsContent>
      </Tabs>
      </div>
    </Layout>
  );
}