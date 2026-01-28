/**
 * Página de Administração de Notificações da IA
 * Permite super admins enviarem notificações proativas para organizações/usuários
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layout } from '@/components/Layout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Bell,
  Send,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle,
  Clock,
  Eye,
  MousePointer,
  XCircle,
  Sparkles,
} from 'lucide-react';
import { apiClient } from '@/integrations/aws/api-client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Organization {
  id: string;
  name: string;
}

interface NotificationStats {
  pending: number;
  delivered: number;
  read: number;
  actioned: number;
  dismissed: number;
}

interface AdminNotification {
  id: string;
  organization_id: string;
  organization_name?: string;
  user_id?: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  suggested_action?: string;
  action_type?: string;
  status: string;
  created_at: string;
  delivered_at?: string;
  read_at?: string;
  actioned_at?: string;
  dismissed_at?: string;
}

const priorityConfig = {
  critical: { icon: AlertCircle, color: 'text-red-500', badge: 'destructive' },
  high: { icon: AlertTriangle, color: 'text-orange-500', badge: 'default' },
  medium: { icon: Info, color: 'text-yellow-500', badge: 'secondary' },
  low: { icon: CheckCircle, color: 'text-blue-500', badge: 'outline' },
};

const statusConfig: Record<string, { icon: typeof Clock; color: string }> = {
  pending: { icon: Clock, color: 'text-gray-500' },
  delivered: { icon: Send, color: 'text-blue-500' },
  read: { icon: Eye, color: 'text-green-500' },
  actioned: { icon: MousePointer, color: 'text-purple-500' },
  dismissed: { icon: XCircle, color: 'text-red-500' },
};

const notificationTypes = [
  { value: 'custom', label: 'Personalizada' },
  { value: 'security_scan_needed', label: 'Scan de Segurança' },
  { value: 'compliance_scan_needed', label: 'Verificação de Compliance' },
  { value: 'cost_alert', label: 'Alerta de Custos' },
  { value: 'system_update', label: 'Atualização do Sistema' },
  { value: 'feature_announcement', label: 'Nova Funcionalidade' },
  { value: 'maintenance', label: 'Manutenção Programada' },
];

const actionTypes = [
  { value: '', label: 'Nenhuma ação' },
  { value: 'security_scan', label: 'Iniciar Scan de Segurança' },
  { value: 'compliance_scan', label: 'Iniciar Scan de Compliance' },
  { value: 'cost_analysis', label: 'Atualizar Análise de Custos' },
  { value: 'navigate', label: 'Navegar para página' },
];

export default function AINotificationsAdmin() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('send');
  const [statusFilter, setStatusFilter] = useState('all');

  // Form state
  const [formData, setFormData] = useState({
    target_organization_id: '',
    target_user_id: '',
    type: 'custom',
    priority: 'medium' as const,
    title: '',
    message: '',
    suggested_action: '',
    action_type: '',
    action_params_path: '',
    expires_in_hours: 168,
  });

  // Fetch organizations
  const { data: orgsData } = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: async () => {
      const response = await apiClient.invoke('manage-organizations', {
        body: { action: 'list' },
      });
      return response.data?.organizations || [];
    },
  });

  // Fetch notifications
  const { data: notificationsData, isLoading: isLoadingNotifications, refetch } = useQuery({
    queryKey: ['admin-ai-notifications', statusFilter],
    queryFn: async () => {
      const response = await apiClient.invoke('list-ai-notifications-admin', {
        body: {
          status: statusFilter,
          limit: 50,
        },
      });
      return response.data;
    },
  });

  // Send notification mutation
  const sendMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload: Record<string, unknown> = {
        type: data.type,
        priority: data.priority,
        title: data.title,
        message: data.message,
        expires_in_hours: data.expires_in_hours,
      };

      if (data.target_organization_id) {
        payload.target_organization_id = data.target_organization_id;
      }
      if (data.target_user_id) {
        payload.target_user_id = data.target_user_id;
      }
      if (data.suggested_action) {
        payload.suggested_action = data.suggested_action;
      }
      if (data.action_type) {
        payload.action_type = data.action_type;
        if (data.action_type === 'navigate' && data.action_params_path) {
          payload.action_params = { path: data.action_params_path };
        }
      }

      const response = await apiClient.invoke('send-ai-notification', {
        body: payload,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return response.data;
    },
    onSuccess: () => {
      toast.success(t('admin.notificationSent', 'Notificação enviada com sucesso!'));
      queryClient.invalidateQueries({ queryKey: ['admin-ai-notifications'] });
      // Reset form
      setFormData({
        target_organization_id: '',
        target_user_id: '',
        type: 'custom',
        priority: 'medium',
        title: '',
        message: '',
        suggested_action: '',
        action_type: '',
        action_params_path: '',
        expires_in_hours: 168,
      });
    },
    onError: (error) => {
      toast.error(t('admin.notificationError', 'Erro ao enviar notificação: ') + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.message) {
      toast.error(t('admin.fillRequired', 'Preencha os campos obrigatórios'));
      return;
    }
    sendMutation.mutate(formData);
  };

  const organizations: Organization[] = orgsData || [];
  const notifications: AdminNotification[] = notificationsData?.notifications || [];
  const stats: NotificationStats = notificationsData?.stats || {
    pending: 0,
    delivered: 0,
    read: 0,
    actioned: 0,
    dismissed: 0,
  };

  return (
    <Layout
      title={t('admin.aiNotifications', 'Notificações da IA')}
      description={t('admin.aiNotificationsDesc', 'Envie notificações proativas para organizações e usuários')}
      icon={<Bell className="h-4 w-4 text-white" />}
    >
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          {Object.entries(stats).map(([status, count]) => {
            const config = statusConfig[status];
            const Icon = config?.icon || Clock;
            return (
              <Card key={status} className="glass border-primary/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground capitalize">{status}</p>
                      <p className="text-2xl font-bold">{count}</p>
                    </div>
                    <Icon className={`h-8 w-8 ${config?.color || 'text-gray-500'}`} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="glass">
            <TabsTrigger value="send">
              <Send className="h-4 w-4 mr-2" />
              {t('admin.sendNotification', 'Enviar Notificação')}
            </TabsTrigger>
            <TabsTrigger value="history">
              <Clock className="h-4 w-4 mr-2" />
              {t('admin.history', 'Histórico')}
            </TabsTrigger>
          </TabsList>

          {/* Send Notification Tab */}
          <TabsContent value="send" className="space-y-6">
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  {t('admin.newNotification', 'Nova Notificação')}
                </CardTitle>
                <CardDescription>
                  {t('admin.newNotificationDesc', 'Envie uma mensagem proativa que aparecerá no chat da IA para os usuários')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Target */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        {t('admin.targetOrg', 'Organização Alvo')}
                      </label>
                      <Select
                        value={formData.target_organization_id || 'current'}
                        onValueChange={v => setFormData(prev => ({ ...prev, target_organization_id: v === 'current' ? '' : v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('admin.allOrgs', 'Todas as organizações (sua org)')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="current">{t('admin.myOrg', 'Minha organização')}</SelectItem>
                          {organizations.map(org => (
                            <SelectItem key={org.id} value={org.id}>
                              {org.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        {t('admin.targetUser', 'Usuário Específico (opcional)')}
                      </label>
                      <Input
                        placeholder={t('admin.userIdPlaceholder', 'UUID do usuário (deixe vazio para todos)')}
                        value={formData.target_user_id}
                        onChange={e => setFormData(prev => ({ ...prev, target_user_id: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Type and Priority */}
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        {t('admin.notificationType', 'Tipo')}
                      </label>
                      <Select
                        value={formData.type}
                        onValueChange={v => setFormData(prev => ({ ...prev, type: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {notificationTypes.map(type => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        {t('admin.priority', 'Prioridade')}
                      </label>
                      <Select
                        value={formData.priority}
                        onValueChange={v => setFormData(prev => ({ ...prev, priority: v as typeof formData.priority }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">🔵 Baixa</SelectItem>
                          <SelectItem value="medium">🟡 Média</SelectItem>
                          <SelectItem value="high">🟠 Alta</SelectItem>
                          <SelectItem value="critical">🔴 Crítica</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        {t('admin.expiresIn', 'Expira em (horas)')}
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={720}
                        value={formData.expires_in_hours}
                        onChange={e => setFormData(prev => ({ ...prev, expires_in_hours: parseInt(e.target.value) || 168 }))}
                      />
                    </div>
                  </div>

                  {/* Title and Message */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {t('admin.title', 'Título')} *
                    </label>
                    <Input
                      placeholder={t('admin.titlePlaceholder', 'Ex: Scan de Segurança Recomendado')}
                      value={formData.title}
                      onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {t('admin.message', 'Mensagem')} *
                    </label>
                    <Textarea
                      placeholder={t('admin.messagePlaceholder', 'A mensagem que a IA vai "falar" para o usuário...')}
                      value={formData.message}
                      onChange={e => setFormData(prev => ({ ...prev, message: e.target.value }))}
                      rows={4}
                      required
                    />
                  </div>

                  {/* Action */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        {t('admin.actionType', 'Tipo de Ação')}
                      </label>
                      <Select
                        value={formData.action_type}
                        onValueChange={v => setFormData(prev => ({ ...prev, action_type: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('admin.selectAction', 'Selecione uma ação')} />
                        </SelectTrigger>
                        <SelectContent>
                          {actionTypes.map(action => (
                            <SelectItem key={action.value} value={action.value}>
                              {action.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        {t('admin.suggestedAction', 'Texto do Botão de Ação')}
                      </label>
                      <Input
                        placeholder={t('admin.suggestedActionPlaceholder', 'Ex: Iniciar scan agora')}
                        value={formData.suggested_action}
                        onChange={e => setFormData(prev => ({ ...prev, suggested_action: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Navigate path */}
                  {formData.action_type === 'navigate' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        {t('admin.navigatePath', 'Caminho para Navegação')}
                      </label>
                      <Input
                        placeholder="/security, /cost-optimization, /settings..."
                        value={formData.action_params_path}
                        onChange={e => setFormData(prev => ({ ...prev, action_params_path: e.target.value }))}
                      />
                    </div>
                  )}

                  {/* Preview */}
                  {(formData.title || formData.message) && (
                    <Card className="bg-muted/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">
                          {t('admin.preview', 'Pré-visualização')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-start gap-3">
                          <Sparkles className="h-5 w-5 text-primary mt-1" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-sm">{formData.title || 'Título'}</span>
                              <Badge variant={priorityConfig[formData.priority].badge as 'default'}>
                                {formData.priority}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {formData.message || 'Mensagem...'}
                            </p>
                            {formData.suggested_action && (
                              <Button size="sm" className="mt-2">
                                {formData.suggested_action}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Button
                    type="submit"
                    className="w-full glass hover-glow"
                    disabled={sendMutation.isPending}
                  >
                    {sendMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        {t('admin.sending', 'Enviando...')}
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        {t('admin.sendNotification', 'Enviar Notificação')}
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-6">
            <Card className="glass border-primary/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{t('admin.notificationHistory', 'Histórico de Notificações')}</CardTitle>
                    <CardDescription>
                      {t('admin.notificationHistoryDesc', 'Todas as notificações enviadas e seus status')}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="pending">Pendentes</SelectItem>
                        <SelectItem value="delivered">Entregues</SelectItem>
                        <SelectItem value="read">Lidas</SelectItem>
                        <SelectItem value="actioned">Acionadas</SelectItem>
                        <SelectItem value="dismissed">Ignoradas</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => refetch()}
                      className="glass"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingNotifications ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('admin.noNotifications', 'Nenhuma notificação encontrada')}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('admin.organization', 'Organização')}</TableHead>
                        <TableHead>{t('admin.title', 'Título')}</TableHead>
                        <TableHead>{t('admin.type', 'Tipo')}</TableHead>
                        <TableHead>{t('admin.priority', 'Prioridade')}</TableHead>
                        <TableHead>{t('admin.status', 'Status')}</TableHead>
                        <TableHead>{t('admin.createdAt', 'Criado em')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notifications.map(notification => {
                        const priorityConf = priorityConfig[notification.priority];
                        const PriorityIcon = priorityConf.icon;
                        const statusConf = statusConfig[notification.status];
                        const StatusIcon = statusConf?.icon || Clock;

                        return (
                          <TableRow key={notification.id}>
                            <TableCell className="font-medium">
                              {notification.organization_name || notification.organization_id.slice(0, 8)}
                            </TableCell>
                            <TableCell>
                              <div className="max-w-[200px] truncate" title={notification.title}>
                                {notification.title}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{notification.type}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <PriorityIcon className={`h-4 w-4 ${priorityConf.color}`} />
                                <span className="capitalize">{notification.priority}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <StatusIcon className={`h-4 w-4 ${statusConf?.color || 'text-gray-500'}`} />
                                <span className="capitalize">{notification.status}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {format(new Date(notification.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
