import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/integrations/aws/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, TrendingUp, Shield, DollarSign, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTVDashboard } from "@/contexts/TVDashboardContext";

interface AIInsight {
  id: string;
  insight_type: string;
  title: string;
  summary: string;
  priority: number;
  actions: string[];
  is_dismissed: boolean;
}

export default function AIInsights({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isTVMode } = useTVDashboard();
  const [generating, setGenerating] = useState(false);

  const { data: insights, refetch, isLoading } = useQuery({
    queryKey: ['ai-insights', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const response = await apiClient.select<AIInsight>('ai_insights', {
        eq: { organization_id: organizationId, is_dismissed: false },
        order: { column: 'priority', ascending: false },
        limit: 10
      });
      if (response.error) throw new Error(response.error.message);
      return response.data as AIInsight[];
    }
  });

  const generateInsights = async () => {
    setGenerating(true);
    try {
      const response = await apiClient.lambda('generate-ai-insights', { organizationId });
      if (response.error) throw new Error(response.error.message);

      toast({
        title: t('aiInsights.insightsGenerated'),
        description: t('aiInsights.newInsightsCreated')
      });
      
      refetch();
    } catch (error) {
      toast({
        title: t('aiInsights.error'),
        description: t('aiInsights.failedToGenerate'),
        variant: "destructive"
      });
    } finally {
      setGenerating(false);
    }
  };

  const dismissInsight = async (id: string) => {
    await apiClient.update('ai_insights', { is_dismissed: true }, { id });
    refetch();
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'cost_spike': return <DollarSign className="h-4 w-4" />;
      case 'security_risk': return <Shield className="h-4 w-4" />;
      case 'optimization_opportunity': return <TrendingUp className="h-4 w-4" />;
      default: return <Sparkles className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'cost_spike': return 'text-warning';
      case 'security_risk': return 'text-destructive';
      case 'optimization_opportunity': return 'text-success';
      default: return 'text-primary';
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          {t('aiInsights.title')}
        </CardTitle>
        {!isTVMode && (
          <Button size="sm" onClick={generateInsights} disabled={generating}>
            {generating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('aiInsights.generating')}</>
            ) : (
              t('aiInsights.generateInsights')
            )}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          [1, 2].map((i) => (
            <div key={i} className="space-y-2 p-4 border rounded-lg">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-12 w-full" />
            </div>
          ))
        ) : (
          <>
            {insights?.map(insight => (
              <Alert key={insight.id} className="relative animate-fade-in border-l-4">
                {!isTVMode && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-2 top-2 h-6 w-6"
                    onClick={() => dismissInsight(insight.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
                <div className="flex items-start gap-3 pr-8">
                  <div className={getTypeColor(insight.insight_type)}>
                    {getTypeIcon(insight.insight_type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{insight.title}</span>
                      <Badge variant="secondary" className="text-xs">
                        {t('aiInsights.priority')}: {insight.priority}
                      </Badge>
                    </div>
                    <AlertDescription className="text-sm">{insight.summary}</AlertDescription>
                    {insight.actions && insight.actions.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {insight.actions.map((action, idx) => (
                          <li key={idx} className="flex items-start gap-1">
                            <span className="text-primary">•</span>{action}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </Alert>
            ))}
            {(!insights || insights.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('aiInsights.clickToGenerate')}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
