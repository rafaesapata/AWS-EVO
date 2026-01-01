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
import ExecutiveDashboardV2 from "@/components/dashboard/ExecutiveDashboard";
import AuditLog from "@/components/admin/AuditLog";
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
      console.log('🔐 Index: getCurrentUser for roles:', currentUser);
      if (!currentUser) return ['org_user'];

      // Get roles from Cognito token attributes
      const rolesStr = currentUser.attributes?.['custom:roles'];
      console.log('🔐 Index: rolesStr from token:', rolesStr);
      if (!rolesStr) return ['org_user'];

      try {
        const roles = JSON.parse(rolesStr);
        console.log('🔐 Index: parsed roles:', roles);
        return Array.isArray(roles) ? roles : [roles];
      } catch (e) {
        console.error('🔐 Index: Failed to parse roles:', e);
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
                        <DollarSign className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                          Análise Detalhada de Custos
                        </h1>
                        <p className="text-sm text-muted-foreground">
                          Custos diários, tendências e previsões AWS
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
              <CostAnalysisPage />
            </main>
            
            <Footer />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  // Handle other tabs
  if (activeTab === "invoices") {
    return <MonthlyInvoicesPage />;
  }

  if (activeTab === "copilot") {
    return <CopilotAI />;
  }

  if (activeTab === "security") {
    return <SecurityPosture />;
  }

  if (activeTab === "alerts") {
    return <IntelligentAlerts />;
  }

  if (activeTab === "advanced") {
    return <CostOptimization />;
  }

  if (activeTab === "risp") {
    return <RISavingsPlans />;
  }

  if (activeTab === "users") {
    return <UserManagement />;
  }

  if (activeTab === "scans") {
    return <SecurityScans />;
  }

  if (activeTab === "cloudtrail-audit") {
    return <CloudTrailAudit />;
  }

  if (activeTab === "compliance") {
    return <Compliance />;
  }

  if (activeTab === "audit") {
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
                        <FileCheck className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                          Log de Auditoria
                        </h1>
                        <p className="text-sm text-muted-foreground">
                          Histórico de ações e eventos do sistema
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
              <AuditLog />
            </main>
            <Footer />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (activeTab === "endpoint-monitoring") {
    return <EndpointMonitoring />;
  }

  if (activeTab === "edge-monitoring") {
    return <EdgeMonitoring />;
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
            <Footer />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (activeTab === "waste") {
    return <MLWasteDetection />;
  }

  // Executive Dashboard - New v2 design
  if (activeTab === "executive" || activeTab === "overview") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-gradient-subtle">
          <AppSidebar activeTab="executive" onTabChange={setActiveTab} userRole={userRole} />
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-10 glass border-b border-border/40 shadow-elegant">
              <div className="w-full px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger className="-ml-1" />
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow">
                        <BarChart3 className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                          Dashboard Executivo
                        </h1>
                        <p className="text-sm text-muted-foreground">
                          Visão consolidada de segurança, custos e compliance
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
              <ExecutiveDashboardV2 />
            </main>
            <Footer />
          </div>
        </div>
      </SidebarProvider>
    );
  }

  // Fallback - render Executive Dashboard for any unhandled tab
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-subtle">
        <AppSidebar activeTab="executive" onTabChange={setActiveTab} userRole={userRole} />
        <div className="flex-1 flex flex-col">
          {/* Header */}
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
                        EVO Platform
                      </h1>
                      <p className="text-sm text-muted-foreground">
                        AWS Cloud Intelligence Platform v3.2
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
            <ExecutiveDashboardV2 />
          </main>
          <Footer />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Index;