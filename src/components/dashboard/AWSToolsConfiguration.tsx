import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Settings, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Shield,
  DollarSign,
  BarChart3,
  Database,
  CloudWatch,
  Activity,
  Zap,
  Lock,
  FileText,
  Users,
  Globe,
  Cpu,
  HardDrive,
  Network,
  Eye,
  Bell,
  Wrench
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AWSToolConfig {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: 'security' | 'cost' | 'monitoring' | 'compliance';
  enabled: boolean;
  configured: boolean;
  consoleUrl: string;
  setupInstructions: string[];
  requiredPermissions: string[];
  estimatedCost: string;
  benefits: string[];
}

const AWS_TOOLS: AWSToolConfig[] = [
  // Security Tools
  {
    id: 'security-hub',
    name: 'AWS Security Hub',
    description: 'Central dashboard para findings de segurança de múltiplos serviços AWS',
    icon: Shield,
    category: 'security',
    enabled: false,
    configured: false,
    consoleUrl: 'https://console.aws.amazon.com/securityhub/',
    estimatedCost: '$0.0010 por finding',
    setupInstructions: [
      'Ativar Security Hub no console AWS',
      'Habilitar AWS Config (pré-requisito)',
      'Ativar padrões de conformidade (AWS Foundational, CIS)',
      'Configurar integração com GuardDuty e Inspector'
    ],
    requiredPermissions: [
      'securityhub:*',
      'config:*',
      'iam:CreateServiceLinkedRole'
    ],
    benefits: [
      'Visão centralizada de segurança',
      'Compliance automático com frameworks',
      'Priorização de findings por criticidade'
    ]
  },
  {
    id: 'guardduty',
    name: 'Amazon GuardDuty',
    description: 'Detecção de ameaças usando machine learning',
    icon: Eye,
    category: 'security',
    enabled: false,
    configured: false,
    consoleUrl: 'https://console.aws.amazon.com/guardduty/',
    estimatedCost: '$4.00 por milhão de eventos CloudTrail',
    setupInstructions: [
      'Ativar GuardDuty no console',
      'Configurar trusted IPs e threat lists',
      'Habilitar proteção para S3 e EKS',
      'Configurar notificações via SNS'
    ],
    requiredPermissions: [
      'guardduty:*',
      'iam:CreateServiceLinkedRole',
      'sns:CreateTopic'
    ],
    benefits: [
      'Detecção automática de ameaças',
      'Machine learning para anomalias',
      'Proteção contra malware e cryptomining'
    ]
  },
  {
    id: 'inspector',
    name: 'Amazon Inspector',
    description: 'Avaliação automática de vulnerabilidades em aplicações',
    icon: Lock,
    category: 'security',
    enabled: false,
    configured: false,
    consoleUrl: 'https://console.aws.amazon.com/inspector/',
    estimatedCost: '$0.09 por assessment',
    setupInstructions: [
      'Ativar Inspector v2 no console',
      'Instalar agente em instâncias EC2',
      'Configurar scanning de ECR',
      'Definir schedule de assessments'
    ],
    requiredPermissions: [
      'inspector2:*',
      'ec2:DescribeInstances',
      'ecr:DescribeRepositories'
    ],
    benefits: [
      'Scanning contínuo de vulnerabilidades',
      'Integração com CI/CD pipelines',
      'Relatórios detalhados de CVEs'
    ]
  },

  // Cost Management Tools
  {
    id: 'cost-explorer',
    name: 'AWS Cost Explorer',
    description: 'Análise detalhada de custos e usage patterns',
    icon: DollarSign,
    category: 'cost',
    enabled: false,
    configured: false,
    consoleUrl: 'https://console.aws.amazon.com/cost-management/home#/cost-explorer',
    estimatedCost: 'Gratuito (primeiros 12 meses)',
    setupInstructions: [
      'Ativar Cost Explorer no Billing console',
      'Configurar Cost Categories',
      'Criar custom reports',
      'Habilitar Right Sizing Recommendations'
    ],
    requiredPermissions: [
      'ce:*',
      'aws-portal:ViewBilling',
      'aws-portal:ViewUsage'
    ],
    benefits: [
      'Análise granular de custos',
      'Forecasting com ML',
      'Recomendações de otimização'
    ]
  },
  {
    id: 'budgets',
    name: 'AWS Budgets',
    description: 'Alertas proativos de custos e usage',
    icon: Bell,
    category: 'cost',
    enabled: false,
    configured: false,
    consoleUrl: 'https://console.aws.amazon.com/billing/home#/budgets',
    estimatedCost: '$0.02 por budget por dia',
    setupInstructions: [
      'Criar budgets de custo e usage',
      'Configurar alertas por email/SNS',
      'Definir thresholds (50%, 80%, 100%)',
      'Habilitar budget actions (opcional)'
    ],
    requiredPermissions: [
      'budgets:*',
      'sns:CreateTopic',
      'iam:PassRole'
    ],
    benefits: [
      'Controle proativo de gastos',
      'Alertas personalizáveis',
      'Ações automáticas de contenção'
    ]
  },
  {
    id: 'trusted-advisor',
    name: 'AWS Trusted Advisor',
    description: 'Recomendações de otimização em tempo real',
    icon: Wrench,
    category: 'cost',
    enabled: false,
    configured: false,
    consoleUrl: 'https://console.aws.amazon.com/trustedadvisor/',
    estimatedCost: 'Incluído no Business/Enterprise Support',
    setupInstructions: [
      'Verificar nível de suporte AWS',
      'Ativar notificações semanais',
      'Configurar refresh automático',
      'Integrar com CloudWatch Events'
    ],
    requiredPermissions: [
      'support:*',
      'trustedadvisor:Describe*'
    ],
    benefits: [
      'Recomendações de 5 categorias',
      'Economia potencial identificada',
      'Checks de segurança e performance'
    ]
  },

  // Monitoring Tools
  {
    id: 'cloudwatch',
    name: 'Amazon CloudWatch',
    description: 'Monitoramento e observabilidade completa',
    icon: Activity,
    category: 'monitoring',
    enabled: false,
    configured: false,
    consoleUrl: 'https://console.aws.amazon.com/cloudwatch/',
    estimatedCost: '$0.30 por métrica customizada',
    setupInstructions: [
      'Configurar CloudWatch Agent em EC2',
      'Criar dashboards customizados',
      'Definir alarmes críticos',
      'Habilitar Container Insights'
    ],
    requiredPermissions: [
      'cloudwatch:*',
      'logs:*',
      'ec2:DescribeInstances'
    ],
    benefits: [
      'Métricas em tempo real',
      'Logs centralizados',
      'Alertas automáticos'
    ]
  },
  {
    id: 'x-ray',
    name: 'AWS X-Ray',
    description: 'Distributed tracing para análise de performance',
    icon: Zap,
    category: 'monitoring',
    enabled: false,
    configured: false,
    consoleUrl: 'https://console.aws.amazon.com/xray/',
    estimatedCost: '$5.00 por milhão de traces',
    setupInstructions: [
      'Instrumentar aplicações com X-Ray SDK',
      'Configurar sampling rules',
      'Habilitar tracing em Lambda/API Gateway',
      'Criar service maps'
    ],
    requiredPermissions: [
      'xray:*',
      'lambda:UpdateFunctionConfiguration'
    ],
    benefits: [
      'Análise de latência end-to-end',
      'Identificação de bottlenecks',
      'Service dependency mapping'
    ]
  },

  // Compliance Tools
  {
    id: 'config',
    name: 'AWS Config',
    description: 'Auditoria e compliance de configurações',
    icon: FileText,
    category: 'compliance',
    enabled: false,
    configured: false,
    consoleUrl: 'https://console.aws.amazon.com/config/',
    estimatedCost: '$0.003 por configuration item',
    setupInstructions: [
      'Ativar Config Recorder',
      'Configurar S3 bucket para snapshots',
      'Habilitar Config Rules',
      'Configurar remediation actions'
    ],
    requiredPermissions: [
      'config:*',
      's3:CreateBucket',
      'iam:CreateServiceLinkedRole'
    ],
    benefits: [
      'Histórico de mudanças',
      'Compliance automático',
      'Remediation automática'
    ]
  },
  {
    id: 'cloudtrail',
    name: 'AWS CloudTrail',
    description: 'Auditoria completa de API calls',
    icon: Globe,
    category: 'compliance',
    enabled: false,
    configured: false,
    consoleUrl: 'https://console.aws.amazon.com/cloudtrail/',
    estimatedCost: '$2.00 por 100,000 eventos',
    setupInstructions: [
      'Criar trail multi-region',
      'Configurar S3 bucket com encryption',
      'Habilitar log file validation',
      'Configurar CloudWatch Logs integration'
    ],
    requiredPermissions: [
      'cloudtrail:*',
      's3:CreateBucket',
      'kms:CreateKey'
    ],
    benefits: [
      'Auditoria completa de ações',
      'Compliance e governança',
      'Análise forense de incidentes'
    ]
  }
];

export function AWSToolsConfiguration() {
  const { toast } = useToast();
  const [tools, setTools] = useState<AWSToolConfig[]>(AWS_TOOLS);
  const [activeCategory, setActiveCategory] = useState<string>('security');
  const [isLoading, setIsLoading] = useState(false);

  const categories = [
    { id: 'security', name: 'Segurança', icon: Shield, count: tools.filter(t => t.category === 'security').length },
    { id: 'cost', name: 'Custos', icon: DollarSign, count: tools.filter(t => t.category === 'cost').length },
    { id: 'monitoring', name: 'Monitoramento', icon: Activity, count: tools.filter(t => t.category === 'monitoring').length },
    { id: 'compliance', name: 'Compliance', icon: FileText, count: tools.filter(t => t.category === 'compliance').length }
  ];

  const filteredTools = tools.filter(tool => tool.category === activeCategory);
  const enabledTools = tools.filter(tool => tool.enabled);
  const configuredTools = tools.filter(tool => tool.configured);

  const handleToggleTool = async (toolId: string) => {
    setIsLoading(true);
    
    try {
      setTools(prev => prev.map(tool => 
        tool.id === toolId 
          ? { ...tool, enabled: !tool.enabled }
          : tool
      ));

      const tool = tools.find(t => t.id === toolId);
      
      toast({
        title: tool?.enabled ? "Ferramenta desabilitada" : "Ferramenta habilitada",
        description: `${tool?.name} foi ${tool?.enabled ? 'desabilitada' : 'habilitada'} com sucesso`,
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível alterar o status da ferramenta",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfigureTool = (tool: AWSToolConfig) => {
    window.open(tool.consoleUrl, '_blank', 'noopener,noreferrer');
    
    // Simular configuração após abrir console
    setTimeout(() => {
      setTools(prev => prev.map(t => 
        t.id === tool.id 
          ? { ...t, configured: true }
          : t
      ));
      
      toast({
        title: "Console AWS aberto",
        description: `Configure ${tool.name} no console e marque como configurado`,
      });
    }, 1000);
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Total de Ferramentas</p>
                <p className="text-2xl font-bold">{tools.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Habilitadas</p>
                <p className="text-2xl font-bold text-green-600">{enabledTools.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Configuradas</p>
                <p className="text-2xl font-bold text-blue-600">{configuredTools.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm font-medium">Custo Estimado</p>
                <p className="text-2xl font-bold text-orange-600">~$50/mês</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Tabs */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="grid w-full grid-cols-4">
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <TabsTrigger key={category.id} value={category.id} className="gap-2">
                <Icon className="h-4 w-4" />
                {category.name}
                <Badge variant="secondary" className="ml-1">
                  {category.count}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {categories.map((category) => (
          <TabsContent key={category.id} value={category.id} className="space-y-4">
            <div className="grid gap-4">
              {filteredTools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Card key={tool.id} className={`transition-all ${tool.enabled ? 'ring-2 ring-primary/20' : ''}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg ${tool.enabled ? 'bg-primary/10' : 'bg-muted'}`}>
                            <Icon className={`h-5 w-5 ${tool.enabled ? 'text-primary' : 'text-muted-foreground'}`} />
                          </div>
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              {tool.name}
                              {tool.enabled && (
                                <Badge variant="default" className="text-xs">
                                  Habilitado
                                </Badge>
                              )}
                              {tool.configured && (
                                <Badge variant="secondary" className="text-xs">
                                  Configurado
                                </Badge>
                              )}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {tool.description}
                            </CardDescription>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={tool.enabled}
                            onCheckedChange={() => handleToggleTool(tool.id)}
                            disabled={isLoading}
                          />
                        </div>
                      </div>
                    </CardHeader>

                    {tool.enabled && (
                      <CardContent className="pt-0 space-y-4">
                        <Separator />
                        
                        {/* Tool Details */}
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-medium mb-2">Benefícios</h4>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {tool.benefits.map((benefit, index) => (
                                <li key={index} className="flex items-start gap-2">
                                  <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                                  {benefit}
                                </li>
                              ))}
                            </ul>
                          </div>
                          
                          <div>
                            <h4 className="font-medium mb-2">Custo Estimado</h4>
                            <p className="text-sm text-muted-foreground mb-3">{tool.estimatedCost}</p>
                            
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleConfigureTool(tool)}
                                className="gap-2"
                              >
                                <ExternalLink className="h-4 w-4" />
                                Configurar no AWS
                              </Button>
                              
                              {tool.configured && (
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="gap-2"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  Configurado
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Setup Instructions */}
                        <div>
                          <h4 className="font-medium mb-2">Instruções de Setup</h4>
                          <ol className="text-sm text-muted-foreground space-y-1">
                            {tool.setupInstructions.map((instruction, index) => (
                              <li key={index} className="flex items-start gap-2">
                                <span className="flex-shrink-0 w-5 h-5 bg-primary/10 text-primary rounded-full text-xs flex items-center justify-center mt-0.5">
                                  {index + 1}
                                </span>
                                {instruction}
                              </li>
                            ))}
                          </ol>
                        </div>

                        {/* Required Permissions */}
                        <div>
                          <h4 className="font-medium mb-2">Permissões Necessárias</h4>
                          <div className="flex flex-wrap gap-1">
                            {tool.requiredPermissions.map((permission, index) => (
                              <Badge key={index} variant="outline" className="text-xs font-mono">
                                {permission}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Ações Rápidas
          </CardTitle>
          <CardDescription>
            Configure múltiplas ferramentas AWS de uma vez
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-start gap-2"
              onClick={() => {
                const securityTools = ['security-hub', 'guardduty', 'inspector'];
                securityTools.forEach(toolId => {
                  const tool = tools.find(t => t.id === toolId);
                  if (tool) handleConfigureTool(tool);
                });
              }}
            >
              <Shield className="h-5 w-5 text-red-500" />
              <div className="text-left">
                <p className="font-medium">Setup Segurança Completo</p>
                <p className="text-xs text-muted-foreground">Security Hub + GuardDuty + Inspector</p>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-start gap-2"
              onClick={() => {
                const costTools = ['cost-explorer', 'budgets', 'trusted-advisor'];
                costTools.forEach(toolId => {
                  const tool = tools.find(t => t.id === toolId);
                  if (tool) handleConfigureTool(tool);
                });
              }}
            >
              <DollarSign className="h-5 w-5 text-green-500" />
              <div className="text-left">
                <p className="font-medium">Setup FinOps Completo</p>
                <p className="text-xs text-muted-foreground">Cost Explorer + Budgets + Trusted Advisor</p>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-start gap-2"
              onClick={() => {
                const monitoringTools = ['cloudwatch', 'x-ray'];
                monitoringTools.forEach(toolId => {
                  const tool = tools.find(t => t.id === toolId);
                  if (tool) handleConfigureTool(tool);
                });
              }}
            >
              <Activity className="h-5 w-5 text-blue-500" />
              <div className="text-left">
                <p className="font-medium">Setup Observabilidade</p>
                <p className="text-xs text-muted-foreground">CloudWatch + X-Ray</p>
              </div>
            </Button>
          </div>

          <Alert>
            <Wrench className="h-4 w-4" />
            <AlertDescription>
              <strong>Dica:</strong> Configure as ferramentas na ordem sugerida para melhor integração. 
              Security Hub requer AWS Config, e muitas ferramentas se beneficiam do CloudTrail ativo.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}