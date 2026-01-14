import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
import RISavingsPlans from "@/pages/RISavingsPlans";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import evoLogo from "@/assets/evo-logo.png";
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
  Globe
} from "lucide-react";

interface User {
  id: string;
  email: string;
  name?: string;
}

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  
  // Use global account context for multi-account isolation
  const { selectedAccountId } = useCloudAccount();
  const { data: organizationId } = useOrganization();

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
        if (currentUser) {
          setUser({
            id: currentUser.id,
            email: currentUser.email,
            name: currentUser.name
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
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole="admin" />
          
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
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
                          FinOps & Security Intelligence v2.1.0
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
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
              <CostAnalysisPage />
            </main>
            
            {/* Footer */}
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (activeTab === "invoices") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole="admin" />
          
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <header className="glass sticky top-4 z-40 mx-4 rounded-2xl shadow-glass animate-slide-up">
              <div className="px-6 py-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger />
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
                        <FileCheck className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                          Faturas Mensais AWS
                        </h1>
                        <p className="text-muted-foreground text-sm">
                          FinOps & Security Intelligence v2.1.0
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
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
              <MonthlyInvoicesPage />
            </main>
            
            {/* Footer */}
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  // Copilot AI Page
  if (activeTab === "copilot") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole="admin" />
          
          <div className="flex-1 flex flex-col overflow-hidden">
            <header className="glass sticky top-4 z-40 mx-4 rounded-2xl shadow-glass animate-slide-up">
              <div className="px-6 py-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger />
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
                        <Bot className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                          EVO Copilot AI
                        </h1>
                        <p className="text-muted-foreground text-sm">
                          FinOps & Security Intelligence v2.1.0
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
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
              <CopilotAI />
            </main>
            
            {/* Footer */}
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  // Security Posture Page
  if (activeTab === "security") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole="admin" />
          
          <div className="flex-1 flex flex-col overflow-hidden">
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
                          Postura de Segurança
                        </h1>
                        <p className="text-muted-foreground text-sm">
                          FinOps & Security Intelligence v2.1.0
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
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
              <SecurityPosture />
            </main>
            
            {/* Footer */}
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  // Intelligent Alerts Page
  if (activeTab === "alerts") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole="admin" />
          
          <div className="flex-1 flex flex-col overflow-hidden">
            <header className="glass sticky top-4 z-40 mx-4 rounded-2xl shadow-glass animate-slide-up">
              <div className="px-6 py-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger />
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
                        <Bell className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                          Alertas Inteligentes
                        </h1>
                        <p className="text-muted-foreground text-sm">
                          FinOps & Security Intelligence v2.1.0
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
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
              <IntelligentAlerts />
            </main>
            
            {/* Footer */}
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  // Cost Optimization Page
  if (activeTab === "advanced") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole="admin" />
          
          <div className="flex-1 flex flex-col overflow-hidden">
            <header className="glass sticky top-4 z-40 mx-4 rounded-2xl shadow-glass animate-slide-up">
              <div className="px-6 py-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger />
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
                        <Zap className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                          Otimização de Custos
                        </h1>
                        <p className="text-muted-foreground text-sm">
                          FinOps & Security Intelligence v2.1.0
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
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
              <CostOptimization />
            </main>
            
            {/* Footer */}
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  // User Management Page
  if (activeTab === "users") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole="admin" />
          
          <div className="flex-1 flex flex-col overflow-hidden">
            <header className="glass sticky top-4 z-40 mx-4 rounded-2xl shadow-glass animate-slide-up">
              <div className="px-6 py-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger />
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
                        <Users className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                          Gerenciamento de Usuários
                        </h1>
                        <p className="text-muted-foreground text-sm">
                          FinOps & Security Intelligence v2.1.0
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
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
              <UserManagement />
            </main>
            
            {/* Footer */}
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  // Endpoint Monitoring Page
  if (activeTab === "endpoint-monitoring") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole="admin" />
          
          <div className="flex-1 flex flex-col overflow-hidden">
            <header className="glass sticky top-4 z-40 mx-4 rounded-2xl shadow-glass animate-slide-up">
              <div className="px-6 py-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger />
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
                        <Activity className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                          Monitoramento de Endpoints
                        </h1>
                        <p className="text-muted-foreground text-sm">
                          FinOps & Security Intelligence v2.1.0
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
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
              <EndpointMonitoring />
            </main>
            
            {/* Footer */}
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  // Edge Monitoring Page
  if (activeTab === "edge-monitoring") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole="admin" />
          
          <div className="flex-1 flex flex-col overflow-hidden">
            <header className="glass sticky top-4 z-40 mx-4 rounded-2xl shadow-glass animate-slide-up">
              <div className="px-6 py-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger />
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
                        <Globe className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                          Monitoramento de Borda
                        </h1>
                        <p className="text-muted-foreground text-sm">
                          FinOps & Security Intelligence v2.1.0
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
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
              <EdgeMonitoring />
            </main>
            
            {/* Footer */}
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  // Security Scans Page
  if (activeTab === "scans") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole="admin" />
          
          <div className="flex-1 flex flex-col overflow-hidden">
            <header className="glass sticky top-4 z-40 mx-4 rounded-2xl shadow-glass animate-slide-up">
              <div className="px-6 py-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger />
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
                        <Scan className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                          Scans de Segurança
                        </h1>
                        <p className="text-muted-foreground text-sm">
                          FinOps & Security Intelligence v2.1.0
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
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
              <SecurityScans />
            </main>
            
            {/* Footer */}
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  // CloudTrail Audit Page
  if (activeTab === "cloudtrail-audit") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole="admin" />
          
          <div className="flex-1 flex flex-col overflow-hidden">
            <header className="glass sticky top-4 z-40 mx-4 rounded-2xl shadow-glass animate-slide-up">
              <div className="px-6 py-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger />
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
                        <FileText className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                          Auditoria CloudTrail
                        </h1>
                        <p className="text-muted-foreground text-sm">
                          FinOps & Security Intelligence v2.1.0
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
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
              <CloudTrailAudit />
            </main>
            
            {/* Footer */}
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  // Compliance Page
  if (activeTab === "compliance") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole="admin" />
          
          <div className="flex-1 flex flex-col overflow-hidden">
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
                          Compliance & Conformidade
                        </h1>
                        <p className="text-muted-foreground text-sm">
                          FinOps & Security Intelligence v2.1.0
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
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
              <Compliance />
            </main>
            
            {/* Footer */}
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  // RI/Savings Plans Page
  if (activeTab === "risp") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} userRole="admin" />
          
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
                          RI & Savings Plans
                        </h1>
                        <p className="text-muted-foreground text-sm">
                          FinOps & Security Intelligence v2.1.0
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
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
              <RISavingsPlans />
            </main>
            
            {/* Footer */}
            <Footer variant="minimal" />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full animated-gradient">
        <AppSidebar activeTab={activeTab === "overview" ? "executive" : activeTab} onTabChange={setActiveTab} userRole="admin" />
        
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
                        FinOps & Security Intelligence v2.1.0
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
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
                        🎉 Sistema Funcionando Perfeitamente!
                      </h2>
                      <p className="text-muted-foreground mb-4">
                        Plataforma de FinOps & Security Intelligence totalmente operacional
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>Frontend: 100% AWS</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>Autenticação: AWS Cognito</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>API: AWS API Gateway</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>Deploy: S3 + CloudFront</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
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

            {/* Tabs Content */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="glass mb-6">
                <TabsTrigger value="overview">Visão Geral</TabsTrigger>
                <TabsTrigger value="modules">Módulos</TabsTrigger>
                <TabsTrigger value="security">Segurança</TabsTrigger>
                <TabsTrigger value="finops">FinOps</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                {/* User Info */}
                <Card className="glass border-primary/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      Informações do Usuário
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">ID do Usuário</p>
                        <p className="text-sm font-mono bg-muted px-2 py-1 rounded">{user?.id}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Email</p>
                        <p className="text-sm">{user?.email}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Nome</p>
                        <p className="text-sm">{user?.name || 'Não informado'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* System Status */}
                <Card className="glass border-primary/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-success" />
                      Status do Sistema
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-success/10 border border-success/20">
                        <span className="text-sm">AWS Cognito</span>
                        <Badge variant="secondary" className="bg-success/20 text-success">Online</Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-success/10 border border-success/20">
                        <span className="text-sm">API Gateway</span>
                        <Badge variant="secondary" className="bg-success/20 text-success">Online</Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-success/10 border border-success/20">
                        <span className="text-sm">CloudFront</span>
                        <Badge variant="secondary" className="bg-success/20 text-success">Ativo</Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-success/10 border border-success/20">
                        <span className="text-sm">S3 Bucket</span>
                        <Badge variant="secondary" className="bg-success/20 text-success">Sync</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="modules" className="space-y-6">
                {/* Core Modules */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    Módulos Principais
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Button 
                      variant="outline" 
                      className="h-24 flex flex-col items-center justify-center glass hover-glow"
                      onClick={() => navigate('/dashboard')}
                    >
                      <BarChart3 className="h-8 w-8 text-primary mb-2" />
                      <span className="text-sm font-medium">Dashboard Principal</span>
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="h-24 flex flex-col items-center justify-center glass hover-glow"
                      onClick={() => navigate('/system-monitoring')}
                    >
                      <Server className="h-8 w-8 text-primary mb-2" />
                      <span className="text-sm font-medium">Monitoramento</span>
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="h-24 flex flex-col items-center justify-center glass hover-glow"
                      onClick={() => navigate('/resource-monitoring')}
                    >
                      <Database className="h-8 w-8 text-primary mb-2" />
                      <span className="text-sm font-medium">Recursos AWS</span>
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="h-24 flex flex-col items-center justify-center glass hover-glow"
                      onClick={() => navigate('/aws-settings')}
                    >
                      <Settings className="h-8 w-8 text-primary mb-2" />
                      <span className="text-sm font-medium">Config AWS</span>
                    </Button>
                  </div>
                </div>

                {/* Security Modules */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Segurança & Detecção
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Button 
                      variant="outline" 
                      className="h-24 flex flex-col items-center justify-center glass hover-glow"
                      onClick={() => navigate('/threat-detection')}
                    >
                      <Shield className="h-8 w-8 text-primary mb-2" />
                      <span className="text-sm font-medium">Threat Detection</span>
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="h-24 flex flex-col items-center justify-center glass hover-glow"
                      onClick={() => navigate('/attack-detection')}
                    >
                      <AlertTriangle className="h-8 w-8 text-primary mb-2" />
                      <span className="text-sm font-medium">Attack Detection</span>
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="h-24 flex flex-col items-center justify-center glass hover-glow"
                      onClick={() => navigate('/anomaly-detection')}
                    >
                      <TrendingUp className="h-8 w-8 text-primary mb-2" />
                      <span className="text-sm font-medium">Anomaly Detection</span>
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="h-24 flex flex-col items-center justify-center glass hover-glow"
                      onClick={() => navigate('/predictive-incidents')}
                    >
                      <Brain className="h-8 w-8 text-primary mb-2" />
                      <span className="text-sm font-medium">Predictive Incidents</span>
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="security" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="glass border-primary/20">
                    <CardHeader>
                      <CardTitle>Postura de Segurança</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm">Score Geral</span>
                            <span className="text-sm font-medium">
                              {metricsLoading ? (
                                <Skeleton className="h-4 w-12" />
                              ) : (
                                `${dashboardMetrics?.securityScore || 0}/100`
                              )}
                            </span>
                          </div>
                          <Progress value={dashboardMetrics?.securityScore || 0} />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm">Compliance</span>
                            <span className="text-sm font-medium">
                              {metricsLoading ? (
                                <Skeleton className="h-4 w-8" />
                              ) : (
                                `${Math.min(100, (dashboardMetrics?.securityScore || 0) + 10)}%`
                              )}
                            </span>
                          </div>
                          <Progress value={Math.min(100, (dashboardMetrics?.securityScore || 0) + 10)} />
                        </div>
                        <div className="pt-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-success" />
                            <span className="text-sm">IAM Policies configuradas</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-success" />
                            <span className="text-sm">Encryption at rest ativo</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-warning" />
                            <span className="text-sm">3 Security Groups abertos</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="glass border-primary/20">
                    <CardHeader>
                      <CardTitle>Alertas Recentes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                          <div>
                            <p className="text-sm font-medium">S3 Bucket público detectado</p>
                            <p className="text-xs text-muted-foreground">Há 2 horas</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/20">
                          <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                          <div>
                            <p className="text-sm font-medium">Security Group com acesso 0.0.0.0/0</p>
                            <p className="text-xs text-muted-foreground">Há 4 horas</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                          <Clock className="h-4 w-4 text-primary mt-0.5" />
                          <div>
                            <p className="text-sm font-medium">Certificado SSL expira em 30 dias</p>
                            <p className="text-xs text-muted-foreground">Há 1 dia</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="finops" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Card className="glass border-primary/20">
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

                  <Card className="lg:col-span-2 glass border-primary/20">
                    <CardHeader>
                      <CardTitle>Recomendações de Otimização</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="border-l-4 border-success pl-4 p-3 rounded-r-lg bg-success/10">
                          <h4 className="font-medium text-sm text-success">Economia Potencial: $340/mês</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            Redimensionar 3 instâncias EC2 over-provisionadas
                          </p>
                        </div>
                        <div className="border-l-4 border-primary pl-4 p-3 rounded-r-lg bg-primary/10">
                          <h4 className="font-medium text-sm text-primary">Reserved Instances</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            Economize até $800/mês com RIs de 1 ano
                          </p>
                        </div>
                        <div className="border-l-4 border-warning pl-4 p-3 rounded-r-lg bg-warning/10">
                          <h4 className="font-medium text-sm text-warning">Recursos Órfãos</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            5 volumes EBS não anexados detectados
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </main>
          
          {/* Footer */}
          <Footer />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Index;