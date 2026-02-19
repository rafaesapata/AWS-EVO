import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Eye, AlertTriangle, Shield, Info, Plus, Ticket } from "lucide-react";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Finding } from "@/types/database";

interface FindingsTableProps {
  findings: Finding[];
  onUpdate: () => void;
}

const FindingsTable = ({ findings, onUpdate }: FindingsTableProps) => {
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [selectedFindings, setSelectedFindings] = useState<string[]>([]);
  const [creatingTickets, setCreatingTickets] = useState(false);
  const { data: organizationId } = useOrganization();
  const { toast } = useToast();

  // Use findings directly - filtering is handled by parent component
  const filteredFindings = findings;

  const updateStatus = async (id: string, status: string) => {
    try {
      if (!organizationId) throw new Error('No organization');

      const response = await apiClient.update('findings',
        { status },
        { eq: { id, organization_id: organizationId } }
      );
      
      if (response.error) throw new Error(response.error.message || 'Unknown error');

      toast({
        title: "✅ Status atualizado",
        description: "Finding atualizado com sucesso",
      });
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Falha ao atualizar status",
        variant: "destructive",
      });
    }
  };

  const handleCreateTickets = async () => {
    if (selectedFindings.length === 0) {
      toast({
        title: "Nenhum item selecionado",
        description: "Selecione pelo menos um achado para criar tickets",
        variant: "destructive"
      });
      return;
    }

    setCreatingTickets(true);
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      if (!organizationId) throw new Error('No organization');
      
      const ticketsToCreate = findings
        .filter(f => selectedFindings.includes(f.id) && !f.ticket_id)
        .map(f => ({
          organization_id: organizationId,
          title: `Security: ${f.event_name}`,
          description: `${f.description}\n\nSeverity: ${f.severity}\n\nDetails: ${JSON.stringify(f.details, null, 2)}`,
          category: 'security',
          severity: f.severity || 'medium',
          priority: f.severity === 'critical' ? 'critical' : f.severity === 'high' ? 'high' : 'medium',
          status: 'pending',
          finding_id: f.id
        }));

      // Create tickets in batch
      const ticketResponse = await apiClient.insert('remediation_tickets', ticketsToCreate);
      if (ticketResponse.error) throw new Error(ticketResponse.error);
      const tickets = ticketResponse.data || [];

      // SECURITY: Update findings with ticket_id, filtering by organization_id
      for (let i = 0; i < tickets.length; i++) {
        const finding = findings.filter(f => selectedFindings.includes(f.id) && !f.ticket_id)[i];
        if (finding && tickets[i]) {
          await apiClient.update('findings',
            { ticket_id: tickets[i].id },
            { eq: { id: finding.id, organization_id: organizationId } }
          );
        }
      }

      toast({
        title: "Tickets criados",
        description: `${tickets.length} ticket(s) de remediação criados com sucesso`
      });

      setSelectedFindings([]);
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setCreatingTickets(false);
    }
  };

  const handleToggleFinding = (id: string) => {
    setSelectedFindings(prev => 
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const handleToggleAll = () => {
    const pendingWithoutTickets = findings.filter(f => !f.ticket_id && f.status === 'pending');
    if (selectedFindings.length === pendingWithoutTickets.length) {
      setSelectedFindings([]);
    } else {
      setSelectedFindings(pendingWithoutTickets.map(f => f.id));
    }
  };

  const getSeverityBadge = (severity: string) => {
    const variants = {
      critical: { color: "bg-destructive text-destructive-foreground", icon: AlertTriangle },
      high: { color: "bg-warning text-warning-foreground", icon: AlertTriangle },
      medium: { color: "bg-primary text-primary-foreground", icon: Shield },
      low: { color: "bg-muted text-muted-foreground", icon: Info },
    };

    const variant = variants[severity as keyof typeof variants] || variants.medium;
    const Icon = variant.icon;

    return (
      <Badge className={variant.color}>
        <Icon className="w-3 h-3 mr-1" />
        {severity.toUpperCase()}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      pending: "border-warning text-warning",
      resolved: "border-success text-success",
      ignored: "border-muted-foreground text-muted-foreground"
    };

    return (
      <Badge variant="outline" className={colors[status as keyof typeof colors]}>
        {status === 'pending' ? 'Pendente' : status === 'resolved' ? 'Resolvido' : 'Ignorado'}
      </Badge>
    );
  };

  if (findings.length === 0) {
    return (
      <Card className="p-12 text-center shadow-card">
        <Shield className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h3 className="text-xl font-semibold mb-2">Nenhum achado ainda</h3>
        <p className="text-muted-foreground">
          Faça upload de eventos do CloudTrail para começar a análise
        </p>
      </Card>
    );
  }

  const pendingWithoutTickets = filteredFindings.filter(f => !f.ticket_id && f.status === 'pending');

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedFindings.length === pendingWithoutTickets.length && pendingWithoutTickets.length > 0}
              onCheckedChange={handleToggleAll}
            />
            <span className="text-sm text-muted-foreground">
              Selecionar ({selectedFindings.length})
            </span>
          </div>
          <span className="text-sm text-muted-foreground">
            {filteredFindings.length} achados
          </span>
        </div>
        <Button 
          onClick={handleCreateTickets} 
          disabled={creatingTickets || selectedFindings.length === 0}
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          Criar Ticket{selectedFindings.length > 0 && `s (${selectedFindings.length})`}
        </Button>
      </div>
      
      <Card className="shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left p-4 w-12"></th>
                <th className="text-left p-4 font-semibold">Evento</th>
                <th className="text-left p-4 font-semibold">Resource ID / ARN</th>
                <th className="text-left p-4 font-semibold">Região</th>
                <th className="text-left p-4 font-semibold">Origem</th>
                <th className="text-left p-4 font-semibold">Usuário</th>
                <th className="text-left p-4 font-semibold">Data/Hora</th>
                <th className="text-left p-4 font-semibold">Severidade</th>
                <th className="text-left p-4 font-semibold">Descrição</th>
                <th className="text-left p-4 font-semibold">Ticket</th>
                <th className="text-left p-4 font-semibold">Status</th>
                <th className="text-center p-4 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredFindings.map((finding, index) => (
                <tr 
                  key={finding.id} 
                  className="border-b border-border hover:bg-muted/30 transition-colors animate-fade-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <td className="p-4">
                    {!finding.ticket_id && finding.status === 'pending' && (
                      <Checkbox
                        checked={selectedFindings.includes(finding.id)}
                        onCheckedChange={() => handleToggleFinding(finding.id)}
                      />
                    )}
                  </td>
                  <td className="p-4 font-mono text-sm">{finding.event_name}</td>
                  <td className="p-4">
                    {finding.resource_arn || finding.details?.resourceArn ? (
                      <div className="font-mono text-xs max-w-[200px]">
                        <div className="truncate" title={finding.resource_arn || finding.details?.resourceArn}>
                          {finding.resource_arn || finding.details?.resourceArn}
                        </div>
                        {(finding.resource_id || finding.details?.resourceId) && (
                          <div className="text-muted-foreground truncate" title={finding.resource_id || finding.details?.resourceId}>
                            ID: {finding.resource_id || finding.details?.resourceId}
                          </div>
                        )}
                        {finding.details?.resourceType && (
                          <div className="text-muted-foreground">{finding.details?.resourceType}</div>
                        )}
                      </div>
                    ) : finding.resource_id || finding.details?.resourceId ? (
                      <div className="font-mono text-xs max-w-[200px]">
                        <div className="truncate" title={finding.resource_id || finding.details?.resourceId}>
                          {finding.resource_id || finding.details?.resourceId}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">N/A</span>
                    )}
                  </td>
                  <td className="p-4">
                    <Badge variant="outline" className="font-mono text-xs">
                      {finding.details?.region || 'global'}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <Badge variant={
                      finding.source === 'security-engine' || finding.source === 'security_scan' 
                        ? 'default' 
                        : finding.source === 'cloudtrail' 
                          ? 'secondary' 
                          : 'outline'
                    }>
                      {finding.source === 'security-engine' || finding.source === 'security_scan' 
                        ? 'Security Scan' 
                        : finding.source === 'cloudtrail' 
                          ? 'CloudTrail' 
                          : finding.source || 'Desconhecido'}
                    </Badge>
                  </td>
                  <td className="p-4 text-sm">
                    {finding.user_identity?.userName || finding.user_identity?.type || 'N/A'}
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {new Date(finding.event_time).toLocaleString('pt-BR')}
                  </td>
                  <td className="p-4">{getSeverityBadge(finding.severity)}</td>
                  <td className="p-4 text-sm max-w-xs truncate">{finding.description}</td>
                  <td className="p-4">
                    {finding.ticket_id && finding.remediation_tickets ? (
                      <div className="flex items-center gap-2">
                        <Ticket className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium truncate max-w-[150px]">{finding.remediation_tickets.title}</div>
                          <Badge variant="outline" className="text-xs">
                            {finding.remediation_tickets.status}
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem ticket</span>
                    )}
                  </td>
                  <td className="p-4">{getStatusBadge(finding.status)}</td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedFinding(finding)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {finding.status === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-success hover:text-success hover:bg-success/10"
                            onClick={() => updateStatus(finding.id, 'resolved')}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:bg-muted"
                            onClick={() => updateStatus(finding.id, 'ignored')}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!selectedFinding} onOpenChange={() => setSelectedFinding(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Detalhes do Achado
            </DialogTitle>
            <DialogDescription>
              Análise detalhada do evento de segurança
            </DialogDescription>
          </DialogHeader>
          {selectedFinding && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Evento</h4>
                <p className="font-mono text-sm bg-muted p-2 rounded">{selectedFinding.event_name}</p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Severidade</h4>
                {getSeverityBadge(selectedFinding.severity)}
              </div>
              <div>
                <h4 className="font-semibold mb-2">Descrição</h4>
                <p className="text-sm">{selectedFinding.description}</p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Análise de IA</h4>
                <div className="bg-muted p-4 rounded text-sm whitespace-pre-wrap">
                  {selectedFinding.ai_analysis}
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Detalhes Completos</h4>
                <pre className="bg-muted p-4 rounded text-xs overflow-x-auto">
                  {JSON.stringify(selectedFinding.details, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FindingsTable;
