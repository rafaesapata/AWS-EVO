import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layout } from "@/components/Layout";
import { Checkbox } from "@/components/ui/checkbox";
import { apiClient } from "@/integrations/aws/api-client";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuthSafe } from "@/hooks/useAuthSafe";
import { useDemoAwareQuery } from "@/hooks/useDemoAwareQuery";
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  TrendingUp,
  TrendingDown,
  Eye,
  Lock,
  Key,
  Network,
  Database,
  Cloud,
  RefreshCw,
  Download,
  BarChart3,
  PieChart,
  Ticket,
  CheckSquare
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart as RechartsPieChart, Cell, Pie, LineChart, Line } from "recharts";

interface SecurityFinding {
  id: string;
  title?: string;  // May not exist - use description as fallback
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'active' | 'resolved' | 'suppressed' | 'pending';
  resource?: string;  // Legacy field
  resource_id?: string;  // Actual DB field
  resource_arn?: string;  // Actual DB field
  service?: string;
  region?: string;
  category?: string;
  compliance_standards?: string[];
  compliance?: string[];  // Actual DB field
  remediation?: string;
  remediation_ticket_id?: string;  // Link to ticket
  details?: Record<string, unknown>;  // JSON field from DB
  created_at: string;
  updated_at: string;
}

interface SecurityMetrics {
  overall_score: number;
  findings_by_severity: Record<string, number>;
  compliance_scores: Record<string, number>;
  trend_data: Array<{ date: string; score: number; findings: number }>;
  top_risks: SecurityFinding[];
}

export default function SecurityPosture() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { selectedAccountId } = useCloudAccount();
  const { data: organizationId } = useOrganization();
  const { user } = useAuthSafe();
  const queryClient = useQueryClient();
  const { shouldEnableAccountQuery } = useDemoAwareQuery();
  const [selectedStandard, setSelectedStandard] = useState<string>('all');
  const [selectedFindings, setSelectedFindings] = useState<string[]>([]);
  const [creatingTicketId, setCreatingTicketId] = useState<string | null>(null);
  const [creatingBatchTickets, setCreatingBatchTickets] = useState(false);

  // Get security posture data - enabled in demo mode even without account
  const { data: securityData, isLoading, refetch } = useQuery({
    queryKey: ['security-posture-page', organizationId, selectedAccountId],
    enabled: shouldEnableAccountQuery(),
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      // Chamar o endpoint que calcula a postura de segurança
      const postureResponse = await apiClient.invoke<{
        success: boolean;
        _isDemo?: boolean;
        posture: {
          overallScore: number;
          riskLevel: string;
          findings: {
            critical: number;
            high: number;
            medium: number;
            low: number;
            total: number;
          };
          calculatedAt: string;
        };
      }>('get-security-posture', { accountId: selectedAccountId });

      if ('error' in postureResponse && postureResponse.error) {
        throw new Error(postureResponse.error.message);
      }

      const responseData = postureResponse.data;
      const posture = responseData?.posture;
      const isDemo = responseData?._isDemo === true;
      
      // If demo mode, use demo data FROM THE BACKEND (never generate locally)
      // SEGURANÇA: Dados demo vêm do backend, frontend apenas renderiza
      if (isDemo && posture) {
        console.log('SecurityPosture: Using demo data from backend');
        
        // Usar findings demo que vieram do backend
        const demoFindings = responseData?.demoFindings || [];
        const complianceScores = responseData?.complianceScores || {};
        
        // Transformar findings do backend para o formato esperado pelo frontend
        const transformedFindings = demoFindings.map((f: any) => ({
          id: f.id,
          title: f.title,
          description: f.description,
          severity: f.severity,
          status: f.status || 'active',
          service: f.service,
          resource_id: f.resource_id,
          region: 'us-east-1',
          remediation: f.remediation,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          _isDemo: true
        }));
        
        return {
          overall_score: posture.overallScore,
          risk_level: posture.riskLevel,
          findings_by_severity: {
            critical: posture.findings.critical,
            high: posture.findings.high,
            medium: posture.findings.medium,
            low: posture.findings.low
          },
          compliance_scores: complianceScores,
          findings: transformedFindings,
          hasData: true,
          _isDemo: true
        };
      }
      
      // Se não há findings, retornar null para indicar estado vazio
      if (!posture || posture.findings.total === 0) {
        // Buscar findings da tabela Finding para exibir detalhes
        const findingsResponse = await apiClient.select('findings', {
          select: '*',
          eq: { organization_id: organizationId, aws_account_id: selectedAccountId },
          order: { column: 'created_at', ascending: false },
          limit: 50
        });

        const findings = findingsResponse.data || [];
        
        if (findings.length === 0) {
          return null;
        }

        // Calcular métricas dos findings
        const findingsBySeverity = findings.reduce((acc: Record<string, number>, finding: any) => {
          const severity = (finding.severity || 'low').toLowerCase();
          acc[severity] = (acc[severity] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        return {
          overall_score: posture?.overallScore || 100,
          risk_level: posture?.riskLevel || 'low',
          findings_by_severity: findingsBySeverity,
          compliance_scores: {},
          findings: findings,
          hasData: true
        };
      }

      // Buscar findings da tabela Finding para exibir detalhes
      const findingsResponse = await apiClient.select('findings', {
        select: '*',
        eq: { organization_id: organizationId, aws_account_id: selectedAccountId },
        order: { column: 'created_at', ascending: false },
        limit: 50
      });

      return {
        overall_score: posture.overallScore,
        risk_level: posture.riskLevel,
        findings_by_severity: {
          critical: posture.findings.critical,
          high: posture.findings.high,
          medium: posture.findings.medium,
          low: posture.findings.low
        },
        compliance_scores: {},
        findings: findingsResponse.data || [],
        hasData: true
      };
    },
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Chamar o endpoint que recalcula a postura de segurança
      const response = await apiClient.invoke('get-security-posture', { accountId: selectedAccountId });
      
      if ('error' in response && response.error) {
        throw new Error(response.error.message);
      }
      
      // Após recalcular, buscar os dados atualizados
      await refetch();
      
      toast({
        title: t('securityPosture.dataUpdated', 'Data updated'),
        description: t('securityPosture.postureRecalculated', 'Security posture was recalculated successfully.'),
      });
    } catch (error) {
      toast({
        title: t('securityPosture.errorUpdating', 'Error updating'),
        description: error instanceof Error ? error.message : t('securityPosture.couldNotUpdate', 'Could not update security data.'),
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const exportReport = () => {
    if (!securityData) return;

    const reportData = {
      timestamp: new Date().toISOString(),
      account_id: selectedAccountId,
      overall_score: securityData.overall_score,
      findings_summary: securityData.findings_by_severity,
      compliance_scores: securityData.compliance_scores,
      top_findings: securityData.findings?.slice(0, 10)
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `security_posture_${selectedAccountId}_${new Date().toISOString().split('T')[0]}.json`;
    link.click();

    toast({
      title: t('securityPosture.reportExported', 'Report exported'),
      description: t('securityPosture.reportExportedDesc', 'Security report was exported successfully.'),
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#dc2626';
      case 'high': return '#ea580c';
      case 'medium': return '#d97706';
      case 'low': return '#65a30d';
      default: return '#6b7280';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return XCircle;
      case 'high': return AlertTriangle;
      case 'medium': return Eye;
      case 'low': return CheckCircle;
      default: return AlertTriangle;
    }
  };

  const complianceStandards = [
    { key: 'all', name: 'Todos os Padrões' },
    { key: 'cis', name: 'CIS Benchmarks' },
    { key: 'pci', name: 'PCI DSS' },
    { key: 'soc2', name: 'SOC 2' },
    { key: 'iso27001', name: 'ISO 27001' },
    { key: 'nist', name: 'NIST Framework' }
  ];

  // Toggle finding selection
  const toggleFindingSelection = (findingId: string) => {
    setSelectedFindings(prev => 
      prev.includes(findingId) 
        ? prev.filter(id => id !== findingId)
        : [...prev, findingId]
    );
  };

  // Select all findings on current page
  const selectAllFindings = () => {
    if (!securityData?.findings) return;
    const allIds = securityData.findings.map((f: SecurityFinding) => f.id);
    const allSelected = allIds.every((id: string) => selectedFindings.includes(id));
    
    if (allSelected) {
      setSelectedFindings([]);
    } else {
      setSelectedFindings(allIds);
    }
  };

  // Create ticket for a single finding
  const createTicketForFinding = async (finding: SecurityFinding) => {
    if (creatingTicketId === finding.id) return;
    
    // Check if finding already has a ticket
    if (finding.remediation_ticket_id) {
      toast({ 
        title: t('securityPosture.ticketAlreadyExists', 'Ticket já existe'),
        description: t('securityPosture.ticketAlreadyExistsDesc', 'Este achado já possui um ticket de remediação vinculado'),
        variant: "destructive" 
      });
      return;
    }
    
    setCreatingTicketId(finding.id);
    
    try {
      // Helper to get a valid title - handles undefined/null cases
      const getTitle = () => {
        // Check various possible title sources
        if (finding.title) return finding.title;
        if (finding.details && typeof finding.details === 'object') {
          const details = finding.details as Record<string, unknown>;
          if (details.title && typeof details.title === 'string') return details.title;
          if (details.check_name && typeof details.check_name === 'string') return details.check_name;
        }
        if (finding.description && finding.description.length <= 100) return finding.description;
        if (finding.description) return finding.description.substring(0, 100) + '...';
        return 'Security Finding';
      };

      // Helper to get affected resources - filters out null/undefined values
      const getAffectedResources = (): string[] => {
        const resources: string[] = [];
        // Check all possible resource fields
        if (finding.resource_arn) resources.push(finding.resource_arn);
        else if (finding.resource_id) resources.push(finding.resource_id);
        else if (finding.resource) resources.push(finding.resource);
        return resources;
      };

      // Get compliance standards from either field
      const getComplianceStandards = (): string[] => {
        if (finding.compliance_standards && finding.compliance_standards.length > 0) {
          return finding.compliance_standards;
        }
        if (finding.compliance && finding.compliance.length > 0) {
          return finding.compliance;
        }
        return [];
      };

      const response = await apiClient.insert('remediation_tickets', {
        organization_id: organizationId,
        aws_account_id: selectedAccountId || null,
        title: `[${(finding.severity || 'medium').toUpperCase()}] ${getTitle()}`,
        description: (finding.description || 'No description available') + (finding.remediation ? `\n\nRemediação: ${typeof finding.remediation === 'string' ? finding.remediation : JSON.stringify(finding.remediation)}` : ''),
        severity: finding.severity || 'medium',
        priority: finding.severity === 'critical' ? 'urgent' : finding.severity === 'high' ? 'high' : 'medium',
        status: 'open',
        category: finding.category || 'security',
        created_by: user?.email || 'system',
        finding_ids: [finding.id],
        affected_resources: getAffectedResources(),
        metadata: {
          service: finding.service || 'unknown',
          region: finding.region || 'unknown',
          compliance_standards: getComplianceStandards()
        }
      });

      if ('error' in response && response.error) {
        console.error('Error creating ticket:', response.error);
        throw new Error(response.error.message || 'Failed to create ticket');
      }

      // Get the created ticket ID and update the finding
      const ticketId = response.data?.id;
      if (ticketId) {
        // Update the finding with the ticket ID to create the bidirectional link
        // apiClient.update expects (table, data, where)
        await apiClient.update('findings', { remediation_ticket_id: ticketId }, { id: finding.id });
      }

      toast({ 
        title: t('dashboard.ticketCreated', 'Ticket criado'),
        description: t('dashboard.ticketCreatedSuccess', 'Ticket de remediação criado com sucesso')
      });
      
      // Invalidate both queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['remediation-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['security-posture-page'] });
    } catch (err) {
      console.error('Error creating ticket:', err);
      toast({ 
        title: t('dashboard.errorCreatingTicket', 'Erro ao criar ticket'), 
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: "destructive" 
      });
    } finally {
      setCreatingTicketId(null);
    }
  };

  // Create tickets for selected findings
  const createTicketsForSelected = async () => {
    if (selectedFindings.length === 0) {
      toast({ 
        title: t('compliance.selectChecks', 'Selecione pelo menos um finding'), 
        variant: "destructive" 
      });
      return;
    }

    setCreatingBatchTickets(true);
    
    try {
      const findingsToCreate = securityData?.findings?.filter((f: SecurityFinding) => 
        selectedFindings.includes(f.id) && !f.remediation_ticket_id  // Skip findings that already have tickets
      ) || [];

      if (findingsToCreate.length === 0) {
        toast({ 
          title: t('securityPosture.allHaveTickets', 'Todos os achados selecionados já possuem tickets'),
          variant: "destructive" 
        });
        setCreatingBatchTickets(false);
        return;
      }

      let createdCount = 0;
      for (const finding of findingsToCreate) {
        await createTicketForFinding(finding);
        createdCount++;
      }

      toast({ 
        title: t('securityPosture.ticketsCreatedCount', '{{count}} ticket(s) criado(s) com sucesso', { count: createdCount })
      });
      setSelectedFindings([]);
    } catch (error) {
      toast({ 
        title: t('compliance.ticketsError', 'Erro ao criar tickets'), 
        variant: "destructive" 
      });
    } finally {
      setCreatingBatchTickets(false);
    }
  };

  // Prepare chart data
  const severityChartData = Object.entries(securityData?.findings_by_severity || {}).map(([severity, count]) => ({
    severity: severity.charAt(0).toUpperCase() + severity.slice(1),
    count,
    color: getSeverityColor(severity)
  }));

  const complianceChartData = Object.entries(securityData?.compliance_scores || {}).map(([standard, score]) => ({
    standard,
    score: Math.round(score),
    color: score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'
  }));

  return (
    <Layout 
      title={t('sidebar.securityPosture', 'Postura de Segurança')} 
      description={t('securityPosture.description', 'Visão abrangente da segurança e compliance da sua infraestrutura AWS')}
      icon={<Shield className="h-4 w-4" />}
    >
      <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Analisando...' : 'Atualizar'}
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={exportReport}
          disabled={!securityData}
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar Relatório
        </Button>
      </div>

      {/* Security Score Overview */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Security Score</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-12 w-20" />
            ) : !securityData ? (
              <div className="space-y-2">
                <div className="text-3xl font-semibold text-muted-foreground">
                  --/100
                </div>
                <Progress value={0} className="h-2" />
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Eye className="h-4 w-4" />
                  <span>{t('securityPosture.noData', 'No data')}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-3xl font-semibold">
                  {securityData.overall_score}/100
                </div>
                <Progress value={securityData.overall_score} className="h-2" />
                <div className="flex items-center gap-1 text-sm">
                  {securityData.overall_score >= 80 ? (
                    <>
                      <TrendingUp className="h-4 w-4 text-success" />
                      <span className="text-success">{t('securityPosture.excellent', 'Excellent')}</span>
                    </>
                  ) : securityData.overall_score >= 60 ? (
                    <>
                      <Eye className="h-4 w-4 text-warning" />
                      <span className="text-warning">{t('securityPosture.attention', 'Attention')}</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="h-4 w-4 text-destructive" />
                      <span className="text-destructive">{t('securityPosture.critical', 'Critical')}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('securityPosture.criticalFindings', 'Critical Findings')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : !securityData ? (
              <div className="text-3xl font-semibold text-muted-foreground">--</div>
            ) : (
              <div className="text-3xl font-semibold text-destructive">
                {securityData.findings_by_severity?.critical || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('securityPosture.highFindings', 'High Findings')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : !securityData ? (
              <div className="text-3xl font-semibold text-muted-foreground">--</div>
            ) : (
              <div className="text-3xl font-semibold text-warning">
                {securityData.findings_by_severity?.high || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('securityPosture.totalFindings', 'Total Findings')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : !securityData ? (
              <div className="text-3xl font-semibold text-muted-foreground">--</div>
            ) : (
              <div className="text-3xl font-semibold">
                {Object.values(securityData.findings_by_severity || {}).reduce((sum, count) => sum + count, 0)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts and Details */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="glass-card-float">
          <TabsTrigger value="overview">{t('securityPosture.overview', 'Overview')}</TabsTrigger>
          <TabsTrigger value="findings">{t('securityPosture.findings', 'Findings')}</TabsTrigger>
          <TabsTrigger value="compliance">{t('securityPosture.compliance', 'Compliance')}</TabsTrigger>
          <TabsTrigger value="trends">{t('securityPosture.trends', 'Trends')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Findings by Severity */}
            <Card>
              <CardHeader>
                <CardTitle>{t('securityPosture.findingsBySeverity', 'Findings by Severity')}</CardTitle>
                <CardDescription>{t('securityPosture.findingsDistribution', 'Distribution of security findings')}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : severityChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPieChart>
                      <Pie
                        data={severityChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ severity, count }) => `${severity}: ${count}`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="count"
                      >
                        {severityChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Nenhum finding encontrado
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Compliance Scores */}
            <Card>
              <CardHeader>
                <CardTitle>Scores de Compliance</CardTitle>
                <CardDescription>Conformidade com padrões de segurança</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : complianceChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={complianceChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="standard" 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        domain={[0, 100]}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => [`${value}%`, 'Score']}
                      />
                      <Bar dataKey="score" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Nenhum dado de compliance disponível
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="findings" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle>Findings de Segurança</CardTitle>
                  <CardDescription>Lista detalhada dos achados de segurança</CardDescription>
                </div>
                {securityData?.findings && securityData.findings.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectAllFindings}
                      className="gap-2"
                    >
                      <CheckSquare className="h-4 w-4" />
                      {selectedFindings.length === securityData.findings.length 
                        ? 'Desmarcar Todos' 
                        : 'Selecionar Todos'}
                    </Button>
                    {selectedFindings.length > 0 && (
                      <Button
                        onClick={createTicketsForSelected}
                        disabled={creatingBatchTickets}
                        size="sm"
                        className="gap-2"
                      >
                        <Ticket className="h-4 w-4" />
                        {creatingBatchTickets 
                          ? 'Criando...' 
                          : `Criar ${selectedFindings.length} Ticket(s)`}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : securityData?.findings && securityData.findings.length > 0 ? (
                <div className="space-y-4">
                  {securityData.findings.map((finding) => {
                    const SeverityIcon = getSeverityIcon(finding.severity);
                    const isSelected = selectedFindings.includes(finding.id);
                    return (
                      <div 
                        key={finding.id} 
                        className={`border rounded-lg p-4 space-y-3 transition-colors ${
                          isSelected ? 'border-primary bg-primary/5' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleFindingSelection(finding.id)}
                              className="mt-1"
                            />
                            <SeverityIcon 
                              className="h-5 w-5 mt-0.5" 
                              style={{ color: getSeverityColor(finding.severity) }}
                            />
                            <div className="space-y-1">
                              <h4 className="font-semibold text-sm">{finding.title}</h4>
                              <p className="text-sm text-muted-foreground">{finding.description}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{finding.service}</span>
                                <span>•</span>
                                <span>{finding.resource}</span>
                                <span>•</span>
                                <span>{finding.region}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {finding.remediation_ticket_id ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled
                                title={t('securityPosture.ticketLinked', 'Ticket já vinculado')}
                                className="h-8 w-8 p-0 text-green-500"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => createTicketForFinding(finding)}
                                disabled={creatingTicketId === finding.id}
                                title={t('securityPosture.createTicket', 'Criar ticket de remediação')}
                                className="h-8 w-8 p-0"
                              >
                                <Ticket className={`h-4 w-4 ${creatingTicketId === finding.id ? 'animate-pulse' : ''}`} />
                              </Button>
                            )}
                            <Badge 
                              variant="outline"
                              style={{ 
                                borderColor: getSeverityColor(finding.severity),
                                color: getSeverityColor(finding.severity)
                              }}
                            >
                              {(finding.severity || 'medium').toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                        
                        {((finding.compliance_standards && finding.compliance_standards.length > 0) || (finding.compliance && finding.compliance.length > 0)) && (
                          <div className="flex gap-2 flex-wrap">
                            {(finding.compliance_standards || finding.compliance || []).map((standard) => (
                              <Badge key={standard} variant="secondary" className="text-xs">
                                {standard}
                              </Badge>
                            ))}
                          </div>
                        )}
                        
                        {finding.remediation && (
                          <div className="bg-muted/30 rounded p-3 space-y-2">
                            <p className="text-sm font-medium mb-2">Remediação:</p>
                            {(() => {
                              try {
                                const remediation = typeof finding.remediation === 'string' 
                                  ? JSON.parse(finding.remediation) 
                                  : finding.remediation;
                                
                                return (
                                  <div className="space-y-3">
                                    {remediation.description && (
                                      <p className="text-sm text-muted-foreground">{remediation.description}</p>
                                    )}
                                    
                                    {remediation.steps && remediation.steps.length > 0 && (
                                      <div>
                                        <p className="text-sm font-medium mb-1">Passos:</p>
                                        <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                                          {remediation.steps.map((step: string, idx: number) => (
                                            <li key={idx}>{step}</li>
                                          ))}
                                        </ol>
                                      </div>
                                    )}
                                    
                                    <div className="flex gap-4 text-xs">
                                      {remediation.estimated_effort && (
                                        <Badge variant="outline" className="capitalize">
                                          Esforço: {remediation.estimated_effort}
                                        </Badge>
                                      )}
                                      {remediation.automation_available && (
                                        <Badge variant="secondary">
                                          Automação Disponível
                                        </Badge>
                                      )}
                                    </div>
                                    
                                    {remediation.cli_command && (
                                      <div className="mt-2">
                                        <p className="text-xs font-medium mb-1">Comando CLI:</p>
                                        <code className="block text-xs bg-muted p-2 rounded overflow-x-auto">
                                          {remediation.cli_command}
                                        </code>
                                      </div>
                                    )}
                                  </div>
                                );
                              } catch (e) {
                                // Fallback para texto simples se não for JSON válido
                                return <p className="text-sm text-muted-foreground">{finding.remediation}</p>;
                              }
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-success" />
                  <h3 className="text-lg font-semibold mb-2">Nenhum finding encontrado</h3>
                  <p className="text-muted-foreground">
                    Sua infraestrutura está em conformidade com as verificações de segurança.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="space-y-6">
          <Card >
            <CardHeader>
              <CardTitle>Status de Compliance</CardTitle>
              <CardDescription>Conformidade com padrões de segurança</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : Object.entries(securityData?.compliance_scores || {}).length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(securityData.compliance_scores).map(([standard, score]) => (
                    <div key={standard} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-sm">{standard.toUpperCase()}</h4>
                        <Badge 
                          variant={score >= 80 ? "default" : score >= 60 ? "secondary" : "destructive"}
                        >
                          {Math.round(score)}%
                        </Badge>
                      </div>
                      <Progress value={score} className="h-2" />
                      <p className="text-sm text-muted-foreground mt-2">
                        {score >= 80 ? 'Excelente conformidade' : 
                         score >= 60 ? 'Conformidade adequada' : 
                         'Requer atenção imediata'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Nenhum dado de compliance</h3>
                  <p className="text-muted-foreground">
                    Execute verificações de compliance para ver os resultados aqui.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <Card >
            <CardHeader>
              <CardTitle>Tendências de Segurança</CardTitle>
              <CardDescription>Evolução da postura de segurança ao longo do tempo</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Dados históricos em desenvolvimento</h3>
                  <p>As tendências de segurança serão exibidas aqui em breve.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </Layout>
  );
}