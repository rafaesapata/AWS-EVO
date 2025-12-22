import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useOrganizationQuery } from "@/hooks/useOrganizationQuery";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Building2, TrendingUp, TrendingDown, Award, ChevronDown } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function MultiAccountComparison() {
  const [isOpen, setIsOpen] = useState(false);

  const { data: accounts = [], isLoading } = useOrganizationQuery(
    ['aws-accounts-comparison'],
    async (organizationId) => {
      const response = await apiClient.select(tableName, { eq: filters });
      const data = response.data;
      const error = response.error;
      return data;
    },
    {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    }
  );

  const { data: metricsData = [] } = useOrganizationQuery(
    ['multi-account-metrics'],
    async (organizationId) => {
      const accountIds = accounts?.map(a => a.id) || [];
      if (accountIds.length === 0) return [];

      const response = await apiClient.select(tableName, { eq: filters });
      const data = response.data;
      const error = response.error;
            return data;
    },
    {
      enabled: (accounts?.length || 0) > 0,
      staleTime: 2 * 60 * 1000,
      gcTime: 5 * 60 * 1000,
    }
  );

  // Group metrics by account
  const accountMetrics = accounts.map(account => {
    const accountData = metricsData.filter((m: any) => m.aws_account_id === account.id);
    const latestMetric: any = accountData[0] || {};
    
    return {
      ...account,
      total_savings: latestMetric?.total_cost_savings || 0,
      critical_findings: latestMetric?.critical_findings || 0,
      wa_score: latestMetric?.well_architected_score || 0,
      total_findings: latestMetric?.total_findings || 0,
      resolved_tickets: latestMetric?.resolved_tickets || 0,
      pending_tickets: latestMetric?.pending_tickets || 0
    };
  });

  // Calculate rankings
  const savingsRanking = [...accountMetrics].sort((a, b) => b.total_savings - a.total_savings);
  const securityRanking = [...accountMetrics].sort((a, b) => a.critical_findings - b.critical_findings);
  const waRanking = [...accountMetrics].sort((a, b) => b.wa_score - a.wa_score);

  const getBadge = (rank: number) => {
    if (rank === 0) return { icon: '🥇', color: 'text-yellow-500' };
    if (rank === 1) return { icon: '🥈', color: 'text-gray-400' };
    if (rank === 2) return { icon: '🥉', color: 'text-orange-500' };
    return { icon: `#${rank + 1}`, color: 'text-muted-foreground' };
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comparação Multi-Conta</CardTitle>
          <CardDescription>Carregando contas AWS...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (accounts.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Comparação Multi-Conta
          </CardTitle>
          <CardDescription>
            Adicione múltiplas contas AWS para comparar eficiência
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center p-8 text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Mínimo de 2 contas necessário para comparação</p>
            <p className="text-sm mt-1">Configure contas adicionais em Configuração</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Comparação Multi-Conta
              </CardTitle>
              <CardDescription>
                Rankings de eficiência e performance entre contas AWS
              </CardDescription>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            <Tabs defaultValue="savings" className="w-full">
              <TabsList className="grid grid-cols-3 mb-6">
                <TabsTrigger value="savings">💰 Economia</TabsTrigger>
                <TabsTrigger value="security">🛡️ Segurança</TabsTrigger>
                <TabsTrigger value="well-architected">🏗️ Well-Architected</TabsTrigger>
              </TabsList>

              <TabsContent value="savings" className="space-y-4">
                <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border border-green-200 dark:border-green-800 rounded-lg mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Award className="w-5 h-5 text-green-600" />
                    <h3 className="font-semibold text-green-900 dark:text-green-100">Ranking de Economia</h3>
                  </div>
                  <p className="text-sm text-green-800 dark:text-green-200">
                    Contas ordenadas por economia total potencial identificada
                  </p>
                </div>

                <div className="space-y-3">
                  {savingsRanking.map((account, idx) => {
                    const badge = getBadge(idx);
                    const maxSavings = savingsRanking[0].total_savings;
                    const percentage = maxSavings > 0 ? (account.total_savings / maxSavings) * 100 : 0;

                    return (
                      <div key={account.id} className="p-4 border rounded-lg">
                        <div className="flex items-center gap-4 mb-3">
                          <div className={`text-2xl font-bold ${badge.color}`}>
                            {badge.icon}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h4 className="font-semibold">{account.account_name}</h4>
                              <div className="text-right">
                                <div className="font-bold text-green-600">
                                  ${account.total_savings.toLocaleString()}
                                </div>
                                <div className="text-xs text-muted-foreground">economia total</div>
                              </div>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {account.account_id} · {account.regions?.join(', ')}
                            </div>
                          </div>
                        </div>
                        <Progress value={percentage} className="h-2" />
                      </div>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="security" className="space-y-4">
                <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Award className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100">Ranking de Segurança</h3>
                  </div>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    Contas com menos achados críticos de segurança (melhor = menos achados)
                  </p>
                </div>

                <div className="space-y-3">
                  {securityRanking.map((account, idx) => {
                    const badge = getBadge(idx);
                    const maxFindings = securityRanking[securityRanking.length - 1].critical_findings;
                    const percentage = maxFindings > 0 ? (account.critical_findings / maxFindings) * 100 : 0;

                    return (
                      <div key={account.id} className="p-4 border rounded-lg">
                        <div className="flex items-center gap-4 mb-3">
                          <div className={`text-2xl font-bold ${badge.color}`}>
                            {badge.icon}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h4 className="font-semibold">{account.account_name}</h4>
                              <div className="text-right">
                                <div className={`font-bold ${
                                  account.critical_findings === 0 ? 'text-green-600' :
                                  account.critical_findings < 5 ? 'text-yellow-600' :
                                  'text-red-600'
                                }`}>
                                  {account.critical_findings}
                                </div>
                                <div className="text-xs text-muted-foreground">achados críticos</div>
                              </div>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {account.total_findings} achados totais · {account.resolved_tickets} resolvidos
                            </div>
                          </div>
                        </div>
                        <Progress value={100 - percentage} className="h-2" />
                      </div>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="well-architected" className="space-y-4">
                <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border border-purple-200 dark:border-purple-800 rounded-lg mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Award className="w-5 h-5 text-purple-600" />
                    <h3 className="font-semibold text-purple-900 dark:text-purple-100">Ranking Well-Architected</h3>
                  </div>
                  <p className="text-sm text-purple-800 dark:text-purple-200">
                    Contas com melhor score médio no AWS Well-Architected Framework
                  </p>
                </div>

                <div className="space-y-3">
                  {waRanking.map((account, idx) => {
                    const badge = getBadge(idx);

                    return (
                      <div key={account.id} className="p-4 border rounded-lg">
                        <div className="flex items-center gap-4 mb-3">
                          <div className={`text-2xl font-bold ${badge.color}`}>
                            {badge.icon}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h4 className="font-semibold">{account.account_name}</h4>
                              <div className="text-right">
                                <div className={`text-2xl font-bold ${
                                  account.wa_score >= 80 ? 'text-green-600' :
                                  account.wa_score >= 60 ? 'text-yellow-600' :
                                  'text-red-600'
                                }`}>
                                  {account.wa_score.toFixed(0)}%
                                </div>
                                <div className="text-xs text-muted-foreground">WA score</div>
                              </div>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {account.account_id}
                            </div>
                          </div>
                        </div>
                        <Progress value={account.wa_score} className="h-2" />
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>

            {/* Overall Champion */}
            <div className="mt-6 p-6 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950/20 dark:to-orange-950/20 border-2 border-yellow-500 dark:border-yellow-600 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <div className="text-4xl">🏆</div>
                <div>
                  <h3 className="font-bold text-lg">Conta Campeã Geral</h3>
                  <p className="text-sm text-muted-foreground">
                    Melhor performance consolidada
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Melhor Economia</div>
                  <div className="font-semibold">{savingsRanking[0]?.account_name}</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Mais Segura</div>
                  <div className="font-semibold">{securityRanking[0]?.account_name}</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Melhor WA Score</div>
                  <div className="font-semibold">{waRanking[0]?.account_name}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}