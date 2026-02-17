/**
 * SLA Configuration Panel for Remediation Tickets
 * Manages SLA policies: CRUD + initialize defaults
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import {
  Clock, Shield, Trash2, Edit2, Plus, Zap, AlertTriangle,
  Bell, ArrowUpRight, RefreshCw, Timer
} from "lucide-react";

interface SlaPolicy {
  id: string;
  name: string;
  description: string | null;
  severity: string;
  category: string | null;
  response_time_minutes: number;
  resolution_time_minutes: number;
  escalation_enabled: boolean;
  escalation_after_minutes: number | null;
  escalation_to: string | null;
  notify_on_breach: boolean;
  notify_before_breach_minutes: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
};

function formatMinutes(minutes: number, t: (key: string, defaultValue: string, options?: any) => string): string {
  if (minutes < 60) return t('slaConfig.minutesShort', '{{m}}min', { m: minutes });
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

const emptyForm = {
  name: '',
  description: '',
  severity: 'medium' as string,
  category: '' as string,
  responseTimeMinutes: 240,
  resolutionTimeMinutes: 1440,
  escalationEnabled: true,
  escalationAfterMinutes: undefined as number | undefined,
  notifyOnBreach: true,
  notifyBeforeBreachMinutes: undefined as number | undefined,
};

export function SlaConfigPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<SlaPolicy | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  // Fetch SLA policies
  const { data: policiesData, isLoading } = useQuery({
    queryKey: ['sla-policies'],
    queryFn: async () => {
      const response = await apiClient.post('/api/functions/ticket-management', {
        action: 'get-sla-policies',
      });
      return response.data;
    },
  });

  const policies: SlaPolicy[] = policiesData?.policies || [];

  // Init default policies
  const initDefaultsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/api/functions/ticket-management', {
        action: 'init-default-sla-policies',
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sla-policies'] });
      toast({
        title: t('slaConfig.defaultsCreated', 'Políticas padrão criadas'),
        description: t('slaConfig.defaultsCreatedDesc', '{{count}} políticas de SLA foram criadas', { count: data.created || 4 }),
      });
    },
    onError: (err) => {
      toast({ title: t('slaConfig.error', 'Erro'), description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  // Create/Update policy
  const saveMutation = useMutation({
    mutationFn: async (data: typeof form & { policyId?: string }) => {
      const action = data.policyId ? 'update-sla-policy' : 'create-sla-policy';
      const response = await apiClient.post('/api/functions/ticket-management', {
        action,
        ...data,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-policies'] });
      setDialogOpen(false);
      setEditingPolicy(null);
      setForm(emptyForm);
      toast({ title: t('slaConfig.saved', 'Política salva com sucesso') });
    },
    onError: (err) => {
      toast({ title: t('slaConfig.error', 'Erro'), description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  // Delete policy
  const deleteMutation = useMutation({
    mutationFn: async (policyId: string) => {
      await apiClient.post('/api/functions/ticket-management', {
        action: 'delete-sla-policy',
        policyId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-policies'] });
      setDeleteConfirmId(null);
      toast({ title: t('slaConfig.deleted', 'Política removida') });
    },
    onError: (err) => {
      toast({ title: t('slaConfig.error', 'Erro'), description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  // Toggle active
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ policyId, isActive }: { policyId: string; isActive: boolean }) => {
      await apiClient.post('/api/functions/ticket-management', {
        action: 'update-sla-policy',
        policyId,
        isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-policies'] });
    },
    onError: (err) => {
      toast({ title: t('slaConfig.error', 'Erro'), description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  const openCreateDialog = () => {
    setEditingPolicy(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (policy: SlaPolicy) => {
    setEditingPolicy(policy);
    setForm({
      name: policy.name,
      description: policy.description || '',
      severity: policy.severity,
      category: policy.category || '',
      responseTimeMinutes: policy.response_time_minutes,
      resolutionTimeMinutes: policy.resolution_time_minutes,
      escalationEnabled: policy.escalation_enabled,
      escalationAfterMinutes: policy.escalation_after_minutes || undefined,
      notifyOnBreach: policy.notify_on_breach,
      notifyBeforeBreachMinutes: policy.notify_before_breach_minutes || undefined,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    saveMutation.mutate({
      ...form,
      category: form.category || undefined,
      ...(editingPolicy ? { policyId: editingPolicy.id } : {}),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">
            {t('slaConfig.title', 'Políticas de SLA')}
          </h3>
          <p className="text-sm text-gray-500">
            {t('slaConfig.subtitle', 'Configure tempos de resposta e resolução por severidade')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {policies.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => initDefaultsMutation.mutate()}
              disabled={initDefaultsMutation.isPending}
              className="glass hover-glow"
            >
              <Zap className="h-4 w-4 mr-2" />
              {initDefaultsMutation.isPending
                ? t('slaConfig.creating', 'Criando...')
                : t('slaConfig.initDefaults', 'Criar Padrões')}
            </Button>
          )}
          <Button
            size="sm"
            onClick={openCreateDialog}
            className="bg-[#003C7D] hover:bg-[#002d5c]"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('slaConfig.newPolicy', 'Nova Política')}
          </Button>
        </div>
      </div>

      {/* Policies List */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="glass border-primary/20">
              <CardContent className="p-5 space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : policies.length === 0 ? (
        <Card className="glass border-primary/20">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Timer className="h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">
              {t('slaConfig.noPolicies', 'Nenhuma política de SLA configurada')}
            </h3>
            <p className="text-sm text-gray-400 mb-4 text-center max-w-md">
              {t('slaConfig.noPoliciesDesc', 'Crie políticas de SLA para definir tempos de resposta e resolução. Tickets criados serão automaticamente vinculados à política correspondente.')}
            </p>
            <Button
              onClick={() => initDefaultsMutation.mutate()}
              disabled={initDefaultsMutation.isPending}
              className="bg-[#003C7D] hover:bg-[#002d5c]"
            >
              <Zap className="h-4 w-4 mr-2" />
              {t('slaConfig.initDefaults', 'Criar Padrões')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {policies.map((policy) => (
            <Card key={policy.id} className={`glass border-primary/20 ${!policy.is_active ? 'opacity-60' : ''}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge className={SEVERITY_COLORS[policy.severity] || 'bg-gray-100 text-gray-700'}>
                      {t(`tickets.severity.${policy.severity}`, policy.severity)}
                    </Badge>
                    {policy.category && (
                      <Badge variant="outline" className="text-xs">
                        {t(`tickets.category.${policy.category}`, policy.category)}
                      </Badge>
                    )}
                    {!policy.is_active && (
                      <Badge variant="secondary" className="text-xs">
                        {t('slaConfig.inactive', 'Inativa')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={policy.is_active}
                      onCheckedChange={(checked) => toggleActiveMutation.mutate({ policyId: policy.id, isActive: checked })}
                      aria-label={t('slaConfig.toggleActive', 'Ativar/Desativar')}
                    />
                  </div>
                </div>

                <h4 className="font-medium text-gray-800 mb-1">{policy.name}</h4>
                {policy.description && (
                  <p className="text-xs text-gray-500 mb-3">{policy.description}</p>
                )}

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-3.5 w-3.5 text-blue-500" />
                    <div>
                      <span className="text-gray-500 text-xs block">{t('slaConfig.responseTime', 'Resposta')}</span>
                      <span className="font-medium text-gray-700">{formatMinutes(policy.response_time_minutes, t)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Shield className="h-3.5 w-3.5 text-green-500" />
                    <div>
                      <span className="text-gray-500 text-xs block">{t('slaConfig.resolutionTime', 'Resolução')}</span>
                      <span className="font-medium text-gray-700">{formatMinutes(policy.resolution_time_minutes, t)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                  {policy.escalation_enabled && (
                    <span className="flex items-center gap-1">
                      <ArrowUpRight className="h-3 w-3" />
                      {t('slaConfig.escalationOn', 'Escalação ativa')}
                    </span>
                  )}
                  {policy.notify_on_breach && (
                    <span className="flex items-center gap-1">
                      <Bell className="h-3 w-3" />
                      {t('slaConfig.notifyOn', 'Notificação ativa')}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <Button variant="ghost" size="sm" onClick={() => openEditDialog(policy)} className="text-xs">
                    <Edit2 className="h-3 w-3 mr-1" />
                    {t('slaConfig.edit', 'Editar')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(policy.id)} className="text-xs text-red-500 hover:text-red-700">
                    <Trash2 className="h-3 w-3 mr-1" />
                    {t('slaConfig.delete', 'Excluir')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditingPolicy(null); } }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingPolicy
                ? t('slaConfig.editPolicy', 'Editar Política de SLA')
                : t('slaConfig.createPolicy', 'Criar Política de SLA')}
            </DialogTitle>
            <DialogDescription>
              {t('slaConfig.dialogDesc', 'Defina tempos de resposta e resolução para tickets')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>{t('slaConfig.labelName', 'Nome *')}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('slaConfig.placeholderName', 'Ex: SLA Crítico - Segurança')}
              />
            </div>

            <div>
              <Label>{t('slaConfig.labelDescription', 'Descrição')}</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t('slaConfig.placeholderDesc', 'Descrição opcional da política')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('slaConfig.labelSeverity', 'Severidade *')}</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">{t('tickets.severity.critical', 'Crítico')}</SelectItem>
                    <SelectItem value="high">{t('tickets.severity.high', 'Alto')}</SelectItem>
                    <SelectItem value="medium">{t('tickets.severity.medium', 'Médio')}</SelectItem>
                    <SelectItem value="low">{t('tickets.severity.low', 'Baixo')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('slaConfig.labelCategory', 'Categoria')}</Label>
                <Select value={form.category || 'none'} onValueChange={(v) => setForm({ ...form, category: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('slaConfig.allCategories', 'Todas')}</SelectItem>
                    <SelectItem value="security">{t('tickets.category.security', 'Segurança')}</SelectItem>
                    <SelectItem value="compliance">{t('tickets.category.compliance', 'Compliance')}</SelectItem>
                    <SelectItem value="cost_optimization">{t('tickets.category.cost_optimization', 'Otimização de Custos')}</SelectItem>
                    <SelectItem value="performance">{t('tickets.category.performance', 'Performance')}</SelectItem>
                    <SelectItem value="configuration">{t('tickets.category.configuration', 'Configuração')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('slaConfig.labelResponseTime', 'Tempo de Resposta (min) *')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.responseTimeMinutes}
                  onChange={(e) => setForm({ ...form, responseTimeMinutes: parseInt(e.target.value) || 0 })}
                />
                <span className="text-xs text-gray-400">{formatMinutes(form.responseTimeMinutes || 0, t)}</span>
              </div>

              <div>
                <Label>{t('slaConfig.labelResolutionTime', 'Tempo de Resolução (min) *')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.resolutionTimeMinutes}
                  onChange={(e) => setForm({ ...form, resolutionTimeMinutes: parseInt(e.target.value) || 0 })}
                />
                <span className="text-xs text-gray-400">{formatMinutes(form.resolutionTimeMinutes || 0, t)}</span>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">{t('slaConfig.labelEscalation', 'Escalação automática')}</Label>
                  <p className="text-xs text-gray-400">{t('slaConfig.escalationDesc', 'Escalar ticket se não houver resposta')}</p>
                </div>
                <Switch
                  checked={form.escalationEnabled}
                  onCheckedChange={(v) => setForm({ ...form, escalationEnabled: v })}
                />
              </div>

              {form.escalationEnabled && (
                <div>
                  <Label>{t('slaConfig.labelEscalationAfter', 'Escalar após (min)')}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.escalationAfterMinutes || ''}
                    onChange={(e) => setForm({ ...form, escalationAfterMinutes: parseInt(e.target.value) || undefined })}
                    placeholder="120"
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">{t('slaConfig.labelNotify', 'Notificar ao violar SLA')}</Label>
                  <p className="text-xs text-gray-400">{t('slaConfig.notifyDesc', 'Enviar notificação quando o SLA for violado')}</p>
                </div>
                <Switch
                  checked={form.notifyOnBreach}
                  onCheckedChange={(v) => setForm({ ...form, notifyOnBreach: v })}
                />
              </div>

              {form.notifyOnBreach && (
                <div>
                  <Label>{t('slaConfig.labelNotifyBefore', 'Notificar antes da violação (min)')}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.notifyBeforeBreachMinutes || ''}
                    onChange={(e) => setForm({ ...form, notifyBeforeBreachMinutes: parseInt(e.target.value) || undefined })}
                    placeholder="30"
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('slaConfig.cancel', 'Cancelar')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.name || !form.severity || !form.responseTimeMinutes || !form.resolutionTimeMinutes || saveMutation.isPending}
              className="bg-[#003C7D] hover:bg-[#002d5c]"
            >
              {saveMutation.isPending ? t('slaConfig.saving', 'Salvando...') : t('slaConfig.save', 'Salvar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('slaConfig.deleteTitle', 'Excluir Política')}</DialogTitle>
            <DialogDescription>
              {t('slaConfig.deleteDesc', 'Tem certeza? Tickets existentes vinculados a esta política não serão afetados, mas novos tickets não receberão este SLA.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              {t('slaConfig.cancel', 'Cancelar')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t('slaConfig.deleting', 'Excluindo...') : t('slaConfig.confirmDelete', 'Excluir')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
