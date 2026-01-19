import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { toast } from "sonner";
import { Calendar, Plus, Pause, Play, Trash2, PlayCircle, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useOrganization } from "@/hooks/useOrganization";
import { useTranslation } from "react-i18next";

interface ScanSchedule {
  id: string;
  organization_id: string;
  aws_account_id: string;
  scan_type: string;
  schedule_type: string;
  schedule_config?: Record<string, any>;
  is_active: boolean;
  last_run_at?: string;
  next_run_at?: string;
  created_at: string;
  updated_at: string;
}

export const ScheduledScans = () => {
  const { t } = useTranslation();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [newSchedule, setNewSchedule] = useState({
    scan_type: 'security',
    schedule_type: 'daily',
    schedule_config: { hour: 2 },
    is_active: true
  });
  const queryClient = useQueryClient();
  const { data: organizationId } = useOrganization();

  const scheduleTypeOptions = [
    { label: t('scheduledScans.hourly', 'A cada hora'), value: 'hourly' },
    { label: t('scheduledScans.daily', 'Diário às 2h'), value: 'daily' },
    { label: t('scheduledScans.weekly', 'Semanal (Segunda)'), value: 'weekly' },
    { label: t('scheduledScans.monthly', 'Mensal (dia 1)'), value: 'monthly' },
  ];

  const scanTypeLabels: Record<string, string> = {
    security: t('scheduledScans.security', 'Segurança'),
    compliance: t('scheduledScans.compliance', 'Compliance'),
    well_architected: t('scheduledScans.wellArchitected', 'Well-Architected'),
    cost: t('scheduledScans.cost', 'Custos'),
    drift: t('scheduledScans.drift', 'Drift Detection'),
    iam: t('scheduledScans.iam', 'IAM Deep'),
  };

  // Fetch AWS accounts for the organization
  const { data: awsAccounts } = useQuery({
    queryKey: ['aws-credentials', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const response = await apiClient.lambda<any[]>('list-aws-credentials');
      return response.data || [];
    },
  });

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['scan-schedules', organizationId],
    enabled: isSuperAdmin && !!organizationId,
    queryFn: async () => {
      // Use query-table Lambda to fetch from scan_schedules table
      const response = await apiClient.lambda<{ data: ScanSchedule[] }>('query-table', {
        table: 'scan_schedules',
        filters: { organization_id: organizationId },
        orderBy: { column: 'created_at', direction: 'desc' }
      });
      return response.data?.data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error('Organization not found');
      if (!selectedAccountId) throw new Error('Please select an AWS account');
      
      // Use mutate-table Lambda to insert into scan_schedules
      const response = await apiClient.lambda('mutate-table', {
        table: 'scan_schedules',
        operation: 'insert',
        data: {
          organization_id: organizationId,
          aws_account_id: selectedAccountId,
          scan_type: newSchedule.scan_type,
          schedule_type: newSchedule.schedule_type,
          schedule_config: newSchedule.schedule_config,
          is_active: newSchedule.is_active,
          next_run_at: calculateNextRun(newSchedule.schedule_type, newSchedule.schedule_config)
        }
      });
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scan-schedules'] });
      toast.success(t('scheduledScans.created', 'Scan agendado criado com sucesso!'), {
        description: `${t('scheduledScans.frequency', 'Frequência')}: ${scheduleTypeOptions.find(p => p.value === newSchedule.schedule_type)?.label || 'Customizado'}`
      });
      setIsDialogOpen(false);
      setNewSchedule({
        scan_type: 'security',
        schedule_type: 'daily',
        schedule_config: { hour: 2 },
        is_active: true
      });
      setSelectedAccountId('');
    },
    onError: (error) => {
      toast.error(t('scheduledScans.createError', 'Erro ao criar agendamento'), {
        description: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const response = await apiClient.lambda('mutate-table', {
        table: 'scan_schedules',
        operation: 'update',
        id,
        data: { is_active }
      });
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['scan-schedules'] });
      toast.success(variables.is_active ? t('scheduledScans.activated', 'Scan ativado') : t('scheduledScans.paused', 'Scan pausado'));
    },
    onError: (error) => {
      toast.error(t('scheduledScans.toggleError', 'Erro ao alterar status'), {
        description: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.lambda('mutate-table', {
        table: 'scan_schedules',
        operation: 'delete',
        id
      });
      if (response.error) throw new Error(response.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scan-schedules'] });
      toast.success(t('scheduledScans.deleted', 'Agendamento removido com sucesso'));
    },
    onError: (error) => {
      toast.error(t('scheduledScans.deleteError', 'Erro ao remover agendamento'), {
        description: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  });

  const runNowMutation = useMutation({
    mutationFn: async (schedule: ScanSchedule) => {
      const functionMap: Record<string, string> = {
        security: 'security-scan',
        compliance: 'compliance-scan',
        well_architected: 'well-architected-scan',
        cost: 'cost-optimization',
        drift: 'drift-detection',
        iam: 'iam-deep-analysis'
      };
      
      const functionName = functionMap[schedule.scan_type];
      if (!functionName) throw new Error(`Unknown scan type: ${schedule.scan_type}`);

      await apiClient.lambda(functionName, {
        accountId: schedule.aws_account_id,
        scanType: schedule.scan_type
      });

      // Update last run timestamp
      await apiClient.lambda('mutate-table', {
        table: 'scan_schedules',
        operation: 'update',
        id: schedule.id,
        data: { 
          last_run_at: new Date().toISOString(),
          next_run_at: calculateNextRun(schedule.schedule_type, schedule.schedule_config)
        }
      });

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scan-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      toast.success(t('scheduledScans.executed', 'Scan executado com sucesso!'));
    },
    onError: (error) => {
      toast.error(t('scheduledScans.executeError', 'Erro ao executar scan'), {
        description: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  });

  useEffect(() => {
    const checkSuperAdmin = async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) return;

      const response = await apiClient.lambda<{ data: any[] }>('query-table', {
        table: 'profiles',
        filters: { user_id: user.userId, role: 'super_admin' }
      });
      setIsSuperAdmin(!!(response.data?.data && response.data.data.length > 0));
    };
    checkSuperAdmin();
  }, []);

  // Calculate next run time based on schedule type
  function calculateNextRun(scheduleType: string, scheduleConfig?: Record<string, any>): string {
    const now = new Date();
    
    switch (scheduleType) {
      case 'hourly':
        return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      case 'daily': {
        const hour = scheduleConfig?.hour ?? 2;
        const next = new Date(now);
        next.setHours(hour, 0, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
        return next.toISOString();
      }
      case 'weekly': {
        const dayOfWeek = scheduleConfig?.dayOfWeek ?? 1;
        const hour = scheduleConfig?.hour ?? 2;
        const next = new Date(now);
        next.setHours(hour, 0, 0, 0);
        const daysUntilNext = (dayOfWeek - now.getDay() + 7) % 7 || 7;
        next.setDate(now.getDate() + daysUntilNext);
        return next.toISOString();
      }
      case 'monthly': {
        const dayOfMonth = scheduleConfig?.dayOfMonth ?? 1;
        const hour = scheduleConfig?.hour ?? 2;
        const next = new Date(now);
        next.setDate(dayOfMonth);
        next.setHours(hour, 0, 0, 0);
        if (next <= now) next.setMonth(next.getMonth() + 1);
        return next.toISOString();
      }
      default: {
        const defaultNext = new Date(now);
        defaultNext.setDate(defaultNext.getDate() + 1);
        defaultNext.setHours(2, 0, 0, 0);
        return defaultNext.toISOString();
      }
    }
  }

  const getScheduleLabel = (scheduleType: string): string => {
    return scheduleTypeOptions.find(o => o.value === scheduleType)?.label || scheduleType;
  };

  if (!isSuperAdmin) {
    return (
      <Card className="glass border-primary/20">
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              {t('scheduledScans.accessRestricted', 'Acesso restrito: apenas super administradores podem gerenciar rotinas automáticas.')}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t('scheduledScans.title', 'Scans Agendados')}
            </CardTitle>
            <CardDescription>{t('scheduledScans.description', 'Configure análises automáticas periódicas')}</CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="glass hover-glow"><Plus className="h-4 w-4 mr-2" />{t('scheduledScans.newSchedule', 'Novo Agendamento')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('scheduledScans.dialogTitle', 'Agendar Scan Automático')}</DialogTitle>
                <DialogDescription>{t('scheduledScans.dialogDescription', 'Configure scans recorrentes para monitoramento contínuo')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">{t('scheduledScans.awsAccount', 'Conta AWS')}</label>
                  <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger><SelectValue placeholder={t('scheduledScans.selectAccount', 'Selecione uma conta')} /></SelectTrigger>
                    <SelectContent>
                      {awsAccounts?.map((account: any) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.account_name || account.account_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">{t('scheduledScans.scanType', 'Tipo de Scan')}</label>
                  <Select value={newSchedule.scan_type} onValueChange={(value) => setNewSchedule({ ...newSchedule, scan_type: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(scanTypeLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">{t('scheduledScans.frequency', 'Frequência')}</label>
                  <Select value={newSchedule.schedule_type} onValueChange={(value) => setNewSchedule({ ...newSchedule, schedule_type: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {scheduleTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => createMutation.mutate()} className="w-full glass hover-glow" disabled={!selectedAccountId}>
                  {t('scheduledScans.createButton', 'Criar Agendamento')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">{t('scheduledScans.loading', 'Carregando agendamentos...')}</p>
          ) : schedules && schedules.length > 0 ? (
            schedules.map((schedule: ScanSchedule) => (
              <div key={schedule.id} className="p-4 border border-border rounded-lg">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm">{scanTypeLabels[schedule.scan_type] || schedule.scan_type}</h4>
                      <Badge variant={schedule.is_active ? 'default' : 'secondary'}>
                        {schedule.is_active ? t('scheduledScans.active', 'Ativo') : t('scheduledScans.paused', 'Pausado')}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {getScheduleLabel(schedule.schedule_type)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => runNowMutation.mutate(schedule)} disabled={runNowMutation.isPending}>
                      <PlayCircle className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleMutation.mutate({ id: schedule.id, is_active: !schedule.is_active })}>
                      {schedule.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(schedule.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {schedule.is_active && schedule.next_run_at && (
                  <p className="text-xs text-muted-foreground">
                    {t('scheduledScans.nextExecution', 'Próxima execução')}: {new Date(schedule.next_run_at).toLocaleString('pt-BR')}
                  </p>
                )}
                {schedule.last_run_at && (
                  <p className="text-xs text-muted-foreground">
                    {t('scheduledScans.lastExecution', 'Última execução')}: {new Date(schedule.last_run_at).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className="text-center text-muted-foreground py-8">{t('scheduledScans.noSchedules', 'Nenhum scan agendado')}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
