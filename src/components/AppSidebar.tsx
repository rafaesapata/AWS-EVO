import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { 
  LayoutDashboard, 
  DollarSign, 
  Bot, 
  TrendingUp, 
  Scan, 
  Zap, 
  AlertTriangle, 
  Trash2, 
  Shield, 
  FileCheck, 
  Bell, 
  Ticket, 
  Users, 
  Settings,
  ChevronDown,
  ChevronRight,
  Building2,
  Activity,
  Calendar,
  Cloud,
  Tv,
  ShieldAlert,
  BookOpen,
  Key,
  Mail
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface MenuItem {
  titleKey: string;
  value: string;
  icon: any;
  subItems?: { titleKey: string; value: string }[];
  superAdminOnly?: boolean;
}

const menuItems: MenuItem[] = [
  { titleKey: "sidebar.executiveDashboard", value: "executive", icon: LayoutDashboard },
  { 
    titleKey: "sidebar.costAnalysis", 
    value: "costs", 
    icon: DollarSign,
    subItems: [
      { titleKey: "sidebar.detailedAnalysis", value: "cost-analysis" },
      { titleKey: "sidebar.monthlyInvoices", value: "invoices" },
    ]
  },
  { titleKey: "sidebar.copilotAI", value: "copilot", icon: Bot },
  { 
    titleKey: "sidebar.mlPredictions", 
    value: "ml", 
    icon: TrendingUp,
    subItems: [
      { titleKey: "sidebar.predictiveIncidents", value: "ml" },
      { titleKey: "sidebar.anomalyDetection", value: "anomalies" },
    ]
  },
  { 
    titleKey: "sidebar.monitoring", 
    value: "monitoring", 
    icon: Activity,
    subItems: [
      { titleKey: "sidebar.endpoints", value: "endpoint-monitoring" },
      { titleKey: "sidebar.awsResources", value: "resource-monitoring" },
      { titleKey: "sidebar.edgeLbCfWaf", value: "edge-monitoring" },
    ]
  },
  { titleKey: "sidebar.attackDetection", value: "attack-detection", icon: ShieldAlert },
  { 
    titleKey: "sidebar.analysisScans", 
    value: "scans", 
    icon: Scan,
    subItems: [
      { titleKey: "sidebar.securityScans", value: "scans" },
      { titleKey: "sidebar.cloudtrailAudit", value: "cloudtrail-audit" },
      { titleKey: "sidebar.compliance", value: "compliance" },
      { titleKey: "sidebar.wellArchitected", value: "well-architected" },
      { titleKey: "sidebar.awsSecurityAnalysis", value: "security-analysis" },
    ]
  },
  { 
    titleKey: "sidebar.optimization", 
    value: "optimization", 
    icon: Zap,
    subItems: [
      { titleKey: "sidebar.costOptimization", value: "advanced" },
      { titleKey: "sidebar.riSavingsPlans", value: "risp" },
      { titleKey: "sidebar.wasteDetection", value: "waste" },
    ]
  },
  { titleKey: "sidebar.intelligentAlerts", value: "alerts", icon: Bell },
  { titleKey: "sidebar.securityPosture", value: "security", icon: Shield },
  { titleKey: "sidebar.remediationTickets", value: "tickets", icon: Ticket },
  { titleKey: "sidebar.knowledgeBase", value: "knowledge-base", icon: BookOpen },
  { titleKey: "sidebar.tvDashboards", value: "tv-dashboards", icon: Tv },
  { titleKey: "sidebar.audit", value: "audit", icon: FileCheck },
  { titleKey: "sidebar.communicationCenter", value: "communication-center", icon: Mail },
  { titleKey: "sidebar.license", value: "license", icon: Key },
  { titleKey: "sidebar.awsSettings", value: "aws-settings", icon: Cloud },
  { titleKey: "sidebar.manageUsers", value: "users", icon: Users },
  { titleKey: "sidebar.organizations", value: "organizations", icon: Building2, superAdminOnly: true },
  { titleKey: "sidebar.scheduledJobs", value: "scheduled-jobs", icon: Calendar, superAdminOnly: true },
  { titleKey: "sidebar.devTools", value: "devtools", icon: Activity, superAdminOnly: true },
  { titleKey: "sidebar.setup", value: "setup", icon: Settings },
];

interface AppSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  userRole?: string | string[];
}

export function AppSidebar({ activeTab, onTabChange, userRole }: AppSidebarProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(["ml", "scans", "optimization"]));
  
  const isSuperAdmin = Array.isArray(userRole) 
    ? userRole.includes('super_admin')
    : userRole === 'super_admin';

  const toggleGroup = (value: string) => {
    const newGroups = new Set(openGroups);
    if (newGroups.has(value)) {
      newGroups.delete(value);
    } else {
      newGroups.add(value);
    }
    setOpenGroups(newGroups);
  };

  const handleItemClick = (value: string) => {
    // Routes com páginas próprias
    if (value === 'license') {
      navigate('/license-management');
    } else if (value === 'communication-center') {
      navigate('/communication-center');
    } else if (value === 'aws-settings') {
      navigate('/aws-settings');
    } else if (value === 'knowledge-base') {
      navigate('/knowledge-base');
    } else if (value === 'scheduled-jobs') {
      navigate('/background-jobs');
    } else if (value === 'devtools') {
      navigate('/bedrock-test');
    } else if (value === 'well-architected') {
      navigate('/well-architected');
    } else if (value === 'copilot') {
      navigate('/copilot-ai');
    } else if (value === 'attack-detection') {
      navigate('/attack-detection');
    } else if (value === 'alerts') {
      navigate('/intelligent-alerts');
    } else if (value === 'security') {
      navigate('/security-posture');
    } else if (value === 'tickets') {
      navigate('/remediation-tickets');
    } else if (value === 'tv-dashboards') {
      navigate('/tv');
    } else if (value === 'scans') {
      navigate('/security-scans');
    } else if (value === 'cloudtrail-audit') {
      navigate('/cloudtrail-audit');
    } else if (value === 'compliance') {
      navigate('/compliance');
    } else if (value === 'advanced') {
      navigate('/cost-optimization');
    } else if (value === 'risp') {
      navigate('/ri-savings-plans');
    } else if (value === 'endpoint-monitoring') {
      navigate('/endpoint-monitoring');
    } else if (value === 'edge-monitoring') {
      navigate('/edge-monitoring');
    } else if (value === 'ml') {
      navigate('/predictive-incidents');
    } else if (value === 'anomalies') {
      navigate('/anomaly-detection');
    } else if (value === 'waste') {
      navigate('/ml-waste-detection');
    } else if (value === 'resource-monitoring') {
      navigate('/resource-monitoring');
    } else if (value === 'cost-analysis') {
      navigate('/app?tab=cost-analysis');
    } else if (value === 'invoices') {
      navigate('/app?tab=invoices');
    } else if (value === 'executive') {
      navigate('/app');
    } else if (value === 'costs') {
      navigate('/app?tab=costs');
    } else if (value === 'monitoring') {
      navigate('/app?tab=monitoring');
    } else if (value === 'optimization') {
      navigate('/app?tab=optimization');
    } else if (value === 'users') {
      navigate('/app?tab=users');
    } else if (value === 'organizations') {
      navigate('/app?tab=organizations');
    } else if (value === 'audit') {
      navigate('/app?tab=audit');
    } else if (value === 'setup') {
      navigate('/app?tab=setup');
    } else if (value === 'security-analysis') {
      navigate('/app?tab=security-analysis');
    } else {
      // Todas as outras ficam no /app
      onTabChange(value);
    }
  };

  return (
    <Sidebar collapsible="icon" className="select-none h-full min-h-screen [&_[data-sidebar=content]]:!overflow-visible [&_[data-sidebar=sidebar]]:h-full [&_[data-sidebar=sidebar]]:min-h-screen">
      <SidebarContent className="!overflow-visible h-full min-h-screen flex flex-col bg-sidebar">
        <SidebarGroup className="!overflow-visible flex-1 flex flex-col">
          <SidebarGroupLabel className="text-xs font-semibold select-none">{t('sidebar.navigation')}</SidebarGroupLabel>
          <SidebarGroupContent className="!overflow-visible flex-1">
            <SidebarMenu className="!overflow-visible">
              {menuItems.map((item) => {
                // Skip super admin only items if user is not super admin
                if (item.superAdminOnly && !isSuperAdmin) return null;
                
                const isActive = activeTab === item.value;
                
                if (item.subItems) {
                  const isOpen = openGroups.has(item.value);
                  
                  return (
                    <Collapsible
                      key={item.value}
                      open={isOpen}
                      onOpenChange={() => toggleGroup(item.value)}
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            className={isActive ? "bg-primary/10 text-primary font-medium" : ""}
                          >
                            <item.icon className="h-4 w-4" />
                            {!isCollapsed && (
                              <>
                                <span>{t(item.titleKey)}</span>
                                {isOpen ? (
                                  <ChevronDown className="ml-auto h-4 w-4" />
                                ) : (
                                  <ChevronRight className="ml-auto h-4 w-4" />
                                )}
                              </>
                            )}
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        {!isCollapsed && (
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {item.subItems.map((subItem) => (
                                <SidebarMenuSubItem key={subItem.value}>
                                  <SidebarMenuSubButton
                                    onClick={() => handleItemClick(subItem.value)}
                                    className={`cursor-pointer ${activeTab === subItem.value ? "bg-primary/10 text-primary" : ""}`}
                                  >
                                    <span>{t(subItem.titleKey)}</span>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        )}
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                return (
                  <SidebarMenuItem key={item.value}>
                    <SidebarMenuButton
                      onClick={() => handleItemClick(item.value)}
                      className={isActive ? "bg-primary/10 text-primary font-medium" : ""}
                    >
                      <item.icon className="h-4 w-4" />
                      {!isCollapsed && <span>{t(item.titleKey)}</span>}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
