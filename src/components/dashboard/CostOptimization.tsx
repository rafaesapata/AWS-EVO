import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, Loader2, TrendingDown, Zap, Award, Check, X, Eye, Plus, Ban } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "react-i18next";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import AWSService from "@/services/aws-service";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTVDashboard } from "@/contexts/TVDashboardContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useCloudAccount } from "@/contexts/CloudAccountContext";

interface CostOptimizationProps {
  onAnalysisComplete: () => void;
}

interface CostRecommendation {
  id: string;
  recommendation_type: string;
  service: string;
  resource_id: string;
  current_cost_monthly: number;
  projected_savings_monthly: number;
  projected_savings_yearly: number;
  savings_percentage: number;
  title: string;
  description: string;
  implementation_steps: string;
  ai_analysis: string;
  priority: string;
  status: string;
  implementation_difficulty: string;
}

export const CostOptimization = ({ onAnalysisComplete }: CostOptimizationProps) => {
  const { t } = useTranslation();
  const { isTVMode } = useTVDashboard();
  const { data: organizationId } = useOrganization();
  const { selectedAccountId } = useCloudAccount();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedRec, setSelectedRec] = useState<CostRecommendation | null>(null);
  const [showIgnoreDialog, setShowIgnoreDialog] = useState(false);
  const [ignoreReason, setIgnoreReason] = useState("");
  const [recToIgnore, setRecToIgnore] = useState<CostRecommendation | null>(null);

  const { data: recommendations, refetch } = useQuery({
    queryKey: ['cost-recommendations', organizationId, selectedAccountId],
    queryFn: async () => {
      if (!organizationId) throw new Error('Organization not found');

      const { data, error } = await AWSService.getCostRecommendations(organizationId);
      
      
      
      // Filter by account on client-side if needed
      if (selectedAccountId && data) {
        return data.filter((r: any) => !r.aws_account_id || r.aws_account_id === selectedAccountId) as CostRecommendation[];
      }
      
      return data as CostRecommendation[];
    },
    enabled: !!organizationId,
  });

  const handleAnalysis = async () => {
    if (!organizationId) return;
    
    setIsAnalyzing(true);
    
    try {
      toast.info(t('costOptimization.startingAnalysis'), {
        description: t('costOptimization.collectingData')
      });

      const { data: credentials, error: credError } = await AWSService.getAWSCredentials(organizationId)
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .maybeSingle();

      if (credError || !credentials) {
        throw new Error(t('costOptimization.noCredentials'));
      }

      // Invoke the edge function with real AWS analysis
      const { data, error } = await AWSService.invokeFunction('cost-optimization', { 
        accountId: credentials.id 
      });

      

      toast.success(t('costOptimization.analysisComplete'), {
        description: t('costOptimization.analysisResults', { 
          count: data.recommendations_count || 0, 
          amount: data.total_yearly_savings?.toFixed(2) || '0.00' 
        })
      });

      refetch();
      onAnalysisComplete();
    } catch (error) {
      toast.error(t('costOptimization.analysisError'), {
        description: error instanceof Error ? error.message : t('common.unknown')
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const createTicket = async (rec: CostRecommendation) => {
    try {
      const user = await cognitoAuth.getCurrentUser();
      const { data: profile } = await apiClient.get('/profiles', { id: user?.id }).single();
      
      const { error } = await AWSService.createRemediationTicket({
          organization_id: profile?.organization_id,
          title: rec.title,
          description: rec.description,
          priority: rec.priority,
          severity: rec.priority,
          category: 'cost_optimization',
          status: 'pending',
          cost_recommendation_id: rec.id,
          estimated_savings: rec.projected_savings_yearly
        });

      

      toast.success(t('costOptimization.ticketCreated'));
    } catch (error) {
      toast.error(t('costOptimization.ticketError'));
    }
  };

  const handleIgnore = (rec: CostRecommendation) => {
    setRecToIgnore(rec);
    setShowIgnoreDialog(true);
  };

  const confirmIgnore = async () => {
    if (!recToIgnore || !ignoreReason.trim()) {
      toast.error(t('costOptimization.provideJustification'));
      return;
    }

    try {
      // SECURITY: Add organization_id filter to prevent cross-org updates
      const { error } = await AWSService.update('cost_recommendations', rec.id, { 
          status: 'dismissed',
          ignore_reason: ignoreReason 
        })
        .eq('id', recToIgnore.id)
        .eq('organization_id', organizationId);

      

      toast.success(t('costOptimization.recommendationIgnored'));
      setShowIgnoreDialog(false);
      setIgnoreReason("");
      setRecToIgnore(null);
      refetch();
    } catch (error) {
      toast.error(t('costOptimization.ignoreError'));
    }
  };

  const totalSavings = recommendations?.reduce((sum, rec) => 
    sum + (rec.status === 'pending' ? rec.projected_savings_yearly : 0), 0) || 0;

  const getPriorityBadge = (priority: string) => {
    const colors = {
      critical: "bg-destructive text-destructive-foreground",
      high: "bg-warning text-warning-foreground",
      medium: "bg-primary text-primary-foreground",
      low: "bg-muted text-muted-foreground",
    };
    return <Badge className={colors[priority as keyof typeof colors]}>{priority.toUpperCase()}</Badge>;
  };

  const getDifficultyBadge = (difficulty: string) => {
    const icons = { easy: "🟢", medium: "🟡", hard: "🔴" };
    return <span>{icons[difficulty as keyof typeof icons]} {difficulty}</span>;
  };

  const getTypeIcon = (type: string) => {
    const icons = {
      underutilized: TrendingDown,
      rightsizing: Zap,
      savings_plan: Award,
      architecture: DollarSign,
    };
    const Icon = icons[type as keyof typeof icons] || DollarSign;
    return <Icon className="h-4 w-4" />;
  };

  const filterByType = (type: string) => 
    recommendations?.filter(r => r.recommendation_type === type && r.status === 'pending') || [];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {t('costOptimization.title')}
          </CardTitle>
          <CardDescription>
            {t('costOptimization.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {recommendations && recommendations.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="text-center">
                <p className="text-3xl font-bold text-success">${totalSavings.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">{t('costOptimization.potentialYearlySavings')}</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold">{recommendations.filter(r => r.status === 'pending').length}</p>
                <p className="text-sm text-muted-foreground">{t('costOptimization.pendingRecommendations')}</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold">{recommendations.filter(r => r.status === 'completed').length}</p>
                <p className="text-sm text-muted-foreground">{t('costOptimization.implemented')}</p>
              </div>
            </div>
          )}

          {!isTVMode && (
            <Button
              onClick={handleAnalysis}
              disabled={isAnalyzing}
              className="w-full"
              size="lg"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('costOptimization.analyzingCosts')}
                </>
              ) : (
                <>
                  <DollarSign className="mr-2 h-4 w-4" />
                  {t('costOptimization.startAnalysis')}
                </>
              )}
            </Button>
          )}

          {recommendations && recommendations.length > 0 && (
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
                <TabsTrigger value="all">{t('costOptimization.all')}</TabsTrigger>
                <TabsTrigger value="underutilized">{t('costOptimization.idle')}</TabsTrigger>
                <TabsTrigger value="rightsizing">{t('costOptimization.sizing')}</TabsTrigger>
                <TabsTrigger value="savings_plan">{t('costOptimization.savings')}</TabsTrigger>
                <TabsTrigger value="architecture">{t('costOptimization.architecture')}</TabsTrigger>
                <TabsTrigger value="region_optimization">{t('costOptimization.regions')}</TabsTrigger>
                <TabsTrigger value="cloudfront_optimization">{t('costOptimization.cloudfront')}</TabsTrigger>
                <TabsTrigger value="serverless_opportunities">{t('costOptimization.serverless')}</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="space-y-3 mt-4">
                {recommendations.filter(r => r.status === 'pending').map((rec) => (
                  <RecommendationCard 
                    key={rec.id} 
                    rec={rec} 
                    onView={() => setSelectedRec(rec)}
                    onCreateTicket={() => createTicket(rec)}
                    onIgnore={() => handleIgnore(rec)}
                    getPriorityBadge={getPriorityBadge}
                    getDifficultyBadge={getDifficultyBadge}
                    getTypeIcon={getTypeIcon}
                    t={t}
                  />
                ))}
              </TabsContent>

              {['underutilized', 'rightsizing', 'savings_plan', 'architecture', 'region_optimization', 'cloudfront_optimization', 'serverless_opportunities'].map((type) => (
                <TabsContent key={type} value={type} className="space-y-3 mt-4">
                  {filterByType(type).map((rec) => (
                    <RecommendationCard 
                      key={rec.id} 
                      rec={rec} 
                      onView={() => setSelectedRec(rec)}
                      onCreateTicket={() => createTicket(rec)}
                      onIgnore={() => handleIgnore(rec)}
                      getPriorityBadge={getPriorityBadge}
                      getDifficultyBadge={getDifficultyBadge}
                      getTypeIcon={getTypeIcon}
                      t={t}
                    />
                  ))}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedRec} onOpenChange={() => setSelectedRec(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              {t('costOptimization.recommendationDetails')}
            </DialogTitle>
            <DialogDescription>{t('costOptimization.analysisAndSteps')}</DialogDescription>
          </DialogHeader>
          {selectedRec && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">{t('costOptimization.monthlySavings')}</p>
                  <p className="text-2xl font-bold text-success">${selectedRec.projected_savings_monthly}</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">{t('costOptimization.yearlySavings')}</p>
                  <p className="text-2xl font-bold text-success">${selectedRec.projected_savings_yearly}</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">{t('costOptimization.detailedAnalysis')}</h4>
                <div className="bg-muted p-4 rounded text-sm whitespace-pre-wrap">
                  {selectedRec.ai_analysis}
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">{t('costOptimization.implementationSteps')}</h4>
                <div className="bg-muted p-4 rounded text-sm prose prose-sm max-w-none">
                  {selectedRec.implementation_steps}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showIgnoreDialog} onOpenChange={setShowIgnoreDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('costOptimization.ignoreRecommendation')}</DialogTitle>
            <DialogDescription>
              {t('costOptimization.ignoreJustification')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder={t('costOptimization.explainWhy')}
              value={ignoreReason}
              onChange={(e) => setIgnoreReason(e.target.value)}
              rows={4}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowIgnoreDialog(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={confirmIgnore}>
                {t('costOptimization.confirm')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

const RecommendationCard = ({ rec, onView, onCreateTicket, onIgnore, getPriorityBadge, getDifficultyBadge, getTypeIcon, t }: any) => (
  <Card className="p-4">
    <div className="flex justify-between items-start gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          {getTypeIcon(rec.recommendation_type)}
          <h4 className="font-semibold text-sm">{rec.title}</h4>
          {getPriorityBadge(rec.priority)}
        </div>
        <p className="text-sm text-muted-foreground mb-2">{rec.description}</p>
        {rec.resource_id && (
          <div className="font-mono text-xs bg-muted px-2 py-1 rounded mb-2 max-w-fit">
            <span className="text-muted-foreground">Resource ID: </span>
            <span className="font-semibold">{rec.resource_id}</span>
          </div>
        )}
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <span className="font-medium">{t('costOptimization.service')}: {rec.service}</span>
          <span>{t('costOptimization.difficulty')}: {getDifficultyBadge(rec.implementation_difficulty)}</span>
          <span className="text-success font-bold">
            {t('costOptimization.savingsPerYear', { amount: rec.projected_savings_yearly, percentage: rec.savings_percentage })}
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={onView} title={t('common.details')}>
          <Eye className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" className="text-primary" onClick={onCreateTicket} title={t('wasteDetection.createTicket')}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onIgnore} title={t('costOptimization.ignoreRecommendation')}>
          <Ban className="h-4 w-4" />
        </Button>
      </div>
    </div>
  </Card>
);