import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Layout } from "@/components/Layout";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useOrganization } from "@/hooks/useOrganization";
import { 
  ArrowLeft,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Bug,
  Ticket,
  Copy,
  Download,
  ChevronDown,
  ChevronRight,
  Info
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface SecurityScan {
  id: string;
  scan_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  findings_count: number | null;
  critical_count: number | null;
  high_count: number | null;
  medium_count: number | null;
  low_count: number | null;
  scan_config: any;
  results: any;
  created_at: string;
}

interface Finding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  details: any;
  resource_id: string;
  resource_arn: string;
  service: string;
  category: string;
  scan_type: string;
  compliance: string[];
  remediation: string;
  evidence: any;
  risk_vector: string;
  source: string;
  status: string;
  created_at: string;
}

export default function SecurityScanDetails() {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: organizationId } = useOrganization();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());
  const [selectedFindings, setSelectedFindings] = useState<Set<string>>(new Set());

  // Get scan details
  const { data: scan, isLoading: scanLoading } = useQuery({
    queryKey: ['security-scan', scanId, organizationId],
    enabled: !!scanId && !!organizationId,
    queryFn: async () => {
      const response = await apiClient.select('security_scans', {
        select: '*',
        eq: { id: scanId, organization_id: organizationId },
        order: { column: 'created_at', ascending: false },
        limit: 1
      });

      if (response.error) {
        throw new Error(response.error.message || 'Error fetching scan');
      }

      const scans = response.data as SecurityScan[];
      return scans?.[0] || null;
    },
  });

  // Get scan findings
  const { data: findings, isLoading: findingsLoading } = useQuery({
    queryKey: ['scan-findings', scanId, organizationId],
    enabled: !!scanId && !!organizationId,
    queryFn: async () => {
      const response = await apiClient.select('findings', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          source: 'security-engine'
        },
        order: { column: 'created_at', ascending: false }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Error fetching findings');
      }

      return (response.data as Finding[]) || [];
    },
  });

  // Create remediation ticket
  const createTicketMutation = useMutation({
    mutationFn: async ({ findingIds, title, description }: { findingIds: string[], title: string, description: string }) => {
      const response = await apiClient.invoke('create-remediation-ticket', {
        body: {
          findingIds,
          title,
          description,
          priority: 'high',
          organizationId
        }
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Ticket criado",
        description: "Ticket de remediação criado com sucesso.",
      });
      setSelectedFindings(new Set());
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar ticket",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  });

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle className="h-4 w-4 text-red-600" />;
      case 'high': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'medium': return <Bug className="h-4 w-4 text-yellow-500" />;
      case 'low': return <Info className="h-4 w-4 text-blue-500" />;
      case 'info': return <CheckCircle className="h-4 w-4 text-green-500" />;
      default: return <Bug className="h-4 w-4 text-gray-500" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive">Crítico</Badge>;
      case 'high': return <Badge variant="destructive">Alto</Badge>;
      case 'medium': return <Badge variant="secondary">Médio</Badge>;
      case 'low': return <Badge variant="outline">Baixo</Badge>;
      case 'info': return <Badge variant="outline">Info</Badge>;
      default: return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge className="bg-yellow-500">Pendente</Badge>;
      case 'in_progress': return <Badge className="bg-blue-500">Em Progresso</Badge>;
      case 'resolved': return <Badge className="bg-green-500">Resolvido</Badge>;
      case 'dismissed': return <Badge variant="outline">Descartado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const toggleFindingExpansion = (findingId: string) => {
    const newExpanded = new Set(expandedFindings);
    if (newExpanded.has(findingId)) {
      newExpanded.delete(findingId);
    } else {
      newExpanded.add(findingId);
    }
    setExpandedFindings(newExpanded);
  };

  const toggleFindingSelection = (findingId: string) => {
    const newSelected = new Set(selectedFindings);
    if (newSelected.has(findingId)) {
      newSelected.delete(findingId);
    } else {
      newSelected.add(findingId);
    }
    setSelectedFindings(newSelected);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado",
      description: "Texto copiado para a área de transferência.",
    });
  };

  // Filter findings
  const filteredFindings = findings?.filter(finding => {
    const matchesSearch = !searchTerm || 
      finding.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      finding.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      finding.resource_id?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSeverity = severityFilter === 'all' || finding.severity === severityFilter;
    const matchesService = serviceFilter === 'all' || finding.service === serviceFilter;
    const matchesStatus = statusFilter === 'all' || finding.status === statusFilter;

    return matchesSearch && matchesSeverity && matchesService && matchesStatus;
  }) || [];

  // Get unique services for filter
  const uniqueServices = [...new Set(findings?.map(f => f.service).filter(Boolean) || [])];

  if (scanLoading) {
    return (
      <Layout title="Carregando..." description="Carregando detalhes do scan...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  if (!scan) {
    return (
      <Layout title="Scan não encontrado" description="O scan solicitado não foi encontrado.">
        <div className="text-center py-12">
          <XCircle className="h-16 w-16 mx-auto mb-4 text-red-500" />
          <h3 className="text-xl font-semibold mb-2">Scan não encontrado</h3>
          <p className="text-muted-foreground mb-4">
            O scan solicitado não foi encontrado ou você não tem permissão para visualizá-lo.
          </p>
          <Button onClick={() => navigate('/security-scans')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar aos Scans
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout 
      title={`Security Scan - ${scan.scan_type}`}
      description="Detalhes completos do scan de segurança"
      icon={<Shield className="h-7 w-7 text-white" />}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/security-scans')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar aos Scans
          </Button>
          
          <div className="flex items-center gap-2">
            {selectedFindings.size > 0 && (
              <CreateTicketDialog 
                selectedFindings={Array.from(selectedFindings)}
                findings={findings || []}
                onCreateTicket={createTicketMutation.mutate}
                isLoading={createTicketMutation.isPending}
              />
            )}
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Exportar Relatório
            </Button>
          </div>
        </div>

        {/* Scan Overview */}
        <Card className="glass border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-6 w-6 text-primary" />
                  {scan.scan_type.replace('_', ' ').replace('-', ' ').toUpperCase()}
                </CardTitle>
                <CardDescription>
                  Executado em {new Date(scan.started_at).toLocaleString('pt-BR')}
                  {scan.completed_at && ` • Concluído em ${new Date(scan.completed_at).toLocaleString('pt-BR')}`}
                </CardDescription>
              </div>
              <div className="text-right">
                {scan.status === 'completed' ? (
                  <CheckCircle className="h-8 w-8 text-green-500" />
                ) : scan.status === 'running' ? (
                  <Clock className="h-8 w-8 text-blue-500 animate-spin" />
                ) : (
                  <XCircle className="h-8 w-8 text-red-500" />
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {scan.status === 'completed' && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{scan.findings_count || 0}</div>
                  <div className="text-sm text-muted-foreground">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{scan.critical_count || 0}</div>
                  <div className="text-sm text-muted-foreground">Críticos</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-500">{scan.high_count || 0}</div>
                  <div className="text-sm text-muted-foreground">Altos</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-500">{scan.medium_count || 0}</div>
                  <div className="text-sm text-muted-foreground">Médios</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-500">{scan.low_count || 0}</div>
                  <div className="text-sm text-muted-foreground">Baixos</div>
                </div>
              </div>
            )}
            
            {scan.results && (
              <div className="mt-4 p-4 bg-muted/30 rounded-lg">
                <h4 className="font-semibold mb-2">Métricas do Scan</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <strong>Duração:</strong> {Math.round((scan.results.duration_ms || 0) / 1000)}s
                  </div>
                  <div>
                    <strong>Serviços:</strong> {scan.results.services_scanned || 0}
                  </div>
                  <div>
                    <strong>Regiões:</strong> {scan.results.regions_scanned || 0}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Findings Section */}
        <Card className="glass border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Achados de Segurança</CardTitle>
                <CardDescription>
                  {filteredFindings.length} de {findings?.length || 0} achados
                  {selectedFindings.size > 0 && ` • ${selectedFindings.size} selecionados`}
                </CardDescription>
              </div>
            </div>
            
            {/* Filters */}
            <div className="flex flex-wrap gap-4 mt-4">
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="Buscar achados..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="glass"
                />
              </div>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-[150px] glass">
                  <SelectValue placeholder="Severidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="critical">Crítico</SelectItem>
                  <SelectItem value="high">Alto</SelectItem>
                  <SelectItem value="medium">Médio</SelectItem>
                  <SelectItem value="low">Baixo</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
              <Select value={serviceFilter} onValueChange={setServiceFilter}>
                <SelectTrigger className="w-[150px] glass">
                  <SelectValue placeholder="Serviço" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {uniqueServices.map(service => (
                    <SelectItem key={service} value={service}>{service}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px] glass">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="in_progress">Em Progresso</SelectItem>
                  <SelectItem value="resolved">Resolvido</SelectItem>
                  <SelectItem value="dismissed">Descartado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {findingsLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-20 bg-muted/30 rounded animate-pulse" />
                ))}
              </div>
            ) : filteredFindings.length > 0 ? (
              <div className="space-y-4">
                {filteredFindings.map((finding) => (
                  <FindingCard
                    key={finding.id}
                    finding={finding}
                    isExpanded={expandedFindings.has(finding.id)}
                    isSelected={selectedFindings.has(finding.id)}
                    onToggleExpansion={() => toggleFindingExpansion(finding.id)}
                    onToggleSelection={() => toggleFindingSelection(finding.id)}
                    onCopyToClipboard={copyToClipboard}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <CheckCircle className="h-16 w-16 mx-auto mb-4 text-success" />
                <h3 className="text-xl font-semibold mb-2">Nenhum achado encontrado</h3>
                <p className="text-muted-foreground">
                  {searchTerm || severityFilter !== 'all' || serviceFilter !== 'all' || statusFilter !== 'all'
                    ? 'Nenhum achado corresponde aos filtros aplicados.'
                    : 'Nenhuma vulnerabilidade ou problema foi identificado neste scan.'
                  }
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

// Finding Card Component
function FindingCard({ 
  finding, 
  isExpanded, 
  isSelected, 
  onToggleExpansion, 
  onToggleSelection, 
  onCopyToClipboard 
}: {
  finding: Finding;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpansion: () => void;
  onToggleSelection: () => void;
  onCopyToClipboard: (text: string) => void;
}) {
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle className="h-4 w-4 text-red-600" />;
      case 'high': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'medium': return <Bug className="h-4 w-4 text-yellow-500" />;
      case 'low': return <Info className="h-4 w-4 text-blue-500" />;
      case 'info': return <CheckCircle className="h-4 w-4 text-green-500" />;
      default: return <Bug className="h-4 w-4 text-gray-500" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive">Crítico</Badge>;
      case 'high': return <Badge variant="destructive">Alto</Badge>;
      case 'medium': return <Badge variant="secondary">Médio</Badge>;
      case 'low': return <Badge variant="outline">Baixo</Badge>;
      case 'info': return <Badge variant="outline">Info</Badge>;
      default: return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge className="bg-yellow-500">Pendente</Badge>;
      case 'in_progress': return <Badge className="bg-blue-500">Em Progresso</Badge>;
      case 'resolved': return <Badge className="bg-green-500">Resolvido</Badge>;
      case 'dismissed': return <Badge variant="outline">Descartado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  let remediation: any;
  try {
    remediation = typeof finding.remediation === 'string' 
      ? JSON.parse(finding.remediation) 
      : finding.remediation;
  } catch {
    remediation = { description: finding.remediation };
  }

  return (
    <div className={`border rounded-lg p-4 transition-all ${isSelected ? 'ring-2 ring-primary' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelection}
            className="mt-1"
          />
          {getSeverityIcon(finding.severity)}
          <div className="space-y-2 flex-1">
            <div className="flex items-start justify-between">
              <h4 className="font-semibold text-sm">{finding.title}</h4>
              <div className="flex items-center gap-2">
                {getSeverityBadge(finding.severity)}
                {getStatusBadge(finding.status)}
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground">{finding.description}</p>
            
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span><strong>Serviço:</strong> {finding.service}</span>
              <span><strong>Categoria:</strong> {finding.category}</span>
              <span><strong>Recurso:</strong> {finding.resource_id}</span>
            </div>

            {finding.compliance && finding.compliance.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {finding.compliance.map((comp, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {comp}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleExpansion}
        >
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>

      <Collapsible open={isExpanded}>
        <CollapsibleContent className="mt-4 space-y-4">
          <Separator />
          
          {/* Details */}
          {finding.details && (
            <div>
              <h5 className="font-semibold text-sm mb-2">Detalhes Técnicos</h5>
              <div className="bg-muted/30 rounded p-3 text-sm">
                {typeof finding.details === 'object' ? (
                  <pre className="whitespace-pre-wrap">{JSON.stringify(finding.details, null, 2)}</pre>
                ) : (
                  <p>{finding.details}</p>
                )}
              </div>
            </div>
          )}

          {/* Resource Information */}
          <div>
            <h5 className="font-semibold text-sm mb-2">Informações do Recurso</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Resource ID:</strong>
                <div className="flex items-center gap-2 mt-1">
                  <code className="bg-muted px-2 py-1 rounded text-xs">{finding.resource_id}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onCopyToClipboard(finding.resource_id)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div>
                <strong>Resource ARN:</strong>
                <div className="flex items-center gap-2 mt-1">
                  <code className="bg-muted px-2 py-1 rounded text-xs break-all">{finding.resource_arn}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onCopyToClipboard(finding.resource_arn)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Remediation */}
          {remediation && (
            <div>
              <h5 className="font-semibold text-sm mb-2">Ações de Remediação</h5>
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded p-4 space-y-3">
                {remediation.description && (
                  <p className="text-sm">{remediation.description}</p>
                )}
                
                {remediation.steps && remediation.steps.length > 0 && (
                  <div>
                    <strong className="text-sm">Passos:</strong>
                    <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                      {remediation.steps.map((step: string, index: number) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
                
                {remediation.cli_command && (
                  <div>
                    <strong className="text-sm">Comando CLI:</strong>
                    <div className="flex items-center gap-2 mt-2">
                      <code className="bg-muted px-3 py-2 rounded text-xs flex-1 overflow-x-auto">
                        {remediation.cli_command}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCopyToClipboard(remediation.cli_command)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
                
                {remediation.estimated_effort && (
                  <div className="text-sm">
                    <strong>Esforço Estimado:</strong> {remediation.estimated_effort}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Evidence */}
          {finding.evidence && (
            <div>
              <h5 className="font-semibold text-sm mb-2">Evidências</h5>
              <div className="bg-muted/30 rounded p-3 text-sm">
                <pre className="whitespace-pre-wrap">{JSON.stringify(finding.evidence, null, 2)}</pre>
              </div>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Create Ticket Dialog Component
function CreateTicketDialog({ 
  selectedFindings, 
  findings, 
  onCreateTicket, 
  isLoading 
}: {
  selectedFindings: string[];
  findings: Finding[];
  onCreateTicket: (data: { findingIds: string[], title: string, description: string }) => void;
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const selectedFindingObjects = findings.filter(f => selectedFindings.includes(f.id));
  const criticalCount = selectedFindingObjects.filter(f => f.severity === 'critical').length;
  const highCount = selectedFindingObjects.filter(f => f.severity === 'high').length;

  const handleSubmit = () => {
    if (!title.trim()) return;
    
    onCreateTicket({
      findingIds: selectedFindings,
      title: title.trim(),
      description: description.trim()
    });
    
    setOpen(false);
    setTitle("");
    setDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Ticket className="h-4 w-4 mr-2" />
          Criar Ticket ({selectedFindings.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Criar Ticket de Remediação</DialogTitle>
          <DialogDescription>
            Criar um ticket para remediar {selectedFindings.length} achados selecionados
            {criticalCount > 0 && ` (${criticalCount} críticos)`}
            {highCount > 0 && ` (${highCount} altos)`}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Título do Ticket</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Corrigir vulnerabilidades críticas de segurança"
              className="mt-1"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Descrição</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva as ações necessárias para remediar os achados..."
              className="mt-1"
              rows={4}
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Achados Incluídos</label>
            <div className="mt-2 max-h-40 overflow-y-auto space-y-2">
              {selectedFindingObjects.map(finding => (
                <div key={finding.id} className="flex items-center gap-2 text-sm p-2 bg-muted/30 rounded">
                  <Badge variant={finding.severity === 'critical' ? 'destructive' : 'secondary'}>
                    {finding.severity}
                  </Badge>
                  <span className="flex-1">{finding.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!title.trim() || isLoading}
          >
            {isLoading ? "Criando..." : "Criar Ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}