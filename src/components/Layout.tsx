import { ReactNode, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Footer } from "@/components/ui/footer";
import { Button } from "@/components/ui/button";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { Users, Building2 } from "lucide-react";
import { AwsAccountSelector } from "@/components/AwsAccountSelector";

interface LayoutProps {
  children: ReactNode;
  title?: string;
  description?: string;
  icon?: ReactNode;
  userRole?: string | string[];
}

interface User {
  id: string;
  email: string;
  name?: string;
  organizationId?: string;
  organizationName?: string;
}

export function Layout({ children, title, description, icon, userRole = "admin" }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState("");

  // Determine active tab based on current route
  useEffect(() => {
    const path = location.pathname;
    const searchParams = new URLSearchParams(location.search);
    const tab = searchParams.get('tab');
    
    if (tab) {
      setActiveTab(tab);
    } else if (path === '/app') {
      setActiveTab('executive');
    } else if (path === '/copilot-ai') {
      setActiveTab('copilot');
    } else if (path === '/security-posture') {
      setActiveTab('security');
    } else if (path === '/intelligent-alerts') {
      setActiveTab('alerts');
    } else if (path === '/cost-optimization') {
      setActiveTab('advanced');
    } else if (path === '/ri-savings-plans') {
      setActiveTab('risp');
    } else if (path === '/security-scans') {
      setActiveTab('scans');
    } else if (path === '/cloudtrail-audit') {
      setActiveTab('cloudtrail-audit');
    } else if (path === '/compliance') {
      setActiveTab('compliance');
    } else if (path === '/endpoint-monitoring') {
      setActiveTab('endpoint-monitoring');
    } else if (path === '/edge-monitoring') {
      setActiveTab('edge-monitoring');
    } else if (path === '/predictive-incidents') {
      setActiveTab('ml');
    } else if (path === '/anomaly-detection') {
      setActiveTab('anomalies');
    } else if (path === '/ml-waste-detection') {
      setActiveTab('waste');
    } else if (path === '/resource-monitoring') {
      setActiveTab('resource-monitoring');
    } else if (path === '/attack-detection') {
      setActiveTab('attack-detection');
    } else if (path === '/aws-settings') {
      setActiveTab('aws-settings');
    } else if (path === '/knowledge-base') {
      setActiveTab('knowledge-base');
    } else if (path === '/communication-center') {
      setActiveTab('communication-center');
    } else if (path === '/license-management') {
      setActiveTab('license');
    } else if (path === '/background-jobs') {
      setActiveTab('scheduled-jobs');
    } else if (path === '/bedrock-test') {
      setActiveTab('devtools');
    } else if (path === '/well-architected') {
      setActiveTab('well-architected');
    } else if (path === '/tv') {
      setActiveTab('tv-dashboards');
    } else {
      setActiveTab('executive');
    }
  }, [location]);

  // Load user data
  useEffect(() => {
    const loadUser = async () => {
      console.log('🔄 Layout: Loading user data...');
      try {
        // Try AWS Cognito first (source of truth)
        const currentUser = await cognitoAuth.getCurrentUser();
        console.log('🔍 Layout: getCurrentUser result:', currentUser);
        
        if (currentUser) {
          console.log('✅ Layout: User loaded from Cognito:', {
            id: currentUser.id,
            email: currentUser.email,
            organizationId: currentUser.organizationId,
            organizationName: currentUser.attributes?.['custom:organization_name'],
            allAttributes: currentUser.attributes
          });
          
          const userData = {
            id: currentUser.id,
            email: currentUser.email,
            name: currentUser.name,
            organizationId: currentUser.organizationId,
            organizationName: currentUser.attributes?.['custom:organization_name'] || currentUser.organizationId
          };
          console.log('📝 Layout: Setting user state:', userData);
          setUser(userData);
          return;
        }

        console.log('⚠️ Layout: No Cognito user, checking localStorage...');
        // Fallback to local auth
        const localAuth = localStorage.getItem('evo-auth');
        if (localAuth) {
          const authData = JSON.parse(localAuth);
          console.log('📦 Layout: localStorage auth data:', authData);
          if (authData.user) {
            setUser(authData.user);
          }
        } else {
          console.log('❌ Layout: No auth data found');
        }
      } catch (error) {
        console.error("❌ Layout: Error loading user:", error);
      }
    };

    loadUser();
  }, []);

  const handleSignOut = async () => {
    try {
      localStorage.removeItem('evo-auth');
      await cognitoAuth.signOut();
      navigate("/");
    } catch (error) {
      navigate("/");
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    // Navigation is handled by AppSidebar
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full animated-gradient">
        <AppSidebar 
          activeTab={activeTab} 
          onTabChange={handleTabChange} 
          userRole={userRole} 
        />
        
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="glass sticky top-4 z-40 mx-4 rounded-2xl shadow-glass animate-slide-up">
            <div className="px-6 py-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <SidebarTrigger />
                  <div className="flex items-center gap-3">
                    {icon && (
                      <div className="h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
                        {icon}
                      </div>
                    )}
                    <div>
                      <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                        {title || "EVO UDS Platform"}
                      </h1>
                      <p className="text-muted-foreground text-sm">
                        {description || "AWS Cloud Intelligence Platform v3.1-debug"}
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
                      {user?.name || user?.email || "Usuário"}
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
            {children}
          </main>
          
          <Footer variant="minimal" />
        </div>
      </div>
    </SidebarProvider>
  );
}