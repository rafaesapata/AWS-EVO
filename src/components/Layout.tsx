import { ReactNode, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Footer } from "@/components/ui/footer";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { Building2 } from "lucide-react";
import { CloudAccountSelectorCompact } from "@/components/cloud/CloudAccountSelector";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import UserMenu from "@/components/UserMenu";
import SuperAdminOrganizationSwitcher, { getImpersonationState, getEffectiveOrganizationId, getEffectiveOrganizationName } from "@/components/SuperAdminOrganizationSwitcher";

interface LayoutProps {
  children: ReactNode;
  title?: string;
  description?: string;
  icon?: ReactNode;
}

interface User {
  id: string;
  email: string;
  name?: string;
  organizationId?: string;
  organizationName?: string;
}

export function Layout({ children, title, description, icon }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState("");

  const [userRole, setUserRole] = useState<string[]>(['org_user']);

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

  // Load user data and roles synchronously
  useEffect(() => {
    const loadUserAndRoles = async () => {
      try {
        // Try AWS Cognito first (source of truth)
        const currentUser = await cognitoAuth.getCurrentUser();
        
        if (currentUser) {
          const userData = {
            id: currentUser.id,
            email: currentUser.email,
            name: currentUser.name,
            organizationId: currentUser.organizationId,
            organizationName: currentUser.attributes?.['custom:organization_name'] || currentUser.organizationId
          };
          setUser(userData);

          // Load user roles synchronously
          const rolesStr = currentUser.attributes?.['custom:roles'];
          if (rolesStr) {
            try {
              const roles = JSON.parse(rolesStr);
              const roleArray = Array.isArray(roles) ? roles : [roles];
              setUserRole(roleArray);
            } catch {
              setUserRole(['org_user']);
            }
          } else {
            setUserRole(['org_user']);
          }
          return;
        }

        // Fallback to local auth
        const localAuth = localStorage.getItem('evo-auth');
        if (localAuth) {
          const authData = JSON.parse(localAuth);
          if (authData.user) {
            setUser(authData.user);
            // Try to extract roles from stored session
            if (authData.user.attributes?.['custom:roles']) {
              try {
                const roles = JSON.parse(authData.user.attributes['custom:roles']);
                setUserRole(Array.isArray(roles) ? roles : [roles]);
              } catch {
                setUserRole(['org_user']);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error loading user:", error);
      }
    };

    loadUserAndRoles();
  }, []);

  // Set document title when title or description changes
  useEffect(() => {
    if (title && description) {
      document.title = `${title} - ${description}`;
    } else if (title) {
      document.title = `${title} - EVO Platform`;
    } else {
      document.title = "EVO - Plataforma de Análise AWS com IA";
    }
  }, [title, description]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    // Navigation is handled by AppSidebar
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-mesh-subtle dark:bg-mesh-subtle">
        <AppSidebar 
          activeTab={activeTab} 
          onTabChange={handleTabChange} 
          userRole={userRole} 
        />
        
        <div className="flex-1 flex flex-col">
          {/* Header - Glass Effect */}
          <header className="sticky top-0 z-10 glass-card-float border-b-0 rounded-none">
            <div className="w-full px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SidebarTrigger className="-ml-1" />
                  <div className="flex items-center gap-1.5">
                    {icon && (
                      <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 dark:from-gray-600 dark:to-gray-800 flex items-center justify-center shadow-sm">
                        {icon}
                      </div>
                    )}
                    <div>
                      <h1 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                        {title || "EVO Platform"}
                      </h1>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {description || "AWS Cloud Intelligence Platform v3.2"}
                      </p>
                    </div>
                  </div>
                  {user?.organizationId && (
                    userRole.includes('super_admin') ? (
                      <SuperAdminOrganizationSwitcher 
                        currentOrgId={user.organizationId}
                        currentOrgName={user.organizationName}
                      />
                    ) : (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/50 dark:bg-gray-800/50 border border-gray-200/60 dark:border-gray-700/60 backdrop-blur-sm">
                        <Building2 className="h-2.5 w-2.5 text-gray-600 dark:text-gray-400" />
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {user.organizationName || user.organizationId}
                        </span>
                      </div>
                    )
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <CloudAccountSelectorCompact />
                  <LanguageToggle />
                  <ThemeToggle />
                  <UserMenu />
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 w-full px-3 py-3 overflow-auto">
            {children}
          </main>
          
          <Footer variant="minimal" />
        </div>
      </div>
    </SidebarProvider>
  );
}