import { useState } from "react";
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
import { apiClient } from "@/integrations/aws/api-client";
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
  Lock
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
  const queryClient = useQueryClient();
  const { selectedAccountId } = useAwsAccount();
  const { data: organizationId } = useOrganization();
  const [selectedScanType, setSelectedScanType] = useState<string>('all');

  // Get security scans
  const { data: scans, isLoading, refetch } = useQuery({
    queryKey: ['security-scans', organizationId, selectedAccountId, selectedScanType],
    enabled: !!organizationId, // Only require organizationId, accountId is optional
    staleTime: 30 * 1000, // 30 seconds for real-time updates
    queryFn: async () => {
      console.log('SecurityScans: Fetching scans', { organizationId, selectedAccountId, selectedScanType });
      
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

      const response = await apiClient.select('security_scans', {
        select: '*',
        eq: filters,
        order: { column: 'created_at', ascending: false }
      });

      console.log('SecurityScans: API response', { error: response.error, dataLength: response.data?.length, data: response.data });

      if (response.error) {
        throw new Error(response.error.message || 'Error fetching scans');
      }

      return response.data || [];
    },
  });

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

      return response.data || [];
    },
  });

  // Start new scan
  const startScanMutation = useMutation({
    mutationFn: async (scanType: string) => {
      const response = await apiClient.invoke('start-security-scan', {
        body: {
          scanType,
          accountId: selectedAccountId,
          organizationId
        }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Scan iniciado",
        description: "O scan de segurança foi iniciado com sucesso.",
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Erro ao iniciar scan",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  });

  const handleStartScan = (scanType: string) => {
    startScanMutation.mutate(scanType);
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
    switch (scanType) {
      case 'vulnerability': return <Bug className="h-5 w-5 text-red-500" />;
      case 'compliance': return <Shield className="h-5 w-5 text-blue-500" />;
      case 'configuration': return <Lock className="h-5 w-5 text-green-500" />;
      case 'network': return <Eye className="h-5 w-5 text-purple-500" />;
      default: return <Scan className="h-5 w-5 text-gray-500" />;
    }
  };

  // Calculate summary metrics
  const runningScans = scans?.filter(scan => scan.status === 'running').length || 0;
  const completedScans = scans?.filter(scan => scan.status === 'completed').length || 0;
  const totalFindings = scans?.reduce((sum, scan) => sum + (scan.findings_count || 0), 0) || 0;
  const criticalFindings = scans?.reduce((sum, scan) => sum + (scan.critical_count || 0), 0) || 0;

  const scanTypes = [
    { value: 'vulnerability', label: 'Vulnerabilidades', description: 'Scan de vulnerabilidades conhecidas' },
    { value: 'compliance', label: 'Compliance', description: 'Verificação de conformidade' },
    { value: 'configuration', label: 'Configuração', description: 'Análise de configurações de segurança' },
    { value: 'network', label: 'Rede', description: 'Scan de segurança de rede' }
  ];

  return (
    <Layout 
      title="Scans de Segurança" 
      description="Execute e monitore scans de segurança da sua infraestrutura AWS"
      icon={<Scan className="h-7 w-7 text-white" />}
    >
      <div className="space-y-6">
      {/* Header */}
      <Card className="glass border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Scan className="h-6 w-6 text-primary" />
                Scans de Segurança
              </CardTitle>
              <CardDescription>
                Scans automatizados de vulnerabilidades, compliance e configurações de segurança
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={isLoading}
                className="glass"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'Atualizando...' : 'Atualizar'}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportFindings}
                className="glass"
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
        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scans Executando</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-blue-500">{runningScans}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
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

        <Card className="glass border-primary/20">
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

        <Card className="glass border-primary/20">
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
      <Card className="glass border-primary/20">
        <CardHeader>
          <CardTitle>Iniciar Novo Scan</CardTitle>
          <CardDescription>Execute scans de segurança sob demanda</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {scanTypes.map((scanType) => {
              const Icon = getScanTypeIcon(scanType.value);
              return (
                <Button
                  key={scanType.value}
                  variant="outline"
                  className="h-auto p-4 flex flex-col items-center gap-3 glass hover-glow"
                  onClick={() => handleStartScan(scanType.value)}
                  disabled={startScanMutation.isPending}
                >
                  {Icon}
                  <div className="text-center">
                    <div className="font-medium">{scanType.label}</div>
                    <div className="text-xs text-muted-foreground">{scanType.description}</div>
                  </div>
                </Button>
              );
            })}
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
                  <Select value={selectedScanType} onValueChange={setSelectedScanType}>
                    <SelectTrigger className="glass">
                      <SelectValue placeholder="Filtrar por tipo de scan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Tipos</SelectItem>
                      <SelectItem value="vulnerability">Vulnerabilidades</SelectItem>
                      <SelectItem value="compliance">Compliance</SelectItem>
                      <SelectItem value="configuration">Configuração</SelectItem>
                      <SelectItem value="network">Rede</SelectItem>
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
              ) : scans && scans.length > 0 ? (
                <div className="space-y-4">
                  {scans.map((scan) => {
                    const TypeIcon = getScanTypeIcon(scan.scan_type);
                    return (
                      <div key={scan.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            {TypeIcon}
                            <div className="space-y-1">
                              <h4 className="font-semibold">{scan.scan_type}</h4>
                              <p className="text-sm text-muted-foreground">
                                {scan.scan_type.replace('_', ' ').replace('-', ' ').toUpperCase()}
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
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Total:</span>
                              <div className="font-medium">{scan.findings_count || 0}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Críticos:</span>
                              <div className="font-medium text-red-500">{scan.critical_count || 0}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Altos:</span>
                              <div className="font-medium text-orange-500">{scan.high_count || 0}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Médios:</span>
                              <div className="font-medium text-yellow-500">{scan.medium_count || 0}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Baixos:</span>
                              <div className="font-medium text-green-500">{scan.low_count || 0}</div>
                            </div>
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
                  <Button onClick={() => handleStartScan('vulnerability')}>
                    <Play className="h-4 w-4 mr-2" />
                    Executar Primeiro Scan
                  </Button>
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