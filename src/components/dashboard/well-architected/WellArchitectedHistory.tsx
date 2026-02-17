import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/aws/api-client";
import { History, TrendingDown, TrendingUp, FileCheck, Calendar, CheckCircle2, XCircle, AlertTriangle, ChevronRight, Eye } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";

interface WellArchitectedHistoryProps {
  organizationId: string;
  onViewScan?: (scanId: string) => void;
}

export const WellArchitectedHistory = ({ organizationId, onViewScan }: WellArchitectedHistoryProps) => {
  const { t, i18n } = useTranslation();
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const locale = i18n.language === 'pt' ? ptBR : undefined;

  const { data: scanHistory, isLoading } = useQuery({
    queryKey: ['well-architected-history', organizationId, selectedPeriod],
    queryFn: async () => {
      const scansResponse = await apiClient.select('security_scans', {
        select: 'id, organization_id, status, created_at, completed_at, scan_type',
        eq: { organization_id: organizationId, scan_type: 'well_architected', status: 'completed' },
        order: { column: 'created_at', ascending: false },
        limit: 50
      });
      if (scansResponse.error) throw scansResponse.error;
      if (!scansResponse.data?.length) return [];

      return Promise.all(
        scansResponse.data.map(async (scan) => {
          const scoresResponse = await apiClient.select('well_architected_scores', {
            select: 'pillar, score, checks_passed, checks_failed, critical_issues, recommendations',
            eq: { scan_id: scan.id }
          });
          const scores = scoresResponse.data || [];
          const checksPassed = scores.reduce((sum, s) => sum + (s.checks_passed || 0), 0);
          const checksFailed = scores.reduce((sum, s) => sum + (s.checks_failed || 0), 0);
          const criticalIssues = scores.reduce((sum, s) => sum + (s.critical_issues || 0), 0);

          let highIssues = 0, mediumIssues = 0, lowIssues = 0;
          scores.forEach(s => {
            if (Array.isArray(s.recommendations)) {
              s.recommendations.forEach((rec: any) => {
                if (rec.severity === 'high') highIssues++;
                else if (rec.severity === 'medium') mediumIssues++;
                else if (rec.severity === 'low') lowIssues++;
              });
            }
          });

          const overallScore = scores.length > 0
            ? Math.round(scores.reduce((sum, s) => sum + (s.score || 0), 0) / scores.length)
            : 0;

          return { ...scan, scores, overallScore, checksPassed, checksFailed, criticalIssues, highIssues, mediumIssues, lowIssues };
        })
      );
    },
    enabled: !!organizationId
  });

  const chartData = scanHistory?.slice().reverse().map((scan) => ({
    name: format(new Date(scan.created_at), 'dd/MM', { locale }),
    score: scan.overallScore,
    passed: scan.checksPassed,
    failed: scan.checksFailed,
  })) || [];

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-success/10';
    if (score >= 60) return 'bg-warning/10';
    return 'bg-destructive/10';
  };

  const getTrend = () => {
    if (!scanHistory || scanHistory.length < 2) return null;
    const diff = scanHistory[0].overallScore - scanHistory[1].overallScore;
    return { diff, isPositive: diff >= 0 };
  };

  const trend = getTrend();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card className="glass border-primary/20"><CardContent className="p-6"><Skeleton className="h-8 w-48 mb-4" /><Skeleton className="h-[300px] w-full" /></CardContent></Card>
        <Card className="glass border-primary/20"><CardContent className="p-6"><Skeleton className="h-8 w-48 mb-4" /><div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div></CardContent></Card>
      </div>
    );
  }

  if (!scanHistory?.length) {
    return (
      <Card className="glass border-primary/20">
        <CardContent className="p-12 text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <History className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-xl font-medium text-foreground mb-2">
            {t('wellArchitected.history.noData', 'No history available')}
          </h3>
          <p className="text-muted-foreground">
            {t('wellArchitected.history.noDataDescription', 'Run a Well-Architected analysis to start tracking history.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Filter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <Calendar className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-foreground">
              {t('wellArchitected.history.period', 'Analysis Period')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {scanHistory.length} {t('wellArchitected.history.scansFound', 'analyses found')}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {(['7d', '30d', '90d', 'all'] as const).map((period) => (
            <Button
              key={period}
              variant={selectedPeriod === period ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedPeriod(period)}
              className={selectedPeriod === period ? '' : 'glass'}
            >
              {period === '7d' && t('wellArchitected.history.7days', '7 days')}
              {period === '30d' && t('wellArchitected.history.30days', '30 days')}
              {period === '90d' && t('wellArchitected.history.90days', '90 days')}
              {period === 'all' && t('wellArchitected.history.all', 'All')}
            </Button>
          ))}
        </div>
      </div>

      {/* Score Evolution Chart */}
      <Card className="glass border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-foreground">
                  {t('wellArchitected.history.scoreEvolution', 'Score Evolution')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('wellArchitected.history.scoreEvolutionDesc', 'Track score evolution over time')}
                </p>
              </div>
            </div>
            {trend && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${trend.isPositive ? 'bg-success/10' : 'bg-destructive/10'}`}>
                {trend.isPositive ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
                <span className={`text-sm font-medium ${trend.isPositive ? 'text-success' : 'text-destructive'}`}>
                  {trend.isPositive ? '+' : ''}{trend.diff}%
                </span>
              </div>
            )}
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                  formatter={(value) => [`${value}%`, 'Score']}
                />
                <Area type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#scoreGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Checks Evolution Chart */}
      <Card className="glass border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-success/10 rounded-xl flex items-center justify-center">
              <FileCheck className="h-5 w-5 text-success" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground">
                {t('wellArchitected.history.checksEvolution', 'Checks Evolution')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t('wellArchitected.history.checksEvolutionDesc', 'Passed vs failed checks')}
              </p>
            </div>
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="passed" name={t('wellArchitected.history.passed', 'Passed')} stroke="hsl(var(--success))" strokeWidth={2} dot={{ fill: 'hsl(var(--success))', strokeWidth: 2 }} />
                <Line type="monotone" dataKey="failed" name={t('wellArchitected.history.failed', 'Failed')} stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ fill: 'hsl(var(--destructive))', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Scan History List */}
      <Card className="glass border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <History className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground">
                {t('wellArchitected.history.scanList', 'Analysis History')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t('wellArchitected.history.scanListDesc', 'All analyses performed')}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {scanHistory.map((scan, index) => (
              <div
                key={scan.id}
                className="flex items-center justify-between p-4 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer group border border-border"
                onClick={() => onViewScan?.(scan.id)}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getScoreBgColor(scan.overallScore)}`}>
                    <span className={`text-lg font-semibold ${getScoreColor(scan.overallScore)}`}>
                      {scan.overallScore}%
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {format(new Date(scan.created_at), "dd 'de' MMMM 'de' yyyy", { locale })}
                      </span>
                      {index === 0 && (
                        <Badge className="bg-primary text-primary-foreground text-xs">
                          {t('wellArchitected.history.latest', 'Latest')}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        {scan.checksPassed} {t('wellArchitected.history.passed', 'passed')}
                      </span>
                      <span className="flex items-center gap-1">
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                        {scan.checksFailed} {t('wellArchitected.history.failed', 'failed')}
                      </span>
                      {scan.criticalIssues > 0 && (
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                          {scan.criticalIssues} {t('wellArchitected.history.critical', 'critical')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    {scan.highIssues > 0 && <Badge variant="destructive" className="text-xs">{scan.highIssues} High</Badge>}
                    {scan.mediumIssues > 0 && <Badge className="bg-warning text-warning-foreground text-xs">{scan.mediumIssues} Medium</Badge>}
                    {scan.lowIssues > 0 && <Badge variant="secondary" className="text-xs">{scan.lowIssues} Low</Badge>}
                  </div>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity text-primary">
                    <Eye className="h-4 w-4 mr-1" />
                    {t('wellArchitected.history.view', 'View')}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
