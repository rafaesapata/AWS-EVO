import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layout } from "@/components/Layout";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { 
  Scan, 
  Shield, 
  AlertTriangle, 
  CheckCircle,
  XCircle,
  Clock,
  Play,
  RefreshCw,
  Download,
  Eye,
  Bug,
  Lock,
  Zap,
  Activity,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from "lucide-react";

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
  created_at: string;
}

interface ScanFinding {
  id: string;
  scan_id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  resource_type: string;
  resource_id: string;
  region: string;
  remediation: string;
  compliance_standards: string[];
  cve_id: string | null;
  cvss_score: number | null;
}

export default function SecurityScans() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedAccountId } = useAwsAccount();
  const { data: organizationId } = useOrganization();
  const [selectedScanType, setSelectedScanType] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

  // Get security scans
  const { data: scanData, isLoading, refetch } = useQuery({
    queryKey: ['security-scans', organizationId, selectedAccountId, selectedScanType, currentPage, itemsPerPage],
    enabled: !!organizationId, // Only require organizationId, accountId is optional
    staleTime: 10 * 1000, // 10 seconds - faster updates for running scans
    refetchInterval: (query) => {
      // Auto-refresh every 5 seconds if there are running scans
      const data = query.state.data as { scans: SecurityScan[], total: number } | undefined;
      const hasRunningScans = data?.scans?.some(scan => scan.status === 'running');
      return hasRunningScans ? 5000 : false;
    },
    queryFn: async () => {
      console.log('SecurityScans: Fetching scans', { organizationId, selectedAccountId, selectedScanType, currentPage, itemsPerPage });
      
      let filters: any = { 
        organization_id: organizationId
      };
      
      // Only filter by account if one is selected
      if (selectedAccountId) {
        filters.aws_account_id = selectedAccountId;
      }

      if (selectedScanType !== 'all') {
        filters.scan_type = selectedScanType;
      }

      // Calculate offset for pagination
      const offset = (currentPage - 1) * itemsPerPage;

      const response = await apiClient.select('security_scans', {
        select: '*',
        eq: filters,
        order: { column: 'created_at', ascending: false },
        limit: itemsPerPage,
        offset: offset
      });

      console.log('SecurityScans: API response', { error: response.error, dataLength: response.data?.length, data: response.data });

      if (response.error) {
        throw new Error(response.error.message || 'Error fetching scans');
      }

      // Get total count for pagination (separate query)
      const countResponse = await apiClient.select('security_scans', {
        select: 'id',
        eq: filters
      });
      
      const totalCount = countResponse.data?.length || 0;

      // Ensure we always return an array
      const scans = Array.isArray(response.data) ? response.data : [];
      return { scans, total: totalCount };
    },
  });

  const scans = scanData?.scans || [];
  const totalScans = scanData?.total || 0;
  const totalPages = Math.ceil(totalScans / itemsPerPage);

  // Reset to first page when filters change
  const handleScanTypeChange = (scanType: string) => {
    setSelectedScanType(scanType);
    setCurrentPage(1);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(parseInt(value));
    setCurrentPage(1);
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // Get scan findings for the latest completed scan
  const { data: findings, isLoading: findingsLoading } = useQuery({
    queryKey: ['scan-findings', organizationId, selectedAccountId],
    enabled: !!organizationId && scans && scans.length > 0,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const latestCompletedScan = scans?.find(scan => scan.status === 'completed');
      if (!latestCompletedScan) return [];

      const filters: any = { 
        organization_id: organizationId
      };

      const response = await apiClient.select('findings', {
        select: '*',
        eq: filters,
        order: { column: 'created_at', ascending: false },
        limit: 100
      });

      if (response.error) {
        console.error('Error fetching findings:', response.error);
        return [];
      }

      // Ensure we always return an array
      return Array.isArray(response.data) ? response.data : [];
    },
  });

  // Start new scan using Security Engine V3
  const startScanMutation = useMutation({
    mutationFn: async ({ scanLevel }: { scanLevel: 'quick' | 'standard' | 'deep' }) => {
      console.log('🔍 Starting security scan...', { scanLevel, selectedAccountId });
      
      const response = await apiClient.invoke('start-security-scan', {
        body: {
          accountId: selectedAccountId,
          scanLevel
        }
      });

      console.log('📊 Security scan response:', response);

      if (response.error) {
        console.error('❌ Security scan error:', response.error);
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Security Scan Iniciado",
        description: "O scan de segurança AWS foi iniciado com sucesso usando o Security Engine V3.",
      });
      
      // Invalidate and refetch immediately
      queryClient.invalidateQueries({ queryKey: ['security-scans'] });
      
      // Force refetch after a short delay to ensure the scan is persisted
      setTimeout(() => {
        refetch();
      }, 2000);
    },
    onError: (error) => {
      console.error('❌ Start scan mutation error:', error);
      
      let errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      
      // Mensagens de erro mais amigáveis
      if (errorMessage.includes('No AWS credentials')) {
        errorMessage = "Nenhuma credencial AWS ativa encontrada. Por favor, adicione uma credencial AWS antes de iniciar o scan.";
      }
      
      toast({
        title: "Erro ao iniciar scan",
        description: errorMessage,
        variant: "destructive"
      });
    }
  });

  const handleStartScan = (scanLevel: 'quick' | 'standard' | 'deep') => {
    startScanMutation.mutate({ scanLevel });
  };

  const handleRefresh = async () => {
    try {
      await refetch();
      toast({
        title: "Dados atualizados",
        description: "Os scans de segurança foram atualizados.",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar os dados.",
        variant: "destructive"
      });
    }
  };

  const exportFindings = () => {
    if (!findings) return;

    const csvContent = [
      'Severidade,Título,Descrição,Tipo de Recurso,ID do Recurso,Região,CVE,CVSS Score',
      ...findings.map(finding => [
        finding.severity,
        `"${finding.title}"`,
        `"${finding.description}"`,
        finding.resource_type,
        finding.resource_id,
        finding.region,
        finding.cve_id || '',
        finding.cvss_score || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `security_findings_${selectedAccountId}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    toast({
      title: "Relatório exportado",
      description: "Os achados de segurança foram exportados com sucesso.",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'scheduled': return <Clock className="h-4 w-4 text-yellow-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running': return <Badge className="bg-blue-500">Executando</Badge>;
      case 'completed': return <Badge className="bg-green-500">Concluído</Badge>;
      case 'failed': return <Badge variant="destructive">Falhou</Badge>;
      case 'scheduled': return <Badge variant="secondary">Agendado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle className="h-4 w-4 text-red-600" />;
      case 'high': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'medium': return <Eye className="h-4 w-4 text-yellow-500" />;
      case 'low': return <CheckCircle className="h-4 w-4 text-green-500" />;
      default: return <Bug className="h-4 w-4 text-gray-500" />;
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

  const getScanTypeIcon = (scanType: string) => {
    if (scanType.includes('quick')) return <Zap className="h-5 w-5 text-yellow-500" />;
    if (scanType.includes('standard')) return <Shield className="h-5 w-5 text-blue-500" />;
    if (scanType.includes('deep')) return <Activity className="h-5 w-5 text-purple-500" />;
    return <Scan className="h-5 w-5 text-gray-500" />;
  };

  // Calculate summary metrics - ensure scans is always an array
  const scansArray = scans || [];
  const runningScans = scansArray.filter(scan => scan.status === 'running').length;
  const completedScans = scansArray.filter(scan => scan.status === 'completed').length;
  const totalFindings = scansArray.reduce((sum, scan) => sum + (scan.findings_count || 0), 0);
  const criticalFindings = scansArray.reduce((sum, scan) => sum + (scan.critical_count || 0), 0);

  const scanLevels = [
    { 
      value: 'quick', 
      label: 'Quick Scan', 
      description: 'Verificações essenciais de segurança (5-10 min)',
      icon: <Zap className="h-5 w-5 text-yellow-500" />,
      checks: '50+ verificações',
      time: '5-10 min'
    },
    { 
      value: 'standard', 
      label: 'Standard Scan', 
      description: 'Análise completa de segurança AWS (15-30 min)',
      icon: <Shield className="h-5 w-5 text-blue-500" />,
      checks: '120+ verificações',
      time: '15-30 min'
    },
    { 
      value: 'deep', 
      label: 'Deep Scan', 
      description: 'Análise profunda com compliance frameworks (30-60 min)',
      icon: <Activity className="h-5 w-5 text-purple-500" />,
      checks: '170+ verificações',
      time: '30-60 min'
    }
  ];

  return (
    <Layout 
      title="Security Scan" 
      description="Execute scans de segurança AWS usando o Security Engine V3 com 170+ verificações"
      icon={<Shield className="h-7 w-7 text-white" />}
    >
      <div className="space-y-6">
      {/* Header */}
      <Card className="glass border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                Security Scan - Engine V3
              </CardTitle>
              <CardDescription>
                Análise completa de segurança AWS com 23 scanners de serviços, 170+ verificações e suporte a 6 frameworks de compliance
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={isLoading}
                className="glass hover-glow transition-all duration-300 hover:scale-105"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'Atualizando...' : 'Atualizar'}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportFindings}
                className="glass hover-glow transition-all duration-300 hover:scale-105"
                disabled={!findings || findings.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar Achados
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass border-primary/20 hover-glow transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scans Executando</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-blue-500 animate-pulse">{runningScans}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20 hover-glow transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scans Concluídos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-green-500">{completedScans}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20 hover-glow transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Achados</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">{totalFindings}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20 hover-glow transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Achados Críticos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-red-500">{criticalFindings}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="glass border-primary/20 hover-glow transition-all duration-300">
        <CardHeader>
          <CardTitle>Iniciar Security Scan</CardTitle>
          <CardDescription>
            Escolha o nível de análise desejado. O Security Engine V3 suporta CIS, Well-Architected, PCI-DSS, NIST, LGPD e SOC2.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {scanLevels.map((scanLevel) => (
              <Button
                key={scanLevel.value}
                variant="outline"
                className="h-auto p-6 flex flex-col items-center gap-4 glass hover-glow transition-all duration-300 hover:scale-105"
                onClick={() => handleStartScan(scanLevel.value as 'quick' | 'standard' | 'deep')}
                disabled={startScanMutation.isPending}
              >
                <div className="p-3 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors">
                  {startScanMutation.isPending && scanLevel.value === 'standard' ? (
                    <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
                  ) : (
                    scanLevel.icon
                  )}
                </div>
                <div className="text-center space-y-2">
                  <div className="font-semibold text-lg">
                    {startScanMutation.isPending && scanLevel.value === 'standard' 
                      ? 'Iniciando...' 
                      : scanLevel.label
                    }
                  </div>
                  <div className="text-sm text-muted-foreground">{scanLevel.description}</div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{scanLevel.checks}</span>
                    <span>{scanLevel.time}</span>
                  </div>
                </div>
              </Button>
            ))}
          </div>
          
          <div className="mt-6 p-4 bg-muted/30 rounded-lg glass-hover">
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Security Engine V3 Features
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <strong>23 AWS Services:</strong> EC2, S3, IAM, RDS, Lambda, CloudTrail, GuardDuty, Config, CloudFormation, e mais
              </div>
              <div>
                <strong>6 Compliance Frameworks:</strong> CIS, Well-Architected, PCI-DSS, NIST, LGPD, SOC2
              </div>
              <div>
                <strong>170+ Security Checks:</strong> Configurações, permissões, criptografia, rede, logging
              </div>
              <div>
                <strong>Multi-Region:</strong> Análise automática em todas as regiões configuradas
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs defaultValue="scans" className="w-full">
        <TabsList className="glass">
          <TabsTrigger value="scans">Histórico de Scans</TabsTrigger>
          <TabsTrigger value="findings">Achados</TabsTrigger>
          <TabsTrigger value="schedule">Agendamento</TabsTrigger>
        </TabsList>

        <TabsContent value="scans" className="space-y-4">
          {/* Filters */}
          <Card className="glass border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Select value={selectedScanType} onValueChange={handleScanTypeChange}>
                    <SelectTrigger className="glass">
                      <SelectValue placeholder="Filtrar por tipo de scan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Níveis</SelectItem>
                      <SelectItem value="quick">Quick Scan</SelectItem>
                      <SelectItem value="standard">Standard Scan</SelectItem>
                      <SelectItem value="deep">Deep Scan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Scans List */}
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Histórico de Scans</CardTitle>
              <CardDescription>Lista de todos os scans executados</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : scans.length > 0 ? (
                <div className="space-y-4">
                  {scans.map((scan) => {
                    const TypeIcon = getScanTypeIcon(scan.scan_type);
                    return (
                      <div key={scan.id} className="glass-hover border rounded-lg p-4 space-y-3 hover-glow transition-all duration-300">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors">
                              {TypeIcon}
                            </div>
                            <div className="space-y-1">
                              <h4 className="font-semibold text-lg">{scan.scan_type}</h4>
                              <p className="text-sm text-muted-foreground">
                                Security Engine V3 - {scan.scan_type.replace('_', ' ').replace('-', ' ').toUpperCase()}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>Iniciado: {new Date(scan.started_at).toLocaleString('pt-BR')}</span>
                                {scan.completed_at && (
                                  <>
                                    <span>•</span>
                                    <span>Concluído: {new Date(scan.completed_at).toLocaleString('pt-BR')}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right space-y-2">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(scan.status)}
                              {getStatusBadge(scan.status)}
                            </div>
                          </div>
                        </div>
                        
                        {scan.status === 'completed' && (
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm animate-fade-in">
                            <div className="text-center p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                              <span className="text-muted-foreground">Total:</span>
                              <div className="font-medium text-lg">{scan.findings_count || 0}</div>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-red-50 hover:bg-red-100 transition-colors">
                              <span className="text-muted-foreground">Críticos:</span>
                              <div className="font-medium text-lg text-red-600">{scan.critical_count || 0}</div>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors">
                              <span className="text-muted-foreground">Altos:</span>
                              <div className="font-medium text-lg text-orange-500">{scan.high_count || 0}</div>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-yellow-50 hover:bg-yellow-100 transition-colors">
                              <span className="text-muted-foreground">Médios:</span>
                              <div className="font-medium text-lg text-yellow-500">{scan.medium_count || 0}</div>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-green-50 hover:bg-green-100 transition-colors">
                              <span className="text-muted-foreground">Baixos:</span>
                              <div className="font-medium text-lg text-green-500">{scan.low_count || 0}</div>
                            </div>
                          </div>
                        )}
                        
                        {scan.status === 'completed' && (
                          <div className="flex justify-end mt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/security-scans/${scan.id}`)}
                              className="hover-glow transition-all duration-300 hover:scale-105"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Ver Detalhes
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Scan className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">Nenhum scan executado</h3>
                  <p className="text-muted-foreground mb-4">
                    Execute seu primeiro scan de segurança para começar.
                  </p>
                  <Button onClick={() => handleStartScan('standard')}>
                    <Play className="h-4 w-4 mr-2" />
                    Executar Primeiro Scan
                  </Button>
                </div>
              )}

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-6 border-t mt-6">
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-muted-foreground">
                      Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, totalScans)} de {totalScans} scans
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Itens por página:</span>
                      <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5</SelectItem>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    
                    {/* Page numbers */}
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => goToPage(pageNum)}
                          className="w-8"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(totalPages)}
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

        <TabsContent value="findings" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Achados de Segurança</CardTitle>
              <CardDescription>Vulnerabilidades e problemas identificados no último scan</CardDescription>
            </CardHeader>
            <CardContent>
              {findingsLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : findings && findings.length > 0 ? (
                <div className="space-y-4">
                  {findings.map((finding) => (
                    <div key={finding.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          {getSeverityIcon(finding.severity)}
                          <div className="space-y-1">
                            <h4 className="font-semibold">{finding.title}</h4>
                            <p className="text-sm text-muted-foreground">{finding.description}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{finding.resource_type}</span>
                              <span>•</span>
                              <span>{finding.resource_id}</span>
                              <span>•</span>
                              <span>{finding.region}</span>
                              {finding.cve_id && (
                                <>
                                  <span>•</span>
                                  <span>CVE: {finding.cve_id}</span>
                                </>
                              )}
                              {finding.cvss_score && (
                                <>
                                  <span>•</span>
                                  <span>CVSS: {finding.cvss_score}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          {getSeverityBadge(finding.severity)}
                        </div>
                      </div>
                      
                      {finding.compliance_standards && finding.compliance_standards.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {finding.compliance_standards.map((standard) => (
                            <Badge key={standard} variant="outline" className="text-xs">
                              {standard}
                            </Badge>
                          ))}
                        </div>
                      )}
                      
                      {finding.remediation && (
                        <div className="bg-muted/30 rounded p-3">
                          <p className="text-sm font-medium mb-1">Remediação:</p>
                          <p className="text-sm text-muted-foreground">{finding.remediation}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <CheckCircle className="h-16 w-16 mx-auto mb-4 text-success" />
                  <h3 className="text-xl font-semibold mb-2">Nenhum achado encontrado</h3>
                  <p className="text-muted-foreground">
                    Nenhuma vulnerabilidade ou problema foi identificado no último scan.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Agendamento de Scans</CardTitle>
              <CardDescription>Configure scans automáticos recorrentes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Clock className="h-12 w-12 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Agendamento em desenvolvimento</h3>
                  <p>Sistema de agendamento automático será implementado em breve.</p>
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