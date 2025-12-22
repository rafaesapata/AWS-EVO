import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { bedrockAI } from "@/integrations/aws/bedrock-client";
import type { AuthUser } from "@/integrations/aws/cognito-client-simple";
import { 
  TrendingUp, 
  TrendingDown, 
  Shield, 
  DollarSign, 
  Server, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  Database
} from "lucide-react";

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [metrics, setMetrics] = useState({
    totalCost: 2450,
    costTrend: 12,
    securityScore: 85,
    activeAlerts: 3,
    resources: 127,
    compliance: 92
  });

  useEffect(() => {
    const loadUser = async () => {
      try {
        // Verificar sessão local primeiro
        const localAuth = localStorage.getItem('evo-auth');
        if (localAuth) {
          const authData = JSON.parse(localAuth);
          if (Date.now() - authData.timestamp < 24 * 60 * 60 * 1000) {
            setUser(authData.user);
            setIsLoading(false);
            return;
          }
        }

        // Tentar AWS Cognito
        const currentUser = await cognitoAuth.getCurrentUser();
        setUser(currentUser);
      } catch (error) {
        console.error("Error loading user:", error);
        navigate("/");
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, [navigate]);

  const handleSignOut = async () => {
    try {
      // Limpar sessão local
      localStorage.removeItem('evo-auth');
      
      // Tentar logout do AWS Cognito
      await cognitoAuth.signOut();
      
      navigate("/");
    } catch (error) {
      console.error("Sign out error:", error);
      // Mesmo com erro, redirecionar
      navigate("/");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-semibold text-gray-900">EVO UDS Dashboard</h1>
              <Badge variant="secondary">v2.1.0</Badge>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Olá, {user?.name || user?.email}
              </span>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Custo Mensal</p>
                    <p className="text-2xl font-bold text-gray-900">${metrics.totalCost}</p>
                    <div className="flex items-center mt-1">
                      {metrics.costTrend > 0 ? (
                        <TrendingUp className="h-4 w-4 text-red-500 mr-1" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-green-500 mr-1" />
                      )}
                      <span className={`text-sm ${metrics.costTrend > 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {Math.abs(metrics.costTrend)}%
                      </span>
                    </div>
                  </div>
                  <DollarSign className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Security Score</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.securityScore}/100</p>
                    <Progress value={metrics.securityScore} className="mt-2" />
                  </div>
                  <Shield className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Alertas Ativos</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.activeAlerts}</p>
                    <p className="text-sm text-orange-600 mt-1">Requer atenção</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Recursos AWS</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.resources}</p>
                    <p className="text-sm text-green-600 mt-1">Monitorados</p>
                  </div>
                  <Server className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs Content */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Visão Geral</TabsTrigger>
              <TabsTrigger value="costs">Custos</TabsTrigger>
              <TabsTrigger value="security">Segurança</TabsTrigger>
              <TabsTrigger value="resources">Recursos</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      Status do Sistema
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">AWS Cognito</span>
                        <Badge variant="secondary" className="bg-green-100 text-green-800">Online</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">API Gateway</span>
                        <Badge variant="secondary" className="bg-green-100 text-green-800">Online</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">CloudFront</span>
                        <Badge variant="secondary" className="bg-green-100 text-green-800">Ativo</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">S3 Bucket</span>
                        <Badge variant="secondary" className="bg-green-100 text-green-800">Sincronizado</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-blue-500" />
                      Informações do Usuário
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium text-gray-600">ID do Usuário</p>
                        <p className="text-sm text-gray-900">{user?.id}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600">Email</p>
                        <p className="text-sm text-gray-900">{user?.email}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600">Nome</p>
                        <p className="text-sm text-gray-900">{user?.name || 'Não informado'}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600">Organização</p>
                        <p className="text-sm text-gray-900">{user?.organizationId || 'Padrão'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="costs" className="mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Resumo de Custos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm">EC2 Instances</span>
                          <span className="text-sm font-medium">$1,580</span>
                        </div>
                        <Progress value={65} />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm">RDS Databases</span>
                          <span className="text-sm font-medium">$420</span>
                        </div>
                        <Progress value={17} />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm">S3 Storage</span>
                          <span className="text-sm font-medium">$280</span>
                        </div>
                        <Progress value={11} />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm">Data Transfer</span>
                          <span className="text-sm font-medium">$170</span>
                        </div>
                        <Progress value={7} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Recomendações de Otimização</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="border-l-4 border-green-500 pl-4">
                        <h4 className="font-medium text-green-800">Economia Potencial: $340/mês</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          Redimensionar 3 instâncias EC2 over-provisionadas
                        </p>
                      </div>
                      <div className="border-l-4 border-blue-500 pl-4">
                        <h4 className="font-medium text-blue-800">Reserved Instances</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          Economize até $800/mês com RIs de 1 ano
                        </p>
                      </div>
                      <div className="border-l-4 border-orange-500 pl-4">
                        <h4 className="font-medium text-orange-800">Recursos Órfãos</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          5 volumes EBS não anexados detectados
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="security" className="mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Postura de Segurança</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm">Score Geral</span>
                          <span className="text-sm font-medium">{metrics.securityScore}/100</span>
                        </div>
                        <Progress value={metrics.securityScore} />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm">Compliance</span>
                          <span className="text-sm font-medium">{metrics.compliance}%</span>
                        </div>
                        <Progress value={metrics.compliance} />
                      </div>
                      <div className="pt-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-sm">IAM Policies configuradas</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-sm">Encryption at rest ativo</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-orange-500" />
                          <span className="text-sm">3 Security Groups abertos</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Alertas Recentes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">S3 Bucket público detectado</p>
                          <p className="text-xs text-gray-500">Há 2 horas</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Security Group com acesso 0.0.0.0/0</p>
                          <p className="text-xs text-gray-500">Há 4 horas</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Clock className="h-4 w-4 text-blue-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Certificado SSL expira em 30 dias</p>
                          <p className="text-xs text-gray-500">Há 1 dia</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="resources" className="mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Server className="h-5 w-5" />
                      EC2 Instances
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm">Running</span>
                        <Badge variant="secondary" className="bg-green-100 text-green-800">12</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Stopped</span>
                        <Badge variant="secondary">3</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Total</span>
                        <Badge variant="outline">15</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5" />
                      RDS Databases
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm">Available</span>
                        <Badge variant="secondary" className="bg-green-100 text-green-800">4</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Backup</span>
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">2</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Total</span>
                        <Badge variant="outline">6</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Utilização de Recursos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm">CPU Média</span>
                          <span className="text-sm font-medium">67%</span>
                        </div>
                        <Progress value={67} />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm">Memória</span>
                          <span className="text-sm font-medium">54%</span>
                        </div>
                        <Progress value={54} />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm">Storage</span>
                          <span className="text-sm font-medium">78%</span>
                        </div>
                        <Progress value={78} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}