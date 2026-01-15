import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { Layout } from "@/components/Layout";
import { useTranslation } from "react-i18next";
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  FileCheck,
  RefreshCw,
  Download,
  PlayCircle,
  Loader2,
  Ticket,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  History,
  BarChart3
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell,
  Legend,
  Area,
  AreaChart
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


// AWS Frameworks
const AWS_FRAMEWORKS = [
  {
    id: 'cis',
    name: 'CIS AWS',
    description: 'CIS Amazon Web Services Foundations Benchmark v1.5.0',
    icon: '🔒',
  },
  {
    id: 'lgpd',
    name: 'LGPD',
    description: 'Lei Geral de Proteção de Dados (Brasil)',
    icon: '🇧🇷',
  },
  {
    id: 'gdpr',
    name: 'GDPR',
    description: 'General Data Protection Regulation (Europa)',
    icon: '🇪🇺',
  },
  {
    id: 'hipaa',
    name: 'HIPAA',
    description: 'Health Insurance Portability and Accountability Act',
    icon: '🏥',
  },
  {
    id: 'pci-dss',
    name: 'PCI-DSS',
    description: 'Payment Card Industry Data Security Standard v4.0',
    icon: '💳',
  },
  {
    id: 'soc2',
    name: 'SOC 2',
    description: 'SOC 2 Type II - Trust Services Criteria',
    icon: '📋',
  },
  {
    id: 'nist',
    name: 'NIST 800-53',
    description: 'NIST Special Publication 800-53 Security Controls',
    icon: '🏛️',
  },
];

// Azure Frameworks
const AZURE_FRAMEWORKS = [
  {
    id: 'cis-azure',
    name: 'CIS Azure',
    description: 'CIS Microsoft Azure Foundations Benchmark',
    icon: '🔒',
  },
  {
    id: 'azure-security-benchmark',
    name: 'Azure Security Benchmark',
    description: 'Microsoft Azure Security Benchmark',
    icon: '🛡️',
  },
  {
    id: 'lgpd',
    name: 'LGPD',
    description: 'Lei Geral de Proteção de Dados (Brasil)',
    icon: '🇧🇷',
  },
  {
    id: 'gdpr',
    name: 'GDPR',
    description: 'General Data Protection Regulation (Europa)',
    icon: '🇪🇺',
  },
  {
    id: 'pci-dss',
    name: 'PCI-DSS',
    description: 'Payment Card Industry Data Security Standard',
    icon: '💳',
  },
];

interface ScanJob {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  framework: string;
  completed?: number;
  total?: number;
  scan_results?: any;
}


export default function Compliance() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedAccountId, selectedProvider } = useCloudAccount();
  const { data: organizationId } = useOrganization();
  
  const [runningJobs, setRunningJobs] = useState<Map<string, ScanJob>>(new Map());
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([]);
  const [selectedChecks, setSelectedChecks] = useState<string[]>([]);
  const [selectedCheck, setSelectedCheck] = useState<any | null>(null);
  const [creatingTicketId, setCreatingTicketId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<{ [key: string]: number }>({});
  const [historyDays, setHistoryDays] = useState(30);
  const CHECKS_PER_PAGE = 10;

  // Determine which frameworks to show based on selected provider
  const isAzure = selectedProvider === 'AZURE';
  const FRAMEWORKS = isAzure ? AZURE_FRAMEWORKS : AWS_FRAMEWORKS;

  // Get compliance checks from database
  const { data: complianceChecks = [], isLoading, refetch } = useQuery({
    queryKey: ['compliance-checks', organizationId, selectedAccountId],
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      if (!organizationId) throw new Error('Organization not found');

      let filters: any = {
        'security_scans.organization_id': organizationId
      };
      
      if (selectedAccountId) {
        filters['security_scans.aws_account_id'] = selectedAccountId;
      }
      
      const result = await apiClient.select('compliance_checks', {
        select: `
          *,
          security_scans!inner(organization_id, aws_account_id)
        `,
        ...filters,
        order: { created_at: 'desc' }
      });
      
      if (result.error) throw new Error(getErrorMessage(result.error));
      return result.data || [];
    },
    enabled: !!organizationId,
  });

  // Get compliance history for trends
  const { data: complianceHistory, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['compliance-history', organizationId, selectedAccountId, historyDays],
    queryFn: async () => {
      if (!organizationId) throw new Error('Organization not found');
      
      const result = await apiClient.invoke('get-compliance-history', {
        body: {
          days: historyDays,
          accountId: selectedAccountId,
        }
      });
      
      if (result.error) throw new Error(getErrorMessage(result.error));
      return result.data as any;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });


  // Poll for job status
  const pollJobStatus = useCallback(async (jobId: string, frameworkId: string) => {
    try {
      const result = await apiClient.invoke('get-compliance-scan-status', {
        body: { jobId }
      });
      
      if (result.error) {
        console.error('Error polling job status:', result.error);
        return null;
      }
      
      const data = result.data as any;
      return {
        job_id: jobId,
        status: data.status,
        progress: data.progress || 0,
        message: data.message || '',
        framework: frameworkId,
        completed: data.completed || 0,
        total: data.total || 0,
        scan_results: data.scan_results,
      } as ScanJob;
    } catch (err) {
      console.error('Error polling job status:', err);
      return null;
    }
  }, []);

  // Check for running jobs on page load
  useEffect(() => {
    const checkRunningJobs = async () => {
      if (!organizationId) return;
      
      try {
        // Query for running compliance scan jobs
        const result = await apiClient.select('background_jobs', {
          select: '*',
          organization_id: organizationId,
          job_type: 'compliance-scan',
          status: 'in:pending,running',
          order: { created_at: 'desc' },
          limit: 10,
        });
        
        if (result.error || !result.data) return;
        
        // Add running jobs to state
        const jobs = result.data as any[];
        if (jobs.length > 0) {
          const newRunningJobs = new Map<string, ScanJob>();
          
          for (const job of jobs) {
            const frameworkId = job.parameters?.frameworkId;
            if (frameworkId) {
              newRunningJobs.set(frameworkId, {
                job_id: job.id,
                status: job.status,
                progress: job.result?.progress || 0,
                message: job.result?.message || 'Scan in progress...',
                framework: frameworkId,
                completed: job.result?.completed || 0,
                total: job.result?.total || 0,
              });
            }
          }
          
          if (newRunningJobs.size > 0) {
            setRunningJobs(newRunningJobs);
            toast({
              title: t('compliance.resumingScans', 'Resuming Scans'),
              description: `${newRunningJobs.size} ${t('compliance.scansInProgress', 'compliance scan(s) in progress')}`,
            });
          }
        }
      } catch (err) {
        console.error('Error checking running jobs:', err);
      }
    };
    
    checkRunningJobs();
  }, [organizationId, toast, t]);

  // Effect to poll running jobs
  useEffect(() => {
    const runningJobsList = Array.from(runningJobs.values()).filter(
      job => job.status === 'pending' || job.status === 'running'
    );
    
    if (runningJobsList.length === 0) return;
    
    const interval = setInterval(async () => {
      for (const job of runningJobsList) {
        const updatedJob = await pollJobStatus(job.job_id, job.framework);
        
        if (updatedJob) {
          setRunningJobs(prev => {
            const newMap = new Map(prev);
            newMap.set(job.framework, updatedJob);
            return newMap;
          });
          
          if (updatedJob.status === 'completed') {
            toast({
              title: t('compliance.scanCompleted', 'Scan Completed'),
              description: `${FRAMEWORKS.find(f => f.id === job.framework)?.name}: ${updatedJob.scan_results?.compliance_score || 0}% compliance`,
            });
            queryClient.invalidateQueries({ queryKey: ['compliance-checks'] });
            queryClient.invalidateQueries({ queryKey: ['compliance-history'] });
          } else if (updatedJob.status === 'failed') {
            toast({
              title: t('compliance.scanFailed', 'Scan Failed'),
              description: `${FRAMEWORKS.find(f => f.id === job.framework)?.name}: ${updatedJob.message}`,
              variant: 'destructive',
            });
          }
        }
      }
    }, 3000); // Poll every 3 seconds
    
    return () => clearInterval(interval);
  }, [runningJobs, pollJobStatus, toast, queryClient, FRAMEWORKS, t]);


  // Start async compliance scan mutation
  const startComplianceScan = useMutation({
    mutationFn: async (frameworkId: string) => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error("User not authenticated");
      if (!organizationId) throw new Error("Organization not found");

      const lambdaName = isAzure ? 'azure-compliance-scan' : 'start-compliance-scan';
      const bodyParams = isAzure 
        ? { frameworkId, credentialId: selectedAccountId }
        : { frameworkId, accountId: selectedAccountId };
      
      const result = await apiClient.invoke(lambdaName, { 
        body: bodyParams
      });

      if (result.error) {
        console.error('Compliance scan error:', result.error);
        throw new Error(getErrorMessage(result.error));
      }

      const data = result.data as any;
      return { 
        job_id: data.job_id,
        framework: frameworkId,
        status: data.status || 'pending',
        message: data.message || 'Scan started...',
        already_running: data.already_running,
      };
    },
    onSuccess: (data) => {
      if (data.already_running) {
        toast({
          title: t('compliance.scanInProgress', 'Scan Already Running'),
          description: `${FRAMEWORKS.find(f => f.id === data.framework)?.name} scan is already in progress.`,
        });
      } else {
        toast({
          title: t('compliance.scanStarted', 'Compliance Scan Started'),
          description: `${FRAMEWORKS.find(f => f.id === data.framework)?.name} - ${data.message}`,
        });
      }
      
      // Add to running jobs
      setRunningJobs(prev => {
        const newMap = new Map(prev);
        newMap.set(data.framework, {
          job_id: data.job_id,
          status: data.status as any,
          progress: 0,
          message: data.message,
          framework: data.framework,
        });
        return newMap;
      });
    },
    onError: (error: any) => {
      toast({
        title: t('compliance.scanError', 'Scan Error'),
        description: error.message || "Error starting compliance scan",
        variant: "destructive"
      });
    },
  });

  const runAllFrameworks = async () => {
    toast({ title: t('compliance.runningAll', 'Running all frameworks...') });
    for (const framework of FRAMEWORKS) {
      await startComplianceScan.mutateAsync(framework.id);
    }
  };

  const runSelectedFrameworks = async () => {
    if (selectedFrameworks.length === 0) {
      toast({ title: t('compliance.selectFramework', 'Select at least one framework'), variant: "destructive" });
      return;
    }
    toast({ title: t('compliance.runningSelected', 'Running selected frameworks...') });
    for (const frameworkId of selectedFrameworks) {
      await startComplianceScan.mutateAsync(frameworkId);
    }
    setSelectedFrameworks([]);
  };


  const handleRefresh = async () => {
    try {
      await refetch();
      toast({
        title: t('common.dataUpdated', 'Data Updated'),
        description: t('compliance.dataRefreshed', 'Compliance data has been refreshed.'),
      });
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('compliance.refreshError', 'Could not refresh data.'),
        variant: "destructive"
      });
    }
  };

  const toggleFrameworkSelection = (frameworkId: string) => {
    setSelectedFrameworks(prev => 
      prev.includes(frameworkId) 
        ? prev.filter(id => id !== frameworkId)
        : [...prev, frameworkId]
    );
  };

  const toggleCheckSelection = (checkId: string) => {
    setSelectedChecks(prev => 
      prev.includes(checkId) 
        ? prev.filter(id => id !== checkId)
        : [...prev, checkId]
    );
  };

  const toggleAllChecksForFramework = (frameworkId: string) => {
    const frameworkChecks = complianceChecks?.filter(
      (check: any) => check.framework === frameworkId && check.status === 'failed'
    ).map((check: any) => check.id) || [];
    
    const allSelected = frameworkChecks.every((id: string) => selectedChecks.includes(id));
    
    if (allSelected) {
      setSelectedChecks(prev => prev.filter(id => !frameworkChecks.includes(id)));
    } else {
      setSelectedChecks(prev => [...new Set([...prev, ...frameworkChecks])]);
    }
  };

  const createTicketForCheck = async (check: any) => {
    const ticketKey = `${check.framework}-${check.control_id}`;
    if (creatingTicketId === ticketKey) return;
    
    setCreatingTicketId(ticketKey);
    
    try {
      let category: 'security' | 'compliance' | 'cost_optimization' | 'configuration' = 'compliance';
      
      if (check.framework === 'lgpd' || check.framework === 'gdpr' || 
          check.severity === 'critical' || check.severity === 'high') {
        category = 'security';
      }

      await apiClient.insert('remediation_tickets', {
        organization_id: organizationId,
        title: `[${check.framework.toUpperCase()}] ${check.control_name}`,
        description: check.remediation_steps || "No remediation steps available",
        priority: check.severity === 'critical' ? 'high' : check.severity === 'high' ? 'medium' : 'low',
        severity: check.severity || 'medium',
        status: 'pending',
        category: category,
        compliance_check_id: check.id
      });

      toast({ 
        title: t('compliance.ticketCreated', 'Ticket created successfully!'),
        description: t('compliance.ticketAdded', 'The remediation ticket has been added to the queue')
      });
      queryClient.invalidateQueries({ queryKey: ['remediation-tickets'] });
    } catch (error) {
      toast({ title: t('compliance.ticketError', 'Error creating ticket'), variant: "destructive" });
    } finally {
      setCreatingTicketId(null);
    }
  };

  const createTicketsForSelected = async () => {
    if (selectedChecks.length === 0) {
      toast({ title: t('compliance.selectControl', 'Select at least one control'), variant: "destructive" });
      return;
    }

    try {
      const checksToCreate = complianceChecks?.filter(
        (check: any) => selectedChecks.includes(check.id) && check.status === 'failed'
      ) || [];

      for (const check of checksToCreate) {
        await createTicketForCheck(check);
      }

      toast({ title: `${checksToCreate.length} ${t('compliance.ticketsCreated', 'tickets created successfully!')}` });
      setSelectedChecks([]);
    } catch (error) {
      toast({ title: t('compliance.ticketError', 'Error creating tickets'), variant: "destructive" });
    }
  };


  const getFrameworkStats = (frameworkId: string) => {
    const checks = complianceChecks.filter((c: any) => c.framework === frameworkId);
    const passed = checks.filter((c: any) => c.status === 'passed').length;
    const failed = checks.filter((c: any) => c.status === 'failed').length;
    const total = checks.length;
    const compliance = total > 0 ? (passed / total) * 100 : 0;
    return { passed, failed, total, compliance };
  };

  const getSeverityWeight = (severity: string) => {
    switch (severity) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  };

  const sortChecksBySeverity = (checks: any[]) => {
    return [...checks].sort((a, b) => {
      const severityDiff = getSeverityWeight(b.severity) - getSeverityWeight(a.severity);
      if (severityDiff !== 0) return severityDiff;
      if (a.status === 'failed' && b.status !== 'failed') return -1;
      if (a.status !== 'failed' && b.status === 'failed') return 1;
      return 0;
    });
  };

  const exportCompliance = () => {
    if (!complianceChecks || complianceChecks.length === 0) {
      toast({ title: t('compliance.noDataExport', 'No data to export'), variant: "destructive" });
      return;
    }

    const csvContent = [
      'Framework,Control,Name,Severity,Status,Evidence',
      ...complianceChecks.map((check: any) => [
        check.framework,
        check.control_id,
        `"${check.control_name}"`,
        check.severity,
        check.status,
        `"${check.evidence || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `compliance_report_${selectedAccountId}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    toast({
      title: t('compliance.reportExported', 'Report exported'),
      description: t('compliance.reportExportedDesc', 'The compliance report has been exported successfully.'),
    });
  };

  // Calculate summary metrics
  const totalFrameworks = FRAMEWORKS.length;
  const frameworksWithData = FRAMEWORKS.filter(f => getFrameworkStats(f.id).total > 0).length;
  const compliantFrameworks = FRAMEWORKS.filter(f => getFrameworkStats(f.id).compliance >= 80).length;
  const avgComplianceScore = frameworksWithData > 0 
    ? FRAMEWORKS.reduce((sum, f) => sum + getFrameworkStats(f.id).compliance, 0) / frameworksWithData 
    : 0;
  const totalControls = complianceChecks?.length || 0;
  const passedControls = complianceChecks?.filter((c: any) => c.status === 'passed').length || 0;

  // Check if any scan is running
  const hasRunningScans = Array.from(runningJobs.values()).some(
    job => job.status === 'pending' || job.status === 'running'
  );

  // Prepare chart data
  const frameworkData = FRAMEWORKS.map(framework => {
    const stats = getFrameworkStats(framework.id);
    return {
      name: framework.id.toUpperCase(),
      score: stats.compliance,
      passed: stats.passed,
      failed: stats.failed,
      total: stats.total
    };
  }).filter(f => f.total > 0);

  const statusDistribution = [
    { name: t('compliance.passed', 'Passed'), value: passedControls, color: '#10b981' },
    { name: t('compliance.failed', 'Failed'), value: totalControls - passedControls, color: '#ef4444' },
  ].filter(d => d.value > 0);

  // Prepare trend data from history
  const trendData = complianceHistory?.posture_history?.map((p: any) => ({
    date: new Date(p.date).toLocaleDateString(),
    score: p.compliance_score || 0,
    critical: p.critical_findings || 0,
    high: p.high_findings || 0,
  })) || [];

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'declining': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };


  return (
    <Layout 
      title={t('compliance.title', 'Compliance & Conformity')}
      description={t('compliance.description', 'Security framework compliance verification')}
      icon={<FileCheck className="h-5 w-5 text-white" />}
    >
      <div className="space-y-6">
        {/* Action Buttons */}
        <Card className="glass border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <span className="font-medium">
                  {isAzure ? 'Azure Compliance Frameworks' : 'AWS Compliance Frameworks'}
                </span>
                {hasRunningScans && (
                  <Badge variant="secondary" className="animate-pulse">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    {t('compliance.scanning', 'Scanning...')}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button 
                  onClick={runSelectedFrameworks}
                  disabled={hasRunningScans || selectedFrameworks.length === 0}
                  variant="default"
                  size="sm"
                  className="gap-2"
                >
                  <PlayCircle className="h-4 w-4" />
                  {t('compliance.runSelected', 'Run Selected')} ({selectedFrameworks.length})
                </Button>
                <Button 
                  onClick={runAllFrameworks}
                  disabled={hasRunningScans}
                  variant="secondary"
                  size="sm"
                  className="gap-2"
                >
                  {hasRunningScans ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('compliance.running', 'Running...')}
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-4 w-4" />
                      {t('compliance.runAll', 'Run All')}
                    </>
                  )}
                </Button>
                <Button 
                  onClick={handleRefresh}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  {t('common.refresh', 'Refresh')}
                </Button>
                <Button 
                  onClick={exportCompliance}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={totalControls === 0}
                >
                  <Download className="h-4 w-4" />
                  {t('common.export', 'Export')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <Card className="glass border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('compliance.frameworks', 'Frameworks')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-bold">{frameworksWithData}/{totalFrameworks}</div>
              )}
            </CardContent>
          </Card>

          <Card className="glass border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('compliance.compliant', 'Compliant (≥80%)')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-bold text-green-500">{compliantFrameworks}</div>
              )}
            </CardContent>
          </Card>

          <Card className="glass border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('compliance.avgScore', 'Avg Score')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="space-y-2">
                  <div className="text-2xl font-bold">{avgComplianceScore.toFixed(1)}%</div>
                  <Progress value={avgComplianceScore} className="h-2" />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('compliance.totalControls', 'Total Controls')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{totalControls}</div>
              )}
            </CardContent>
          </Card>

          <Card className="glass border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('compliance.passedControls', 'Passed')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-green-500">{passedControls}</div>
                  <div className="text-xs text-muted-foreground">
                    {totalControls > 0 ? `${((passedControls / totalControls) * 100).toFixed(1)}%` : '0%'}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                {t('compliance.trend', 'Trend')}
                {complianceHistory?.overall_trend && getTrendIcon(complianceHistory.overall_trend)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingHistory ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="space-y-1">
                  <div className={`text-2xl font-bold ${
                    complianceHistory?.summary?.score_change > 0 ? 'text-green-500' : 
                    complianceHistory?.summary?.score_change < 0 ? 'text-red-500' : ''
                  }`}>
                    {complianceHistory?.summary?.score_change > 0 ? '+' : ''}
                    {complianceHistory?.summary?.score_change?.toFixed(1) || '0'}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t('compliance.last30Days', 'Last 30 days')}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>


        {/* Main Content */}
        <Tabs defaultValue="frameworks" className="w-full">
          <TabsList className="glass">
            <TabsTrigger value="frameworks">{t('compliance.frameworks', 'Frameworks')}</TabsTrigger>
            <TabsTrigger value="controls">{t('compliance.controls', 'Controls')}</TabsTrigger>
            <TabsTrigger value="trends">{t('compliance.trends', 'Trends')}</TabsTrigger>
            <TabsTrigger value="analytics">{t('compliance.analytics', 'Analytics')}</TabsTrigger>
          </TabsList>

          <TabsContent value="frameworks" className="space-y-6">
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>{t('compliance.complianceFrameworks', 'Compliance Frameworks')}</CardTitle>
                <CardDescription>
                  {t('compliance.selectAndRun', 'Select frameworks and run compliance scans')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {FRAMEWORKS.map((framework) => {
                      const stats = getFrameworkStats(framework.id);
                      const runningJob = runningJobs.get(framework.id);
                      const isRunning = runningJob && (runningJob.status === 'pending' || runningJob.status === 'running');
                      
                      return (
                        <div key={framework.id} className="border rounded-lg p-4 space-y-3 hover:border-primary/50 transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={selectedFrameworks.includes(framework.id)}
                                onCheckedChange={() => toggleFrameworkSelection(framework.id)}
                                className="mt-1"
                                disabled={isRunning}
                              />
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xl">{framework.icon}</span>
                                  <h4 className="font-semibold text-sm">{framework.name}</h4>
                                  {stats.total > 0 && (
                                    <Badge variant={stats.compliance >= 80 ? "default" : stats.compliance >= 60 ? "secondary" : "destructive"}>
                                      {stats.compliance.toFixed(0)}%
                                    </Badge>
                                  )}
                                  {complianceHistory?.framework_stats?.[framework.id] && (
                                    <span className="flex items-center gap-1 text-xs">
                                      {getTrendIcon(complianceHistory.framework_stats[framework.id].trend)}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">{framework.description}</p>
                              </div>
                            </div>
                            <Button
                              onClick={() => startComplianceScan.mutate(framework.id)}
                              disabled={isRunning || hasRunningScans}
                              size="sm"
                              variant="outline"
                              className="gap-2"
                            >
                              {isRunning ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  {runningJob?.progress || 0}%
                                </>
                              ) : (
                                <>
                                  <PlayCircle className="h-4 w-4" />
                                  {t('compliance.runScan', 'Run Scan')}
                                </>
                              )}
                            </Button>
                          </div>
                          
                          {/* Progress bar for running scan */}
                          {isRunning && runningJob && (
                            <div className="space-y-2 pl-8">
                              <Progress value={runningJob.progress} className="h-2" />
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{runningJob.message}</span>
                                <span>{runningJob.completed || 0}/{runningJob.total || '?'} {t('compliance.controls', 'controls')}</span>
                              </div>
                            </div>
                          )}
                          
                          {stats.total > 0 && !isRunning && (
                            <div className="space-y-2 pl-8">
                              <Progress value={stats.compliance} className="h-2" />
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div className="flex items-center gap-1">
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                  <span className="text-muted-foreground">{t('compliance.passed', 'Passed')}:</span>
                                  <span className="font-medium text-green-500">{stats.passed}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <XCircle className="h-4 w-4 text-red-500" />
                                  <span className="text-muted-foreground">{t('compliance.failed', 'Failed')}:</span>
                                  <span className="font-medium text-red-500">{stats.failed}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground">{t('compliance.total', 'Total')}:</span>
                                  <span className="font-medium">{stats.total}</span>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {stats.total === 0 && !isRunning && (
                            <div className="pl-8 text-sm text-muted-foreground">
                              {t('compliance.noScanYet', 'No scan executed yet. Click "Run Scan" to verify compliance.')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>


          <TabsContent value="controls" className="space-y-4">
            {selectedChecks.length > 0 && (
              <Card className="glass border-primary/20">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {selectedChecks.length} {t('compliance.controlsSelected', 'control(s) selected')}
                    </span>
                    <Button 
                      onClick={createTicketsForSelected}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      <Ticket className="h-4 w-4" />
                      {t('compliance.createTickets', 'Create Tickets')} ({selectedChecks.length})
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>{t('compliance.complianceControls', 'Compliance Controls')}</CardTitle>
                <CardDescription>{t('compliance.controlsDetails', 'Details of verified controls')}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-32 w-full" />
                    ))}
                  </div>
                ) : complianceChecks && complianceChecks.length > 0 ? (
                  <Tabs defaultValue={FRAMEWORKS[0].id}>
                    <TabsList className="grid grid-cols-7 mb-6">
                      {FRAMEWORKS.map(framework => {
                        const stats = getFrameworkStats(framework.id);
                        return (
                          <TabsTrigger 
                            key={framework.id} 
                            value={framework.id}
                            className="flex items-center gap-1 text-xs"
                          >
                            <span>{framework.icon}</span>
                            <span className="hidden sm:inline">{framework.name}</span>
                            {stats.total > 0 && (
                              <Badge variant="outline" className="ml-1 text-xs">
                                {stats.total}
                              </Badge>
                            )}
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>

                    {FRAMEWORKS.map(framework => {
                      const frameworkChecks = sortChecksBySeverity(
                        complianceChecks.filter((c: any) => c.framework === framework.id)
                      );
                      const failedChecks = frameworkChecks.filter((c: any) => c.status === 'failed');
                      const page = currentPage[framework.id] || 1;
                      const totalPages = Math.ceil(frameworkChecks.length / CHECKS_PER_PAGE);
                      const startIndex = (page - 1) * CHECKS_PER_PAGE;
                      const paginatedChecks = frameworkChecks.slice(startIndex, startIndex + CHECKS_PER_PAGE);

                      return (
                        <TabsContent key={framework.id} value={framework.id} className="space-y-4">
                          {failedChecks.length > 0 && (
                            <div className="flex justify-end">
                              <Button 
                                onClick={() => toggleAllChecksForFramework(framework.id)}
                                variant="outline"
                                size="sm"
                              >
                                <Checkbox
                                  checked={failedChecks.every((c: any) => selectedChecks.includes(c.id))}
                                  className="mr-2"
                                />
                                {t('compliance.selectAllFailed', 'Select All Failed')}
                              </Button>
                            </div>
                          )}

                          {frameworkChecks.length === 0 ? (
                            <div className="text-center p-8 text-muted-foreground">
                              <Shield className="w-12 h-12 mx-auto mb-2 opacity-50" />
                              <p>{t('compliance.noChecksForFramework', 'No checks executed for this framework')}</p>
                              <p className="text-sm mt-1">{t('compliance.runScanToSee', 'Run a compliance scan to see results')}</p>
                            </div>
                          ) : (
                            <>
                              <div className="space-y-3">
                                {paginatedChecks.map((check: any) => (
                                  <Card 
                                    key={check.id} 
                                    className={`border-l-4 ${check.status === 'passed' ? 'border-l-green-500' : 'border-l-red-500'} hover:shadow-md transition-all cursor-pointer`}
                                    onClick={() => setSelectedCheck(check)}
                                  >
                                    <CardContent className="pt-4">
                                      <div className="flex items-start gap-3">
                                        {check.status === 'failed' && (
                                          <Checkbox
                                            checked={selectedChecks.includes(check.id)}
                                            onCheckedChange={() => toggleCheckSelection(check.id)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="mt-1"
                                          />
                                        )}
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-2">
                                            {check.status === 'passed' ? (
                                              <CheckCircle className="w-5 h-5 text-green-500" />
                                            ) : (
                                              <XCircle className="w-5 h-5 text-red-500" />
                                            )}
                                            <h5 className="font-semibold text-sm">{check.control_name}</h5>
                                            <Badge 
                                              variant={
                                                check.severity === 'critical' ? 'destructive' : 
                                                check.severity === 'high' ? 'destructive' : 
                                                check.severity === 'medium' ? 'secondary' : 
                                                'outline'
                                              }
                                            >
                                              {check.severity}
                                            </Badge>
                                          </div>
                                          <p className="text-xs text-muted-foreground mb-1">
                                            ID: {check.control_id}
                                          </p>
                                          {check.evidence && (
                                            <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                                              {check.evidence}
                                            </p>
                                          )}
                                        </div>
                                        {check.status === 'failed' && (
                                          <Button 
                                            size="sm" 
                                            variant="outline"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              createTicketForCheck(check);
                                            }}
                                            disabled={creatingTicketId === `${check.framework}-${check.control_id}`}
                                            className="gap-2"
                                          >
                                            <Ticket className="h-4 w-4" />
                                            {creatingTicketId === `${check.framework}-${check.control_id}` ? t('common.creating', 'Creating...') : t('compliance.createTicket', 'Create Ticket')}
                                          </Button>
                                        )}
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>

                              {totalPages > 1 && (
                                <div className="flex items-center justify-center gap-2 pt-4">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => ({ ...prev, [framework.id]: Math.max(1, page - 1) }))}
                                    disabled={page === 1}
                                  >
                                    {t('common.previous', 'Previous')}
                                  </Button>
                                  <span className="text-sm text-muted-foreground">
                                    {t('common.page', 'Page')} {page} {t('common.of', 'of')} {totalPages}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => ({ ...prev, [framework.id]: Math.min(totalPages, page + 1) }))}
                                    disabled={page === totalPages}
                                  >
                                    {t('common.next', 'Next')}
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                        </TabsContent>
                      );
                    })}
                  </Tabs>
                ) : (
                  <div className="text-center py-12">
                    <FileCheck className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-xl font-semibold mb-2">{t('compliance.noControlsVerified', 'No controls verified')}</h3>
                    <p className="text-muted-foreground mb-4">
                      {t('compliance.runScanToStart', 'Run a compliance scan in the "Frameworks" tab to get started.')}
                    </p>
                    <Button onClick={() => startComplianceScan.mutate('cis')} disabled={hasRunningScans}>
                      <PlayCircle className="h-4 w-4 mr-2" />
                      {t('compliance.runCisScan', 'Run CIS Scan')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>


          <TabsContent value="trends" className="space-y-6">
            {/* Period Selector */}
            <div className="flex justify-end">
              <Select value={historyDays.toString()} onValueChange={(v) => setHistoryDays(parseInt(v))}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t('compliance.selectPeriod', 'Select period')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">{t('compliance.last7Days', 'Last 7 days')}</SelectItem>
                  <SelectItem value="30">{t('compliance.last30Days', 'Last 30 days')}</SelectItem>
                  <SelectItem value="90">{t('compliance.last90Days', 'Last 90 days')}</SelectItem>
                  <SelectItem value="180">{t('compliance.last180Days', 'Last 180 days')}</SelectItem>
                  <SelectItem value="365">{t('compliance.lastYear', 'Last year')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Trend Summary */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="glass border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <History className="h-4 w-4" />
                    {t('compliance.currentScore', 'Current Score')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingHistory ? (
                    <Skeleton className="h-12 w-20" />
                  ) : (
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-bold">
                        {complianceHistory?.summary?.current_score?.toFixed(1) || '0'}%
                      </span>
                      {complianceHistory?.summary?.score_change !== 0 && (
                        <span className={`text-sm flex items-center gap-1 ${
                          complianceHistory?.summary?.score_change > 0 ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {complianceHistory?.summary?.score_change > 0 ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : (
                            <TrendingDown className="h-4 w-4" />
                          )}
                          {complianceHistory?.summary?.score_change > 0 ? '+' : ''}
                          {complianceHistory?.summary?.score_change?.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="glass border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    {t('compliance.totalScans', 'Total Scans')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingHistory ? (
                    <Skeleton className="h-12 w-16" />
                  ) : (
                    <div className="text-3xl font-bold">
                      {complianceHistory?.total_scans || 0}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="glass border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {t('compliance.criticalFindings', 'Critical Findings')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingHistory ? (
                    <Skeleton className="h-12 w-16" />
                  ) : (
                    <div className="text-3xl font-bold text-red-500">
                      {complianceHistory?.recent_critical_findings?.length || 0}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Compliance Score Trend Chart */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>{t('compliance.scoreTrend', 'Compliance Score Trend')}</CardTitle>
                <CardDescription>
                  {t('compliance.scoreTrendDesc', 'Compliance score evolution over the last')} {historyDays} {t('compliance.days', 'days')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingHistory ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={trendData}>
                      <defs>
                        <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="date" 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        domain={[0, 100]}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="score" 
                        stroke="#3b82f6" 
                        fillOpacity={1} 
                        fill="url(#colorScore)" 
                        name={t('compliance.complianceScore', 'Compliance Score')}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>{t('compliance.noHistoryData', 'No historical data available')}</p>
                      <p className="text-sm mt-1">{t('compliance.runScansForHistory', 'Run compliance scans to build history')}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Framework Trends */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>{t('compliance.frameworkTrends', 'Framework Trends')}</CardTitle>
                <CardDescription>
                  {t('compliance.frameworkTrendsDesc', 'Performance trends by compliance framework')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingHistory ? (
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : complianceHistory?.framework_stats && Object.keys(complianceHistory.framework_stats).length > 0 ? (
                  <div className="space-y-4">
                    {Object.entries(complianceHistory.framework_stats).map(([fwId, stats]: [string, any]) => {
                      const framework = FRAMEWORKS.find(f => f.id === fwId);
                      return (
                        <div key={fwId} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{framework?.icon || '📋'}</span>
                              <span className="font-medium">{framework?.name || fwId.toUpperCase()}</span>
                              {getTrendIcon(stats.trend)}
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-muted-foreground">
                                {t('compliance.scans', 'Scans')}: <span className="font-medium">{stats.total_scans}</span>
                              </span>
                              <span className="text-muted-foreground">
                                {t('compliance.avg', 'Avg')}: <span className="font-medium">{stats.avg_score}%</span>
                              </span>
                              <Badge variant={stats.latest_score >= 80 ? "default" : stats.latest_score >= 60 ? "secondary" : "destructive"}>
                                {t('compliance.latest', 'Latest')}: {stats.latest_score}%
                              </Badge>
                            </div>
                          </div>
                          <Progress value={stats.latest_score} className="h-2" />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('compliance.noFrameworkData', 'No framework data available')}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Critical Findings */}
            {complianceHistory?.recent_critical_findings?.length > 0 && (
              <Card className="glass border-red-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-500">
                    <AlertTriangle className="h-5 w-5" />
                    {t('compliance.recentCritical', 'Recent Critical Findings')}
                  </CardTitle>
                  <CardDescription>
                    {t('compliance.recentCriticalDesc', 'Critical compliance issues that need immediate attention')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {complianceHistory.recent_critical_findings.map((finding: any, index: number) => (
                      <div key={index} className="border-l-4 border-l-red-500 pl-4 py-2">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="destructive">{finding.framework.toUpperCase()}</Badge>
                          <span className="text-xs text-muted-foreground">{finding.control_id}</span>
                        </div>
                        <p className="font-medium text-sm">{finding.control_name}</p>
                        {finding.remediation_steps && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {finding.remediation_steps}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>


          <TabsContent value="analytics" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Compliance Scores Chart */}
              <Card className="glass border-primary/20">
                <CardHeader>
                  <CardTitle>{t('compliance.scoresByFramework', 'Scores by Framework')}</CardTitle>
                  <CardDescription>{t('compliance.comparisonBetween', 'Compliance comparison between frameworks')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-[300px] w-full" />
                  ) : frameworkData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={frameworkData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="name" 
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis 
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          domain={[0, 100]}
                        />
                        <Tooltip 
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Score']}
                        />
                        <Bar dataKey="score" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>{t('compliance.runScansToSeeData', 'Run compliance scans to see data')}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Status Distribution */}
              <Card className="glass border-primary/20">
                <CardHeader>
                  <CardTitle>{t('compliance.statusDistribution', 'Status Distribution')}</CardTitle>
                  <CardDescription>{t('compliance.verifiedControlsStatus', 'Status of verified controls')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-[300px] w-full" />
                  ) : statusDistribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={statusDistribution}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, value }) => `${name}: ${value}`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {statusDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>{t('compliance.runScansToSeeData', 'Run compliance scans to see data')}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Findings by Severity */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>{t('compliance.findingsBySeverity', 'Findings by Severity')}</CardTitle>
                <CardDescription>{t('compliance.breakdownBySeverity', 'Breakdown of failed controls by severity level')}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[200px] w-full" />
                ) : (
                  <div className="grid gap-4 md:grid-cols-4">
                    {['critical', 'high', 'medium', 'low'].map(severity => {
                      const count = complianceChecks?.filter(
                        (c: any) => c.status === 'failed' && c.severity === severity
                      ).length || 0;
                      const colors: Record<string, string> = {
                        critical: 'text-red-600 bg-red-100 dark:bg-red-900/30',
                        high: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30',
                        medium: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30',
                        low: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
                      };
                      return (
                        <div key={severity} className={`rounded-lg p-4 ${colors[severity]}`}>
                          <div className="text-3xl font-bold">{count}</div>
                          <div className="text-sm capitalize">{severity}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>


      {/* Check Detail Dialog */}
      <Dialog open={!!selectedCheck} onOpenChange={() => setSelectedCheck(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedCheck?.status === 'passed' ? (
                <CheckCircle className="w-6 h-6 text-green-500" />
              ) : (
                <XCircle className="w-6 h-6 text-red-500" />
              )}
              {selectedCheck?.control_name}
            </DialogTitle>
            <DialogDescription>
              {t('compliance.framework', 'Framework')}: {FRAMEWORKS.find(f => f.id === selectedCheck?.framework)?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('compliance.controlId', 'Control ID')}</h4>
              <p className="text-sm text-muted-foreground">{selectedCheck?.control_id}</p>
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <h4 className="font-semibold mb-2">{t('compliance.status', 'Status')}</h4>
                <Badge variant={selectedCheck?.status === 'passed' ? 'default' : 'destructive'}>
                  {selectedCheck?.status === 'passed' ? t('compliance.passed', 'Passed') : t('compliance.failed', 'Failed')}
                </Badge>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold mb-2">{t('compliance.severity', 'Severity')}</h4>
                <Badge 
                  variant={
                    selectedCheck?.severity === 'critical' ? 'destructive' : 
                    selectedCheck?.severity === 'high' ? 'destructive' : 
                    selectedCheck?.severity === 'medium' ? 'secondary' : 
                    'outline'
                  }
                >
                  {selectedCheck?.severity}
                </Badge>
              </div>
            </div>

            {selectedCheck?.evidence && (
              <div>
                <h4 className="font-semibold mb-2">{t('compliance.evidence', 'Evidence')}</h4>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedCheck.evidence}
                  </p>
                </div>
              </div>
            )}

            {selectedCheck?.remediation_steps && (
              <div>
                <h4 className="font-semibold mb-2">{t('compliance.remediationSteps', 'Remediation Steps')}</h4>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedCheck.remediation_steps}
                  </p>
                </div>
              </div>
            )}

            {selectedCheck?.status === 'failed' && (
              <div className="flex justify-end pt-4">
                <Button 
                  onClick={() => {
                    createTicketForCheck(selectedCheck);
                    setSelectedCheck(null);
                  }}
                  className="gap-2"
                >
                  <Ticket className="h-4 w-4" />
                  {t('compliance.createRemediationTicket', 'Create Remediation Ticket')}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
