import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Plus, Play, Trash2, CheckCircle2, XCircle, Clock, TrendingUp, Edit, Power, Shield, Eye, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";

export default function EndpointMonitoring() {
  const [selectedMonitor, setSelectedMonitor] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMonitor, setEditingMonitor] = useState<string | null>(null);
  const [selectedErrorResult, setSelectedErrorResult] = useState<any | null>(null);
  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    url: '',
    method: 'GET',
    headers: '{}',
    body: '',
    expected_status_code: 200,
    expected_response_pattern: '',
    timeout_ms: 5000,
    frequency_minutes: 5,
    is_active: true,
    alert_on_failure: true,
    alert_threshold: 3,
    monitor_ssl: false,
    ssl_expiry_days_warning: 30,
    auto_create_ticket: false,
    inverted_check: false,
    validation_mode: 'status_code',
    pre_auth_enabled: false,
    pre_auth_url: '',
    pre_auth_method: 'POST',
    pre_auth_body: '',
    pre_auth_headers: '{}',
    pre_auth_token_path: '',
    pre_auth_token_header_name: 'Authorization',
    pre_auth_token_prefix: 'Bearer ',
    mtls_enabled: false,
    mtls_client_cert: '',
    mtls_client_key: '',
    mtls_ca_cert: '',
  });

  const { data: monitors, isLoading: monitorsLoading } = useQuery({
    queryKey: ['endpoint-monitors'],
    queryFn: async () => {
      const userData = await cognitoAuth.getCurrentUser();
      if (!userData?.user) return [];

      const { data: profile } = await apiClient.get('/profiles', { id: userData.user.id }).single();
      if (!profile?.organization_id) return [];

      const response = await apiClient.select('endpoint_monitors', {
        eq: { organization_id: profile.organization_id },
        order: { column: 'created_at', ascending: false }
      });
      
      if (response.error) throw response.error;
      return response.data;
    },
  });

  // Buscar últimos resultados de cada monitor para calcular tendências e métricas
  const { data: latestResults } = useQuery({
    queryKey: ['endpoint-monitors-latest-results'],
    queryFn: async () => {
      if (!monitors || monitors.length === 0) return {};
      
      // Get user's organization to validate monitors belong to it
      const userData = await cognitoAuth.getCurrentUser();
      if (!userData?.user) return {};

      const { data: profile } = await apiClient.get('/profiles', { id: userData.user.id }).single();
      const results: Record<string, any> = {};
      
      for (const monitor of monitors) {
        // Validate monitor belongs to user's organization
        if (monitor.organization_id !== profile?.organization_id) continue;

        // Pegar últimos 10 resultados para calcular média e tendência
        const response = await apiClient.select('endpoint_monitor_results', { 
          eq: { monitor_id: monitor.id },
          order: { column: 'checked_at', ascending: false },
          limit: 10
        });
        const data = response.data;
        if (data && data.length > 0) {
          const recentResults = data.slice(0, 5);
          const olderResults = data.slice(5, 10);
          
          const avgRecentTime = recentResults.reduce((sum: number, r: any) => sum + r.response_time_ms, 0) / recentResults.length;
          const avgOlderTime = olderResults.length > 0 
            ? olderResults.reduce((sum: number, r: any) => sum + r.response_time_ms, 0) / olderResults.length 
            : avgRecentTime;
          
          results[monitor.id] = {
            latest: data[0],
            avgResponseTime: Math.round(avgRecentTime),
            trend: avgRecentTime > avgOlderTime ? 'up' : avgRecentTime < avgOlderTime ? 'down' : 'stable',
            trendPercentage: olderResults.length > 0 
              ? Math.round(((avgRecentTime - avgOlderTime) / avgOlderTime) * 100)
              : 0,
          };
        }
      }
      
      return results;
    },
    enabled: !!monitors && monitors.length > 0,
  });

  const { data: results } = useQuery({
    queryKey: ['endpoint-monitor-results', selectedMonitor],
    queryFn: async () => {
      if (!selectedMonitor) return [];

      const response = await apiClient.select('endpoint_monitor_results', { 
        eq: { monitor_id: selectedMonitor },
        order: { column: 'checked_at', ascending: false },
        limit: 50
      });
      
      if (response.error) throw response.error;
      return response.data;
    },
    enabled: !!selectedMonitor,
  });

  const { data: stats } = useQuery({
    queryKey: ['endpoint-monitor-stats', selectedMonitor],
    queryFn: async () => {
      if (!selectedMonitor) return [];

      const response = await apiClient.select('endpoint_monitor_stats', { 
        eq: { monitor_id: selectedMonitor },
        order: { column: 'stat_date', ascending: false },
        limit: 30
      });
      if (response.error) throw response.error;
      return response.data;
    },
    enabled: !!selectedMonitor,
  });

  const createMutation = useMutation({
    mutationFn: async (newMonitor: any) => {
      const userData = await cognitoAuth.getCurrentUser();
      if (!userData?.user) throw new Error('Not authenticated');

      const { data: profile } = await apiClient.get('/profiles', { id: userData.user.id }).single();
      if (!profile?.organization_id) throw new Error('No organization');
      
      const response = await apiClient.insert('endpoint_monitors', {
        ...newMonitor,
        organization_id: profile.organization_id
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['endpoint-monitors'] });
      toast.success('Monitor criado com sucesso!');
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error('Erro ao criar monitor', {
        description: error.message,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: updateData }: { id: string; data: any }) => {
      const userData = await cognitoAuth.getCurrentUser();
      if (!userData?.user) throw new Error('Not authenticated');

      const { data: profile } = await apiClient.get('/profiles', { id: userData.user.id }).single();
      if (!profile?.organization_id) throw new Error('No organization');
      
      // Security: Only update if monitor belongs to user's organization
      const response = await apiClient.update('endpoint_monitors', updateData, { 
        id, 
        organization_id: profile.organization_id 
      });
      if (response.error) throw response.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['endpoint-monitors'] });
      toast.success('Monitor atualizado com sucesso!');
      setIsDialogOpen(false);
      setEditingMonitor(null);
      resetForm();
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar monitor', {
        description: error.message,
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const userData = await cognitoAuth.getCurrentUser();
      if (!userData?.user) throw new Error('Not authenticated');

      const { data: profile } = await apiClient.get('/profiles', { id: userData.user.id }).single();
      if (!profile?.organization_id) throw new Error('No organization');
      
      // Security: Only toggle if monitor belongs to user's organization
      const response = await apiClient.update('endpoint_monitors', { is_active }, { 
        id, 
        organization_id: profile.organization_id 
      });
      if (response.error) throw response.error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['endpoint-monitors'] });
      toast.success(variables.is_active ? 'Monitor ativado' : 'Monitor desativado');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const userData = await cognitoAuth.getCurrentUser();
      if (!userData?.user) throw new Error('Not authenticated');

      const { data: profile } = await apiClient.get('/profiles', { id: userData.user.id }).single();
      if (!profile?.organization_id) throw new Error('No organization');
      
      // Security: Only delete if monitor belongs to user's organization
      const response = await apiClient.delete('endpoint_monitors', { 
        id, 
        organization_id: profile.organization_id 
      });
      if (response.error) throw response.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['endpoint-monitors'] });
      toast.success('Monitor excluído');
      if (selectedMonitor) setSelectedMonitor(null);
    },
  });

  const runCheckMutation = useMutation({
    mutationFn: async (monitorId: string) => {
      const data = await apiClient.lambda('endpoint-monitor-check', {
        body: { monitorId },
      });

      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['endpoint-monitor-results'] });
      queryClient.invalidateQueries({ queryKey: ['endpoint-monitor-stats'] });
      queryClient.invalidateQueries({ queryKey: ['endpoint-monitors'] });
      toast.success('Check executado com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao executar check', {
        description: error.message,
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      url: '',
      method: 'GET',
      headers: '{}',
      body: '',
      expected_status_code: 200,
      expected_response_pattern: '',
      timeout_ms: 5000,
      frequency_minutes: 5,
      is_active: true,
      monitor_ssl: false,
      ssl_expiry_days_warning: 30,
      auto_create_ticket: false,
      alert_on_failure: true,
      alert_threshold: 3,
      inverted_check: false,
      validation_mode: 'status_code',
      pre_auth_enabled: false,
      pre_auth_url: '',
      pre_auth_method: 'POST',
      pre_auth_body: '',
      pre_auth_headers: '{}',
      pre_auth_token_path: '',
      pre_auth_token_header_name: 'Authorization',
      pre_auth_token_prefix: 'Bearer ',
      mtls_enabled: false,
      mtls_client_cert: '',
      mtls_client_key: '',
      mtls_ca_cert: '',
    });
  };

  const handleSubmit = () => {
    try {
      const headers = JSON.parse(formData.headers);
      const preAuthHeaders = formData.pre_auth_enabled ? JSON.parse(formData.pre_auth_headers) : {};
      
      if (editingMonitor) {
        updateMutation.mutate({
          id: editingMonitor,
          data: {
            ...formData,
            headers,
            pre_auth_headers: preAuthHeaders,
          },
        });
      } else {
        createMutation.mutate({
          ...formData,
          headers,
          pre_auth_headers: preAuthHeaders,
        });
      }
    } catch (error) {
      toast.error('JSON inválido', {
        description: 'Verifique o formato dos headers',
      });
    }
  };

  const handleEdit = (monitor: any) => {
    setFormData({
      name: monitor.name,
      description: monitor.description || '',
      url: monitor.url,
      method: monitor.method,
      headers: JSON.stringify(monitor.headers || {}),
      body: monitor.body || '',
      expected_status_code: monitor.expected_status_code,
      expected_response_pattern: monitor.expected_response_pattern || '',
      timeout_ms: monitor.timeout_ms,
      frequency_minutes: monitor.frequency_minutes,
      is_active: monitor.is_active,
      alert_on_failure: monitor.alert_on_failure,
      alert_threshold: monitor.alert_threshold,
      monitor_ssl: monitor.monitor_ssl,
      ssl_expiry_days_warning: monitor.ssl_expiry_days_warning,
      auto_create_ticket: monitor.auto_create_ticket,
      inverted_check: monitor.inverted_check,
      validation_mode: monitor.validation_mode,
      pre_auth_enabled: monitor.pre_auth_enabled || false,
      pre_auth_url: monitor.pre_auth_url || '',
      pre_auth_method: monitor.pre_auth_method || 'POST',
      pre_auth_body: monitor.pre_auth_body || '',
      pre_auth_headers: JSON.stringify(monitor.pre_auth_headers || {}),
      pre_auth_token_path: monitor.pre_auth_token_path || '',
      pre_auth_token_header_name: monitor.pre_auth_token_header_name || 'Authorization',
      pre_auth_token_prefix: monitor.pre_auth_token_prefix || 'Bearer ',
      mtls_enabled: monitor.mtls_enabled || false,
      mtls_client_cert: monitor.mtls_client_cert || '',
      mtls_client_key: monitor.mtls_client_key || '',
      mtls_ca_cert: monitor.mtls_ca_cert || '',
    });
    setEditingMonitor(monitor.id);
    setIsDialogOpen(true);
  };

  const selectedMonitorData = monitors?.find(m => m.id === selectedMonitor);
  const latestResult = results?.[0];
  const chartData = results?.slice(0, 50).reverse().map(r => ({
    time: new Date(r.checked_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    response_time: r.response_time_ms,
    success: r.success ? 1 : 0,
  }));

  const statsChartData = stats?.slice(0, 30).reverse().map(s => ({
    date: new Date(s.stat_date).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' }),
    avg_response: s.avg_response_time_ms,
    uptime: s.uptime_percentage,
    p95: s.p95_response_time_ms,
  }));

  const calculateUptime = () => {
    if (!results || results.length === 0) return 0;
    const successful = results.filter(r => r.success).length;
    return ((successful / results.length) * 100).toFixed(2);
  };

  const calculateAvgResponse = () => {
    if (!results || results.length === 0) return 0;
    const sum = results.reduce((acc, r) => acc + r.response_time_ms, 0);
    return Math.round(sum / results.length);
  };

  return (
    <div className="space-y-6">
      {monitorsLoading ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-10 w-32" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-48 mt-2" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
                <Activity className="h-8 w-8 text-primary" />
                Endpoint Monitoring
              </h2>
              <p className="text-muted-foreground mt-1">
                Monitor de disponibilidade e performance de endpoints
              </p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEditingMonitor(null);
                resetForm();
              }
            }}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Novo Monitor
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingMonitor ? 'Editar' : 'Criar'} Endpoint Monitor</DialogTitle>
              <DialogDescription>
                {editingMonitor ? 'Atualize as configurações do' : 'Configure um novo'} endpoint para monitoramento contínuo
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nome</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="API Production"
                  />
                </div>
                <div>
                  <Label>Método HTTP</Label>
                  <Select
                    value={formData.method}
                    onValueChange={(value) => setFormData({ ...formData, method: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                      <SelectItem value="PATCH">PATCH</SelectItem>
                      <SelectItem value="DELETE">DELETE</SelectItem>
                      <SelectItem value="HEAD">HEAD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>URL</Label>
                <Input
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="https://api.example.com/health"
                />
              </div>

              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="API principal de produção"
                />
              </div>

              <div>
                <Label>Headers (JSON)</Label>
                <Textarea
                  value={formData.headers}
                  onChange={(e) => setFormData({ ...formData, headers: e.target.value })}
                  placeholder='{"Authorization": "Bearer token"}'
                  rows={3}
                />
              </div>

              {['POST', 'PUT', 'PATCH'].includes(formData.method) && (
                <div>
                  <Label>Body</Label>
                  <Textarea
                    value={formData.body}
                    onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                    placeholder='{"key": "value"}'
                    rows={3}
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Status Esperado</Label>
                  <Input
                    type="number"
                    value={formData.expected_status_code}
                    onChange={(e) => setFormData({ ...formData, expected_status_code: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Timeout (ms)</Label>
                  <Input
                    type="number"
                    value={formData.timeout_ms}
                    onChange={(e) => setFormData({ ...formData, timeout_ms: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Frequência (min)</Label>
                  <Input
                    type="number"
                    value={formData.frequency_minutes}
                    onChange={(e) => setFormData({ ...formData, frequency_minutes: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div className="border-t pt-4 space-y-4">
                <h3 className="font-semibold text-sm">Modo de Validação</h3>
                
                <div>
                  <Label>Tipo de Validação</Label>
                  <Select value={formData.validation_mode} onValueChange={(value) => setFormData({ ...formData, validation_mode: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="status_code">Apenas Status Code</SelectItem>
                      <SelectItem value="response_body">Apenas Response Body</SelectItem>
                      <SelectItem value="both">Status Code + Response Body</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(formData.validation_mode === 'response_body' || formData.validation_mode === 'both') && (
                  <div>
                    <Label>Padrão de Resposta (Regex)</Label>
                    <Input
                      value={formData.expected_response_pattern}
                      onChange={(e) => setFormData({ ...formData, expected_response_pattern: e.target.value })}
                      placeholder='"status":"ok" ou use regex: ^OK$'
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between">
                  <Label>Ativo</Label>
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Alertar em Falha</Label>
                  <Switch
                    checked={formData.alert_on_failure}
                    onCheckedChange={(checked) => setFormData({ ...formData, alert_on_failure: checked })}
                  />
                </div>
              </div>

              {formData.alert_on_failure && (
                <div>
                  <Label>Falhas Consecutivas para Alerta</Label>
                  <Input
                    type="number"
                    value={formData.alert_threshold}
                    onChange={(e) => setFormData({ ...formData, alert_threshold: parseInt(e.target.value) })}
                  />
                </div>
              )}

              <div className="border-t pt-4 space-y-4">
                <h3 className="font-semibold text-sm">Monitoramento Avançado</h3>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Verificação Invertida</Label>
                    <p className="text-xs text-muted-foreground">
                      Garante que endpoint privado NÃO responda (sucesso = falha)
                    </p>
                  </div>
                  <Switch
                    checked={formData.inverted_check}
                    onCheckedChange={(checked) => setFormData({ ...formData, inverted_check: checked })}
                  />
                </div>
              </div>

              <div className="border-t pt-4 space-y-4">
                <h3 className="font-semibold text-sm">Monitoramento SSL</h3>
                
                <div className="flex items-center justify-between">
                  <Label>Monitorar SSL</Label>
                  <Switch
                    checked={formData.monitor_ssl}
                    onCheckedChange={(checked) => setFormData({ ...formData, monitor_ssl: checked })}
                  />
                </div>

                {formData.monitor_ssl && (
                  <>
                    <div>
                      <Label>Dias de Aviso Antes do Vencimento</Label>
                      <Input
                        type="number"
                        value={formData.ssl_expiry_days_warning}
                        onChange={(e) => setFormData({ ...formData, ssl_expiry_days_warning: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Criar Ticket Automático</Label>
                      <Switch
                        checked={formData.auto_create_ticket}
                        onCheckedChange={(checked) => setFormData({ ...formData, auto_create_ticket: checked })}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="border-t pt-4 space-y-4">
                <h3 className="font-semibold text-sm">Autenticação Prévia</h3>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Habilitar Autenticação Prévia</Label>
                    <p className="text-xs text-muted-foreground">
                      Chama um endpoint de autenticação antes de monitorar o endpoint principal
                    </p>
                  </div>
                  <Switch
                    checked={formData.pre_auth_enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, pre_auth_enabled: checked })}
                  />
                </div>

                {formData.pre_auth_enabled && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>URL de Autenticação</Label>
                        <Input
                          value={formData.pre_auth_url}
                          onChange={(e) => setFormData({ ...formData, pre_auth_url: e.target.value })}
                          placeholder="https://api.example.com/auth/login"
                        />
                      </div>
                      <div>
                        <Label>Método HTTP</Label>
                        <Select
                          value={formData.pre_auth_method}
                          onValueChange={(value) => setFormData({ ...formData, pre_auth_method: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="POST">POST</SelectItem>
                            <SelectItem value="GET">GET</SelectItem>
                            <SelectItem value="PUT">PUT</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label>Headers de Autenticação (JSON)</Label>
                      <Textarea
                        value={formData.pre_auth_headers}
                        onChange={(e) => setFormData({ ...formData, pre_auth_headers: e.target.value })}
                        placeholder='{"Content-Type": "application/json"}'
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label>Body de Autenticação (JSON)</Label>
                      <Textarea
                        value={formData.pre_auth_body}
                        onChange={(e) => setFormData({ ...formData, pre_auth_body: e.target.value })}
                        placeholder='{"username": "user", "password": "pass"}'
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Caminho do Token no Response</Label>
                        <Input
                          value={formData.pre_auth_token_path}
                          onChange={(e) => setFormData({ ...formData, pre_auth_token_path: e.target.value })}
                          placeholder="access_token ou data.token"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Use ponto (.) para acessar propriedades aninhadas
                        </p>
                      </div>
                      <div>
                        <Label>Nome do Header para Token</Label>
                        <Input
                          value={formData.pre_auth_token_header_name}
                          onChange={(e) => setFormData({ ...formData, pre_auth_token_header_name: e.target.value })}
                          placeholder="Authorization"
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Prefixo do Token</Label>
                      <Input
                        value={formData.pre_auth_token_prefix}
                        onChange={(e) => setFormData({ ...formData, pre_auth_token_prefix: e.target.value })}
                        placeholder="Bearer "
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Exemplo: "Bearer " resulta em "Bearer {'{token}'}"
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="border-t pt-4 space-y-4">
                <h3 className="font-semibold text-sm">Mutual TLS (mTLS)</h3>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Habilitar mTLS</Label>
                    <p className="text-xs text-muted-foreground">
                      Autentica usando certificados client-side (mutual TLS)
                    </p>
                  </div>
                  <Switch
                    checked={formData.mtls_enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, mtls_enabled: checked })}
                  />
                </div>

                {formData.mtls_enabled && (
                  <>
                    <div className="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-lg">
                      <p className="text-sm text-yellow-700 dark:text-yellow-400">
                        ⚠️ <strong>Atenção:</strong> Cole os certificados em formato PEM. Mantenha suas chaves privadas seguras.
                      </p>
                    </div>

                    <div>
                      <Label>Certificado do Cliente (PEM)</Label>
                      <Textarea
                        value={formData.mtls_client_cert}
                        onChange={(e) => setFormData({ ...formData, mtls_client_cert: e.target.value })}
                        placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDXTCCAkWgAwIBAgIJAKZ...&#10;-----END CERTIFICATE-----"
                        rows={6}
                        className="font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Certificado público do cliente em formato PEM
                      </p>
                    </div>

                    <div>
                      <Label>Chave Privada do Cliente (PEM)</Label>
                      <Textarea
                        value={formData.mtls_client_key}
                        onChange={(e) => setFormData({ ...formData, mtls_client_key: e.target.value })}
                        placeholder="-----BEGIN PRIVATE KEY-----&#10;MIIEvQIBADANBgkqhkiG9w0BAQ...&#10;-----END PRIVATE KEY-----"
                        rows={6}
                        className="font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Chave privada do cliente em formato PEM (mantida segura no banco)
                      </p>
                    </div>

                    <div>
                      <Label>Certificado CA (PEM) - Opcional</Label>
                      <Textarea
                        value={formData.mtls_ca_cert}
                        onChange={(e) => setFormData({ ...formData, mtls_ca_cert: e.target.value })}
                        placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDXTCCAkWgAwIBAgIJAKZ...&#10;-----END CERTIFICATE-----"
                        rows={6}
                        className="font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Certificado da CA (Autoridade Certificadora) se necessário
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsDialogOpen(false);
                setEditingMonitor(null);
                resetForm();
              }}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                {editingMonitor ? 'Atualizar' : 'Criar'} Monitor
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Lista de Monitors */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm">Monitors Ativos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {monitorsLoading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : monitors && monitors.length > 0 ? (
              monitors.map((monitor) => (
                <div
                  key={monitor.id}
                  className={`p-3 rounded-lg border transition-all ${
                    selectedMonitor === monitor.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:border-primary/50'
                  } ${!monitor.is_active ? 'opacity-60' : ''}`}
                >
                  <div 
                    className="cursor-pointer"
                    onClick={() => setSelectedMonitor(monitor.id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{monitor.name}</span>
                      {monitor.consecutive_failures > 0 ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {monitor.url}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">
                        {monitor.method}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {monitor.frequency_minutes}min
                      </span>
                      {!monitor.is_active && (
                        <Badge variant="secondary" className="text-xs">
                          Inativo
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-1 mt-2 pt-2 border-t">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(monitor);
                      }}
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleActiveMutation.mutate({
                          id: monitor.id,
                          is_active: !monitor.is_active,
                        });
                      }}
                    >
                      <Power className="h-3 w-3 mr-1" />
                      {monitor.is_active ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum monitor criado
              </p>
            )}
          </CardContent>
        </Card>

        {/* Dashboard Geral ou Detalhes do Monitor */}
        <div className="lg:col-span-3">
          {!selectedMonitor ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Dashboard Geral - Monitoramento de Endpoints</CardTitle>
                  <CardDescription>
                    Visão consolidada de todos os endpoints monitorados
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                      <div className="flex items-center gap-2 mb-2">
                        <Activity className="h-5 w-5 text-primary" />
                        <p className="text-sm text-muted-foreground">Total de Monitors</p>
                      </div>
                      <p className="text-3xl font-semibold">{monitors?.length || 0}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {monitors?.filter(m => m.is_active).length || 0} ativos
                      </p>
                    </div>
                    
                    <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/10">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <p className="text-sm text-muted-foreground">Healthy</p>
                      </div>
                      <p className="text-3xl font-semibold text-green-600">
                        {monitors?.filter(m => m.consecutive_failures === 0).length || 0}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {monitors?.length ? ((monitors.filter(m => m.consecutive_failures === 0).length / monitors.length) * 100).toFixed(1) : 0}% do total
                      </p>
                    </div>
                    
                    <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/10">
                      <div className="flex items-center gap-2 mb-2">
                        <XCircle className="h-5 w-5 text-red-600" />
                        <p className="text-sm text-muted-foreground">Com Falhas</p>
                      </div>
                      <p className="text-3xl font-semibold text-red-600">
                        {monitors?.filter(m => m.consecutive_failures > 0).length || 0}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Requerem atenção
                      </p>
                    </div>
                    
                    <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/10">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-5 w-5 text-blue-600" />
                        <p className="text-sm text-muted-foreground">Tempo Médio Geral</p>
                      </div>
                      {(() => {
                        const allAvgTimes = Object.values(latestResults || {})
                          .map((r: any) => r.avgResponseTime)
                          .filter((t): t is number => t !== undefined && t !== null);
                        
                        const allTrends = Object.values(latestResults || {})
                          .map((r: any) => r.trend);
                        
                        const overallAvg = allAvgTimes.length > 0
                          ? Math.round(allAvgTimes.reduce((sum, t) => sum + t, 0) / allAvgTimes.length)
                          : 0;
                        
                        const trendingUp = allTrends.filter(t => t === 'up').length;
                        const trendingDown = allTrends.filter(t => t === 'down').length;
                        const overallTrend = trendingUp > trendingDown ? 'up' : trendingDown > trendingUp ? 'down' : 'stable';
                        
                        return (
                          <>
                            <div className="flex items-baseline gap-2">
                              <p className="text-3xl font-semibold text-blue-600">{overallAvg}ms</p>
                              {overallTrend === 'up' && (
                                <TrendingUp className="h-5 w-5 text-red-500" />
                              )}
                              {overallTrend === 'down' && (
                                <TrendingUp className="h-5 w-5 text-green-500 rotate-180" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {overallTrend === 'up' && 'Latência aumentando'}
                              {overallTrend === 'down' && 'Latência diminuindo'}
                              {overallTrend === 'stable' && 'Latência estável'}
                            </p>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Status dos Endpoints</CardTitle>
                  <CardDescription>Lista completa de todos os endpoints monitorados</CardDescription>
                </CardHeader>
                <CardContent>
                  {monitors && monitors.length > 0 ? (
                    <div className="space-y-3">
                      {monitors.map((monitor) => {
                        const monitorData = latestResults?.[monitor.id];
                        const latestResult = monitorData?.latest;
                        
                        return (
                        <div
                          key={monitor.id}
                          className="p-4 rounded-lg border hover:border-primary/50 transition-all cursor-pointer"
                          onClick={() => setSelectedMonitor(monitor.id)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="flex items-center gap-2">
                                  {monitor.consecutive_failures === 0 ? (
                                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                                  ) : (
                                    <XCircle className="h-5 w-5 text-red-500" />
                                  )}
                                  <h3 className="font-semibold">{monitor.name}</h3>
                                </div>
                                <Badge variant={monitor.is_active ? "default" : "secondary"} className="text-xs">
                                  {monitor.is_active ? "Ativo" : "Inativo"}
                                </Badge>
                                {monitor.monitor_ssl && (
                                  <Badge variant="outline" className="text-xs flex items-center gap-1">
                                    <Shield className="h-3 w-3" />
                                    SSL
                                  </Badge>
                                )}
                                {monitor.monitor_ssl && latestResult?.ssl_days_until_expiry !== null && latestResult?.ssl_days_until_expiry !== undefined && (
                                  <Badge 
                                    variant={
                                      latestResult.ssl_days_until_expiry <= 7 ? "destructive" : 
                                      latestResult.ssl_days_until_expiry <= 30 ? "default" : 
                                      "outline"
                                    }
                                    className="text-xs"
                                  >
                                    {latestResult.ssl_days_until_expiry} dias
                                  </Badge>
                                )}
                                {monitorData?.avgResponseTime && (
                                  <Badge variant="outline" className="text-xs flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {monitorData.avgResponseTime}ms
                                    {monitorData.trend === 'up' && (
                                      <TrendingUp className="h-3 w-3 text-red-500" />
                                    )}
                                    {monitorData.trend === 'down' && (
                                      <TrendingUp className="h-3 w-3 text-green-500 rotate-180" />
                                    )}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">{monitor.url}</p>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Badge variant="outline" className="text-xs">{monitor.method}</Badge>
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Cada {monitor.frequency_minutes} min
                                </span>
                                {monitor.last_check_at && (
                                  <span>
                                    Último check: {new Date(monitor.last_check_at).toLocaleString('pt-BR')}
                                  </span>
                                )}
                                {monitorData?.trend && monitorData.trend !== 'stable' && (
                                  <span className={monitorData.trend === 'up' ? 'text-red-500' : 'text-green-500'}>
                                    {monitorData.trend === 'up' ? '↑' : '↓'} {Math.abs(monitorData.trendPercentage)}% latência
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              {monitor.consecutive_failures > 0 ? (
                                <div className="text-red-600">
                                  <p className="text-sm font-semibold">Falhas consecutivas</p>
                                  <p className="text-2xl font-semibold">{monitor.consecutive_failures}</p>
                                </div>
                              ) : (
                                <div className="text-green-600">
                                  <p className="text-sm font-semibold">Status</p>
                                  <p className="text-xl font-semibold">OK</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">Nenhum monitor configurado ainda</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Clique em "Novo Monitor" para começar
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : selectedMonitorData ? (
            <div>
              <div className="mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedMonitor(null)}
                  className="gap-2"
                >
                  ← Voltar ao Dashboard
                </Button>
              </div>
              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">Visão Geral</TabsTrigger>
                  <TabsTrigger value="performance">Performance</TabsTrigger>
                  <TabsTrigger value="history">Histórico</TabsTrigger>
                </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{selectedMonitorData.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {selectedMonitorData.url}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(selectedMonitorData)}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleActiveMutation.mutate({
                            id: selectedMonitor,
                            is_active: !selectedMonitorData.is_active,
                          })}
                        >
                          <Power className="h-4 w-4 mr-2" />
                          {selectedMonitorData.is_active ? 'Desativar' : 'Ativar'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => runCheckMutation.mutate(selectedMonitor)}
                          disabled={runCheckMutation.isPending}
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Executar Agora
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (confirm('Tem certeza que deseja excluir este monitor?')) {
                              deleteMutation.mutate(selectedMonitor);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Uptime (últimas 24h)</p>
                        <p className="text-2xl font-semibold text-green-600">{calculateUptime()}%</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Tempo Médio</p>
                        <p className="text-2xl font-semibold">{calculateAvgResponse()}ms</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Status Atual</p>
                        <Badge
                          variant={
                            selectedMonitorData.consecutive_failures === 0
                              ? 'default'
                              : 'destructive'
                          }
                        >
                          {selectedMonitorData.consecutive_failures === 0 ? 'Healthy' : 'Down'}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Último Check</p>
                        <p className="text-sm">
                          {selectedMonitorData.last_check_at
                            ? new Date(selectedMonitorData.last_check_at).toLocaleString('pt-BR')
                            : 'Nunca'}
                        </p>
                      </div>
                    </div>
                    
                    {selectedMonitorData.monitor_ssl && latestResult?.ssl_days_until_expiry !== null && latestResult?.ssl_days_until_expiry !== undefined && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">Certificado SSL</p>
                              <p className="text-xs text-muted-foreground">Validade do certificado</p>
                            </div>
                          </div>
                          <Badge 
                            variant={
                              latestResult.ssl_days_until_expiry <= 7 ? "destructive" : 
                              latestResult.ssl_days_until_expiry <= 30 ? "default" : 
                              "outline"
                            }
                            className="text-lg px-4 py-1"
                          >
                            {latestResult.ssl_days_until_expiry} dias restantes
                          </Badge>
                        </div>
                        {latestResult.ssl_error && (
                          <p className="text-xs text-destructive mt-2">
                            Erro SSL: {latestResult.ssl_error}
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Tempo de Resposta (Últimos 50 checks)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="time" />
                        <YAxis label={{ value: 'ms', angle: -90, position: 'insideLeft' }} />
                        <Tooltip />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="response_time"
                          stroke="#8b5cf6"
                          fill="#8b5cf6"
                          fillOpacity={0.3}
                          name="Tempo de Resposta (ms)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="performance" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Estatísticas Diárias (Últimos 30 dias)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={statsChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis yAxisId="left" label={{ value: 'ms', angle: -90, position: 'insideLeft' }} />
                        <YAxis yAxisId="right" orientation="right" label={{ value: '%', angle: 90, position: 'insideRight' }} />
                        <Tooltip />
                        <Legend />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="avg_response"
                          stroke="#8b5cf6"
                          name="Média (ms)"
                        />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="p95"
                          stroke="#f59e0b"
                          name="P95 (ms)"
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="uptime"
                          stroke="#10b981"
                          name="Uptime (%)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-3 gap-4">
                  {stats && stats[0] && (
                    <>
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">P50</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-2xl font-semibold">{stats[0].p50_response_time_ms}ms</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">P95</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-2xl font-semibold">{stats[0].p95_response_time_ms}ms</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">P99</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-2xl font-semibold">{stats[0].p99_response_time_ms}ms</p>
                        </CardContent>
                      </Card>
                    </>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="history" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Últimos Checks</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                      {results?.map((result) => (
                        <div
                          key={result.id}
                          className="flex items-center justify-between p-3 rounded-lg border hover:border-primary/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {result.success ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-500" />
                            )}
                            <div>
                              <p className="text-sm font-medium">
                                {new Date(result.checked_at).toLocaleString('pt-BR')}
                              </p>
                              {result.error_message && (
                                <p className="text-xs text-red-600 flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  {result.error_message}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <Badge variant="outline">{result.status_code || 'N/A'}</Badge>
                            <div className="text-right">
                              <p className="text-sm font-semibold">{result.response_time_ms}ms</p>
                              <p className="text-xs text-muted-foreground">Response Time</p>
                            </div>
                            {!result.success && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedErrorResult(result);
                                  setIsErrorDialogOpen(true);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
            </div>
          ) : null}
        </div>
      </div>

      {/* Error Details Dialog */}
      <Dialog open={isErrorDialogOpen} onOpenChange={setIsErrorDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Detalhes do Erro - Endpoint Monitoring
            </DialogTitle>
            <DialogDescription>
              Informações completas da requisição e resposta com erro
            </DialogDescription>
          </DialogHeader>
          
          {selectedErrorResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Data/Hora</h4>
                  <p className="text-sm text-muted-foreground">
                    {new Date(selectedErrorResult.checked_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Status Code</h4>
                  <Badge variant="destructive" className="w-fit">
                    {selectedErrorResult.status_code || 'N/A'}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Tempo de Resposta</h4>
                  <p className="text-sm">{selectedErrorResult.response_time_ms}ms</p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Sucesso</h4>
                  <Badge variant={selectedErrorResult.success ? 'default' : 'destructive'}>
                    {selectedErrorResult.success ? 'Sim' : 'Não'}
                  </Badge>
                </div>
              </div>

              {selectedErrorResult.error_message && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Mensagem de Erro</h4>
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                    <p className="text-sm text-destructive">{selectedErrorResult.error_message}</p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Métricas de Rede</h4>
                <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-md">
                  <div>
                    <p className="text-xs text-muted-foreground">DNS Time</p>
                    <p className="text-sm font-medium">{selectedErrorResult.dns_time_ms || 0}ms</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">TCP Time</p>
                    <p className="text-sm font-medium">{selectedErrorResult.tcp_time_ms || 0}ms</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">TLS Time</p>
                    <p className="text-sm font-medium">{selectedErrorResult.tls_time_ms || 0}ms</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">TTFB</p>
                    <p className="text-sm font-medium">{selectedErrorResult.ttfb_ms || 0}ms</p>
                  </div>
                </div>
              </div>

              {selectedErrorResult.response_headers && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Response Headers</h4>
                  <pre className="p-3 bg-muted rounded-md text-xs overflow-x-auto">
                    {JSON.stringify(selectedErrorResult.response_headers, null, 2)}
                  </pre>
                </div>
              )}

              {selectedErrorResult.response_body && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Response Body</h4>
                  <pre className="p-3 bg-muted rounded-md text-xs overflow-x-auto max-h-[300px] overflow-y-auto">
                    {selectedErrorResult.response_body}
                  </pre>
                </div>
              )}

              {selectedErrorResult.ssl_error && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Erro SSL
                  </h4>
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                    <p className="text-sm text-destructive">{selectedErrorResult.ssl_error}</p>
                    {selectedErrorResult.ssl_days_until_expiry !== null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Dias até expiração: {selectedErrorResult.ssl_days_until_expiry}
                      </p>
                    )}
                  </div>
                </div>
               )}
            </div>
          )}
        </DialogContent>
      </Dialog>
        </>
      )}
    </div>
  );
}
