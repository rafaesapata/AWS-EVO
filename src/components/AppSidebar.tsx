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
  Mail,
  Radar
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
  { titleKey: "sidebar.wafMonitoring", value: "waf-monitoring", icon: Radar },
  { 
    titleKey: "sidebar.analysisScans", 
    value: "scans", 
    icon: Scan,
    subItems: [
      { titleKey: "sidebar.securityScan", value: "security-scan" },
      { titleKey: "sidebar.cloudtrailAudit", value: "cloudtrail-audit" },
      { titleKey: "sidebar.compliance", value: "compliance" },
      { titleKey: "sidebar.wellArchitected", value: "well-architected" },
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
  { titleKey: "sidebar.cloudCredentials", value: "cloud-credentials", icon: Cloud },
  { titleKey: "sidebar.manageUsers", value: "users", icon: Users },
  { titleKey: "sidebar.organizations", value: "organizations", icon: Building2, superAdminOnly: true },
  { titleKey: "sidebar.scheduledJobs", value: "scheduled-jobs", icon: Calendar, superAdminOnly: true },
  { titleKey: "sidebar.devTools", value: "devtools", icon: Activity, superAdminOnly: true },
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
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set([
    "costs", 
    "ml", 
    "monitoring", 
    "scans", 
    "optimization"
  ]));
  
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
    } else if (value === 'cloud-credentials') {
      navigate('/cloud-credentials');
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
    } else if (value === 'waf-monitoring') {
      navigate('/waf-monitoring');
    } else if (value === 'alerts') {
      navigate('/intelligent-alerts');
    } else if (value === 'security') {
      navigate('/security-posture');
    } else if (value === 'tickets') {
      navigate('/remediation-tickets');
    } else if (value === 'tv-dashboards') {
      navigate('/app?tab=tv-dashboards');
    } else if (value === 'security-scan') {
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
      navigate('/app?tab=waste');
    } else if (value === 'resource-monitoring') {
      navigate('/resource-monitoring');
    } else if (value === 'cost-analysis') {
      navigate('/app?tab=cost-analysis');
    } else if (value === 'invoices') {
      navigate('/app?tab=invoices');
    } else if (value === 'executive') {
      onTabChange('executive');
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
      navigate('/organizations');
    } else if (value === 'audit') {
      navigate('/app?tab=audit');
    } else {
      // Todas as outras ficam no /app
      onTabChange(value);
    }
  };

  return (
    <Sidebar collapsible="icon" className="select-none h-screen [&_[data-sidebar=sidebar]]:h-screen">
      <SidebarContent className="h-screen flex flex-col bg-sidebar overflow-hidden">
        <SidebarGroup className="flex-shrink-0 p-1.5">
          <SidebarGroupLabel className="text-xs font-semibold select-none px-1">{t('sidebar.navigation')}</SidebarGroupLabel>
        </SidebarGroup>
        
        <SidebarGroup className="flex-1 overflow-hidden p-0">
          <SidebarGroupContent className="h-full overflow-y-auto overflow-x-hidden px-1.5 pb-1.5 sidebar-scroll">
            <SidebarMenu className="space-y-0.5">
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
                            size="sm"
                            className={`h-5 ${isActive ? "bg-primary/10 text-primary font-medium" : ""}`}
                          >
                            <item.icon className="h-2.5 w-2.5 flex-shrink-0" />
                            {!isCollapsed && (
                              <>
                                <span className="truncate text-xs">{t(item.titleKey)}</span>
                                {isOpen ? (
                                  <ChevronDown className="ml-auto h-2 w-2 flex-shrink-0" />
                                ) : (
                                  <ChevronRight className="ml-auto h-2 w-2 flex-shrink-0" />
                                )}
                              </>
                            )}
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        {!isCollapsed && (
                          <CollapsibleContent>
                            <SidebarMenuSub className="mx-1 border-l border-sidebar-border/50">
                              {item.subItems.map((subItem) => (
                                <SidebarMenuSubItem key={subItem.value}>
                                  <SidebarMenuSubButton
                                    size="sm"
                                    onClick={() => handleItemClick(subItem.value)}
                                    className={`cursor-pointer h-4 text-xs ${activeTab === subItem.value ? "bg-primary/10 text-primary" : ""}`}
                                  >
                                    <span className="truncate">{t(subItem.titleKey)}</span>
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
                      size="sm"
                      onClick={() => handleItemClick(item.value)}
                      className={`h-5 ${isActive ? "bg-primary/10 text-primary font-medium" : ""}`}
                    >
                      <item.icon className="h-2.5 w-2.5 flex-shrink-0" />
                      {!isCollapsed && <span className="truncate text-xs">{t(item.titleKey)}</span>}
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
