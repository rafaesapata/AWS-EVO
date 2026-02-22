import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, MessageSquare, Bell, Send, Webhook, Filter, Search, RefreshCw, Eye, RotateCw, Forward } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function safeFormatDate(value: unknown, fmt: string): string {
  if (!value) return '-';
  const d = new Date(value as string);
  return isValid(d) ? format(d, fmt, { locale: ptBR }) : '-';
}

import { cognitoAuth } from '@/integrations/aws/cognito-client-simple';
import { apiClient } from '@/integrations/aws/api-client';
import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { useOrganization } from '@/hooks/useOrganization';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface CommunicationLog {
  id: string;
  organization_id: string;
  aws_account_id: string | null;
  user_id: string | null;
  channel: string;
  subject: string | null;
  message: string;
  recipient: string;
  cc: string[] | null;
  bcc: string[] | null;
  status: string;
  error_message: string | null;
  metadata: Record<string, unknown>;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const getChannels = (t: any) => [
  { value: 'all', label: t('communication.channels.all') },
  { value: 'email', label: t('communication.channels.email'), icon: Mail },
  { value: 'push', label: t('communication.channels.push'), icon: Bell },
  { value: 'sms', label: t('communication.channels.sms'), icon: MessageSquare },
  { value: 'whatsapp', label: t('communication.channels.whatsapp'), icon: MessageSquare },
  { value: 'webhook', label: t('communication.channels.webhook'), icon: Webhook },
  { value: 'slack', label: t('communication.channels.slack'), icon: Send },
  { value: 'in_app', label: t('communication.channels.inApp'), icon: Bell },
];

const getStatusMap = (t: any): Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> => ({
  queued: { label: t('communication.status.queued'), variant: 'secondary' },
  sent: { label: t('communication.status.sent'), variant: 'default' },
  delivered: { label: t('communication.status.delivered'), variant: 'default' },
  failed: { label: t('communication.status.failed'), variant: 'destructive' },
  bounced: { label: t('communication.status.bounced'), variant: 'destructive' },
});

export default function CommunicationCenter() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { selectedAccountId } = useCloudAccount();
  const { data: organizationId } = useOrganization();
  
  const CHANNELS = getChannels(t);
  const STATUS_MAP = getStatusMap(t);
  
  const getChannelIcon = (channel: string) => {
    const channelConfig = CHANNELS.find(c => c.value === channel);
    const Icon = channelConfig?.icon || Mail;
    return <Icon className="h-4 w-4" />;
  };
  
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [channelFilter, setChannelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<CommunicationLog | null>(null);
  const [forwardEmail, setForwardEmail] = useState('');
  const [showForwardInput, setShowForwardInput] = useState(false);
  const queryClient = useQueryClient();

  const resendMutation = useMutation({
    mutationFn: async ({ logId, newRecipient }: { logId: string; newRecipient?: string }) => {
      const response = await apiClient.invoke('resend-communication', {
        body: { communicationLogId: logId, newRecipient },
      });
      if (response.error) throw response.error;
      return response.data as { success: boolean; recipient: string; newLogId: string; error?: string };
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(t('communication.resendSuccess', { recipient: data.recipient }));
      } else {
        toast.error(t('communication.resendFailed', { error: data.error || 'Unknown error' }));
      }
      queryClient.invalidateQueries({ queryKey: ['communication-logs'] });
      setShowForwardInput(false);
      setForwardEmail('');
    },
    onError: (err: any) => {
      toast.error(t('communication.resendError'));
    },
  });

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['communication-logs', organizationId, selectedAccountId, page, channelFilter, statusFilter, searchTerm],
    queryFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      const response = await apiClient.invoke('get-communication-logs', {
        body: {
          page,
          pageSize,
          channel: channelFilter !== 'all' ? channelFilter : undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          search: searchTerm || undefined,
          accountId: selectedAccountId || undefined,
        }
      });

      if (response.error) throw response.error;
      return response.data as {
        data: CommunicationLog[];
        pagination: PaginationInfo;
        stats: {
          total: number;
          byChannel: Record<string, number>;
          byStatus: Record<string, number>;
        };
      };
    },
    enabled: !!organizationId,
  });

  const handleRefresh = () => {
    refetch();
    toast.success(t('common.listUpdated'));
  };

  const logs = data?.data || [];
  const pagination = data?.pagination || { page: 1, pageSize: 25, total: 0, totalPages: 0 };
  const stats = data?.stats || { total: 0, byChannel: {}, byStatus: {} };

  return (
    <Layout
      title={t('communication.title')}
      description={t('communication.description')}
      icon={<Mail className="h-6 w-6" />}
    >
      <div className="space-y-6">

      {/* Refresh Button */}
      <div className="flex justify-end">
        <Button onClick={handleRefresh} disabled={isFetching} variant="outline" >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('common.total')}</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        {Object.entries(stats.byChannel).slice(0, 5).map(([channel, count]) => (
          <Card key={channel}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                {getChannelIcon(channel)}
                {CHANNELS.find(c => c.value === channel)?.label || channel}
              </CardDescription>
              <CardTitle className="text-2xl">{count}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5" />
            {t('common.filters')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('communication.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
            
            <Select value={channelFilter} onValueChange={(v) => { setChannelFilter(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder={t('communication.channel')} />
              </SelectTrigger>
              <SelectContent>
                {CHANNELS.map((channel) => (
                  <SelectItem key={channel.value} value={channel.value}>
                    {channel.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder={t('common.status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('communication.status.all')}</SelectItem>
                {Object.entries(STATUS_MAP).map(([value, { label }]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={() => { setChannelFilter('all'); setStatusFilter('all'); setSearchTerm(''); setPage(1); }}>
              {t('common.clearFilters')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Communications List */}
      <Card>
        <CardHeader>
          <CardTitle>{t('communication.communications')}</CardTitle>
          <CardDescription>
            {t('communication.showingOf', { count: logs.length, total: pagination.total })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('communication.noCommunications')}</p>
              <p className="text-sm mt-2">{t('communication.communicationsWillAppear')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedLog(log)}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                      {getChannelIcon(log.channel)}
                    </div>
                    <div>
                      <div className="font-medium">
                        {log.subject || log.message.substring(0, 50)}
                        {log.message.length > 50 && '...'}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <span>{log.recipient}</span>
                        <span>•</span>
                        <span>{safeFormatDate(log.created_at, "dd/MM/yyyy HH:mm")}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_MAP[log.status]?.variant || 'secondary'}>
                      {STATUS_MAP[log.status]?.label || log.status}
                    </Badge>
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                {t('common.page')} {pagination.page} {t('common.of')} {pagination.totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  {t('common.previous')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  {t('common.next')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

            {/* Detail Dialog */}
            {selectedLog && (
              <Dialog open={true} onOpenChange={(open) => { if (!open) setSelectedLog(null); }}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      {getChannelIcon(selectedLog.channel)}
                      {t('communication.communicationDetails')}
                    </DialogTitle>
                    <DialogDescription>
                      ID: {selectedLog.id}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">{t('communication.channel')}</label>
                        <p className="font-medium capitalize">{selectedLog.channel.replace('_', ' ')}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">{t('common.status')}</label>
                        <div className="mt-1">
                          <Badge variant={STATUS_MAP[selectedLog.status]?.variant || 'secondary'}>
                            {STATUS_MAP[selectedLog.status]?.label || selectedLog.status}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-muted-foreground">{t('communication.recipient')}</label>
                      <p className="font-medium">{selectedLog.recipient}</p>
                    </div>

                    {selectedLog.cc && selectedLog.cc.length > 0 && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">CC</label>
                        <p>{selectedLog.cc.join(', ')}</p>
                      </div>
                    )}

                    {selectedLog.subject && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">{t('communication.subject')}</label>
                        <p className="font-medium">{selectedLog.subject}</p>
                      </div>
                    )}

                    <div>
                      <label className="text-sm font-medium text-muted-foreground">{t('communication.message')}</label>
                      <div className="mt-1 p-3 rounded-md bg-muted/50 whitespace-pre-wrap text-sm max-h-48 overflow-y-auto">
                        {selectedLog.message}
                      </div>
                    </div>

                    {selectedLog.error_message && (
                      <div>
                        <label className="text-sm font-medium text-destructive">{t('communication.errorMessage')}</label>
                        <p className="text-destructive text-sm">{selectedLog.error_message}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">{t('common.createdAt')}</label>
                        <p className="text-sm">{safeFormatDate(selectedLog.created_at, "dd/MM/yyyy HH:mm:ss")}</p>
                      </div>
                      {selectedLog.sent_at && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">{t('common.sentAt')}</label>
                          <p className="text-sm">{safeFormatDate(selectedLog.sent_at, "dd/MM/yyyy HH:mm:ss")}</p>
                        </div>
                      )}
                      {selectedLog.delivered_at && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">{t('common.deliveredAt')}</label>
                          <p className="text-sm">{safeFormatDate(selectedLog.delivered_at, "dd/MM/yyyy HH:mm:ss")}</p>
                        </div>
                      )}
                    </div>

                    {selectedLog.source_type && (
                      <div className="pt-4 border-t">
                        <label className="text-sm font-medium text-muted-foreground">{t('communication.source')}</label>
                        <p className="text-sm">
                          {selectedLog.source_type}
                          {selectedLog.source_id && ` (${selectedLog.source_id})`}
                        </p>
                      </div>
                    )}

                    {/* Resend Actions - only for email channel - BEFORE metadata so always visible */}
                    {selectedLog.channel === 'email' && (
                      <div className="pt-4 border-t space-y-3">
                        <label className="text-sm font-medium text-muted-foreground">{t('communication.actions')}</label>
                        <div className="flex gap-2">
                          <Button
                            className="glass hover-glow"
                            size="sm"
                            disabled={resendMutation.isPending}
                            onClick={() => resendMutation.mutate({ logId: selectedLog.id })}
                          >
                            <RotateCw className={`h-4 w-4 mr-2 ${resendMutation.isPending ? 'animate-spin' : ''}`} />
                            {t('communication.resend')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowForwardInput(!showForwardInput)}
                          >
                            <Forward className="h-4 w-4 mr-2" />
                            {t('communication.sendToAnother')}
                          </Button>
                        </div>
                        {showForwardInput && (
                          <div className="flex gap-2 items-end">
                            <div className="flex-1">
                              <Label htmlFor="forward-email" className="text-sm">{t('communication.newRecipient')}</Label>
                              <Input
                                id="forward-email"
                                type="email"
                                placeholder="email@exemplo.com"
                                value={forwardEmail}
                                onChange={(e) => setForwardEmail(e.target.value)}
                              />
                            </div>
                            <Button
                              className="glass hover-glow"
                              size="sm"
                              disabled={!forwardEmail || resendMutation.isPending}
                              onClick={() => resendMutation.mutate({ logId: selectedLog.id, newRecipient: forwardEmail })}
                            >
                              <Send className={`h-4 w-4 mr-2 ${resendMutation.isPending ? 'animate-spin' : ''}`} />
                              {t('communication.send')}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                      <div className="pt-4 border-t">
                        <label className="text-sm font-medium text-muted-foreground">{t('communication.metadata')}</label>
                        <pre className="mt-1 p-3 rounded-md bg-muted/50 text-xs overflow-x-auto max-h-32 overflow-y-auto">
                          {JSON.stringify(selectedLog.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
    </Layout>
  );
}
