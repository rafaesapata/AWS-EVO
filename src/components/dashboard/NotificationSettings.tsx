import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { emailClient } from "@/integrations/aws/email-client";
import { toast } from "sonner";
import { Bell, Webhook, MessageSquare, Mail, TestTube } from "lucide-react";

export const NotificationSettings = () => {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState({
    email_enabled: true,
    webhook_enabled: false,
    webhook_url: '',
    slack_enabled: false,
    slack_webhook_url: '',
    datadog_enabled: false,
    datadog_api_key: '',
    datadog_site: 'datadoghq.com',
    graylog_enabled: false,
    graylog_url: '',
    graylog_port: 12201,
    zabbix_enabled: false,
    zabbix_url: '',
    zabbix_auth_token: '',
    notify_on_critical: true,
    notify_on_high: true,
    notify_on_medium: false,
    notify_on_scan_complete: true
  });

  const { data: existingSettings, isLoading } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      try {
        const data = await apiClient.get('/user/notification-settings');
        if (data) setSettings(data);
        return data;
      } catch (error) {
        // If no settings exist, use defaults
        return null;
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      
      await apiClient.lambda('save-notification-settings', settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      toast.success('Configurações salvas com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao salvar configurações:', error);
      toast.error('Erro ao salvar configurações');
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user?.email) throw new Error('Email do usuário não encontrado');

      // Test email notification using AWS SES
      return await emailClient.sendNotification(
        user.email,
        'Teste de Notificação - EVO-UDS',
        'Este é um email de teste para verificar se as notificações por email estão funcionando corretamente. Se você recebeu este email, sua configuração está funcionando!',
        'info'
      );
    },
    onSuccess: () => {
      toast.success('Email de teste enviado com sucesso! Verifique sua caixa de entrada.');
    },
    onError: (error) => {
      console.error('Erro ao enviar email de teste:', error);
      toast.error('Erro ao enviar email de teste. Verifique suas configurações.');
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notificações e Alertas
        </CardTitle>
        <CardDescription>Configure como deseja receber alertas sobre findings críticos</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email */}
        <div className="space-y-3 p-4 border border-border rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <Label className="text-base font-semibold">Email</Label>
            </div>
            <Switch
              checked={settings.email_enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, email_enabled: checked })}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Receba notificações por email sobre findings críticos
          </p>
        </div>

        {/* Webhook */}
        <div className="space-y-3 p-4 border border-border rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-primary" />
              <Label className="text-base font-semibold">Webhook Customizado</Label>
            </div>
            <Switch
              checked={settings.webhook_enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, webhook_enabled: checked })}
            />
          </div>
          {settings.webhook_enabled && (
            <Input
              placeholder="https://seu-endpoint.com/webhook"
              value={settings.webhook_url}
              onChange={(e) => setSettings({ ...settings, webhook_url: e.target.value })}
            />
          )}
          <p className="text-sm text-muted-foreground">
            Envie notificações para seu endpoint HTTP personalizado
          </p>
        </div>

        {/* Slack */}
        <div className="space-y-3 p-4 border border-border rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <Label className="text-base font-semibold">Slack</Label>
            </div>
            <Switch
              checked={settings.slack_enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, slack_enabled: checked })}
            />
          </div>
          {settings.slack_enabled && (
            <Input
              placeholder="https://hooks.slack.com/services/..."
              value={settings.slack_webhook_url}
              onChange={(e) => setSettings({ ...settings, slack_webhook_url: e.target.value })}
            />
          )}
          <p className="text-sm text-muted-foreground">
            Integre com Slack usando Incoming Webhooks
          </p>
        </div>

        {/* Datadog */}
        <div className="space-y-3 p-4 border border-border rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-primary" />
              <Label className="text-base font-semibold">Datadog</Label>
            </div>
            <Switch
              checked={settings.datadog_enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, datadog_enabled: checked })}
            />
          </div>
          {settings.datadog_enabled && (
            <div className="space-y-2">
              <Input
                placeholder="API Key do Datadog"
                type="password"
                value={settings.datadog_api_key}
                onChange={(e) => setSettings({ ...settings, datadog_api_key: e.target.value })}
              />
              <Input
                placeholder="Site (ex: datadoghq.com, datadoghq.eu)"
                value={settings.datadog_site}
                onChange={(e) => setSettings({ ...settings, datadog_site: e.target.value })}
              />
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Envie eventos e métricas para o Datadog
          </p>
        </div>

        {/* Graylog */}
        <div className="space-y-3 p-4 border border-border rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-primary" />
              <Label className="text-base font-semibold">Graylog</Label>
            </div>
            <Switch
              checked={settings.graylog_enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, graylog_enabled: checked })}
            />
          </div>
          {settings.graylog_enabled && (
            <div className="space-y-2">
              <Input
                placeholder="URL do Graylog (ex: http://graylog.example.com)"
                value={settings.graylog_url}
                onChange={(e) => setSettings({ ...settings, graylog_url: e.target.value })}
              />
              <Input
                placeholder="Porta GELF HTTP (padrão: 12201)"
                type="number"
                value={settings.graylog_port}
                onChange={(e) => setSettings({ ...settings, graylog_port: parseInt(e.target.value) || 12201 })}
              />
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Envie logs estruturados para Graylog via GELF
          </p>
        </div>

        {/* Zabbix */}
        <div className="space-y-3 p-4 border border-border rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-primary" />
              <Label className="text-base font-semibold">Zabbix</Label>
            </div>
            <Switch
              checked={settings.zabbix_enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, zabbix_enabled: checked })}
            />
          </div>
          {settings.zabbix_enabled && (
            <div className="space-y-2">
              <Input
                placeholder="URL da API Zabbix (ex: http://zabbix.example.com/api_jsonrpc.php)"
                value={settings.zabbix_url}
                onChange={(e) => setSettings({ ...settings, zabbix_url: e.target.value })}
              />
              <Input
                placeholder="Token de autenticação"
                type="password"
                value={settings.zabbix_auth_token}
                onChange={(e) => setSettings({ ...settings, zabbix_auth_token: e.target.value })}
              />
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Envie eventos de monitoramento para Zabbix
          </p>
        </div>

        {/* Severity Filters */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Notificar para:</Label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch
                checked={settings.notify_on_critical}
                onCheckedChange={(checked) => setSettings({ ...settings, notify_on_critical: checked })}
              />
              <span className="text-sm">Findings Críticos</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch
                checked={settings.notify_on_high}
                onCheckedChange={(checked) => setSettings({ ...settings, notify_on_high: checked })}
              />
              <span className="text-sm">Findings de Alta Severidade</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch
                checked={settings.notify_on_medium}
                onCheckedChange={(checked) => setSettings({ ...settings, notify_on_medium: checked })}
              />
              <span className="text-sm">Findings de Média Severidade</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch
                checked={settings.notify_on_scan_complete}
                onCheckedChange={(checked) => setSettings({ ...settings, notify_on_scan_complete: checked })}
              />
              <span className="text-sm">Conclusão de Scans</span>
            </label>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => saveMutation.mutate()} className="flex-1">
            Salvar Configurações
          </Button>
          <Button 
            variant="outline" 
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
          >
            <TestTube className="h-4 w-4 mr-2" />
            {testMutation.isPending ? 'Enviando...' : 'Testar Email'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};