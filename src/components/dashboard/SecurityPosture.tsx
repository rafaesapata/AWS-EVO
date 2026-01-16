import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useTVDashboard } from "@/contexts/TVDashboardContext";
import { InfoTooltip, tooltipContent } from "@/components/ui/info-tooltip";
import { useTranslation } from "react-i18next";

export default function SecurityPosture() {
  const { t } = useTranslation();
  const { isTVMode } = useTVDashboard();
  // Use global account context for multi-account isolation
  const { selectedAccountId } = useCloudAccount();
  const { data: organizationId } = useOrganization();

  const { data: posture, isLoading } = useQuery({
    queryKey: ['security-posture', 'org', organizationId],
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      // security_posture table doesn't have aws_account_id - filter only by organization
      const response = await apiClient.select('security_posture', {
        select: '*',
        eq: { organization_id: organizationId },
        order: { column: 'calculated_at', ascending: false },
        limit: 1
      });
      return response.data?.[0];
    },
  });

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-success" />;
      case 'degrading': return <TrendingDown className="h-4 w-4 text-destructive" />;
      default: return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-yellow-600';
    return 'text-destructive';
  };

  if (isLoading) {
    return (
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-6 w-6" />
            {t('securityPosture.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-12 w-24" />
            <Skeleton className="h-6 w-20" />
          </div>
          <Skeleton className="h-4 w-full" />
          <div className="grid grid-cols-4 gap-2 mt-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
          <div className="space-y-3 mt-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!posture) {
    return (
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-6 w-6" />
            {t('securityPosture.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Shield className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-20" />
          <p className="text-muted-foreground">{t('securityPosture.noScanYet')}</p>
          <p className="text-sm text-muted-foreground mt-2">{t('securityPosture.runScanHint')}</p>
        </CardContent>
      </Card>
    );
  }

  const categories = [
    { name: 'Identity & Access', score: posture?.identity_score || 0 },
    { name: 'Network Security', score: posture?.network_score || 0 },
    { name: 'Data Protection', score: posture?.data_score || 0 },
    { name: 'Compute Security', score: posture?.compute_score || 0 },
    { name: 'Monitoring & Logging', score: posture?.monitoring_score || 0 },
  ];

  return (
    <div className="space-y-6">
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6" />
              {t('securityPosture.title')}
              <InfoTooltip title="Como o score é calculado?">
                {tooltipContent.securityScore}
              </InfoTooltip>
            </div>
            <div className="flex items-center gap-2">
              {getTrendIcon(posture?.trend || 'stable')}
              {posture?.score_change && (
                <span className={`text-sm ${posture.score_change > 0 ? 'text-success' : 'text-destructive'}`}>
                  {posture.score_change > 0 ? '+' : ''}{posture.score_change.toFixed(1)}
                </span>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center mb-6">
            <div className={`text-6xl font-semibold ${getScoreColor(posture?.overall_score || 0)}`}>
              {posture?.overall_score?.toFixed(0) || 0}
            </div>
            <div className="text-sm text-muted-foreground">{t('securityPosture.outOf')}</div>
          </div>

          <Progress value={posture?.overall_score || 0} className="mb-6" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-destructive/10 rounded-lg">
              <div className="text-2xl font-semibold text-destructive">{posture?.critical_findings || 0}</div>
              <div className="text-xs text-muted-foreground">{t('securityPosture.critical')}</div>
            </div>
            <div className="text-center p-3 bg-orange-500/10 rounded-lg">
              <div className="text-2xl font-semibold text-orange-600">{posture?.high_findings || 0}</div>
              <div className="text-xs text-muted-foreground">{t('securityPosture.high')}</div>
            </div>
            <div className="text-center p-3 bg-yellow-500/10 rounded-lg">
              <div className="text-2xl font-semibold text-yellow-600">{posture?.medium_findings || 0}</div>
              <div className="text-xs text-muted-foreground">{t('securityPosture.medium')}</div>
            </div>
            <div className="text-center p-3 bg-blue-500/10 rounded-lg">
              <div className="text-2xl font-semibold text-blue-600">{posture?.low_findings || 0}</div>
              <div className="text-xs text-muted-foreground">{t('securityPosture.low')}</div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="font-semibold mb-2">{t('securityPosture.breakdownByCategory')}</div>
            {categories.map((category) => (
              <div key={category.name}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm">{category.name}</span>
                  <span className={`text-sm font-semibold ${getScoreColor(category.score)}`}>
                    {category.score.toFixed(0)}
                  </span>
                </div>
                <Progress value={category.score} />
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-1 text-sm font-semibold mb-2">
              {t('securityPosture.compliance')}
              <InfoTooltip title="O que é medido?">
                {tooltipContent.compliancePercentage}
              </InfoTooltip>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('securityPosture.compliantControls')}</span>
              <Badge variant="outline">{posture?.compliance_percentage?.toFixed(0) || 0}%</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}