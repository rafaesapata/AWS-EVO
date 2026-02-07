import { useState, useMemo } from "react";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
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
  CheckSquare,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Minus,
  History,
  FileCheck
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart as RechartsPieChart, Cell, Pie, LineChart, Line, AreaChart, Area } from "recharts";

interface SecurityFinding {
  id: string;
  title?: string;  // May not exist - use description as fallback
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'new' | 'active' | 'resolved' | 'reopened' | 'suppressed' | 'pending';
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
  const { selectedAccountId, selectedProvider } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();
  const { data: organizationId } = useOrganization();
  const { user } = useAuthSafe();
  const queryClient = useQueryClient();
  const { shouldEnableAccountQuery } = useDemoAwareQuery();
  const [selectedStandard, setSelectedStandard] = useState<string>('all');
  const [selectedFindings, setSelectedFindings] = useState<string[]>([]);
  const [creatingTicketId, setCreatingTicketId] = useState<string | null>(null);
  const [creatingBatchTickets, setCreatingBatchTickets] = useState(false);
  const [historyDays, setHistoryDays] = useState(30);
  
  // Findings filters, search and pagination state
  const [findingsSearch, setFindingsSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Get security posture data - enabled in demo mode even without account
  const { data: securityData, isLoading, refetch } = useQuery({
    queryKey: ['security-posture-page', organizationId, selectedAccountId, selectedProvider],
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
      }>('get-security-posture', { accountId: selectedAccountId, provider: selectedProvider });

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
            critical: Number(posture.findings.critical) || 0,
            high: Number(posture.findings.high) || 0,
            medium: Number(posture.findings.medium) || 0,
            low: Number(posture.findings.low) || 0
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
          eq: { organization_id: organizationId, ...getAccountFilter() },
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
        eq: { organization_id: organizationId, ...getAccountFilter() },
        order: { column: 'created_at', ascending: false },
        limit: 50
      });

      return {
        overall_score: posture.overallScore,
        risk_level: posture.riskLevel,
        findings_by_severity: {
          critical: Number(posture.findings.critical) || 0,
          high: Number(posture.findings.high) || 0,
          medium: Number(posture.findings.medium) || 0,
          low: Number(posture.findings.low) || 0
        },
        compliance_scores: {},
        findings: findingsResponse.data || [],
        hasData: true
      };
    },
  });

  // Get compliance data from compliance checks
  const { data: complianceData, isLoading: isLoadingCompliance } = useQuery({
    queryKey: ['compliance-data-posture', organizationId, selectedAccountId],
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!organizationId) return null;
      
      // Buscar compliance checks do banco
      let filters: any = {
        'security_scans.organization_id': organizationId
      };
      
      if (selectedAccountId) {
        filters['security_scans.aws_account_id'] = selectedAccountId;
      }
      
      const result = await apiClient.select('compliance_checks', {
        select: `
          *,
          security_scans!inner(organization_id, aws_account_id)
        `,
        ...filters,
        order: { created_at: 'desc' }
      });
      
      if (result.error) {
        console.error('Error fetching compliance checks:', result.error);
        return null;
      }
      
      const checks = result.data || [];
      
      if (checks.length === 0) return null;
      
      // Agrupar por framework e calcular scores
      const frameworkStats: Record<string, { passed: number; failed: number; total: number; score: number }> = {};
      
      for (const check of checks) {
        const framework = check.framework || 'unknown';
        if (!frameworkStats[framework]) {
          frameworkStats[framework] = { passed: 0, failed: 0, total: 0, score: 0 };
        }
        
        frameworkStats[framework].total++;
        if (check.status === 'passed') {
          frameworkStats[framework].passed++;
        } else if (check.status === 'failed') {
          frameworkStats[framework].failed++;
        }
      }
      
      // Calcular scores
      for (const [framework, stats] of Object.entries(frameworkStats)) {
        const applicable = stats.passed + stats.failed;
        stats.score = applicable > 0 ? Math.round((stats.passed / applicable) * 100) : 0;
      }
      
      return {
        frameworks: frameworkStats,
        totalChecks: checks.length,
        passedChecks: checks.filter((c: any) => c.status === 'passed').length,
        failedChecks: checks.filter((c: any) => c.status === 'failed').length,
      };
    },
  });

  // Get compliance history for trends
  const { data: complianceHistory, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['compliance-history-posture', organizationId, selectedAccountId, historyDays],
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!organizationId) return null;
      
      const result = await apiClient.invoke('get-compliance-history', {
        body: {
          days: historyDays,
          accountId: selectedAccountId || undefined,
        }
      });
      
      if (result.error) {
        console.error('Compliance history error:', result.error);
        return null;
      }
      
      const data = result.data as any;
      return {
        posture_history: data?.posture_history || [],
        framework_stats: data?.framework_stats || {},
        total_scans: data?.total_scans || 0,
        overall_trend: data?.overall_trend || 'stable',
        summary: {
          current_score: data?.summary?.current_score ?? null,
          previous_score: data?.summary?.previous_score ?? null,
          score_change: data?.summary?.score_change ?? 0,
        },
        recent_critical_findings: data?.recent_critical_findings || [],
      };
    },
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Chamar o endpoint que recalcula a postura de segurança
      const response = await apiClient.invoke('get-security-posture', { accountId: selectedAccountId, provider: selectedProvider });
      
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

  // Select all findings on current page (filtered)
  const selectAllFindings = () => {
    if (!paginatedFindings || paginatedFindings.length === 0) return;
    const pageIds = paginatedFindings.map((f: SecurityFinding) => f.id);
    const allSelected = pageIds.every((id: string) => selectedFindings.includes(id));
    
    if (allSelected) {
      // Deselect all on current page
      setSelectedFindings(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
      // Select all on current page
      setSelectedFindings(prev => [...new Set([...prev, ...pageIds])]);
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

      const accountFilter = getAccountFilter();
      
      const response = await apiClient.insert('remediation_tickets', {
        organization_id: organizationId,
        ...accountFilter, // Multi-cloud compatible: sets aws_account_id OR azure_credential_id
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
      queryClient.invalidateQueries({ queryKey: ['remediation-tickets'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['security-posture-page'] });
      queryClient.invalidateQueries({ queryKey: ['security-findings'] });
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
    count: Number(count) || 0,
    color: getSeverityColor(severity)
  }));

  // Use compliance data from complianceData query instead of securityData
  const complianceChartData = complianceData?.frameworks 
    ? Object.entries(complianceData.frameworks).map(([standard, stats]) => ({
        standard: standard.toUpperCase(),
        score: stats.score,
        passed: stats.passed,
        failed: stats.failed,
        total: stats.total,
        color: stats.score >= 80 ? '#10b981' : stats.score >= 60 ? '#f59e0b' : '#ef4444'
      }))
    : Object.entries(securityData?.compliance_scores || {}).map(([standard, score]) => ({
        standard,
        score: Math.round(score as number),
        color: (score as number) >= 80 ? '#10b981' : (score as number) >= 60 ? '#f59e0b' : '#ef4444'
      }));

  // Prepare trend data from history
  const trendData = complianceHistory?.posture_history?.map((p: any) => ({
    date: new Date(p.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    fullDate: p.date,
    score: p.compliance_score || p.overall_score || 0,
    overallScore: p.overall_score || 0,
    critical: p.critical_findings || 0,
    high: p.high_findings || 0,
    medium: p.medium_findings || 0,
    low: p.low_findings || 0,
  })) || [];

  // Helper function for trend icon
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'declining': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTrendLabel = (trend: string) => {
    switch (trend) {
      case 'improving': return t('securityPosture.improving', 'Melhorando');
      case 'declining': return t('securityPosture.declining', 'Piorando');
      default: return t('securityPosture.stable', 'Estável');
    }
  };

  // Get unique services from findings for filter dropdown
  const uniqueServices = useMemo(() => {
    if (!securityData?.findings) return [];
    const services = new Set<string>();
    securityData.findings.forEach((f: SecurityFinding) => {
      if (f.service) services.add(f.service);
    });
    return Array.from(services).sort();
  }, [securityData?.findings]);

  // Filter and search findings
  const filteredFindings = useMemo(() => {
    if (!securityData?.findings) return [];
    
    let filtered = [...securityData.findings];
    
    // Apply search filter
    if (findingsSearch.trim()) {
      const searchLower = findingsSearch.toLowerCase().trim();
      filtered = filtered.filter((f: SecurityFinding) => 
        (f.title?.toLowerCase().includes(searchLower)) ||
        (f.description?.toLowerCase().includes(searchLower)) ||
        (f.service?.toLowerCase().includes(searchLower)) ||
        (f.resource_id?.toLowerCase().includes(searchLower)) ||
        (f.resource_arn?.toLowerCase().includes(searchLower)) ||
        (f.resource?.toLowerCase().includes(searchLower)) ||
        (f.category?.toLowerCase().includes(searchLower))
      );
    }
    
    // Apply severity filter
    if (severityFilter !== 'all') {
      filtered = filtered.filter((f: SecurityFinding) => 
        f.severity?.toLowerCase() === severityFilter.toLowerCase()
      );
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((f: SecurityFinding) => 
        f.status?.toLowerCase() === statusFilter.toLowerCase()
      );
    }
    
    // Apply service filter
    if (serviceFilter !== 'all') {
      filtered = filtered.filter((f: SecurityFinding) => 
        f.service === serviceFilter
      );
    }
    
    return filtered;
  }, [securityData?.findings, findingsSearch, severityFilter, statusFilter, serviceFilter]);

  // Paginated findings
  const paginatedFindings = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredFindings.slice(startIndex, endIndex);
  }, [filteredFindings, currentPage, itemsPerPage]);

  // Pagination info
  const totalPages = Math.ceil(filteredFindings.length / itemsPerPage);
  const totalFilteredCount = filteredFindings.length;
  const showingFrom = totalFilteredCount === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const showingTo = Math.min(currentPage * itemsPerPage, totalFilteredCount);

  // Reset to page 1 when filters change
  const handleSearchChange = (value: string) => {
    setFindingsSearch(value);
    setCurrentPage(1);
  };

  const handleSeverityFilterChange = (value: string) => {
    setSeverityFilter(value);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handleServiceFilterChange = (value: string) => {
    setServiceFilter(value);
    setCurrentPage(1);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  // Clear all filters
  const clearFilters = () => {
    setFindingsSearch('');
    setSeverityFilter('all');
    setStatusFilter('all');
    setServiceFilter('all');
    setCurrentPage(1);
  };

  const hasActiveFilters = findingsSearch || severityFilter !== 'all' || statusFilter !== 'all' || serviceFilter !== 'all';

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
                {Object.values(securityData.findings_by_severity || {}).reduce((sum, count) => sum + (Number(count) || 0), 0)}
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
                  <CardTitle>{t('securityPosture.securityFindings', 'Findings de Segurança')}</CardTitle>
                  <CardDescription>{t('securityPosture.findingsListDesc', 'Lista detalhada dos achados de segurança')}</CardDescription>
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
                      {paginatedFindings.length > 0 && paginatedFindings.every((f: SecurityFinding) => selectedFindings.includes(f.id))
                        ? t('common.deselectAll', 'Desmarcar Todos')
                        : t('common.selectAll', 'Selecionar Todos')}
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
                          ? t('common.creating', 'Criando...')
                          : t('securityPosture.createTicketsCount', 'Criar {{count}} Ticket(s)', { count: selectedFindings.length })}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search and Filters */}
              {securityData?.findings && securityData.findings.length > 0 && (
                <div className="space-y-4">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={t('securityPosture.searchFindings', 'Buscar por título, descrição, serviço ou recurso...')}
                      value={findingsSearch}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  
                  {/* Filters Row */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{t('common.filters', 'Filtros')}:</span>
                    </div>
                    
                    {/* Severity Filter */}
                    <Select value={severityFilter} onValueChange={handleSeverityFilterChange}>
                      <SelectTrigger className="w-[140px] h-9">
                        <SelectValue placeholder={t('securityPosture.severity', 'Severidade')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('common.all', 'Todas')}</SelectItem>
                        <SelectItem value="critical">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-600" />
                            Critical
                          </span>
                        </SelectItem>
                        <SelectItem value="high">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-orange-500" />
                            High
                          </span>
                        </SelectItem>
                        <SelectItem value="medium">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-yellow-500" />
                            Medium
                          </span>
                        </SelectItem>
                        <SelectItem value="low">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500" />
                            Low
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {/* Status Filter */}
                    <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                      <SelectTrigger className="w-[130px] h-9">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('common.all', 'Todos')}</SelectItem>
                        <SelectItem value="new">{t('status.new', 'Novo')}</SelectItem>
                        <SelectItem value="active">{t('status.active', 'Ativo')}</SelectItem>
                        <SelectItem value="reopened">{t('status.reopened', 'Reaberto')}</SelectItem>
                        <SelectItem value="resolved">{t('status.resolved', 'Resolvido')}</SelectItem>
                        <SelectItem value="pending">{t('status.pending', 'Pendente')}</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {/* Service Filter */}
                    {uniqueServices.length > 0 && (
                      <Select value={serviceFilter} onValueChange={handleServiceFilterChange}>
                        <SelectTrigger className="w-[150px] h-9">
                          <SelectValue placeholder={t('common.service', 'Serviço')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('common.all', 'Todos')}</SelectItem>
                          {uniqueServices.map((service) => (
                            <SelectItem key={service} value={service}>
                              {service}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    
                    {/* Clear Filters Button */}
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="h-9 text-muted-foreground hover:text-foreground"
                      >
                        {t('common.clearFilters', 'Limpar filtros')}
                      </Button>
                    )}
                    
                    {/* Results count */}
                    <div className="ml-auto text-sm text-muted-foreground">
                      {hasActiveFilters ? (
                        <span>
                          {t('securityPosture.showingFiltered', '{{filtered}} de {{total}} findings', {
                            filtered: totalFilteredCount,
                            total: securityData.findings.length
                          })}
                        </span>
                      ) : (
                        <span>
                          {t('securityPosture.totalFindingsCount', '{{count}} findings', { count: securityData.findings.length })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Findings List */}
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : paginatedFindings && paginatedFindings.length > 0 ? (
                <div className="space-y-4">
                  {paginatedFindings.map((finding: SecurityFinding) => {
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
                              <h4 className="font-semibold text-sm">{finding.title || finding.description?.substring(0, 80)}</h4>
                              <p className="text-sm text-muted-foreground line-clamp-2">{finding.description}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                {finding.service && <span>{finding.service}</span>}
                                {finding.service && (finding.resource_id || finding.resource_arn || finding.resource) && <span>•</span>}
                                {(finding.resource_id || finding.resource_arn || finding.resource) && (
                                  <span className="truncate max-w-[200px]" title={finding.resource_arn || finding.resource_id || finding.resource}>
                                    {finding.resource_id || finding.resource_arn || finding.resource}
                                  </span>
                                )}
                                {(finding.resource_id || finding.resource_arn || finding.resource) && finding.region && <span>•</span>}
                                {finding.region && <span>{finding.region}</span>}
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
                            <p className="text-sm font-medium mb-2">{t('securityPosture.remediation', 'Remediação')}:</p>
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
                                        <p className="text-sm font-medium mb-1">{t('securityPosture.steps', 'Passos')}:</p>
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
                                          {t('securityPosture.effort', 'Esforço')}: {remediation.estimated_effort}
                                        </Badge>
                                      )}
                                      {remediation.automation_available && (
                                        <Badge variant="secondary">
                                          {t('securityPosture.automationAvailable', 'Automação Disponível')}
                                        </Badge>
                                      )}
                                    </div>
                                    
                                    {remediation.cli_command && (
                                      <div className="mt-2">
                                        <p className="text-xs font-medium mb-1">{t('securityPosture.cliCommand', 'Comando CLI')}:</p>
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
              ) : securityData?.findings && securityData.findings.length > 0 && hasActiveFilters ? (
                <div className="text-center py-8">
                  <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">{t('securityPosture.noMatchingFindings', 'Nenhum finding encontrado')}</h3>
                  <p className="text-muted-foreground mb-4">
                    {t('securityPosture.tryDifferentFilters', 'Tente ajustar os filtros ou termos de busca.')}
                  </p>
                  <Button variant="outline" onClick={clearFilters}>
                    {t('common.clearFilters', 'Limpar filtros')}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-success" />
                  <h3 className="text-lg font-semibold mb-2">{t('securityPosture.noFindingsFound', 'Nenhum finding encontrado')}</h3>
                  <p className="text-muted-foreground">
                    {t('securityPosture.infrastructureCompliant', 'Sua infraestrutura está em conformidade com as verificações de segurança.')}
                  </p>
                </div>
              )}

              {/* Pagination */}
              {paginatedFindings && paginatedFindings.length > 0 && totalPages > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{t('common.showing', 'Mostrando')}</span>
                    <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
                      <SelectTrigger className="w-[70px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                    <span>
                      {t('common.ofTotal', 'de {{total}}', { total: totalFilteredCount })}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground mr-2">
                      {showingFrom}-{showingTo} {t('common.of', 'de')} {totalFilteredCount}
                    </span>
                    
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    
                    <span className="px-3 text-sm">
                      {t('common.page', 'Página')} {currentPage} {t('common.of', 'de')} {totalPages}
                    </span>
                    
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t('securityPosture.complianceStatus', 'Status de Compliance')}</CardTitle>
                  <CardDescription>{t('securityPosture.complianceDesc', 'Conformidade com padrões de segurança')}</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.href = '/compliance'}
                  className="gap-2"
                >
                  <FileCheck className="h-4 w-4" />
                  {t('securityPosture.viewFullCompliance', 'Ver Compliance Completo')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading || isLoadingCompliance ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : complianceChartData.length > 0 ? (
                <div className="space-y-6">
                  {/* Compliance Chart */}
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={complianceChartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          type="number" 
                          domain={[0, 100]}
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis 
                          type="category" 
                          dataKey="standard" 
                          width={100}
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <Tooltip 
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          formatter={(value: number, name: string, props: any) => {
                            const item = props.payload;
                            return [
                              <div key="tooltip" className="space-y-1">
                                <div className="font-semibold">{value}%</div>
                                {item.passed !== undefined && (
                                  <div className="text-xs text-muted-foreground">
                                    {item.passed} {t('securityPosture.passed', 'aprovados')} / {item.total} {t('securityPosture.total', 'total')}
                                  </div>
                                )}
                              </div>,
                              'Score'
                            ];
                          }}
                        />
                        <Bar 
                          dataKey="score" 
                          fill="#3b82f6"
                          radius={[0, 4, 4, 0]}
                        >
                          {complianceChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Framework Details */}
                  <div className="space-y-4">
                    {complianceChartData.map((framework) => (
                      <div key={framework.standard} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-sm">{framework.standard}</h4>
                          <Badge 
                            variant={framework.score >= 80 ? "default" : framework.score >= 60 ? "secondary" : "destructive"}
                          >
                            {framework.score}%
                          </Badge>
                        </div>
                        <Progress value={framework.score} className="h-2" />
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-sm text-muted-foreground">
                            {framework.score >= 80 ? t('securityPosture.excellentCompliance', 'Excelente conformidade') : 
                             framework.score >= 60 ? t('securityPosture.adequateCompliance', 'Conformidade adequada') : 
                             t('securityPosture.needsAttention', 'Requer atenção imediata')}
                          </p>
                          {framework.passed !== undefined && (
                            <p className="text-xs text-muted-foreground">
                              <span className="text-green-500">{framework.passed}</span> / {framework.total} {t('securityPosture.controls', 'controles')}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">{t('securityPosture.noComplianceData', 'Nenhum dado de compliance')}</h3>
                  <p className="text-muted-foreground mb-4">
                    {t('securityPosture.runComplianceScan', 'Execute verificações de compliance para ver os resultados aqui.')}
                  </p>
                  <Button 
                    variant="outline"
                    onClick={() => window.location.href = '/compliance'}
                  >
                    <FileCheck className="h-4 w-4 mr-2" />
                    {t('securityPosture.goToCompliance', 'Ir para Compliance')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          {/* Trend Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('securityPosture.currentScore', 'Score Atual')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingHistory ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-semibold">
                    {complianceHistory?.summary?.current_score != null 
                      ? `${complianceHistory.summary.current_score}%` 
                      : '--'}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('securityPosture.scoreChange', 'Variação')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingHistory ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className={`text-2xl font-semibold flex items-center gap-2 ${
                    (complianceHistory?.summary?.score_change || 0) > 0 ? 'text-green-500' :
                    (complianceHistory?.summary?.score_change || 0) < 0 ? 'text-red-500' : ''
                  }`}>
                    {complianceHistory?.summary?.score_change !== undefined && complianceHistory?.summary?.score_change !== 0 ? (
                      <>
                        {(complianceHistory?.summary?.score_change ?? 0) > 0 ? '+' : ''}
                        {complianceHistory?.summary?.score_change}%
                      </>
                    ) : '--'}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  {t('securityPosture.trend', 'Tendência')}
                  {complianceHistory?.overall_trend && getTrendIcon(complianceHistory.overall_trend)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingHistory ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className="text-lg font-semibold">
                    {complianceHistory?.overall_trend ? getTrendLabel(complianceHistory.overall_trend) : '--'}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('securityPosture.totalScans', 'Total de Scans')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingHistory ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <div className="text-2xl font-semibold">
                    {complianceHistory?.total_scans || 0}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Period Selector */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{t('securityPosture.period', 'Período')}:</span>
            <Select value={String(historyDays)} onValueChange={(v) => setHistoryDays(Number(v))}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t('securityPosture.last7Days', 'Últimos 7 dias')}</SelectItem>
                <SelectItem value="30">{t('securityPosture.last30Days', 'Últimos 30 dias')}</SelectItem>
                <SelectItem value="90">{t('securityPosture.last90Days', 'Últimos 90 dias')}</SelectItem>
                <SelectItem value="180">{t('securityPosture.last180Days', 'Últimos 180 dias')}</SelectItem>
                <SelectItem value="365">{t('securityPosture.lastYear', 'Último ano')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Score Evolution Chart */}
          <Card>
            <CardHeader>
              <CardTitle>{t('securityPosture.scoreEvolution', 'Evolução do Score de Segurança')}</CardTitle>
              <CardDescription>{t('securityPosture.scoreEvolutionDesc', 'Acompanhe a evolução da postura de segurança ao longo do tempo')}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingHistory ? (
                <Skeleton className="h-[300px] w-full" />
              ) : trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    />
                    <YAxis 
                      domain={[0, 100]}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number, name: string) => {
                        const labels: Record<string, string> = {
                          score: t('securityPosture.complianceScore', 'Score Compliance'),
                          overallScore: t('securityPosture.overallScore', 'Score Geral'),
                        };
                        return [`${value}%`, labels[name] || name];
                      }}
                    />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="score" 
                      stroke="#3b82f6" 
                      fillOpacity={1} 
                      fill="url(#colorScore)"
                      name={t('securityPosture.complianceScore', 'Score Compliance')}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="overallScore" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      dot={false}
                      name={t('securityPosture.overallScore', 'Score Geral')}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <History className="h-12 w-12 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">{t('securityPosture.noHistoricalData', 'Sem dados históricos')}</h3>
                    <p className="text-sm">{t('securityPosture.runScansForHistory', 'Execute scans de segurança para começar a acumular histórico.')}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Findings Evolution Chart */}
          <Card>
            <CardHeader>
              <CardTitle>{t('securityPosture.findingsEvolution', 'Evolução de Findings')}</CardTitle>
              <CardDescription>{t('securityPosture.findingsEvolutionDesc', 'Quantidade de findings por severidade ao longo do tempo')}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingHistory ? (
                <Skeleton className="h-[300px] w-full" />
              ) : trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    />
                    <YAxis 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="critical" stackId="a" fill="#dc2626" name="Critical" />
                    <Bar dataKey="high" stackId="a" fill="#ea580c" name="High" />
                    <Bar dataKey="medium" stackId="a" fill="#d97706" name="Medium" />
                    <Bar dataKey="low" stackId="a" fill="#65a30d" name="Low" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">{t('securityPosture.noFindingsHistory', 'Sem histórico de findings')}</h3>
                    <p className="text-sm">{t('securityPosture.runScansForFindings', 'Execute scans para ver a evolução dos findings.')}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Framework Stats */}
          {complianceHistory?.framework_stats && Object.keys(complianceHistory.framework_stats).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('securityPosture.frameworkTrends', 'Tendências por Framework')}</CardTitle>
                <CardDescription>{t('securityPosture.frameworkTrendsDesc', 'Evolução de compliance por framework de segurança')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(complianceHistory.framework_stats).map(([framework, stats]: [string, any]) => (
                    <div key={framework} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold">{framework.toUpperCase()}</h4>
                        {getTrendIcon(stats.trend)}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t('securityPosture.latestScore', 'Score Atual')}</span>
                          <Badge variant={stats.latest_score >= 80 ? "default" : stats.latest_score >= 60 ? "secondary" : "destructive"}>
                            {stats.latest_score}%
                          </Badge>
                        </div>
                        <Progress value={stats.latest_score} className="h-2" />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{t('securityPosture.avgScore', 'Média')}: {stats.avg_score}%</span>
                          <span>{stats.total_scans} {t('securityPosture.scans', 'scans')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Critical Findings */}
          {complianceHistory?.recent_critical_findings && complianceHistory.recent_critical_findings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  {t('securityPosture.recentCriticalFindings', 'Findings Críticos Recentes')}
                </CardTitle>
                <CardDescription>{t('securityPosture.recentCriticalDesc', 'Últimos findings críticos de compliance que requerem atenção')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {complianceHistory.recent_critical_findings.map((finding: any, index: number) => (
                    <div key={index} className="border rounded-lg p-3 border-red-200 bg-red-50/50 dark:bg-red-950/20">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="destructive" className="text-xs">{finding.framework?.toUpperCase()}</Badge>
                            <span className="text-sm font-medium">{finding.control_id}</span>
                          </div>
                          <p className="text-sm">{finding.control_name}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(finding.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </Layout>
  );
}