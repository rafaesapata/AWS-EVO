import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Footer } from "@/components/ui/footer";
import { CostAnalysisPage } from "@/pages/CostAnalysisPage";
import { MonthlyInvoicesPage } from "@/pages/MonthlyInvoicesPage";
import CopilotAI from "@/pages/CopilotAI";
import SecurityPosture from "@/pages/SecurityPosture";
import IntelligentAlerts from "@/pages/IntelligentAlerts";
import CostOptimization from "@/pages/CostOptimization";
import UserManagement from "@/pages/UserManagement";
import EndpointMonitoring from "@/pages/EndpointMonitoring";
import EdgeMonitoring from "@/pages/EdgeMonitoring";
import SecurityScans from "@/pages/SecurityScans";
import CloudTrailAudit from "@/pages/CloudTrailAudit";
import Compliance from "@/pages/Compliance";
import SecurityAnalysisContent from "@/components/dashboard/SecurityAnalysisContent";
import RISavingsPlans from "@/pages/RISavingsPlans";
import MLWasteDetection from "@/pages/MLWasteDetection";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { AwsAccountSelector } from "@/components/AwsAccountSelector";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import UserMenu from "@/components/UserMenu";
import { 
  Shield, 
  TrendingUp, 
  DollarSign, 
  Server, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  Database,
  Zap,
  Brain,
  FileCheck,
  Building2,
  BarChart3,
  Settings,
  BookOpen,
  MessageSquare,
  Key,
  TestTube,
  Bot,
  Bell,
  Activity,
  Globe,
  Cloud
} from "lucide-react";

interface User {
  id: string;
  email: string;
  name?: string;
  organizationId?: string;
  organizationName?: string;
}

const Index = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    return searchParams.get('tab') || "overview";
  });
  
  // Use global account context for multi-account isolation
  const { selectedAccountId } = useAwsAccount();
  const { data: organizationId } = useOrganization();

  // Fetch user role from Cognito token (custom:roles attribute)
  const { data: userRole } = useQuery({
    queryKey: ['user-role'],
    queryFn: async () => {
      const currentUser = await cognitoAuth.getCurrentUser();
      if (!currentUser) return ['org_user'];

      // Get roles from Cognito token attributes
      const rolesStr = currentUser.attributes?.['custom:roles'];
      if (!rolesStr) return ['org_user'];

      try {
        const roles = JSON.parse(rolesStr);
        return Array.isArray(roles) ? roles : [roles];
      } catch {
        return ['org_user'];
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // Update activeTab when URL changes
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        // Check local auth first
        const localAuth = localStorage.getItem('evo-auth');
        if (localAuth) {
          const authData = JSON.parse(localAuth);
          if (Date.now() - authData.timestamp < 24 * 60 * 60 * 1000) {
            setUser(authData.user);
            setIsLoading(false);
            return;
          }
        }

        // Try AWS Cognito
        const currentUser = await cognitoAuth.getCurrentUser();
        console.log('🔍 Index: getCurrentUser result:', currentUser);
        if (currentUser) {
          console.log('✅ Index: User loaded:', {
            id: currentUser.id,
            email: currentUser.email,
            organizationId: currentUser.organizationId,
            organizationName: currentUser.attributes?.['custom:organization_name']
          });
          setUser({
            id: currentUser.id,
            email: currentUser.email,
            name: currentUser.name,
            organizationId: currentUser.organizationId,
            organizationName: currentUser.attributes?.['custom:organization_name'] || currentUser.organizationId
          });
        } else {
          navigate("/");
        }
      } catch (error) {
        console.error("Error loading user:", error);
        navigate("/");
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, [navigate]);

  // Get dashboard metrics from AWS API
  const { data: dashboardMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['dashboard-metrics', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    queryFn: async () => {
      // Get current month costs
      const currentDate = new Date();
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      
      const costsResponse = await apiClient.select('daily_costs', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId
        },
        gte: { cost_date: startOfMonth.toISOString().split('T')[0] },
        lte: { cost_date: currentDate.toISOString().split('T')[0] }
      });

      // Get security alerts
      const alertsResponse = await apiClient.select('security_alerts', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId,
          is_resolved: false
        }
      });

      // Get AWS resources count
      const resourcesResponse = await apiClient.select('aws_resources', {
        select: 'count',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId
        }
      });

      // Calculate metrics
      const costs = costsResponse.data || [];
      const totalCost = costs.reduce((sum, cost) => sum + Number(cost.total_cost), 0);
      const totalCredits = costs.reduce((sum, cost) => sum + Number(cost.credits_used || 0), 0);
      
      // Calculate security score (simplified)
      const alerts = alertsResponse.data || [];
      const criticalAlerts = alerts.filter(alert => alert.severity === 'critical').length;
      const highAlerts = alerts.filter(alert => alert.severity === 'high').length;
      const securityScore = Math.max(0, 100 - (criticalAlerts * 20) - (highAlerts * 10));

      return {
        monthlyCost: totalCost,
        monthlyCredits: totalCredits,
        securityScore,
        activeAlerts: alerts.length,
        awsResources: resourcesResponse.data?.[0]?.count || 0
      };
    },
  });

  const handleSignOut = async () => {
    try {
      localStorage.removeItem('evo-auth');
      await cognitoAuth.signOut();
      navigate("/");
    } catch (error) {
      navigate("/");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen animated-gradient flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando sistema...</p>
        </div>
      </div>
    );
  }

  // Render dedicated pages for specific tabs
  if (activeTab === "cost-analysis") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole={userRole} />
          
          <div className="flex-1 flex flex-col overflow-hidden">
            <header className="glass sticky top-4 z-40 mx-4 rounded-2xl shadow-glass animate-slide-up">
              <div className="px-6 py-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger />
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
                        <DollarSign className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                          Análise Detalhada de Custos
                        </h1>
                        <p className="text-muted-foreground text-sm">
                          AWS Cloud Intelligence Platform v3.2-test
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {/* AWS Account Selector */}
                    <AwsAccountSelector compact />
                    
                    {user?.organizationId && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
                        <Building2 className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-primary">
                          {user.organizationName || user.organizationId}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 px-4 py-2 rounded-lg glass">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">
                        {user?.name || user?.email}
                      </span>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleSignOut}
                      className="glass hover:shadow-elegant"
                    >
                      Sair
                    </Button>
                  </div>
                </div>
              </div>
            </header>

            <main className="flex-1 p-6 overflow-auto">
              <CostAnalysisPage />
            </main>
            
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  // Handle other tabs
  if (activeTab === "invoices") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole={userRole} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <main className="flex-1 p-6 overflow-auto">
              <MonthlyInvoicesPage />
            </main>
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (activeTab === "copilot") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole={userRole} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <main className="flex-1 p-6 overflow-auto">
              <CopilotAI />
            </main>
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (activeTab === "security") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole={userRole} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <main className="flex-1 p-6 overflow-auto">
              <SecurityPosture />
            </main>
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (activeTab === "alerts") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole={userRole} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <main className="flex-1 p-6 overflow-auto">
              <IntelligentAlerts />
            </main>
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (activeTab === "advanced") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole={userRole} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <main className="flex-1 p-6 overflow-auto">
              <CostOptimization />
            </main>
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (activeTab === "risp") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole={userRole} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <main className="flex-1 p-6 overflow-auto">
              <RISavingsPlans />
            </main>
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (activeTab === "users") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole={userRole} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <main className="flex-1 p-6 overflow-auto">
              <UserManagement />
            </main>
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (activeTab === "scans") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole={userRole} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <main className="flex-1 p-6 overflow-auto">
              <SecurityScans />
            </main>
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (activeTab === "cloudtrail-audit") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole={userRole} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <main className="flex-1 p-6 overflow-auto">
              <CloudTrailAudit />
            </main>
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (activeTab === "compliance") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole={userRole} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <main className="flex-1 p-6 overflow-auto">
              <Compliance />
            </main>
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (activeTab === "endpoint-monitoring") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole={userRole} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <main className="flex-1 p-6 overflow-auto">
              <EndpointMonitoring />
            </main>
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (activeTab === "edge-monitoring") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole={userRole} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <main className="flex-1 p-6 overflow-auto">
              <EdgeMonitoring />
            </main>
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (activeTab === "security-analysis") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-gradient-subtle">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole={userRole} />
          <div className="flex-1 flex flex-col">
            {/* Header - Padrão Visual Consistente */}
            <header className="sticky top-0 z-10 glass border-b border-border/40 shadow-elegant">
              <div className="w-full px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger className="-ml-1" />
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow">
                        <Shield className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                          Análise de Segurança AWS
                        </h1>
                        <p className="text-sm text-muted-foreground">
                          Verificação abrangente de vulnerabilidades e configurações
                        </p>
                      </div>
                    </div>
                    {user?.organizationId && (
                      <div className="flex items-center gap-2 px-4 py-2 rounded-lg glass">
                        <Building2 className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">
                          {user.organizationName || user.organizationId}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <AwsAccountSelector />
                    <LanguageToggle />
                    <ThemeToggle />
                    <UserMenu />
                  </div>
                </div>
              </div>
            </header>
            <main className="flex-1 w-full px-6 py-6 overflow-auto">
              <SecurityAnalysisContent />
            </main>
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (activeTab === "waste") {
    return <MLWasteDetection />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full animated-gradient">
        <AppSidebar activeTab={activeTab === "overview" ? "executive" : activeTab} onTabChange={setActiveTab} userRole={userRole} />
        
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="glass sticky top-4 z-40 mx-4 rounded-2xl shadow-glass animate-slide-up">
            <div className="px-6 py-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <SidebarTrigger />
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
                      <Shield className="h-7 w-7 text-white" />
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                        EVO Platform
                      </h1>
                      <p className="text-muted-foreground text-sm">
                        AWS Cloud Intelligence Platform v3.2-test
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  {/* AWS Account Selector */}
                  <AwsAccountSelector compact />
                  
                  {user?.organizationId && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-primary">
                        {user.organizationName || user.organizationId}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg glass">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">
                      {user?.name || user?.email}
                    </span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleSignOut}
                    className="glass hover:shadow-elegant"
                  >
                    Sair
                  </Button>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 p-6 overflow-auto">
            {/* Welcome Section */}
            <div className="mb-8">
              <Card className="glass border-primary/20 shadow-elegant">
                <CardContent className="p-8">
                  <div className="flex items-center gap-6">
                    <div className="h-20 w-20 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow">
                      <CheckCircle className="h-10 w-10 text-white" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                        🚀 Sistema Totalmente Operacional!
                      </h2>
                      <p className="text-muted-foreground mb-4">
                        Plataforma AWS Cloud Intelligence com todas as funcionalidades ativas
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>Frontend: CloudFront + S3</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>Auth: AWS Cognito</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>API: Lambda + API Gateway</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>DB: RDS PostgreSQL</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Access Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Button 
                variant="outline" 
                className="h-32 flex flex-col items-center justify-center glass hover-glow p-6"
                onClick={() => navigate('/aws-settings')}
              >
                <Cloud className="h-12 w-12 text-primary mb-3" />
                <span className="text-lg font-semibold">Configurações AWS</span>
                <span className="text-sm text-muted-foreground">Conectar contas e configurar</span>
              </Button>
              
              <Button 
                variant="outline" 
                className="h-32 flex flex-col items-center justify-center glass hover-glow p-6"
                onClick={() => navigate('/dashboard')}
              >
                <BarChart3 className="h-12 w-12 text-primary mb-3" />
                <span className="text-lg font-semibold">Dashboard</span>
                <span className="text-sm text-muted-foreground">Visão geral executiva</span>
              </Button>
              
              <Button 
                variant="outline" 
                className="h-32 flex flex-col items-center justify-center glass hover-glow p-6"
                onClick={() => navigate('/system-monitoring')}
              >
                <Activity className="h-12 w-12 text-primary mb-3" />
                <span className="text-lg font-semibold">Monitoramento</span>
                <span className="text-sm text-muted-foreground">Recursos e performance</span>
              </Button>
              
              <Button 
                variant="outline" 
                className="h-32 flex flex-col items-center justify-center glass hover-glow p-6"
                onClick={() => navigate('/threat-detection')}
              >
                <Shield className="h-12 w-12 text-primary mb-3" />
                <span className="text-lg font-semibold">Segurança</span>
                <span className="text-sm text-muted-foreground">Detecção de ameaças</span>
              </Button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Card className="glass border-primary/20 hover-glow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Custo Mensal</p>
                      {metricsLoading ? (
                        <Skeleton className="h-8 w-20 mb-1" />
                      ) : (
                        <p className="text-2xl font-bold">
                          ${dashboardMetrics?.monthlyCost?.toFixed(2) || '0.00'}
                        </p>
                      )}
                      <div className="flex items-center mt-1">
                        <TrendingUp className="h-4 w-4 text-success mr-1" />
                        <span className="text-sm text-success">
                          {dashboardMetrics?.monthlyCredits ? 
                            `${((dashboardMetrics.monthlyCredits / dashboardMetrics.monthlyCost) * 100).toFixed(1)}% créditos` : 
                            'Sem créditos'
                          }
                        </span>
                      </div>
                    </div>
                    <div className="h-12 w-12 rounded-lg bg-gradient-primary flex items-center justify-center">
                      <DollarSign className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass border-primary/20 hover-glow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Security Score</p>
                      {metricsLoading ? (
                        <Skeleton className="h-8 w-16 mb-2" />
                      ) : (
                        <p className="text-2xl font-bold">
                          {dashboardMetrics?.securityScore || 0}/100
                        </p>
                      )}
                      <Progress value={dashboardMetrics?.securityScore || 0} className="mt-2" />
                    </div>
                    <div className="h-12 w-12 rounded-lg bg-gradient-primary flex items-center justify-center">
                      <Shield className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass border-primary/20 hover-glow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Alertas Ativos</p>
                      {metricsLoading ? (
                        <Skeleton className="h-8 w-8 mb-1" />
                      ) : (
                        <p className="text-2xl font-bold">
                          {dashboardMetrics?.activeAlerts || 0}
                        </p>
                      )}
                      <p className="text-sm text-warning mt-1">
                        {(dashboardMetrics?.activeAlerts || 0) > 0 ? 'Requer atenção' : 'Tudo OK'}
                      </p>
                    </div>
                    <div className="h-12 w-12 rounded-lg bg-gradient-primary flex items-center justify-center">
                      <AlertTriangle className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass border-primary/20 hover-glow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Recursos AWS</p>
                      {metricsLoading ? (
                        <Skeleton className="h-8 w-12 mb-1" />
                      ) : (
                        <p className="text-2xl font-bold">
                          {dashboardMetrics?.awsResources || 0}
                        </p>
                      )}
                      <p className="text-sm text-success mt-1">Monitorados</p>
                    </div>
                    <div className="h-12 w-12 rounded-lg bg-gradient-primary flex items-center justify-center">
                      <Server className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* System Status */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-success" />
                  Status do Sistema AWS
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-success/10 border border-success/20">
                    <span className="text-sm">CloudFront CDN</span>
                    <Badge variant="secondary" className="bg-success/20 text-success">Online</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-success/10 border border-success/20">
                    <span className="text-sm">API Gateway</span>
                    <Badge variant="secondary" className="bg-success/20 text-success">Ativo</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-success/10 border border-success/20">
                    <span className="text-sm">RDS Database</span>
                    <Badge variant="secondary" className="bg-success/20 text-success">Conectado</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-success/10 border border-success/20">
                    <span className="text-sm">Cognito Auth</span>
                    <Badge variant="secondary" className="bg-success/20 text-success">Funcionando</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </main>
          
          <Footer variant="minimal" />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Index;