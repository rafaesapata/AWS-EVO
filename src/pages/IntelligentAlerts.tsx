import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Layout } from "@/components/Layout";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { 
  Bell, 
  Plus, 
  Settings, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Mail,
  MessageSquare,
  Smartphone,
  Zap,
  TrendingUp,
  DollarSign,
  Shield,
  Activity,
  Edit,
  Trash2,
  Play,
  Pause,
  RefreshCw
} from "lucide-react";

interface AlertRule {
  id: string;
  name: string;
  description: string;
  type: 'cost' | 'security' | 'performance' | 'compliance';
  condition: {
    metric: string;
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
    threshold: number;
    period: number;
  };
  channels: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_triggered: string | null;
  trigger_count: number;
}

interface AlertHistory {
  id: string;
  rule_id: string;
  rule_name: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'sent' | 'failed' | 'acknowledged';
  channels_sent: string[];
  triggered_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

export default function IntelligentAlerts() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { selectedAccountId } = useAwsAccount();
  const { data: organizationId } = useOrganization();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [newRule, setNewRule] = useState({
    name: '',
    description: '',
    type: 'cost' as const,
    metric: '',
    operator: 'gt' as const,
    threshold: 0,
    period: 300,
    channels: [] as string[]
  });

  // Get alert rules
  const { data: alertRules, isLoading: rulesLoading, refetch: refetchRules } = useQuery({
    queryKey: ['alert-rules', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.select('alert_rules', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId
        },
        order: { created_at: 'desc' }
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data || [];
    },
  });

  // Get alert history
  const { data: alertHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['alert-history', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 1 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.select('alert_history', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId
        },
        order: { triggered_at: 'desc' },
        limit: 50
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data || [];
    },
  });

  // Create alert rule
  const createRuleMutation = useMutation({
    mutationFn: async (rule: typeof newRule) => {
      const response = await apiClient.insert('alert_rules', {
        ...rule,
        organization_id: organizationId,
        aws_account_id: selectedAccountId,
        condition: {
          metric: rule.metric,
          operator: rule.operator,
          threshold: rule.threshold,
          period: rule.period
        },
        is_active: true,
        trigger_count: 0
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Regra criada",
        description: "A regra de alerta foi criada com sucesso.",
      });
      setIsCreateDialogOpen(false);
      setNewRule({
        name: '',
        description: '',
        type: 'cost',
        metric: '',
        operator: 'gt',
        threshold: 0,
        period: 300,
        channels: []
      });
      refetchRules();
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar regra",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  });

  // Toggle rule status
  const toggleRuleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const response = await apiClient.update('alert_rules', {
        id,
        is_active
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Status atualizado",
        description: "O status da regra foi atualizado com sucesso.",
      });
      refetchRules();
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  });

  // Delete rule
  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete('alert_rules', { id });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Regra removida",
        description: "A regra de alerta foi removida com sucesso.",
      });
      refetchRules();
    },
    onError: (error) => {
      toast({
        title: "Erro ao remover",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  });

  const handleCreateRule = () => {
    if (!newRule.name || !newRule.metric || !newRule.threshold) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos obrigatórios.",
        variant: "destructive"
      });
      return;
    }

    createRuleMutation.mutate(newRule);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'cost': return DollarSign;
      case 'security': return Shield;
      case 'performance': return Activity;
      case 'compliance': return CheckCircle;
      default: return Bell;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'cost': return 'text-blue-500';
      case 'security': return 'text-red-500';
      case 'performance': return 'text-green-500';
      case 'compliance': return 'text-purple-500';
      default: return 'text-gray-500';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  const availableMetrics = {
    cost: [
      { value: 'daily_cost', label: 'Custo Diário' },
      { value: 'monthly_cost', label: 'Custo Mensal' },
      { value: 'cost_increase', label: 'Aumento de Custo (%)' }
    ],
    security: [
      { value: 'security_score', label: 'Security Score' },
      { value: 'critical_findings', label: 'Findings Críticos' },
      { value: 'failed_checks', label: 'Verificações Falhadas' }
    ],
    performance: [
      { value: 'cpu_utilization', label: 'Utilização CPU (%)' },
      { value: 'memory_utilization', label: 'Utilização Memória (%)' },
      { value: 'response_time', label: 'Tempo de Resposta (ms)' }
    ],
    compliance: [
      { value: 'compliance_score', label: 'Score de Compliance' },
      { value: 'non_compliant_resources', label: 'Recursos Não Conformes' }
    ]
  };

  const availableChannels = [
    { value: 'email', label: 'Email', icon: Mail },
    { value: 'slack', label: 'Slack', icon: MessageSquare },
    { value: 'sms', label: 'SMS', icon: Smartphone },
    { value: 'webhook', label: 'Webhook', icon: Zap }
  ];

  return (
    <Layout 
      title="Alertas Inteligentes" 
      description="Configure e gerencie alertas automáticos para sua infraestrutura AWS"
      icon={<Bell className="h-7 w-7 text-white" />}
    >
      <div className="space-y-6">
      {/* Header */}
      <Card className="glass border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-6 w-6 text-primary" />
                Alertas Inteligentes
              </CardTitle>
              <CardDescription>
                Sistema avançado de alertas baseado em ML e thresholds personalizados
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => refetchRules()}
                disabled={rulesLoading}
                className="glass"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${rulesLoading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Nova Regra
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Criar Nova Regra de Alerta</DialogTitle>
                    <DialogDescription>
                      Configure uma nova regra de alerta inteligente
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Nome da Regra</Label>
                        <Input
                          id="name"
                          value={newRule.name}
                          onChange={(e) => setNewRule(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Ex: Custo Alto Diário"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="type">Tipo</Label>
                        <Select value={newRule.type} onValueChange={(value: any) => setNewRule(prev => ({ ...prev, type: value, metric: '' }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cost">Custo</SelectItem>
                            <SelectItem value="security">Segurança</SelectItem>
                            <SelectItem value="performance">Performance</SelectItem>
                            <SelectItem value="compliance">Compliance</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="description">Descrição</Label>
                      <Textarea
                        id="description"
                        value={newRule.description}
                        onChange={(e) => setNewRule(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Descreva quando este alerta deve ser disparado"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="metric">Métrica</Label>
                        <Select value={newRule.metric} onValueChange={(value) => setNewRule(prev => ({ ...prev, metric: value }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma métrica" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableMetrics[newRule.type]?.map((metric) => (
                              <SelectItem key={metric.value} value={metric.value}>
                                {metric.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="operator">Operador</Label>
                        <Select value={newRule.operator} onValueChange={(value: any) => setNewRule(prev => ({ ...prev, operator: value }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gt">Maior que (&gt;)</SelectItem>
                            <SelectItem value="gte">Maior ou igual (&gt;=)</SelectItem>
                            <SelectItem value="lt">Menor que (&lt;)</SelectItem>
                            <SelectItem value="lte">Menor ou igual (&lt;=)</SelectItem>
                            <SelectItem value="eq">Igual (=)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="threshold">Threshold</Label>
                        <Input
                          id="threshold"
                          type="number"
                          value={newRule.threshold}
                          onChange={(e) => setNewRule(prev => ({ ...prev, threshold: Number(e.target.value) }))}
                          placeholder="100"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Canais de Notificação</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {availableChannels.map((channel) => (
                          <div key={channel.value} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id={channel.value}
                              checked={newRule.channels.includes(channel.value)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewRule(prev => ({ ...prev, channels: [...prev.channels, channel.value] }));
                                } else {
                                  setNewRule(prev => ({ ...prev, channels: prev.channels.filter(c => c !== channel.value) }));
                                }
                              }}
                            />
                            <Label htmlFor={channel.value} className="flex items-center gap-2">
                              <channel.icon className="h-4 w-4" />
                              {channel.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleCreateRule} disabled={createRuleMutation.isPending}>
                      {createRuleMutation.isPending ? 'Criando...' : 'Criar Regra'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Regras Ativas</CardTitle>
          </CardHeader>
          <CardContent>
            {rulesLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">
                {alertRules?.filter(rule => rule.is_active).length || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Regras</CardTitle>
          </CardHeader>
          <CardContent>
            {rulesLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">
                {alertRules?.length || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Alertas Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">
                {alertHistory?.filter(alert => 
                  new Date(alert.triggered_at).toDateString() === new Date().toDateString()
                ).length || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Sucesso</CardTitle>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {alertHistory && alertHistory.length > 0 
                  ? Math.round((alertHistory.filter(alert => alert.status === 'sent').length / alertHistory.length) * 100)
                  : 0}%
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="rules" className="w-full">
        <TabsList className="glass">
          <TabsTrigger value="rules">Regras de Alerta</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="channels">Canais</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Regras Configuradas</CardTitle>
              <CardDescription>Gerencie suas regras de alerta inteligentes</CardDescription>
            </CardHeader>
            <CardContent>
              {rulesLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : alertRules && alertRules.length > 0 ? (
                <div className="space-y-4">
                  {alertRules.map((rule) => {
                    const TypeIcon = getTypeIcon(rule.type);
                    return (
                      <div key={rule.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <TypeIcon className={`h-5 w-5 mt-0.5 ${getTypeColor(rule.type)}`} />
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold">{rule.name}</h4>
                                <Badge variant={rule.is_active ? "default" : "secondary"}>
                                  {rule.is_active ? 'Ativa' : 'Inativa'}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{rule.description}</p>
                              <div className="text-xs text-muted-foreground">
                                {rule.condition.metric} {rule.condition.operator} {rule.condition.threshold}
                                {rule.last_triggered && (
                                  <span className="ml-2">• Último disparo: {new Date(rule.last_triggered).toLocaleString('pt-BR')}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={rule.is_active}
                              onCheckedChange={(checked) => toggleRuleMutation.mutate({ id: rule.id, is_active: checked })}
                            />
                            <Button variant="outline" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => deleteRuleMutation.mutate(rule.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">Canais:</span>
                          {rule.channels.map((channel) => {
                            const channelInfo = availableChannels.find(c => c.value === channel);
                            return channelInfo ? (
                              <Badge key={channel} variant="outline" className="gap-1">
                                <channelInfo.icon className="h-3 w-3" />
                                {channelInfo.label}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                        
                        {rule.trigger_count > 0 && (
                          <div className="text-xs text-muted-foreground">
                            Disparado {rule.trigger_count} vez(es)
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Nenhuma regra configurada</h3>
                  <p className="text-muted-foreground mb-4">
                    Crie sua primeira regra de alerta para começar a monitorar sua infraestrutura.
                  </p>
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Primeira Regra
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Histórico de Alertas</CardTitle>
              <CardDescription>Últimos alertas disparados pelo sistema</CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : alertHistory && alertHistory.length > 0 ? (
                <div className="space-y-4">
                  {alertHistory.map((alert) => (
                    <div key={alert.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{alert.rule_name}</h4>
                            <Badge variant={getSeverityColor(alert.severity)}>
                              {alert.severity.toUpperCase()}
                            </Badge>
                            <Badge variant={alert.status === 'sent' ? 'default' : 'destructive'}>
                              {alert.status === 'sent' ? 'Enviado' : 'Falhou'}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{alert.message}</p>
                          <div className="text-xs text-muted-foreground">
                            {new Date(alert.triggered_at).toLocaleString('pt-BR')}
                            {alert.acknowledged_at && (
                              <span className="ml-2">• Reconhecido em {new Date(alert.acknowledged_at).toLocaleString('pt-BR')}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {alert.channels_sent.map((channel) => {
                            const channelInfo = availableChannels.find(c => c.value === channel);
                            return channelInfo ? (
                              <Badge key={channel} variant="outline" className="gap-1">
                                <channelInfo.icon className="h-3 w-3" />
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Nenhum alerta no histórico</h3>
                  <p className="text-muted-foreground">
                    Os alertas disparados aparecerão aqui.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Configuração de Canais</CardTitle>
              <CardDescription>Configure os canais de notificação disponíveis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {availableChannels.map((channel) => (
                  <div key={channel.value} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <channel.icon className="h-5 w-5 text-primary" />
                        <div>
                          <h4 className="font-semibold">{channel.label}</h4>
                          <p className="text-sm text-muted-foreground">
                            {channel.value === 'email' && 'Notificações por email'}
                            {channel.value === 'slack' && 'Integração com Slack'}
                            {channel.value === 'sms' && 'Mensagens SMS'}
                            {channel.value === 'webhook' && 'Webhook personalizado'}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Configurar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </Layout>
  );
}