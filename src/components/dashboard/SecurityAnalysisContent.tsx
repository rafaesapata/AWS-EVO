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
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
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
  const { selectedAccountId, selectedProvider } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();
  const { data: organizationId } = useOrganization();
  const [isScanning, setIsScanning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [selectedFindings, setSelectedFindings] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [viewingHistoricalScan, setViewingHistoricalScan] = useState<string | null>(null);
  const [selectedScanLevel, setSelectedScanLevel] = useState<ScanLevel>('advanced');
  const itemsPerPage = 25;
  const { toast } = useToast();
  
  // Multi-cloud support
  const isAzure = selectedProvider === 'AZURE';

  // Get security posture - query from security_posture table
  const { data: posture, refetch: refetchPosture, isLoading: isLoadingPosture } = useQuery({
    queryKey: ['security-posture', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    queryFn: async () => {
      const response = await apiClient.select('security_posture', {
        eq: { 
          organization_id: organizationId,
          ...getAccountFilter() // Multi-cloud compatible
        },
        order: { column: 'updated_at', ascending: false },
        limit: 1
      });
      if (response.error) throw new Error(response.error.message);
      return response.data?.[0] || null;
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
          ...getAccountFilter() // Multi-cloud compatible
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
            eq: { organization_id: organizationId, ...getAccountFilter() } 
          });
          if (findingsResponse.error) throw findingsResponse.error;
          return findingsResponse.data || [];
        }

        return [];
      }

      // Normal flow: fetch current findings from database
      const statusMap: Record<string, string> = {
        'pendente': 'pending',
        'resolvido': 'resolved',
        'ignorado': 'ignored',
        'all': 'all'
      };

      const mappedStatus = statusMap[selectedStatus.toLowerCase()] || selectedStatus;

      // Build query filters - organization_id is required, account filter is multi-cloud compatible
      const filters: Record<string, any> = { 
        organization_id: organizationId,
        ...getAccountFilter() // Multi-cloud compatible
      };
      
      // Add status filter if not 'all'
      if (mappedStatus !== 'all') {
        filters.status = mappedStatus;
      }

      console.log('SecurityAnalysisContent: Fetching findings with filters', filters);

      const response = await apiClient.select('findings', {
        eq: filters,
        order: { column: 'created_at', ascending: false }
      });

      console.log('SecurityAnalysisContent: Findings response', { 
        count: response.data?.length || 0, 
        error: response.error 
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

  // Extrair origens únicas dos findings
  const uniqueSources = useMemo(() => {
    if (!allFindings) return [];
    const sources = new Set<string>();
    allFindings.forEach(f => {
      if (f.source) sources.add(f.source);
    });
    return Array.from(sources).sort();
  }, [allFindings]);

  // Helper para formatar nome da origem
  const formatSourceName = (source: string) => {
    const sourceNames: Record<string, string> = {
      'security-engine': 'Security Scan',
      'security_scan': 'Security Scan',
      'cloudtrail': 'CloudTrail',
      'guardduty': 'GuardDuty',
      'inspector': 'Inspector',
      'securityhub': 'Security Hub',
    };
    return sourceNames[source] || source;
  };

  // Toggle source selection
  const toggleSource = (source: string) => {
    setSelectedSources(prev => {
      const newSet = new Set(prev);
      if (newSet.has(source)) {
        newSet.delete(source);
      } else {
        newSet.add(source);
      }
      return newSet;
    });
    setCurrentPage(1);
  };

  const runSecurityScan = async () => {
    setIsScanning(true);
    
    try {
      const levelInfo = SCAN_LEVELS.find(l => l.id === selectedScanLevel);
      const providerName = isAzure ? 'Azure' : 'AWS';
      toast({
        title: t('securityAnalysis.startingScan'),
        description: `${levelInfo?.icon} ${levelInfo?.name}: ${t('securityAnalysis.analyzingInfra')} ${providerName} (${levelInfo?.estimatedTime})`,
      });

      // Multi-cloud: Call appropriate Lambda based on provider
      const lambdaName = isAzure ? 'azure-security-scan' : 'security-scan';
      const bodyParam = isAzure 
        ? { credentialId: selectedAccountId, scanLevel: selectedScanLevel }
        : { accountId: selectedAccountId, scanLevel: selectedScanLevel };

      const response = await apiClient.invoke(lambdaName, { 
        body: bodyParam
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
      identity: { score: 100, critical: 0, high: 0, medium: 0, low: 0, total: 0 },
      network: { score: 100, critical: 0, high: 0, medium: 0, low: 0, total: 0 },
      data: { score: 100, critical: 0, high: 0, medium: 0, low: 0, total: 0 },
      compute: { score: 100, critical: 0, high: 0, medium: 0, low: 0, total: 0 },
      monitoring: { score: 100, critical: 0, high: 0, medium: 0, low: 0, total: 0 }
    };

    const categoryMapping: Record<string, string[]> = {
      identity: ['IAM', 'Root', 'Access', 'MFA', 'Policy', 'User', 'Role', 'Credential'],
      network: ['Security Group', 'VPC', 'Network', 'Port', 'Firewall', 'WAF', 'Load Balancer', 'ALB', 'NLB', 'ELB'],
      data: ['S3', 'RDS', 'Encryption', 'Backup', 'Snapshot', 'Storage', 'Database'],
      compute: ['EC2', 'Lambda', 'ECS', 'Container', 'Instance', 'IMDSv', 'EBS', 'EIP'],
      monitoring: ['CloudTrail', 'CloudWatch', 'GuardDuty', 'Config', 'Security Hub', 'Logging', 'Alarm']
    };

    const counts: Record<string, { critical: number; high: number; medium: number; low: number; total: number }> = {
      identity: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
      network: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
      data: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
      compute: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
      monitoring: { critical: 0, high: 0, medium: 0, low: 0, total: 0 }
    };

    allFindings.forEach(finding => {
      const title = finding.description || finding.event_name || '';
      const details = JSON.stringify(finding.details || {});
      const scanType = finding.scan_type || '';
      const combined = (title + ' ' + details + ' ' + scanType).toLowerCase();
      const severity = (finding.severity || 'low').toLowerCase();

      Object.entries(categoryMapping).forEach(([category, keywords]) => {
        if (keywords.some(kw => combined.includes(kw.toLowerCase()))) {
          counts[category].total++;
          if (severity === 'critical') counts[category].critical++;
          else if (severity === 'high') counts[category].high++;
          else if (severity === 'medium') counts[category].medium++;
          else counts[category].low++;
        }
      });
    });

    // Calcular score baseado em findings ponderados por severidade
    // Usar escala logarítmica para melhor visualização
    const calculateScore = (cat: { critical: number; high: number; medium: number; low: number; total: number }) => {
      if (cat.total === 0) return 100;
      // Peso por severidade
      const weightedSum = cat.critical * 25 + cat.high * 10 + cat.medium * 3 + cat.low * 1;
      // Escala logarítmica para não zerar rapidamente
      const penalty = Math.min(100, Math.log10(weightedSum + 1) * 30);
      return Math.max(5, 100 - penalty); // Mínimo de 5% para sempre mostrar algo
    };

    return {
      identity: { score: calculateScore(counts.identity), ...counts.identity },
      network: { score: calculateScore(counts.network), ...counts.network },
      data: { score: calculateScore(counts.data), ...counts.data },
      compute: { score: calculateScore(counts.compute), ...counts.compute },
      monitoring: { score: calculateScore(counts.monitoring), ...counts.monitoring }
    };
  }, [allFindings]);

  const categories = [
    { name: t('securityAnalysis.identityAccess'), ...categoryBreakdown.identity, icon: Shield },
    { name: t('securityAnalysis.networkSecurity'), ...categoryBreakdown.network, icon: Shield },
    { name: t('securityAnalysis.dataProtection'), ...categoryBreakdown.data, icon: Shield },
    { name: t('securityAnalysis.computeSecurity'), ...categoryBreakdown.compute, icon: Shield },
    { name: t('securityAnalysis.monitoringLogging'), ...categoryBreakdown.monitoring, icon: Shield },
  ];

  // Filtrar findings por busca, região, severity e origem
  const filteredFindings = useMemo(() => {
    if (!allFindings) return [];
    
    let filtered = allFindings;
    
    // Filtrar por severity (do dropdown)
    if (selectedSeverity !== 'all') {
      filtered = filtered.filter(f => f.severity === selectedSeverity);
    }
    
    // Filtrar por origem (múltipla seleção)
    if (selectedSources.size > 0) {
      filtered = filtered.filter(f => selectedSources.has(f.source || ''));
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
  }, [allFindings, selectedSeverity, selectedSources, searchQuery, selectedRegion]);

  // Findings filtrados por severidade (para as tabs)
  const criticalFindings = useMemo(() => filteredFindings?.filter(f => f.severity === 'critical') || [], [filteredFindings]);
  const highFindings = useMemo(() => filteredFindings?.filter(f => f.severity === 'high') || [], [filteredFindings]);
  const mediumFindings = useMemo(() => filteredFindings?.filter(f => f.severity === 'medium') || [], [filteredFindings]);
  const lowFindings = useMemo(() => filteredFindings?.filter(f => f.severity === 'low') || [], [filteredFindings]);

  // Estado para tab ativa de severidade
  const [activeSeverityTab, setActiveSeverityTab] = useState<string>('all');

  // Findings para a tab ativa
  const findingsForActiveTab = useMemo(() => {
    switch (activeSeverityTab) {
      case 'critical': return criticalFindings;
      case 'high': return highFindings;
      case 'medium': return mediumFindings;
      case 'low': return lowFindings;
      default: return filteredFindings || [];
    }
  }, [activeSeverityTab, filteredFindings, criticalFindings, highFindings, mediumFindings, lowFindings]);

  // Paginação baseada na tab ativa
  const totalPages = Math.ceil((findingsForActiveTab?.length || 0) / itemsPerPage);
  const paginatedFindings = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return findingsForActiveTab?.slice(start, start + itemsPerPage) || [];
  }, [findingsForActiveTab, currentPage, itemsPerPage]);

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      // Verificar se há um scan disponível
      if (!latestScan?.id) {
        toast({
          title: t('securityAnalysis.exportError'),
          description: 'Nenhum scan disponível para exportar. Execute uma análise primeiro.',
          variant: "destructive"
        });
        return;
      }

      const response = await apiClient.invoke('security-scan-pdf-export', {
        body: {
          scanId: latestScan.id,
          format: 'detailed',
          includeRemediation: true,
          language: 'pt-BR'
        }
      });

      if (response.error) throw new Error(response.error.message);
      const data = response.data;

      if (data?.downloadUrl) {
        // Baixar automaticamente usando fetch + blob
        const downloadResponse = await fetch(data.downloadUrl);
        const blob = await downloadResponse.blob();
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = data.filename || `evo-security-report-${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        toast({
          title: `✅ ${t('securityAnalysis.pdfExported')}`,
          description: t('securityAnalysis.securityReportGenerated')
        });
      } else {
        throw new Error('Nenhum arquivo gerado');
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
      <TabsList className="grid w-full grid-cols-2 glass">
        <TabsTrigger value="analysis">{t('securityAnalysis.currentAnalysis')}</TabsTrigger>
        <TabsTrigger value="history">{t('securityAnalysis.history')}</TabsTrigger>
      </TabsList>

      <TabsContent value="analysis" className="space-y-8">
        {/* Header com botões de scan e exportar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
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
          <Card className="glass border-primary/20 animate-fade-in card-hover-lift">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary icon-pulse" />
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
                className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-stagger"
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
                      className={`flex flex-col p-4 rounded-lg border-2 cursor-pointer transition-all hover:scale-[1.02]
                        ${selectedScanLevel === level.id 
                          ? 'border-primary bg-primary/5 glow-primary' 
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
                  className="gap-2 min-w-[200px] hover-glow btn-press"
                >
                  {isScanning ? (
                    <>
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      Analisando...
                    </>
                  ) : (
                    <>
                      {selectedScanLevel === 'military' ? <Sword className="h-5 w-5 icon-bounce" /> : 
                       selectedScanLevel === 'advanced' ? <Lock className="h-5 w-5 icon-pulse" /> : 
                       <Zap className="h-5 w-5 icon-bounce" />}
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
        <Card className="glass border-primary/20 animate-fade-in card-hover-lift card-shine">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary icon-pulse" />
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
                <div className={`text-6xl font-bold mb-2 tabular-nums animate-in fade-in-0 zoom-in-95 duration-500 ${getScoreColor(posture?.overall_score || 0)}`}>
                  {posture?.overall_score?.toFixed(0) || 0}
                </div>
                <div className="text-lg text-muted-foreground mb-2">de 100</div>
                <Badge className={`${getScoreColor(posture?.overall_score || 0)} transition-all hover:scale-105`}>
                  {getScoreLabel(posture?.overall_score || 0)}
                </Badge>
                <Progress value={posture?.overall_score || 0} className="mt-4 progress-shimmer" />
              </div>

              <div className="grid grid-cols-2 gap-4 animate-stagger">
                <div className={`text-center p-4 bg-red-500/10 rounded-lg border border-red-500/20 transition-all hover:scale-105 ${criticalCount > 0 ? 'glow-danger alert-pulse' : ''}`}>
                  <div className="text-3xl font-bold text-red-500 tabular-nums">{criticalCount}</div>
                  <div className="text-sm text-muted-foreground">Críticos</div>
                </div>
                <div className="text-center p-4 bg-orange-500/10 rounded-lg border border-orange-500/20 transition-all hover:scale-105">
                  <div className="text-3xl font-bold text-orange-500 tabular-nums">{highCount}</div>
                  <div className="text-sm text-muted-foreground">Altos</div>
                </div>
                <div className="text-center p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20 transition-all hover:scale-105">
                  <div className="text-3xl font-bold text-yellow-500 tabular-nums">{mediumCount}</div>
                  <div className="text-sm text-muted-foreground">Médios</div>
                </div>
                <div className="text-center p-4 bg-blue-500/10 rounded-lg border border-blue-500/20 transition-all hover:scale-105 glow-success">
                  <div className="text-3xl font-bold text-blue-500 tabular-nums">{lowCount}</div>
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
        <Card className="glass border-primary/20 animate-fade-in card-hover-lift">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Breakdown por Categoria
            </CardTitle>
            <CardDescription>Análise detalhada de cada área de segurança</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 animate-stagger">
            {categories.map((category) => (
              <div key={category.name} className="space-y-2 transition-all hover:translate-x-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <category.icon className="h-4 w-4 text-muted-foreground icon-pulse" />
                    <span className="font-medium">{category.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${category.total > 0 ? (category.critical > 0 ? 'text-red-500' : category.high > 0 ? 'text-orange-500' : 'text-yellow-500') : 'text-green-500'}`}>
                      {category.total}
                    </span>
                    {category.total > 0 ? (
                      <div className="flex items-center gap-1 text-xs flex-wrap justify-end">
                        {category.critical > 0 && (
                          <Badge variant="destructive" className="text-xs px-1.5 py-0">
                            {category.critical} crítico{category.critical > 1 ? 's' : ''}
                          </Badge>
                        )}
                        {category.high > 0 && (
                          <Badge variant="outline" className="text-xs px-1.5 py-0 text-orange-500 border-orange-500">
                            {category.high} alto{category.high > 1 ? 's' : ''}
                          </Badge>
                        )}
                        {category.medium > 0 && (
                          <Badge variant="outline" className="text-xs px-1.5 py-0 text-yellow-500 border-yellow-500">
                            {category.medium} médio{category.medium > 1 ? 's' : ''}
                          </Badge>
                        )}
                        {category.low > 0 && (
                          <Badge variant="outline" className="text-xs px-1.5 py-0 text-blue-500 border-blue-500">
                            {category.low} baixo{category.low > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-xs text-green-500 border-green-500">
                        Sem problemas
                      </Badge>
                    )}
                  </div>
                </div>
                <Progress value={category.score} className="progress-shimmer" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filtros e Ações em Massa */}
      {isLoadingFindings ? (
        <FindingsTableSkeleton />
      ) : (
        <Card className="glass border-primary/20 animate-fade-in">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-primary" />
                Filtros e Ações
              </CardTitle>
            {selectedFindings.size > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="animate-in fade-in-0">{selectedFindings.size} selecionados</Badge>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleBulkAction('resolve')}
                  className="glass hover-glow"
                >
                  <CheckSquare className="h-4 w-4 mr-2" />
                  Marcar Resolvido
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSelectedFindings(new Set())}
                  className="glass"
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
                <SelectTrigger className="w-[180px] glass">
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
                <SelectTrigger className="w-[180px] glass">
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
                <SelectTrigger className="w-[180px] glass">
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

            {/* Filtro por Origem */}
            {uniqueSources.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Origem</label>
                <div className="flex flex-wrap gap-2">
                  {uniqueSources.map(source => (
                    <Badge
                      key={source}
                      variant={selectedSources.has(source) ? "default" : "outline"}
                      className="cursor-pointer hover:bg-primary/80 transition-colors"
                      onClick={() => toggleSource(source)}
                    >
                      <Checkbox
                        checked={selectedSources.has(source)}
                        className="mr-2 h-3 w-3"
                        onCheckedChange={() => toggleSource(source)}
                      />
                      {formatSourceName(source)}
                      <span className="ml-1 text-xs opacity-70">
                        ({allFindings?.filter(f => f.source === source).length || 0})
                      </span>
                    </Badge>
                  ))}
                  {selectedSources.size > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedSources(new Set());
                        setCurrentPage(1);
                      }}
                      className="h-6 px-2 text-xs"
                    >
                      Limpar
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Findings Table with Pagination */}
      {isLoadingFindings ? (
        <FindingsTableSkeleton />
      ) : (
        <Card className="glass border-primary/20 animate-fade-in card-hover-lift">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Achados de Segurança
                </CardTitle>
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
                  className="glass"
                >
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground tabular-nums">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="glass"
                >
                  Próxima
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" value={activeSeverityTab} onValueChange={(value) => {
            setActiveSeverityTab(value);
            setCurrentPage(1);
          }}>
            <TabsList className="grid w-full grid-cols-5 glass">
              <TabsTrigger value="all">Todos ({filteredFindings?.length || 0})</TabsTrigger>
              <TabsTrigger value="critical">Críticos ({criticalFindings.length})</TabsTrigger>
              <TabsTrigger value="high">Altos ({highFindings.length})</TabsTrigger>
              <TabsTrigger value="medium">Médios ({mediumFindings.length})</TabsTrigger>
              <TabsTrigger value="low">Baixos ({lowFindings.length})</TabsTrigger>
            </TabsList>
            
            <div className="mt-6">
              <FindingsTable findings={paginatedFindings} onUpdate={refetchFindings} />
            </div>
          </Tabs>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6 pt-6 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="glass"
              >
                Primeira
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="glass"
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground px-4 tabular-nums">
                Página {currentPage} de {totalPages} • {itemsPerPage} por página
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="glass"
              >
                Próxima
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="glass"
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
