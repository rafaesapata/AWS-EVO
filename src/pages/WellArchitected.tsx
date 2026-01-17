import { useTranslation } from "react-i18next";
import { Shield, FileCheck, Activity, AlertTriangle, CheckCircle2, RefreshCw, Play, Award, TrendingUp, Zap, DollarSign, Ticket, ExternalLink, History } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { useOrganizationQuery } from "@/hooks/useOrganizationQuery";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { toast } from "sonner";
import { ScoreOverview } from "@/components/dashboard/well-architected/ScoreOverview";
import { PillarCard } from "@/components/dashboard/well-architected/PillarCard";
import { WellArchitectedHistory } from "@/components/dashboard/well-architected/WellArchitectedHistory";
import { Layout } from "@/components/Layout";
import { useCloudAccount } from "@/contexts/CloudAccountContext";

const WellArchitected = () => {
 const { t } = useTranslation();
 const [isScanning, setIsScanning] = useState(false);
 const [mainTab, setMainTab] = useState<string>("analysis");
 const [viewingHistoricalScan, setViewingHistoricalScan] = useState<string | null>(null);
 const [creatingTicketId, setCreatingTicketId] = useState<string | null>(null);
 const { selectedAccountId, selectedProvider } = useCloudAccount();

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
 ['well-architected-latest', viewingHistoricalScan],
 async (organizationId) => {
 // If viewing historical scan, fetch that specific scan data
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
 
 // Fetch tickets for each recommendation
 if (pillars.data) {
 for (const pillar of pillars.data) {
 if (pillar.recommendations && Array.isArray(pillar.recommendations)) {
 for (const rec of pillar.recommendations as any[]) {
 if (rec.check_name) {
 const ticket = await apiClient.select('remediation_tickets', {
 select: 'id, title, status',
 ilike: { title: `%${rec.check_name}%` },
 order: { created_at: 'desc' },
 limit: 1
 });
 
 if (ticket.data?.[0]) {
 rec.ticket = ticket.data[0];
 }
 }
 }
 }
 }
 }
 
 return pillars.data;
 }

 // Normal flow: fetch latest scan
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
 select: '*, recommendations:recommendations'
 ,
 eq: { scan_id: scanId },
 order: { created_at: 'desc' }
 });
 
 if (pillars.error) throw pillars.error;
 
 // Fetch tickets for each recommendation
 if (pillars.data) {
 for (const pillar of pillars.data) {
 if (pillar.recommendations && Array.isArray(pillar.recommendations)) {
 for (const rec of pillar.recommendations as any[]) {
 if (rec.check_name) {
 const ticket = await apiClient.select('remediation_tickets', {
 select: 'id, title, status',
 ilike: { title: `%${rec.check_name}%` },
 order: { created_at: 'desc' },
 limit: 1
 });
 
 if (ticket.data?.[0]) {
 rec.ticket = ticket.data[0];
 }
 }
 }
 }
 }
 }
 
 return pillars.data;
 },
 {
 staleTime: 10 * 60 * 1000,
 gcTime: 30 * 60 * 1000,
 }
 );

 const runScan = async () => {
 console.log('🔍 runScan called, selectedAccountId:', selectedAccountId);
 
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
 console.log('🔍 Calling API with accountId:', selectedAccountId, 'provider:', selectedProvider);
 
 // Call the appropriate Lambda based on provider
 const lambdaName = isAzure ? 'azure-well-architected-scan' : 'well-architected-scan';
 const bodyParam = isAzure 
 ? { credentialId: selectedAccountId }
 : { accountId: selectedAccountId };
 
 const result = await apiClient.invoke(lambdaName, {
 body: bodyParam
 });
 
 console.log('🔍 API result:', result);
 
 if (result.error) {
 console.error('🔍 API error:', result.error);
 throw result.error;
 }
 
 const data = result.data;
 console.log('🔍 API data:', data);
 
 if (data?.overall_score !== undefined) {
 toast.success('Scan Well-Architected concluído!', {
 description: `Score geral: ${data.overall_score.toFixed(0)}/100`
 });
 } else {
 toast.success('Scan Well-Architected concluído!');
 }
 
 setTimeout(() => refetch(), 1000);
 } catch (error) {
 console.error('🔍 Scan error:', error);
 toast.error('Erro ao executar scan Well-Architected', {
 description: error instanceof Error ? error.message : 'Erro desconhecido'
 });
 } finally {
 setIsScanning(false);
 }
 };

 const createTicket = async (recommendation: any, pillarName: string) => {
 const ticketKey = `${pillarName}-${recommendation.check_name}`;
 
 if (creatingTicketId === ticketKey) {
 return; // Já está criando este ticket
 }
 
 setCreatingTicketId(ticketKey);
 
 try {
 const ticket = await apiClient.insert('remediation_tickets', {
 organization_id: userProfile?.organization_id,
 title: `[Well-Architected] ${recommendation.check_name}`,
 description: `**Pilar:** ${pillarName}\n\n**Problema:**\n${recommendation.description}\n\n**Recomendação:**\n${recommendation.recommendation}\n\n**Impacto no Negócio:**\n${recommendation.business_impact || 'Não especificado'}`,
 status: 'pending',
 priority: recommendation.severity === 'critical' ? 'critical' : 
 recommendation.severity === 'high' ? 'high' : 
 recommendation.severity === 'medium' ? 'medium' : 'low',
 category: 'configuration',
 severity: recommendation.severity || 'medium',
 created_by: userProfile.id,
 });

 if (ticket.error) throw ticket.error;

 toast.success('Ticket criado com sucesso!', {
 description: 'O ticket de remediação foi adicionado à fila'
 });

 // Atualizar dados para mostrar o ticket vinculado
 refetch();
 } catch (error) {
 toast.error('Erro ao criar ticket', {
 description: error instanceof Error ? error.message : 'Erro desconhecido'
 });
 } finally {
 setCreatingTicketId(null);
 }
 };

 const createBulkTickets = async (recommendations: any[], pillarName: string) => {
 try {
 if (!userProfile?.organization_id) {
 toast.error('Organização não encontrada');
 return;
 }

 const tickets = recommendations.map(rec => ({
 organization_id: userProfile.organization_id,
 title: `[Well-Architected] ${rec.check_name}`,
 description: `**Pilar:** ${pillarName}\n\n**Problema:**\n${rec.description}\n\n**Recomendação:**\n${rec.recommendation}\n\n**Impacto no Negócio:**\n${rec.business_impact || 'Não especificado'}`,
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

 toast.success(`${tickets.length} tickets criados com sucesso!`, {
 description: 'Todos os tickets foram adicionados à fila de remediação'
 });

 // Atualizar dados para mostrar os tickets vinculados
 refetch();
 } catch (error) {
 toast.error('Erro ao criar tickets em lote', {
 description: error instanceof Error ? error.message : 'Erro desconhecido'
 });
 }
 };

 const pillars = [
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

 const getPillarData = (pillarId: string) => {
 return latestScan?.find(p => p.pillar === pillarId);
 };

 const calculateOverallScore = () => {
 if (!latestScan || latestScan.length === 0) return 0;
 const total = latestScan.reduce((sum, p) => sum + (p.score || 0), 0);
 return Math.round(total / latestScan.length);
 };

 const overallScore = calculateOverallScore();

 const getScoreColor = (score: number) => {
 if (score >= 80) return 'text-green-500';
 if (score >= 60) return 'text-yellow-500';
 return 'text-red-500';
 };

 const getScoreLabel = (score: number) => {
 if (score >= 80) return 'Excelente';
 if (score >= 60) return 'Bom';
 if (score >= 40) return 'Regular';
 return 'Crítico';
 };

 // Header actions for the Layout
 const headerActions = (
 <>
 {viewingHistoricalScan && (
 <Badge variant="secondary" className="gap-2">
 <Shield className="h-3 w-3" />
 Visualizando Scan Histórico
 </Badge>
 )}
 {viewingHistoricalScan && (
 <Button 
 onClick={() => setViewingHistoricalScan(null)}
 variant="outline"
 className="gap-2 "
 size="sm"
 >
 <RefreshCw className="h-4 w-4" />
 Voltar para Análise Atual
 </Button>
 )}
 {mainTab === "analysis" && !viewingHistoricalScan && (
 <Button 
 onClick={runScan} 
 disabled={isScanning || !selectedAccountId}
 className="gap-2 "
 >
 {isScanning ? (
 <>
 <RefreshCw className="h-5 w-5 animate-spin" />
 Escaneando...
 </>
 ) : (
 <>
 <Play className="h-5 w-5 " />
 Executar Scan
 </>
 )}
 </Button>
 )}
 </>
 );

 return (
 <Layout
 title="Well-Architected Framework"
 description="Análise dos 6 pilares da arquitetura AWS"
 icon={<FileCheck className="h-6 w-6" />}
 userRole={userRole}
 >
 <div className="space-y-8">
 {/* Custom header actions */}
 <div className="flex items-center justify-end gap-3">
 {headerActions}
 </div>

 <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-6">
 <TabsList className="glass-card-float grid w-full max-w-md grid-cols-2">
 <TabsTrigger value="analysis">Nova Análise</TabsTrigger>
 <TabsTrigger value="history" className="gap-2">
 <History className="h-4 w-4" />
 Histórico
 </TabsTrigger>
 </TabsList>

 <TabsContent value="analysis" className="space-y-8">
 {isLoading ? (
 <div className="flex items-center justify-center py-20">
 <RefreshCw className="h-8 w-8 animate-spin text-primary" />
 </div>
 ) : !latestScan || latestScan.length === 0 ? (
 <Card className="border-dashed ">
 <CardContent className="flex flex-col items-center justify-center py-20 text-center">
 <AlertTriangle className="h-16 w-16 text-muted-foreground mb-4 " />
 <h3 className="text-xl font-semibold mb-2">Nenhum scan realizado</h3>
 <p className="text-muted-foreground mb-6 max-w-md">
 {!selectedAccountId 
 ? 'Selecione uma conta AWS no seletor acima para executar o scan'
 : 'Execute seu primeiro scan Well-Architected para avaliar sua infraestrutura AWS'
 }
 </p>
 <Button onClick={runScan} disabled={isScanning || !selectedAccountId} className="">
 <Play className="h-4 w-4 mr-2" />
 {!selectedAccountId ? 'Selecione uma Conta AWS' : 'Executar Primeiro Scan'}
 </Button>
 </CardContent>
 </Card>
 ) : (
 <>
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 ">
 <div className="lg:col-span-2">
 <ScoreOverview score={overallScore} />
 </div>
 
 {/* Histórico de Execuções */}
 <Card className="">
 <CardHeader>
 <CardTitle className="text-sm font-medium flex items-center gap-2">
 <History className="h-4 w-4 text-primary " />
 Histórico de Execuções
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-2">
 {scanHistory && scanHistory.length > 0 ? (
 scanHistory.slice(0, 5).map((scan) => (
 <div key={scan.id} className="flex items-center justify-between text-sm transition-all hover:translate-x-1">
 <div className="flex items-center gap-2">
 <Badge variant={scan.status === 'completed' ? 'default' : scan.status === 'running' ? 'secondary' : 'destructive'} className="text-xs">
 {scan.status === 'completed' ? 'Completo' : scan.status === 'running' ? 'Em execução' : 'Erro'}
 </Badge>
 <span className="text-muted-foreground tabular-nums">
 {new Date(scan.created_at).toLocaleDateString('pt-BR', { 
 day: '2-digit', 
 month: '2-digit',
 hour: '2-digit',
 minute: '2-digit'
 })}
 </span>
 </div>
 {scan.completed_at && (
 <span className="text-xs text-muted-foreground tabular-nums">
 {Math.round((new Date(scan.completed_at).getTime() - new Date(scan.created_at).getTime()) / 1000)}s
 </span>
 )}
 </div>
 ))
 ) : (
 <p className="text-sm text-muted-foreground text-center py-4">
 Nenhuma execução encontrada
 </p>
 )}
 </CardContent>
 </Card>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ">
 {pillars.map((pillar) => {
 const pillarData = getPillarData(pillar.id);
 const recommendations = Array.isArray(pillarData?.recommendations) 
 ? pillarData.recommendations 
 : [];
 
 const pillarInfo = {
 id: pillar.id,
 pillar: pillar.name,
 score: pillarData?.score || 0,
 checks_passed: pillarData?.checks_passed || 0,
 checks_failed: pillarData?.checks_failed || 0,
 critical_issues: pillarData?.critical_issues || 0,
 recommendations: recommendations,
 };
 
 return (
 <PillarCard
 key={pillar.id}
 pillar={pillarInfo}
 icon={pillar.icon}
 name={pillar.name}
 isExpanded={false}
 onToggle={() => {}}
 />
 );
 })}
 </div>

 <Card className="">
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <FileCheck className="h-5 w-5 text-primary " />
 Análise Detalhada por Pilar
 </CardTitle>
 <CardDescription>
 Recomendações e insights detalhados
 </CardDescription>
 </CardHeader>
 <CardContent>
 <Tabs defaultValue="operational_excellence">
 <TabsList className="glass-card-float grid grid-cols-3 lg:grid-cols-6 mb-6">
 {pillars.map((pillar) => (
 <TabsTrigger key={pillar.id} value={pillar.id} className="gap-2">
 <pillar.icon className="h-4 w-4" />
 <span className="hidden lg:inline">{pillar.name}</span>
 </TabsTrigger>
 ))}
 </TabsList>

 {pillars.map((pillar) => {
 const pillarData = getPillarData(pillar.id);
 const score = pillarData?.score || 0;
 const recommendations = Array.isArray(pillarData?.recommendations) 
 ? pillarData.recommendations 
 : [];
 
 return (
 <TabsContent key={pillar.id} value={pillar.id} className="space-y-4">
 <div className="flex items-start gap-4 p-6 rounded-lg bg-muted/50 transition-all hover:bg-muted/70">
 <div className={`p-3 rounded-lg ${pillar.bgColor} transition-transform hover:scale-110`}>
 <pillar.icon className={`h-8 w-8 ${pillar.color} `} />
 </div>
 <div className="flex-1">
 <h3 className="text-xl font-semibold mb-2">{pillar.name}</h3>
 <p className="text-muted-foreground mb-4">{pillar.description}</p>
 <div className="flex items-center gap-4">
 <div className="flex-1">
 <Progress value={score} className="h-3 " />
 </div>
 <Badge className={`${getScoreColor(score)} transition-all hover:scale-105`}>
 <span className="tabular-nums">{score}%</span> - {getScoreLabel(score)}
 </Badge>
 </div>
 <div className="grid grid-cols-2 gap-4 mt-4">
 <div className="flex items-center gap-2 transition-all hover:translate-x-1">
 <CheckCircle2 className="h-4 w-4 text-green-500 " />
 <span className="text-sm tabular-nums">
 {pillarData?.checks_passed || 0} checks aprovados
 </span>
 </div>
 <div className="flex items-center gap-2 transition-all hover:translate-x-1">
 <AlertTriangle className={`h-4 w-4 text-red-500 ${(pillarData?.checks_failed || 0) > 0 ? '' : ''}`} />
 <span className="text-sm tabular-nums">
 {pillarData?.checks_failed || 0} checks falharam
 </span>
 </div>
 </div>
 </div>
 </div>

 {recommendations && recommendations.length > 0 ? (
 <div className="space-y-3 ">
 <div className="flex items-center justify-between mb-4">
 <h4 className="font-semibold text-sm">Recomendações:</h4>
 <Button 
 size="sm" 
 variant="outline"
 onClick={() => createBulkTickets(recommendations, pillar.name)}
 className="gap-2  "
 >
 <Ticket className="h-4 w-4" />
 Criar {recommendations.length} Ticket{recommendations.length > 1 ? 's' : ''}
 </Button>
 </div>
 {recommendations.map((rec: any, idx: number) => (
 <Card key={idx} className="border-l-4 border-l-primary  transition-all hover:translate-x-1">
 <CardContent className="pt-6">
 <div className="flex items-start gap-3">
 <Badge 
 variant={
 rec.severity === 'critical' ? 'destructive' : 
 rec.severity === 'high' ? 'destructive' : 
 rec.severity === 'medium' ? 'default' : 
 'secondary'
 }
 className={rec.severity === 'critical' ? '' : ''}
 >
 {rec.severity}
 </Badge>
 <div className="flex-1">
 <h5 className="font-semibold mb-2">{rec.check_name}</h5>
 <p className="text-sm text-muted-foreground mb-3">
 {rec.description}
 </p>
 <div className="bg-muted/50 rounded-lg p-3">
 <p className="text-sm font-medium mb-1">Recomendação:</p>
 <p className="text-sm text-muted-foreground">{rec.recommendation}</p>
 </div>
 {rec.business_impact && (
 <div className="mt-3 bg-primary/10 rounded-lg p-3">
 <p className="text-sm font-medium mb-1">Impacto no Negócio:</p>
 <p className="text-sm text-muted-foreground">{rec.business_impact}</p>
 </div>
 )}
 {rec.ticket && (
 <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
 <ExternalLink className="h-4 w-4" />
 <span>Ticket vinculado: {rec.ticket.title}</span>
 <Badge variant="outline" className="text-xs">
 {rec.ticket.status}
 </Badge>
 </div>
 )}
 </div>
 {!rec.ticket && (
 <Button 
 size="sm" 
 variant="outline"
 onClick={() => createTicket(rec, pillar.name)}
 disabled={creatingTicketId === `${pillar.name}-${rec.check_name}`}
 className="gap-2  "
 >
 <Ticket className="h-4 w-4" />
 {creatingTicketId === `${pillar.name}-${rec.check_name}` ? 'Criando...' : 'Criar Ticket'}
 </Button>
 )}
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 ) : (
 <div className="text-center py-8 text-muted-foreground">
 Nenhuma recomendação para este pilar
 </div>
 )}
 </TabsContent>
 );
 })}
 </Tabs>
 </CardContent>
 </Card>
 </>
 )}
 </TabsContent>

 <TabsContent value="history">
 {userProfile?.organization_id && (
 <WellArchitectedHistory
 organizationId={userProfile?.organization_id}
 onViewScan={(scanId) => {
 setViewingHistoricalScan(scanId);
 setMainTab("analysis");
 toast.success("Carregando scan histórico", {
 description: "Visualizando detalhes da análise selecionada...",
 });
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
