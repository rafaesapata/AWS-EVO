import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Shield, TrendingUp, TrendingDown, Minus, Play, RefreshCw, FileText, Filter, CheckSquare, Download, Search, Zap, Lock, Sword } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import FindingsTable from "./FindingsTable";
import { SecurityPostureSkeleton, CategoryBreakdownSkeleton, FindingsTableSkeleton } from "./SecurityAnalysisSkeleton";
import { SecurityAnalysisHistory } from "./SecurityAnalysisHistory";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { InfoTooltip, tooltipContent } from "@/components/ui/info-tooltip";

// Scan level types
type ScanLevel = 'basic' | 'advanced' | 'military';

interface ScanLevelInfo {
  id: ScanLevel;
  name: string;
  description: string;
  icon: string;
  estimatedTime: string;
  checks: string[];
}

const SCAN_LEVELS: ScanLevelInfo[] = [
  {
    id: 'basic',
    name: 'Básico',
    description: 'Verificações essenciais de segurança',
    icon: '🛡️',
    estimatedTime: '~2 min',
    checks: ['EC2 exposição', 'RDS público', 'S3 público', 'Security Groups']
  },
  {
    id: 'advanced',
    name: 'Avançado',
    description: 'Análise abrangente com conformidade',
    icon: '🔐',
    estimatedTime: '~5 min',
    checks: ['Todas básicas', 'IAM completo', 'Criptografia', 'Backup', 'CloudTrail', 'Correlação']
  },
  {
    id: 'military',
    name: 'Military-Grade',
    description: 'Auditoria máxima - Zero tolerância',
    icon: '⚔️',
    estimatedTime: '~10 min',
    checks: ['Todas avançadas', 'Vetores de ataque', 'Compliance completo', 'Snapshots', 'Deep IAM']
  }
];

export default function SecurityAnalysisContent() {
  const { t } = useTranslation();
  const { selectedAccountId } = useAwsAccount();
  const { data: organizationId } = useOrganization();
  const [isScanning, setIsScanning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  const [selectedFindings, setSelectedFindings] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [viewingHistoricalScan, setViewingHistoricalScan] = useState<string | null>(null);
  const [selectedScanLevel, setSelectedScanLevel] = useState<ScanLevel>('advanced');
  const itemsPerPage = 25;
  const { toast } = useToast();

  // Get security posture (via edge function)
  const { data: posture, refetch: refetchPosture, isLoading: isLoadingPosture } = useQuery({
    queryKey: ['security-posture', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    queryFn: async () => {
      const session = await cognitoAuth.getCurrentSession();
      if (!session) throw new Error('Not authenticated');
      
      const response = await apiClient.post('/security/posture', {
        accountId: selectedAccountId
      });
      if (response.error) throw new Error(response.error.message);
      return response.data || null;
    }
  });

  // Get latest security scan (via edge function)
  const { data: latestScan, refetch: refetchScan, isLoading: isLoadingScan } = useQuery({
    queryKey: ['latest-security-scan', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    queryFn: async () => {
      // Query security_scans table for latest scan
      const response = await apiClient.select('security_scans', {
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId
        },
        order: { column: 'created_at', ascending: false },
        limit: 1
      });
      if (response.error) throw new Error(response.error.message);
      return response.data?.[0] || null;
    }
  });

  // Get ALL findings without severity filter (filter happens locally)
  // Status filter still applies at query level
  // If viewing historical scan, fetch findings from that specific scan
  const { data: allFindings, refetch: refetchFindings, isLoading: isLoadingFindings } = useQuery({
    queryKey: ['security-findings', organizationId, selectedAccountId, selectedStatus, viewingHistoricalScan],
    enabled: !!organizationId && !!selectedAccountId,
    queryFn: async () => {
      // If viewing historical scan, fetch findings from that scan
      if (viewingHistoricalScan) {
        const historyResponse = await apiClient.select('security_scan_history', { 
          eq: { id: viewingHistoricalScan } 
        });
        const scanHistory = historyResponse.data?.[0];
        if (historyResponse.error) throw historyResponse.error;
        
        if (!scanHistory?.findings_summary) return [];

        const historicalScanId = (scanHistory.findings_summary as any)?.scan_id;
        
        if (!historicalScanId) return [];

        // Fetch findings from this specific scan
        const scanResponse = await apiClient.select('security_scans', { 
          eq: { id: historicalScanId } 
        });
        const scanData = scanResponse.data?.[0];
        if (scanResponse.error) throw scanResponse.error;

        // Get findings from the scan config or fetch from findings table
        // Since findings don't have scan_id, we'll need to use the scan timestamp
        if (scanData) {
          const findingsResponse = await apiClient.select('findings', { 
            eq: { organization_id: organizationId, aws_account_id: selectedAccountId } 
          });
          if (findingsResponse.error) throw findingsResponse.error;
          return findingsResponse.data || [];
        }

        return [];
      }

      // Normal flow: fetch current findings
      const statusMap: Record<string, string> = {
        'pendente': 'pending',
        'resolvido': 'resolved',
        'ignorado': 'ignored',
        'all': 'all'
      };

      const mappedStatus = statusMap[selectedStatus.toLowerCase()] || selectedStatus;

      const response = await apiClient.post('/security/findings', {
        severity: 'all', // CRITICAL: Get all severities, filter locally
        status: mappedStatus,
        source: 'security_scan',
        accountId: selectedAccountId
      });

      if (response.error) throw new Error(response.error.message);
      return response.data || [];
    }
  });

  // Contadores baseados em TODOS os findings (não filtrados por severity)
  const criticalCount = allFindings?.filter(f => f.severity === 'critical').length || 0;
  const highCount = allFindings?.filter(f => f.severity === 'high').length || 0;
  const mediumCount = allFindings?.filter(f => f.severity === 'medium').length || 0;
  const lowCount = allFindings?.filter(f => f.severity === 'low').length || 0;

  const runSecurityScan = async () => {
    setIsScanning(true);
    
    try {
      const levelInfo = SCAN_LEVELS.find(l => l.id === selectedScanLevel);
      toast({
        title: t('securityAnalysis.startingScan'),
        description: `${levelInfo?.icon} ${levelInfo?.name}: ${t('securityAnalysis.analyzingInfra')} (${levelInfo?.estimatedTime})`,
      });

      const response = await apiClient.post('/security/scan', { 
        accountId: selectedAccountId,
        scanLevel: selectedScanLevel
      });
      
      if (response?.error) {
        throw new Error(response.error.message || 'Security scan failed');
      }
      
      const scanResult = response.data;
      
      if (!scanResult) {
        throw new Error('No scan result returned');
      }
      
      toast({
        title: t('securityAnalysis.scanCompleted'),
        description: `${levelInfo?.icon} ${scanResult.findings_count || 0} ${t('securityAnalysis.vulnerabilitiesFound')} (${scanResult.critical || 0} críticos)`,
      });
      
      // Invalidar queries para forçar atualização do banco
      const refetchPromises = [
        refetchPosture(),
        refetchScan(),
        refetchFindings()
      ];
      
      await Promise.all(refetchPromises);
      
      toast({
        title: `✅ ${t('securityAnalysis.dataUpdated')}`,
        description: t('securityAnalysis.analysisCompleted'),
      });
    } catch (error) {
      toast({
        title: t('securityAnalysis.errorRunning'),
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleBulkAction = async (action: 'resolve' | 'ticket') => {
    if (selectedFindings.size === 0) {
      toast({
        variant: "destructive",
        title: t('securityAnalysis.noItemSelected'),
        description: t('securityAnalysis.selectAtLeastOne')
      });
      return;
    }

    try {
      if (action === 'resolve') {
        // SECURITY: Filter by organization_id to prevent cross-org updates
        const updates = Array.from(selectedFindings).map(id =>
          apiClient.update('findings', id, { status: newStatus })
        );
        
        await Promise.all(updates);
        
        toast({
          title: t('securityAnalysis.findingsUpdated'),
          description: `${selectedFindings.size} ${t('securityAnalysis.markedAsResolved')}`
        });
      }

      setSelectedFindings(new Set());
      refetchFindings();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t('securityAnalysis.bulkActionError'),
        description: error.message
      });
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'degrading': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 95) return t('securityAnalysis.excellent');
    if (score >= 70) return t('securityAnalysis.good');
    if (score >= 50) return t('securityAnalysis.regular');
    return t('securityAnalysis.critical');
  };

  // Calcular breakdown por categoria baseado nos findings reais
  const categoryBreakdown = useMemo(() => {
    if (!allFindings || allFindings.length === 0) return {
      identity: 0,
      network: 0,
      data: 0,
      compute: 0,
      monitoring: 0
    };

    const categoryMapping: Record<string, string[]> = {
      identity: ['IAM', 'Root', 'Access', 'MFA', 'Policy', 'User', 'Role', 'Credential'],
      network: ['Security Group', 'VPC', 'Network', 'Port', 'Firewall', 'WAF', 'Load Balancer', 'ALB', 'NLB', 'ELB'],
      data: ['S3', 'RDS', 'Encryption', 'Backup', 'Snapshot', 'Storage', 'Database'],
      compute: ['EC2', 'Lambda', 'ECS', 'Container', 'Instance', 'IMDSv', 'EBS', 'EIP'],
      monitoring: ['CloudTrail', 'CloudWatch', 'GuardDuty', 'Config', 'Security Hub', 'Logging', 'Alarm']
    };

    const counts = {
      identity: 0,
      network: 0,
      data: 0,
      compute: 0,
      monitoring: 0
    };

    allFindings.forEach(finding => {
      const title = finding.description || finding.event_name || '';
      const details = JSON.stringify(finding.details || {});
      const scanType = finding.scan_type || '';
      const combined = (title + ' ' + details + ' ' + scanType).toLowerCase();

      Object.entries(categoryMapping).forEach(([category, keywords]) => {
        if (keywords.some(kw => combined.includes(kw.toLowerCase()))) {
          counts[category as keyof typeof counts]++;
        }
      });
    });

    // Calcular score baseado em findings (inverso: menos findings = melhor score)
    const totalFindings = allFindings.length;
    return {
      identity: Math.max(0, 100 - (counts.identity / Math.max(1, totalFindings)) * 200),
      network: Math.max(0, 100 - (counts.network / Math.max(1, totalFindings)) * 200),
      data: Math.max(0, 100 - (counts.data / Math.max(1, totalFindings)) * 200),
      compute: Math.max(0, 100 - (counts.compute / Math.max(1, totalFindings)) * 200),
      monitoring: Math.max(0, 100 - (counts.monitoring / Math.max(1, totalFindings)) * 200)
    };
  }, [allFindings]);

  const categories = [
    { name: t('securityAnalysis.identityAccess'), score: categoryBreakdown.identity, icon: Shield },
    { name: t('securityAnalysis.networkSecurity'), score: categoryBreakdown.network, icon: Shield },
    { name: t('securityAnalysis.dataProtection'), score: categoryBreakdown.data, icon: Shield },
    { name: t('securityAnalysis.computeSecurity'), score: categoryBreakdown.compute, icon: Shield },
    { name: t('securityAnalysis.monitoringLogging'), score: categoryBreakdown.monitoring, icon: Shield },
  ];

  // Filtrar findings por busca, região e severity (tabs)
  const filteredFindings = useMemo(() => {
    if (!allFindings) return [];
    
    let filtered = allFindings;
    
    // Filtrar por severity (do dropdown)
    if (selectedSeverity !== 'all') {
      filtered = filtered.filter(f => f.severity === selectedSeverity);
    }
    
    // Filtrar por busca
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(f => 
        f.description?.toLowerCase().includes(query) ||
        f.event_name?.toLowerCase().includes(query) ||
        f.severity?.toLowerCase().includes(query) ||
        JSON.stringify(f.details || {}).toLowerCase().includes(query)
      );
    }
    
    // Filtrar por região
    if (selectedRegion !== 'all') {
      filtered = filtered.filter(f => {
        const region = f.details?.region || 'global';
        return region === selectedRegion;
      });
    }
    
    return filtered;
  }, [allFindings, selectedSeverity, searchQuery, selectedRegion]);

  // Paginação
  const totalPages = Math.ceil((filteredFindings?.length || 0) / itemsPerPage);
  const paginatedFindings = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredFindings?.slice(start, start + itemsPerPage) || [];
  }, [filteredFindings, currentPage, itemsPerPage]);

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      // Get user email
      const user = await cognitoAuth.getCurrentUser();
      const userEmail = user?.email || 'Não disponível';

      const response = await apiClient.post('/security/export-pdf', {
        organizationId,
        findings: allFindings || [],
        posture: posture,
        latestScan,
        categoryBreakdown,
        userEmail
      });

      if (response.error) throw new Error(response.error.message);
      const data = response.data;

      if (data?.pdf) {
        // Convert base64 to blob and download as PDF
        const byteCharacters = atob(data.pdf);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = data.filename || 'evo-security-report.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        toast({
          title: `✅ ${t('securityAnalysis.pdfExported')}`,
          description: t('securityAnalysis.securityReportGenerated')
        });
      }
    } catch (error: any) {
      toast({
        title: t('securityAnalysis.exportError'),
        description: error.message || 'Unknown error',
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Tabs defaultValue="analysis" className="w-full space-y-8">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="analysis">{t('securityAnalysis.currentAnalysis')}</TabsTrigger>
        <TabsTrigger value="history">{t('securityAnalysis.history')}</TabsTrigger>
      </TabsList>

      <TabsContent value="analysis" className="space-y-8">
        {/* Header com botões de scan e exportar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-3xl font-bold gradient-text">{t('securityAnalysis.title')}</h2>
                <InfoTooltip title="Como funciona a análise?">
                  {tooltipContent.securityScore}
                </InfoTooltip>
              </div>
              <p className="text-muted-foreground mt-1">{t('securityAnalysis.description')}</p>
            </div>
            {viewingHistoricalScan && (
              <Badge variant="secondary" className="gap-2">
                <Shield className="h-3 w-3" />
                {t('securityAnalysis.viewingHistorical')}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {viewingHistoricalScan && (
              <Button 
                onClick={() => setViewingHistoricalScan(null)}
                variant="outline"
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                {t('securityAnalysis.backToCurrent')}
              </Button>
            )}
            <Button 
              onClick={exportToPDF} 
              disabled={isExporting || !allFindings || allFindings.length === 0}
              variant="outline"
              className="gap-2"
            >
              {isExporting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {t('securityAnalysis.generatingPdf')}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  {t('securityAnalysis.exportPdf')}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Scan Level Selector */}
        {!viewingHistoricalScan && (
          <Card className="glass border-primary/20 animate-fade-in">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Nível de Análise
              </CardTitle>
              <CardDescription>
                Selecione o nível de rigor da análise de segurança
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup 
                value={selectedScanLevel} 
                onValueChange={(value) => setSelectedScanLevel(value as ScanLevel)}
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
              >
                {SCAN_LEVELS.map((level) => (
                  <div key={level.id} className="relative">
                    <RadioGroupItem 
                      value={level.id} 
                      id={level.id} 
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor={level.id}
                      className={`flex flex-col p-4 rounded-lg border-2 cursor-pointer transition-all
                        ${selectedScanLevel === level.id 
                          ? 'border-primary bg-primary/5' 
                          : 'border-border hover:border-primary/50'
                        }
                      `}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl">{level.icon}</span>
                        <Badge variant={level.id === 'military' ? 'destructive' : level.id === 'advanced' ? 'default' : 'secondary'}>
                          {level.estimatedTime}
                        </Badge>
                      </div>
                      <span className="font-semibold text-lg">{level.name}</span>
                      <span className="text-sm text-muted-foreground mt-1">{level.description}</span>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {level.checks.slice(0, 3).map((check) => (
                          <Badge key={check} variant="outline" className="text-xs">
                            {check}
                          </Badge>
                        ))}
                        {level.checks.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{level.checks.length - 3}
                          </Badge>
                        )}
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              
              <div className="mt-6 flex justify-end">
                <Button 
                  onClick={runSecurityScan} 
                  disabled={isScanning}
                  size="lg"
                  className="gap-2 min-w-[200px]"
                >
                  {isScanning ? (
                    <>
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      Analisando...
                    </>
                  ) : (
                    <>
                      {selectedScanLevel === 'military' ? <Sword className="h-5 w-5" /> : 
                       selectedScanLevel === 'advanced' ? <Lock className="h-5 w-5" /> : 
                       <Zap className="h-5 w-5" />}
                      Iniciar Análise {SCAN_LEVELS.find(l => l.id === selectedScanLevel)?.name}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

      {/* Overall Security Score */}
      {isLoadingPosture || isLoadingScan ? (
        <SecurityPostureSkeleton />
      ) : (
        <Card className="glass border-primary/20 animate-fade-in">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                Security Posture Score
              </div>
              <div className="flex items-center gap-2">
                {getTrendIcon(posture?.trend || 'stable')}
                {posture?.score_change && (
                  <span className={`text-sm ${posture.score_change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {posture.score_change > 0 ? '+' : ''}{posture.score_change.toFixed(1)}
                  </span>
                )}
              </div>
            </CardTitle>
            <CardDescription>
              Última atualização: {latestScan?.created_at ? new Date(latestScan.created_at).toLocaleString('pt-BR') : 'Nunca'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="text-center">
                <div className={`text-6xl font-bold mb-2 ${getScoreColor(posture?.overall_score || 0)}`}>
                  {posture?.overall_score?.toFixed(0) || 0}
                </div>
                <div className="text-lg text-muted-foreground mb-2">de 100</div>
                <Badge className={getScoreColor(posture?.overall_score || 0)}>
                  {getScoreLabel(posture?.overall_score || 0)}
                </Badge>
                <Progress value={posture?.overall_score || 0} className="mt-4" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-red-500/10 rounded-lg border border-red-500/20">
                  <div className="text-3xl font-bold text-red-500">{criticalCount}</div>
                  <div className="text-sm text-muted-foreground">Críticos</div>
                </div>
                <div className="text-center p-4 bg-orange-500/10 rounded-lg border border-orange-500/20">
                  <div className="text-3xl font-bold text-orange-500">{highCount}</div>
                  <div className="text-sm text-muted-foreground">Altos</div>
                </div>
                <div className="text-center p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                  <div className="text-3xl font-bold text-yellow-500">{mediumCount}</div>
                  <div className="text-sm text-muted-foreground">Médios</div>
                </div>
                <div className="text-center p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                  <div className="text-3xl font-bold text-blue-500">{lowCount}</div>
                  <div className="text-sm text-muted-foreground">Baixos</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category Breakdown */}
      {isLoadingFindings ? (
        <CategoryBreakdownSkeleton />
      ) : (
        <Card className="glass animate-fade-in">
          <CardHeader>
            <CardTitle>Breakdown por Categoria</CardTitle>
            <CardDescription>Análise detalhada de cada área de segurança</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {categories.map((category) => (
              <div key={category.name} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <category.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{category.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${getScoreColor(category.score)}`}>
                      {category.score.toFixed(0)}
                    </span>
                    <Badge variant="outline" className={getScoreColor(category.score)}>
                      {getScoreLabel(category.score)}
                    </Badge>
                  </div>
                </div>
                <Progress value={category.score} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filtros e Ações em Massa */}
      {isLoadingFindings ? (
        <FindingsTableSkeleton />
      ) : (
        <Card className="animate-fade-in">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filtros e Ações
              </CardTitle>
            {selectedFindings.size > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{selectedFindings.size} selecionados</Badge>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleBulkAction('resolve')}
                >
                  <CheckSquare className="h-4 w-4 mr-2" />
                  Marcar Resolvido
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSelectedFindings(new Set())}
                >
                  Limpar
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            <div className="space-y-2 flex-1 min-w-[200px]">
              <label className="text-sm font-medium">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar findings..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Severidade</label>
              <Select value={selectedSeverity} onValueChange={(val) => {
                setSelectedSeverity(val);
                setCurrentPage(1);
              }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="critical">Crítico ({criticalCount})</SelectItem>
                  <SelectItem value="high">Alto ({highCount})</SelectItem>
                  <SelectItem value="medium">Médio ({mediumCount})</SelectItem>
                  <SelectItem value="low">Baixo ({lowCount})</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={selectedStatus} onValueChange={(val) => {
                setSelectedStatus(val);
                setCurrentPage(1);
              }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="in_progress">Em Progresso</SelectItem>
                  <SelectItem value="resolved">Resolvido</SelectItem>
                  <SelectItem value="ignored">Ignorado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Região</label>
              <Select value={selectedRegion} onValueChange={(val) => {
                setSelectedRegion(val);
                setCurrentPage(1);
              }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="us-east-1">US East (N. Virginia)</SelectItem>
                  <SelectItem value="us-east-2">US East (Ohio)</SelectItem>
                  <SelectItem value="us-west-1">US West (N. California)</SelectItem>
                  <SelectItem value="us-west-2">US West (Oregon)</SelectItem>
                  <SelectItem value="eu-west-1">EU (Ireland)</SelectItem>
                  <SelectItem value="eu-central-1">EU (Frankfurt)</SelectItem>
                  <SelectItem value="sa-east-1">South America (São Paulo)</SelectItem>
                  <SelectItem value="ap-southeast-1">Asia Pacific (Singapore)</SelectItem>
                  <SelectItem value="global">Global</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Findings Table with Pagination */}
      {isLoadingFindings ? (
        <FindingsTableSkeleton />
      ) : (
        <Card className="glass animate-fade-in">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Achados de Segurança</CardTitle>
              <CardDescription>
                {filteredFindings?.length || 0} achados encontrados {searchQuery && '(filtrado por busca)'}
              </CardDescription>
              </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Próxima
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" onValueChange={() => setCurrentPage(1)}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all">Todos ({allFindings?.length || 0})</TabsTrigger>
              <TabsTrigger value="critical">Críticos ({criticalCount})</TabsTrigger>
              <TabsTrigger value="high">Altos ({highCount})</TabsTrigger>
              <TabsTrigger value="medium">Médios ({mediumCount})</TabsTrigger>
              <TabsTrigger value="low">Baixos ({lowCount})</TabsTrigger>
            </TabsList>
            
            <TabsContent value="all" className="mt-6">
              <FindingsTable findings={paginatedFindings} onUpdate={refetchFindings} />
            </TabsContent>
            
            <TabsContent value="critical" className="mt-6">
              <FindingsTable findings={paginatedFindings.filter(f => f.severity === 'critical')} onUpdate={refetchFindings} />
            </TabsContent>
            
            <TabsContent value="high" className="mt-6">
              <FindingsTable findings={paginatedFindings.filter(f => f.severity === 'high')} onUpdate={refetchFindings} />
            </TabsContent>
            
            <TabsContent value="medium" className="mt-6">
              <FindingsTable findings={paginatedFindings.filter(f => f.severity === 'medium')} onUpdate={refetchFindings} />
            </TabsContent>
            
            <TabsContent value="low" className="mt-6">
              <FindingsTable findings={paginatedFindings.filter(f => f.severity === 'low')} onUpdate={refetchFindings} />
            </TabsContent>
          </Tabs>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6 pt-6 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                Primeira
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground px-4">
                Página {currentPage} de {totalPages} • {itemsPerPage} por página
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Próxima
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                Última
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Scan Details */}
      {latestScan && (
        <Card className="glass border-blue-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              Detalhes do Último Scan
            </CardTitle>
            <CardDescription>
              Informações sobre a última análise de segurança realizada
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Data</div>
                <div className="text-lg font-semibold">
                  {new Date(latestScan.created_at).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Hora</div>
                <div className="text-lg font-semibold">
                  {new Date(latestScan.created_at).toLocaleTimeString('pt-BR')}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Status</div>
                <div className="text-lg font-semibold">
                  <Badge variant={latestScan.status === 'completed' ? 'default' : 'secondary'}>
                    {latestScan.status === 'completed' ? 'Concluído' : latestScan.status}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Tipo</div>
                <div className="text-lg font-semibold capitalize">
                  {latestScan.scan_type}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      </TabsContent>

      <TabsContent value="history">
        {organizationId && (
          <SecurityAnalysisHistory 
            organizationId={organizationId}
            accountId={selectedAccountId}
            onViewScan={(scanId) => {
              setViewingHistoricalScan(scanId);
              // Change to analysis tab to show the historical data
              const analysisTab = document.querySelector('[value="analysis"]') as HTMLElement;
              if (analysisTab) {
                analysisTab.click();
              }
              toast({
                title: "Carregando scan histórico",
                description: "Visualizando detalhes da análise selecionada...",
              });
            }}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
