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
  Building2,
  Loader2,
  User,
  Users,
} from 'lucide-react';
import { apiClient } from '@/integrations/aws/api-client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';

interface Organization {
  id: string;
  name: string;
  slug?: string;
  user_count?: number;
}

interface OrgUser {
  id: string;
  user_id: string;
  full_name: string;
  email?: string;
  role: string;
  avatar_url?: string;
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

export default function AINotificationsAdmin() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('send');
  const [statusFilter, setStatusFilter] = useState('all');

  // Notification types with i18n
  const notificationTypes = [
    { value: 'custom', labelKey: 'admin.notifType.custom', fallback: 'Custom' },
    { value: 'security_scan_needed', labelKey: 'admin.notifType.securityScan', fallback: 'Security Scan' },
    { value: 'compliance_scan_needed', labelKey: 'admin.notifType.complianceScan', fallback: 'Compliance Check' },
    { value: 'cost_alert', labelKey: 'admin.notifType.costAlert', fallback: 'Cost Alert' },
    { value: 'system_update', labelKey: 'admin.notifType.systemUpdate', fallback: 'System Update' },
    { value: 'feature_announcement', labelKey: 'admin.notifType.featureAnnouncement', fallback: 'New Feature' },
    { value: 'maintenance', labelKey: 'admin.notifType.maintenance', fallback: 'Scheduled Maintenance' },
  ];

  // Action types with i18n
  const actionTypes = [
    { value: 'none', labelKey: 'admin.actionType.none', fallback: 'No action' },
    { value: 'security_scan', labelKey: 'admin.actionType.securityScan', fallback: 'Start Security Scan' },
    { value: 'compliance_scan', labelKey: 'admin.actionType.complianceScan', fallback: 'Start Compliance Scan' },
    { value: 'cost_analysis', labelKey: 'admin.actionType.costAnalysis', fallback: 'Update Cost Analysis' },
    { value: 'navigate', labelKey: 'admin.actionType.navigate', fallback: 'Navigate to page' },
  ];

  // Priority options with i18n
  const priorityOptions = [
    { value: 'low', emoji: '🔵', labelKey: 'admin.priorityLevel.low', fallback: 'Low' },
    { value: 'medium', emoji: '🟡', labelKey: 'admin.priorityLevel.medium', fallback: 'Medium' },
    { value: 'high', emoji: '🟠', labelKey: 'admin.priorityLevel.high', fallback: 'High' },
    { value: 'critical', emoji: '🔴', labelKey: 'admin.priorityLevel.critical', fallback: 'Critical' },
  ];

  // Status filter options with i18n
  const statusFilterOptions = [
    { value: 'all', labelKey: 'admin.statusFilter.all', fallback: 'All' },
    { value: 'pending', labelKey: 'admin.statusFilter.pending', fallback: 'Pending' },
    { value: 'delivered', labelKey: 'admin.statusFilter.delivered', fallback: 'Delivered' },
    { value: 'read', labelKey: 'admin.statusFilter.read', fallback: 'Read' },
    { value: 'actioned', labelKey: 'admin.statusFilter.actioned', fallback: 'Actioned' },
    { value: 'dismissed', labelKey: 'admin.statusFilter.dismissed', fallback: 'Dismissed' },
  ];

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
  const { data: orgsData, isLoading: isLoadingOrgs, error: orgsError } = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: async () => {
      const response = await apiClient.invoke<Organization[]>('manage-organizations', {
        body: { action: 'list' },
      });
      if (response.error) {
        throw new Error(response.error.message || 'Failed to load organizations');
      }
      // Backend returns array directly in response.data
      return Array.isArray(response.data) ? response.data : [];
    },
  });

  // Fetch users for selected organization
  const { data: orgUsersData, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['admin-org-users', formData.target_organization_id],
    queryFn: async () => {
      const response = await apiClient.invoke<OrgUser[]>('manage-organizations', {
        body: { action: 'list_users', id: formData.target_organization_id },
      });
      if (response.error) {
        throw new Error(response.error.message || 'Failed to load users');
      }
      return Array.isArray(response.data) ? response.data : [];
    },
    enabled: !!formData.target_organization_id,
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
      if (response.error) {
        throw new Error(response.error.message || 'Failed to load notifications');
      }
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
  const orgUsers: OrgUser[] = orgUsersData || [];
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
                        {t('admin.targetOrg', 'Target Organization')}
                      </label>
                      <Select
                        value={formData.target_organization_id || 'all'}
                        onValueChange={v => setFormData(prev => ({ ...prev, target_organization_id: v === 'all' ? '' : v, target_user_id: '' }))}
                        disabled={isLoadingOrgs}
                      >
                        <SelectTrigger>
                          {isLoadingOrgs ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>{t('common.loading', 'Loading...')}</span>
                            </div>
                          ) : (
                            <SelectValue placeholder={t('admin.selectOrg', 'Select organization')} />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4" />
                              {t('admin.allOrgs', 'All organizations (broadcast)')}
                            </div>
                          </SelectItem>
                          {orgsError ? (
                            <div className="px-2 py-1.5 text-sm text-destructive">
                              {t('admin.errorLoadingOrgs', 'Error loading organizations')}
                            </div>
                          ) : organizations.length === 0 && !isLoadingOrgs ? (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground">
                              {t('admin.noOrgsFound', 'No organizations found')}
                            </div>
                          ) : (
                            organizations.map(org => (
                              <SelectItem key={org.id} value={org.id}>
                                <div className="flex items-center justify-between gap-4">
                                  <span>{org.name}</span>
                                  {org.user_count !== undefined && (
                                    <span className="text-xs text-muted-foreground">
                                      ({org.user_count} {t('admin.users', 'users')})
                                    </span>
                                  )}
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      {orgsError && (
                        <p className="text-xs text-destructive">
                          {t('admin.errorLoadingOrgsHint', 'Could not load organizations. Please try again.')}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        {t('admin.targetUser', 'Usuário Específico (opcional)')}
                      </label>
                      <Select
                        value={formData.target_user_id || 'all'}
                        onValueChange={v => setFormData(prev => ({ ...prev, target_user_id: v === 'all' ? '' : v }))}
                        disabled={!formData.target_organization_id || isLoadingUsers}
                      >
                        <SelectTrigger>
                          {isLoadingUsers ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>{t('common.loading', 'Loading...')}</span>
                            </div>
                          ) : (
                            <SelectValue placeholder={
                              !formData.target_organization_id
                                ? t('admin.selectOrgFirst', 'Selecione uma organização primeiro')
                                : t('admin.selectUser', 'Selecione um usuário')
                            } />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              {t('admin.allUsers', 'Todos os usuários da organização')}
                            </div>
                          </SelectItem>
                          {orgUsers.map(user => (
                            <SelectItem key={user.user_id} value={user.user_id}>
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span>{user.full_name || t('admin.unnamed', 'Sem nome')}</span>
                                {user.email && (
                                  <span className="text-xs text-muted-foreground">({user.email})</span>
                                )}
                                <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">
                                  {user.role}
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                          {!isLoadingUsers && orgUsers.length === 0 && formData.target_organization_id && (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground">
                              {t('admin.noUsersFound', 'Nenhum usuário encontrado')}
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Type and Priority */}
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        {t('admin.notificationType', 'Type')}
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
                              {t(type.labelKey, type.fallback)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        {t('admin.priority', 'Priority')}
                      </label>
                      <Select
                        value={formData.priority}
                        onValueChange={v => setFormData(prev => ({ ...prev, priority: v as typeof formData.priority }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {priorityOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.emoji} {t(opt.labelKey, opt.fallback)}
                            </SelectItem>
                          ))}
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
                        {t('admin.actionType', 'Action Type')}
                      </label>
                      <Select
                        value={formData.action_type || 'none'}
                        onValueChange={v => setFormData(prev => ({ ...prev, action_type: v === 'none' ? '' : v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('admin.selectAction', 'Select an action')} />
                        </SelectTrigger>
                        <SelectContent>
                          {actionTypes.map(action => (
                            <SelectItem key={action.value} value={action.value}>
                              {t(action.labelKey, action.fallback)}
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
                        {statusFilterOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {t(opt.labelKey, opt.fallback)}
                          </SelectItem>
                        ))}
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
                              {format(new Date(notification.created_at), 'dd/MM/yyyy HH:mm', { 
                                locale: i18n.language === 'pt' ? ptBR : enUS 
                              })}
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
