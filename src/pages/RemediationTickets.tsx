/**
 * Remediation Tickets Page v2.0
 * Features: List view, Create ticket, SLA indicators, Filters
 * Design: Light theme matching Executive Dashboard (#003C7D accent, #F9FAFB background)
 */

import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { Layout } from "@/components/Layout";
import { 
  Ticket, Plus, RefreshCw, Clock, CheckCircle, XCircle, User, Calendar,
  MessageSquare, AlertTriangle, Paperclip, ListChecks, Timer, AlertCircle,
  Search, Filter, ChevronRight, ArrowUpRight, Shield, DollarSign, Settings,
  Zap, TrendingUp
} from "lucide-react";

// ==================== TYPES ====================

interface RemediationTicket {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'pending_review' | 'blocked' | 'resolved' | 'closed' | 'cancelled' | 'reopened';
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
  sla_due_at: string | null;
  sla_breached: boolean;
  first_response_at: string | null;
  escalation_level: number;
  _count?: {
    comments: number;
    checklist_items: number;
    attachments: number;
  };
}

// ==================== CONSTANTS ====================

const SEVERITY_CONFIG = {
  critical: { color: 'bg-red-500', textColor: 'text-red-700', bgLight: 'bg-red-50', label: 'Crítico' },
  high: { color: 'bg-orange-500', textColor: 'text-orange-700', bgLight: 'bg-orange-50', label: 'Alto' },
  medium: { color: 'bg-yellow-500', textColor: 'text-yellow-700', bgLight: 'bg-yellow-50', label: 'Médio' },
  low: { color: 'bg-green-500', textColor: 'text-green-700', bgLight: 'bg-green-50', label: 'Baixo' },
};

const STATUS_CONFIG = {
  open: { color: 'bg-blue-500', label: 'Aberto', icon: AlertCircle },
  in_progress: { color: 'bg-purple-500', label: 'Em Progresso', icon: Zap },
  pending_review: { color: 'bg-yellow-500', label: 'Aguardando Revisão', icon: Clock },
  blocked: { color: 'bg-red-500', label: 'Bloqueado', icon: XCircle },
  resolved: { color: 'bg-green-500', label: 'Resolvido', icon: CheckCircle },
  closed: { color: 'bg-gray-500', label: 'Fechado', icon: CheckCircle },
  cancelled: { color: 'bg-gray-400', label: 'Cancelado', icon: XCircle },
  reopened: { color: 'bg-orange-500', label: 'Reaberto', icon: AlertTriangle },
};

const CATEGORY_CONFIG = {
  security: { icon: Shield, label: 'Segurança', color: 'text-red-600' },
  compliance: { icon: CheckCircle, label: 'Compliance', color: 'text-blue-600' },
  cost_optimization: { icon: DollarSign, label: 'Otimização de Custos', color: 'text-green-600' },
  performance: { icon: Zap, label: 'Performance', color: 'text-purple-600' },
  configuration: { icon: Settings, label: 'Configuração', color: 'text-gray-600' },
};

const PRIORITY_CONFIG = {
  urgent: { color: 'bg-red-600', label: 'Urgente' },
  high: { color: 'bg-orange-500', label: 'Alta' },
  medium: { color: 'bg-yellow-500', label: 'Média' },
  low: { color: 'bg-green-500', label: 'Baixa' },
};

// ==================== HELPER FUNCTIONS ====================

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(dateString: string | null): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSlaStatus(ticket: RemediationTicket): { status: string; color: string; label: string } {
  if (!ticket.sla_due_at) return { status: 'no_sla', color: 'text-gray-400', label: 'Sem SLA' };
  if (ticket.sla_breached) return { status: 'breached', color: 'text-red-600', label: 'SLA Violado' };
  
  const now = new Date();
  const dueAt = new Date(ticket.sla_due_at);
  const hoursRemaining = (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  if (hoursRemaining < 0) return { status: 'breached', color: 'text-red-600', label: 'SLA Violado' };
  if (hoursRemaining < 2) return { status: 'at_risk', color: 'text-orange-600', label: 'Em Risco' };
  return { status: 'on_track', color: 'text-green-600', label: 'No Prazo' };
}

function getTimeRemaining(dateString: string | null): string {
  if (!dateString) return '-';
  const now = new Date();
  const target = new Date(dateString);
  const diff = target.getTime() - now.getTime();
  
  if (diff < 0) {
    const hours = Math.abs(Math.floor(diff / (1000 * 60 * 60)));
    return `${hours}h atrasado`;
  }
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h restantes`;
  const days = Math.floor(hours / 24);
  return `${days}d restantes`;
}


// ==================== TICKET CARD COMPONENT ====================

function TicketCard({ ticket, onClick }: { ticket: RemediationTicket; onClick: () => void }) {
  const slaStatus = getSlaStatus(ticket);
  const StatusIcon = STATUS_CONFIG[ticket.status]?.icon || AlertCircle;
  const CategoryIcon = CATEGORY_CONFIG[ticket.category]?.icon || Settings;
  
  return (
    <div 
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md hover:border-[#003C7D]/20 transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Main Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${SEVERITY_CONFIG[ticket.severity]?.color}`} />
            <span className="text-xs font-medium text-gray-500 uppercase">
              {ticket.id.slice(0, 8)}
            </span>
            <Badge variant="outline" className={`text-xs ${CATEGORY_CONFIG[ticket.category]?.color}`}>
              <CategoryIcon className="h-3 w-3 mr-1" />
              {CATEGORY_CONFIG[ticket.category]?.label}
            </Badge>
          </div>
          
          <h3 className="font-medium text-[#1F2937] mb-1 line-clamp-1 group-hover:text-[#003C7D] transition-colors">
            {ticket.title}
          </h3>
          
          <p className="text-sm text-gray-500 line-clamp-2 mb-3">
            {ticket.description || 'Sem descrição'}
          </p>
          
          {/* Meta Info */}
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(ticket.created_at)}
            </span>
            {ticket.assigned_to && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                Atribuído
              </span>
            )}
            {ticket._count && (
              <>
                {ticket._count.comments > 0 && (
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {ticket._count.comments}
                  </span>
                )}
                {ticket._count.checklist_items > 0 && (
                  <span className="flex items-center gap-1">
                    <ListChecks className="h-3 w-3" />
                    {ticket._count.checklist_items}
                  </span>
                )}
                {ticket._count.attachments > 0 && (
                  <span className="flex items-center gap-1">
                    <Paperclip className="h-3 w-3" />
                    {ticket._count.attachments}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        
        {/* Right: Status & SLA */}
        <div className="flex flex-col items-end gap-2">
          <Badge className={`${STATUS_CONFIG[ticket.status]?.color} text-white text-xs`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {STATUS_CONFIG[ticket.status]?.label}
          </Badge>
          
          <Badge variant="outline" className={`${PRIORITY_CONFIG[ticket.priority]?.color} text-white text-xs`}>
            {PRIORITY_CONFIG[ticket.priority]?.label}
          </Badge>
          
          {ticket.sla_due_at && (
            <div className={`flex items-center gap-1 text-xs ${slaStatus.color}`}>
              <Timer className="h-3 w-3" />
              <span>{getTimeRemaining(ticket.sla_due_at)}</span>
            </div>
          )}
          
          <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-[#003C7D] transition-colors" />
        </div>
      </div>
    </div>
  );
}


// ==================== STATS CARDS ====================

function StatsCards({ tickets }: { tickets: RemediationTicket[] }) {
  const stats = useMemo(() => {
    const open = tickets.filter(t => ['open', 'in_progress', 'pending_review', 'blocked', 'reopened'].includes(t.status)).length;
    const resolved = tickets.filter(t => ['resolved', 'closed'].includes(t.status)).length;
    const breached = tickets.filter(t => t.sla_breached).length;
    const critical = tickets.filter(t => t.severity === 'critical' && !['resolved', 'closed', 'cancelled'].includes(t.status)).length;
    
    return { open, resolved, breached, critical, total: tickets.length };
  }, [tickets]);
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <AlertCircle className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-semibold text-[#1F2937]">{stats.open}</p>
            <p className="text-xs text-gray-500">Tickets Abertos</p>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-lg">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-semibold text-[#1F2937]">{stats.resolved}</p>
            <p className="text-xs text-gray-500">Resolvidos</p>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-50 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <p className="text-2xl font-semibold text-[#1F2937]">{stats.critical}</p>
            <p className="text-xs text-gray-500">Críticos</p>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-50 rounded-lg">
            <Timer className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <p className="text-2xl font-semibold text-[#1F2937]">{stats.breached}</p>
            <p className="text-xs text-gray-500">SLA Violado</p>
          </div>
        </div>
      </div>
    </div>
  );
}


// ==================== CREATE TICKET DIALOG ====================

function CreateTicketDialog({ 
  open, 
  onOpenChange, 
  onSuccess 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    severity: 'medium' as const,
    priority: 'medium' as const,
    category: 'security' as const,
    estimated_effort_hours: 0,
    business_impact: '',
    due_date: '',
  });
  
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiClient.post('/api/functions/mutate-table', {
        table: 'remediation_tickets',
        operation: 'insert',
        data: {
          ...data,
          status: 'open',
          due_date: data.due_date ? new Date(data.due_date).toISOString() : null,
        },
      });
      return response.data;
    },
    onSuccess: () => {
      toast({ title: 'Ticket criado com sucesso', variant: 'default' });
      onOpenChange(false);
      onSuccess();
      setFormData({
        title: '',
        description: '',
        severity: 'medium',
        priority: 'medium',
        category: 'security',
        estimated_effort_hours: 0,
        business_impact: '',
        due_date: '',
      });
    },
    onError: (err) => {
      toast({ title: 'Erro ao criar ticket', description: getErrorMessage(err), variant: 'destructive' });
    },
  });
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-[#003C7D]" />
            Criar Novo Ticket
          </DialogTitle>
          <DialogDescription>
            Crie um ticket de remediação para rastrear e resolver problemas
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              placeholder="Descreva brevemente o problema"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              placeholder="Detalhes do problema, impacto, recursos afetados..."
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Severidade</Label>
              <Select value={formData.severity} onValueChange={(v: any) => setFormData({ ...formData, severity: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Crítico</SelectItem>
                  <SelectItem value="high">Alto</SelectItem>
                  <SelectItem value="medium">Médio</SelectItem>
                  <SelectItem value="low">Baixo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select value={formData.priority} onValueChange={(v: any) => setFormData({ ...formData, priority: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgente</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={formData.category} onValueChange={(v: any) => setFormData({ ...formData, category: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="security">Segurança</SelectItem>
                  <SelectItem value="compliance">Compliance</SelectItem>
                  <SelectItem value="cost_optimization">Otimização de Custos</SelectItem>
                  <SelectItem value="performance">Performance</SelectItem>
                  <SelectItem value="configuration">Configuração</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Data Limite</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Esforço Estimado (horas)</Label>
              <Input
                type="number"
                min={0}
                value={formData.estimated_effort_hours}
                onChange={(e) => setFormData({ ...formData, estimated_effort_hours: parseInt(e.target.value) || 0 })}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Impacto no Negócio</Label>
              <Input
                placeholder="Ex: Afeta produção, compliance..."
                value={formData.business_impact}
                onChange={(e) => setFormData({ ...formData, business_impact: e.target.value })}
              />
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={() => createMutation.mutate(formData)}
            disabled={!formData.title || createMutation.isPending}
            className="bg-[#003C7D] hover:bg-[#002d5c]"
          >
            {createMutation.isPending ? 'Criando...' : 'Criar Ticket'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ==================== MAIN PAGE COMPONENT ====================

export default function RemediationTickets() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedAccount } = useCloudAccount();
  
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  
  // Fetch tickets
  const { data: ticketsData, isLoading, refetch } = useQuery({
    queryKey: ['remediation-tickets', selectedAccount?.id],
    queryFn: async () => {
      const response = await apiClient.post('/api/functions/query-table', {
        table: 'remediation_tickets',
        orderBy: { created_at: 'desc' },
        include: {
          _count: {
            select: {
              comments: true,
              checklist_items: true,
              attachments: true,
            },
          },
        },
      });
      return response.data;
    },
  });
  
  const tickets: RemediationTicket[] = ticketsData?.data || [];
  
  // Filter tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter(ticket => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!ticket.title.toLowerCase().includes(query) && 
            !ticket.description?.toLowerCase().includes(query) &&
            !ticket.id.toLowerCase().includes(query)) {
          return false;
        }
      }
      
      // Status filter
      if (statusFilter !== 'all' && ticket.status !== statusFilter) return false;
      
      // Severity filter
      if (severityFilter !== 'all' && ticket.severity !== severityFilter) return false;
      
      // Category filter
      if (categoryFilter !== 'all' && ticket.category !== categoryFilter) return false;
      
      return true;
    });
  }, [tickets, searchQuery, statusFilter, severityFilter, categoryFilter]);
  
  const handleTicketClick = (ticketId: string) => {
    navigate(`/tickets/${ticketId}`);
  };
  
  return (
    <Layout
      title={t('tickets.title', 'Tickets de Remediação')}
      description={t('tickets.description', 'Gerencie e acompanhe tickets de remediação de segurança e compliance')}
      icon={<Ticket className="h-4 w-4 text-white" />}
    >
      <div className="space-y-6">
        {/* Stats Cards */}
        {!isLoading && tickets.length > 0 && <StatsCards tickets={tickets} />}
        
        {/* Header Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar tickets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="glass hover-glow"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            
            <Button
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
              className="bg-[#003C7D] hover:bg-[#002d5c]"
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo Ticket
            </Button>
          </div>
        </div>
        
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-500">Filtros:</span>
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-8 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="open">Aberto</SelectItem>
              <SelectItem value="in_progress">Em Progresso</SelectItem>
              <SelectItem value="pending_review">Aguardando Revisão</SelectItem>
              <SelectItem value="blocked">Bloqueado</SelectItem>
              <SelectItem value="resolved">Resolvido</SelectItem>
              <SelectItem value="closed">Fechado</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[140px] h-8 text-sm">
              <SelectValue placeholder="Severidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="critical">Crítico</SelectItem>
              <SelectItem value="high">Alto</SelectItem>
              <SelectItem value="medium">Médio</SelectItem>
              <SelectItem value="low">Baixo</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px] h-8 text-sm">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="security">Segurança</SelectItem>
              <SelectItem value="compliance">Compliance</SelectItem>
              <SelectItem value="cost_optimization">Custos</SelectItem>
              <SelectItem value="performance">Performance</SelectItem>
              <SelectItem value="configuration">Configuração</SelectItem>
            </SelectContent>
          </Select>
          
          {(statusFilter !== 'all' || severityFilter !== 'all' || categoryFilter !== 'all' || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter('all');
                setSeverityFilter('all');
                setCategoryFilter('all');
                setSearchQuery('');
              }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Limpar filtros
            </Button>
          )}
        </div>
        
        {/* Tickets List */}
        <div className="space-y-3">
          {isLoading ? (
            // Loading skeletons
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-2 w-2 rounded-full" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-5 w-24" />
                    </div>
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <div className="flex gap-4">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Skeleton className="h-6 w-24" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                </div>
              </div>
            ))
          ) : filteredTickets.length === 0 ? (
            <Card className="glass border-primary/20">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Ticket className="h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-600 mb-2">
                  {tickets.length === 0 ? 'Nenhum ticket encontrado' : 'Nenhum ticket corresponde aos filtros'}
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                  {tickets.length === 0 
                    ? 'Crie seu primeiro ticket de remediação'
                    : 'Tente ajustar os filtros de busca'}
                </p>
                {tickets.length === 0 && (
                  <Button onClick={() => setCreateDialogOpen(true)} className="bg-[#003C7D] hover:bg-[#002d5c]">
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Ticket
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            filteredTickets.map(ticket => (
              <TicketCard 
                key={ticket.id} 
                ticket={ticket} 
                onClick={() => handleTicketClick(ticket.id)} 
              />
            ))
          )}
        </div>
        
        {/* Results count */}
        {!isLoading && filteredTickets.length > 0 && (
          <p className="text-sm text-gray-400 text-center">
            Mostrando {filteredTickets.length} de {tickets.length} tickets
          </p>
        )}
      </div>
      
      {/* Create Ticket Dialog */}
      <CreateTicketDialog 
        open={createDialogOpen} 
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => refetch()}
      />
    </Layout>
  );
}