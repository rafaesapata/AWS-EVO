import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Sparkles,
  FileText,
  AlertOctagon,
  Info,
  Copy,
  Check
} from "lucide-react";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useToast } from "@/hooks/use-toast";

interface WafRulesEvaluatorProps {
  accountId?: string;
}

interface RuleEvaluation {
  ruleId: string;
  ruleName: string;
  priority: number;
  action: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'safe';
  issues: string[];
  recommendations: string[];
  militaryGradeScore: number;
  testingInstructions: string[];
  rollbackPlan: string[];
}

interface EvaluationResult {
  overallScore: number;
  totalRules: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  rules: RuleEvaluation[];
  generalRecommendations: string[];
  aiAnalysis: string;
  generatedAt: string;
}

export function WafRulesEvaluator({ accountId }: WafRulesEvaluatorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const evaluateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.invoke<EvaluationResult>('waf-dashboard-api', {
        body: { 
          action: 'evaluate-rules',
          accountId 
        }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
    onSuccess: (data) => {
      setEvaluation(data);
      toast({
        title: t('waf.rulesEvaluator.evaluationComplete', 'Avaliação Concluída'),
        description: t('waf.rulesEvaluator.evaluationCompleteDesc', 'Análise de regras WAF concluída com sucesso'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Erro'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'high': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
      case 'medium': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      case 'low': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
      case 'safe': return 'text-green-500 bg-green-500/10 border-green-500/20';
      default: return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
    }
  };

  const getRiskIcon = (risk: string) => {
    switch (risk) {
      case 'critical': return <AlertOctagon className="h-4 w-4" />;
      case 'high': return <AlertTriangle className="h-4 w-4" />;
      case 'medium': return <Info className="h-4 w-4" />;
      case 'low': return <CheckCircle2 className="h-4 w-4" />;
      case 'safe': return <Shield className="h-4 w-4" />;
      default: return <Info className="h-4 w-4" />;
    }
  };

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
      toast({
        title: t('common.copied', 'Copiado'),
        description: t('waf.rulesEvaluator.copiedToClipboard', 'Instruções copiadas para a área de transferência'),
      });
    } catch (err) {
      toast({
        title: t('common.error', 'Erro'),
        description: t('waf.rulesEvaluator.copyError', 'Erro ao copiar'),
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="glass border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          {t('waf.rulesEvaluator.title', 'Avaliação de Regras WAF')}
          <Badge variant="outline" className="ml-2">
            <Sparkles className="h-3 w-3 mr-1" />
            {t('waf.rulesEvaluator.militaryGrade', 'Padrão Militar Nível Ouro')}
          </Badge>
        </CardTitle>
        <CardDescription>
          {t('waf.rulesEvaluator.description', 'Análise inteligente das regras WAF com recomendações de segurança de nível militar')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Warning Alert */}
        <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="space-y-2">
            <p className="font-semibold">
              {t('waf.rulesEvaluator.warningTitle', '⚠️ ATENÇÃO: Mudanças em Regras WAF São Críticas')}
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>{t('waf.rulesEvaluator.warning1', 'SEMPRE teste em modo COUNT antes de BLOCK')}</li>
              <li>{t('waf.rulesEvaluator.warning2', 'NUNCA aplique mudanças diretamente em produção')}</li>
              <li>{t('waf.rulesEvaluator.warning3', 'SEMPRE tenha um plano de rollback documentado')}</li>
              <li>{t('waf.rulesEvaluator.warning4', 'Monitore métricas por 24-48h após mudanças')}</li>
              <li>{t('waf.rulesEvaluator.warning5', 'Regras mal configuradas podem bloquear tráfego legítimo')}</li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* Evaluate Button */}
        {!evaluation && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Shield className="h-16 w-16 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground text-center max-w-md">
              {t('waf.rulesEvaluator.clickToEvaluate', 'Clique no botão abaixo para iniciar uma avaliação completa das regras WAF usando IA com padrão militar nível ouro')}
            </p>
            <Button 
              onClick={() => evaluateMutation.mutate()}
              disabled={evaluateMutation.isPending || !accountId}
              size="lg"
              className="glass hover-glow"
            >
              {evaluateMutation.isPending ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                  {t('waf.rulesEvaluator.evaluating', 'Avaliando...')}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {t('waf.rulesEvaluator.startEvaluation', 'Iniciar Avaliação com IA')}
                </>
              )}
            </Button>
            {!accountId && (
              <p className="text-sm text-muted-foreground">
                {t('waf.rulesEvaluator.selectAccount', 'Selecione uma conta AWS no header')}
              </p>
            )}
          </div>
        )}

        {/* Evaluation Results */}
        {evaluation && (
          <div className="space-y-6">
            {/* Overall Score */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="glass">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary">
                      {evaluation.overallScore}
                      <span className="text-lg text-muted-foreground">/100</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('waf.rulesEvaluator.overallScore', 'Score Geral')}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass border-red-500/20">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-red-500">
                      {evaluation.criticalIssues}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('waf.rulesEvaluator.criticalIssues', 'Críticos')}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass border-orange-500/20">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-orange-500">
                      {evaluation.highIssues}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('waf.rulesEvaluator.highIssues', 'Altos')}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass border-yellow-500/20">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-yellow-500">
                      {evaluation.mediumIssues}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('waf.rulesEvaluator.mediumIssues', 'Médios')}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* AI Analysis */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {t('waf.rulesEvaluator.aiAnalysis', 'Análise da IA')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{evaluation.aiAnalysis}</p>
              </CardContent>
            </Card>

            {/* Tabs for Rules and Recommendations */}
            <Tabs defaultValue="rules" className="w-full">
              <TabsList className="glass">
                <TabsTrigger value="rules">
                  {t('waf.rulesEvaluator.rulesTab', 'Regras Avaliadas')} ({evaluation.totalRules})
                </TabsTrigger>
                <TabsTrigger value="recommendations">
                  {t('waf.rulesEvaluator.recommendationsTab', 'Recomendações Gerais')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="rules" className="space-y-4 mt-4">
                <ScrollArea className="h-[600px] pr-4">
                  {evaluation.rules.map((rule, index) => (
                    <Card key={rule.ruleId} className={`mb-4 ${getRiskColor(rule.riskLevel)}`}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-base flex items-center gap-2">
                              {getRiskIcon(rule.riskLevel)}
                              {rule.ruleName}
                              <Badge variant="outline" className="ml-2">
                                Priority: {rule.priority}
                              </Badge>
                              <Badge variant="outline">
                                {rule.action}
                              </Badge>
                            </CardTitle>
                            <CardDescription className="mt-1">
                              Rule ID: {rule.ruleId}
                            </CardDescription>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold">
                              {rule.militaryGradeScore}
                              <span className="text-sm text-muted-foreground">/100</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {t('waf.rulesEvaluator.militaryScore', 'Score Militar')}
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Issues */}
                        {rule.issues.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                              <XCircle className="h-4 w-4" />
                              {t('waf.rulesEvaluator.issues', 'Problemas Identificados')}
                            </h4>
                            <ul className="list-disc list-inside space-y-1 text-sm">
                              {rule.issues.map((issue, i) => (
                                <li key={i}>{issue}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Recommendations */}
                        {rule.recommendations.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4" />
                              {t('waf.rulesEvaluator.recommendations', 'Recomendações')}
                            </h4>
                            <ul className="list-disc list-inside space-y-1 text-sm">
                              {rule.recommendations.map((rec, i) => (
                                <li key={i}>{rec}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Testing Instructions */}
                        {rule.testingInstructions.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-semibold text-sm flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                {t('waf.rulesEvaluator.testingInstructions', 'Instruções de Teste (COUNT Mode)')}
                              </h4>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(rule.testingInstructions.join('\n'), index)}
                              >
                                {copiedIndex === index ? (
                                  <Check className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                            <div className="bg-muted/50 p-3 rounded-md">
                              <ol className="list-decimal list-inside space-y-1 text-sm font-mono">
                                {rule.testingInstructions.map((instruction, i) => (
                                  <li key={i} className="text-xs">{instruction}</li>
                                ))}
                              </ol>
                            </div>
                          </div>
                        )}

                        {/* Rollback Plan */}
                        {rule.rollbackPlan.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4" />
                              {t('waf.rulesEvaluator.rollbackPlan', 'Plano de Rollback')}
                            </h4>
                            <div className="bg-red-500/10 p-3 rounded-md border border-red-500/20">
                              <ol className="list-decimal list-inside space-y-1 text-sm">
                                {rule.rollbackPlan.map((step, i) => (
                                  <li key={i} className="text-xs">{step}</li>
                                ))}
                              </ol>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="recommendations" className="space-y-4 mt-4">
                <Card className="glass">
                  <CardHeader>
                    <CardTitle className="text-base">
                      {t('waf.rulesEvaluator.generalRecommendations', 'Recomendações Gerais de Segurança')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {evaluation.generalRecommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* Best Practices */}
                <Card className="glass border-blue-500/20">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Info className="h-4 w-4 text-blue-500" />
                      {t('waf.rulesEvaluator.bestPractices', 'Melhores Práticas - Padrão Militar')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        <span>{t('waf.rulesEvaluator.practice1', 'Sempre teste mudanças em ambiente de staging primeiro')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        <span>{t('waf.rulesEvaluator.practice2', 'Use modo COUNT por 24-48h antes de mudar para BLOCK')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        <span>{t('waf.rulesEvaluator.practice3', 'Monitore métricas de falsos positivos continuamente')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        <span>{t('waf.rulesEvaluator.practice4', 'Documente todas as mudanças e razões')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        <span>{t('waf.rulesEvaluator.practice5', 'Mantenha um runbook de rollback atualizado')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        <span>{t('waf.rulesEvaluator.practice6', 'Revise regras trimestralmente')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        <span>{t('waf.rulesEvaluator.practice7', 'Use AWS WAF Managed Rules como baseline')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        <span>{t('waf.rulesEvaluator.practice8', 'Implemente rate limiting progressivo')}</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Re-evaluate Button */}
            <div className="flex justify-center pt-4">
              <Button 
                onClick={() => evaluateMutation.mutate()}
                disabled={evaluateMutation.isPending}
                variant="outline"
                className="glass"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {t('waf.rulesEvaluator.reEvaluate', 'Reavaliar Regras')}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              {t('waf.rulesEvaluator.generatedAt', 'Avaliação gerada em')}: {new Date(evaluation.generatedAt).toLocaleString()}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
