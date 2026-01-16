import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Footer } from "@/components/ui/footer";
import { CloudAccountSelectorCompact } from "@/components/cloud/CloudAccountSelector";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import UserMenu from "@/components/UserMenu";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Building2, LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface PageLayoutProps {
  children: ReactNode;
  activeTab: string;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  iconColorClass?: string;
  headerActions?: ReactNode;
  showCloudAccountSelector?: boolean;
  showOrganization?: boolean;
  badge?: {
    text: string;
    variant?: "default" | "secondary" | "destructive" | "outline";
    icon?: LucideIcon;
  };
}

export function PageLayout({
  children,
  activeTab,
  title,
  subtitle = "AWS Cloud Intelligence Platform v3.2",
  icon: Icon,
  iconColorClass = "text-white",
  headerActions,
  showCloudAccountSelector = true,
  showOrganization = true,
  badge,
}: PageLayoutProps) {
  const navigate = useNavigate();

  const { data: userProfile } = useQuery({
    queryKey: ['user-profile-layout'],
    queryFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) return null;

      const profile = await apiClient.select('profiles', {
        select: '*, organizations:organization_id(*)',
        eq: { id: user.username },
        limit: 1
      });

      // Get roles from Cognito token attributes instead of database
      const rolesStr = user.attributes?.['custom:roles'];
      let roles: string[] = ['org_user'];
      if (rolesStr) {
        try {
          const parsed = JSON.parse(rolesStr);
          roles = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          roles = ['org_user'];
        }
      }

      return {
        ...profile.data?.[0],
        roles
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const userRole = userProfile?.roles || ['org_user'];

  const handleTabChange = (tab: string) => {
    // Navigation is handled by AppSidebar
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar activeTab={activeTab} onTabChange={handleTabChange} userRole={userRole} />
        
        <div className="flex-1 flex flex-col">
          {/* Header Padrão */}
          <header className="sticky top-0 z-10  border-b border-border/40 shadow-sm">
            <div className="w-full px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <SidebarTrigger className="-ml-1" />
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow">
                      <Icon className={`h-6 w-6 ${iconColorClass}`} />
                    </div>
                    <div>
                      <h1 className="text-2xl font-semibold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                        {title}
                      </h1>
                      <p className="text-sm text-muted-foreground">
                        {subtitle}
                      </p>
                    </div>
                  </div>
                  {showOrganization && userProfile?.organizations && (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-lg ">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">
                        {(() => {
                          if (!userProfile || !userProfile.organizations) return 'Organização';
                          const orgs = userProfile.organizations as any;
                          return orgs.name || 'Organização';
                        })()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {showCloudAccountSelector && <CloudAccountSelectorCompact />}
                  {badge && (
                    <Badge variant={badge.variant || "secondary"} className="gap-2">
                      {badge.icon && <badge.icon className="h-3 w-3" />}
                      {badge.text}
                    </Badge>
                  )}
                  {headerActions}
                  <LanguageToggle />
                  <ThemeToggle />
                  <UserMenu />
                </div>
              </div>
            </div>
          </header>

          {/* Conteúdo Principal */}
          <main className="flex-1 w-full px-6 py-6 overflow-auto">
            {children}
          </main>

          <Footer variant="minimal" />
        </div>
      </div>
    </SidebarProvider>
  );
}

export default PageLayout;
