import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { TrendingUp, TrendingDown, Users, Award, RefreshCw, Building2, Shield } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";

interface BenchmarkData {
  metric: string;
  yourScore: number;
  peerAverage: number;
  topPercentile: number;
  bottomPercentile: number;
}

export default function PeerBenchmarking() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: organizationId } = useOrganization();
  const { selectedAccountId } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();
  const [loading, setLoading] = useState(false);
  const [sector, setSector] = useState("technology");
  const [size, setSize] = useState("medium");
  const [benchmarks, setBenchmarks] = useState<BenchmarkData[]>([]);
  const [percentileRank, setPercentileRank] = useState(0);

  useEffect(() => {
    if (selectedAccountId) {
      loadBenchmarks();
    }
  }, [sector, size, selectedAccountId]);

  const loadBenchmarks = async () => {
    if (!selectedAccountId || !organizationId) return;
    
    setLoading(true);
    try {
      // Get current organization metrics
      const metricsResponse = await apiClient.select('organization_metrics', {
        select: '*',
        eq: { organization_id: organizationId },
        limit: 1
      });
      
      if (metricsResponse.error) throw new Error(getErrorMessage(metricsResponse.error));
      const metrics = metricsResponse.data?.[0];
      
      // Get peer benchmarks
      const benchmarkResponse = await apiClient.select('peer_benchmarks', {
        select: '*',
        eq: { sector, company_size: size },
        order: { created_at: 'desc' },
        limit: 50
      });
      
      if (benchmarkResponse.error) throw new Error(getErrorMessage(benchmarkResponse.error));
      const peers = benchmarkResponse.data;

      // Get real cost efficiency from daily costs - FILTERED BY ACCOUNT
      const costResponse = await apiClient.select('daily_costs', {
        select: 'total_cost',
        eq: { 
          organization_id: organizationId,
          ...getAccountFilter() 
        },
        order: { date: 'desc' },
        limit: 30
      });
      
      if (costResponse.error) throw new Error(getErrorMessage(costResponse.error));
      const costData = costResponse.data;
      
      // Calculate cost efficiency based on optimization recommendations
      const recommendationsResponse = await apiClient.select('cost_recommendations', {
        select: 'projected_savings_monthly',
        eq: { organization_id: organizationId }
      });
      
      if (recommendationsResponse.error) throw new Error(getErrorMessage(recommendationsResponse.error));
      const recommendations = recommendationsResponse.data;
            const rawPotentialSavings = recommendations?.reduce((sum, r) => sum + (r.projected_savings_monthly || 0), 0) || 0;
      const totalSpend = costData?.reduce((sum, c) => sum + (c.total_cost || 0), 0) || 1;
      
      // Cap potential savings at 40% of total spend (realistic maximum)
      const maxRealisticSavings = totalSpend * 0.40;
      const totalPotentialSavings = Math.min(rawPotentialSavings, maxRealisticSavings);
      
      const yourCostEfficiency = Math.max(0, 100 - (totalPotentialSavings / totalSpend * 100));

      // Generate benchmark data if peers exist
      if (peers && peers.length > 0) {
        const avgSecurity = peers.reduce((sum, p) => sum + (p.avg_security_score || 0), 0) / peers.length;
        const avgWA = peers.reduce((sum, p) => sum + (p.avg_well_architected_score || 0), 0) / peers.length;
        const avgCost = peers.reduce((sum, p) => sum + (p.avg_cost_efficiency || 0), 0) / peers.length;

        const yourSecurity = metrics?.overall_security_score || 0;
        const yourWA = metrics?.well_architected_score || 0;
        const yourCost = yourCostEfficiency;

        setBenchmarks([
          {
            metric: "Security Posture",
            yourScore: yourSecurity,
            peerAverage: avgSecurity,
            topPercentile: avgSecurity * 1.2,
            bottomPercentile: avgSecurity * 0.8
          },
          {
            metric: "Well-Architected Score",
            yourScore: yourWA,
            peerAverage: avgWA,
            topPercentile: avgWA * 1.15,
            bottomPercentile: avgWA * 0.85
          },
          {
            metric: "Cost Efficiency",
            yourScore: yourCost,
            peerAverage: avgCost,
            topPercentile: avgCost * 1.1,
            bottomPercentile: avgCost * 0.9
          }
        ]);

        // Calculate overall percentile
        const avgYourScore = (yourSecurity + yourWA + yourCost) / 3;
        const avgPeerScore = (avgSecurity + avgWA + avgCost) / 3;
        const percentile = Math.min(99, Math.max(1, (avgYourScore / avgPeerScore) * 50));
        setPercentileRank(Math.round(percentile));
      }
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

  const getComparisonIcon = (yourScore: number, peerAverage: number) => {
    if (yourScore > peerAverage) {
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    }
    return <TrendingDown className="h-4 w-4 text-red-500" />;
  };

  const getPerformanceBadge = (yourScore: number, peerAverage: number, topPercentile: number) => {
    if (yourScore >= topPercentile) {
      return <Badge className="bg-green-500">Top Performer</Badge>;
    } else if (yourScore >= peerAverage) {
      return <Badge className="bg-blue-500">Above Average</Badge>;
    }
    return <Badge variant="destructive">Below Average</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t('dashboard.peerBenchmarking') || 'Anonymous Peer Benchmarking'}
            </CardTitle>
            <CardDescription>
              {t('dashboard.benchmarkDescription') || 'Compare your metrics with similar organizations'}
            </CardDescription>
          </div>
          <Button onClick={loadBenchmarks} disabled={loading} size="sm">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Industry Sector</label>
              <Select value={sector} onValueChange={setSector}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="technology">Technology</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="healthcare">Healthcare</SelectItem>
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Company Size</label>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small (1-50)</SelectItem>
                  <SelectItem value="medium">Medium (51-500)</SelectItem>
                  <SelectItem value="large">Large (501-5000)</SelectItem>
                  <SelectItem value="enterprise">Enterprise (5000+)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Your Overall Ranking</div>
                  <div className="text-3xl font-semibold flex items-center gap-2">
                    <Award className="h-8 w-8 text-yellow-500" />
                    Top {percentileRank}%
                  </div>
                </div>
                <Building2 className="h-16 w-16 text-primary/20" />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {benchmarks.map((benchmark) => (
              <Card key={benchmark.metric}>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getComparisonIcon(benchmark.yourScore, benchmark.peerAverage)}
                        <span className="font-semibold">{benchmark.metric}</span>
                      </div>
                      {getPerformanceBadge(benchmark.yourScore, benchmark.peerAverage, benchmark.topPercentile)}
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Your Score</span>
                        <span className="font-semibold">{benchmark.yourScore.toFixed(1)}</span>
                      </div>
                      <Progress value={benchmark.yourScore} className="h-2" />
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground mb-1">Peer Average</div>
                        <div className="font-semibold">{benchmark.peerAverage.toFixed(1)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">Top 10%</div>
                        <div className="font-semibold text-green-600">{benchmark.topPercentile.toFixed(1)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">Difference</div>
                        <div className={`font-semibold ${benchmark.yourScore > benchmark.peerAverage ? 'text-green-600' : 'text-red-600'}`}>
                          {benchmark.yourScore > benchmark.peerAverage ? '+' : ''}
                          {(benchmark.yourScore - benchmark.peerAverage).toFixed(1)}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-xs text-muted-foreground text-center pt-4 border-t">
            <Shield className="h-4 w-4 inline mr-2" />
            All peer data is fully anonymized and aggregated to protect privacy
          </div>
        </div>
      </CardContent>
    </Card>
  );
}