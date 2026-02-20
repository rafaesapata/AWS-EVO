import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layout } from "@/components/Layout";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { emailClient } from "@/integrations/aws/email-client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Bell, Webhook, MessageSquare, Mail, TestTube, Shield, DollarSign, FileCheck, Activity, CalendarDays, Plus, X, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface NotificationSettingsData {
  email_enabled: boolean;
  webhook_enabled: boolean;
  webhook_url: string;
  slack_enabled: boolean;
  slack_webhook_url: string;
  security_alerts: boolean;
  cost_alerts: boolean;
  compliance_alerts: boolean;
  drift_alerts: boolean;
  daily_reports: boolean;
  weekly_reports: boolean;
  monthly_reports: boolean;
  on_demand_reports: boolean;
  additional_emails: string[];
}

const defaultSettings: NotificationSettingsData = {
  email_enabled: true,
  webhook_enabled: false,
  webhook_url: '',
  slack_enabled: false,
  slack_webhook_url: '',
  security_alerts: true,
  cost_alerts: true,
  compliance_alerts: true,
  drift_alerts: true,
  daily_reports: false,
  weekly_reports: true,
  monthly_reports: true,
  on_demand_reports: true,
  additional_emails: [],
};

export default function NotificationSettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("channels");
  const [settings, setSettings] = useState<NotificationSettingsData>(defaultSettings);
  const [newEmail, setNewEmail] = useState("");

  const { isLoading } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      try {
        const response = await apiClient.get('/user/notification-settings') as any;
        const data = response?.data ?? response;
        if (data && typeof data === 'object' && !data.error) {
          setSettings({ ...defaultSettings, ...data });
        }
        return data;
      } catch {
        return null;
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      await apiClient.lambda('notification-settings', settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      toast.success(t('notificationSettings.saved', 'Configurações salvas com sucesso!'));
    },
    onError: () => {
      toast.error(t('notificationSettings.saveError', 'Erro ao salvar configurações'));
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user?.email) throw new Error('Email não encontrado');
      return await emailClient.sendNotification(
        user.email,
        'Teste de Notificação - EVO',
        'Este é um email de teste para verificar se as notificações estão funcionando corretamente.',
        'info'
      );
    },
    onSuccess: () => {
      toast.success(t('notificationSettings.testSent', 'Email de teste enviado! Verifique sua caixa de entrada.'));
    },
    onError: () => {
      toast.error(t('notificationSettings.testError', 'Erro ao enviar email de teste'));
    },
  });

  const update = (field: keyof NotificationSettingsData, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const addEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error(t('notificationSettings.invalidEmail', 'Email inválido'));
      return;
    }
    if (settings.additional_emails.includes(email)) {
      toast.error(t('notificationSettings.duplicateEmail', 'Email já adicionado'));
      return;
    }
    update('additional_emails', [...settings.additional_emails, email]);
    setNewEmail("");
  };

  const removeEmail = (email: string) => {
    update('additional_emails', settings.additional_emails.filter(e => e !== email));
  };

  return (
    <Layout
      title={t('notificationSettings.title', 'Configurações de Notificações')}
      description={t('notificationSettings.description', 'Gerencie como e quando você recebe alertas e relatórios')}
      icon={<Bell className="h-4 w-4 text-white" />}
    >
      <div className="space-y-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="glass">
            <TabsTrigger value="channels">{t('notificationSettings.channels', 'Canais')}</TabsTrigger>
            <TabsTrigger value="alerts">{t('notificationSettings.alertTypes', 'Tipos de Alerta')}</TabsTrigger>
            <TabsTrigger value="reports">{t('notificationSettings.reports', 'Relatórios')}</TabsTrigger>
          </TabsList>

          <TabsContent value="channels" className="space-y-6">
            {/* Email */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-base">{t('notificationSettings.email', 'Email')}</CardTitle>
                      <CardDescription>{t('notificationSettings.emailDesc', 'Receba relatórios de scan e alertas críticos por email')}</CardDescription>
                    </div>
                  </div>
                  <Switch checked={settings.email_enabled} onCheckedChange={(v) => update('email_enabled', v)} />
                </div>
              </CardHeader>
            </Card>

            {/* Webhook */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Webhook className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-base">{t('notificationSettings.webhook', 'Webhook')}</CardTitle>
                      <CardDescription>{t('notificationSettings.webhookDesc', 'Envie notificações para seu endpoint HTTP')}</CardDescription>
                    </div>
                  </div>
                  <Switch checked={settings.webhook_enabled} onCheckedChange={(v) => update('webhook_enabled', v)} />
                </div>
              </CardHeader>
              {settings.webhook_enabled && (
                <CardContent>
                  <Input
                    placeholder="https://seu-endpoint.com/webhook"
                    value={settings.webhook_url}
                    onChange={(e) => update('webhook_url', e.target.value)}
                  />
                </CardContent>
              )}
            </Card>

            {/* Slack */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-base">{t('notificationSettings.slack', 'Slack')}</CardTitle>
                      <CardDescription>{t('notificationSettings.slackDesc', 'Integre com Slack via Incoming Webhooks')}</CardDescription>
                    </div>
                  </div>
                  <Switch checked={settings.slack_enabled} onCheckedChange={(v) => update('slack_enabled', v)} />
                </div>
              </CardHeader>
              {settings.slack_enabled && (
                <CardContent>
                  <Input
                    placeholder="https://hooks.slack.com/services/..."
                    value={settings.slack_webhook_url}
                    onChange={(e) => update('slack_webhook_url', e.target.value)}
                  />
                </CardContent>
              )}
            </Card>

            {/* Additional Emails */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-base">{t('notificationSettings.additionalEmails', 'Emails Adicionais')}</CardTitle>
                    <CardDescription>{t('notificationSettings.additionalEmailsDesc', 'Adicione outros destinatários para receber os relatórios e alertas')}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder={t('notificationSettings.emailPlaceholder', 'nome@empresa.com')}
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                  />
                  <Button type="button" variant="outline" size="icon" onClick={addEmail} className="glass shrink-0">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {settings.additional_emails.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {settings.additional_emails.map((email) => (
                      <Badge key={email} variant="secondary" className="gap-1 pl-3 pr-1 py-1.5">
                        {email}
                        <button
                          type="button"
                          onClick={() => removeEmail(email)}
                          className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
                          aria-label={`${t('common.remove', 'Remover')} ${email}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                {settings.additional_emails.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t('notificationSettings.noAdditionalEmails', 'Nenhum email adicional configurado')}</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-6">
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>{t('notificationSettings.alertCategories', 'Categorias de Alerta')}</CardTitle>
                <CardDescription>{t('notificationSettings.alertCategoriesDesc', 'Escolha quais tipos de alerta deseja receber')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                  <div className="flex items-center gap-3">
                    <Shield className="h-4 w-4 text-red-500" />
                    <div>
                      <Label className="text-sm font-medium">{t('notificationSettings.securityAlerts', 'Alertas de Segurança')}</Label>
                      <p className="text-xs text-muted-foreground">{t('notificationSettings.securityAlertsDesc', 'Findings críticos, novos vulnerabilidades')}</p>
                    </div>
                  </div>
                  <Switch checked={settings.security_alerts} onCheckedChange={(v) => update('security_alerts', v)} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-4 w-4 text-amber-500" />
                    <div>
                      <Label className="text-sm font-medium">{t('notificationSettings.costAlerts', 'Alertas de Custo')}</Label>
                      <p className="text-xs text-muted-foreground">{t('notificationSettings.costAlertsDesc', 'Anomalias de custo, desperdícios detectados')}</p>
                    </div>
                  </div>
                  <Switch checked={settings.cost_alerts} onCheckedChange={(v) => update('cost_alerts', v)} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                  <div className="flex items-center gap-3">
                    <FileCheck className="h-4 w-4 text-blue-500" />
                    <div>
                      <Label className="text-sm font-medium">{t('notificationSettings.complianceAlerts', 'Alertas de Compliance')}</Label>
                      <p className="text-xs text-muted-foreground">{t('notificationSettings.complianceAlertsDesc', 'Violações de conformidade detectadas')}</p>
                    </div>
                  </div>
                  <Switch checked={settings.compliance_alerts} onCheckedChange={(v) => update('compliance_alerts', v)} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                  <div className="flex items-center gap-3">
                    <Activity className="h-4 w-4 text-purple-500" />
                    <div>
                      <Label className="text-sm font-medium">{t('notificationSettings.driftAlerts', 'Alertas de Drift')}</Label>
                      <p className="text-xs text-muted-foreground">{t('notificationSettings.driftAlertsDesc', 'Mudanças não autorizadas na infraestrutura')}</p>
                    </div>
                  </div>
                  <Switch checked={settings.drift_alerts} onCheckedChange={(v) => update('drift_alerts', v)} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>{t('notificationSettings.scheduledReports', 'Relatórios Agendados')}</CardTitle>
                <CardDescription>{t('notificationSettings.scheduledReportsDesc', 'Receba relatórios periódicos por email')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-4 w-4 text-orange-500" />
                    <div>
                      <Label className="text-sm font-medium">{t('notificationSettings.dailyReports', 'Relatório Diário')}</Label>
                      <p className="text-xs text-muted-foreground">{t('notificationSettings.dailyReportsDesc', 'Resumo diário de segurança, custos e alertas')}</p>
                    </div>
                  </div>
                  <Switch checked={settings.daily_reports} onCheckedChange={(v) => update('daily_reports', v)} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    <div>
                      <Label className="text-sm font-medium">{t('notificationSettings.weeklyReports', 'Relatório Semanal')}</Label>
                      <p className="text-xs text-muted-foreground">{t('notificationSettings.weeklyReportsDesc', 'Resumo semanal de segurança e custos')}</p>
                    </div>
                  </div>
                  <Switch checked={settings.weekly_reports} onCheckedChange={(v) => update('weekly_reports', v)} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    <div>
                      <Label className="text-sm font-medium">{t('notificationSettings.monthlyReports', 'Relatório Mensal')}</Label>
                      <p className="text-xs text-muted-foreground">{t('notificationSettings.monthlyReportsDesc', 'Relatório mensal completo com tendências')}</p>
                    </div>
                  </div>
                  <Switch checked={settings.monthly_reports} onCheckedChange={(v) => update('monthly_reports', v)} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-green-500" />
                    <div>
                      <Label className="text-sm font-medium">{t('notificationSettings.onDemandReports', 'Relatório Sob Demanda')}</Label>
                      <p className="text-xs text-muted-foreground">{t('notificationSettings.onDemandReportsDesc', 'Receber email após cada scan executado manualmente')}</p>
                    </div>
                  </div>
                  <Switch checked={settings.on_demand_reports} onCheckedChange={(v) => update('on_demand_reports', v)} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex gap-3">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="glass hover-glow flex-1">
            {saveMutation.isPending ? t('common.saving', 'Salvando...') : t('notificationSettings.save', 'Salvar Configurações')}
          </Button>
          <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending} className="glass">
            <TestTube className="h-4 w-4 mr-2" />
            {testMutation.isPending ? t('notificationSettings.sending', 'Enviando...') : t('notificationSettings.testEmail', 'Testar Email')}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
