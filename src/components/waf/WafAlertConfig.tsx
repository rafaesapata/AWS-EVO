import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { Bell, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AlertConfig {
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

export function WafAlertConfig() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: configData, isLoading } = useQuery({
    queryKey: ['waf-alert-config'],
    queryFn: async () => {
      const response = await apiClient.invoke<{ config: AlertConfig }>('waf-dashboard-api', {
        body: { action: 'config' }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data.config;
    },
  });

  const [config, setConfig] = useState<AlertConfig>(configData || {
    snsEnabled: false,
    slackEnabled: false,
    inAppEnabled: true,
    campaignThreshold: 10,
    campaignWindowMins: 5,
    autoBlockEnabled: false,
    autoBlockThreshold: 50,
    blockDurationHours: 24,
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (newConfig: AlertConfig) => {
      const response = await apiClient.invoke('waf-dashboard-api', {
        body: { action: 'update-config', ...newConfig }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
    onSuccess: () => {
      toast({ 
        title: t('common.success'), 
        description: t('waf.configUpdated', 'Configuração atualizada com sucesso') 
      });
      queryClient.invalidateQueries({ queryKey: ['waf-alert-config'] });
    },
    onError: (error) => {
      toast({ 
        title: t('common.error'), 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const handleSave = () => {
    updateConfigMutation.mutate(config);
  };

  if (isLoading) {
    return (
      <Card className="glass border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {t('waf.alertConfiguration', 'Configuração de Alertas')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          {t('waf.alertConfiguration', 'Configuração de Alertas')}
        </CardTitle>
        <CardDescription>
          {t('waf.alertConfigDescription', 'Configure quando e como receber alertas de ameaças')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* In-App Alerts */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>{t('waf.inAppAlerts', 'Alertas no Sistema')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('waf.inAppAlertsDesc', 'Mostrar notificações dentro da plataforma')}
            </p>
          </div>
          <Switch
            checked={config.inAppEnabled}
            onCheckedChange={(checked) => setConfig({ ...config, inAppEnabled: checked })}
          />
        </div>

        {/* SNS Alerts */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('waf.snsAlerts', 'Alertas via SNS')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('waf.snsAlertsDesc', 'Enviar alertas para tópico SNS')}
              </p>
            </div>
            <Switch
              checked={config.snsEnabled}
              onCheckedChange={(checked) => setConfig({ ...config, snsEnabled: checked })}
            />
          </div>
          {config.snsEnabled && (
            <div className="space-y-2">
              <Label>{t('waf.snsTopicArn', 'ARN do Tópico SNS')}</Label>
              <Input
                placeholder="arn:aws:sns:us-east-1:123456789:my-topic"
                value={config.snsTopicArn || ''}
                onChange={(e) => setConfig({ ...config, snsTopicArn: e.target.value })}
              />
            </div>
          )}
        </div>

        {/* Slack Alerts */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('waf.slackAlerts', 'Alertas via Slack')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('waf.slackAlertsDesc', 'Enviar alertas para canal Slack')}
              </p>
            </div>
            <Switch
              checked={config.slackEnabled}
              onCheckedChange={(checked) => setConfig({ ...config, slackEnabled: checked })}
            />
          </div>
          {config.slackEnabled && (
            <div className="space-y-2">
              <Label>{t('waf.slackWebhook', 'Webhook URL do Slack')}</Label>
              <Input
                type="password"
                placeholder="https://hooks.slack.com/services/..."
                value={config.slackWebhookUrl || ''}
                onChange={(e) => setConfig({ ...config, slackWebhookUrl: e.target.value })}
              />
            </div>
          )}
        </div>

        {/* Campaign Detection */}
        <div className="space-y-3 pt-4 border-t">
          <h4 className="font-semibold">{t('waf.campaignDetection', 'Detecção de Campanhas')}</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('waf.campaignThreshold', 'Threshold de Eventos')}</Label>
              <Input
                type="number"
                value={config.campaignThreshold}
                onChange={(e) => setConfig({ ...config, campaignThreshold: parseInt(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                {t('waf.campaignThresholdDesc', 'Número mínimo de eventos para detectar campanha')}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t('waf.campaignWindow', 'Janela de Tempo (min)')}</Label>
              <Input
                type="number"
                value={config.campaignWindowMins}
                onChange={(e) => setConfig({ ...config, campaignWindowMins: parseInt(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                {t('waf.campaignWindowDesc', 'Período para agrupar eventos')}
              </p>
            </div>
          </div>
        </div>

        {/* Auto-Block */}
        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('waf.autoBlock', 'Bloqueio Automático')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('waf.autoBlockDesc', 'Bloquear IPs automaticamente após threshold')}
              </p>
            </div>
            <Switch
              checked={config.autoBlockEnabled}
              onCheckedChange={(checked) => setConfig({ ...config, autoBlockEnabled: checked })}
            />
          </div>
          {config.autoBlockEnabled && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('waf.autoBlockThreshold', 'Threshold de Bloqueios')}</Label>
                <Input
                  type="number"
                  value={config.autoBlockThreshold}
                  onChange={(e) => setConfig({ ...config, autoBlockThreshold: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('waf.blockDuration', 'Duração do Bloqueio (h)')}</Label>
                <Input
                  type="number"
                  value={config.blockDurationHours}
                  onChange={(e) => setConfig({ ...config, blockDurationHours: parseInt(e.target.value) })}
                />
              </div>
            </div>
          )}
        </div>

        <Button 
          onClick={handleSave} 
          disabled={updateConfigMutation.isPending}
          className="w-full"
        >
          <Save className="h-4 w-4 mr-2" />
          {t('common.save', 'Salvar Configuração')}
        </Button>
      </CardContent>
    </Card>
  );
}
