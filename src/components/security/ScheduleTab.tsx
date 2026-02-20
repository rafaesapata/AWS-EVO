/**
 * ScheduleTab - Componente para agendamento de Security Scans
 * 
 * Permite criar, visualizar, pausar/ativar, executar e deletar agendamentos
 * de scans de segurança automáticos.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/integrations/aws/api-client";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { getErrorMessage } from "@/lib/error-utils";
import { 
  Calendar, 
  Plus, 
  Pause, 
  Play, 
  Trash2, 
  PlayCircle, 
  Clock,
  Shield,
  Zap,
  Activity,
  RefreshCw,
  AlertCircle,
  Cloud
} from "lucide-react";

interface ScanSchedule {
  id: string;
  organization_id: string;
  aws_account_id?: string;
  azure_credential_id?: string;
  cloud_provider?: 'AWS' | 'AZURE';
  scan_type: string;
  schedule_type: string;
  schedule_config?: Record<string, any>;
  is_active: boolean;
  last_run_at?: string;
  next_run_at?: string;
  created_at: string;
  updated_at: string;
}

interface ScheduleConfig {
  hour?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
}

interface ScheduleTabProps {
  organizationId: string | undefined;
  selectedAccountId: string | null;
}

export function ScheduleTab({ organizationId, selectedAccountId }: ScheduleTabProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { accounts } = useCloudAccount();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCloudAccount, setSelectedCloudAccount] = useState<string>('');
  const [newSchedule, setNewSchedule] = useState<{
    scan_type: string;
    schedule_type: string;
    schedule_config: ScheduleConfig;
  }>({
    scan_type: 'standard',
    schedule_type: 'daily',
    schedule_config: { hour: 2 }
  });

  // Scan type options with icons and descriptions
  const scanTypeOptions = [
    { 
      value: 'quick', 
      label: t('schedule.quickScan', 'Quick Scan'),
      description: t('schedule.quickScanDesc', '50+ verificações essenciais'),
      icon: Zap,
      color: 'text-yellow-500'
    },
    { 
      value: 'standard', 
      label: t('schedule.standardScan', 'Standard Scan'),
      description: t('schedule.standardScanDesc', '120+ verificações completas'),
      icon: Shield,
      color: 'text-blue-500'
    },
    { 
      value: 'deep', 
      label: t('schedule.deepScan', 'Deep Scan'),
      description: t('schedule.deepScanDesc', '170+ verificações com compliance'),
      icon: Activity,
      color: 'text-purple-500'
    }
  ];

  // Schedule frequency options
  const scheduleTypeOptions = [
    { value: 'hourly', label: t('schedule.hourly', 'A cada hora') },
    { value: 'daily', label: t('schedule.daily', 'Diário') },
    { value: 'weekly', label: t('schedule.weekly', 'Semanal') },
    { value: 'monthly', label: t('schedule.monthly', 'Mensal') }
  ];

  // Days of week for weekly schedule
  const daysOfWeek = [
    { value: 0, label: t('schedule.sunday', 'Domingo') },
    { value: 1, label: t('schedule.monday', 'Segunda') },
    { value: 2, label: t('schedule.tuesday', 'Terça') },
    { value: 3, label: t('schedule.wednesday', 'Quarta') },
    { value: 4, label: t('schedule.thursday', 'Quinta') },
    { value: 5, label: t('schedule.friday', 'Sexta') },
    { value: 6, label: t('schedule.saturday', 'Sábado') }
  ];

  // Cloud accounts come from CloudAccountContext (supports AWS + Azure)
  const activeAccounts = accounts.filter(a => a.isActive);

  // Fetch scan schedules
  const { data: schedules, isLoading: schedulesLoading, refetch } = useQuery({
    queryKey: ['scan-schedules', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const response = await apiClient.lambda<ScanSchedule[]>('query-table', {
        table: 'scan_schedules',
        order: { column: 'created_at', ascending: false }
      });
      // query-table returns array directly in response.data
      const data = response.data;
      return Array.isArray(data) ? data : [];
    }
  });

  // Calculate next run time
  const calculateNextRun = (scheduleType: string, config?: Record<string, any>): string => {
    const now = new Date();
    
    switch (scheduleType) {
      case 'hourly':
        return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      case 'daily': {
        const hour = config?.hour ?? 2;
        const next = new Date(now);
        next.setHours(hour, 0, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
        return next.toISOString();
      }
      case 'weekly': {
        const dayOfWeek = config?.dayOfWeek ?? 1;
        const hour = config?.hour ?? 2;
        const next = new Date(now);
        next.setHours(hour, 0, 0, 0);
        const daysUntilNext = (dayOfWeek - now.getDay() + 7) % 7 || 7;
        next.setDate(now.getDate() + daysUntilNext);
        return next.toISOString();
      }
      case 'monthly': {
        const dayOfMonth = config?.dayOfMonth ?? 1;
        const hour = config?.hour ?? 2;
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
  };

  // Create schedule mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error(t('schedule.errorNoOrg', 'Organização não encontrada'));
      if (!selectedCloudAccount) throw new Error(t('schedule.errorNoAccount', 'Selecione uma conta'));
      
      const account = accounts.find(a => a.id === selectedCloudAccount);
      if (!account) throw new Error('Conta não encontrada');
      
      const isAzure = account.provider === 'AZURE';
      
      const response = await apiClient.lambda('mutate-table', {
        table: 'scan_schedules',
        operation: 'insert',
        data: {
          ...(isAzure 
            ? { azure_credential_id: selectedCloudAccount }
            : { aws_account_id: selectedCloudAccount }
          ),
          cloud_provider: account.provider,
          scan_type: newSchedule.scan_type,
          schedule_type: newSchedule.schedule_type,
          schedule_config: newSchedule.schedule_config,
          is_active: true,
          next_run_at: calculateNextRun(newSchedule.schedule_type, newSchedule.schedule_config)
        }
      });
      if (response.error) throw new Error(response.error.message || 'Unknown error');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scan-schedules'] });
      toast.success(t('schedule.created', 'Agendamento criado com sucesso!'));
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(t('schedule.createError', 'Erro ao criar agendamento'), {
        description: getErrorMessage(error)
      });
    }
  });

  // Toggle schedule active status
  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const response = await apiClient.lambda('mutate-table', {
        table: 'scan_schedules',
        operation: 'update',
        where: { id },
        data: { 
          is_active,
          next_run_at: is_active ? calculateNextRun('daily', { hour: 2 }) : null
        }
      });
      if (response.error) throw new Error(response.error.message || 'Unknown error');
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['scan-schedules'] });
      toast.success(
        variables.is_active 
          ? t('schedule.activated', 'Agendamento ativado') 
          : t('schedule.paused', 'Agendamento pausado')
      );
    },
    onError: (error) => {
      toast.error(t('schedule.toggleError', 'Erro ao alterar status'), {
        description: getErrorMessage(error)
      });
    }
  });

  // Delete schedule
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.lambda('mutate-table', {
        table: 'scan_schedules',
        operation: 'delete',
        where: { id }
      });
      if (response.error) throw new Error(response.error.message || 'Unknown error');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scan-schedules'] });
      toast.success(t('schedule.deleted', 'Agendamento removido'));
    },
    onError: (error) => {
      toast.error(t('schedule.deleteError', 'Erro ao remover agendamento'), {
        description: getErrorMessage(error)
      });
    }
  });

  // Run scan now
  const runNowMutation = useMutation({
    mutationFn: async (schedule: ScanSchedule) => {
      const isAzure = schedule.cloud_provider === 'AZURE' || !!schedule.azure_credential_id;
      
      // Call appropriate scan Lambda
      const lambdaName = isAzure ? 'start-azure-security-scan' : 'start-security-scan';
      const response = await apiClient.invoke(lambdaName, {
        body: {
          ...(isAzure
            ? { credentialId: schedule.azure_credential_id }
            : { accountId: schedule.aws_account_id }
          ),
          scanLevel: schedule.scan_type
        }
      });

      if (response.error) throw new Error(response.error.message || 'Unknown error');

      // Update last_run_at and next_run_at
      await apiClient.lambda('mutate-table', {
        table: 'scan_schedules',
        operation: 'update',
        where: { id: schedule.id },
        data: { 
          last_run_at: new Date().toISOString(),
          next_run_at: calculateNextRun(schedule.schedule_type, schedule.schedule_config)
        }
      });

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scan-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['security-scans'] });
      toast.success(t('schedule.executed', 'Scan iniciado com sucesso!'));
    },
    onError: (error) => {
      toast.error(t('schedule.executeError', 'Erro ao executar scan'), {
        description: getErrorMessage(error)
      });
    }
  });

  const resetForm = () => {
    setSelectedCloudAccount('');
    setNewSchedule({
      scan_type: 'standard',
      schedule_type: 'daily',
      schedule_config: { hour: 2 }
    });
  };

  const getScheduleLabel = (scheduleType: string, config?: Record<string, any>): string => {
    switch (scheduleType) {
      case 'hourly':
        return t('schedule.everyHour', 'A cada hora');
      case 'daily':
        return t('schedule.dailyAt', 'Diário às {{hour}}h', { hour: config?.hour ?? 2 });
      case 'weekly': {
        const day = daysOfWeek.find(d => d.value === (config?.dayOfWeek ?? 1))?.label || 'Segunda';
        return t('schedule.weeklyOn', '{{day}} às {{hour}}h', { day, hour: config?.hour ?? 2 });
      }
      case 'monthly':
        return t('schedule.monthlyOn', 'Dia {{day}} às {{hour}}h', { day: config?.dayOfMonth ?? 1, hour: config?.hour ?? 2 });
      default:
        return scheduleType;
    }
  };

  const getScanTypeInfo = (scanType: string) => {
    return scanTypeOptions.find(s => s.value === scanType) || scanTypeOptions[1];
  };

  const getAccountName = (accountId: string | undefined): string => {
    if (!accountId) return 'N/A';
    const account = accounts?.find(a => a.id === accountId);
    return account?.accountName || account?.accountId || accountId.substring(0, 8);
  };

  const handleScheduleTypeChange = (value: string) => {
    const newConfig: Record<string, any> = { hour: newSchedule.schedule_config?.hour ?? 2 };
    
    if (value === 'weekly') {
      newConfig.dayOfWeek = 1; // Monday
    } else if (value === 'monthly') {
      newConfig.dayOfMonth = 1;
    }
    
    setNewSchedule({
      ...newSchedule,
      schedule_type: value,
      schedule_config: newConfig
    });
  };

  const handleConfigChange = (key: string, value: number) => {
    setNewSchedule({
      ...newSchedule,
      schedule_config: {
        ...newSchedule.schedule_config,
        [key]: value
      }
    });
  };

  const activeSchedules = schedules?.filter(s => s.is_active) || [];
  const inactiveSchedules = schedules?.filter(s => !s.is_active) || [];

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="glass border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                {t('schedule.title', 'Agendamento de Scans')}
              </CardTitle>
              <CardDescription>
                {t('schedule.description', 'Configure scans de segurança automáticos para monitoramento contínuo')}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => refetch()}
                className="glass hover-glow"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('common.refresh', 'Atualizar')}
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="glass hover-glow">
                    <Plus className="h-4 w-4 mr-2" />
                    {t('schedule.newSchedule', 'Novo Agendamento')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>{t('schedule.createTitle', 'Criar Agendamento de Scan')}</DialogTitle>
                    <DialogDescription>
                      {t('schedule.createDescription', 'Configure um scan de segurança automático recorrente')}
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    {/* Cloud Account Selection */}
                    <div className="space-y-2">
                      <Label>{t('schedule.cloudAccount', 'Conta Cloud')}</Label>
                      <Select value={selectedCloudAccount} onValueChange={setSelectedCloudAccount}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('schedule.selectAccount', 'Selecione uma conta')} />
                        </SelectTrigger>
                        <SelectContent>
                          {activeAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              <span className="flex items-center gap-2">
                                <Cloud className="h-3 w-3" />
                                <Badge variant="outline" className="text-xs px-1 py-0">
                                  {account.provider}
                                </Badge>
                                {account.accountName || account.accountId}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Scan Type Selection */}
                    <div className="space-y-2">
                      <Label>{t('schedule.scanType', 'Tipo de Scan')}</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {scanTypeOptions.map((option) => {
                          const Icon = option.icon;
                          const isSelected = newSchedule.scan_type === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setNewSchedule({ ...newSchedule, scan_type: option.value })}
                              className={`p-3 rounded-lg border-2 transition-all text-left ${
                                isSelected 
                                  ? 'border-primary bg-primary/10' 
                                  : 'border-border hover:border-primary/50'
                              }`}
                            >
                              <Icon className={`h-5 w-5 mb-1 ${option.color}`} />
                              <div className="text-sm font-medium">{option.label}</div>
                              <div className="text-xs text-muted-foreground">{option.description}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Schedule Frequency */}
                    <div className="space-y-2">
                      <Label>{t('schedule.frequency', 'Frequência')}</Label>
                      <Select 
                        value={newSchedule.schedule_type} 
                        onValueChange={handleScheduleTypeChange}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {scheduleTypeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Time Configuration */}
                    {newSchedule.schedule_type !== 'hourly' && (
                      <div className="space-y-2">
                        <Label>{t('schedule.executionTime', 'Horário de Execução')}</Label>
                        <Select 
                          value={String(newSchedule.schedule_config?.hour ?? 2)}
                          onValueChange={(v) => handleConfigChange('hour', parseInt(v))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 24 }, (_, i) => (
                              <SelectItem key={i} value={String(i)}>
                                {String(i).padStart(2, '0')}:00
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Day of Week for Weekly */}
                    {newSchedule.schedule_type === 'weekly' && (
                      <div className="space-y-2">
                        <Label>{t('schedule.dayOfWeek', 'Dia da Semana')}</Label>
                        <Select 
                          value={String(newSchedule.schedule_config?.dayOfWeek ?? 1)}
                          onValueChange={(v) => handleConfigChange('dayOfWeek', parseInt(v))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {daysOfWeek.map((day) => (
                              <SelectItem key={day.value} value={String(day.value)}>
                                {day.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Day of Month for Monthly */}
                    {newSchedule.schedule_type === 'monthly' && (
                      <div className="space-y-2">
                        <Label>{t('schedule.dayOfMonth', 'Dia do Mês')}</Label>
                        <Select 
                          value={String(newSchedule.schedule_config?.dayOfMonth ?? 1)}
                          onValueChange={(v) => handleConfigChange('dayOfMonth', parseInt(v))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 28 }, (_, i) => (
                              <SelectItem key={i + 1} value={String(i + 1)}>
                                {t('schedule.day', 'Dia')} {i + 1}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Preview */}
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <div className="text-sm text-muted-foreground">
                        {t('schedule.preview', 'Próxima execução')}:
                      </div>
                      <div className="font-medium">
                        {new Date(calculateNextRun(newSchedule.schedule_type, newSchedule.schedule_config)).toLocaleString('pt-BR')}
                      </div>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                      {t('common.cancel', 'Cancelar')}
                    </Button>
                    <Button 
                      onClick={() => createMutation.mutate()}
                      disabled={!selectedCloudAccount || createMutation.isPending}
                      className="glass hover-glow"
                    >
                      {createMutation.isPending ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          {t('common.creating', 'Criando...')}
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-2" />
                          {t('schedule.create', 'Criar Agendamento')}
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="glass border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Play className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{activeSchedules.length}</div>
                <div className="text-sm text-muted-foreground">
                  {t('schedule.activeSchedules', 'Agendamentos Ativos')}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Pause className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{inactiveSchedules.length}</div>
                <div className="text-sm text-muted-foreground">
                  {t('schedule.pausedSchedules', 'Agendamentos Pausados')}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Clock className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {activeSchedules.length > 0 
                    ? new Date(Math.min(...activeSchedules
                        .filter(s => s.next_run_at)
                        .map(s => new Date(s.next_run_at!).getTime())
                      )).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : '--:--'
                  }
                </div>
                <div className="text-sm text-muted-foreground">
                  {t('schedule.nextExecution', 'Próxima Execução')}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Schedules List */}
      <Card className="glass border-primary/20">
        <CardHeader>
          <CardTitle>{t('schedule.scheduledScans', 'Scans Agendados')}</CardTitle>
          <CardDescription>
            {t('schedule.scheduledScansDesc', 'Lista de todos os agendamentos configurados')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {schedulesLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : schedules && schedules.length > 0 ? (
            <div className="space-y-4">
              {schedules.map((schedule) => {
                const scanInfo = getScanTypeInfo(schedule.scan_type);
                const Icon = scanInfo.icon;
                
                return (
                  <div 
                    key={schedule.id} 
                    className={`p-4 border rounded-lg transition-all ${
                      schedule.is_active 
                        ? 'border-primary/30 bg-primary/5' 
                        : 'border-border bg-muted/20 opacity-70'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${schedule.is_active ? 'bg-primary/10' : 'bg-muted'}`}>
                          <Icon className={`h-5 w-5 ${schedule.is_active ? scanInfo.color : 'text-muted-foreground'}`} />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{scanInfo.label}</h4>
                            <Badge variant={schedule.is_active ? 'default' : 'secondary'}>
                              {schedule.is_active 
                                ? t('schedule.active', 'Ativo') 
                                : t('schedule.paused', 'Pausado')
                              }
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {getAccountName(schedule.aws_account_id || schedule.azure_credential_id)}
                            {schedule.cloud_provider && (
                              <Badge variant="outline" className="ml-2 text-xs px-1 py-0">
                                {schedule.cloud_provider}
                              </Badge>
                            )}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {getScheduleLabel(schedule.schedule_type, schedule.schedule_config)}
                            </span>
                            {schedule.last_run_at && (
                              <span>
                                {t('schedule.lastRun', 'Última')}: {new Date(schedule.last_run_at).toLocaleString('pt-BR')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {schedule.is_active && schedule.next_run_at && (
                          <div className="text-right mr-4">
                            <div className="text-xs text-muted-foreground">
                              {t('schedule.nextRun', 'Próxima execução')}
                            </div>
                            <div className="text-sm font-medium">
                              {new Date(schedule.next_run_at).toLocaleString('pt-BR')}
                            </div>
                          </div>
                        )}
                        
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => runNowMutation.mutate(schedule)}
                          disabled={runNowMutation.isPending}
                          title={t('schedule.runNow', 'Executar agora')}
                        >
                          <PlayCircle className={`h-4 w-4 ${runNowMutation.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                        
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => toggleMutation.mutate({ 
                            id: schedule.id, 
                            is_active: !schedule.is_active 
                          })}
                          disabled={toggleMutation.isPending}
                          title={schedule.is_active ? t('schedule.pause', 'Pausar') : t('schedule.activate', 'Ativar')}
                        >
                          {schedule.is_active ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(schedule.id)}
                          disabled={deleteMutation.isPending}
                          title={t('schedule.delete', 'Remover')}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">
                {t('schedule.noSchedules', 'Nenhum agendamento configurado')}
              </h3>
              <p className="text-muted-foreground mb-4">
                {t('schedule.noSchedulesDesc', 'Crie seu primeiro agendamento para monitoramento contínuo de segurança.')}
              </p>
              <Button onClick={() => setIsDialogOpen(true)} className="glass hover-glow">
                <Plus className="h-4 w-4 mr-2" />
                {t('schedule.createFirst', 'Criar Primeiro Agendamento')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="glass border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="space-y-2">
              <h4 className="font-semibold">{t('schedule.howItWorks', 'Como funciona')}</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {t('schedule.info1', 'Os scans agendados são executados automaticamente pelo sistema')}</li>
                <li>• {t('schedule.info2', 'O Security Engine analisa serviços AWS e Azure com 170+ verificações')}</li>
                <li>• {t('schedule.info3', 'Os resultados ficam disponíveis na aba "Histórico de Scans"')}</li>
                <li>• {t('schedule.info4', 'Você pode pausar ou executar manualmente a qualquer momento')}</li>
                <li>• {t('schedule.info5', 'Recomendamos scans diários para monitoramento contínuo')}</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
