import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { Shield, CheckCircle2, AlertTriangle, XCircle, PlayCircle, Loader2, Ticket, ExternalLink, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrganization } from "@/hooks/useOrganization";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { useTVDashboard } from "@/contexts/TVDashboardContext";

// AWS Frameworks
const AWS_FRAMEWORKS = [
  {
    id: 'cis',
    name: 'CIS AWS',
    description: 'CIS Amazon Web Services Foundations Benchmark',
    icon: '🔒',
  },
  {
    id: 'lgpd',
    name: 'LGPD',
    description: 'Lei Geral de Proteção de Dados (Brasil)',
    icon: '🇧🇷',
  },
  {
    id: 'gdpr',
    name: 'GDPR',
    description: 'General Data Protection Regulation (Europa)',
    icon: '🇪🇺',
  },
  {
    id: 'hipaa',
    name: 'HIPAA',
    description: 'Health Insurance Portability and Accountability Act',
    icon: '🏥',
  },
  {
    id: 'pci-dss',
    name: 'PCI-DSS',
    description: 'Payment Card Industry Data Security Standard',
    icon: '💳',
  },
];

// Azure Frameworks
const AZURE_FRAMEWORKS = [
  {
    id: 'cis-azure',
    name: 'CIS Azure',
    description: 'CIS Microsoft Azure Foundations Benchmark',
    icon: '🔒',
  },
  {
    id: 'azure-security-benchmark',
    name: 'Azure Security Benchmark',
    description: 'Microsoft Azure Security Benchmark',
    icon: '🛡️',
  },
  {
    id: 'lgpd',
    name: 'LGPD',
    description: 'Lei Geral de Proteção de Dados (Brasil)',
    icon: '🇧🇷',
  },
  {
    id: 'gdpr',
    name: 'GDPR',
    description: 'General Data Protection Regulation (Europa)',
    icon: '🇪🇺',
  },
  {
    id: 'pci-dss',
    name: 'PCI-DSS',
    description: 'Payment Card Industry Data Security Standard',
    icon: '💳',
  },
];

export function ComplianceFrameworks() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { isTVMode } = useTVDashboard();
  const queryClient = useQueryClient();
  const [runningFramework, setRunningFramework] = useState<string | null>(null);
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([]);
  const [selectedChecks, setSelectedChecks] = useState<string[]>([]);
  const [selectedCheck, setSelectedCheck] = useState<any | null>(null);
  const [creatingTicketId, setCreatingTicketId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<{ [key: string]: number }>({});
  const CHECKS_PER_PAGE = 10;
  const { data: organizationId } = useOrganization();
  
  // CRITICAL: Get selected cloud account and provider for multi-cloud support
  const { selectedAccountId, selectedProvider } = useCloudAccount();
  
  // Determine which frameworks to show based on selected provider
  const isAzure = selectedProvider === 'AZURE';
  const FRAMEWORKS = useMemo(() => isAzure ? AZURE_FRAMEWORKS : AWS_FRAMEWORKS, [isAzure]);

  const { data: complianceChecks = [], isLoading } = useQuery({
    queryKey: ['compliance-checks', organizationId, selectedAccountId],
    staleTime: 0,
    gcTime: 0,
    refetchInterval: isTVMode ? 30000 : undefined,
    queryFn: async () => {
      if (!organizationId) throw new Error('Organization not found');

      let filters: any = {
        'security_scans.organization_id': organizationId
      };
      
      // Filter by selected account if available
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
      
      if (result.error) throw new Error(getErrorMessage(result.error));
      return result.data;
    },
    enabled: !!organizationId,
  });

  const runComplianceScan = useMutation({
    mutationFn: async (frameworkId: string) => {
      setRunningFramework(frameworkId);

      // Get user's organization_id
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error("Usuário não autenticado");
      if (!organizationId) throw new Error("Organização não encontrada");

      const scanData = await apiClient.insert('security_scans', {
        scan_type: `compliance_${frameworkId}`,
        status: 'running',
        organization_id: organizationId,
      });

      if (scanData.error) throw new Error(getErrorMessage(scanData.error));

      toast({
        title: "Compliance scan iniciado",
        description: `Verificando compliance com ${FRAMEWORKS.find(f => f.id === frameworkId)?.name}...`
      });

      // Call the appropriate compliance-scan Lambda based on provider
      const lambdaName = isAzure ? 'azure-compliance-scan' : 'compliance-scan';
      const bodyParams = isAzure 
        ? { frameworkId, scanId: scanData.data.id, credentialId: selectedAccountId }
        : { frameworkId, scanId: scanData.data.id, accountId: selectedAccountId };
      
      const result = await apiClient.invoke(lambdaName, { 
        body: bodyParams
      });

      if (result.error) {
        console.error('Compliance scan error:', result.error);
        await apiClient.update('security_scans', {
          status: 'failed'
        }, { eq: { id: scanData.data.id } });
        throw new Error(getErrorMessage(result.error));
      }

      await apiClient.update('security_scans', {
        status: 'completed',
        completed_at: new Date().toISOString()
      }, { eq: { id: scanData.data.id } });

      const data = result.data;

      return { 
        framework: frameworkId, 
        checksCount: data?.checksCount || 0,
        passed: data?.passed || 0,
        failed: data?.failed || 0
      };
    },
    onSuccess: (data) => {
      toast({
        title: "Scan de Compliance Concluído",
        description: `${data.checksCount} controles verificados: ${data.passed} passou, ${data.failed} falhou`,
      });
      queryClient.invalidateQueries({ queryKey: ['compliance-checks'] });
      setRunningFramework(null);
    },
    onError: (error: any) => {
      toast({
        title: "Erro no Scan",
        description: error.message || "Erro ao executar scan de compliance",
        variant: "destructive"
      });
      setRunningFramework(null);
    },
  });

  const runAllFrameworks = async () => {
    toast({ title: t("compliance.runningAll") });
    for (const framework of FRAMEWORKS) {
      await runComplianceScan.mutateAsync(framework.id);
    }
  };

  const runSelectedFrameworks = async () => {
    if (selectedFrameworks.length === 0) {
      toast({ title: t("compliance.selectFramework"), variant: "destructive" });
      return;
    }
    toast({ title: t("compliance.runningSelected") });
    for (const frameworkId of selectedFrameworks) {
      await runComplianceScan.mutateAsync(frameworkId);
    }
    setSelectedFrameworks([]);
  };

  const createTicketForCheck = async (check: any) => {
    const ticketKey = `${check.framework}-${check.control_id}`;
    
    if (creatingTicketId === ticketKey) {
      return;
    }
    
    setCreatingTicketId(ticketKey);
    
    try {
      let ticketType: 'security' | 'improvement' | 'cost_optimization' = 'improvement';
      
      if (check.framework === 'lgpd' || check.framework === 'gdpr' || 
          check.severity === 'critical' || check.severity === 'high') {
        ticketType = 'security';
      } else if (check.control_name.toLowerCase().includes('cost') || 
                 check.control_name.toLowerCase().includes('optimi')) {
        ticketType = 'cost_optimization';
      }

      const user = await cognitoAuth.getCurrentUser();
      const profile = await apiClient.select('profiles', {
        select: 'organization_id',
        eq: { id: user?.username },
        single: true
      });
      
      await apiClient.insert('remediation_tickets', {
        organization_id: profile.data?.organization_id,
        title: `[${check.framework.toUpperCase()}] ${check.control_name}`,
        description: check.remediation_steps || t("compliance.noRemediationSteps"),
        priority: check.severity === 'critical' ? 'high' : check.severity === 'high' ? 'medium' : 'low',
        severity: check.severity || 'medium',
        status: 'pending',
        category: ticketType,
        compliance_check_id: check.id
      });

      toast({ 
        title: "Ticket criado com sucesso!",
        description: 'O ticket de remediação foi adicionado à fila'
      });
      queryClient.invalidateQueries({ queryKey: ['remediation-tickets'] });
    } catch (error) {
      toast({ title: t("compliance.ticketsError"), variant: "destructive" });
    } finally {
      setCreatingTicketId(null);
    }
  };

  const createTicketsForSelected = async () => {
    if (selectedChecks.length === 0) {
      toast({ title: t("compliance.selectChecks"), variant: "destructive" });
      return;
    }

    try {
      const checksToCreate = complianceChecks?.filter(
        check => selectedChecks.includes(check.id) && check.status === 'failed'
      ) || [];

      for (const check of checksToCreate) {
        let ticketType: 'security' | 'improvement' | 'cost_optimization' = 'improvement';
        
        if (check.framework === 'lgpd' || check.framework === 'gdpr' || 
            check.severity === 'critical' || check.severity === 'high') {
          ticketType = 'security';
        } else if (check.control_name.toLowerCase().includes('cost') || 
                   check.control_name.toLowerCase().includes('optimi')) {
          ticketType = 'cost_optimization';
        }

        const user = await cognitoAuth.getCurrentUser();
        const profile = await apiClient.select('profiles', {
          select: 'organization_id',
          eq: { id: user?.username },
          single: true
        });
        
        await apiClient.insert('remediation_tickets', {
          organization_id: profile.data?.organization_id,
          title: `[${check.framework.toUpperCase()}] ${check.control_name}`,
          description: check.remediation_steps || t("compliance.noRemediationSteps"),
          priority: check.severity === 'critical' ? 'high' : check.severity === 'high' ? 'medium' : 'low',
          severity: check.severity || 'medium',
          status: 'pending',
          category: ticketType,
          compliance_check_id: check.id
        });
      }

      toast({ 
        title: t("compliance.ticketsCreated", { count: checksToCreate.length })
      });
      setSelectedChecks([]);
      queryClient.invalidateQueries({ queryKey: ['remediation-tickets'] });
    } catch (error) {
      toast({ title: t("compliance.ticketsError"), variant: "destructive" });
    }
  };

  const toggleFrameworkSelection = (frameworkId: string) => {
    setSelectedFrameworks(prev => 
      prev.includes(frameworkId) 
        ? prev.filter(id => id !== frameworkId)
        : [...prev, frameworkId]
    );
  };

  const toggleCheckSelection = (checkId: string) => {
    setSelectedChecks(prev => 
      prev.includes(checkId) 
        ? prev.filter(id => id !== checkId)
        : [...prev, checkId]
    );
  };

  const toggleAllChecksForFramework = (frameworkId: string) => {
    const frameworkChecks = complianceChecks?.filter(
      check => check.framework === frameworkId && check.status === 'failed'
    ).map(check => check.id) || [];
    
    const allSelected = frameworkChecks.every(id => selectedChecks.includes(id));
    
    if (allSelected) {
      setSelectedChecks(prev => prev.filter(id => !frameworkChecks.includes(id)));
    } else {
      setSelectedChecks(prev => [...new Set([...prev, ...frameworkChecks])]);
    }
  };

  const getFrameworkStats = (frameworkId: string) => {
    const checks = complianceChecks.filter(c => c.framework === frameworkId);
    const passed = checks.filter(c => c.status === 'passed').length;
    const failed = checks.filter(c => c.status === 'failed').length;
    const total = checks.length;
    const compliance = total > 0 ? (passed / total) * 100 : 0;

    return { passed, failed, total, compliance };
  };

  const getSeverityWeight = (severity: string) => {
    switch (severity) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  };

  const sortChecksBySeverity = (checks: any[]) => {
    return [...checks].sort((a, b) => {
      // Primeiro por severidade (maior para menor)
      const severityDiff = getSeverityWeight(b.severity) - getSeverityWeight(a.severity);
      if (severityDiff !== 0) return severityDiff;
      
      // Depois por status (failed primeiro)
      if (a.status === 'failed' && b.status !== 'failed') return -1;
      if (a.status !== 'failed' && b.status === 'failed') return 1;
      
      return 0;
    });
  };

  if (isLoading) {
    return (
      <Card className="glass border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            {t("compliance.title")}
          </CardTitle>
          <CardDescription>Carregando análise de compliance...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="glass border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                {t("compliance.title")}
              </CardTitle>
              <CardDescription>
                {t("compliance.description")}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={runSelectedFrameworks}
                disabled={runningFramework !== null || selectedFrameworks.length === 0}
                variant="default"
                size="sm"
                className="gap-2"
              >
                <PlayCircle className="h-4 w-4" />
                {t("compliance.runSelected")} ({selectedFrameworks.length})
              </Button>
              <Button 
                onClick={runAllFrameworks}
                disabled={runningFramework !== null}
                variant="secondary"
                size="sm"
                className="gap-2"
              >
                {runningFramework ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Executando...
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4" />
                    {t("compliance.runAll")}
                  </>
                )}
              </Button>
              {selectedChecks.length > 0 && (
                <Button 
                  onClick={createTicketsForSelected}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Ticket className="h-4 w-4" />
                  {t("compliance.createTickets")} ({selectedChecks.length})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!isTVMode && selectedChecks.length > 0 && (
            <div className="flex justify-end mb-6 gap-2">
              <Button 
                onClick={createTicketsForSelected}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Ticket className="h-4 w-4" />
                {t("compliance.createTickets")} ({selectedChecks.length})
              </Button>
            </div>
          )}
          <Tabs defaultValue={FRAMEWORKS[0].id}>
            <TabsList className="grid grid-cols-5 mb-6">
              {FRAMEWORKS.map(framework => (
                <TabsTrigger 
                  key={framework.id} 
                  value={framework.id}
                  className="flex items-center gap-2"
                >
                  <Checkbox
                    checked={selectedFrameworks.includes(framework.id)}
                    onCheckedChange={() => toggleFrameworkSelection(framework.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="mr-1">{framework.icon}</span>
                  {framework.name}
                </TabsTrigger>
              ))}
            </TabsList>

          {FRAMEWORKS.map(framework => {
            const stats = getFrameworkStats(framework.id);
            const frameworkChecks = sortChecksBySeverity(
              complianceChecks.filter(c => c.framework === framework.id)
            );
            const failedChecks = frameworkChecks.filter(c => c.status === 'failed');
            
            // Pagination
            const page = currentPage[framework.id] || 1;
            const totalPages = Math.ceil(frameworkChecks.length / CHECKS_PER_PAGE);
            const startIndex = (page - 1) * CHECKS_PER_PAGE;
            const endIndex = startIndex + CHECKS_PER_PAGE;
            const paginatedChecks = frameworkChecks.slice(startIndex, endIndex);

            return (
              <TabsContent key={framework.id} value={framework.id} className="space-y-4">
                {/* Framework Header */}
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-lg font-semibold">{framework.name}</h3>
                      <p className="text-sm text-muted-foreground">{framework.description}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {failedChecks.length > 0 && (
                        <Button 
                          onClick={() => toggleAllChecksForFramework(framework.id)}
                          variant="outline"
                          size="sm"
                        >
                          <Checkbox
                            checked={failedChecks.every(c => selectedChecks.includes(c.id))}
                            className="mr-2"
                          />
                          {t("compliance.selectAllFailed")}
                        </Button>
                      )}
                      <Button
                        onClick={() => runComplianceScan.mutate(framework.id)}
                        disabled={runningFramework === framework.id}
                        size="sm"
                        variant="outline"
                      >
                        {runningFramework === framework.id ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Executando
                          </>
                        ) : (
                          <>
                            <PlayCircle className="h-4 w-4 mr-2" />
                            {t("compliance.runScan")}
                          </>
                        )}
                      </Button>
                      <div className="text-right">
                        <div className={`text-3xl font-bold ${
                          stats.compliance >= 80 ? 'text-green-600' :
                          stats.compliance >= 60 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {stats.compliance.toFixed(0)}%
                        </div>
                        <div className="text-xs text-muted-foreground">Compliance</div>
                      </div>
                    </div>
                  </div>
                  <Progress value={stats.compliance} className="mb-2" />
                  <div className="flex gap-4 text-sm">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      {stats.passed} Passou
                    </span>
                    <span className="flex items-center gap-1">
                      <XCircle className="w-4 h-4 text-red-600" />
                      {stats.failed} Falhou
                    </span>
                    <span className="text-muted-foreground">
                      {stats.total} Total
                    </span>
                  </div>
                </div>

                {/* Checks List */}
                <div className="space-y-3">
                  {frameworkChecks.length === 0 ? (
                    <div className="text-center p-8 text-muted-foreground">
                      <Shield className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Nenhuma verificação executada para este framework</p>
                      <p className="text-sm mt-1">Execute um scan de compliance para ver os resultados</p>
                    </div>
                  ) : (
                    <>
                      {paginatedChecks.map(check => (
                      <Card 
                        key={check.id} 
                        className="border-l-4 border-l-primary hover:shadow-md transition-all cursor-pointer"
                        onClick={() => setSelectedCheck(check)}
                      >
                        <CardContent className="pt-6">
                          <div className="flex items-start gap-3">
                            {check.status === 'failed' && (
                              <Checkbox
                                checked={selectedChecks.includes(check.id)}
                                onCheckedChange={() => toggleCheckSelection(check.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-1"
                              />
                            )}
                            <Badge 
                              variant={
                                check.severity === 'critical' ? 'destructive' : 
                                check.severity === 'high' ? 'destructive' : 
                                check.severity === 'medium' ? 'default' : 
                                'secondary'
                              }
                            >
                              {check.severity}
                            </Badge>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                {check.status === 'passed' ? (
                                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                                ) : (
                                  <XCircle className="w-5 h-5 text-red-500" />
                                )}
                                <h5 className="font-semibold">{check.control_name}</h5>
                              </div>
                              <p className="text-sm text-muted-foreground mb-1">
                                ID: {check.control_id}
                              </p>
                              {check.evidence && typeof check.evidence === 'string' && (
                                <div className="bg-muted/50 rounded-lg p-3 mt-3">
                                  <p className="text-sm text-muted-foreground line-clamp-2">{check.evidence}</p>
                                </div>
                              )}
                            </div>
                            {check.status === 'failed' && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  createTicketForCheck(check);
                                }}
                                disabled={creatingTicketId === `${check.framework}-${check.control_id}`}
                                className="gap-2"
                              >
                                <Ticket className="h-4 w-4" />
                                {creatingTicketId === `${check.framework}-${check.control_id}` ? 'Criando...' : 'Criar Ticket'}
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                      ))}
                      
                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => ({ ...prev, [framework.id]: Math.max(1, page - 1) }))}
                            disabled={page === 1}
                          >
                            Anterior
                          </Button>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                              <Button
                                key={pageNum}
                                variant={pageNum === page ? "default" : "ghost"}
                                size="sm"
                                onClick={() => setCurrentPage(prev => ({ ...prev, [framework.id]: pageNum }))}
                                className="w-8 h-8 p-0"
                              >
                                {pageNum}
                              </Button>
                            ))}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => ({ ...prev, [framework.id]: Math.min(totalPages, page + 1) }))}
                            disabled={page === totalPages}
                          >
                            Próxima
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Critical Issues Summary */}
                {frameworkChecks.filter(c => c.status === 'failed' && c.severity === 'critical').length > 0 && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-red-900 mb-1">
                          Problemas Críticos de Compliance
                        </h4>
                        <p className="text-sm text-red-800">
                          {frameworkChecks.filter(c => c.status === 'failed' && c.severity === 'critical').length} controles críticos falharam.
                          Ação imediata recomendada para manter compliance com {framework.name}.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>

    {/* Detalhamento Completo */}
    <Dialog open={!!selectedCheck} onOpenChange={() => setSelectedCheck(null)}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedCheck?.status === 'passed' ? (
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            ) : (
              <XCircle className="w-6 h-6 text-red-500" />
            )}
            {selectedCheck?.control_name}
          </DialogTitle>
          <DialogDescription>
            Framework: {FRAMEWORKS.find(f => f.id === selectedCheck?.framework)?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ID do Controle */}
          <div>
            <h4 className="font-semibold mb-2">ID do Controle</h4>
            <p className="text-sm text-muted-foreground">{selectedCheck?.control_id}</p>
          </div>

          {/* Status e Severidade */}
          <div className="flex gap-4">
            <div className="flex-1">
              <h4 className="font-semibold mb-2">Status</h4>
              <Badge variant={selectedCheck?.status === 'passed' ? 'default' : 'destructive'}>
                {selectedCheck?.status === 'passed' ? 'Aprovado' : 'Reprovado'}
              </Badge>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold mb-2">Severidade</h4>
              <Badge 
                variant={
                  selectedCheck?.severity === 'critical' ? 'destructive' : 
                  selectedCheck?.severity === 'high' ? 'destructive' : 
                  selectedCheck?.severity === 'medium' ? 'default' : 
                  'secondary'
                }
              >
                {selectedCheck?.severity}
              </Badge>
            </div>
          </div>

          {/* Evidências */}
          {selectedCheck?.evidence && typeof selectedCheck.evidence === 'string' && (
            <div>
              <h4 className="font-semibold mb-2">Evidências</h4>
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {selectedCheck.evidence}
                </p>
              </div>
            </div>
          )}

          {/* Passos de Remediação */}
          {selectedCheck?.remediation_steps && typeof selectedCheck.remediation_steps === 'string' && (
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                Passos de Remediação
              </h4>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="text-sm text-yellow-900 dark:text-yellow-100 whitespace-pre-wrap">
                  {selectedCheck.remediation_steps}
                </p>
              </div>
            </div>
          )}

          {/* Ações */}
          {selectedCheck?.status === 'failed' && (
            <div className="flex gap-2 pt-4 border-t">
              <Button 
                onClick={() => {
                  createTicketForCheck(selectedCheck);
                  setSelectedCheck(null);
                }}
                disabled={creatingTicketId === `${selectedCheck.framework}-${selectedCheck.control_id}`}
                className="gap-2"
              >
                <Ticket className="h-4 w-4" />
                {creatingTicketId === `${selectedCheck.framework}-${selectedCheck.control_id}` ? 'Criando Ticket...' : 'Criar Ticket de Remediação'}
              </Button>
              <Button variant="outline" onClick={() => setSelectedCheck(null)}>
                Fechar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  </>
  );
}
