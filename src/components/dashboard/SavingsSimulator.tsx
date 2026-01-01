import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useOrganization } from "@/hooks/useOrganization";
import { TrendingUp, DollarSign, Calendar } from "lucide-react";
import { toast } from "sonner";

export function SavingsSimulator() {
  const [selectedRecs, setSelectedRecs] = useState<string[]>([]);
  const { data: organizationId } = useOrganization();

  const { data: recommendations = [], isLoading } = useQuery({
    queryKey: ['cost-recommendations-simulator', organizationId],
    queryFn: async () => {
      if (!organizationId) throw new Error('Organization not found');

      const response = await apiClient.select('cost_recommendations', {
        select: '*',
        eq: { organization_id: organizationId },
        order: { projected_savings_yearly: 'desc' }
      });
      
      if (response.error) throw new Error(response.error);
      return response.data || [];
    },
    enabled: !!organizationId,
  });

  const toggleRecommendation = (id: string) => {
    setSelectedRecs(prev => 
      prev.includes(id) 
        ? prev.filter(recId => recId !== id)
        : [...prev, id]
    );
  };

  const selectAllHighImpact = () => {
    const highImpactIds = recommendations
      .filter(rec => (rec.projected_savings_yearly || 0) > 10000)
      .map(rec => rec.id);
    setSelectedRecs(highImpactIds);
    toast.success(`${highImpactIds.length} recomendações de alto impacto selecionadas`);
  };

  const totalMonthlySavings = recommendations
    .filter(rec => selectedRecs.includes(rec.id))
    .reduce((sum, rec) => sum + (rec.projected_savings_monthly || 0), 0);

  const totalYearlySavings = recommendations
    .filter(rec => selectedRecs.includes(rec.id))
    .reduce((sum, rec) => sum + (rec.projected_savings_yearly || 0), 0);

  const currentMonthlyCost = recommendations
    .filter(rec => selectedRecs.includes(rec.id))
    .reduce((sum, rec) => sum + (rec.current_cost_monthly || 0), 0);

  const savingsPercentage = currentMonthlyCost > 0 
    ? (totalMonthlySavings / currentMonthlyCost) * 100 
    : 0;

  const paybackPeriod = totalYearlySavings > 0 
    ? Math.ceil((1000 / totalYearlySavings) * 12) // Assumindo $1000 de esforço de implementação
    : 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Simulador de Economia</CardTitle>
          <CardDescription>Carregando recomendações...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Simulador de Economia
        </CardTitle>
        <CardDescription>
          Selecione recomendações para simular o impacto financeiro
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-primary text-white">
            <CardContent className="pt-6">
              <div className="text-sm opacity-90">Economia Mensal</div>
              <div className="text-3xl font-bold flex items-center gap-2">
                <DollarSign className="w-6 h-6" />
                {totalMonthlySavings.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
            <CardContent className="pt-6">
              <div className="text-sm opacity-90">Economia Anual</div>
              <div className="text-3xl font-bold flex items-center gap-2">
                <DollarSign className="w-6 h-6" />
                {totalYearlySavings.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <CardContent className="pt-6">
              <div className="text-sm opacity-90">Redução de Custo</div>
              <div className="text-3xl font-bold">
                {savingsPercentage.toFixed(1)}%
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payback Period */}
        {paybackPeriod > 0 && (
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-primary" />
              <span className="font-semibold">Período de Retorno</span>
            </div>
            <div className="text-2xl font-bold text-primary">
              {paybackPeriod} {paybackPeriod === 1 ? 'mês' : 'meses'}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Tempo estimado para recuperar investimento de implementação
            </p>
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button onClick={selectAllHighImpact} variant="outline" size="sm">
            Selecionar Alto Impacto (&gt; $10k/ano)
          </Button>
          <Button 
            onClick={() => setSelectedRecs([])} 
            variant="outline" 
            size="sm"
            disabled={selectedRecs.length === 0}
          >
            Limpar Seleção
          </Button>
        </div>

        {/* Recommendations List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {recommendations.map((rec) => {
            const isSelected = selectedRecs.includes(rec.id);
            const savingsImpact = (rec.projected_savings_yearly || 0) > 10000 ? 'high' : 
                                 (rec.projected_savings_yearly || 0) > 5000 ? 'medium' : 'low';
            
            return (
              <div
                key={rec.id}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                }`}
                onClick={() => toggleRecommendation(rec.id)}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleRecommendation(rec.id)}
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm">{rec.title}</h4>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-green-600">
                          ${(rec.projected_savings_monthly || 0).toLocaleString()}/mês
                        </div>
                        <div className="text-xs text-muted-foreground">
                          ${(rec.projected_savings_yearly || 0).toLocaleString()}/ano
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{rec.description}</p>
                    <div className="flex gap-2 mt-2">
                      <span className={`text-xs px-2 py-1 rounded ${
                        savingsImpact === 'high' ? 'bg-green-100 text-green-800' :
                        savingsImpact === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {savingsImpact === 'high' ? 'Alto Impacto' : 
                         savingsImpact === 'medium' ? 'Médio Impacto' : 'Baixo Impacto'}
                      </span>
                      <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">
                        {rec.service}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selection Summary */}
        {selectedRecs.length > 0 && (
          <div className="p-4 bg-primary/10 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">
                {selectedRecs.length} recomendações selecionadas
              </span>
              <span className="text-sm text-muted-foreground">
                Potencial de economia
              </span>
            </div>
            <Progress value={(selectedRecs.length / recommendations.length) * 100} className="mb-2" />
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <div className="text-xs text-muted-foreground">Economia Total (12 meses)</div>
                <div className="text-xl font-bold text-green-600">
                  ${totalYearlySavings.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">ROI Estimado</div>
                <div className="text-xl font-bold text-primary">
                  {(totalYearlySavings / 1000).toFixed(1)}x
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
