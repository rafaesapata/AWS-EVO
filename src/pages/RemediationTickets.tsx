import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { Layout } from "@/components/Layout";
import { 
  Ticket, 
  Plus, 
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  User,
  Calendar,
  MessageSquare,
  Settings,
  Play,
  Pause
} from "lucide-react";

interface RemediationTicket {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'cancelled';
  priority: 'urgent' | 'high' | 'medium' | 'low';
  category: 'security' | 'compliance' | 'cost_optimization' | 'performance' | 'configuration';
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  due_date: string | null;
  resolution_notes: string | null;
  affected_resources: string[];
  automation_available: boolean;
  estimated_effort_hours: number;
  business_impact: string;
}

interface TicketComment {
  id: string;
  ticket_id: string;
  user_id: string;
  user_name: string;
  comment: string;
  created_at: string;
}

export default function RemediationTickets() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedAccountId } = useAwsAccount();
  const { data: organizationId } = useOrganization();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [newTicket, setNewTicket] = useState({
    title: '',
    description: '',
    severity: 'medium' as const,
    priority: 'medium' as const,
    category: 'security' as const,
    due_date: '',
    business_impact: '',
    estimated_effort_hours: 0,
    affected_resources: [] as string[]
  });

  // Get remediation tickets
  const { data: tickets, isLoading, refetch } = useQuery({
    queryKey: ['remediation-tickets', organizationId, selectedAccountId, selectedStatus, selectedSeverity],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 1 * 60 * 1000,
    queryFn: async () => {
      let filters: any = { 
        organization_id: organizationId,
        aws_account_id: selectedAccountId
      };

      if (selectedStatus !== 'all') {
        filters.status = selectedStatus;
      }

      if (selectedSeverity !== 'all') {
        filters.severity = selectedSeverity;
      }

      const response = await apiClient.select('remediation_tickets', {
        select: '*',
        eq: filters,
        order: { created_at: 'desc' }
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data || [];
    },
  });

  // Create ticket
  const createTicketMutation = useMutation({
    mutationFn: async (ticketData: typeof newTicket) => {
      const response = await apiClient.insert('remediation_tickets', {
        ...ticketData,
        organization_id: organizationId,
        aws_account_id: selectedAccountId,
        status: 'open',
        created_by: 'current_user', // Replace with actual user ID
        automation_available: false
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Ticket criado",
        description: "O ticket de remediação foi criado com sucesso.",
      });
      setIsCreateDialogOpen(false);
      setNewTicket({
        title: '',
        description: '',
        severity: 'medium',
        priority: 'medium',
        category: 'security',
        due_date: '',
        business_impact: '',
        estimated_effort_hours: 0,
        affected_resources: []
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar ticket",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  });

  // Update ticket status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiClient.update('remediation_tickets', {
        status,
        updated_at: new Date().toISOString()
      }, { id });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Status atualizado",
        description: "O status do ticket foi atualizado com sucesso.",
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  });

  const handleCreateTicket = () => {
    if (!newTicket.title || !newTicket.description) {
      toast({
        title: "Campos obrigatórios",
        description: "Título e descrição são obrigatórios.",
        variant: "destructive"
      });
      return;
    }

    createTicketMutation.mutate(newTicket);
  };

  const handleRefresh = async () => {
    try {
      await refetch();
      toast({
        title: "Dados atualizados",
        description: "Os tickets foram atualizados.",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar os dados.",
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open': return <Badge variant="outline">Aberto</Badge>;
      case 'in_progress': return <Badge className="bg-blue-500">Em Progresso</Badge>;
      case 'resolved': return <Badge className="bg-green-500">Resolvido</Badge>;
      case 'closed': return <Badge variant="secondary">Fechado</Badge>;
      case 'cancelled': return <Badge variant="destructive">Cancelado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive">Crítico</Badge>;
      case 'high': return <Badge variant="destructive">Alto</Badge>;
      case 'medium': return <Badge variant="secondary">Médio</Badge>;
      case 'low': return <Badge variant="outline">Baixo</Badge>;
      default: return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent': return <Badge variant="destructive">Urgente</Badge>;
      case 'high': return <Badge className="bg-orange-500">Alta</Badge>;
      case 'medium': return <Badge variant="secondary">Média</Badge>;
      case 'low': return <Badge variant="outline">Baixa</Badge>;
      default: return <Badge variant="outline">{priority}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <Clock className="h-4 w-4 text-blue-500" />;
      case 'in_progress': return <Play className="h-4 w-4 text-yellow-500" />;
      case 'resolved': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'closed': return <XCircle className="h-4 w-4 text-gray-500" />;
      case 'cancelled': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  // Calculate summary metrics
  const totalTickets = tickets?.length || 0;
  const openTickets = tickets?.filter(t => t.status === 'open').length || 0;
  const inProgressTickets = tickets?.filter(t => t.status === 'in_progress').length || 0;
  const criticalTickets = tickets?.filter(t => t.severity === 'critical').length || 0;
  const overdueTickets = tickets?.filter(t => 
    t.due_date && new Date(t.due_date) < new Date() && !['resolved', 'closed'].includes(t.status)
  ).length || 0;

  const categories = [
    { value: 'security', label: 'Segurança' },
    { value: 'compliance', label: 'Compliance' },
    { value: 'cost_optimization', label: 'Otimização de Custos' },
    { value: 'performance', label: 'Performance' },
    { value: 'configuration', label: 'Configuração' }
  ];

  return (
    <Layout 
      title="Tickets de Remediação" 
      description="Sistema de workflow para rastreamento e resolução de problemas"
      icon={<Ticket className="h-5 w-5 text-white" />}
    >
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">{totalTickets}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Abertos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-blue-500">{openTickets}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Em Progresso</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-yellow-500">{inProgressTickets}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Críticos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-red-500">{criticalTickets}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Atrasados</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-red-600">{overdueTickets}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="glass border-primary/20">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="glass">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="open">Aberto</SelectItem>
                <SelectItem value="in_progress">Em Progresso</SelectItem>
                <SelectItem value="resolved">Resolvido</SelectItem>
                <SelectItem value="closed">Fechado</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
              <SelectTrigger className="glass">
                <SelectValue placeholder="Filtrar por severidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Severidades</SelectItem>
                <SelectItem value="critical">Crítica</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tickets List */}
      <Card className="glass border-primary/20">
        <CardHeader>
          <CardTitle>Lista de Tickets</CardTitle>
          <CardDescription>Todos os tickets de remediação</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : tickets && tickets.length > 0 ? (
            <div className="space-y-4">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {getStatusIcon(ticket.status)}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-sm">{ticket.title}</h4>
                          {getSeverityBadge(ticket.severity)}
                          {getPriorityBadge(ticket.priority)}
                        </div>
                        <p className="text-sm text-muted-foreground">{ticket.description}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span>Criado por: {ticket.created_by}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{new Date(ticket.created_at).toLocaleDateString('pt-BR')}</span>
                          </div>
                          {ticket.due_date && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>Vence: {new Date(ticket.due_date).toLocaleDateString('pt-BR')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right space-y-2">
                      {getStatusBadge(ticket.status)}
                      <div className="text-sm text-muted-foreground">
                        {ticket.category.replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                  
                  {ticket.business_impact && (
                    <div className="bg-muted/30 rounded p-3">
                      <p className="text-sm font-medium mb-1">Impacto no Negócio:</p>
                      <p className="text-sm text-muted-foreground">{ticket.business_impact}</p>
                    </div>
                  )}
                  
                  {ticket.affected_resources && ticket.affected_resources.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Recursos Afetados:</p>
                      <div className="flex gap-2 flex-wrap">
                        {ticket.affected_resources.map((resource, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {resource}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm">
                      {ticket.estimated_effort_hours > 0 && (
                        <span className="text-muted-foreground">
                          Esforço: {ticket.estimated_effort_hours}h
                        </span>
                      )}
                      {ticket.automation_available && (
                        <Badge variant="outline" className="gap-1">
                          <Settings className="h-3 w-3" />
                          Automação Disponível
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {ticket.status === 'open' && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => updateStatusMutation.mutate({ id: ticket.id, status: 'in_progress' })}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Iniciar
                        </Button>
                      )}
                      {ticket.status === 'in_progress' && (
                        <Button 
                          size="sm"
                          onClick={() => updateStatusMutation.mutate({ id: ticket.id, status: 'resolved' })}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Resolver
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Ticket className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">Nenhum ticket encontrado</h3>
              <p className="text-muted-foreground mb-4">
                {selectedStatus !== 'all' || selectedSeverity !== 'all' 
                  ? 'Nenhum ticket corresponde aos filtros aplicados.'
                  : 'Crie seu primeiro ticket de remediação.'
                }
              </p>
              {selectedStatus === 'all' && selectedSeverity === 'all' && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeiro Ticket
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Ticket Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Criar Novo Ticket</DialogTitle>
            <DialogDescription>
              Crie um novo ticket de remediação para rastrear problemas
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={newTicket.title}
                onChange={(e) => setNewTicket(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Título do problema"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={newTicket.description}
                onChange={(e) => setNewTicket(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descreva o problema detalhadamente"
                rows={4}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="severity">Severidade</Label>
                <Select value={newTicket.severity} onValueChange={(value: any) => setNewTicket(prev => ({ ...prev, severity: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="critical">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Prioridade</Label>
                <Select value={newTicket.priority} onValueChange={(value: any) => setNewTicket(prev => ({ ...prev, priority: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Categoria</Label>
                <Select value={newTicket.category} onValueChange={(value: any) => setNewTicket(prev => ({ ...prev, category: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="due_date">Data de Vencimento</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={newTicket.due_date}
                  onChange={(e) => setNewTicket(prev => ({ ...prev, due_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="effort">Esforço Estimado (horas)</Label>
                <Input
                  id="effort"
                  type="number"
                  value={newTicket.estimated_effort_hours}
                  onChange={(e) => setNewTicket(prev => ({ ...prev, estimated_effort_hours: Number(e.target.value) }))}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="business_impact">Impacto no Negócio</Label>
              <Textarea
                id="business_impact"
                value={newTicket.business_impact}
                onChange={(e) => setNewTicket(prev => ({ ...prev, business_impact: e.target.value }))}
                placeholder="Descreva o impacto no negócio"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateTicket} disabled={createTicketMutation.isPending}>
              {createTicketMutation.isPending ? 'Criando...' : 'Criar Ticket'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </Layout>
  );
}