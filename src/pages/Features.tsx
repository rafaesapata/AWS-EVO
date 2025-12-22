import { Shield, DollarSign, AlertTriangle, Zap, Cloud, Lock, TrendingUp, Network, Server, Database, FileText, Users, Bell, CheckCircle, BarChart, Target, Globe, Cpu, Activity, Eye, GitBranch, Workflow, Settings, PieChart, LineChart, Gamepad2, MessageSquare, Sparkles, Timer, ShieldAlert, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Features = () => {
  const navigate = useNavigate();

  const featureCategories = [
    {
      category: "Security & Compliance",
      icon: Shield,
      features: [
        {
          name: "Security Scanning",
          description: "Comprehensive AWS security analysis identifying vulnerabilities and misconfigurations across your infrastructure",
          icon: ShieldAlert,
        },
        {
          name: "Well-Architected Review",
          description: "Automated assessment against AWS Well-Architected Framework pillars with actionable recommendations",
          icon: CheckCircle,
        },
        {
          name: "Compliance Frameworks",
          description: "Automated compliance checks against industry standards (SOC 2, ISO 27001, PCI DSS, HIPAA, GDPR)",
          icon: FileText,
        },
        {
          name: "IAM Deep Analysis",
          description: "Advanced Identity and Access Management analysis detecting overprivileged users and unused credentials",
          icon: Lock,
        },
        {
          name: "CloudTrail Analysis",
          description: "Real-time analysis of AWS CloudTrail logs to detect suspicious activities and security threats",
          icon: Search,
        },
        {
          name: "WAF Security Validation",
          description: "Validate AWS WAF configurations and rules to ensure protection against common web exploits",
          icon: Shield,
        },
        {
          name: "Attack Detection",
          description: "ML-powered real-time attack detection with pattern recognition and automated threat intelligence",
          icon: AlertTriangle,
        },
        {
          name: "Drift Detection",
          description: "Identify manual infrastructure changes that deviate from Infrastructure as Code definitions",
          icon: GitBranch,
        },
      ]
    },
    {
      category: "Cost Optimization",
      icon: DollarSign,
      features: [
        {
          name: "Advanced Cost Analysis",
          description: "Deep dive into AWS spending patterns with granular breakdowns by service, region, and resource",
          icon: PieChart,
        },
        {
          name: "Waste Detection",
          description: "Automatically identify idle resources, unattached volumes, unused IPs, and old snapshots",
          icon: AlertTriangle,
        },
        {
          name: "RI/Savings Plans Optimizer",
          description: "ML-powered recommendations for Reserved Instances and Savings Plans with ROI projections",
          icon: Target,
        },
        {
          name: "Budget Forecasting",
          description: "Predictive analytics for cost forecasting with anomaly detection and trend analysis",
          icon: TrendingUp,
        },
        {
          name: "Cost Anomaly Detection",
          description: "Automated detection of unusual spending patterns with intelligent alerting",
          icon: Bell,
        },
        {
          name: "Savings Simulator",
          description: "Interactive tool to simulate cost savings from various optimization strategies",
          icon: Sparkles,
        },
        {
          name: "Multi-Account Comparison",
          description: "Compare costs and efficiency metrics across multiple AWS accounts and organizations",
          icon: BarChart,
        },
        {
          name: "Region Cost Analysis",
          description: "Compare AWS pricing across regions and identify opportunities for cost-effective migrations",
          icon: Globe,
        },
      ]
    },
    {
      category: "Monitoring & Observability",
      icon: Activity,
      features: [
        {
          name: "Resource Monitoring",
          description: "Real-time monitoring of AWS resources with custom metrics, filters, and comparison tools",
          icon: Server,
        },
        {
          name: "Infrastructure Topology",
          description: "Visual representation of your AWS infrastructure with attack path analysis",
          icon: Network,
        },
        {
          name: "Endpoint Monitoring",
          description: "Continuous health checks for critical endpoints with uptime tracking and alerting",
          icon: Eye,
        },
        {
          name: "Edge Location Monitoring",
          description: "Monitor CloudFront and edge location performance globally",
          icon: Globe,
        },
        {
          name: "Predictive Incidents",
          description: "AI-powered incident prediction based on infrastructure patterns and historical data",
          icon: Zap,
        },
        {
          name: "Intelligent Alerts",
          description: "Smart alerting system with severity prioritization and noise reduction",
          icon: Bell,
        },
        {
          name: "CloudWatch Metrics Integration",
          description: "Direct integration with AWS CloudWatch for comprehensive metrics collection",
          icon: LineChart,
        },
      ]
    },
    {
      category: "AI & Automation",
      icon: Sparkles,
      features: [
        {
          name: "FinOps Copilot",
          description: "AI-powered chatbot assistant for cost optimization queries and recommendations",
          icon: MessageSquare,
        },
        {
          name: "AI Insights & Prioritization",
          description: "Machine learning algorithms prioritize findings and recommendations by impact",
          icon: Sparkles,
        },
        {
          name: "Automated Remediation Scripts",
          description: "Generate ready-to-use scripts for fixing identified security and cost issues",
          icon: Workflow,
        },
        {
          name: "Scheduled Scans",
          description: "Automated security and compliance scans with customizable schedules",
          icon: Timer,
        },
        {
          name: "Anomaly Detection Engine",
          description: "ML-powered detection of unusual patterns in costs, security, and performance",
          icon: AlertTriangle,
        },
      ]
    },
    {
      category: "Collaboration & Reporting",
      icon: Users,
      features: [
        {
          name: "Executive Dashboard",
          description: "High-level overview with KPIs, trends, and executive summaries for leadership",
          icon: BarChart,
        },
        {
          name: "Remediation Tickets",
          description: "Automated ticket creation for findings with JIRA, ServiceNow, and webhook integrations",
          icon: FileText,
        },
        {
          name: "Peer Benchmarking",
          description: "Anonymous comparison with similar organizations to identify best practices",
          icon: TrendingUp,
        },
        {
          name: "TV Dashboard Builder",
          description: "Create custom dashboards for TV displays with auto-refresh and real-time updates",
          icon: Cpu,
        },
        {
          name: "Gamification System",
          description: "Achievements, leaderboards, and challenges to engage teams in optimization efforts",
          icon: Gamepad2,
        },
        {
          name: "Advanced Export Manager",
          description: "Export data in multiple formats (PDF, Excel, JSON, CSV) with custom templates",
          icon: FileText,
        },
        {
          name: "Notification System",
          description: "Multi-channel notifications (Email, Slack, Webhooks) with severity filtering",
          icon: Bell,
        },
      ]
    },
    {
      category: "Enterprise Features",
      icon: Settings,
      features: [
        {
          name: "Multi-Organization Support",
          description: "Manage multiple organizations with complete data isolation and RBAC",
          icon: Users,
        },
        {
          name: "Role-Based Access Control",
          description: "Granular permissions with Viewer, Analyst, and Admin roles",
          icon: Lock,
        },
        {
          name: "Audit Log",
          description: "Comprehensive audit trail of all user actions with detailed metadata",
          icon: FileText,
        },
        {
          name: "Multi-Factor Authentication",
          description: "Enhanced security with MFA support and WebAuthn integration",
          icon: Shield,
        },
        {
          name: "Multi-Account Management",
          description: "Centralized management of multiple AWS accounts with synchronized scanning",
          icon: Cloud,
        },
        {
          name: "Tagging Compliance",
          description: "Enforce and monitor AWS resource tagging standards across your organization",
          icon: CheckCircle,
        },
        {
          name: "Custom Metrics & Targets",
          description: "Define and track custom KPIs with target thresholds and progress monitoring",
          icon: Target,
        },
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      {/* Hero Section */}
      <div className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-16">
          <div className="text-center max-w-4xl mx-auto">
            <Badge className="mb-4" variant="secondary">
              Platform Features
            </Badge>
            <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Complete AWS Governance Platform
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Enterprise-grade security, cost optimization, and infrastructure monitoring in one unified platform
            </p>
            <div className="flex gap-4 justify-center flex-wrap">
              <Button size="lg" onClick={() => navigate("/auth")}>
                Get Started
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/app")}>
                View Dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          {[
            { label: "Security Features", value: "15+", icon: Shield },
            { label: "Cost Tools", value: "10+", icon: DollarSign },
            { label: "AI Capabilities", value: "8+", icon: Sparkles },
            { label: "Integrations", value: "25+", icon: Network },
          ].map((stat, index) => (
            <Card key={index} className="text-center">
              <CardContent className="pt-6">
                <stat.icon className="w-8 h-8 mx-auto mb-2 text-primary" />
                <div className="text-3xl font-bold mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Features by Category */}
      <div className="container mx-auto px-4 py-12">
        {featureCategories.map((category, categoryIndex) => (
          <div key={categoryIndex} className="mb-16">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-primary/10 rounded-lg">
                <category.icon className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-3xl font-bold">{category.category}</h2>
                <p className="text-muted-foreground">
                  {category.features.length} powerful features
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {category.features.map((feature, featureIndex) => (
                <Card key={featureIndex} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-primary/10 rounded-md shrink-0">
                        <feature.icon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{feature.name}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-sm leading-relaxed">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* CTA Section */}
      <div className="border-t bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-16">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-4xl font-bold mb-4">
              Ready to Optimize Your AWS Infrastructure?
            </h2>
            <p className="text-xl text-muted-foreground mb-8">
              Join organizations reducing costs by 40% while improving security posture
            </p>
            <div className="flex gap-4 justify-center flex-wrap">
              <Button size="lg" onClick={() => navigate("/auth")}>
                Start Free Trial
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/app")}>
                View Live Demo
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Features;
