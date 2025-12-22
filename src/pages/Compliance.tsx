import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/integrations/aws/api-client";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  FileCheck,
  RefreshCw,
  Download,
  BarChart3,
  Award,
  Clock,
  Target
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from "recharts";

interface ComplianceFramework {
  id: string;
  framework_name: string;
  framework_code: string;
  description: string;
  total_controls: number;
  passed_controls: number;
  failed_controls: number;
  not_applicable: number;
  compliance_score: number;
  last_assessment: string;
  status: 'compliant' | 'non_compliant' | 'partial' | 'not_assessed';
}

interface ComplianceControl {
  id: string;
  framework_id: string;
  control_id: string;
  control_title: string;
  control_description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'passed' | 'failed' | 'not_applicable' | 'manual_review';
  last_checked: string;
  remediation_guidance: string;
  affected_resources: string[];
  evidence: string[];
}

export default function Compliance() {
  const { toast } = useToast();
  const { selectedAccountId } = useAwsAccount();
  const { data: organizationId } = useOrganization();
  const [selectedFramework, setSelectedFramework] = useState<string>('all');

  // Get compliance frameworks
  const { data: frameworks, isLoading, refetch } = useQuery({
    queryKey: ['compliance-frameworks', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.select('compliance_frameworks', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId
        },
        order: { compliance_score: 'desc' }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return response.data || [];
    },
  });

  // Get compliance controls
  const { data: controls, isLoading: controlsLoading } = useQuery({
    queryKey: ['compliance-controls', organizationId, selectedAccountId, selectedFramework],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let filters: any = { 
        organization_id: organizationId,
        aws_account_id: selectedAccountId
      };

      if (selectedFramework !== 'all') {
        filters.framework_id = selectedFramework;
      }

      const response = await apiClient.select('compliance_controls', {
        select: '*',
        eq: filters,
        order: { severity: 'desc', status: 'asc' }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return response.data || [];
    },
  });

  const handleRefresh = async () => {
    try {
      await refetch();
      toast({
        title: "Dados atualizados",
        description: "Os dados de compliance foram atualizados.",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar os dados.",
        variant: "destructive"
      });
    }
  };

  const exportCompliance = () => {
    if (!frameworks) return;

    const csvContent = [
      'Framework,Score,Controles Totais,Aprovados,Falhados,Status',
      ...frameworks.map(framework => [
        framework.framework_name,
        framework.compliance_score.toFixed(1),
        framework.total_controls,
        framework.passed_controls,
        framework.failed_controls,
        framework.status
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `compliance_report_${selectedAccountId}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    toast({
      title: "Relatório exportado",
      description: "O relatório de compliance foi exportado com sucesso.",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'compliant': return <Badge className="bg-green-500">Conforme</Badge>;
      case 'non_compliant': return <Badge variant="destructive">Não Conforme</Badge>;
      case 'partial': return <Badge variant="secondary">Parcial</Badge>;
      case 'not_assessed': return <Badge variant="outline">Não Avaliado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getControlStatusBadge = (status: string) => {
    switch (status) {
      case 'passed': return <Badge className="bg-green-500">Aprovado</Badge>;
      case 'failed': return <Badge variant="destructive">Falhado</Badge>;
      case 'not_applicable': return <Badge variant="outline">N/A</Badge>;
      case 'manual_review': return <Badge variant="secondary">Revisão Manual</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'compliant':
      case 'passed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'non_compliant':
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'partial': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'manual_review': return <Clock className="h-4 w-4 text-blue-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  // Calculate summary metrics
  const totalFrameworks = frameworks?.length || 0;
  const compliantFrameworks = frameworks?.filter(f => f.status === 'compliant').length || 0;
  const avgComplianceScore = frameworks?.length > 0 
    ? frameworks.reduce((sum, f) => sum + f.compliance_score, 0) / frameworks.length 
    : 0;
  const totalControls = frameworks?.reduce((sum, f) => sum + f.total_controls, 0) || 0;
  const passedControls = frameworks?.reduce((sum, f) => sum + f.passed_controls, 0) || 0;

  // Prepare chart data
  const frameworkData = frameworks?.map(framework => ({
    name: framework.framework_code,
    score: framework.compliance_score,
    passed: framework.passed_controls,
    failed: framework.failed_controls,
    total: framework.total_controls
  })) || [];

  const statusDistribution = frameworks?.reduce((acc, framework) => {
    acc[framework.status] = (acc[framework.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const pieData = Object.entries(statusDistribution).map(([status, count]) => ({
    name: status === 'compliant' ? 'Conforme' : 
          status === 'non_compliant' ? 'Não Conforme' : 
          status === 'partial' ? 'Parcial' : 'Não Avaliado',
    value: count,
    color: status === 'compliant' ? '#10b981' : 
           status === 'non_compliant' ? '#ef4444' : 
           status === 'partial' ? '#f59e0b' : '#6b7280'
  }));

  const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#6b7280'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="glass border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                Compliance & Conformidade
              </CardTitle>
              <CardDescription>
                Verificação de conformidade com frameworks de segurança e regulamentações
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
                onClick={exportCompliance}
                className="glass"
                disabled={!frameworks || frameworks.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar Relatório
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Frameworks</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">{totalFrameworks}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Conformes</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-green-500">{compliantFrameworks}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Score Médio</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="space-y-2">
                <div className="text-2xl font-bold">{avgComplianceScore.toFixed(1)}%</div>
                <Progress value={avgComplianceScore} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Controles Totais</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{totalControls}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Controles Aprovados</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="space-y-1">
                <div className="text-2xl font-bold text-green-500">{passedControls}</div>
                <div className="text-xs text-muted-foreground">
                  {totalControls > 0 ? `${((passedControls / totalControls) * 100).toFixed(1)}%` : '0%'}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="frameworks" className="w-full">
        <TabsList className="glass">
          <TabsTrigger value="frameworks">Frameworks</TabsTrigger>
          <TabsTrigger value="controls">Controles</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="remediation">Remediação</TabsTrigger>
        </TabsList>

        <TabsContent value="frameworks" className="space-y-6">
          {/* Frameworks List */}
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Frameworks de Compliance</CardTitle>
              <CardDescription>Status de conformidade com diferentes frameworks</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : frameworks && frameworks.length > 0 ? (
                <div className="space-y-4">
                  {frameworks.map((framework) => (
                    <div key={framework.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          {getStatusIcon(framework.status)}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">{framework.framework_name}</h4>
                              <Badge variant="outline">{framework.framework_code}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{framework.description}</p>
                            <div className="text-xs text-muted-foreground">
                              Última avaliação: {new Date(framework.last_assessment).toLocaleString('pt-BR')}
                            </div>
                          </div>
                        </div>
                        <div className="text-right space-y-2">
                          {getStatusBadge(framework.status)}
                          <div className="text-2xl font-bold">
                            {framework.compliance_score.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Progress value={framework.compliance_score} className="h-2" />
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Total:</span>
                            <div className="font-medium">{framework.total_controls}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Aprovados:</span>
                            <div className="font-medium text-green-500">{framework.passed_controls}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Falhados:</span>
                            <div className="font-medium text-red-500">{framework.failed_controls}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">N/A:</span>
                            <div className="font-medium text-gray-500">{framework.not_applicable}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Award className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">Nenhum framework configurado</h3>
                  <p className="text-muted-foreground">
                    Configure frameworks de compliance para começar as avaliações.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="controls" className="space-y-4">
          {/* Framework Filter */}
          <Card className="glass border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <Select value={selectedFramework} onValueChange={setSelectedFramework}>
                  <SelectTrigger className="w-64 glass">
                    <SelectValue placeholder="Filtrar por framework" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Frameworks</SelectItem>
                    {frameworks?.map((framework) => (
                      <SelectItem key={framework.id} value={framework.id}>
                        {framework.framework_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Controls List */}
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Controles de Compliance</CardTitle>
              <CardDescription>Detalhes dos controles de conformidade</CardDescription>
            </CardHeader>
            <CardContent>
              {controlsLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))}
                </div>
              ) : controls && controls.length > 0 ? (
                <div className="space-y-4">
                  {controls.map((control) => (
                    <div key={control.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          {getStatusIcon(control.status)}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">{control.control_id}</h4>
                              {getSeverityBadge(control.severity)}
                            </div>
                            <h5 className="font-medium">{control.control_title}</h5>
                            <p className="text-sm text-muted-foreground">{control.control_description}</p>
                            <div className="text-xs text-muted-foreground">
                              Última verificação: {new Date(control.last_checked).toLocaleString('pt-BR')}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          {getControlStatusBadge(control.status)}
                        </div>
                      </div>
                      
                      {control.affected_resources && control.affected_resources.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Recursos Afetados:</p>
                          <div className="flex gap-2 flex-wrap">
                            {control.affected_resources.map((resource, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {resource}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {control.remediation_guidance && (
                        <div className="bg-muted/30 rounded p-3">
                          <p className="text-sm font-medium mb-1">Orientação de Remediação:</p>
                          <p className="text-sm text-muted-foreground">{control.remediation_guidance}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <FileCheck className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">Nenhum controle encontrado</h3>
                  <p className="text-muted-foreground">
                    Nenhum controle corresponde aos filtros aplicados.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Compliance Scores Chart */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>Scores por Framework</CardTitle>
                <CardDescription>Comparação de conformidade entre frameworks</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : frameworkData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={frameworkData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="name" 
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
                    Nenhum dado disponível
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Status Distribution */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>Distribuição de Status</CardTitle>
                <CardDescription>Status de conformidade dos frameworks</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Nenhum dado disponível
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="remediation" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Plano de Remediação</CardTitle>
              <CardDescription>Ações recomendadas para melhorar a conformidade</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Target className="h-12 w-12 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Plano de remediação em desenvolvimento</h3>
                  <p>Recomendações automáticas de remediação serão implementadas em breve.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}