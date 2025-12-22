import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiClient } from "@/integrations/aws/api-client";
import { toast } from "sonner";
import { Shield, AlertTriangle, CheckCircle2, Clock, FileText, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useOrganization } from "@/hooks/useOrganization";
import { useAwsAccount } from "@/contexts/AwsAccountContext";

interface IAMFinding {
  id: string;
  finding_type: string;
  severity: string;
  resource_type: string;
  resource_id: string;
  resource_name?: string;
  details: any;
  recommendations?: string;
  risk_score?: number;
  unused_days?: number;
  last_used_at?: string;
  policy_document?: any;
  suggested_policy?: any;
  status: string;
}

export function IAMAnalysis() {
  const [isScanning, setIsScanning] = useState(false);
  const queryClient = useQueryClient();
  const { data: organizationId } = useOrganization();
  const { selectedAccountId } = useAwsAccount();

  const { data: findings, isLoading } = useQuery({
    queryKey: ['iam-findings', organizationId, selectedAccountId],
    enabled: !!organizationId,
    queryFn: async () => {
      const filters: Record<string, any> = { organization_id: organizationId };
      if (selectedAccountId) {
        filters.aws_account_id = selectedAccountId;
      }
      
      const response = await apiClient.select<IAMFinding>('iam_findings', {
        eq: filters,
        order: { column: 'created_at', ascending: false }
      });
      
      if (response.error) throw new Error(response.error.message);
      return (response.data || []).map((f: any) => ({
        ...f,
        risk_score: f.risk_score || 0,
        details: f.details || {}
      })) as IAMFinding[];
    }
  });

  const runAnalysis = useMutation({
    mutationFn: async () => {
      const response = await apiClient.lambda('iam-deep-analysis');
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: () => {
      toast.success("Análise IAM concluída com sucesso!");
      queryClient.invalidateQueries({ queryKey: ['iam-findings'] });
    },
    onError: (error: Error) => {
      toast.error("Erro na análise IAM", { description: error.message });
    }
  });

  const handleRunAnalysis = async () => {
    setIsScanning(true);
    await runAnalysis.mutateAsync();
    setIsScanning(false);
  };

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, { variant: "destructive" | "default" | "secondary", icon: any }> = {
      critical: { variant: "destructive", icon: AlertTriangle },
      high: { variant: "destructive", icon: AlertTriangle },
      medium: { variant: "default", icon: Shield },
      low: { variant: "secondary", icon: CheckCircle2 }
    };
    const config = variants[severity] || variants.medium;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="w-3 h-3" />{severity.toUpperCase()}
      </Badge>
    );
  };

  const stats = {
    total: findings?.length || 0,
    critical: findings?.filter(f => f.severity === 'critical').length || 0,
    high: findings?.filter(f => f.severity === 'high').length || 0,
    unused: findings?.filter(f => f.finding_type === 'unused_role' || f.finding_type === 'unused_user').length || 0,
    overprivileged: findings?.filter(f => f.finding_type === 'excessive_permissions').length || 0
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Análise de Permissões IAM</h2>
          <p className="text-muted-foreground">Identifique privilégios excessivos e recursos não utilizados</p>
        </div>
        <Button onClick={handleRunAnalysis} disabled={isScanning} size="lg">
          {isScanning ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analisando...</>
          ) : (
            <><Shield className="w-4 h-4 mr-2" />Executar Análise</>
          )}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats.total}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Críticos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{stats.critical}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Alta Prioridade</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-orange-600">{stats.high}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Não Utilizados</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats.unused}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Sobreprivilegiados</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats.overprivileged}</div></CardContent></Card>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">Todos ({stats.total})</TabsTrigger>
          <TabsTrigger value="excessive">Privilégios Excessivos ({stats.overprivileged})</TabsTrigger>
          <TabsTrigger value="unused">Não Utilizados ({stats.unused})</TabsTrigger>
          <TabsTrigger value="policies">Políticas Sugeridas</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <ScrollArea className="h-[600px]">
            {isLoading ? (
              <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 animate-spin" /></div>
            ) : findings && findings.length > 0 ? (
              findings.map((finding) => (
                <Card key={finding.id} className="mb-4">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{finding.resource_name || finding.resource_id}</CardTitle>
                        <CardDescription className="mt-1">{finding.resource_type} • Risk Score: {finding.risk_score || 0}</CardDescription>
                      </div>
                      {getSeverityBadge(finding.severity)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm font-medium mb-1">Tipo de Problema:</p>
                      <Badge variant="outline">{finding.finding_type.replace(/_/g, ' ')}</Badge>
                    </div>
                    {finding.unused_days && finding.unused_days > 0 && (
                      <Alert>
                        <Clock className="w-4 h-4" />
                        <AlertDescription>Não utilizado há {finding.unused_days} dias</AlertDescription>
                      </Alert>
                    )}
                    {finding.recommendations && (
                      <div>
                        <p className="text-sm font-medium mb-2">Recomendações:</p>
                        <Alert><FileText className="w-4 h-4" /><AlertDescription>{finding.recommendations}</AlertDescription></Alert>
                      </div>
                    )}
                    {finding.suggested_policy && (
                      <div>
                        <p className="text-sm font-medium mb-2">Política Sugerida:</p>
                        <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">{JSON.stringify(finding.suggested_policy, null, 2)}</pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-center">
                <CheckCircle2 className="w-12 h-12 text-success mb-3" />
                <p className="text-muted-foreground">Nenhuma vulnerabilidade IAM encontrada.</p>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="excessive" className="space-y-4">
          <ScrollArea className="h-[600px]">
            {findings?.filter(f => f.finding_type === 'excessive_permissions').map((finding) => (
              <Card key={finding.id} className="mb-4">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle>{finding.resource_name || finding.resource_id}</CardTitle>
                    {getSeverityBadge(finding.severity)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>Este recurso possui permissões excessivas</AlertDescription>
                  </Alert>
                  {finding.suggested_policy && (
                    <div>
                      <p className="text-sm font-medium mb-2 text-success">✓ Política Recomendada:</p>
                      <pre className="bg-success/10 p-3 rounded-lg text-xs overflow-x-auto">{JSON.stringify(finding.suggested_policy, null, 2)}</pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="unused" className="space-y-4">
          <ScrollArea className="h-[600px]">
            {findings?.filter(f => f.finding_type === 'unused_role' || f.finding_type === 'unused_user').map((finding) => (
              <Card key={finding.id} className="mb-4">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{finding.resource_name || finding.resource_id}</CardTitle>
                      <CardDescription>Não utilizado há {finding.unused_days} dias</CardDescription>
                    </div>
                    {getSeverityBadge(finding.severity)}
                  </div>
                </CardHeader>
                <CardContent>
                  <Alert>
                    <Clock className="w-4 h-4" />
                    <AlertDescription>Última utilização: {finding.last_used_at ? new Date(finding.last_used_at).toLocaleString() : 'Nunca'}</AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            ))}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="policies" className="space-y-4">
          <ScrollArea className="h-[600px]">
            {findings?.filter(f => f.suggested_policy).map((finding) => (
              <Card key={finding.id} className="mb-4">
                <CardHeader>
                  <CardTitle className="text-lg">{finding.resource_name || finding.resource_id}</CardTitle>
                  <CardDescription>Política otimizada para least privilege</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <pre className="bg-success/10 p-4 rounded-lg text-xs overflow-x-auto">{JSON.stringify(finding.suggested_policy, null, 2)}</pre>
                  <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(JSON.stringify(finding.suggested_policy, null, 2))}>
                    <FileText className="w-4 h-4 mr-2" />Copiar Política
                  </Button>
                </CardContent>
              </Card>
            ))}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
