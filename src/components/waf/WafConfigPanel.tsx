import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useOrganization } from "@/hooks/useOrganization";
import { 
  Settings, 
  Bell, 
  Shield, 
  Clock,
  Save,
  AlertTriangle
} from "lucide-react";

interface WafConfig {
  snsEnabled: boolean;
  snsTopicArn?: string;
  slackEnabled: boolean;
  slackWebhookUrl?: string;
  inAppEnabled: boolean;
  campaignThreshold: number;
  campaignWindowMins: number;
  autoBlockEnabled: boolean;
  autoBlockThreshold: number;
  blockDurationHours: number;
}

interface WafConfigPanelProps {
  accountId?: string;
}

export function WafConfigPanel({ accountId }: WafConfigPanelProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: organizationId } = useOrganization();

  // Fetch current config
  const { data: configData, isLoading } = useQuery({
    queryKey: ['waf-config', organizationId, accountId],
    enabled: !!organizationId && !!accountId,
    queryFn: async () => {
      const response = await apiClient.invoke<{ config: WafConfig }>('waf-dashboard-api', {
        body: { action: 'config', accountId }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data?.config;
    },
  });

  const [config, setConfig] = useState<WafConfig | null>(null);

  // Initialize local state when data loads
  if (configData && !config) {
    setConfig(configData);
  }

  // Update config mutation
  const updateConfigMutation = useMutation({
    mutationFn: async (newConfig: WafConfig) => {
      const response = await apiClient.invoke('waf-dashboard-api', {
        body: { action: 'update-config', accountId, ...newConfig }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
    onSuccess: () => {
      toast({ title: t('waf.configSaved'), description: t('waf.configSavedDesc') });
      queryClient.invalidateQueries({ queryKey: ['waf-config', organizationId, accountId] });
    },
    onError: (error) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (config) {
      updateConfigMutation.mutate(config);
    }
  };

  const updateConfig = (key: keyof WafConfig, value: any) => {
    if (config) {
      setConfig({ ...config, [key]: value });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  if (!config) {
    return (
      <Card className="">
        <CardContent className="flex flex-col items-center justify-center h-[200px]">
          <Settings className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">{t('waf.noConfig')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alert Configuration */}
      <Card className="">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            {t('waf.alertConfig')}
          </CardTitle>
          <CardDescription>{t('waf.alertConfigDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* In-App Alerts */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('waf.inAppAlerts')}</Label>
              <p className="text-sm text-muted-foreground">{t('waf.inAppAlertsDesc')}</p>
            </div>
            <Switch
              checked={config.inAppEnabled}
              onCheckedChange={(checked) => updateConfig('inAppEnabled', checked)}
            />
          </div>

          <Separator />

          {/* SNS Alerts */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('waf.snsAlerts')}</Label>
                <p className="text-sm text-muted-foreground">{t('waf.snsAlertsDesc')}</p>
              </div>
              <Switch
                checked={config.snsEnabled}
                onCheckedChange={(checked) => updateConfig('snsEnabled', checked)}
              />
            </div>
            {config.snsEnabled && (
              <div className="space-y-2 pl-4 border-l-2 border-primary/20">
                <Label htmlFor="snsTopicArn">{t('waf.snsTopicArn')}</Label>
                <Input
                  id="snsTopicArn"
                  placeholder="arn:aws:sns:us-east-1:123456789012:waf-alerts"
                  value={config.snsTopicArn || ''}
                  onChange={(e) => updateConfig('snsTopicArn', e.target.value)}
                />
              </div>
            )}
          </div>

          <Separator />

          {/* Slack Alerts */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('waf.slackAlerts')}</Label>
                <p className="text-sm text-muted-foreground">{t('waf.slackAlertsDesc')}</p>
              </div>
              <Switch
                checked={config.slackEnabled}
                onCheckedChange={(checked) => updateConfig('slackEnabled', checked)}
              />
            </div>
            {config.slackEnabled && (
              <div className="space-y-2 pl-4 border-l-2 border-primary/20">
                <Label htmlFor="slackWebhook">{t('waf.slackWebhook')}</Label>
                <Input
                  id="slackWebhook"
                  type="password"
                  placeholder="https://hooks.slack.com/services/..."
                  value={config.slackWebhookUrl || ''}
                  onChange={(e) => updateConfig('slackWebhookUrl', e.target.value)}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Campaign Detection */}
      <Card className="">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            {t('waf.campaignDetection')}
          </CardTitle>
          <CardDescription>{t('waf.campaignDetectionDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="campaignThreshold">{t('waf.campaignThreshold')}</Label>
              <Input
                id="campaignThreshold"
                type="number"
                min={1}
                max={1000}
                value={config.campaignThreshold}
                onChange={(e) => updateConfig('campaignThreshold', parseInt(e.target.value) || 10)}
              />
              <p className="text-xs text-muted-foreground">{t('waf.campaignThresholdDesc')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaignWindow">{t('waf.campaignWindow')}</Label>
              <Select
                value={String(config.campaignWindowMins)}
                onValueChange={(value) => updateConfig('campaignWindowMins', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 {t('common.minute')}</SelectItem>
                  <SelectItem value="5">5 {t('common.minutes')}</SelectItem>
                  <SelectItem value="10">10 {t('common.minutes')}</SelectItem>
                  <SelectItem value="15">15 {t('common.minutes')}</SelectItem>
                  <SelectItem value="30">30 {t('common.minutes')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('waf.campaignWindowDesc')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auto-Block Configuration */}
      <Card className="">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {t('waf.autoBlock')}
          </CardTitle>
          <CardDescription>{t('waf.autoBlockDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('waf.enableAutoBlock')}</Label>
              <p className="text-sm text-muted-foreground">{t('waf.enableAutoBlockDesc')}</p>
            </div>
            <Switch
              checked={config.autoBlockEnabled}
              onCheckedChange={(checked) => updateConfig('autoBlockEnabled', checked)}
            />
          </div>

          {config.autoBlockEnabled && (
            <>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="autoBlockThreshold">{t('waf.autoBlockThreshold')}</Label>
                  <Input
                    id="autoBlockThreshold"
                    type="number"
                    min={1}
                    max={10000}
                    value={config.autoBlockThreshold}
                    onChange={(e) => updateConfig('autoBlockThreshold', parseInt(e.target.value) || 50)}
                  />
                  <p className="text-xs text-muted-foreground">{t('waf.autoBlockThresholdDesc')}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="blockDuration">{t('waf.blockDuration')}</Label>
                  <Select
                    value={String(config.blockDurationHours)}
                    onValueChange={(value) => updateConfig('blockDurationHours', parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 {t('common.hour')}</SelectItem>
                      <SelectItem value="6">6 {t('common.hours')}</SelectItem>
                      <SelectItem value="12">12 {t('common.hours')}</SelectItem>
                      <SelectItem value="24">24 {t('common.hours')}</SelectItem>
                      <SelectItem value="48">48 {t('common.hours')}</SelectItem>
                      <SelectItem value="168">7 {t('common.days')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t('waf.blockDurationDesc')}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          disabled={updateConfigMutation.isPending}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {updateConfigMutation.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}
