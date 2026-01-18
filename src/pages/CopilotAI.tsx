import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Layout } from "@/components/Layout";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { 
 Bot, 
 Send, 
 Sparkles, 
 TrendingUp, 
 DollarSign, 
 Shield, 
 Lightbulb,
 MessageSquare,
 BarChart3,
 AlertTriangle,
 CheckCircle,
 Clock,
 Zap
} from "lucide-react";

interface ChatMessage {
 id: string;
 type: 'user' | 'assistant';
 content: string;
 timestamp: Date;
 suggestions?: string[];
 data?: any;
}

interface CopilotAnalysis {
 type: 'cost' | 'security' | 'optimization' | 'general';
 title: string;
 summary: string;
 recommendations: string[];
 priority: 'low' | 'medium' | 'high' | 'critical';
 impact: string;
 effort: string;
}

export default function CopilotAI() {
 const { toast } = useToast();
 const { t } = useTranslation();
 const { selectedAccountId } = useCloudAccount();
 const { getAccountFilter } = useAccountFilter();
 const { data: organizationId } = useOrganization();
 const [messages, setMessages] = useState<ChatMessage[]>([]);
 const [inputMessage, setInputMessage] = useState("");
 const [isTyping, setIsTyping] = useState(false);
 const messagesEndRef = useRef<HTMLDivElement>(null);

 // Get recent AWS data for context
 const { data: contextData, isLoading: contextLoading } = useQuery({
 queryKey: ['copilot-context', organizationId, selectedAccountId],
 enabled: !!organizationId && !!selectedAccountId,
 staleTime: 5 * 60 * 1000,
 queryFn: async () => {
 // Get recent costs
 const costsResponse = await apiClient.select('daily_costs', {
 select: '*',
 eq: { organization_id: organizationId, ...getAccountFilter() },
 order: { cost_date: 'desc' },
 limit: 7
 });

 // Get security alerts
 const alertsResponse = await apiClient.select('security_alerts', {
 select: '*',
 eq: { organization_id: organizationId, is_resolved: false },
 limit: 10
 });

 // Get resources
 const resourcesResponse = await apiClient.select('aws_resources', {
 select: '*',
 eq: { organization_id: organizationId, ...getAccountFilter() },
 limit: 20
 });

 return {
 costs: costsResponse.data || [],
 alerts: alertsResponse.data || [],
 resources: resourcesResponse.data || []
 };
 },
 });

 // Send message to Bedrock AI
 const sendMessageMutation = useMutation({
 mutationFn: async (message: string) => {
 const response = await apiClient.invoke('bedrock-chat', {
 body: {
 message,
 context: contextData,
 accountId: selectedAccountId,
 organizationId,
 language: i18n.language || 'pt' // Pass current language
 }
 });

 if (response.error) {
 throw new Error(getErrorMessage(response.error));
 }

 return response.data;
 },
 onSuccess: (data) => {
 const assistantMessage: ChatMessage = {
 id: Date.now().toString(),
 type: 'assistant',
 content: data.response,
 timestamp: new Date(),
 suggestions: data.suggestions,
 data: data.analysis
 };

 setMessages(prev => [...prev, assistantMessage]);
 setIsTyping(false);
 },
 onError: (error) => {
 toast({
 title: "Erro no Copilot",
 description: error instanceof Error ? error.message : "Erro desconhecido",
 variant: "destructive"
 });
 setIsTyping(false);
 }
 });

 const handleSendMessage = async () => {
 if (!inputMessage.trim()) return;

 const userMessage: ChatMessage = {
 id: Date.now().toString(),
 type: 'user',
 content: inputMessage,
 timestamp: new Date()
 };

 setMessages(prev => [...prev, userMessage]);
 setInputMessage("");
 setIsTyping(true);

 sendMessageMutation.mutate(inputMessage);
 };

 const handleSuggestionClick = (suggestion: string) => {
 setInputMessage(suggestion);
 };

 const scrollToBottom = () => {
 messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
 };

 useEffect(() => {
 scrollToBottom();
 }, [messages]);

 // Initialize with welcome message
 useEffect(() => {
 if (messages.length === 0) {
 const welcomeMessage: ChatMessage = {
 id: 'welcome',
 type: 'assistant',
 content: `Olá! Sou o EVO Copilot AI, seu assistente inteligente para AWS. Posso ajudar você com:

• **Análise de Custos**: Identificar oportunidades de economia
• **Segurança**: Avaliar riscos e vulnerabilidades 
• **Otimização**: Sugerir melhorias de performance
• **Compliance**: Verificar conformidade com best practices

Como posso ajudar você hoje?`,
 timestamp: new Date(),
 suggestions: [
 "Analise meus custos da última semana",
 "Quais são os principais riscos de segurança?",
 "Como posso otimizar minha infraestrutura?",
 "Verifique compliance Well-Architected"
 ]
 };
 setMessages([welcomeMessage]);
 }
 }, []);

 const quickActions = [
 {
 icon: DollarSign,
 title: "Análise de Custos",
 description: "Analise gastos e identifique economias",
 action: "Faça uma análise detalhada dos meus custos AWS"
 },
 {
 icon: Shield,
 title: "Security Review",
 description: "Avalie a postura de segurança",
 action: "Analise os riscos de segurança da minha conta"
 },
 {
 icon: Zap,
 title: "Otimização",
 description: "Sugestões de performance e economia",
 action: "Quais otimizações você recomenda?"
 },
 {
 icon: CheckCircle,
 title: "Compliance",
 description: "Verificação de best practices",
 action: "Verifique compliance com AWS Well-Architected"
 }
 ];

 return (
 <Layout 
 title="EVO Copilot AI" 
 description="Assistente inteligente para análise, otimização e segurança AWS"
 icon={<Bot className="h-7 w-7" />}
 >
 <div className="h-full flex flex-col space-y-6">
 {/* Header */}
 <Card >
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Bot className="h-6 w-6 text-primary" />
 EVO Copilot AI
 <Badge variant="secondary" className="ml-2">
 <Sparkles className="h-3 w-3 mr-1" />
 Powered by AWS Bedrock
 </Badge>
 </CardTitle>
 <CardDescription>
 Assistente inteligente para análise, otimização e segurança AWS
 </CardDescription>
 </CardHeader>
 </Card>

 <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6">
 {/* Chat Area */}
 <div className="lg:col-span-3 flex flex-col">
 <Card className="flex-1 flex flex-col">
 <CardHeader className="pb-4">
 <CardTitle className="flex items-center gap-2 text-lg">
 <MessageSquare className="h-5 w-5" />
 Conversa
 </CardTitle>
 </CardHeader>
 <CardContent className="flex-1 flex flex-col">
 {/* Messages */}
 <ScrollArea className="flex-1 pr-4 mb-4">
 <div className="space-y-4">
 {messages.map((message) => (
 <div
 key={message.id}
 className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
 >
 <div
 className={`max-w-[80%] rounded-lg p-4 ${
 message.type === 'user'
 ? 'bg-primary text-primary-foreground'
 : ''
 }`}
 >
 <div className="whitespace-pre-wrap">{message.content}</div>
 
 {/* Suggestions */}
 {message.suggestions && (
 <div className="mt-3 space-y-2">
 <p className="text-sm font-medium opacity-70">Sugestões:</p>
 <div className="flex flex-wrap gap-2">
 {message.suggestions.map((suggestion, idx) => (
 <Button
 key={idx}
 variant="outline"
 size="sm"
 onClick={() => handleSuggestionClick(suggestion)}
 className="text-xs"
 >
 {suggestion}
 </Button>
 ))}
 </div>
 </div>
 )}
 
 <div className="text-xs opacity-50 mt-2">
 {message.timestamp.toLocaleTimeString('pt-BR')}
 </div>
 </div>
 </div>
 ))}
 
 {/* Typing indicator */}
 {isTyping && (
 <div className="flex justify-start">
 <div className=" border border-border rounded-lg p-4 max-w-[80%]">
 <div className="flex items-center gap-2">
 <Bot className="h-4 w-4 text-primary" />
 <div className="flex gap-1">
 <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
 <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
 <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
 </div>
 </div>
 </div>
 </div>
 )}
 
 <div ref={messagesEndRef} />
 </div>
 </ScrollArea>

 {/* Input */}
 <div className="flex gap-2">
 <Input
 value={inputMessage}
 onChange={(e) => setInputMessage(e.target.value)}
 placeholder="Digite sua pergunta sobre AWS..."
 onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
 disabled={isTyping}
 
 />
 <Button 
 onClick={handleSendMessage}
 disabled={!inputMessage.trim() || isTyping}
 className="px-3"
 >
 <Send className="h-4 w-4" />
 </Button>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* Sidebar */}
 <div className="space-y-6">
 {/* Quick Actions */}
 <Card >
 <CardHeader>
 <CardTitle className="text-lg">Ações Rápidas</CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 {quickActions.map((action, idx) => (
 <Button
 key={idx}
 variant="outline"
 className="w-full justify-start h-auto p-3 "
 onClick={() => handleSuggestionClick(action.action)}
 >
 <div className="flex items-start gap-3">
 <action.icon className="h-5 w-5 text-primary mt-0.5" />
 <div className="text-left">
 <div className="font-medium text-sm">{action.title}</div>
 <div className="text-xs text-muted-foreground">{action.description}</div>
 </div>
 </div>
 </Button>
 ))}
 </CardContent>
 </Card>

 {/* Context Info */}
 <Card >
 <CardHeader>
 <CardTitle className="text-lg">Contexto Atual</CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 {contextLoading ? (
 <div className="space-y-2">
 <Skeleton className="h-4 w-full" />
 <Skeleton className="h-4 w-3/4" />
 <Skeleton className="h-4 w-1/2" />
 </div>
 ) : (
 <div className="space-y-3 text-sm">
 <div className="flex items-center justify-between">
 <span className="text-muted-foreground flex items-center gap-1">
 <DollarSign className="h-3 w-3" />
 Custos (7 dias)
 </span>
 <span className="font-medium text-primary">
 ${contextData?.costs?.reduce((sum, c) => {
 const cost = Number(c.total_cost || c.cost || c.amount || 0);
 return sum + (isNaN(cost) ? 0 : cost);
 }, 0).toFixed(2) || '0.00'}
 </span>
 </div>
 <div className="flex items-center justify-between">
 <span className="text-muted-foreground flex items-center gap-1">
 <Shield className="h-3 w-3" />
 Alertas Ativos
 </span>
 <Badge variant={contextData?.alerts?.length > 0 ? "destructive" : "secondary"}>
 {contextData?.alerts?.length || 0}
 </Badge>
 </div>
 <div className="flex items-center justify-between">
 <span className="text-muted-foreground flex items-center gap-1">
 <BarChart3 className="h-3 w-3" />
 Recursos
 </span>
 <span className="font-medium">{contextData?.resources?.length || 0}</span>
 </div>
 </div>
 )}
 </CardContent>
 </Card>

 {/* AI Status */}
 <Card >
 <CardHeader>
 <CardTitle className="text-lg">Status do AI</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 bg-success rounded-full"></div>
 <span className="text-sm">Amazon Bedrock Conectado</span>
 </div>
 <div className="text-xs text-muted-foreground mt-2">
 Modelo: Claude 3 Sonnet
 </div>
 </CardContent>
 </Card>
 </div>
 </div>
 </div>
 </Layout>
 );
}