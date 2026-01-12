import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/aws/api-client";
import { Brain, TrendingDown, Zap, BarChart3, Clock, AlertCircle, Trash2, Copy, ExternalLink, ChevronDown, ChevronUp, Terminal, AlertTriangle, Shield, History, Play, CheckCircle2, XCircle, Loader2, Eye } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Layout } from "@/components/Layout";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import type { MLImplementationStep } from "@/types/database";

interface MLAnalysisHistoryItem {
  id: string;
  organization_id: string;
  aws_account_id: string;
  aws_account_number?: string;
  scan_type: string;
  status: 'running' | 'completed' | 'failed';
  total_resources_analyzed: number;
  total_recommendations: number;
  total_monthly_savings: number;
  total_annual_savings: number;
  terminate_count: number;
  downsize_count: number;
  autoscale_count: number;
  optimize_count: number;
  migrate_count: number;
  by_resource_type?: Record<string, { count: number; savings: number }>;
  regions_scanned?: string[];
  analysis_depth?: string;
  execution_time_seconds?: number;
  error_message?: string;
  started_at: string;
  completed_at?: string;
}

interface MLRecommendation {
  id: string;
  organization_id: string;
  aws_account_id: string;
  resource_id: string;
  resource_arn?: string;
  resource_name?: string;
  resource_type: string;
  resource_subtype?: string;
  region: string;
  current_size?: string;
  current_monthly_cost?: number;
  current_hourly_cost?: number;
  recommendation_type?: string;
  recommendation_priority?: number;
  recommended_size?: string;
  potential_monthly_savings?: number;
  potential_annual_savings?: number;
  ml_confidence?: number;
  utilization_patterns?: any;
  resource_metadata?: any;
  dependencies?: any[];
  auto_scaling_eligible?: boolean;
  auto_scaling_config?: any;
  implementation_complexity?: string;
  implementation_steps?: MLImplementationStep[];
  risk_assessment?: string;
  analyzed_at: string;
}

export default function MLWasteDetection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [analyzing, setAnalyzing] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'recommendations' | 'history'>('recommendations');
  const { data: organizationId } = useOrganization();
  const { selectedAccountId } = useCloudAccount();

  const toggleSteps = (id: string) => {
    setExpandedSteps(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard", description: text.substring(0, 50) + "..." });
  };

  const getConsoleUrl = (arn: string): string | null => {
    if (!arn) return null;
    const parts = arn.split(':');
    if (parts.length < 6) return null;
    const service = parts[2];
    const region = parts[3];
    const resourcePart = parts.slice(5).join(':');
    
    switch (service) {
      case 'ec2':
        if (resourcePart.startsWith('instance/')) {
          return `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#InstanceDetails:instanceId=${resourcePart.replace('instance/', '')}`;
        }
        if (resourcePart.startsWith('volume/')) {
          return `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#VolumeDetails:volumeId=${resourcePart.replace('volume/', '')}`;
        }
        if (resourcePart.startsWith('nat-gateway/')) {
          return `https://${region}.console.aws.amazon.com/vpc/home?region=${region}#NatGatewayDetails:natGatewayId=${resourcePart.replace('nat-gateway/', '')}`;
        }
        return null;
      case 'rds':
        return `https://${region}.console.aws.amazon.com/rds/home?region=${region}#database:id=${resourcePart.replace('db:', '')}`;
      case 'lambda':
        return `https://${region}.console.aws.amazon.com/lambda/home?region=${region}#/functions/${resourcePart.replace('function:', '')}`;
      default:
        return null;
    }
  };

  const getPriorityBadge = (priority: number | undefined) => {
    if (!priority) return null;
    const colors: Record<number, string> = {
      5: 'bg-red-500 text-white',
      4: 'bg-orange-500 text-white',
      3: 'bg-yellow-500 text-black',
      2: 'bg-blue-500 text-white',
      1: 'bg-gray-500 text-white',
    };
    return (
      <Badge className={colors[priority] || 'bg-gray-500'}>
        P{priority}
      </Badge>
    );
  };

  const getRiskBadge = (risk: string | undefined) => {
    if (!risk) return null;
    const colors: Record<string, string> = {
      'high': 'bg-red-100 text-red-800 border-red-200',
      'medium': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'low': 'bg-green-100 text-green-800 border-green-200',
    };
    return (
      <Badge variant="outline" className={colors[risk] || ''}>
        <Shield className="h-3 w-3 mr-1" />
        {risk} risk
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Running
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Query for ML recommendations
  const { data: mlRecommendations, refetch, isLoading: recommendationsLoading } = useQuery<MLRecommendation[]>({
    queryKey: ['ml-waste-detection', 'org', organizationId, 'account', selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 0, // Always fetch fresh data
    queryFn: async () => {
      if (!organizationId || !selectedAccountId) throw new Error('No organization or account');

      console.log('🔍 ML Query - Fetching recommendations for:', { organizationId, selectedAccountId });
      
      const result = await apiClient.select('resource_utilization_ml', {
        select: '*',
        eq: { organization_id: organizationId, aws_account_id: selectedAccountId },
        order: { column: 'potential_monthly_savings', ascending: false },
        limit: 100
      });
      
      console.log('🔍 ML Query - Result:', result);
      
      if (result.error) throw result.error;
      return (result.data || []) as MLRecommendation[];
    },
  });

  // Query for analysis history
  const { data: analysisHistory, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ['ml-analysis-history', 'org', organizationId, 'account', selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    refetchInterval: analyzing ? 3000 : false, // Poll while analyzing
    queryFn: async () => {
      if (!organizationId || !selectedAccountId) throw new Error('No organization or account');

      const result = await apiClient.select('ml_analysis_history', {
        select: '*',
        eq: { organization_id: organizationId, aws_account_id: selectedAccountId },
        order: { column: 'started_at', ascending: false },
        limit: 20
      });
      
      if (result.error) throw result.error;
      return (result.data || []) as MLAnalysisHistoryItem[];
    },
  });

  // Check if there's a running analysis
  const runningAnalysis = analysisHistory?.find(h => h.status === 'running');

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
      const result = await apiClient.invoke('ml-waste-detection', {
        body: { accountId: selectedAccountId }
      });

      if (result.error) throw result.error;
      const data = result.data as { analyzed_resources?: number; total_monthly_savings?: number };

      toast({
        title: "ML Analysis completed",
        description: `Analyzed ${data.analyzed_resources || 0} resources. Potential savings: $${data.total_monthly_savings?.toFixed(2) || '0.00'}/month`,
      });

      // Refresh both queries and wait for completion
      await Promise.all([refetch(), refetchHistory()]);
      
      // Switch to recommendations tab to show results
      setActiveTab('recommendations');
    } catch (error: any) {
      const errorMessage = typeof error?.message === 'string' 
        ? error.message 
        : (typeof error === 'string' ? error : 'Unknown error occurred');
      toast({
        title: "Analysis failed",
        description: errorMessage,
        variant: "destructive",
      });
      await refetchHistory();
    } finally {
      setAnalyzing(false);
    }
  };

  const totalSavings = mlRecommendations?.reduce((sum, r) => sum + (r.potential_monthly_savings || 0), 0) || 0;
  const downsizeCount = mlRecommendations?.filter(r => r.recommendation_type === 'downsize').length || 0;
  const autoScaleEligible = mlRecommendations?.filter(r => r.auto_scaling_eligible).length || 0;
  const terminateCount = mlRecommendations?.filter(r => r.recommendation_type === 'terminate').length || 0;

  if (!selectedAccountId) {
    return (
      <Layout 
        title="ML-Powered Waste Detection 3.0" 
        description="Machine Learning analysis of resource utilization patterns"
        icon={<Trash2 className="h-5 w-5 text-white" />}
      >
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No AWS Account Selected</AlertTitle>
          <AlertDescription>
            Please select an AWS account from the header to run ML waste detection analysis.
          </AlertDescription>
        </Alert>
      </Layout>
    );
  }

  return (
    <Layout 
      title="ML-Powered Waste Detection 3.0" 
      description="Machine Learning analysis of resource utilization patterns"
      icon={<Trash2 className="h-5 w-5 text-white" />}
    >
      <div className="space-y-6">
        {/* Running Analysis Banner */}
        {runningAnalysis && (
          <Alert className="bg-blue-50 border-blue-200">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            <AlertTitle className="text-blue-800">Analysis in Progress</AlertTitle>
            <AlertDescription className="text-blue-700">
              ML analysis started at {format(new Date(runningAnalysis.started_at), "HH:mm:ss", { locale: ptBR })}. 
              This may take up to 30 seconds...
            </AlertDescription>
          </Alert>
        )}

        {/* Header with action button */}
        <div className="flex items-center justify-between">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList>
              <TabsTrigger value="recommendations" className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Recommendations
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Execution History
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={runMLAnalysis} disabled={analyzing || !!runningAnalysis}>
            {analyzing || runningAnalysis ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {analyzing || runningAnalysis ? 'Analyzing...' : 'Run ML Analysis'}
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <CardTitle className="text-sm font-medium">Terminate</CardTitle>
              <Trash2 className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{terminateCount}</div>
              <p className="text-xs text-muted-foreground">Unused resources</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Downsize</CardTitle>
              <BarChart3 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{downsizeCount}</div>
              <p className="text-xs text-muted-foreground">Oversized resources</p>
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

        {/* Tab Content */}
        {activeTab === 'recommendations' && (
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
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-sm truncate">{rec.resource_name || rec.resource_id}</h4>
                          {getPriorityBadge(rec.recommendation_priority)}
                          {getRiskBadge(rec.risk_assessment)}
                        </div>
                        <p className="text-sm text-muted-foreground">{rec.resource_type}</p>
                        {rec.resource_arn && (
                          <div className="flex items-center gap-2 mt-1">
                            <code className="text-xs bg-muted px-2 py-0.5 rounded truncate max-w-[400px]">
                              {rec.resource_arn}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => copyToClipboard(rec.resource_arn!)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            {getConsoleUrl(rec.resource_arn) && (
                              <a
                                href={getConsoleUrl(rec.resource_arn)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                      <Badge variant={
                        rec.recommendation_type === 'terminate' ? 'destructive' :
                        rec.recommendation_type === 'downsize' ? 'default' :
                        rec.recommendation_type === 'auto-scale' ? 'secondary' : 'outline'
                      }>
                        {rec.recommendation_type?.replace('-', ' ').toUpperCase()}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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
                        <span className="text-muted-foreground">Monthly Savings:</span>
                        <p className="font-medium text-success">${rec.potential_monthly_savings?.toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Annual Savings:</span>
                        <p className="font-medium text-success">${rec.potential_annual_savings?.toFixed(2) || (rec.potential_monthly_savings ? (rec.potential_monthly_savings * 12).toFixed(2) : '0.00')}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">ML Confidence:</span>
                        <p className="font-medium">{((rec.ml_confidence || 0) * 100).toFixed(0)}%</p>
                      </div>
                      {rec.current_hourly_cost !== undefined && rec.current_hourly_cost > 0 && (
                        <div>
                          <span className="text-muted-foreground">Hourly Cost:</span>
                          <p className="font-medium">${rec.current_hourly_cost?.toFixed(4)}</p>
                        </div>
                      )}
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

                    {/* Implementation Steps */}
                    {rec.implementation_steps && Array.isArray(rec.implementation_steps) && rec.implementation_steps.length > 0 && (
                      <Collapsible open={expandedSteps[rec.id]} onOpenChange={() => toggleSteps(rec.id)}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full justify-between">
                            <span className="flex items-center gap-2">
                              <Terminal className="h-4 w-4" />
                              Implementation Steps ({rec.implementation_steps.length})
                            </span>
                            {expandedSteps[rec.id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2 space-y-2">
                          {(rec.implementation_steps as MLImplementationStep[]).map((step, idx) => (
                            <div key={idx} className="border rounded p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-sm">
                                  Step {step.order}: {step.action}
                                </span>
                                <Badge variant={
                                  step.riskLevel === 'destructive' ? 'destructive' :
                                  step.riskLevel === 'review' ? 'secondary' : 'outline'
                                }>
                                  {step.riskLevel === 'destructive' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                  {step.riskLevel}
                                </Badge>
                              </div>
                              {step.command && (
                                <div className="flex items-start gap-2">
                                  <code className="flex-1 text-xs bg-muted p-2 rounded block overflow-x-auto">
                                    {step.command}
                                  </code>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 shrink-0"
                                    onClick={() => copyToClipboard(step.command!)}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                              {step.notes && (
                                <p className="text-xs text-muted-foreground">{step.notes}</p>
                              )}
                            </div>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
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
                {recommendationsLoading && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-12 w-12 mx-auto mb-2 animate-spin opacity-50" />
                    <p>Loading recommendations...</p>
                  </div>
                )}
                {!recommendationsLoading && (!mlRecommendations || mlRecommendations.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Brain className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No ML analysis data yet.</p>
                    <p className="text-sm">Run an analysis to get AI-powered optimization recommendations based on real CloudWatch metrics.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Execution History
              </CardTitle>
              <CardDescription>Track all ML waste detection analysis runs</CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : analysisHistory && analysisHistory.length > 0 ? (
                <div className="space-y-4">
                  {analysisHistory.map((history) => (
                    <div key={history.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getStatusBadge(history.status)}
                          <div>
                            <p className="font-medium">
                              {format(new Date(history.started_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm:ss", { locale: ptBR })}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {history.analysis_depth === 'deep' ? 'Deep Analysis' : 'Standard Analysis'}
                              {history.regions_scanned && ` • ${(history.regions_scanned as string[]).join(', ')}`}
                            </p>
                          </div>
                        </div>
                        {history.execution_time_seconds && (
                          <Badge variant="outline" className="text-xs">
                            <Clock className="h-3 w-3 mr-1" />
                            {history.execution_time_seconds.toFixed(1)}s
                          </Badge>
                        )}
                      </div>

                      {history.status === 'completed' && (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                          <div className="bg-secondary/50 p-2 rounded">
                            <span className="text-muted-foreground text-xs">Resources Analyzed</span>
                            <p className="font-bold text-lg">{history.total_resources_analyzed}</p>
                          </div>
                          <div className="bg-secondary/50 p-2 rounded">
                            <span className="text-muted-foreground text-xs">Recommendations</span>
                            <p className="font-bold text-lg">{history.total_recommendations}</p>
                          </div>
                          <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded">
                            <span className="text-muted-foreground text-xs">Monthly Savings</span>
                            <p className="font-bold text-lg text-green-600">${history.total_monthly_savings.toFixed(2)}</p>
                          </div>
                          <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded">
                            <span className="text-muted-foreground text-xs">Annual Savings</span>
                            <p className="font-bold text-lg text-green-600">${history.total_annual_savings.toFixed(2)}</p>
                          </div>
                          <div className="bg-secondary/50 p-2 rounded">
                            <span className="text-muted-foreground text-xs">By Type</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {history.terminate_count > 0 && (
                                <Badge variant="destructive" className="text-xs">T:{history.terminate_count}</Badge>
                              )}
                              {history.downsize_count > 0 && (
                                <Badge variant="default" className="text-xs">D:{history.downsize_count}</Badge>
                              )}
                              {history.autoscale_count > 0 && (
                                <Badge variant="secondary" className="text-xs">A:{history.autoscale_count}</Badge>
                              )}
                              {history.optimize_count > 0 && (
                                <Badge variant="outline" className="text-xs">O:{history.optimize_count}</Badge>
                              )}
                              {history.migrate_count > 0 && (
                                <Badge variant="outline" className="text-xs">M:{history.migrate_count}</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {history.status === 'failed' && history.error_message && (
                        <Alert variant="destructive">
                          <XCircle className="h-4 w-4" />
                          <AlertTitle>Analysis Failed</AlertTitle>
                          <AlertDescription>{history.error_message}</AlertDescription>
                        </Alert>
                      )}

                      {history.status === 'running' && (
                        <div className="flex items-center gap-2 text-blue-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Analysis in progress...</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No analysis history yet.</p>
                  <p className="text-sm">Run your first ML analysis to see execution history here.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
