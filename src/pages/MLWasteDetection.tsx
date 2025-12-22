import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Brain, TrendingDown, Zap, BarChart3, Clock, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function MLWasteDetection() {
  const { toast } = useToast();
  const [analyzing, setAnalyzing] = useState(false);
  const { data: organizationId } = useOrganization();
  const { selectedAccountId } = useAwsAccount();

  const { data: mlRecommendations, refetch } = useQuery({
    queryKey: ['ml-waste-detection', 'org', organizationId, 'account', selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    queryFn: async () => {
      if (!organizationId || !selectedAccountId) throw new Error('No organization or account');

      const result = await apiClient.select('resource_utilization_ml', {
        select: '*',
        eq: { organization_id: organizationId, aws_account_id: selectedAccountId },
        order: { potential_monthly_savings: 'desc' },
        limit: 100
      });
      
      if (result.error) throw result.error;
      return result.data || [];
    },
  });

  const runMLAnalysis = async () => {
    if (!selectedAccountId) {
      toast({
        title: "No account selected",
        description: "Please select an AWS account from the header",
        variant: "destructive",
      });
      return;
    }

    setAnalyzing(true);
    try {
      // Call ML waste detection with selected account
      const result = await apiClient.invoke('ml-waste-detection', {
        accountId: selectedAccountId
      });

      if (result.error) throw result.error;
      const data = result.data;

      toast({
        title: "ML Analysis completed",
        description: `Analyzed ${data.analyzed_resources} resources. Potential savings: $${data.total_monthly_savings?.toFixed(2) || '0.00'}/month`,
      });

      refetch();
    } catch (error: any) {
      toast({
        title: "Analysis failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const totalSavings = mlRecommendations?.reduce((sum, r) => sum + (r.potential_monthly_savings || 0), 0) || 0;
  const downsizeCount = mlRecommendations?.filter(r => r.recommendation_type === 'downsize').length || 0;
  const autoScaleEligible = mlRecommendations?.filter(r => r.auto_scaling_eligible).length || 0;

  if (!selectedAccountId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">ML-Powered Waste Detection 2.0</h1>
          <p className="text-muted-foreground">Machine Learning analysis of resource utilization patterns</p>
        </div>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No AWS Account Selected</AlertTitle>
          <AlertDescription>
            Please select an AWS account from the header to run ML waste detection analysis.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">ML-Powered Waste Detection 2.0</h1>
          <p className="text-muted-foreground">Machine Learning analysis of resource utilization patterns</p>
        </div>
        <Button onClick={runMLAnalysis} disabled={analyzing}>
          <Brain className={`h-4 w-4 mr-2 ${analyzing ? 'animate-pulse' : ''}`} />
          Run ML Analysis
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Potential Savings</CardTitle>
            <TrendingDown className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalSavings.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Per month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Downsize Opportunities</CardTitle>
            <BarChart3 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{downsizeCount}</div>
            <p className="text-xs text-muted-foreground">Resources can be downsized</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Auto-Scaling Ready</CardTitle>
            <Zap className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{autoScaleEligible}</div>
            <p className="text-xs text-muted-foreground">Can use auto-scaling</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ML Optimization Recommendations</CardTitle>
          <CardDescription>AI-powered analysis with real CloudWatch usage patterns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mlRecommendations?.map((rec) => (
              <div key={rec.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold">{rec.resource_name || rec.resource_id}</h4>
                    <p className="text-sm text-muted-foreground">{rec.resource_type}</p>
                  </div>
                  <Badge variant={
                    rec.recommendation_type === 'terminate' ? 'destructive' :
                    rec.recommendation_type === 'downsize' ? 'default' :
                    rec.recommendation_type === 'auto-scale' ? 'secondary' : 'outline'
                  }>
                    {rec.recommendation_type?.replace('-', ' ').toUpperCase()}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Current Size:</span>
                    <p className="font-medium">{rec.current_size}</p>
                  </div>
                  {rec.recommended_size && (
                    <div>
                      <span className="text-muted-foreground">Recommended:</span>
                      <p className="font-medium">{rec.recommended_size}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Potential Savings:</span>
                    <p className="font-medium text-success">${rec.potential_monthly_savings?.toFixed(2)}/month</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">ML Confidence:</span>
                    <p className="font-medium">{((rec.ml_confidence || 0) * 100).toFixed(0)}%</p>
                  </div>
                </div>

                {rec.utilization_patterns && typeof rec.utilization_patterns === 'object' && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium flex items-center gap-2">
                      Utilization Patterns
                      {(rec.utilization_patterns as any)?.hasRealMetrics && (
                        <Badge variant="outline" className="text-xs">Real Metrics</Badge>
                      )}
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-secondary/50 p-2 rounded">
                        <span className="text-muted-foreground">Avg CPU:</span>
                        <p className="font-medium">{(rec.utilization_patterns as any)?.avgCpuUsage?.toFixed(1)}%</p>
                      </div>
                      <div className="bg-secondary/50 p-2 rounded">
                        <span className="text-muted-foreground">Avg Memory:</span>
                        <p className="font-medium">{(rec.utilization_patterns as any)?.avgMemoryUsage?.toFixed(1)}%</p>
                      </div>
                      <div className="bg-secondary/50 p-2 rounded">
                        <span className="text-muted-foreground">Peak Hours:</span>
                        <p className="font-medium">{(rec.utilization_patterns as any)?.peakHours?.join(', ') || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {rec.auto_scaling_eligible && rec.auto_scaling_config && typeof rec.auto_scaling_config === 'object' && (
                  <div className="bg-primary/10 p-3 rounded space-y-1">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">Auto-Scaling Configuration Ready</span>
                    </div>
                    <div className="text-xs space-y-1 pl-6">
                      <p>Min Capacity: {(rec.auto_scaling_config as any).min_capacity}</p>
                      <p>Max Capacity: {(rec.auto_scaling_config as any).max_capacity}</p>
                      <p>Target CPU: {(rec.auto_scaling_config as any).target_cpu}%</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>Analyzed: {new Date(rec.analyzed_at).toLocaleString()}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {rec.implementation_complexity} complexity
                  </Badge>
                </div>
              </div>
            ))}
            {(!mlRecommendations || mlRecommendations.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                No ML analysis data yet. Run an analysis to get AI-powered optimization recommendations based on real CloudWatch metrics.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
