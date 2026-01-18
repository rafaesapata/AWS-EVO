import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { Layout } from "@/components/Layout";
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
import TVDashboardManagement from "@/pages/TVDashboardManagement";
import ExecutiveDashboardV2 from "@/components/dashboard/ExecutiveDashboard";
import AuditLog from "@/components/admin/AuditLog";
import { 
  Shield, 
  DollarSign, 
  FileCheck,
  BarChart3,
  Tv
} from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    return searchParams.get('tab') || "overview";
  });

  // Update activeTab when URL changes
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check local auth first
        const localAuth = localStorage.getItem('evo-auth');
        if (localAuth) {
          const authData = JSON.parse(localAuth);
          if (Date.now() - authData.timestamp < 24 * 60 * 60 * 1000) {
            setIsLoading(false);
            return;
          }
        }

        // Try AWS Cognito
        const currentUser = await cognitoAuth.getCurrentUser();
        if (!currentUser) {
          navigate("/");
        }
      } catch (error) {
        console.error("Error checking auth:", error);
        navigate("/");
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [navigate]);

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

  // Pages that already have their own Layout - render directly
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

  if (activeTab === "endpoint-monitoring") {
    return <EndpointMonitoring />;
  }

  if (activeTab === "edge-monitoring") {
    return <EdgeMonitoring />;
  }

  if (activeTab === "waste") {
    return <MLWasteDetection />;
  }

  // Pages that need Layout wrapper - embedded content
  if (activeTab === "cost-analysis") {
    return (
      <Layout
        title={t('sidebar.detailedAnalysis', 'Análise Detalhada de Custos')}
        description={t('costAnalysis.description', 'Custos diários, tendências e previsões AWS')}
        icon={<DollarSign className="h-4 w-4" />}
      >
        <CostAnalysisPage embedded />
      </Layout>
    );
  }

  if (activeTab === "audit") {
    return (
      <Layout
        title={t('sidebar.audit', 'Log de Auditoria')}
        description={t('auditLog.description', 'Histórico de ações e eventos do sistema')}
        icon={<FileCheck className="h-4 w-4" />}
      >
        <AuditLog />
      </Layout>
    );
  }

  if (activeTab === "tv-dashboards") {
    return (
      <Layout
        title={t('sidebar.tvDashboards', 'TV Dashboards')}
        description={t('tvDashboard.managementDesc', 'Gerencie links de acesso para exibição em TVs')}
        icon={<Tv className="h-4 w-4" />}
      >
        <TVDashboardManagement />
      </Layout>
    );
  }

  if (activeTab === "security-analysis") {
    return (
      <Layout
        title={t('sidebar.securityScan', 'Análise de Segurança AWS')}
        description={t('securityScan.description', 'Verificação abrangente de vulnerabilidades e configurações')}
        icon={<Shield className="h-4 w-4" />}
      >
        <SecurityAnalysisContent />
      </Layout>
    );
  }

  // Executive Dashboard - Default view
  return (
    <Layout
      title={t('executiveDashboard.title', 'Dashboard Executivo')}
      description={t('executiveDashboard.description', 'Visão consolidada de segurança, custos e compliance')}
      icon={<BarChart3 className="h-4 w-4" />}
    >
      <ExecutiveDashboardV2 />
    </Layout>
  );
};

export default Index;
