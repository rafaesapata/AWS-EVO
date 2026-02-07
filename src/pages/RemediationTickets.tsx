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
  critical: { color: 'bg-red-500', textColor: 'text-red-700', bgLight: 'bg-red-50', labelKey: 'tickets.severity.critical' },
  high: { color: 'bg-orange-500', textColor: 'text-orange-700', bgLight: 'bg-orange-50', labelKey: 'tickets.severity.high' },
  medium: { color: 'bg-yellow-500', textColor: 'text-yellow-700', bgLight: 'bg-yellow-50', labelKey: 'tickets.severity.medium' },
  low: { color: 'bg-green-500', textColor: 'text-green-700', bgLight: 'bg-green-50', labelKey: 'tickets.severity.low' },
};

const STATUS_CONFIG = {
  open: { color: 'bg-blue-500', labelKey: 'tickets.status.open', icon: AlertCircle },
  in_progress: { color: 'bg-purple-500', labelKey: 'tickets.status.in_progress', icon: Zap },
  pending_review: { color: 'bg-yellow-500', labelKey: 'tickets.status.pending_review', icon: Clock },
  blocked: { color: 'bg-red-500', labelKey: 'tickets.status.blocked', icon: XCircle },
  resolved: { color: 'bg-green-500', labelKey: 'tickets.status.resolved', icon: CheckCircle },
  closed: { color: 'bg-gray-500', labelKey: 'tickets.status.closed', icon: CheckCircle },
  cancelled: { color: 'bg-gray-400', labelKey: 'tickets.status.cancelled', icon: XCircle },
  reopened: { color: 'bg-orange-500', labelKey: 'tickets.status.reopened', icon: AlertTriangle },
};

const CATEGORY_CONFIG = {
  security: { icon: Shield, labelKey: 'tickets.category.security', color: 'text-red-600' },
  compliance: { icon: CheckCircle, labelKey: 'tickets.category.compliance', color: 'text-blue-600' },
  cost_optimization: { icon: DollarSign, labelKey: 'tickets.category.cost_optimization', color: 'text-green-600' },
  performance: { icon: Zap, labelKey: 'tickets.category.performance', color: 'text-purple-600' },
  configuration: { icon: Settings, labelKey: 'tickets.category.configuration', color: 'text-gray-600' },
};

const PRIORITY_CONFIG = {
  urgent: { color: 'bg-red-600', labelKey: 'tickets.priority.urgent' },
  high: { color: 'bg-orange-500', labelKey: 'tickets.priority.high' },
  medium: { color: 'bg-yellow-500', labelKey: 'tickets.priority.medium' },
  low: { color: 'bg-green-500', labelKey: 'tickets.priority.low' },
};

// ==================== HELPER FUNCTIONS ====================

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(dateString: string | null): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSlaStatus(ticket: RemediationTicket): { status: string; color: string; labelKey: string } {
  if (!ticket.sla_due_at) return { status: 'no_sla', color: 'text-gray-400', labelKey: 'tickets.sla.noSla' };
  if (ticket.sla_breached) return { status: 'breached', color: 'text-red-600', labelKey: 'tickets.sla.breached' };
  
  const now = new Date();
  const dueAt = new Date(ticket.sla_due_at);
  const hoursRemaining = (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  if (hoursRemaining < 0) return { status: 'breached', color: 'text-red-600', labelKey: 'tickets.sla.breached' };
  if (hoursRemaining < 2) return { status: 'at_risk', color: 'text-orange-600', labelKey: 'tickets.sla.atRisk' };
  return { status: 'on_track', color: 'text-green-600', labelKey: 'tickets.sla.onTrack' };
}

function getTimeRemaining(dateString: string | null, t: (key: string, defaultValue?: string, options?: any) => string): string {
  if (!dateString) return '-';
  const now = new Date();
  const target = new Date(dateString);
  const diff = target.getTime() - now.getTime();
  
  if (diff < 0) {
    const hours = Math.abs(Math.floor(diff / (1000 * 60 * 60)));
    return t('tickets.time.hoursLate', '{{hours}}h late', { hours });
  }
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) return t('tickets.time.hoursRemaining', '{{hours}}h remaining', { hours });
  const days = Math.floor(hours / 24);
  return t('tickets.time.daysRemaining', '{{days}}d remaining', { days });
}


// ==================== TICKET CARD COMPONENT ====================

function TicketCard({ ticket, onClick }: { ticket: RemediationTicket; onClick: () => void }) {
  const { t } = useTranslation();
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
              {t(CATEGORY_CONFIG[ticket.category]?.labelKey)}
            </Badge>
          </div>
          
          <h3 className="font-medium text-[#1F2937] mb-1 line-clamp-1 group-hover:text-[#003C7D] transition-colors">
            {ticket.title}
          </h3>
          
          <p className="text-sm text-gray-500 line-clamp-2 mb-3">
            {ticket.description || t('tickets.noDescription', 'No description')}
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
                {t('tickets.assigned', 'Assigned')}
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
            {t(STATUS_CONFIG[ticket.status]?.labelKey)}
          </Badge>
          
          <Badge variant="outline" className={`${PRIORITY_CONFIG[ticket.priority]?.color} text-white text-xs`}>
            {t(PRIORITY_CONFIG[ticket.priority]?.labelKey)}
          </Badge>
          
          {ticket.sla_due_at && (
            <div className={`flex items-center gap-1 text-xs ${slaStatus.color}`}>
              <Timer className="h-3 w-3" />
              <span>{getTimeRemaining(ticket.sla_due_at, t)}</span>
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
  const { t } = useTranslation();
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
            <p className="text-xs text-gray-500">{t('tickets.openTickets', 'Open Tickets')}</p>
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
            <p className="text-xs text-gray-500">{t('tickets.resolved', 'Resolved')}</p>
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
            <p className="text-xs text-gray-500">{t('tickets.critical', 'Critical')}</p>
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
            <p className="text-xs text-gray-500">{t('tickets.slaBreached', 'SLA Breached')}</p>
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
      toast({ title: t('tickets.ticketCreated', 'Ticket created successfully'), variant: 'default' });
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
      toast({ title: t('tickets.ticketCreateError', 'Error creating ticket'), description: getErrorMessage(err), variant: 'destructive' });
    },
  });
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-[#003C7D]" />
            {t('tickets.createTitle', 'Create New Ticket')}
          </DialogTitle>
          <DialogDescription>
            {t('tickets.createDescription', 'Create a remediation ticket to track and resolve issues')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">{t('tickets.labelTitle', 'Title *')}</Label>
            <Input
              id="title"
              placeholder={t('tickets.placeholderTitle', 'Briefly describe the issue')}
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">{t('tickets.labelDescription', 'Description')}</Label>
            <Textarea
              id="description"
              placeholder={t('tickets.placeholderDescription', 'Issue details, impact, affected resources...')}
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('tickets.labelSeverity', 'Severity')}</Label>
              <Select value={formData.severity} onValueChange={(v: any) => setFormData({ ...formData, severity: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">{t('tickets.severity.critical', 'Critical')}</SelectItem>
                  <SelectItem value="high">{t('tickets.severity.high', 'High')}</SelectItem>
                  <SelectItem value="medium">{t('tickets.severity.medium', 'Medium')}</SelectItem>
                  <SelectItem value="low">{t('tickets.severity.low', 'Low')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>{t('tickets.labelPriority', 'Priority')}</Label>
              <Select value={formData.priority} onValueChange={(v: any) => setFormData({ ...formData, priority: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">{t('tickets.priority.urgent', 'Urgent')}</SelectItem>
                  <SelectItem value="high">{t('tickets.priority.high', 'High')}</SelectItem>
                  <SelectItem value="medium">{t('tickets.priority.medium', 'Medium')}</SelectItem>
                  <SelectItem value="low">{t('tickets.priority.low', 'Low')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('tickets.labelCategory', 'Category')}</Label>
              <Select value={formData.category} onValueChange={(v: any) => setFormData({ ...formData, category: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="security">{t('tickets.category.security', 'Security')}</SelectItem>
                  <SelectItem value="compliance">{t('tickets.category.compliance', 'Compliance')}</SelectItem>
                  <SelectItem value="cost_optimization">{t('tickets.category.cost_optimization', 'Cost Optimization')}</SelectItem>
                  <SelectItem value="performance">{t('tickets.category.performance', 'Performance')}</SelectItem>
                  <SelectItem value="configuration">{t('tickets.category.configuration', 'Configuration')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>{t('tickets.labelDueDate', 'Due Date')}</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('tickets.labelEstimatedEffort', 'Estimated Effort (hours)')}</Label>
              <Input
                type="number"
                min={0}
                value={formData.estimated_effort_hours}
                onChange={(e) => setFormData({ ...formData, estimated_effort_hours: parseInt(e.target.value) || 0 })}
              />
            </div>
            
            <div className="space-y-2">
              <Label>{t('tickets.labelBusinessImpact', 'Business Impact')}</Label>
              <Input
                placeholder={t('tickets.placeholderBusinessImpact', 'E.g.: Affects production, compliance...')}
                value={formData.business_impact}
                onChange={(e) => setFormData({ ...formData, business_impact: e.target.value })}
              />
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('tickets.cancel', 'Cancel')}
          </Button>
          <Button 
            onClick={() => createMutation.mutate(formData)}
            disabled={!formData.title || createMutation.isPending}
            className="bg-[#003C7D] hover:bg-[#002d5c]"
          >
            {createMutation.isPending ? t('tickets.creating', 'Creating...') : t('tickets.createTicket', 'Create Ticket')}
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
  
  const tickets: RemediationTicket[] = ticketsData || [];
  
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
                placeholder={t('tickets.placeholderSearch', 'Search tickets...')}
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
              {t('tickets.refresh', 'Refresh')}
            </Button>
            
            <Button
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
              className="bg-[#003C7D] hover:bg-[#002d5c]"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('tickets.newTicket', 'New Ticket')}
            </Button>
          </div>
        </div>
        
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-500">{t('tickets.filters', 'Filters:')}</span>
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-8 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('tickets.allStatus', 'All Status')}</SelectItem>
              <SelectItem value="open">{t('tickets.status.open', 'Open')}</SelectItem>
              <SelectItem value="in_progress">{t('tickets.status.in_progress', 'In Progress')}</SelectItem>
              <SelectItem value="pending_review">{t('tickets.status.pending_review', 'Pending Review')}</SelectItem>
              <SelectItem value="blocked">{t('tickets.status.blocked', 'Blocked')}</SelectItem>
              <SelectItem value="resolved">{t('tickets.status.resolved', 'Resolved')}</SelectItem>
              <SelectItem value="closed">{t('tickets.status.closed', 'Closed')}</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[140px] h-8 text-sm">
              <SelectValue placeholder={t('tickets.labelSeverity', 'Severity')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('tickets.allSeverities', 'All')}</SelectItem>
              <SelectItem value="critical">{t('tickets.severity.critical', 'Critical')}</SelectItem>
              <SelectItem value="high">{t('tickets.severity.high', 'High')}</SelectItem>
              <SelectItem value="medium">{t('tickets.severity.medium', 'Medium')}</SelectItem>
              <SelectItem value="low">{t('tickets.severity.low', 'Low')}</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px] h-8 text-sm">
              <SelectValue placeholder={t('tickets.labelCategory', 'Category')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('tickets.allCategories', 'All')}</SelectItem>
              <SelectItem value="security">{t('tickets.category.security', 'Security')}</SelectItem>
              <SelectItem value="compliance">{t('tickets.category.compliance', 'Compliance')}</SelectItem>
              <SelectItem value="cost_optimization">{t('tickets.category.cost_optimization', 'Cost Optimization')}</SelectItem>
              <SelectItem value="performance">{t('tickets.category.performance', 'Performance')}</SelectItem>
              <SelectItem value="configuration">{t('tickets.category.configuration', 'Configuration')}</SelectItem>
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
              {t('tickets.clearFilters', 'Clear filters')}
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
                  {tickets.length === 0 ? t('tickets.noTicketsFound', 'No tickets found') : t('tickets.noTicketsMatch', 'No tickets match the filters')}
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                  {tickets.length === 0 
                    ? t('tickets.createFirstTicket', 'Create your first remediation ticket')
                    : t('tickets.adjustFilters', 'Try adjusting the search filters')}
                </p>
                {tickets.length === 0 && (
                  <Button onClick={() => setCreateDialogOpen(true)} className="bg-[#003C7D] hover:bg-[#002d5c]">
                    <Plus className="h-4 w-4 mr-2" />
                    {t('tickets.createTicket', 'Create Ticket')}
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
            {t('tickets.showing', 'Showing {{filtered}} of {{total}} tickets', { filtered: filteredTickets.length, total: tickets.length })}
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