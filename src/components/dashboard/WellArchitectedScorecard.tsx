import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Loader2, Activity, CheckCircle2, Zap, DollarSign, Leaf, Plus } from "lucide-react";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { toast } from "sonner";
import { ScoreOverview } from "./well-architected/ScoreOverview";
import { PillarCard } from "./well-architected/PillarCard";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "react-i18next";
import { useOrganization } from "@/hooks/useOrganization";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { useTVDashboard } from "@/contexts/TVDashboardContext";

interface WellArchitectedScoreProps {
  onScanComplete: () => void;
}

interface PillarScore {
  id: string;
  pillar: string;
  score: number;
  checks_passed: number;
  checks_failed: number;
  critical_issues: number;
  high_issues: number;
  medium_issues: number;
  low_issues: number;
  recommendations: any[];
}

const PILLAR_ICONS = {
  operational_excellence: Activity,
  security: Shield,
  reliability: CheckCircle2,
  performance_efficiency: Zap,
  cost_optimization: DollarSign,
  sustainability: Leaf,
};

const PILLAR_NAMES = {
  operational_excellence: 'Excelência Operacional',
  security: 'Segurança',
  reliability: 'Confiabilidade',
  performance_efficiency: 'Eficiência de Performance',
  cost_optimization: 'Otimização de Custos',
  sustainability: 'Sustentabilidade',
};

export const WellArchitectedScorecard = ({ onScanComplete }: WellArchitectedScoreProps) => {
  const { t } = useTranslation();
  const { isTVMode } = useTVDashboard();
  const [isScanning, setIsScanning] = useState(false);
  const [expandedPillar, setExpandedPillar] = useState<string | null>(null);
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const [creatingTickets, setCreatingTickets] = useState(false);
  const { data: organizationId } = useOrganization();
  
  // CRITICAL: Get selected AWS account for multi-account isolation
  const { selectedAccountId } = useCloudAccount();

  const { data: scores, refetch, isLoading } = useQuery({
    queryKey: ['well-architected-scores', organizationId, selectedAccountId],
    staleTime: 0,
    gcTime: 0,
    refetchInterval: isTVMode ? 30000 : undefined,
    queryFn: async () => {
      if (!organizationId) throw new Error('Organization not found');

      // Filter by selected account if available
      const filters: any = { organization_id: organizationId };
      if (selectedAccountId) {
        filters['security_scans.aws_account_id'] = selectedAccountId;
      }
      
      const response = await apiClient.select('well_architected_scores', {
        select: `
          id,
          pillar,
          score,
          max_score,
          created_at,
          security_scans!inner(organization_id, aws_account_id)
        `,
        eq: filters,
        order: { column: 'created_at', ascending: false },
        limit: 6
      });
      const data = response.data;
      const error = response.error;
      
      if (error) throw error;
      return data as PillarScore[];
    },
    enabled: !!organizationId,
  });

  const handleScan = async () => {
    setIsScanning(true);
    
    try {
      toast.info("Iniciando Well-Architected Framework Scan...", {
        description: "Analisando 6 pilares de arquitetura AWS"
      });

      const { data, error } = await apiClient.lambda('well-architected-scan');

      

      toast.success("Well-Architected Scan concluído!", {
        description: `Score geral: ${data.overall_score}/100`
      });

      refetch();
      onScanComplete();
    } catch (error) {
      console.error('Erro no Well-Architected scan:', error);
      toast.error("Erro ao executar scan", {
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      setIsScanning(false);
    }
  };

  const overallScore = scores && scores.length > 0
    ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
    : 0;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const getRiskLevel = (score: number) => {
    if (score >= 80) return { level: 'Baixo', color: 'bg-success/20 text-success' };
    if (score >= 60) return { level: 'Médio', color: 'bg-warning/20 text-warning' };
    return { level: 'Alto', color: 'bg-destructive/20 text-destructive' };
  };

  const risk = getRiskLevel(overallScore);

  const handleCreateTickets = async () => {
    if (selectedIssues.size === 0) {
      toast.error(t('common.error'), {
        description: "Selecione pelo menos uma pendência"
      });
      return;
    }

    setCreatingTickets(true);
    try {
      const user = await cognitoAuth.getCurrentUser();
      const { data: profile } = await apiClient.get('/profiles', { id: user?.id }).single();
      
      const ticketsData = Array.from(selectedIssues).map(issueKey => {
        const [pillarId, issueIndex] = issueKey.split('-');
        const pillar = scores?.find(s => s.id === pillarId);
        if (!pillar || !pillar.recommendations?.[parseInt(issueIndex)]) return null;

        const issue = pillar.recommendations[parseInt(issueIndex)];
        return {
          organization_id: profile?.organization_id,
          title: `${PILLAR_NAMES[pillar.pillar as keyof typeof PILLAR_NAMES]}: ${issue.title || 'Correção necessária'}`,
          description: issue.description || issue.issue || 'Pendência identificada no Well-Architected Framework',
          priority: issue.severity === 'critical' ? 'critical' : issue.severity === 'high' ? 'high' : 'medium',
          category: 'configuration',
          severity: issue.severity || 'medium',
          status: 'pending'
        };
      }).filter(Boolean);

      for (const ticket of ticketsData) {
        const response = await apiClient.insert('tickets', ticket);
        if (response.error) throw response.error;
      }

      toast.success("Tickets criados com sucesso!", {
        description: `${ticketsData.length} ticket(s) adicionado(s) à lista de tarefas`
      });
      
      setSelectedIssues(new Set());
    } catch (error) {
      console.error('Erro ao criar tickets:', error);
      toast.error("Erro ao criar tickets");
    } finally {
      setCreatingTickets(false);
    }
  };

  const toggleIssueSelection = (pillarId: string, issueIndex: number) => {
    const issueKey = `${pillarId}-${issueIndex}`;
    const newSelected = new Set(selectedIssues);
    if (newSelected.has(issueKey)) {
      newSelected.delete(issueKey);
    } else {
      newSelected.add(issueKey);
    }
    setSelectedIssues(newSelected);
  };

  return (
    <Card>
      <div className="p-6 pb-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5" />
            AWS Well-Architected Framework
          </h3>
          <p className="text-sm text-muted-foreground">
            Análise completa dos 6 pilares de arquitetura AWS
          </p>
        </div>
      </div>
      <div className="px-6 space-y-6">
        {isLoading ? (
          <div className="space-y-4 pb-6">
            <div className="space-y-2">
              <Skeleton className="h-24 w-full" />
            </div>
            <div className="grid gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-20 w-full" />
                </div>
              ))}
            </div>
          </div>
        ) : scores && scores.length > 0 ? (
          <>
            <ScoreOverview score={overallScore} />

            <div className="grid gap-3">
              {scores.map((pillar) => {
                const Icon = PILLAR_ICONS[pillar.pillar as keyof typeof PILLAR_ICONS];
                const isExpanded = expandedPillar === pillar.pillar;

                return (
                  <div key={pillar.id}>
                    <PillarCard
                      pillar={pillar}
                      icon={Icon}
                      name={PILLAR_NAMES[pillar.pillar as keyof typeof PILLAR_NAMES]}
                      isExpanded={isExpanded}
                      onToggle={() => setExpandedPillar(isExpanded ? null : pillar.pillar)}
                    />
                    {isExpanded && pillar.recommendations && pillar.recommendations.length > 0 && (
                      <div className="mt-2 ml-8 space-y-2">
                        {pillar.recommendations.map((rec: any, idx: number) => (
                          <div key={idx} className="flex items-start gap-2 p-2 bg-muted/30 rounded">
                            <Checkbox
                              checked={selectedIssues.has(`${pillar.id}-${idx}`)}
                              onCheckedChange={() => toggleIssueSelection(pillar.id, idx)}
                            />
                            <div className="flex-1 text-sm">
                              <p className="font-medium">{rec.title || rec.issue}</p>
                              <p className="text-muted-foreground text-xs">{rec.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {selectedIssues.size > 0 && (
              <Button
                onClick={handleCreateTickets}
                disabled={creatingTickets}
                variant="outline"
                className="w-full"
              >
                {creatingTickets ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando tickets...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar {selectedIssues.size} Ticket(s)
                  </>
                )}
              </Button>
            )}
          </>
        ) : null}

        {!isTVMode && (
          <div className="pb-6">
            <Button
              onClick={handleScan}
              disabled={isScanning}
              className="w-full"
              size="lg"
            >
              {isScanning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analisando arquitetura...
              </>
            ) : (
              <>
                <Shield className="mr-2 h-4 w-4" />
                {scores && scores.length > 0 ? 'Executar Nova Análise' : 'Iniciar Well-Architected Scan'}
              </>
            )}
          </Button>
        </div>
        )}
      </div>
    </Card>
  );
};
