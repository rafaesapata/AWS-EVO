import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useOrganization } from "@/hooks/useOrganization";
import { toast } from "sonner";
import { CheckCircle2, Clock, PlayCircle, XCircle, Plus, DollarSign, Ticket, Calendar } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Comment {
  user_id: string;
  user_name: string;
  comment: string;
  created_at: string;
}

interface TicketType {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigned_to: string;
  estimated_savings: number;
  resolution_notes: string;
  created_at: string;
  resolved_at: string;
  created_by: string;
  comments: Comment[];
}

export const RemediationTickets = () => {
  const { t, i18n } = useTranslation();
  const { data: organizationId } = useOrganization();
  const dateLocale = i18n.language === 'pt' ? ptBR : i18n.language === 'es' ? es : enUS;
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set(['pending', 'in_progress']));
  const [assignedFilter, setAssignedFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [newTicket, setNewTicket] = useState({ title: '', description: '', priority: 'medium', estimated_savings: 0 });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(null);
  const [dismissReason, setDismissReason] = useState('');
  const [isDismissDialogOpen, setIsDismissDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const queryClient = useQueryClient();

  const toggleStatusFilter = (status: string) => {
    const newFilters = new Set(statusFilters);
    if (status === 'all') {
      // Se clicar em "todos", limpa todos os filtros
      newFilters.clear();
    } else {
      if (newFilters.has(status)) {
        newFilters.delete(status);
      } else {
        newFilters.add(status);
      }
    }
    setStatusFilters(newFilters);
    setPage(1); // Reset to first page when filter changes
  };

  // Fetch organization users for assignment
  const { data: orgUsers } = useQuery({
    queryKey: ['org-users', organizationId],
    queryFn: async () => {
      if (!organizationId) throw new Error('No organization');
      
      const response = await apiClient.select('profiles', {
        select: '*',
        eq: { organization_id: organizationId }
      });
      
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
    enabled: !!organizationId,
  });

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['remediation-tickets', organizationId, statusFilters, assignedFilter, dateFrom, dateTo, page, pageSize],
    queryFn: async () => {
      if (!organizationId) throw new Error('No organization');
      
      // Build query filters
      let filters: any = { organization_id: organizationId };
      
      // Apply status filters (if any selected)
      if (statusFilters.size > 0) {
        filters.status = Array.from(statusFilters);
      }
      
      if (assignedFilter !== 'all') {
        filters.assigned_to = assignedFilter;
      }
      
      if (dateFrom) {
        filters.created_at = { gte: dateFrom.toISOString() };
      }
      
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        filters.created_at = { ...filters.created_at, lte: endDate.toISOString() };
      }
      
      // Make API call to get remediation tickets
      const response = await apiClient.select('remediation_tickets', {
        select: '*',
        eq: filters,
        order: { column: 'created_at', ascending: false },
        limit: pageSize,
        offset: (page - 1) * pageSize
      });
      
      if (response.error) throw new Error(getErrorMessage(response.error));
      
      // Parse comments from JSON to proper type
      return (response.data || []).map((ticket: any) => ({
        ...ticket,
        comments: Array.isArray(ticket.comments) ? (ticket.comments as unknown as Comment[]) : []
      })) as TicketType[];
    },
    enabled: !!organizationId,
  });

  const createMutation = useMutation({
    mutationFn: async (ticket: typeof newTicket) => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      if (!organizationId) throw new Error('No organization');
      
      const result = await apiClient.insert('remediation_tickets', {
        ...ticket,
        organization_id: organizationId,
        created_by: user.id
      });
      
      if (result.error) throw new Error(getErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remediation-tickets'] });
      toast.success(t('remediationTickets.ticketCreated'));
      setIsDialogOpen(false);
      setNewTicket({ title: '', description: '', priority: 'medium', estimated_savings: 0 });
    },
    onError: () => {
      toast.error(t('remediationTickets.ticketCreateError'));
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!organizationId) throw new Error('No organization');
      
      const updates: any = { status };
      if (status === 'resolved') {
        updates.resolved_at = new Date().toISOString();
      }
      
      // SECURITY: Filter by organization_id
      const response = await apiClient.update('remediation_tickets', updates, {
        eq: { id, organization_id: organizationId }
      });
      
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remediation-tickets'] });
      toast.success(t('remediationTickets.statusUpdated'));
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      if (!organizationId) throw new Error('No organization');
      
      // SECURITY: Filter by organization_id
      const response = await apiClient.update('remediation_tickets', 
        { status: 'dismissed', resolution_notes: reason },
        { eq: { id, organization_id: organizationId } }
      );
      
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remediation-tickets'] });
      toast.success(t('remediationTickets.ticketDismissed'));
      setIsDismissDialogOpen(false);
      setDismissReason('');
      setSelectedTicket(null);
    },
  });

  const updateAssignedMutation = useMutation({
    mutationFn: async ({ id, assigned_to }: { id: string; assigned_to: string }) => {
      if (!organizationId) throw new Error('No organization');
      
      // SECURITY: Filter by organization_id
      const response = await apiClient.update('remediation_tickets',
        { assigned_to },
        { eq: { id, organization_id: organizationId } }
      );
      
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remediation-tickets'] });
      toast.success(t('remediationTickets.assigneeUpdated'));
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ ticketId, comment }: { ticketId: string; comment: string }) => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      if (!organizationId) throw new Error('No organization');

      // Get current ticket comments
      const ticketResponse = await apiClient.select('remediation_tickets', {
        select: 'comments',
        eq: { id: ticketId, organization_id: organizationId },
        limit: 1
      });
      
      if (ticketResponse.error) throw new Error(getErrorMessage(ticketResponse.error));
      const ticketData = ticketResponse.data?.[0];
      if (!ticketData) throw new Error('Ticket not found');

      const currentComments = Array.isArray(ticketData.comments) ? ticketData.comments : [];
      const newCommentObj = {
        user_id: user.id,
        user_name: user.email || 'Usuário',
        comment,
        created_at: new Date().toISOString(),
      };

      const updatedComments = [...currentComments, newCommentObj];

      const response = await apiClient.update('remediation_tickets',
        { comments: updatedComments },
        { eq: { id: ticketId, organization_id: organizationId } }
      );
      
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remediation-tickets'] });
      toast.success(t('remediationTickets.commentAdded'));
      setNewComment('');
    },
  });

  const statusIcons = {
    pending: Clock,
    in_progress: PlayCircle,
    resolved: CheckCircle2,
    dismissed: XCircle,
  };

  const statusColors = {
    pending: 'bg-muted text-muted-foreground',
    in_progress: 'bg-primary/20 text-primary',
    resolved: 'bg-success/20 text-success',
    dismissed: 'bg-muted text-muted-foreground',
  };

  const priorityColors = {
    low: 'bg-blue-500/20 text-blue-500',
    medium: 'bg-yellow-500/20 text-yellow-500',
    high: 'bg-orange-500/20 text-orange-500',
    critical: 'bg-destructive/20 text-destructive',
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t('remediationTickets.title')}</CardTitle>
            <CardDescription>{t('remediationTickets.description')}</CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="hover-scale">
                <Plus className="h-4 w-4 mr-2" />
                {t('remediationTickets.newTicket')}
              </Button>
            </DialogTrigger>
            <DialogContent className="animate-scale-in">
              <DialogHeader>
                <DialogTitle>{t('remediationTickets.createTicket')}</DialogTitle>
                <DialogDescription>{t('remediationTickets.createTicketDesc')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">{t('remediationTickets.ticketTitle')}</label>
                  <Input
                    value={newTicket.title}
                    onChange={(e) => setNewTicket({ ...newTicket, title: e.target.value })}
                    placeholder={t('remediationTickets.ticketTitlePlaceholder')}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{t('remediationTickets.ticketDescription')}</label>
                  <Textarea
                    value={newTicket.description}
                    onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                    placeholder={t('remediationTickets.ticketDescriptionPlaceholder')}
                    rows={4}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">{t('remediationTickets.priority')}</label>
                    <Select
                      value={newTicket.priority}
                      onValueChange={(value) => setNewTicket({ ...newTicket, priority: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">{t('remediationTickets.priorityLow')}</SelectItem>
                        <SelectItem value="medium">{t('remediationTickets.priorityMedium')}</SelectItem>
                        <SelectItem value="high">{t('remediationTickets.priorityHigh')}</SelectItem>
                        <SelectItem value="critical">{t('remediationTickets.priorityCritical')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t('remediationTickets.estimatedSavings')}</label>
                    <Input
                      type="number"
                      value={newTicket.estimated_savings}
                      onChange={(e) => setNewTicket({ ...newTicket, estimated_savings: parseFloat(e.target.value) })}
                      placeholder="0"
                    />
                  </div>
                </div>
                <Button onClick={() => createMutation.mutate(newTicket)} className="w-full hover-scale">
                  {t('remediationTickets.createTicket')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 mb-4">
          {/* Status Filter with Multiple Selection */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={statusFilters.size === 0 ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleStatusFilter('all')}
              className="hover-scale"
            >
              {t('remediationTickets.all')}
            </Button>
            {['pending', 'in_progress', 'resolved', 'dismissed'].map((status) => (
              <Button
                key={status}
                variant={statusFilters.has(status) ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleStatusFilter(status)}
                className="hover-scale"
              >
                {status.replace('_', ' ')}
              </Button>
            ))}
          </div>

          {/* Additional Filters */}
          <div className="flex gap-4 flex-wrap">
            {/* Assigned Filter */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">{t('remediationTickets.assignedUser')}</label>
              <Select value={assignedFilter} onValueChange={setAssignedFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t('remediationTickets.allUsers')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('remediationTickets.allUsers')}</SelectItem>
                  {orgUsers?.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">{t('remediationTickets.dateFrom')}</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateFrom && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy", { locale: dateLocale }) : t('remediationTickets.select')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Date To */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">{t('remediationTickets.dateTo')}</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateTo && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "dd/MM/yyyy", { locale: dateLocale }) : t('remediationTickets.select')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Clear Filters */}
            {(assignedFilter !== 'all' || dateFrom || dateTo) && (
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAssignedFilter('all');
                    setDateFrom(undefined);
                    setDateTo(undefined);
                  }}
                >
                  {t('remediationTickets.clearFilters')}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 border border-border rounded-lg animate-pulse">
                  <div className="h-6 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-muted rounded w-full mb-2"></div>
                  <div className="h-4 bg-muted rounded w-2/3"></div>
                </div>
              ))}
            </div>
          ) : tickets && tickets.length > 0 ? (
            tickets.map((ticket: TicketType) => {
              const StatusIcon = statusIcons[ticket.status as keyof typeof statusIcons];
              return (
                <div 
                  key={ticket.id} 
                  className="group p-4 border border-border rounded-lg transition-all duration-300 hover:shadow-lg hover:border-primary/50 hover:scale-[1.02] animate-fade-in"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 
                        className="font-semibold cursor-pointer hover:text-primary transition-colors duration-200 flex items-center gap-2" 
                        onClick={() => {
                          setSelectedTicket(ticket);
                          setIsDetailsDialogOpen(true);
                        }}
                      >
                        {ticket.title}
                        <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                          →
                        </span>
                      </h4>
                      {ticket.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{ticket.description}</p>
                      )}
                      {ticket.assigned_to && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                          Responsável: {orgUsers?.find(u => u.id === ticket.assigned_to)?.full_name || ticket.assigned_to}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`${priorityColors[ticket.priority as keyof typeof priorityColors]} transition-transform duration-200 hover:scale-110`}>
                        {ticket.priority}
                      </Badge>
                      <Badge className={`${statusColors[ticket.status as keyof typeof statusColors]} transition-transform duration-200 hover:scale-110`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {ticket.status}
                      </Badge>
                    </div>
                  </div>
                  
                  {ticket.estimated_savings > 0 && (
                    <div className="flex items-center text-sm text-success mt-2 animate-fade-in">
                      <DollarSign className="h-3 w-3 mr-1 animate-pulse" />
                      Economia estimada: ${ticket.estimated_savings.toLocaleString('pt-BR')}/ano
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-3 border-t border-border/50 mt-3">
                    {ticket.status !== 'resolved' && (
                      <>
                        {ticket.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatusMutation.mutate({ id: ticket.id, status: 'in_progress' })}
                            className="hover-scale"
                          >
                            Iniciar
                          </Button>
                        )}
                        {ticket.status === 'in_progress' && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => updateStatusMutation.mutate({ id: ticket.id, status: 'resolved' })}
                            className="hover-scale"
                          >
                            Marcar como Resolvido
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedTicket(ticket);
                            setIsDismissDialogOpen(true);
                          }}
                          className="hover-scale"
                        >
                          Descartar
                        </Button>
                      </>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      Criado em {new Date(ticket.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center text-muted-foreground py-12 animate-fade-in">
              <Ticket className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>{t('remediationTickets.noTicketsFound')}</p>
            </div>
          )}
        </div>

        {/* Dismiss Dialog */}
        <Dialog open={isDismissDialogOpen} onOpenChange={setIsDismissDialogOpen}>
          <DialogContent className="animate-scale-in">
            <DialogHeader>
              <DialogTitle>Descartar Ticket</DialogTitle>
              <DialogDescription>
                Por favor, forneça uma justificativa para descartar este ticket
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
                placeholder="Explique por que este ticket está sendo descartado..."
                rows={4}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsDismissDialogOpen(false);
                    setDismissReason('');
                    setSelectedTicket(null);
                  }}
                  className="hover-scale"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => {
                    if (!dismissReason.trim()) {
                      toast.error('Justificativa obrigatória');
                      return;
                    }
                    dismissMutation.mutate({
                      id: selectedTicket!.id,
                      reason: dismissReason
                    });
                  }}
                  disabled={!dismissReason.trim()}
                  className="hover-scale"
                >
                  Descartar Ticket
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Details Dialog */}
        <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-in">
            <DialogHeader>
              <DialogTitle>Detalhes do Ticket</DialogTitle>
            </DialogHeader>
            {selectedTicket && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Título</label>
                  <p className="text-sm text-muted-foreground">{selectedTicket.title}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Descrição</label>
                  <p className="text-sm text-muted-foreground">{selectedTicket.description || 'Sem descrição'}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Prioridade</label>
                    <Badge className={priorityColors[selectedTicket.priority as keyof typeof priorityColors]}>
                      {selectedTicket.priority}
                    </Badge>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Status</label>
                    <Badge className={statusColors[selectedTicket.status as keyof typeof statusColors]}>
                      {selectedTicket.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">Responsável</label>
                  <Select
                    value={selectedTicket.assigned_to || undefined}
                    onValueChange={(value) => {
                      updateAssignedMutation.mutate({
                        id: selectedTicket.id,
                        assigned_to: value
                      });
                      setSelectedTicket({ ...selectedTicket, assigned_to: value });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      {orgUsers?.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedTicket.estimated_savings > 0 && (
                  <div>
                    <label className="text-sm font-medium">Economia Estimada</label>
                    <p className="text-sm text-success">${selectedTicket.estimated_savings.toLocaleString('pt-BR')}/ano</p>
                  </div>
                )}
                {selectedTicket.resolution_notes && (
                  <div>
                    <label className="text-sm font-medium">Notas de Resolução/Justificativa</label>
                    <p className="text-sm text-muted-foreground">{selectedTicket.resolution_notes}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                  <div>
                    <label className="font-medium">Criado em</label>
                    <p>{new Date(selectedTicket.created_at).toLocaleString('pt-BR')}</p>
                  </div>
                  <div>
                    <label className="font-medium">Criado por</label>
                    <p>{selectedTicket.created_by 
                      ? (orgUsers?.find(u => u.id === selectedTicket.created_by)?.full_name || 'Sistema')
                      : 'Sistema'
                    }</p>
                  </div>
                  {selectedTicket.resolved_at && (
                    <div>
                      <label className="font-medium">Resolvido em</label>
                      <p>{new Date(selectedTicket.resolved_at).toLocaleString('pt-BR')}</p>
                    </div>
                  )}
                </div>

                {/* Comments Section */}
                <div className="border-t pt-4 mt-4">
                  <label className="text-sm font-medium block mb-3">Histórico de Comentários</label>
                  <div className="space-y-3 max-h-60 overflow-y-auto mb-3">
                    {selectedTicket.comments && selectedTicket.comments.length > 0 ? (
                      selectedTicket.comments.map((comment, index) => (
                        <div key={index} className="p-3 bg-muted rounded-lg animate-fade-in">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{comment.user_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(comment.created_at).toLocaleString('pt-BR')}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{comment.comment}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhum comentário ainda
                      </p>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Adicionar um comentário..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      rows={2}
                      className="flex-1"
                    />
                    <Button
                      onClick={() => {
                        if (!newComment.trim()) {
                          toast.error('Comentário não pode estar vazio');
                          return;
                        }
                        addCommentMutation.mutate({
                          ticketId: selectedTicket.id,
                          comment: newComment
                        });
                      }}
                      disabled={!newComment.trim() || addCommentMutation.isPending}
                      className="hover-scale"
                    >
                      Comentar
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Paginação */}
        {tickets && tickets.length > 0 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              Mostrando {tickets.length} tickets • Página {page}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={tickets.length < pageSize}
              >
                Próximo
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
