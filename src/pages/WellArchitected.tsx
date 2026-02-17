import { useTranslation } from "react-i18next";
import { Shield, FileCheck, AlertTriangle, CheckCircle2, RefreshCw, Play, Award, TrendingUp, Zap, DollarSign, Ticket, History, ChevronDown, ChevronUp, Leaf, ExternalLink, X, Info } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganizationQuery } from "@/hooks/useOrganizationQuery";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { toast } from "sonner";
import { WellArchitectedHistory } from "@/components/dashboard/well-architected/WellArchitectedHistory";
import { Layout } from "@/components/Layout";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { useDemoAwareQuery } from "@/hooks/useDemoAwareQuery";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const PILLAR_CONFIG: Record<string, { icon: typeof Shield; color: string; bgColor: string }> = {
  operational_excellence: { icon: Award, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  security: { icon: Shield, color: 'text-red-500', bgColor: 'bg-red-500/10' },
  reliability: { icon: CheckCircle2, color: 'text-green-500', bgColor: 'bg-green-500/10' },
  performance_efficiency: { icon: Zap, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' },
  cost_optimization: { icon: DollarSign, color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
  sustainability: { icon: Leaf, color: 'text-teal-500', bgColor: 'bg-teal-500/10' },
};

const PILLAR_IDS = [
  'operational_excellence', 'security', 'reliability',
  'performance_efficiency', 'cost_optimization', 'sustainability',
] as const;

function getScoreColor(s: number) {
  if (s >= 80) return 'text-success';
  if (s >= 60) return 'text-warning';
  return 'text-destructive';
}

function getScoreLabel(s: number, t: (key: string, fallback: string) => string) {
  if (s >= 80) return t('wellArchitected.scoreExcellent', 'Excellent');
  if (s >= 60) return t('wellArchitected.scoreGood', 'Good');
  if (s >= 40) return t('wellArchitected.scoreRegular', 'Regular');
  return t('wellArchitected.scoreCritical', 'Critical');
}

function getScoreBadgeClass(s: number) {
  if (s >= 80) return 'bg-success/20 text-success';
  if (s >= 60) return 'bg-warning/20 text-warning';
  return 'bg-destructive/20 text-destructive';
}

const WellArchitected = () => {
  const { t } = useTranslation();
  const [isScanning, setIsScanning] = useState(false);
  const [mainTab, setMainTab] = useState<string>("analysis");
  const [viewingHistoricalScan, setViewingHistoricalScan] = useState<string | null>(null);
  const [creatingTicketId, setCreatingTicketId] = useState<string | null>(null);
  const [expandedPillars, setExpandedPillars] = useState<Set<string>>(new Set());
  const [selectedRec, setSelectedRec] = useState<{ rec: any; pillarId: string; pillarName: string } | null>(null);
  const { selectedAccountId, selectedProvider } = useCloudAccount();
  const { isInDemoMode } = useDemoAwareQuery();
  const queryClient = useQueryClient();

  const togglePillarExpansion = (pillarId: string) => {
    setExpandedPillars(prev => {
      const next = new Set(prev);
      next.has(pillarId) ? next.delete(pillarId) : next.add(pillarId);
      return next;
    });
  };

  /** Generate a unique key for a recommendation to link with tickets */
  const getRecKey = (pillarId: string, rec: any) => {
    const name = rec.check_name || rec.checkName || rec.checkId || '';
    return `wa:${pillarId}:${name}`;
  };

  /** Check if a recommendation already has a ticket */
  const getExistingTicket = (pillarId: string, rec: any) => {
    const recKey = getRecKey(pillarId, rec);
    const byKey = ticketsByRecKey.get(recKey);
    if (byKey) return byKey;
    // Fallback: match by title
    const recName = rec.check_name || rec.checkName || '';
    if (recName) return ticketsByRecKey.get(`title:${recName}`);
    return undefined;
  };

  const { data: userProfile } = useQuery({
    queryKey: ['user-profile'],
    queryFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) return null;
      const profile = await apiClient.select('profiles', {
        select: '*, organizations:organization_id(*)',
        eq: { id: user.username },
        limit: 1
      });
      const roles = await apiClient.select('user_roles', {
        select: 'role',
        eq: { user_id: user.username }
      });
      return { ...profile.data?.[0], roles: roles.data?.map((r: any) => r.role) || [] };
    },
  });

  const userRole = userProfile?.roles?.[0] || 'org_user';

  // Fetch existing WA tickets to check which recommendations already have tickets
  const { data: waTickets, refetch: refetchTickets } = useQuery({
    queryKey: ['wa-tickets', userProfile?.organization_id],
    queryFn: async () => {
      if (!userProfile?.organization_id) return [];
      // Fetch tickets with both old and new category to cover legacy data
      const result = await apiClient.select('remediation_tickets', {
        select: 'id, title, status, metadata, created_at, category',
        eq: { organization_id: userProfile.organization_id },
      });
      // Filter client-side for WA-related tickets (well_architected or those with wa_ metadata)
      const all = result.data || [];
      return all.filter((t: any) => {
        if (t.category === 'well_architected') return true;
        const meta = typeof t.metadata === 'string' ? (() => { try { return JSON.parse(t.metadata); } catch { return null; } })() : t.metadata;
        return meta?.wa_recommendation_key;
      });
    },
    enabled: !!userProfile?.organization_id,
    staleTime: 30_000,
  });

  // Build a map of recommendation key -> ticket for quick lookup
  const ticketsByRecKey = useMemo(() => {
    const map = new Map<string, any>();
    if (!waTickets) return map;
    for (const ticket of waTickets) {
      // Handle metadata as string (from DB) or object
      let meta = ticket.metadata;
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch { meta = null; }
      }
      const key = (meta as any)?.wa_recommendation_key;
      if (key) map.set(key, ticket);
      // Also index by title for fallback matching
      if (ticket.title) {
        const titleKey = ticket.title.replace('[Well-Architected] ', '');
        if (titleKey) map.set(`title:${titleKey}`, ticket);
      }
    }
    return map;
  }, [waTickets]);  const { data: scanHistory } = useOrganizationQuery(
    ['well-architected-history'],
    async (organizationId: string) => {
      const result = await apiClient.select('security_scans', {
        select: 'id, status, created_at, completed_at',
        eq: { organization_id: organizationId, scan_type: 'well_architected' },
        order: { column: 'created_at', ascending: false },
        limit: 10
      });
      if (result.error) throw result.error;
      return result.data;
    },
    { staleTime: 2 * 60 * 1000, gcTime: 5 * 60 * 1000 }
  );

  const { data: latestScan, refetch, isLoading } = useOrganizationQuery(
    ['well-architected-latest', viewingHistoricalScan, 'demo', isInDemoMode],
    async (organizationId: string) => {
      if (isInDemoMode && !viewingHistoricalScan) {
        const result = await apiClient.invoke('well-architected-scan', { body: { accountId: 'demo' } });
        if (result.error) throw result.error;
        const data = result.data as { pillars?: any[] };
        return data.pillars || [];
      }

      if (viewingHistoricalScan) {
        const historicalData = await apiClient.select('well_architected_scans_history', {
          select: '*', eq: { id: viewingHistoricalScan }, limit: 1
        });
        if (historicalData.error) throw historicalData.error;
        if (!historicalData.data?.[0]?.scan_id) return null;
        const pillars = await apiClient.select('well_architected_scores', {
          select: '*, recommendations:recommendations',
          eq: { scan_id: historicalData.data[0].scan_id },
          order: { column: 'created_at', ascending: false }
        });
        if (pillars.error) throw pillars.error;
        return pillars.data;
      }

      const scans = await apiClient.select('security_scans', {
        select: 'id, created_at',
        eq: { organization_id: organizationId, scan_type: 'well_architected', status: 'completed' },
        order: { column: 'created_at', ascending: false }, limit: 1
      });
      if (scans.error) throw scans.error;
      if (!scans.data?.length) return null;

      const pillars = await apiClient.select('well_architected_scores', {
        select: '*, recommendations:recommendations',
        eq: { scan_id: scans.data[0].id },
        order: { column: 'created_at', ascending: false }
      });
      if (pillars.error) throw pillars.error;
      return pillars.data;
    },
    { staleTime: 10 * 60 * 1000, gcTime: 30 * 60 * 1000 }
  );

  const runScan = async () => {
    if (isInDemoMode) {
      toast.info(t('wellArchitected.demoMode', 'Demo Mode'), {
        description: t('wellArchitected.demoModeDesc', 'In demo mode, scans show sample data.')
      });
      return;
    }
    if (!selectedAccountId) {
      toast.error(t('wellArchitected.selectAccount', 'Select a cloud account'), {
        description: t('wellArchitected.selectAccountDesc', 'You need to select an account to run the scan')
      });
      return;
    }
    setIsScanning(true);
    const isAzure = selectedProvider === 'AZURE';
    const providerName = isAzure ? 'Azure' : 'AWS';
    toast.info(t('wellArchitected.scanStarting', 'Starting Well-Architected scan {{provider}}...', { provider: providerName }), { duration: 2000 });

    try {
      const lambdaName = isAzure ? 'azure-well-architected-scan' : 'well-architected-scan';
      const bodyParam = isAzure ? { credentialId: selectedAccountId } : { accountId: selectedAccountId };
      const result = await apiClient.invoke(lambdaName, { body: bodyParam });
      if (result.error) throw result.error;
      const data = result.data;
      toast.success(t('wellArchitected.scanComplete', 'Well-Architected scan completed!'), {
        description: data?.overall_score !== undefined
          ? t('wellArchitected.overallScoreResult', 'Overall score: {{score}}/100', { score: Math.round(data.overall_score) })
          : undefined
      });
      setTimeout(() => refetch(), 1000);
    } catch (err) {
      toast.error(t('wellArchitected.scanError', 'Error running Well-Architected scan'), {
        description: err instanceof Error ? err.message : t('common.unknownError', 'Unknown error')
      });
    } finally {
      setIsScanning(false);
    }
  };

  const createTicket = async (recommendation: any, pillarName: string, pillarId?: string) => {
    const recName = recommendation.check_name || recommendation.checkName || '';
    const recKey = pillarId ? getRecKey(pillarId, recommendation) : `wa:unknown:${recName}`;
    
    // Check if ticket already exists (by key or title fallback)
    const existing = pillarId ? getExistingTicket(pillarId, recommendation) : ticketsByRecKey.get(recKey);
    if (existing) {
      toast.info(t('wellArchitected.ticketExists', 'A ticket already exists for this recommendation'));
      return;
    }
    
    const ticketKey = `${pillarName}-${recName}`;
    if (creatingTicketId === ticketKey) return;
    setCreatingTicketId(ticketKey);
    try {
      const ticket = await apiClient.insert('remediation_tickets', {
        organization_id: userProfile?.organization_id,
        title: `[Well-Architected] ${recName}`,
        description: `**${t('wellArchitected.pillar', 'Pillar')}:** ${pillarName}\n\n**${t('wellArchitected.issue', 'Issue')}:**\n${recommendation.description || ''}\n\n**${t('wellArchitected.recommendation', 'Recommendation')}:**\n${recommendation.recommendation || ''}`,
        status: 'open',
        priority: recommendation.severity === 'critical' ? 'critical' : recommendation.severity === 'high' ? 'high' : recommendation.severity === 'medium' ? 'medium' : 'low',
        category: 'well_architected',
        severity: recommendation.severity || 'medium',
        created_by: userProfile?.id,
        metadata: {
          wa_recommendation_key: recKey,
          wa_pillar: pillarId || pillarName,
          wa_check_name: recName,
          wa_severity: recommendation.severity,
          wa_description: recommendation.description || '',
          wa_recommendation: recommendation.recommendation || '',
        },
      });
      if (ticket.error) throw ticket.error;
      toast.success(t('wellArchitected.ticketCreated', 'Ticket created successfully!'));
      refetchTickets();
      refetch();
    } catch {
      toast.error(t('wellArchitected.ticketError', 'Error creating ticket'));
    } finally {
      setCreatingTicketId(null);
    }
  };

  const createBulkTickets = async (recommendations: any[], pillarName: string, pillarId?: string) => {
    if (!userProfile?.organization_id) {
      toast.error(t('wellArchitected.orgNotFound', 'Organization not found'));
      return;
    }
    // Filter out recommendations that already have tickets
    const newRecs = recommendations.filter(rec => {
      if (pillarId) return !getExistingTicket(pillarId, rec);
      const key = getRecKey('unknown', rec);
      return !ticketsByRecKey.has(key);
    });
    if (newRecs.length === 0) {
      toast.info(t('wellArchitected.allTicketsExist', 'All recommendations already have tickets'));
      return;
    }
    try {
      const tickets = newRecs.map(rec => {
        const recName = rec.check_name || rec.checkName || '';
        const recKey = pillarId ? getRecKey(pillarId, rec) : `wa:unknown:${recName}`;
        return {
          organization_id: userProfile.organization_id,
          title: `[Well-Architected] ${recName}`,
          description: `**${t('wellArchitected.pillar', 'Pillar')}:** ${pillarName}\n\n**${t('wellArchitected.issue', 'Issue')}:**\n${rec.description || ''}\n\n**${t('wellArchitected.recommendation', 'Recommendation')}:**\n${rec.recommendation || ''}`,
          status: 'open',
          priority: rec.severity === 'critical' ? 'critical' : rec.severity === 'high' ? 'high' : rec.severity === 'medium' ? 'medium' : 'low',
          category: 'well_architected',
          severity: rec.severity || 'medium',
          created_by: userProfile.id,
          metadata: {
            wa_recommendation_key: recKey,
            wa_pillar: pillarId || pillarName,
            wa_check_name: recName,
            wa_severity: rec.severity,
          },
        };
      });
      const result = await apiClient.insert('remediation_tickets', tickets);
      if (result.error) throw result.error;
      toast.success(t('wellArchitected.bulkTicketsCreated', '{{count}} tickets created successfully!', { count: tickets.length }));
      refetchTickets();
      refetch();
    } catch {
      toast.error(t('wellArchitected.bulkTicketError', 'Error creating bulk tickets'));
    }
  };

  const getPillarData = (pillarId: string) => latestScan?.find((p: any) => p.pillar === pillarId);

  const overallScore = latestScan?.length
    ? Math.round(latestScan.reduce((sum: number, p: any) => sum + (p.score || 0), 0) / latestScan.length)
    : 0;

  const totalCritical = latestScan?.reduce((sum: number, p: any) => sum + (p.critical_issues || 0), 0) || 0;
  const totalFailed = latestScan?.reduce((sum: number, p: any) => sum + (p.checks_failed || 0), 0) || 0;
  const totalPassed = latestScan?.reduce((sum: number, p: any) => sum + (p.checks_passed || 0), 0) || 0;

  if (isLoading) {
    return (
      <Layout
        title={t('sidebar.wellArchitected', 'Well-Architected Framework')}
        description={t('wellArchitected.description', 'Analysis of the 6 pillars of cloud architecture')}
        icon={<FileCheck className="h-4 w-4" />}
        userRole={userRole}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-end">
            <Skeleton className="h-10 w-36" />
          </div>
          <Skeleton className="h-10 w-80" />
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <Skeleton className="h-32 lg:col-span-2" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-28" />)}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title={t('sidebar.wellArchitected', 'Well-Architected Framework')}
      description={t('wellArchitected.description', 'Analysis of the 6 pillars of cloud architecture')}
      icon={<FileCheck className="h-4 w-4" />}
      userRole={userRole}
    >
      <div className="space-y-6">
        {/* Action Bar */}
        <div className="flex items-center justify-end gap-2">
          {viewingHistoricalScan && (
            <>
              <Badge className="bg-warning/20 text-warning border-warning/30">
                {t('wellArchitected.viewingHistory', 'Viewing History')}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => setViewingHistoricalScan(null)} className="glass">
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('wellArchitected.backToLatest', 'Back')}
              </Button>
            </>
          )}
          {mainTab === "analysis" && !viewingHistoricalScan && (
            <Button
              onClick={runScan}
              disabled={isScanning || !selectedAccountId}
              className="glass hover-glow"
            >
              {isScanning ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t('wellArchitected.scanning', 'Scanning...')}</>
              ) : (
                <><Play className="h-4 w-4 mr-2" />{t('wellArchitected.runScan', 'Run Scan')}</>
              )}
            </Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={mainTab} onValueChange={setMainTab}>
          <TabsList className="glass">
            <TabsTrigger value="analysis">{t('wellArchitected.newAnalysis', 'New Analysis')}</TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              {t('wellArchitected.historyTab', 'History')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="space-y-6">
            {!latestScan || latestScan.length === 0 ? (
              /* Empty State */
              <Card className="glass border-primary/20">
                <CardContent className="p-12 text-center">
                  <div className="p-4 bg-primary/10 rounded-2xl w-fit mx-auto mb-4">
                    <FileCheck className="h-12 w-12 text-primary" />
                  </div>
                  <h3 className="text-xl font-medium text-foreground mb-2">
                    {t('wellArchitected.noScan', 'No scan performed')}
                  </h3>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    {isInDemoMode
                      ? t('wellArchitected.demoHint', 'In demo mode, sample data will be loaded automatically.')
                      : !selectedAccountId
                      ? t('wellArchitected.selectAccountHint', 'Select a cloud account in the selector above to run the scan')
                      : t('wellArchitected.firstScanHint', 'Run your first Well-Architected scan to evaluate your infrastructure')
                    }
                  </p>
                  <Button
                    onClick={runScan}
                    disabled={isScanning || (!selectedAccountId && !isInDemoMode)}
                    className="glass hover-glow"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {isInDemoMode
                      ? t('wellArchitected.viewDemo', 'View Demo Data')
                      : !selectedAccountId
                      ? t('wellArchitected.selectAccountBtn', 'Select an Account')
                      : t('wellArchitected.runFirstScan', 'Run First Scan')
                    }
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Score Overview + Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Overall Score */}
                  <Card className="glass border-primary/20 lg:col-span-2">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-primary/10 rounded-xl">
                            <FileCheck className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="text-base font-medium text-foreground">{t('wellArchitected.overallScore', 'Overall Score')}</h3>
                            <p className="text-xs text-muted-foreground">{t('wellArchitected.averagePillars', 'Average of 6 pillars')}</p>
                          </div>
                        </div>
                        <Badge className={`${getScoreBadgeClass(overallScore)} border-0 text-sm font-medium`}>
                          {getScoreLabel(overallScore, t)}
                        </Badge>
                      </div>
                      <div className="flex items-end gap-4">
                        <div className={`text-5xl font-light tabular-nums ${getScoreColor(overallScore)}`}>{overallScore}</div>
                        <div className="flex-1 pb-2"><Progress value={overallScore} className="h-3" /></div>
                        <span className="text-sm text-muted-foreground pb-2">/100</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Checks Summary */}
                  <Card className="glass border-primary/20">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <span className="text-sm font-medium text-foreground">{t('wellArchitected.checks', 'Checks')}</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{t('wellArchitected.passed', 'Passed')}</span>
                          <span className="text-sm font-semibold tabular-nums text-success">{totalPassed}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{t('wellArchitected.failed', 'Failed')}</span>
                          <span className="text-sm font-semibold tabular-nums text-destructive">{totalFailed}</span>
                        </div>
                        <Progress value={totalPassed + totalFailed > 0 ? (totalPassed / (totalPassed + totalFailed)) * 100 : 0} className="h-2 mt-2" />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recent Executions */}
                  <Card className="glass border-primary/20">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-2 mb-3">
                        <History className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-foreground">{t('wellArchitected.recentExecutions', 'Recent Executions')}</span>
                      </div>
                      <div className="space-y-1.5">
                        {scanHistory && scanHistory.length > 0 ? (
                          scanHistory.slice(0, 4).map((scan: any) => (
                            <div key={scan.id} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${
                                  scan.status === 'completed' ? 'bg-success' :
                                  scan.status === 'running' ? 'bg-warning animate-pulse' : 'bg-destructive'
                                }`} />
                                <span className="text-muted-foreground tabular-nums">
                                  {new Date(scan.created_at).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              {scan.completed_at && (
                                <span className="text-muted-foreground tabular-nums">
                                  {Math.round((new Date(scan.completed_at).getTime() - new Date(scan.created_at).getTime()) / 1000)}s
                                </span>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground text-center py-2">{t('wellArchitected.noExecutions', 'No executions')}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Critical Issues Alert */}
                {totalCritical > 0 && (
                  <Card className="glass border-destructive/30 bg-destructive/5">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {t('wellArchitected.criticalIssuesFound', '{{count}} critical issues found', { count: totalCritical })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t('wellArchitected.criticalIssuesDesc', 'Review and resolve critical issues to improve your score')}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="glass"
                          onClick={() => {
                            const pillarsWithCritical = PILLAR_IDS.filter(id => {
                              const data = getPillarData(id);
                              return (data?.critical_issues || 0) > 0;
                            });
                            setExpandedPillars(new Set(pillarsWithCritical));
                          }}
                        >
                          {t('wellArchitected.reviewCritical', 'Review Critical')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Pillars Grid */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Shield className="h-4 w-4 text-primary" />
                    <h2 className="text-lg font-medium text-foreground">{t('wellArchitected.pillarAnalysis', 'Pillar Analysis')}</h2>
                    <span className="text-xs text-muted-foreground">
                      {t('wellArchitected.pillarAnalysisDesc', 'Click each pillar to see detailed recommendations')}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {PILLAR_IDS.map((pillarId) => {
                      const config = PILLAR_CONFIG[pillarId];
                      const data = getPillarData(pillarId);
                      const Icon = config.icon;
                      const score = data?.score || 0;
                      const recommendations = Array.isArray(data?.recommendations) ? data.recommendations : [];
                      const isExpanded = expandedPillars.has(pillarId);

                      return (
                        <Collapsible key={pillarId} open={isExpanded} onOpenChange={() => togglePillarExpansion(pillarId)}>
                          <Card className="glass border-primary/20 overflow-hidden transition-all hover:shadow-elegant">
                            <CollapsibleTrigger asChild>
                              <button className="w-full p-4 text-left hover:bg-muted/50 transition-colors">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3 flex-1">
                                    <div className={`p-2 ${config.bgColor} rounded-xl`}>
                                      <Icon className={`h-4 w-4 ${config.color}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h4 className="font-medium text-sm text-foreground truncate">
                                        {t(`wellArchitected.pillars.${pillarId}`, pillarId.replace(/_/g, ' '))}
                                      </h4>
                                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                        <span className="tabular-nums flex items-center gap-1">
                                          <CheckCircle2 className="h-3 w-3 text-success" />
                                          {data?.checks_passed || 0}
                                        </span>
                                        <span className="tabular-nums flex items-center gap-1">
                                          <AlertTriangle className="h-3 w-3 text-destructive" />
                                          {data?.checks_failed || 0}
                                        </span>
                                        {(data?.critical_issues || 0) > 0 && (
                                          <Badge variant="destructive" className="text-[10px] py-0 px-1.5">
                                            {data?.critical_issues} {t('wellArchitected.critical', 'critical')}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="text-right">
                                      <p className={`text-2xl font-light tabular-nums ${getScoreColor(score)}`}>{score}</p>
                                      <Progress value={score} className="h-1.5 w-16 mt-1" />
                                    </div>
                                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                                  </div>
                                </div>
                              </button>
                            </CollapsibleTrigger>

                            <CollapsibleContent>
                              <div className="px-4 pb-4 pt-2 border-t border-border">
                                {recommendations.length > 0 ? (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between mb-3">
                                      <span className="text-xs font-medium text-muted-foreground">
                                        {recommendations.length} {t('wellArchitected.recommendations', 'recommendation(s)')}
                                      </span>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={(e: React.MouseEvent) => {
                                          e.stopPropagation();
                                          createBulkTickets(recommendations, t(`wellArchitected.pillars.${pillarId}`, pillarId), pillarId);
                                        }}
                                        className="h-7 text-xs gap-1.5 glass"
                                      >
                                        <Ticket className="h-3 w-3" />
                                        {t('wellArchitected.createTickets', 'Create Tickets')}
                                      </Button>
                                    </div>
                                    {recommendations.map((rec: any, idx: number) => {
                                      const existingTicket = getExistingTicket(pillarId, rec);
                                      const recName = rec.check_name || rec.checkName || '';
                                      return (
                                      <div
                                        key={idx}
                                        className={`p-3 bg-muted/30 rounded-lg text-sm border transition-all cursor-pointer ${existingTicket ? 'border-success/30 bg-success/5' : 'border-border hover:border-primary/20'}`}
                                        onClick={() => setSelectedRec({ rec, pillarId, pillarName: t(`wellArchitected.pillars.${pillarId}`, pillarId.replace(/_/g, ' ')) })}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => e.key === 'Enter' && setSelectedRec({ rec, pillarId, pillarName: t(`wellArchitected.pillars.${pillarId}`, pillarId.replace(/_/g, ' ')) })}
                                      >
                                        <div className="flex items-start gap-2">
                                          <Badge
                                            variant={rec.severity === 'critical' || rec.severity === 'high' ? 'destructive' : 'secondary'}
                                            className="text-[10px] py-0 px-1.5 shrink-0"
                                          >
                                            {rec.severity}
                                          </Badge>
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium text-foreground text-xs truncate">{recName}</p>
                                            <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">{rec.description || ''}</p>
                                          </div>
                                          {existingTicket ? (
                                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 shrink-0 border-success/50 text-success gap-1">
                                              <Ticket className="h-2.5 w-2.5" />
                                              {existingTicket.status}
                                            </Badge>
                                          ) : (
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={(e: React.MouseEvent) => {
                                                e.stopPropagation();
                                                createTicket(rec, t(`wellArchitected.pillars.${pillarId}`, pillarId), pillarId);
                                              }}
                                              disabled={creatingTicketId === `${t(`wellArchitected.pillars.${pillarId}`, pillarId)}-${recName}`}
                                              className="h-6 w-6 p-0 shrink-0"
                                              title={t('wellArchitected.createTicketTooltip', 'Create ticket')}
                                            >
                                              <Ticket className="h-3 w-3" />
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="text-center py-4">
                                    <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
                                    <p className="text-xs text-muted-foreground">{t('wellArchitected.noIssues', 'No issues found')}</p>
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </Card>
                        </Collapsible>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            {userProfile?.organization_id && (
              <WellArchitectedHistory
                organizationId={userProfile.organization_id}
                onViewScan={(scanId: string) => {
                  setViewingHistoricalScan(scanId);
                  setMainTab("analysis");
                  toast.success(t('wellArchitected.loadingHistorical', 'Loading historical scan'));
                }}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Recommendation Detail Modal */}
      <Dialog open={!!selectedRec} onOpenChange={(open) => !open && setSelectedRec(null)}>
        <DialogContent className="glass max-w-lg">
          {selectedRec && (() => {
            const { rec, pillarId, pillarName } = selectedRec;
            const recName = rec.check_name || rec.checkName || '';
            const existingTicket = getExistingTicket(pillarId, rec);
            const config = PILLAR_CONFIG[pillarId];
            const PillarIcon = config?.icon || Shield;

            return (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`p-1.5 ${config?.bgColor || 'bg-primary/10'} rounded-lg`}>
                      <PillarIcon className={`h-4 w-4 ${config?.color || 'text-primary'}`} />
                    </div>
                    <span className="text-xs text-muted-foreground">{pillarName}</span>
                    <Badge
                      variant={rec.severity === 'critical' || rec.severity === 'high' ? 'destructive' : 'secondary'}
                      className="text-[10px] py-0 px-1.5"
                    >
                      {rec.severity}
                    </Badge>
                  </div>
                  <DialogTitle className="text-base">{recName}</DialogTitle>
                  {rec.checkId && (
                    <DialogDescription className="text-xs">ID: {rec.checkId}</DialogDescription>
                  )}
                </DialogHeader>

                <div className="space-y-4 mt-2">
                  {/* Issue Description */}
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {t('wellArchitected.detailIssue', 'Issue')}
                    </h4>
                    <p className="text-sm text-foreground leading-relaxed">{rec.description || t('wellArchitected.noDescription', 'No description available')}</p>
                  </div>

                  {/* Recommendation */}
                  {rec.recommendation && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5" />
                        {t('wellArchitected.detailRecommendation', 'Recommendation')}
                      </h4>
                      <p className="text-sm text-foreground leading-relaxed bg-primary/5 p-3 rounded-lg border border-primary/10">
                        {rec.recommendation}
                      </p>
                    </div>
                  )}

                  {/* Impact */}
                  {rec.impact && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t('wellArchitected.detailImpact', 'Impact')}:</span>
                      <Progress value={rec.impact * 10} className="h-2 flex-1 max-w-32" />
                      <span className="text-xs font-medium tabular-nums">{rec.impact}/10</span>
                    </div>
                  )}

                  {/* Ticket Status */}
                  {existingTicket ? (
                    <div className="p-3 rounded-lg border border-success/30 bg-success/5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Ticket className="h-4 w-4 text-success" />
                          <div>
                            <p className="text-xs font-medium text-foreground">{t('wellArchitected.ticketLinked', 'Ticket linked')}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {t('wellArchitected.ticketCreatedAt', 'Created')} {new Date(existingTicket.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs border-success/50 text-success">
                          {existingTicket.status}
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => {
                        createTicket(rec, pillarName, pillarId);
                        setSelectedRec(null);
                      }}
                      disabled={!!creatingTicketId}
                      className="w-full glass hover-glow gap-2"
                    >
                      <Ticket className="h-4 w-4" />
                      {t('wellArchitected.createTicketForRec', 'Create Ticket for this Recommendation')}
                    </Button>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default WellArchitected;
