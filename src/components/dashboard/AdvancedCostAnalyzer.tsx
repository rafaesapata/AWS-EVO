import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useOrganization } from "@/hooks/useOrganization";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { TrendingDown, Server, Database, Zap, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export function AdvancedCostAnalyzer() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { data: organizationId } = useOrganization();
  const { accounts, selectedAccount } = useCloudAccount();

  const { data: recommendations = [], refetch } = useQuery({
    queryKey: ['advanced-cost-recommendations', organizationId],
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

  const analyzeAdvancedOptimizations = async () => {
    setIsAnalyzing(true);
    toast.info("Iniciando análise avançada de custos...");

    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      if (!organizationId) throw new Error('Organization not found');

      // Use accounts from context instead of making another API call
      const credentials = selectedAccount || accounts[0];
      
      if (!credentials) {
        toast.error("Nenhuma conta AWS ativa encontrada");
        setIsAnalyzing(false);
        return;
      }

      // Call edge function for real AWS Cost Explorer analysis
      const analysisData = await apiClient.lambda('cost-optimization', {
        body: {
          accountId: credentials.id,
          analysisTypes: [
            'Reserved Instances Coverage',
            'Spot Instance Opportunities', 
            'S3 Intelligent-Tiering',
            'Lambda vs EC2 Cost Comparison'
          ]
        }
      });

      if (error) {
        console.error('Error in advanced analysis:', error);
        throw error;
      }

      // Progress feedback
      const analysisTypes = [
        'Reserved Instances Coverage',
        'Spot Instance Opportunities',
        'S3 Intelligent-Tiering',
        'Lambda vs EC2 Cost Comparison'
      ];

      for (const type of analysisTypes) {
        toast.success(`✓ ${type} analisado`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      await refetch();
      
      const recommendationCount = data?.recommendations?.length || 0;
      if (recommendationCount > 0) {
        toast.success(`Análise avançada concluída! ${recommendationCount} recomendações encontradas.`);
      } else {
        toast.info("Análise avançada concluída. Nenhuma nova recomendação encontrada.");
      }
    } catch (error) {
      console.error('Error in advanced analysis:', error);
      toast.error("Erro na análise avançada: " + (error instanceof Error ? error.message : "Erro desconhecido"));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getRecommendationsByType = (type: string) => {
    return recommendations.filter(rec => rec.recommendation_type === type);
  };

  const riRecs = getRecommendationsByType('reserved_instances');
  const spotRecs = getRecommendationsByType('spot_instances');
  const s3Recs = getRecommendationsByType('s3_lifecycle');
  const lambdaRecs = getRecommendationsByType('lambda_optimization');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5" />
              Análise Avançada de Custos
            </CardTitle>
            <CardDescription>
              Otimizações especializadas para economia máxima
            </CardDescription>
          </div>
          <Button 
            onClick={analyzeAdvancedOptimizations}
            disabled={isAnalyzing}
            className="bg-gradient-primary"
          >
            {isAnalyzing ? "Analisando..." : "Executar Análise Completa"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="ri" className="w-full">
          <TabsList className="grid grid-cols-4 mb-6">
            <TabsTrigger value="ri">
              <Server className="w-4 h-4 mr-2" />
              Reserved Instances
            </TabsTrigger>
            <TabsTrigger value="spot">
              <Zap className="w-4 h-4 mr-2" />
              Spot Instances
            </TabsTrigger>
            <TabsTrigger value="s3">
              <HardDrive className="w-4 h-4 mr-2" />
              S3 Lifecycle
            </TabsTrigger>
            <TabsTrigger value="lambda">
              <Database className="w-4 h-4 mr-2" />
              Lambda/EC2
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ri" className="space-y-4">
            <div className="p-4 bg-muted rounded-lg mb-4">
              <h3 className="font-semibold mb-2">Reserved Instances Optimizer</h3>
              <p className="text-sm text-muted-foreground">
                Analisa padrões de uso para recomendar compra de RIs ou Savings Plans com economia de até 72%
              </p>
            </div>
            {riRecs.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                <Server className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Execute a análise para ver recomendações de Reserved Instances</p>
              </div>
            ) : (
              <div className="space-y-3">
                {riRecs.map(rec => (
                  <RecommendationCard key={rec.id} recommendation={rec} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="spot" className="space-y-4">
            <div className="p-4 bg-muted rounded-lg mb-4">
              <h3 className="font-semibold mb-2">Spot Instance Recommender</h3>
              <p className="text-sm text-muted-foreground">
                Identifica cargas de trabalho tolerantes a interrupções para economia de até 90%
              </p>
            </div>
            {spotRecs.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                <Zap className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Execute a análise para ver oportunidades de Spot Instances</p>
              </div>
            ) : (
              <div className="space-y-3">
                {spotRecs.map(rec => (
                  <RecommendationCard key={rec.id} recommendation={rec} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="s3" className="space-y-4">
            <div className="p-4 bg-muted rounded-lg mb-4">
              <h3 className="font-semibold mb-2">S3 Intelligent-Tiering Analyzer</h3>
              <p className="text-sm text-muted-foreground">
                Analisa padrões de acesso e sugere lifecycle policies para economia automática
              </p>
            </div>
            {s3Recs.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                <HardDrive className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Execute a análise para ver otimizações de S3 Storage</p>
              </div>
            ) : (
              <div className="space-y-3">
                {s3Recs.map(rec => (
                  <RecommendationCard key={rec.id} recommendation={rec} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="lambda" className="space-y-4">
            <div className="p-4 bg-muted rounded-lg mb-4">
              <h3 className="font-semibold mb-2">Lambda vs EC2 Cost Calculator</h3>
              <p className="text-sm text-muted-foreground">
                Compara custos de arquiteturas serverless vs instâncias dedicadas
              </p>
            </div>
            {lambdaRecs.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Execute a análise para ver comparações Lambda/EC2</p>
              </div>
            ) : (
              <div className="space-y-3">
                {lambdaRecs.map(rec => (
                  <RecommendationCard key={rec.id} recommendation={rec} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function RecommendationCard({ recommendation }: { recommendation: any }) {
  return (
    <div className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-semibold text-sm">{recommendation.title}</h4>
        <Badge variant={recommendation.priority === 'high' ? 'destructive' : 'default'}>
          {recommendation.priority}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground mb-2">{recommendation.description}</p>
      
      {recommendation.resource_id && (
        <div className="font-mono text-xs bg-muted px-2 py-1 rounded mb-3 max-w-fit">
          <span className="text-muted-foreground">Resource ID: </span>
          <span className="font-semibold">{recommendation.resource_id}</span>
        </div>
      )}
      
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-muted-foreground">Economia Mensal</div>
          <div className="font-semibold text-green-600">
            ${(recommendation.projected_savings_monthly || 0).toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Economia Anual</div>
          <div className="font-semibold text-green-600">
            ${(recommendation.projected_savings_yearly || 0).toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Serviço</div>
          <div className="font-semibold">{recommendation.service}</div>
        </div>
      </div>
    </div>
  );
}
