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

export const ScheduledScans = () => {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    scan_types: ['security', 'cost', 'well_architected'],
    schedule_cron: '0 2 * * *',
    is_active: true
  });
  const queryClient = useQueryClient();
  const { data: organizationId } = useOrganization();

  const cronPresets = [
    { label: 'A cada 15 minutos', value: '*/15 * * * *' },
    { label: 'A cada 30 minutos', value: '*/30 * * * *' },
    { label: 'A cada 1 hora', value: '0 * * * *' },
    { label: 'Diário às 2h', value: '0 2 * * *' },
    { label: 'A cada 6 horas', value: '0 */6 * * *' },
    { label: 'Semanal (Segunda 2h)', value: '0 2 * * 1' },
    { label: 'Mensal (dia 1 às 2h)', value: '0 2 1 * *' },
  ];

  const scanTypeLabels: Record<string, string> = {
    security: 'Segurança',
    cost: 'Custos',
    well_architected: 'Well-Architected',
    iam: 'IAM Deep',
  };

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['scheduled-scans', organizationId],
    enabled: isSuperAdmin && !!organizationId,
    queryFn: async () => {
      const response = await apiClient.select('scheduled_scans', {
        eq: { organization_id: organizationId },
        order: { column: 'created_at', ascending: false }
      });
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error('Organization not found');
      
      const response = await apiClient.insert('scheduled_scans', {
        ...newSchedule,
        organization_id: organizationId
      });
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-scans'] });
      toast.success('Scan agendado criado com sucesso!', {
        description: `Frequência: ${cronPresets.find(p => p.value === newSchedule.schedule_cron)?.label || 'Customizado'}`
      });
      setIsDialogOpen(false);
      setNewSchedule({
        scan_types: ['security', 'cost', 'well_architected'],
        schedule_cron: '0 2 * * *',
        is_active: true
      });
    },
    onError: (error) => {
      toast.error('Erro ao criar agendamento', {
        description: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const response = await apiClient.update('scheduled_scans', { is_active }, { id });
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-scans'] });
      toast.success(variables.is_active ? 'Scan ativado' : 'Scan pausado');
    },
    onError: (error) => {
      toast.error('Erro ao alterar status', {
        description: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete('scheduled_scans', { id });
      if (response.error) throw new Error(response.error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-scans'] });
      toast.success('Agendamento removido com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao remover agendamento', {
        description: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  });

  const runNowMutation = useMutation({
    mutationFn: async (schedule: any) => {
      const results = { success: [] as string[], failed: [] as string[] };

      for (const scanType of schedule.scan_types) {
        try {
          const functionMap: Record<string, string> = {
            security: 'security-scan',
            cost: 'cost-optimization',
            well_architected: 'well-architected-scan',
            iam: 'iam-deep-analysis'
          };
          
          const functionName = functionMap[scanType];
          if (!functionName) continue;

          await apiClient.lambda(functionName);
          results.success.push(scanTypeLabels[scanType] || scanType);
        } catch {
          results.failed.push(scanTypeLabels[scanType] || scanType);
        }
      }

      // Update last run
      await apiClient.update('scheduled_scans', {
        last_run_at: new Date().toISOString(),
        last_run_status: results.failed.length === 0 ? 'success' : results.success.length > 0 ? 'partial' : 'failed'
      }, { id: schedule.id });

      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-scans'] });
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      queryClient.invalidateQueries({ queryKey: ['cost_recommendations'] });
      
      if (results.failed.length === 0) {
        toast.success('Todos os scans executados com sucesso!');
      } else if (results.success.length > 0) {
        toast.warning('Scans parcialmente executados');
      } else {
        toast.error('Falha ao executar scans');
      }
    },
    onError: (error) => {
      toast.error('Erro ao executar scans', {
        description: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  });

  useEffect(() => {
    const checkSuperAdmin = async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) return;

      const response = await apiClient.select('profiles', {
        eq: { id: user.userId, role: 'super_admin' }
      });
      setIsSuperAdmin(!!(response.data && response.data.length > 0));
    };
    checkSuperAdmin();
  }, []);

  const getNextExecutionTime = (cronExpression: string, lastRunAt?: string) => {
    const now = new Date();
    const next = new Date(lastRunAt ? new Date(lastRunAt) : now);
    
    if (cronExpression === '*/15 * * * *') {
      next.setMinutes(Math.ceil(now.getMinutes() / 15) * 15);
    } else if (cronExpression === '*/30 * * * *') {
      next.setMinutes(Math.ceil(now.getMinutes() / 30) * 30);
    } else if (cronExpression === '0 * * * *') {
      next.setHours(now.getHours() + 1, 0, 0, 0);
    } else if (cronExpression === '0 */6 * * *') {
      next.setHours(Math.ceil(now.getHours() / 6) * 6, 0, 0, 0);
    } else {
      const parts = cronExpression.split(' ');
      if (parts[0] !== '*' && parts[1] !== '*') {
        next.setHours(parseInt(parts[1]), parseInt(parts[0]), 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
      }
    }
    return next;
  };

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              Acesso restrito: apenas super administradores podem gerenciar rotinas automáticas.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Scans Agendados
            </CardTitle>
            <CardDescription>Configure análises automáticas periódicas</CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Novo Agendamento</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Agendar Scan Automático</DialogTitle>
                <DialogDescription>Configure scans recorrentes para monitoramento contínuo</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Frequência</label>
                  <Select value={newSchedule.schedule_cron} onValueChange={(value) => setNewSchedule({ ...newSchedule, schedule_cron: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {cronPresets.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Tipos de Scan</label>
                  <div className="space-y-2">
                    {Object.entries(scanTypeLabels).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newSchedule.scan_types.includes(key)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewSchedule({ ...newSchedule, scan_types: [...newSchedule.scan_types, key] });
                            } else {
                              setNewSchedule({ ...newSchedule, scan_types: newSchedule.scan_types.filter(t => t !== key) });
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <Button onClick={() => createMutation.mutate()} className="w-full">Criar Agendamento</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Carregando agendamentos...</p>
          ) : schedules && schedules.length > 0 ? (
            schedules.map((schedule: any) => (
              <div key={schedule.id} className="p-4 border border-border rounded-lg">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm">{cronPresets.find(p => p.value === schedule.schedule_cron)?.label || 'Customizado'}</h4>
                      <Badge variant={schedule.is_active ? 'default' : 'secondary'}>{schedule.is_active ? 'Ativo' : 'Pausado'}</Badge>
                    </div>
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
                <div className="flex flex-wrap gap-1">
                  {schedule.scan_types?.map((type: string) => (
                    <Badge key={type} variant="outline" className="text-xs">{scanTypeLabels[type] || type}</Badge>
                  ))}
                </div>
                {schedule.is_active && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Próxima execução: {getNextExecutionTime(schedule.schedule_cron, schedule.last_run_at).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className="text-center text-muted-foreground py-8">Nenhum scan agendado</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
