import { useTranslation } from "react-i18next";
import { Shield, FileCheck, AlertTriangle, CheckCircle2, RefreshCw, Play, Award, TrendingUp, Zap, DollarSign, Ticket, ExternalLink, History, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
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

// Section Header Component - Clean Light Design (matching Executive Dashboard)
function SectionHeader({ 
  title, 
  description, 
  icon: Icon 
}: { 
  title: string; 
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start gap-3 mb-3">
      {Icon && (
        <div className="p-2 bg-[#003C7D]/10 rounded-xl">
          <Icon className="h-4 w-4 text-[#003C7D]" />
        </div>
      )}
      <div>
        <h2 className="text-xl font-light text-[#1F2937]">{title}</h2>
        <p className="text-xs font-light text-gray-500">{description}</p>
      </div>
    </div>
  );
}

// Score Overview Card - Executive Dashboard Style
function ScoreOverviewCard({ score }: { score: number }) {
  const getScoreColor = (s: number) => {
    if (s >= 80) return 'text-[#10B981]';
    if (s >= 60) return 'text-amber-500';
    return 'text-red-500';
  };

  const getScoreLabel = (s: number) => {
    if (s >= 80) return 'Excelente';
    if (s >= 60) return 'Bom';
    if (s >= 40) return 'Regular';
    return 'Crítico';
  };

  const getScoreBg = (s: number) => {
    if (s >= 80) return 'bg-[#10B981]/10';
    if (s >= 60) return 'bg-amber-500/10';
    return 'bg-red-500/10';
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#003C7D]/10 rounded-xl">
            <FileCheck className="h-5 w-5 text-[#003C7D]" />
          </div>
          <div>
            <h3 className="text-base font-medium text-[#1F2937]">Score Geral</h3>
            <p className="text-xs text-gray-500">Média dos 6 pilares</p>
          </div>
        </div>
        <Badge className={`${getScoreBg(score)} ${getScoreColor(score)} border-0 text-sm font-medium`}>
          {getScoreLabel(score)}
        </Badge>
      </div>
      
      <div className="flex items-end gap-4">
        <div className={`text-5xl font-light tabular-nums ${getScoreColor(score)}`}>
          {score}
        </div>
        <div className="flex-1 pb-2">
          <Progress value={score} className="h-3" />
        </div>
        <span className="text-sm text-gray-500 pb-2">/100</span>
      </div>
    </div>
  );
}

// Pillar Card - Executive Dashboard Style
interface PillarCardNewProps {
  pillar: {
    id: string;
    name: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
  };
  data: {
    score: number;
    checks_passed: number;
    checks_failed: number;
    critical_issues: number;
    recommendations: any[];
  } | undefined;
  isExpanded: boolean;
  onToggle: () => void;
  onCreateTicket: (rec: any, pillarName: string) => void;
  onCreateBulkTickets: (recs: any[], pillarName: string) => void;
  creatingTicketId: string | null;
}

function PillarCardNew({ 
  pillar, 
  data, 
  isExpanded, 
  onToggle,
  onCreateTicket,
  onCreateBulkTickets,
  creatingTicketId
}: PillarCardNewProps) {
  const Icon = pillar.icon;
  const score = data?.score || 0;
  const recommendations = Array.isArray(data?.recommendations) ? data.recommendations : [];

  const getScoreColor = (s: number) => {
    if (s >= 80) return 'text-[#10B981]';
    if (s >= 60) return 'text-amber-500';
    return 'text-red-500';
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden transition-all hover:shadow-lg">
        <CollapsibleTrigger asChild>
          <button className="w-full p-4 text-left hover:bg-[#F9FAFB] transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <div className={`p-2 ${pillar.bgColor} rounded-xl`}>
                  <Icon className={`h-4 w-4 ${pillar.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm text-[#1F2937] truncate">{pillar.name}</h4>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span className="tabular-nums flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-[#10B981]" />
                      {data?.checks_passed || 0}
                    </span>
                    <span className="tabular-nums flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-red-500" />
                      {data?.checks_failed || 0}
                    </span>
                    {(data?.critical_issues || 0) > 0 && (
                      <Badge variant="destructive" className="text-[10px] py-0 px-1.5">
                        {data?.critical_issues} críticos
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className={`text-2xl font-light tabular-nums ${getScoreColor(score)}`}>
                    {score}
                  </p>
                  <Progress value={score} className="h-1.5 w-16 mt-1" />
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </div>
            </div>
          </button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-2 border-t border-gray-100">
            {recommendations.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-gray-500">
                    {recommendations.length} recomendação{recommendations.length > 1 ? 'ões' : ''}
                  </span>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateBulkTickets(recommendations, pillar.name);
                    }}
                    className="h-7 text-xs gap-1.5 rounded-lg"
                  >
                    <Ticket className="h-3 w-3" />
                    Criar Tickets
                  </Button>
                </div>
                {recommendations.slice(0, 3).map((rec: any, idx: number) => (
                  <div 
                    key={idx} 
                    className="p-3 bg-[#F9FAFB] rounded-xl text-sm border border-gray-100 hover:border-[#003C7D]/20 transition-all"
                  >
                    <div className="flex items-start gap-2">
                      <Badge 
                        variant={rec.severity === 'critical' || rec.severity === 'high' ? 'destructive' : 'secondary'}
                        className="text-[10px] py-0 px-1.5 shrink-0"
                      >
                        {rec.severity}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[#1F2937] text-xs truncate">{rec.check_name}</p>
                        <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{rec.description}</p>
                      </div>
                      {!rec.ticket && (
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCreateTicket(rec, pillar.name);
                          }}
                          disabled={creatingTicketId === `${pillar.name}-${rec.check_name}`}
                          className="h-6 w-6 p-0 shrink-0"
                        >
                          <Ticket className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {recommendations.length > 3 && (
                  <p className="text-xs text-center text-gray-400 pt-1">
                    +{recommendations.length - 3} mais recomendações
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <CheckCircle2 className="h-8 w-8 text-[#10B981] mx-auto mb-2" />
                <p className="text-xs text-gray-500">Nenhum problema encontrado</p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// Execution History Card - Executive Dashboard Style
function ExecutionHistoryCard({ scanHistory }: { scanHistory: any[] | undefined }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100 h-full">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-[#003C7D]/10 rounded-xl">
          <History className="h-4 w-4 text-[#003C7D]" />
        </div>
        <h3 className="text-sm font-medium text-[#1F2937]">Execuções Recentes</h3>
      </div>
      
      <div className="space-y-2">
        {scanHistory && scanHistory.length > 0 ? (
          scanHistory.slice(0, 5).map((scan) => (
            <div 
              key={scan.id} 
              className="flex items-center justify-between p-2.5 rounded-xl bg-[#F9FAFB] hover:bg-[#003C7D]/5 transition-all"
            >
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  scan.status === 'completed' ? 'bg-[#10B981]' : 
                  scan.status === 'running' ? 'bg-amber-500 animate-pulse' : 
                  'bg-red-500'
                }`} />
                <span className="text-xs text-gray-600 tabular-nums">
                  {new Date(scan.created_at).toLocaleDateString('pt-BR', { 
                    day: '2-digit', 
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              {scan.completed_at && (
                <span className="text-[10px] text-gray-400 tabular-nums">
                  {Math.round((new Date(scan.completed_at).getTime() - new Date(scan.created_at).getTime()) / 1000)}s
                </span>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-6">
            <History className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-400">Nenhuma execução</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Loading Skeleton - Executive Dashboard Style
function WellArchitectedSkeleton() {
  return (
    <div className="min-h-screen bg-[#F1F3F7] -m-6 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Skeleton className="h-8 w-96" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>

      {/* Tabs */}
      <Skeleton className="h-10 w-80 rounded-xl" />

      {/* Score and History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Skeleton className="h-40 rounded-2xl" />
        </div>
        <Skeleton className="h-40 rounded-2xl" />
      </div>

      {/* Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

// Pillars configuration
const PILLARS = [
  {
    id: 'operational_excellence',
    name: 'Excelência Operacional',
    description: 'Práticas de operação e monitoramento',
    icon: Award,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    id: 'security',
    name: 'Segurança',
    description: 'Proteção de informações e sistemas',
    icon: Shield,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  {
    id: 'reliability',
    name: 'Confiabilidade',
    description: 'Recuperação e disponibilidade',
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  {
    id: 'performance_efficiency',
    name: 'Eficiência de Performance',
    description: 'Uso eficiente de recursos',
    icon: Zap,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  {
    id: 'cost_optimization',
    name: 'Otimização de Custos',
    description: 'Redução de custos desnecessários',
    icon: DollarSign,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  {
    id: 'sustainability',
    name: 'Sustentabilidade',
    description: 'Minimização do impacto ambiental',
    icon: TrendingUp,
    color: 'text-teal-500',
    bgColor: 'bg-teal-500/10',
  },
];

const WellArchitected = () => {
  const { t, i18n } = useTranslation();
  const [isScanning, setIsScanning] = useState(false);
  const [mainTab, setMainTab] = useState<string>("analysis");
  const [viewingHistoricalScan, setViewingHistoricalScan] = useState<string | null>(null);
  const [creatingTicketId, setCreatingTicketId] = useState<string | null>(null);
  const [expandedPillars, setExpandedPillars] = useState<Set<string>>(new Set());
  const { selectedAccountId, selectedProvider } = useCloudAccount();
  const { isInDemoMode } = useDemoAwareQuery();

  const togglePillarExpansion = (pillarId: string) => {
    setExpandedPillars(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pillarId)) {
        newSet.delete(pillarId);
      } else {
        newSet.add(pillarId);
      }
      return newSet;
    });
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

      return {
        ...profile.data?.[0],
        roles: roles.data?.map(r => r.role) || []
      };
    },
  });

  const userRole = userProfile?.roles?.[0] || 'org_user';

  // Fetch scan history
  const { data: scanHistory } = useOrganizationQuery(
    ['well-architected-history'],
    async (organizationId) => {
      const result = await apiClient.select('security_scans', {
        select: 'id, status, created_at, completed_at',
        eq: { organization_id: organizationId, scan_type: 'well_architected' },
        order: { created_at: 'desc' },
        limit: 10
      });
      
      if (result.error) throw result.error;
      return result.data;
    },
    {
      staleTime: 2 * 60 * 1000,
      gcTime: 5 * 60 * 1000,
    }
  );

  const { data: latestScan, refetch, isLoading } = useOrganizationQuery(
    ['well-architected-latest', viewingHistoricalScan, 'demo', isInDemoMode],
    async (organizationId) => {
      if (isInDemoMode && !viewingHistoricalScan) {
        const result = await apiClient.invoke('well-architected-scan', {
          body: { accountId: 'demo' }
        });
        if (result.error) throw result.error;
        const data = result.data as { pillars?: any[] };
        return data.pillars || [];
      }

      if (viewingHistoricalScan) {
        const historicalData = await apiClient.select('well_architected_scans_history', {
          select: '*',
          eq: { id: viewingHistoricalScan },
          limit: 1
        });

        if (historicalData.error) throw historicalData.error;
        if (!historicalData.data?.[0] || !historicalData.data[0].scan_id) return null;

        const scanId = historicalData.data[0].scan_id;
        const pillars = await apiClient.select('well_architected_scores', {
          select: '*, recommendations:recommendations',
          eq: { scan_id: scanId },
          order: { created_at: 'desc' }
        });
        
        if (pillars.error) throw pillars.error;
        return pillars.data;
      }

      const scans = await apiClient.select('security_scans', {
        select: 'id, created_at',
        eq: { organization_id: organizationId, scan_type: 'well_architected', status: 'completed' },
        order: { created_at: 'desc' },
        limit: 1
      });
      
      if (scans.error) throw scans.error;
      if (!scans.data || scans.data.length === 0) return null;

      const scanId = scans.data[0].id;
      const pillars = await apiClient.select('well_architected_scores', {
        select: '*, recommendations:recommendations',
        eq: { scan_id: scanId },
        order: { created_at: 'desc' }
      });
      
      if (pillars.error) throw pillars.error;
      return pillars.data;
    },
    {
      staleTime: 10 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    }
  );

  const runScan = async () => {
    if (isInDemoMode) {
      toast.info(t('wellArchitected.demoMode', 'Modo Demo'), {
        description: t('wellArchitected.demoModeDesc', 'No modo demo, os scans mostram dados de exemplo.')
      });
      return;
    }
    
    if (!selectedAccountId) {
      toast.error('Selecione uma conta AWS', {
        description: 'É necessário selecionar uma conta AWS para executar o scan'
      });
      return;
    }
    
    setIsScanning(true);
    const isAzure = selectedProvider === 'AZURE';
    const providerName = isAzure ? 'Azure' : 'AWS';
    toast.info(`Iniciando scan Well-Architected ${providerName}...`, { duration: 2000 });
    
    try {
      const lambdaName = isAzure ? 'azure-well-architected-scan' : 'well-architected-scan';
      const bodyParam = isAzure 
        ? { credentialId: selectedAccountId }
        : { accountId: selectedAccountId };
      
      const result = await apiClient.invoke(lambdaName, { body: bodyParam });
      
      if (result.error) throw result.error;
      
      const data = result.data;
      if (data?.overall_score !== undefined) {
        toast.success('Scan Well-Architected concluído!', {
          description: `Score geral: ${data.overall_score.toFixed(0)}/100`
        });
      } else {
        toast.success('Scan Well-Architected concluído!');
      }
      
      setTimeout(() => refetch(), 1000);
    } catch (error) {
      toast.error('Erro ao executar scan Well-Architected', {
        description: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    } finally {
      setIsScanning(false);
    }
  };

  const createTicket = async (recommendation: any, pillarName: string) => {
    const ticketKey = `${pillarName}-${recommendation.check_name}`;
    if (creatingTicketId === ticketKey) return;
    
    setCreatingTicketId(ticketKey);
    
    try {
      const ticket = await apiClient.insert('remediation_tickets', {
        organization_id: userProfile?.organization_id,
        title: `[Well-Architected] ${recommendation.check_name}`,
        description: `**Pilar:** ${pillarName}\n\n**Problema:**\n${recommendation.description}\n\n**Recomendação:**\n${recommendation.recommendation}`,
        status: 'pending',
        priority: recommendation.severity === 'critical' ? 'critical' : 
          recommendation.severity === 'high' ? 'high' : 
          recommendation.severity === 'medium' ? 'medium' : 'low',
        category: 'configuration',
        severity: recommendation.severity || 'medium',
        created_by: userProfile?.id,
      });

      if (ticket.error) throw ticket.error;
      toast.success('Ticket criado com sucesso!');
      refetch();
    } catch (error) {
      toast.error('Erro ao criar ticket');
    } finally {
      setCreatingTicketId(null);
    }
  };

  const createBulkTickets = async (recommendations: any[], pillarName: string) => {
    if (!userProfile?.organization_id) {
      toast.error('Organização não encontrada');
      return;
    }

    try {
      const tickets = recommendations.map(rec => ({
        organization_id: userProfile.organization_id,
        title: `[Well-Architected] ${rec.check_name}`,
        description: `**Pilar:** ${pillarName}\n\n**Problema:**\n${rec.description}\n\n**Recomendação:**\n${rec.recommendation}`,
        status: 'pending',
        priority: rec.severity === 'critical' ? 'critical' : 
          rec.severity === 'high' ? 'high' : 
          rec.severity === 'medium' ? 'medium' : 'low',
        category: 'configuration',
        severity: rec.severity || 'medium',
        created_by: userProfile.id,
      }));

      const result = await apiClient.insert('remediation_tickets', tickets);
      if (result.error) throw result.error;

      toast.success(`${tickets.length} tickets criados com sucesso!`);
      refetch();
    } catch (error) {
      toast.error('Erro ao criar tickets em lote');
    }
  };

  const getPillarData = (pillarId: string) => {
    return latestScan?.find(p => p.pillar === pillarId);
  };

  const calculateOverallScore = () => {
    if (!latestScan || latestScan.length === 0) return 0;
    const total = latestScan.reduce((sum, p) => sum + (p.score || 0), 0);
    return Math.round(total / latestScan.length);
  };

  const overallScore = calculateOverallScore();

  // Format current date
  const currentDate = new Date().toLocaleDateString(i18n.language === 'pt' ? 'pt-BR' : 'en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  const formattedDate = currentDate.charAt(0).toUpperCase() + currentDate.slice(1);

  // Count total issues
  const totalCritical = latestScan?.reduce((sum, p) => sum + (p.critical_issues || 0), 0) || 0;
  const totalFailed = latestScan?.reduce((sum, p) => sum + (p.checks_failed || 0), 0) || 0;

  if (isLoading) {
    return (
      <Layout
        title={t('sidebar.wellArchitected', 'Well-Architected Framework')}
        description={t('wellArchitected.description', 'Análise dos 6 pilares da arquitetura AWS')}
        icon={<FileCheck className="h-4 w-4" />}
        userRole={userRole}
      >
        <WellArchitectedSkeleton />
      </Layout>
    );
  }

  return (
    <Layout
      title={t('sidebar.wellArchitected', 'Well-Architected Framework')}
      description={t('wellArchitected.description', 'Análise dos 6 pilares da arquitetura AWS')}
      icon={<FileCheck className="h-4 w-4" />}
      userRole={userRole}
    >
      <div className="min-h-screen bg-[#F1F3F7] -m-6 p-6 space-y-6">
        {/* Header with greeting and refresh */}
        <div className="flex items-start justify-between">
          <div className="space-y-0.5">
            <h1 className="text-3xl font-light text-[#1F2937]">
              {t('wellArchitected.greeting', 'Análise Well-Architected Framework')}
            </h1>
            <p className="text-sm text-gray-500">{formattedDate}</p>
          </div>
          
          <div className="flex items-center gap-3">
            {viewingHistoricalScan && (
              <>
                <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                  Visualizando Histórico
                </Badge>
                <Button 
                  onClick={() => setViewingHistoricalScan(null)}
                  variant="outline"
                  className="rounded-xl"
                  size="sm"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
              </>
            )}
            {mainTab === "analysis" && !viewingHistoricalScan && (
              <Button 
                onClick={runScan} 
                disabled={isScanning || !selectedAccountId}
                className="rounded-xl font-medium shadow-sm"
              >
                {isScanning ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Escaneando...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Executar Scan
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={mainTab} onValueChange={setMainTab}>
          <TabsList className="bg-white rounded-xl shadow-sm border border-gray-100 p-1">
            <TabsTrigger 
              value="analysis" 
              className="rounded-lg data-[state=active]:bg-[#003C7D] data-[state=active]:text-white"
            >
              Nova Análise
            </TabsTrigger>
            <TabsTrigger 
              value="history" 
              className="rounded-lg data-[state=active]:bg-[#003C7D] data-[state=active]:text-white gap-2"
            >
              <History className="h-4 w-4" />
              Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="space-y-6 mt-6">
            {!latestScan || latestScan.length === 0 ? (
              /* Empty State */
              <div className="bg-white rounded-2xl p-12 shadow-md border border-gray-100 text-center">
                <div className="p-4 bg-[#003C7D]/10 rounded-2xl w-fit mx-auto mb-4">
                  <FileCheck className="h-12 w-12 text-[#003C7D]" />
                </div>
                <h3 className="text-xl font-medium text-[#1F2937] mb-2">Nenhum scan realizado</h3>
                <p className="text-gray-500 mb-6 max-w-md mx-auto">
                  {isInDemoMode
                    ? 'No modo demo, os dados de exemplo serão carregados automaticamente.'
                    : !selectedAccountId 
                    ? 'Selecione uma conta AWS no seletor acima para executar o scan'
                    : 'Execute seu primeiro scan Well-Architected para avaliar sua infraestrutura'
                  }
                </p>
                <Button 
                  onClick={runScan} 
                  disabled={isScanning || (!selectedAccountId && !isInDemoMode)} 
                  className="rounded-xl"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {isInDemoMode ? 'Ver Dados Demo' : !selectedAccountId ? 'Selecione uma Conta' : 'Executar Primeiro Scan'}
                </Button>
              </div>
            ) : (
              <>
                {/* Score Overview Section */}
                <section className="space-y-4">
                  <h2 className="text-xl font-light text-[#393939]">
                    {t('wellArchitected.overview', 'Visão Geral')}
                  </h2>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                      <ScoreOverviewCard score={overallScore} />
                    </div>
                    <ExecutionHistoryCard scanHistory={scanHistory} />
                  </div>

                  {/* Quick Stats */}
                  {(totalCritical > 0 || totalFailed > 0) && (
                    <div className="bg-white rounded-2xl p-4 shadow-md border border-gray-100">
                      <div className="flex items-center gap-6">
                        {totalCritical > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                            <span className="text-sm text-[#1F2937]">
                              <span className="font-semibold tabular-nums">{totalCritical}</span> issues críticos
                            </span>
                          </div>
                        )}
                        {totalFailed > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                            <span className="text-sm text-[#1F2937]">
                              <span className="font-semibold tabular-nums">{totalFailed}</span> checks falharam
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>

                {/* Pillars Section */}
                <section className="space-y-4">
                  <SectionHeader 
                    title={t('wellArchitected.pillars', 'Análise por Pilar')}
                    description={t('wellArchitected.pillarsDesc', 'Clique em cada pilar para ver as recomendações detalhadas')}
                    icon={Shield}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {PILLARS.map((pillar) => (
                      <PillarCardNew
                        key={pillar.id}
                        pillar={pillar}
                        data={getPillarData(pillar.id)}
                        isExpanded={expandedPillars.has(pillar.id)}
                        onToggle={() => togglePillarExpansion(pillar.id)}
                        onCreateTicket={createTicket}
                        onCreateBulkTickets={createBulkTickets}
                        creatingTicketId={creatingTicketId}
                      />
                    ))}
                  </div>
                </section>

                {/* Actions Summary */}
                {totalCritical > 0 && (
                  <section className="space-y-4">
                    <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100">
                      <h3 className="text-base font-light text-[#1F2937] mb-3">
                        {t('wellArchitected.priorityActions', 'Ações Prioritárias')}
                      </h3>
                      <div className="space-y-2">
                        <button 
                          onClick={() => {
                            // Expand all pillars with critical issues
                            const pillarsWithCritical = PILLARS.filter(p => {
                              const data = getPillarData(p.id);
                              return (data?.critical_issues || 0) > 0;
                            });
                            setExpandedPillars(new Set(pillarsWithCritical.map(p => p.id)));
                          }}
                          className="w-full flex items-center justify-between p-3.5 rounded-xl border border-gray-100 bg-[#F9FAFB] hover:border-[#003C7D]/30 hover:bg-[#003C7D]/5 transition-all group text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                            <div>
                              <p className="text-sm font-medium text-[#1F2937] group-hover:text-[#003C7D]">
                                Revisar Issues Críticos
                              </p>
                              <p className="text-xs text-gray-500">
                                {totalCritical} issues críticos encontrados
                              </p>
                            </div>
                          </div>
                          <span className="text-gray-400 group-hover:text-[#003C7D]">→</span>
                        </button>
                      </div>
                    </div>
                  </section>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            {userProfile?.organization_id && (
              <WellArchitectedHistory
                organizationId={userProfile?.organization_id}
                onViewScan={(scanId) => {
                  setViewingHistoricalScan(scanId);
                  setMainTab("analysis");
                  toast.success("Carregando scan histórico");
                }}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default WellArchitected;
