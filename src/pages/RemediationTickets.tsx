import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
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
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedAccountId } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();
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
    enabled: !!organizationId,
    staleTime: 1 * 60 * 1000,
    queryFn: async () => {
      let filters: any = { 
        organization_id: organizationId
      };

      // Only filter by account if one is selected
      if (selectedAccountId) {
        const accountFilter = getAccountFilter();
        filters = { ...filters, ...accountFilter };
      }

      if (selectedStatus !== 'all') {
        filters.status = selectedStatus;
      }

      if (selectedSeverity !== 'all') {
        filters.severity = selectedSeverity;
      }

      const response = await apiClient.select('remediation_tickets', {
        select: '*',
        eq: filters,
        order: { column: 'created_at', ascending: false }
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
      // Clean up data before sending
      const cleanData = {
        ...ticketData,
        organization_id: organizationId,
        ...getAccountFilter(), // Multi-cloud compatible
        status: 'open',
        created_by: 'current_user',
        automation_available: false,
        // Convert empty string to null for optional fields
        due_date: ticketData.due_date || null,
        business_impact: ticketData.business_impact || null,
      };

      const response = await apiClient.insert('remediation_tickets', cleanData);

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: t('remediationTickets.ticketCreated', 'Ticket created successfully'),
        description: t('remediationTickets.ticketCreatedDesc', 'The remediation ticket was created successfully.'),
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
        title: t('remediationTickets.ticketCreateError', 'Error creating ticket'),
        description: error instanceof Error ? error.message : t('common.unknownError', 'Unknown error'),
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
        title: t('remediationTickets.statusUpdated', 'Status updated'),
        description: t('remediationTickets.statusUpdatedDesc', 'The ticket status was updated successfully.'),
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: t('remediationTickets.updateError', 'Error updating'),
        description: error instanceof Error ? error.message : t('common.unknownError', 'Unknown error'),
        variant: "destructive"
      });
    }
  });

  const handleCreateTicket = () => {
    if (!newTicket.title || !newTicket.description) {
      toast({
        title: t('remediationTickets.requiredFields', 'Required fields'),
        description: t('remediationTickets.requiredFieldsDesc', 'Title and description are required.'),
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
        title: t('remediationTickets.dataUpdated', 'Data updated'),
        description: t('remediationTickets.dataUpdatedDesc', 'The tickets were updated.'),
      });
    } catch (error) {
      toast({
        title: t('remediationTickets.updateError', 'Error updating'),
        description: t('remediationTickets.updateErrorDesc', 'Could not update the data.'),
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open': return <Badge variant="outline">{t('remediationTickets.statusOpen', 'Open')}</Badge>;
      case 'in_progress': return <Badge className="bg-blue-500">{t('remediationTickets.inProgress', 'In Progress')}</Badge>;
      case 'resolved': return <Badge className="bg-green-500">{t('remediationTickets.resolved', 'Resolved')}</Badge>;
      case 'closed': return <Badge variant="secondary">{t('remediationTickets.statusClosed', 'Closed')}</Badge>;
      case 'cancelled': return <Badge variant="destructive">{t('remediationTickets.statusCancelled', 'Cancelled')}</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive">{t('remediationTickets.severityCritical', 'Critical')}</Badge>;
      case 'high': return <Badge variant="destructive">{t('remediationTickets.severityHigh', 'High')}</Badge>;
      case 'medium': return <Badge variant="secondary">{t('remediationTickets.severityMedium', 'Medium')}</Badge>;
      case 'low': return <Badge variant="outline">{t('remediationTickets.severityLow', 'Low')}</Badge>;
      default: return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent': return <Badge variant="destructive">{t('remediationTickets.priorityUrgent', 'Urgent')}</Badge>;
      case 'high': return <Badge className="bg-orange-500">{t('remediationTickets.priorityHigh', 'High')}</Badge>;
      case 'medium': return <Badge variant="secondary">{t('remediationTickets.priorityMedium', 'Medium')}</Badge>;
      case 'low': return <Badge variant="outline">{t('remediationTickets.priorityLow', 'Low')}</Badge>;
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
    { value: 'security', label: t('remediationTickets.categorySecurity', 'Security') },
    { value: 'compliance', label: t('remediationTickets.categoryCompliance', 'Compliance') },
    { value: 'cost_optimization', label: t('remediationTickets.categoryCostOptimization', 'Cost Optimization') },
    { value: 'performance', label: t('remediationTickets.categoryPerformance', 'Performance') },
    { value: 'configuration', label: t('remediationTickets.categoryConfiguration', 'Configuration') }
  ];

  return (
    <Layout 
      title={t('sidebar.remediationTickets', 'Tickets de Remediação')} 
      description={t('remediationTickets.description', 'Sistema de workflow para rastreamento e resolução de problemas')}
      icon={<Ticket className="h-5 w-5" />}
    >
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('remediationTickets.totalTickets', 'Total Tickets')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-semibold">{totalTickets}</div>
            )}
          </CardContent>
        </Card>

        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('remediationTickets.statusOpen', 'Open')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-semibold text-blue-500">{openTickets}</div>
            )}
          </CardContent>
        </Card>

        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('remediationTickets.inProgress', 'In Progress')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-semibold text-yellow-500">{inProgressTickets}</div>
            )}
          </CardContent>
        </Card>

        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('remediationTickets.criticals', 'Critical')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-semibold text-red-500">{criticalTickets}</div>
            )}
          </CardContent>
        </Card>

        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('remediationTickets.overdue', 'Overdue')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-semibold text-red-600">{overdueTickets}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card >
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger >
                <SelectValue placeholder={t('remediationTickets.filterByStatus', 'Filter by status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('remediationTickets.allStatuses', 'All Statuses')}</SelectItem>
                <SelectItem value="open">{t('remediationTickets.statusOpen', 'Open')}</SelectItem>
                <SelectItem value="in_progress">{t('remediationTickets.inProgress', 'In Progress')}</SelectItem>
                <SelectItem value="resolved">{t('remediationTickets.resolved', 'Resolved')}</SelectItem>
                <SelectItem value="closed">{t('remediationTickets.statusClosed', 'Closed')}</SelectItem>
                <SelectItem value="cancelled">{t('remediationTickets.statusCancelled', 'Cancelled')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
              <SelectTrigger >
                <SelectValue placeholder={t('remediationTickets.filterBySeverity', 'Filter by severity')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('remediationTickets.allSeverities', 'All Severities')}</SelectItem>
                <SelectItem value="critical">{t('remediationTickets.severityCritical', 'Critical')}</SelectItem>
                <SelectItem value="high">{t('remediationTickets.severityHigh', 'High')}</SelectItem>
                <SelectItem value="medium">{t('remediationTickets.severityMedium', 'Medium')}</SelectItem>
                <SelectItem value="low">{t('remediationTickets.severityLow', 'Low')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tickets List */}
      <Card >
        <CardHeader>
          <CardTitle>{t('remediationTickets.ticketsList', 'Tickets List')}</CardTitle>
          <CardDescription>{t('remediationTickets.ticketsListDesc', 'All remediation tickets')}</CardDescription>
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
                            <span>{t('remediationTickets.createdBy', 'Created by')}: {ticket.created_by}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{new Date(ticket.created_at).toLocaleDateString('pt-BR')}</span>
                          </div>
                          {ticket.due_date && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{t('remediationTickets.dueDate', 'Due')}: {new Date(ticket.due_date).toLocaleDateString('pt-BR')}</span>
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
                      <p className="text-sm font-medium mb-1">{t('remediationTickets.businessImpact', 'Business Impact')}:</p>
                      <p className="text-sm text-muted-foreground">{ticket.business_impact}</p>
                    </div>
                  )}
                  
                  {ticket.affected_resources && ticket.affected_resources.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{t('remediationTickets.affectedResources', 'Affected Resources')}:</p>
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
                          {t('remediationTickets.effort', 'Effort')}: {ticket.estimated_effort_hours}h
                        </span>
                      )}
                      {ticket.automation_available && (
                        <Badge variant="outline" className="gap-1">
                          <Settings className="h-3 w-3" />
                          {t('remediationTickets.automationAvailable', 'Automation Available')}
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
                          {t('remediationTickets.start', 'Start')}
                        </Button>
                      )}
                      {ticket.status === 'in_progress' && (
                        <Button 
                          size="sm"
                          onClick={() => updateStatusMutation.mutate({ id: ticket.id, status: 'resolved' })}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          {t('remediationTickets.resolve', 'Resolve')}
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
              <h3 className="text-xl font-semibold mb-2">{t('remediationTickets.noTicketsFound', 'No tickets found')}</h3>
              <p className="text-muted-foreground mb-4">
                {selectedStatus !== 'all' || selectedSeverity !== 'all' 
                  ? t('remediationTickets.noTicketsWithFilters', 'No tickets match the applied filters.')
                  : t('remediationTickets.createFirstTicketDesc', 'Create your first remediation ticket.')
                }
              </p>
              {selectedStatus === 'all' && selectedSeverity === 'all' && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('remediationTickets.createFirstTicket', 'Create First Ticket')}
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
            <DialogTitle>{t('remediationTickets.createNewTicket', 'Create New Ticket')}</DialogTitle>
            <DialogDescription>
              {t('remediationTickets.createNewTicketDesc', 'Create a new remediation ticket to track issues')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t('remediationTickets.ticketTitle', 'Title')}</Label>
              <Input
                id="title"
                value={newTicket.title}
                onChange={(e) => setNewTicket(prev => ({ ...prev, title: e.target.value }))}
                placeholder={t('remediationTickets.ticketTitlePlaceholder', 'Problem title')}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">{t('remediationTickets.ticketDescription', 'Description')}</Label>
              <Textarea
                id="description"
                value={newTicket.description}
                onChange={(e) => setNewTicket(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('remediationTickets.ticketDescriptionPlaceholder', 'Describe the problem in detail')}
                rows={4}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="severity">{t('remediationTickets.severity', 'Severity')}</Label>
                <Select value={newTicket.severity} onValueChange={(value: any) => setNewTicket(prev => ({ ...prev, severity: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('remediationTickets.severityLow', 'Low')}</SelectItem>
                    <SelectItem value="medium">{t('remediationTickets.severityMedium', 'Medium')}</SelectItem>
                    <SelectItem value="high">{t('remediationTickets.severityHigh', 'High')}</SelectItem>
                    <SelectItem value="critical">{t('remediationTickets.severityCritical', 'Critical')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">{t('remediationTickets.priority', 'Priority')}</Label>
                <Select value={newTicket.priority} onValueChange={(value: any) => setNewTicket(prev => ({ ...prev, priority: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('remediationTickets.priorityLow', 'Low')}</SelectItem>
                    <SelectItem value="medium">{t('remediationTickets.priorityMedium', 'Medium')}</SelectItem>
                    <SelectItem value="high">{t('remediationTickets.priorityHigh', 'High')}</SelectItem>
                    <SelectItem value="urgent">{t('remediationTickets.priorityUrgent', 'Urgent')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">{t('remediationTickets.category', 'Category')}</Label>
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
                <Label htmlFor="due_date">{t('remediationTickets.dueDateLabel', 'Due Date')}</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={newTicket.due_date}
                  onChange={(e) => setNewTicket(prev => ({ ...prev, due_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="effort">{t('remediationTickets.estimatedEffort', 'Estimated Effort (hours)')}</Label>
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
              <Label htmlFor="business_impact">{t('remediationTickets.businessImpact', 'Business Impact')}</Label>
              <Textarea
                id="business_impact"
                value={newTicket.business_impact}
                onChange={(e) => setNewTicket(prev => ({ ...prev, business_impact: e.target.value }))}
                placeholder={t('remediationTickets.businessImpactPlaceholder', 'Describe the business impact')}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleCreateTicket} disabled={createTicketMutation.isPending}>
              {createTicketMutation.isPending ? t('remediationTickets.creating', 'Creating...') : t('remediationTickets.createTicket', 'Create Ticket')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </Layout>
  );
}