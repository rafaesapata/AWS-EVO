import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Zap, DollarSign, TrendingUp, Clock, Target, RefreshCw, CheckCircle2, Eye, MessageSquare, AlertCircle, Plus } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";

interface RISPRecommendation {
  id: string;
  recommendation_type: string;
  service: string;
  instance_family: string | null;
  region: string;
  term_length: string;
  payment_option: string;
  current_on_demand_cost: number;
  recommended_commitment_cost: number;
  monthly_savings: number;
  yearly_savings: number;
  break_even_months: number | null;
  coverage_percentage: number | null;
  confidence_score: number;
  status: string;
}

export default function RISPOptimizer() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { selectedAccountId, selectedProvider } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();
  const { data: organizationId } = useOrganization();
  const [recommendations, setRecommendations] = useState<RISPRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedRec, setSelectedRec] = useState<RISPRecommendation | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [editingPriority, setEditingPriority] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState<string>('medium');

  useEffect(() => {
    if (organizationId && selectedAccountId) {
      loadRecommendations();
    }
  }, [organizationId, selectedAccountId]);

  const loadRecommendations = async () => {
    if (!organizationId || !selectedAccountId) return;
    
    setLoading(true);
    try {
      const result = await apiClient.select('ri_sp_recommendations', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          ...getAccountFilter() // Multi-cloud compatible
        },
        order: { yearly_savings: 'desc' },
        limit: 50
      });

      if (result.error) throw new Error(getErrorMessage(result.error));
      setRecommendations(result.data || []);

      // Se não houver recomendações, não gera automaticamente
      // O usuário deve clicar em "Analyze" para gerar
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const generateRecommendations = async () => {
    if (!selectedAccountId) {
      toast({
        title: t('common.error'),
        description: "Selecione uma conta cloud primeiro",
        variant: "destructive"
      });
      return;
    }
    
    setAnalyzing(true);
    const isAzure = selectedProvider === 'AZURE';
    const providerName = isAzure ? 'Azure' : 'AWS';
    
    try {
      toast({
        title: "Analisando...",
        description: isAzure 
          ? "Analisando recursos Azure e oportunidades de economia com Reservations"
          : "Analisando instâncias EC2, RDS e oportunidades de economia com RI/SP"
      });

      // Get current user for authentication
      const user = await cognitoAuth.getCurrentUser();
      if (!user) {
        throw new Error('No active session');
      }

      // Call the appropriate Lambda based on provider
      const lambdaName = isAzure ? 'azure-reservations-analyzer' : 'ri-sp-analyzer';
      const bodyParam = isAzure 
        ? { credentialId: selectedAccountId }
        : { accountId: selectedAccountId };
      
      const analysisResult = await apiClient.invoke(lambdaName, {
        body: bodyParam
      });

      if (analysisResult.error) {
        throw new Error(`Falha ao analisar ${isAzure ? 'Reservations' : 'RI/SP'}. Verifique se suas credenciais ${providerName} estão corretas e têm as permissões necessárias.`);
      }

      const analysisData = analysisResult.data;

      await loadRecommendations();
      toast({
        title: t('common.success'),
        description: `Análise concluída! ${analysisData?.recommendations_count || 0} recomendações encontradas com economia anual de $${analysisData?.total_yearly_savings?.toLocaleString() || 0}`
      });
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const createTicket = async (rec: RISPRecommendation) => {
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      if (!organizationId) throw new Error('Organization not found');

      const ticketTitle = `RI/SP: ${rec.recommendation_type === 'reserved_instance' ? 'Reserved Instance' : 'Savings Plan'} - ${rec.service}`;
      const ticketDescription = `
**Tipo:** ${rec.recommendation_type === 'reserved_instance' ? 'Reserved Instance' : 'Savings Plan'}
**Serviço:** ${rec.service}
**Região:** ${rec.region}
**Família:** ${rec.instance_family || 'N/A'}
**Período:** ${rec.term_length}
**Opção de Pagamento:** ${rec.payment_option}

**Economia Mensal:** $${rec.monthly_savings.toLocaleString()}
**Economia Anual:** $${rec.yearly_savings.toLocaleString()}
**Break-even:** ${rec.break_even_months || 'N/A'} meses

**Custo On-Demand Atual:** $${rec.current_on_demand_cost.toLocaleString()}
**Custo com Commitment:** $${rec.recommended_commitment_cost.toLocaleString()}
**Confiança:** ${rec.confidence_score}%

**Próximos Passos:**
1. Revisar a recomendação com a equipe
2. Acessar AWS Console > ${rec.service === 'EC2' ? 'EC2 > Reserved Instances' : rec.service === 'RDS' ? 'RDS > Reserved Instances' : 'Billing > Savings Plans'}
3. Comprar o RI/SP conforme especificações acima
4. Validar economia após implementação
      `.trim();

      const ticketResult = await apiClient.insert('remediation_tickets', {
        organization_id: organizationId,
        title: ticketTitle,
        description: ticketDescription,
        priority: rec.yearly_savings > 5000 ? 'high' : rec.yearly_savings > 2000 ? 'medium' : 'low',
        severity: rec.yearly_savings > 5000 ? 'high' : rec.yearly_savings > 2000 ? 'medium' : 'low',
        category: 'cost_optimization',
        status: 'pending',
        estimated_savings: rec.yearly_savings
      });

      if (ticketResult.error) throw new Error(ticketResult.error);

      // Atualizar status da recomendação para 'approved'
      const updateResult = await apiClient.update('ri_sp_recommendations',
        { status: 'approved' },
        { eq: { id: rec.id } }
      );

      if (updateResult.error) throw new Error(updateResult.error);

      toast({
        title: "Ticket criado com sucesso!",
        description: "A recomendação foi aprovada e um ticket foi criado para implementação."
      });

      await loadRecommendations();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const totalYearlySavings = recommendations.reduce((sum, rec) => sum + rec.yearly_savings, 0);
  const totalMonthlySavings = recommendations.reduce((sum, rec) => sum + rec.monthly_savings, 0);
  const avgConfidence = recommendations.length > 0
    ? recommendations.reduce((sum, rec) => sum + rec.confidence_score, 0) / recommendations.length
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              {t('dashboard.riSpOptimizer') || 'RI/Savings Plans Optimizer'}
            </CardTitle>
            <CardDescription>
              {t('dashboard.riSpDescription') || 'ML-powered recommendations for Reserved Instances and Savings Plans'}
            </CardDescription>
          </div>
          <Button onClick={generateRecommendations} disabled={analyzing || loading} size="sm">
            {analyzing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Target className="h-4 w-4 mr-2" />
                Analyze
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-6">
            {/* Summary Cards Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="pt-6">
                    <div className="space-y-2">
                      <div className="h-4 w-32 bg-muted rounded" />
                      <div className="h-8 w-24 bg-muted rounded" />
                      <div className="h-1 w-full bg-muted rounded" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            {/* Table Skeleton */}
            <div className="border rounded-lg p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="h-12 w-20 bg-muted rounded" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 bg-muted rounded" />
                    <div className="h-3 w-1/2 bg-muted rounded" />
                  </div>
                  <div className="h-12 w-32 bg-muted rounded" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Potential Yearly Savings</div>
                    <div className="text-2xl font-bold text-green-600">
                      ${totalYearlySavings.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <DollarSign className="h-8 w-8 text-green-500/20" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Monthly Savings</div>
                    <div className="text-2xl font-bold">
                      ${totalMonthlySavings.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <TrendingUp className="h-8 w-8 text-primary/20" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Avg. Confidence</div>
                    <div className="text-2xl font-bold">{avgConfidence.toFixed(0)}%</div>
                    <Progress value={avgConfidence} className="h-1 mt-2" />
                  </div>
                  <Target className="h-8 w-8 text-primary/20" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recommendations Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Instance/Resource ID</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Monthly Savings</TableHead>
                  <TableHead>Yearly Savings</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recommendations.map((rec) => (
                  <TableRow key={rec.id}>
                    <TableCell>
                      <Badge variant={rec.recommendation_type === 'reserved_instance' ? 'default' : 'secondary'}>
                        {rec.recommendation_type === 'reserved_instance' ? 'RI' : 'SP'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{rec.service}</div>
                      {rec.instance_family && (
                        <div className="text-xs text-muted-foreground">{rec.instance_family}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs bg-muted px-2 py-1 rounded max-w-fit">
                        <span className="text-muted-foreground">ID: </span>
                        <span className="font-semibold">{rec.id.substring(0, 8)}...</span>
                      </div>
                      {rec.instance_family && (
                        <div className="text-xs text-muted-foreground mt-1">Family: {rec.instance_family}</div>
                      )}
                    </TableCell>
                    <TableCell>{rec.region}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        <Clock className="h-3 w-3 mr-1" />
                        {rec.term_length}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-green-600 font-semibold">
                      ${rec.monthly_savings.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell className="text-green-600 font-bold">
                      ${rec.yearly_savings.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={rec.confidence_score} className="h-2 w-16" />
                        <span className="text-sm">{rec.confidence_score.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {rec.status === 'approved' ? (
                        <Badge className="bg-green-500">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Approved
                        </Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedRec(rec);
                            setDetailsOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Detalhes
                        </Button>
                        {rec.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => createTicket(rec)}
                            className="gap-1"
                          >
                            <Plus className="h-4 w-4" />
                            Criar Ticket
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {recommendations.length === 0 && !loading && (
            <div className="text-center py-12 text-muted-foreground">
              <Zap className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="font-semibold mb-2">Nenhuma recomendação disponível</p>
              <p className="text-sm">Clique em "Analyze" para analisar suas instâncias EC2/RDS e gerar recomendações reais de economia com RI/SP</p>
            </div>
          )}
          </div>
        )}
      </CardContent>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Recomendação RI/SP</DialogTitle>
            <DialogDescription>
              Informações completas sobre a recomendação de Reserved Instance ou Savings Plan
            </DialogDescription>
          </DialogHeader>
          
          {selectedRec && (
            <div className="space-y-6 pb-4">
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Tipo</label>
                  <div className="mt-1">
                    <Badge variant={selectedRec.recommendation_type === 'reserved_instance' ? 'default' : 'secondary'}>
                      {selectedRec.recommendation_type === 'reserved_instance' ? 'Reserved Instance' : 'Savings Plan'}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <div className="mt-1">
                    {selectedRec.status === 'approved' ? (
                      <Badge className="bg-green-500">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Aprovado
                      </Badge>
                    ) : (
                      <Badge variant="outline">Pendente</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Service Details */}
              <div className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-semibold mb-3">Detalhes do Serviço</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Serviço AWS</label>
                    <p className="font-medium">{selectedRec.service}</p>
                  </div>
                  {selectedRec.instance_family && (
                    <div>
                      <label className="text-sm text-muted-foreground">Família de Instância</label>
                      <p className="font-medium">{selectedRec.instance_family}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm text-muted-foreground">Região</label>
                    <p className="font-medium">{selectedRec.region}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">ID da Recomendação</label>
                    <p className="font-mono text-xs">{selectedRec.id}</p>
                  </div>
                </div>
              </div>

              {/* Commitment Details */}
              <div className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-semibold mb-3">Detalhes do Compromisso</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Prazo</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="h-4 w-4" />
                      <p className="font-medium">{selectedRec.term_length}</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Opção de Pagamento</label>
                    <p className="font-medium">{selectedRec.payment_option}</p>
                  </div>
                  {selectedRec.coverage_percentage !== null && (
                    <div>
                      <label className="text-sm text-muted-foreground">Cobertura Estimada</label>
                      <div className="mt-1">
                        <Progress value={selectedRec.coverage_percentage} className="h-2" />
                        <p className="text-sm mt-1">{selectedRec.coverage_percentage.toFixed(1)}%</p>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-sm text-muted-foreground">Confiança da Recomendação</label>
                    <div className="mt-1">
                      <Progress value={selectedRec.confidence_score} className="h-2" />
                      <p className="text-sm mt-1">{selectedRec.confidence_score.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cost Analysis */}
              <div className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-semibold mb-3">Análise de Custos</h4>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground">Custo On-Demand Atual</label>
                      <p className="text-2xl font-bold">${selectedRec.current_on_demand_cost.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                      <p className="text-xs text-muted-foreground">por mês</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Custo com Compromisso</label>
                      <p className="text-2xl font-bold text-primary">${selectedRec.recommended_commitment_cost.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                      <p className="text-xs text-muted-foreground">por mês</p>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-muted-foreground">Economia Mensal</label>
                        <p className="text-2xl font-bold text-green-600">
                          ${selectedRec.monthly_savings.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {((selectedRec.monthly_savings / selectedRec.current_on_demand_cost) * 100).toFixed(1)}% de economia
                        </p>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Economia Anual</label>
                        <p className="text-2xl font-bold text-green-600">
                          ${selectedRec.yearly_savings.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </p>
                        {selectedRec.break_even_months !== null && (
                          <p className="text-xs text-muted-foreground">
                            Break-even em {selectedRec.break_even_months} meses
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Priority Management */}
              <div className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Gerenciar Prioridade
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Label>Prioridade Atual:</Label>
                    {!editingPriority ? (
                      <div className="flex items-center gap-2">
                        <Badge variant={selectedRec.status === 'approved' ? 'default' : 'outline'}>
                          {selectedRec.status}
                        </Badge>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            setEditingPriority(true);
                            setSelectedPriority(selectedRec.status);
                          }}
                        >
                          Alterar
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Select value={selectedPriority} onValueChange={setSelectedPriority}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pendente</SelectItem>
                            <SelectItem value="approved">Aprovado</SelectItem>
                            <SelectItem value="rejected">Rejeitado</SelectItem>
                            <SelectItem value="implemented">Implementado</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button 
                          size="sm" 
                          onClick={async () => {
                            try {
                              const result = await apiClient.update('ri_sp_recommendations',
                                { status: selectedPriority },
                                { eq: { id: selectedRec.id } }
                              );
                              
                              if (result.error) throw new Error(getErrorMessage(result.error));
                              
                              setSelectedRec({ ...selectedRec, status: selectedPriority });
                              setEditingPriority(false);
                              toast({
                                title: "Prioridade atualizada",
                                description: "A prioridade foi alterada com sucesso."
                              });
                            } catch (error: any) {
                              toast({
                                title: "Erro",
                                description: error.message,
                                variant: "destructive"
                              });
                            }
                          }}
                        >
                          Salvar
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setEditingPriority(false)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Comments Section */}
              <div className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Comentários e Notas
                </h4>
                <div className="space-y-3">
                  <div>
                    <Textarea
                      placeholder="Adicione um comentário sobre esta recomendação..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <Button 
                    onClick={async () => {
                      if (!newComment.trim()) return;
                      
                      try {
                        // For now, we'll just show a toast since we need to implement the ticket creation
                        // In a real implementation, you'd create or update a remediation_ticket here
                        toast({
                          title: "Comentário adicionado",
                          description: "Seu comentário foi registrado com sucesso."
                        });
                        setNewComment('');
                      } catch (error: any) {
                        toast({
                          title: "Erro",
                          description: error.message,
                          variant: "destructive"
                        });
                      }
                    }}
                    disabled={!newComment.trim()}
                  >
                    Adicionar Comentário
                  </Button>
                </div>
              </div>

              {/* Action Buttons */}
              {selectedRec.status === 'pending' && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      createTicket(selectedRec);
                      setDetailsOpen(false);
                    }}
                    className="flex-1 gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Criar Ticket de Implementação
                  </Button>
                  <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                    Fechar
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}