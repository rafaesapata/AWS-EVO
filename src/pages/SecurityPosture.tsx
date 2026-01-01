import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layout } from "@/components/Layout";
import { apiClient } from "@/integrations/aws/api-client";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
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
  PieChart
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart as RechartsPieChart, Cell, Pie, LineChart, Line } from "recharts";

interface SecurityFinding {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'active' | 'resolved' | 'suppressed';
  resource: string;
  service: string;
  region: string;
  compliance_standards: string[];
  remediation: string;
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
  const { selectedAccountId } = useAwsAccount();
  const { data: organizationId } = useOrganization();
  const [selectedStandard, setSelectedStandard] = useState<string>('all');

  // Get security posture data
  const { data: securityData, isLoading, refetch } = useQuery({
    queryKey: ['security-posture', organizationId, selectedAccountId, selectedStandard],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      // Get security findings
      const findingsResponse = await apiClient.select('security_findings', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId
        },
        order: { severity: 'desc', created_at: 'desc' }
      });

      // Get compliance data
      const complianceResponse = await apiClient.select('compliance_checks', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId
        }
      });

      // Calculate metrics
      const findings = findingsResponse.data || [];
      const compliance = complianceResponse.data || [];

      const findingsBySeverity = findings.reduce((acc, finding) => {
        acc[finding.severity] = (acc[finding.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const complianceScores = compliance.reduce((acc, check) => {
        if (!acc[check.standard]) {
          acc[check.standard] = { passed: 0, total: 0 };
        }
        acc[check.standard].total++;
        if (check.status === 'passed') {
          acc[check.standard].passed++;
        }
        return acc;
      }, {} as Record<string, { passed: number; total: number }>);

      // Calculate overall score
      const criticalWeight = 10;
      const highWeight = 5;
      const mediumWeight = 2;
      const lowWeight = 1;

      const totalWeight = 
        (findingsBySeverity.critical || 0) * criticalWeight +
        (findingsBySeverity.high || 0) * highWeight +
        (findingsBySeverity.medium || 0) * mediumWeight +
        (findingsBySeverity.low || 0) * lowWeight;

      const maxScore = 100;
      const overallScore = Math.max(0, maxScore - totalWeight);

      return {
        overall_score: overallScore,
        findings_by_severity: findingsBySeverity,
        compliance_scores: Object.entries(complianceScores).reduce((acc, [standard, data]) => {
          acc[standard] = data.total > 0 ? (data.passed / data.total) * 100 : 0;
          return acc;
        }, {} as Record<string, number>),
        findings: findings.slice(0, 50),
        compliance_checks: compliance
      };
    },
  });

  const handleRefresh = async () => {
    try {
      await refetch();
      toast({
        title: "Dados atualizados",
        description: "A postura de segurança foi atualizada com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar os dados de segurança.",
        variant: "destructive"
      });
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
      title: "Relatório exportado",
      description: "O relatório de segurança foi exportado com sucesso.",
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
      title="Postura de Segurança" 
      description="Visão abrangente da segurança e compliance da sua infraestrutura AWS"
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
                Postura de Segurança
              </CardTitle>
              <CardDescription>
                Visão abrangente da segurança e compliance da sua infraestrutura AWS
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
                onClick={exportReport}
                className="glass"
                disabled={!securityData}
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar Relatório
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Security Score Overview */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Security Score</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-12 w-20" />
            ) : (
              <div className="space-y-2">
                <div className="text-3xl font-bold">
                  {securityData?.overall_score || 0}/100
                </div>
                <Progress value={securityData?.overall_score || 0} className="h-2" />
                <div className="flex items-center gap-1 text-sm">
                  {(securityData?.overall_score || 0) >= 80 ? (
                    <>
                      <TrendingUp className="h-4 w-4 text-success" />
                      <span className="text-success">Excelente</span>
                    </>
                  ) : (securityData?.overall_score || 0) >= 60 ? (
                    <>
                      <Eye className="h-4 w-4 text-warning" />
                      <span className="text-warning">Atenção</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="h-4 w-4 text-destructive" />
                      <span className="text-destructive">Crítico</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Findings Críticos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-3xl font-bold text-destructive">
                {securityData?.findings_by_severity?.critical || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Findings Altos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-3xl font-bold text-warning">
                {securityData?.findings_by_severity?.high || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Findings</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-3xl font-bold">
                {Object.values(securityData?.findings_by_severity || {}).reduce((sum, count) => sum + count, 0)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts and Details */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="glass">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="findings">Findings</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="trends">Tendências</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Findings by Severity */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>Findings por Severidade</CardTitle>
                <CardDescription>Distribuição dos achados de segurança</CardDescription>
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
            <Card className="glass border-primary/20">
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
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Findings de Segurança</CardTitle>
              <CardDescription>Lista detalhada dos achados de segurança</CardDescription>
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
                    return (
                      <div key={finding.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
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
                          <Badge 
                            variant="outline"
                            style={{ 
                              borderColor: getSeverityColor(finding.severity),
                              color: getSeverityColor(finding.severity)
                            }}
                          >
                            {finding.severity.toUpperCase()}
                          </Badge>
                        </div>
                        
                        {finding.compliance_standards && finding.compliance_standards.length > 0 && (
                          <div className="flex gap-2 flex-wrap">
                            {finding.compliance_standards.map((standard) => (
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
          <Card className="glass border-primary/20">
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
          <Card className="glass border-primary/20">
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