/**
 * Cloud Credentials Page
 * 
 * Unified page for managing AWS and Azure credentials.
 * Uses standard Layout component for consistent visual identity.
 */

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Cloud, Server, KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Layout } from '@/components/Layout';
import { AzureCredentialsManager } from '@/components/azure/AzureCredentialsManager';
import AwsCredentialsManager from '@/components/dashboard/AwsCredentialsManager';

export default function CloudCredentials() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string>('aws');

  return (
    <Layout
      title={t('cloudCredentials.title', 'Cloud Credentials')}
      description={t('cloudCredentials.description', 'Manage your cloud provider connections')}
      icon={<KeyRound className="h-4 w-4 text-white" />}
    >
      <div className="space-y-6">
        {/* Tabs for AWS and Azure */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="glass-card-float grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="aws" className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              AWS
            </TabsTrigger>
            <TabsTrigger value="azure" className="flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              Azure
            </TabsTrigger>
          </TabsList>

          {/* AWS Tab */}
          <TabsContent value="aws" className="mt-6">
            <AwsCredentialsManager />
          </TabsContent>

          {/* Azure Tab */}
          <TabsContent value="azure" className="mt-6">
            <AzureCredentialsManager />
          </TabsContent>
        </Tabs>

        {/* Info Card */}
        <Card >
          <CardHeader>
            <CardTitle className="text-base">
              {t('cloudCredentials.multiCloudTitle', 'Multi-Cloud Support')}
            </CardTitle>
            <CardDescription>
              {t('cloudCredentials.multiCloudDescription', 'EVO Platform supports multiple cloud providers for unified management.')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Server className="h-5 w-5 text-orange-600 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Amazon Web Services (AWS)</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('cloudCredentials.awsDescription', 'Connect via IAM Role or Access Keys for comprehensive AWS management.')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Cloud className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Microsoft Azure</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('cloudCredentials.azureDescription', 'Connect via Service Principal for Azure subscription management.')}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
