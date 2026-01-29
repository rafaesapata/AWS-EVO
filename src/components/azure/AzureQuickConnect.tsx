/**
 * Azure Quick Connect
 * 
 * Provides step-by-step instructions and ARM template deployment for Azure setup.
 */

import React, { useState } from 'react';
import { ExternalLink, Copy, Check, Cloud, Shield, DollarSign, Activity, Download, Terminal, Apple, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface AzureQuickConnectProps {
  onManualSetup?: () => void;
}

export function AzureQuickConnect({ onManualSetup }: AzureQuickConnectProps) {
  const { t } = useTranslation();
  const [copiedStep, setCopiedStep] = useState<string | null>(null);

  const copyToClipboard = async (text: string, stepId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStep(stepId);
      toast.success(t('common.copied', 'Copied to clipboard'));
      setTimeout(() => setCopiedStep(null), 2000);
    } catch (err) {
      toast.error(t('common.copyFailed', 'Failed to copy'));
    }
  };

  const CopyButton = ({ text, stepId }: { text: string; stepId: string }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => copyToClipboard(text, stepId)}
      className="h-8 px-2"
    >
      {copiedStep === stepId ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  );

  // Required permissions for the Service Principal
  const requiredRoles = [
    { name: 'Reader', scope: 'Subscription', description: 'Read access to all resources' },
    { name: 'Security Reader', scope: 'Subscription', description: 'View security recommendations' },
    { name: 'Cost Management Reader', scope: 'Subscription', description: 'View cost data' },
    { name: 'Log Analytics Reader', scope: 'Subscription', description: 'View activity logs' },
  ];

  // Azure CLI commands for manual setup
  const cliCommands = {
    createApp: `az ad app create --display-name "EVO Platform" --sign-in-audience AzureADMyOrg`,
    createSp: `az ad sp create --id <APP_ID>`,
    createSecret: `az ad app credential reset --id <APP_ID> --append`,
    assignReader: `az role assignment create --assignee <SP_ID> --role "Reader" --scope /subscriptions/<SUBSCRIPTION_ID>`,
    assignSecurity: `az role assignment create --assignee <SP_ID> --role "Security Reader" --scope /subscriptions/<SUBSCRIPTION_ID>`,
    assignCost: `az role assignment create --assignee <SP_ID> --role "Cost Management Reader" --scope /subscriptions/<SUBSCRIPTION_ID>`,
    assignLogs: `az role assignment create --assignee <SP_ID> --role "Log Analytics Reader" --scope /subscriptions/<SUBSCRIPTION_ID>`,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
          <Cloud className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{t('azure.quickConnect', 'Azure Quick Connect')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('azure.quickConnectDescription', 'Connect your Azure subscription to EVO Platform')}
          </p>
        </div>
      </div>

      <Tabs defaultValue="portal" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="portal">{t('azure.portalSetup', 'Portal Setup')}</TabsTrigger>
          <TabsTrigger value="cli">{t('azure.cliSetup', 'CLI Setup')}</TabsTrigger>
          <TabsTrigger value="manual">{t('azure.manualSetup', 'Manual Entry')}</TabsTrigger>
        </TabsList>

        {/* Portal Setup Tab */}
        <TabsContent value="portal" className="space-y-4">
          <Alert>
            <AlertDescription>
              {t('azure.portalSetupInfo', 'Follow these steps in the Azure Portal to create a Service Principal with the required permissions.')}
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            {/* Step 1: Create App Registration */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant="outline">1</Badge>
                  {t('azure.step1Title', 'Create App Registration')}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>{t('azure.step1a', 'Go to Azure Portal > Azure Active Directory > App registrations')}</li>
                  <li>{t('azure.step1b', 'Click "New registration"')}</li>
                  <li>{t('azure.step1c', 'Name: "EVO Platform"')}</li>
                  <li>{t('azure.step1d', 'Supported account types: "Accounts in this organizational directory only"')}</li>
                  <li>{t('azure.step1e', 'Click "Register"')}</li>
                </ol>
                <Button variant="outline" size="sm" asChild>
                  <a 
                    href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    {t('azure.openAppRegistrations', 'Open App Registrations')}
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>

            {/* Step 2: Create Client Secret */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant="outline">2</Badge>
                  {t('azure.step2Title', 'Create Client Secret')}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>{t('azure.step2a', 'In your app registration, go to "Certificates & secrets"')}</li>
                  <li>{t('azure.step2b', 'Click "New client secret"')}</li>
                  <li>{t('azure.step2c', 'Description: "EVO Platform Access"')}</li>
                  <li>{t('azure.step2d', 'Expiration: Choose appropriate duration')}</li>
                  <li>{t('azure.step2e', 'Copy the secret value immediately (it won\'t be shown again)')}</li>
                </ol>
              </CardContent>
            </Card>

            {/* Step 3: Assign Roles */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant="outline">3</Badge>
                  {t('azure.step3Title', 'Assign Required Roles')}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-3">
                <p className="text-muted-foreground">
                  {t('azure.step3Info', 'Go to your Subscription > Access control (IAM) > Add role assignment')}
                </p>
                <div className="grid gap-2">
                  {requiredRoles.map((role) => (
                    <div key={role.name} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-blue-600" />
                        <span className="font-medium">{role.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{role.description}</span>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a 
                    href="https://portal.azure.com/#view/Microsoft_Azure_Billing/SubscriptionsBlade" 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    {t('azure.openSubscriptions', 'Open Subscriptions')}
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>

            {/* Step 4: Enter Credentials */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant="outline">4</Badge>
                  {t('azure.step4Title', 'Enter Credentials in EVO')}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p className="text-muted-foreground">
                  {t('azure.step4Info', 'Collect the following values and enter them in the form:')}
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li><strong>Tenant ID:</strong> {t('azure.tenantIdLocation', 'Azure AD > Overview > Tenant ID')}</li>
                  <li><strong>Client ID:</strong> {t('azure.clientIdLocation', 'App Registration > Overview > Application (client) ID')}</li>
                  <li><strong>Client Secret:</strong> {t('azure.clientSecretLocation', 'The secret value you copied in step 2')}</li>
                  <li><strong>Subscription ID:</strong> {t('azure.subscriptionIdLocation', 'Subscriptions > Your Subscription > Subscription ID')}</li>
                </ul>
                <Button onClick={onManualSetup} className="mt-2">
                  {t('azure.enterCredentials', 'Enter Credentials')}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* CLI Setup Tab */}
        <TabsContent value="cli" className="space-y-4">
          <Alert>
            <AlertDescription>
              {t('azure.cliSetupInfo', 'Use Azure CLI to create a Service Principal. Make sure you have Azure CLI installed and are logged in.')}
            </AlertDescription>
          </Alert>

          {/* Automated Script Section */}
          <Card className="glass border-primary/20 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Terminal className="h-5 w-5 text-blue-600" />
                {t('azure.automatedScript', 'Script Automatizado (Recomendado)')}
              </CardTitle>
              <CardDescription>
                {t('azure.automatedScriptDesc', 'Execute um único script que configura tudo automaticamente')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Download buttons for each OS */}
              <div>
                <p className="text-sm font-medium mb-2">{t('azure.selectOS', 'Selecione seu sistema operacional:')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Button 
                    variant="outline"
                    className="glass hover-glow flex items-center justify-center gap-2"
                    onClick={() => {
                      window.open('/scripts/azure-quick-connect.ps1', '_blank');
                      toast.success(t('azure.scriptDownloaded', 'Script baixado!'));
                    }}
                  >
                    <Monitor className="h-4 w-4" />
                    Windows
                  </Button>
                  <Button 
                    variant="outline"
                    className="glass hover-glow flex items-center justify-center gap-2"
                    onClick={() => {
                      window.open('/scripts/azure-quick-connect.sh', '_blank');
                      toast.success(t('azure.scriptDownloaded', 'Script baixado!'));
                    }}
                  >
                    <Apple className="h-4 w-4" />
                    macOS
                  </Button>
                  <Button 
                    variant="outline"
                    className="glass hover-glow flex items-center justify-center gap-2"
                    onClick={() => {
                      window.open('/scripts/azure-quick-connect.sh', '_blank');
                      toast.success(t('azure.scriptDownloaded', 'Script baixado!'));
                    }}
                  >
                    <Terminal className="h-4 w-4" />
                    Linux
                  </Button>
                </div>
              </div>
              
              {/* Windows instructions */}
              <div className="text-sm space-y-2">
                <p className="font-medium flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Windows (PowerShell):
                </p>
                <div className="bg-muted p-3 rounded-md font-mono text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">PS&gt;</span>
                    <code>Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser</code>
                    <CopyButton text="Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser" stepId="ps-policy" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">PS&gt;</span>
                    <code>.\azure-quick-connect.ps1</code>
                    <CopyButton text=".\azure-quick-connect.ps1" stepId="ps-run" />
                  </div>
                </div>
              </div>

              {/* macOS/Linux instructions */}
              <div className="text-sm space-y-2">
                <p className="font-medium flex items-center gap-2">
                  <Apple className="h-4 w-4" />
                  macOS / Linux (Bash):
                </p>
                <div className="bg-muted p-3 rounded-md font-mono text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">$</span>
                    <code>chmod +x azure-quick-connect.sh</code>
                    <CopyButton text="chmod +x azure-quick-connect.sh" stepId="chmod" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">$</span>
                    <code>./azure-quick-connect.sh</code>
                    <CopyButton text="./azure-quick-connect.sh" stepId="run" />
                  </div>
                </div>
              </div>

              <p className="text-muted-foreground text-xs">
                {t('azure.scriptFeatures', 'O script irá: fazer login no Azure, listar suas subscriptions, criar o App Registration, Service Principal, Client Secret e atribuir todas as permissões necessárias.')}
              </p>
            </CardContent>
          </Card>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                {t('azure.orManualSteps', 'ou siga os passos manuais')}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t('azure.cliStep1', '1. Create App Registration')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 bg-muted p-2 rounded-md font-mono text-xs">
                  <code className="flex-1 overflow-x-auto">{cliCommands.createApp}</code>
                  <CopyButton text={cliCommands.createApp} stepId="createApp" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t('azure.cliStep2', '2. Create Service Principal')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 bg-muted p-2 rounded-md font-mono text-xs">
                  <code className="flex-1 overflow-x-auto">{cliCommands.createSp}</code>
                  <CopyButton text={cliCommands.createSp} stepId="createSp" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('azure.replaceAppId', 'Replace <APP_ID> with the appId from step 1')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t('azure.cliStep3', '3. Create Client Secret')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 bg-muted p-2 rounded-md font-mono text-xs">
                  <code className="flex-1 overflow-x-auto">{cliCommands.createSecret}</code>
                  <CopyButton text={cliCommands.createSecret} stepId="createSecret" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t('azure.cliStep4', '4. Assign Roles')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries({
                  assignReader: 'Reader',
                  assignSecurity: 'Security Reader',
                  assignCost: 'Cost Management Reader',
                  assignLogs: 'Log Analytics Reader',
                }).map(([key, role]) => (
                  <div key={key}>
                    <p className="text-xs text-muted-foreground mb-1">{role}:</p>
                    <div className="flex items-center gap-2 bg-muted p-2 rounded-md font-mono text-xs">
                      <code className="flex-1 overflow-x-auto">{cliCommands[key as keyof typeof cliCommands]}</code>
                      <CopyButton text={cliCommands[key as keyof typeof cliCommands]} stepId={key} />
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground mt-2">
                  {t('azure.replaceIds', 'Replace <SP_ID> and <SUBSCRIPTION_ID> with your values')}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Manual Entry Tab */}
        <TabsContent value="manual" className="space-y-4">
          <Alert>
            <AlertDescription>
              {t('azure.manualEntryInfo', 'If you already have a Service Principal configured, enter the credentials directly.')}
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>{t('azure.enterCredentialsTitle', 'Enter Azure Credentials')}</CardTitle>
              <CardDescription>
                {t('azure.enterCredentialsDescription', 'Provide your Azure Service Principal credentials to connect your subscription.')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={onManualSetup} className="w-full">
                {t('azure.openCredentialsForm', 'Open Credentials Form')}
              </Button>
            </CardContent>
          </Card>

          {/* Features enabled */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('azure.featuresEnabled', 'Features Enabled')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <Shield className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="font-medium text-sm">{t('azure.securityScanning', 'Security Scanning')}</p>
                    <p className="text-xs text-muted-foreground">{t('azure.securityScanningDesc', 'VMs, Storage, SQL, Key Vault, NSGs')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <DollarSign className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-sm">{t('azure.costAnalysis', 'Cost Analysis')}</p>
                    <p className="text-xs text-muted-foreground">{t('azure.costAnalysisDesc', 'Daily costs, trends, forecasts')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <Cloud className="h-5 w-5 text-purple-600" />
                  <div>
                    <p className="font-medium text-sm">{t('azure.resourceInventory', 'Resource Inventory')}</p>
                    <p className="text-xs text-muted-foreground">{t('azure.resourceInventoryDesc', 'All Azure resources')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <Activity className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="font-medium text-sm">{t('azure.activityMonitoring', 'Activity Monitoring')}</p>
                    <p className="text-xs text-muted-foreground">{t('azure.activityMonitoringDesc', 'Audit logs, alerts')}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
