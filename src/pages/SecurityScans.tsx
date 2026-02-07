import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layout } from "@/components/Layout";
import { Checkbox } from "@/components/ui/checkbox";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuthSafe } from "@/hooks/useAuthSafe";
import { useDemoAwareQuery } from "@/hooks/useDemoAwareQuery";
import { ScheduleTab } from "@/components/security/ScheduleTab";
import { 
 Scan, 
 Shield, 
 AlertTriangle, 
 CheckCircle,
 XCircle,
 Clock,
 Play,
 RefreshCw,
 Download,
 Eye,
 Bug,
 Zap,
 Activity,
 ChevronLeft,
 ChevronRight,
 ChevronsLeft,
 ChevronsRight,
 Ticket,
 CheckSquare
} from "lucide-react";

interface SecurityScan {
 id: string;
 scan_type: string;
 status: string;
 started_at: string;
 completed_at: string | null;
 findings_count: number | null;
 critical_count: number | null;
 high_count: number | null;
 medium_count: number | null;
 low_count: number | null;
 scan_config: any;
 created_at: string;
}

interface ScanFinding {
 id: string;
 organization_id: string;
 aws_account_id: string | null;
 severity: 'critical' | 'high' | 'medium' | 'low';
 description: string;
 details: any;
 status: string;
 source: string | null;
 resource_id: string | null;
 resource_arn: string | null;
 scan_type: string | null;
 service: string | null;
 category: string | null;
 compliance: string[];
 remediation: string | null;
 risk_vector: string | null;
 evidence: any;
 remediation_ticket_id: string | null; // Link to ticket
 created_at: string;
}

export default function SecurityScans() {
 const { toast } = useToast();
 const { t } = useTranslation();
 const navigate = useNavigate();
 const queryClient = useQueryClient();
 const { selectedAccountId, selectedProvider } = useCloudAccount();
 const { getAccountFilter } = useAccountFilter();
 const { data: organizationId } = useOrganization();
 const { user } = useAuthSafe();
 const { shouldEnableAccountQuery, isInDemoMode } = useDemoAwareQuery();
 const [selectedScanType, setSelectedScanType] = useState<string>('all');
 const [currentPage, setCurrentPage] = useState<number>(1);
 const [itemsPerPage, setItemsPerPage] = useState<number>(10);
 
 // Findings filters
 const [severityFilter, setSeverityFilter] = useState<string>('all');
 const [serviceFilter, setServiceFilter] = useState<string>('all');
 const [categoryFilter, setCategoryFilter] = useState<string>('all');
 const [searchQuery, setSearchQuery] = useState<string>('');
 const [findingsPage, setFindingsPage] = useState<number>(1);

 // Ticket creation states
 const [selectedFindings, setSelectedFindings] = useState<string[]>([]);
 const [creatingTicketId, setCreatingTicketId] = useState<string | null>(null);
 const [creatingBatchTickets, setCreatingBatchTickets] = useState(false);

 // Get security scans - supports demo mode
 const { data: scanData, isLoading, refetch } = useQuery<{ scans: SecurityScan[], total: number }>({
 queryKey: ['security-scans', organizationId, selectedAccountId, selectedScanType, currentPage, itemsPerPage, isInDemoMode],
 enabled: shouldEnableAccountQuery(),
 staleTime: 10 * 1000, // 10 seconds - faster updates for running scans
 refetchInterval: (query) => {
 // Auto-refresh every 5 seconds if there are running or pending scans (not in demo mode)
 if (isInDemoMode) return false;
 const data = query.state.data as { scans: SecurityScan[], total: number } | undefined;
 const hasActiveScans = data?.scans?.some((scan: SecurityScan) => 
   scan.status === 'running' || scan.status === 'pending'
 );
 return hasActiveScans ? 5000 : false;
 },
 queryFn: async (): Promise<{ scans: SecurityScan[], total: number }> => {
 console.log('SecurityScans: Fetching scans', { organizationId, selectedAccountId, selectedScanType, currentPage, itemsPerPage, isInDemoMode });
 
 // DEMO MODE: Return demo scans data
 if (isInDemoMode) {
 console.log('SecurityScans: Using demo data');
 const now = new Date();
 const demoScans: SecurityScan[] = [
   {
     id: 'demo-scan-001',
     scan_type: 'deep',
     status: 'completed',
     started_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
     completed_at: new Date(now.getTime() - 1.5 * 60 * 60 * 1000).toISOString(),
     findings_count: 30,
     critical_count: 2,
     high_count: 5,
     medium_count: 8,
     low_count: 15,
     scan_config: { level: 'deep', frameworks: ['CIS', 'LGPD', 'PCI-DSS'] },
     created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
   },
   {
     id: 'demo-scan-002',
     scan_type: 'standard',
     status: 'completed',
     started_at: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
     completed_at: new Date(now.getTime() - 23.5 * 60 * 60 * 1000).toISOString(),
     findings_count: 25,
     critical_count: 1,
     high_count: 4,
     medium_count: 10,
     low_count: 10,
     scan_config: { level: 'standard', frameworks: ['CIS'] },
     created_at: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
   },
   {
     id: 'demo-scan-003',
     scan_type: 'quick',
     status: 'completed',
     started_at: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
     completed_at: new Date(now.getTime() - 47.9 * 60 * 60 * 1000).toISOString(),
     findings_count: 18,
     critical_count: 2,
     high_count: 3,
     medium_count: 6,
     low_count: 7,
     scan_config: { level: 'quick' },
     created_at: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
   }
 ];
 return { scans: demoScans, total: demoScans.length };
 }
 
 let filters: any = { 
 organization_id: organizationId,
 ...getAccountFilter() // Multi-cloud compatible filter
 };

 if (selectedScanType !== 'all') {
 filters.scan_type = selectedScanType;
 }

 // Calculate offset for pagination
 const offset = (currentPage - 1) * itemsPerPage;

 const response = await apiClient.select('security_scans', {
 select: '*',
 eq: filters,
 order: { column: 'created_at', ascending: false },
 limit: itemsPerPage,
 offset: offset
 });

 console.log('SecurityScans: API response', { error: response.error, dataLength: response.data?.length, data: response.data });

 if (response.error) {
 throw new Error(response.error.message || 'Error fetching scans');
 }

 // Get total count for pagination (separate query)
 const countResponse = await apiClient.select('security_scans', {
 select: 'id',
 eq: filters
 });
 
 const totalCount = countResponse.data?.length || 0;

 // Ensure we always return an array
 const scans = Array.isArray(response.data) ? response.data as SecurityScan[] : [];
 return { scans, total: totalCount };
 },
 });

 const scans: SecurityScan[] = scanData?.scans || [];
 const totalScans = scanData?.total || 0;
 const totalPages = Math.ceil(totalScans / itemsPerPage);

 // Auto-refresh findings when scans transition from running/pending to completed
 const hadActiveScansRef = useRef(false);
 const hasActiveScans = scans.some(s => s.status === 'running' || s.status === 'pending');

 useEffect(() => {
 if (hasActiveScans) {
   hadActiveScansRef.current = true;
 } else if (hadActiveScansRef.current && scans.length > 0) {
   // Scans just finished - invalidate findings so the tab shows fresh data
   hadActiveScansRef.current = false;
   queryClient.invalidateQueries({ queryKey: ['scan-findings'] });
   queryClient.invalidateQueries({ queryKey: ['security-findings'] });
 }
 }, [hasActiveScans, scans.length, queryClient]);

 // Reset to first page when filters change
 const handleScanTypeChange = (scanType: string) => {
 setSelectedScanType(scanType);
 setCurrentPage(1);
 };

 const handleItemsPerPageChange = (value: string) => {
 setItemsPerPage(parseInt(value));
 setCurrentPage(1);
 };

 const goToPage = (page: number) => {
 setCurrentPage(Math.max(1, Math.min(page, totalPages)));
 };

 // Get scan findings - uses Lambda with demo mode support
 const { data: findings, isLoading: findingsLoading } = useQuery<ScanFinding[]>({
 queryKey: ['scan-findings', organizationId, selectedAccountId, isInDemoMode],
 // In demo mode, always enable the query (backend returns demo findings)
 // In normal mode, only enable if there are scans
 enabled: shouldEnableAccountQuery() && (isInDemoMode || (scans && scans.length > 0)),
 staleTime: 2 * 60 * 1000,
 queryFn: async (): Promise<ScanFinding[]> => {
 console.log('SecurityScans: Fetching findings', { organizationId, selectedAccountId, isInDemoMode });
 
 // Use get-findings Lambda which supports demo mode
 const response = await apiClient.invoke<{
   _isDemo?: boolean;
   findings: ScanFinding[];
   pagination: { total: number };
   summary: { total: number; critical: number; high: number; medium: number; low: number };
 }>('get-findings', {});
 
 if ('error' in response && response.error) {
   console.error('Error fetching findings:', response.error);
   return [];
 }
 
 const data = response.data;
 if (data?._isDemo) {
   console.log('SecurityScans findings: Using demo data from backend', { findingsCount: data.findings?.length });
 }
 
 return data?.findings || [];
 },
 });

 // Start new scan using Security Engine V3 - supports both AWS and Azure
 const startScanMutation = useMutation({
 mutationFn: async ({ scanLevel }: { scanLevel: 'quick' | 'standard' | 'deep' }) => {
 const isAzure = selectedProvider === 'AZURE';
 console.log('🔍 Starting security scan...', { scanLevel, selectedAccountId, provider: selectedProvider });
 
 // Call the appropriate Lambda based on provider
 const lambdaName = isAzure ? 'start-azure-security-scan' : 'start-security-scan';
 const bodyParam = isAzure 
 ? { credentialId: selectedAccountId, scanLevel }
 : { accountId: selectedAccountId, scanLevel };
 
 const response = await apiClient.invoke(lambdaName, {
 body: bodyParam
 });

 console.log('📊 Security scan response:', response);

 if (response.error) {
 console.error('❌ Security scan error:', response.error);
 throw new Error(getErrorMessage(response.error));
 }

 return response.data;
 },
 onSuccess: () => {
 const providerName = selectedProvider === 'AZURE' ? 'Azure' : 'AWS';
 toast({
 title: t('securityScans.scanStarted', 'Security Scan Started'),
 description: t('securityScans.scanStartedDesc', 'The {{provider}} security scan was started successfully. It will begin processing shortly.', { provider: providerName }),
 });
 
 // Invalidate and refetch immediately to show the pending scan
 // The refetchInterval will auto-refresh every 5 seconds while scan is pending/running
 queryClient.invalidateQueries({ queryKey: ['security-scans'] });
 queryClient.invalidateQueries({ queryKey: ['security-scan-history'] });
 refetch();
 },
 onError: (error) => {
 console.error('❌ Start scan mutation error:', error);
 
 let errorMessage = error instanceof Error ? error.message : t('common.unknownError', 'Unknown error');
 const isAzure = selectedProvider === 'AZURE';
 
 // Mensagens de erro mais amigáveis
 if (errorMessage.includes('No AWS credentials') || errorMessage.includes('No Azure credentials')) {
 errorMessage = isAzure 
 ? t('securityScans.noAzureCredentials', 'No active Azure credentials found. Please add Azure credentials before starting the scan.')
 : t('securityScans.noAwsCredentials', 'No active AWS credentials found. Please add AWS credentials before starting the scan.');
 } else if (errorMessage.includes('Já existe um scan') || errorMessage.includes('already running')) {
 errorMessage = t('securityScans.scanAlreadyRunning', 'A security scan is already running. Wait for it to complete before starting a new one.');
 }
 
 toast({
 title: t('securityAnalysis.errorStartingScan', 'Error starting scan'),
 description: errorMessage,
 variant: "destructive"
 });
 }
 });

 const handleStartScan = (scanLevel: 'quick' | 'standard' | 'deep') => {
 startScanMutation.mutate({ scanLevel });
 };

 const handleRefresh = async () => {
 try {
 await refetch();
 toast({
 title: t('securityScans.dataUpdated', 'Data updated'),
 description: t('securityScans.scansUpdated', 'Security scans have been updated.'),
 });
 } catch (error) {
 toast({
 title: t('common.errorUpdating', 'Error updating'),
 description: t('common.couldNotUpdateData', 'Could not update data.'),
 variant: "destructive"
 });
 }
 };

 const exportFindings = () => {
 if (!findings || findings.length === 0) return;

 // Helper function to escape CSV values
 const escapeCSV = (value: any): string => {
 if (value === null || value === undefined) return '';
 const str = String(value);
 // Escape quotes and wrap in quotes if contains comma, quote, or newline
 if (str.includes(',') || str.includes('"') || str.includes('\n')) {
 return `"${str.replace(/"/g, '""')}"`;
 }
 return str;
 };

 // Helper to extract title from details or use description
 const getTitle = (finding: any): string => {
 if (finding.details?.title) return finding.details.title;
 if (finding.details?.check_name) return finding.details.check_name;
 if (finding.description && finding.description.length <= 100) return finding.description;
 return finding.description?.substring(0, 100) + '...' || 'N/A';
 };

 // Helper to extract resource type from details or resource_arn
 const getResourceType = (finding: any): string => {
 if (finding.details?.resource_type) return finding.details.resource_type;
 if (finding.service) return finding.service;
 if (finding.resource_arn) {
 const arnParts = finding.resource_arn.split(':');
 return arnParts[2] || 'Unknown';
 }
 return 'N/A';
 };

 // Helper to extract region from details or resource_arn
 const getRegion = (finding: any): string => {
 if (finding.details?.region) return finding.details.region;
 if (finding.resource_arn) {
 const arnParts = finding.resource_arn.split(':');
 return arnParts[3] || 'global';
 }
 return 'N/A';
 };

 // Helper to format compliance standards
 const getCompliance = (finding: any): string => {
 if (finding.compliance && Array.isArray(finding.compliance)) {
 return finding.compliance.join('; ');
 }
 if (finding.details?.compliance_standards && Array.isArray(finding.details.compliance_standards)) {
 return finding.details.compliance_standards.join('; ');
 }
 return '';
 };

 // Helper to get remediation text
 const getRemediation = (finding: any): string => {
 if (!finding.remediation) return '';
 try {
 const rem = typeof finding.remediation === 'string' 
 ? JSON.parse(finding.remediation) 
 : finding.remediation;
 if (rem.description) return rem.description;
 if (rem.steps && Array.isArray(rem.steps)) return rem.steps.join(' -> ');
 return String(finding.remediation);
 } catch {
 return String(finding.remediation);
 }
 };

 const csvContent = [
 'Severidade,Título,Descrição,Serviço,Categoria,Tipo de Recurso,ID do Recurso,ARN do Recurso,Região,Compliance,Status,Remediação,Risk Vector,Data',
 ...findings.map(finding => [
 escapeCSV(finding.severity),
 escapeCSV(getTitle(finding)),
 escapeCSV(finding.description),
 escapeCSV(finding.service || 'N/A'),
 escapeCSV(finding.category || 'N/A'),
 escapeCSV(getResourceType(finding)),
 escapeCSV(finding.resource_id || 'N/A'),
 escapeCSV(finding.resource_arn || 'N/A'),
 escapeCSV(getRegion(finding)),
 escapeCSV(getCompliance(finding)),
 escapeCSV(finding.status || 'new'),
 escapeCSV(getRemediation(finding)),
 escapeCSV(finding.risk_vector || 'N/A'),
 escapeCSV(finding.created_at ? new Date(finding.created_at).toLocaleString('pt-BR') : 'N/A')
 ].join(','))
 ].join('\n');

 // Add BOM for Excel UTF-8 compatibility
 const BOM = '\uFEFF';
 const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
 const link = document.createElement('a');
 link.href = URL.createObjectURL(blob);
 const accountSuffix = selectedAccountId ? `_${selectedAccountId}` : '';
 link.download = `security_findings${accountSuffix}_${new Date().toISOString().split('T')[0]}.csv`;
 link.click();

 toast({
 title: t('securityScans.reportExported', 'Report exported'),
 description: t('securityScans.findingsExportedSuccess', '{{count}} security findings were exported successfully.', { count: findings.length }),
 });
 };

 const getStatusIcon = (status: string) => {
 switch (status) {
 case 'pending': return <Clock className="h-4 w-4 text-yellow-500 animate-pulse" />;
 case 'running': return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
 case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
 case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
 case 'scheduled': return <Clock className="h-4 w-4 text-yellow-500" />;
 default: return <Clock className="h-4 w-4 text-gray-500" />;
 }
 };

 const getStatusBadge = (status: string) => {
 switch (status) {
 case 'pending': return <Badge className="bg-yellow-500">{t('securityScans.statusPending', 'Pending')}</Badge>;
 case 'running': return <Badge className="bg-blue-500">{t('securityScans.statusRunning', 'Running')}</Badge>;
 case 'completed': return <Badge className="bg-green-500">{t('securityScans.statusCompleted', 'Completed')}</Badge>;
 case 'failed': return <Badge variant="destructive">{t('securityScans.statusFailed', 'Failed')}</Badge>;
 case 'scheduled': return <Badge variant="secondary">{t('securityScans.statusScheduled', 'Scheduled')}</Badge>;
 default: return <Badge variant="outline">{status}</Badge>;
 }
 };

 const getSeverityIcon = (severity: string) => {
 switch (severity) {
 case 'critical': return <XCircle className="h-4 w-4 text-red-600" />;
 case 'high': return <AlertTriangle className="h-4 w-4 text-red-500" />;
 case 'medium': return <Eye className="h-4 w-4 text-yellow-500" />;
 case 'low': return <CheckCircle className="h-4 w-4 text-green-500" />;
 default: return <Bug className="h-4 w-4 text-gray-500" />;
 }
 };

 // Toggle finding selection
 const toggleFindingSelection = (findingId: string) => {
 setSelectedFindings(prev => 
 prev.includes(findingId) 
 ? prev.filter(id => id !== findingId)
 : [...prev, findingId]
 );
 };

 // Select all findings on current page
 const selectAllFindings = (filteredFindings: ScanFinding[]) => {
 const allIds = filteredFindings.map(f => f.id);
 const allSelected = allIds.every(id => selectedFindings.includes(id));
 
 if (allSelected) {
 setSelectedFindings(prev => prev.filter(id => !allIds.includes(id)));
 } else {
 setSelectedFindings(prev => [...new Set([...prev, ...allIds])]);
 }
 };

 // Create ticket for a single finding
 const createTicketForFinding = async (finding: ScanFinding) => {
 if (creatingTicketId === finding.id) return;
 
 // Check if finding already has a ticket
 if (finding.remediation_ticket_id) {
 toast({ 
 title: t('securityPosture.ticketAlreadyExists', 'Ticket já existe'),
 description: t('securityPosture.ticketAlreadyExistsDesc', 'Este achado já possui um ticket de remediação vinculado'),
 variant: "destructive" 
 });
 return;
 }
 
 setCreatingTicketId(finding.id);
 
 try {
 const getTitle = () => {
 if (finding.details?.title) return finding.details.title;
 if (finding.details?.check_name) return finding.details.check_name;
 if (finding.description && finding.description.length <= 100) return finding.description;
 return finding.description?.substring(0, 100) + '...' || 'N/A';
 };

 const response = await apiClient.insert('remediation_tickets', {
 organization_id: organizationId,
 aws_account_id: finding.aws_account_id || selectedAccountId || null,
 title: `[${finding.severity.toUpperCase()}] ${getTitle()}`,
 description: finding.description + (finding.remediation ? `\n\nRemediação: ${typeof finding.remediation === 'string' ? finding.remediation : JSON.stringify(finding.remediation)}` : ''),
 severity: finding.severity,
 priority: finding.severity === 'critical' ? 'urgent' : finding.severity === 'high' ? 'high' : 'medium',
 status: 'open',
 category: 'security',
 created_by: user?.email || 'system',
 finding_ids: [finding.id],
 affected_resources: finding.resource_arn ? [finding.resource_arn] : finding.resource_id ? [finding.resource_id] : [],
 metadata: {
 service: finding.service,
 category: finding.category,
 compliance: finding.compliance,
 source: finding.source
 }
 });

 if ('error' in response && response.error) {
 console.error('Error creating ticket:', response.error);
 throw new Error(response.error.message || 'Failed to create ticket');
 }

 // Get the created ticket ID and update the finding
 const ticketId = response.data?.id;
 if (ticketId) {
 // Update the finding with the ticket ID to create the bidirectional link
 // apiClient.update expects (table, data, where)
 await apiClient.update('findings', { remediation_ticket_id: ticketId }, { id: finding.id });
 }

 toast({ 
 title: t('dashboard.ticketCreated', 'Ticket criado'),
 description: t('dashboard.ticketCreatedSuccess', 'Ticket de remediação criado com sucesso')
 });
 
 // Invalidate queries to refresh the data
 queryClient.invalidateQueries({ queryKey: ['remediation-tickets'], refetchType: 'all' });
 queryClient.invalidateQueries({ queryKey: ['scan-findings'] });
 queryClient.invalidateQueries({ queryKey: ['security-findings'] });
 } catch (err) {
 console.error('Error creating ticket:', err);
 toast({ 
 title: t('dashboard.errorCreatingTicket', 'Erro ao criar ticket'),
 description: err instanceof Error ? err.message : 'Erro desconhecido',
 variant: "destructive" 
 });
 } finally {
 setCreatingTicketId(null);
 }
 };

 // Create tickets for selected findings
 const createTicketsForSelected = async () => {
 if (selectedFindings.length === 0) {
 toast({ 
 title: t('securityPosture.selectAtLeastOne', 'Selecione pelo menos um finding'), 
 variant: "destructive" 
 });
 return;
 }

 setCreatingBatchTickets(true);
 
 try {
 const findingsToCreate = findings?.filter(f => 
 selectedFindings.includes(f.id) && !f.remediation_ticket_id // Skip findings that already have tickets
 ) || [];

 if (findingsToCreate.length === 0) {
 toast({ 
 title: t('securityPosture.allHaveTickets', 'Todos os achados selecionados já possuem tickets'),
 variant: "destructive" 
 });
 setCreatingBatchTickets(false);
 return;
 }

 let createdCount = 0;
 for (const finding of findingsToCreate) {
 await createTicketForFinding(finding);
 createdCount++;
 }

 toast({ 
 title: t('securityPosture.ticketsCreatedCount', '{{count}} ticket(s) criado(s) com sucesso', { count: createdCount })
 });
 setSelectedFindings([]);
 } catch (error) {
 toast({ 
 title: t('compliance.ticketsError', 'Erro ao criar tickets'), 
 variant: "destructive" 
 });
 } finally {
 setCreatingBatchTickets(false);
 }
 };

 const getSeverityBadge = (severity: string) => {
 switch (severity) {
 case 'critical': return <Badge variant="destructive">{t('securityScans.severityCritical', 'Critical')}</Badge>;
 case 'high': return <Badge variant="destructive">{t('securityScans.severityHigh', 'High')}</Badge>;
 case 'medium': return <Badge variant="secondary">{t('securityScans.severityMedium', 'Medium')}</Badge>;
 case 'low': return <Badge variant="outline">{t('securityScans.severityLow', 'Low')}</Badge>;
 default: return <Badge variant="outline">{severity}</Badge>;
 }
 };

 const getScanTypeIcon = (scanType: string) => {
 if (scanType.includes('quick')) return <Zap className="h-5 w-5 text-yellow-500" />;
 if (scanType.includes('standard')) return <Shield className="h-5 w-5 text-blue-500" />;
 if (scanType.includes('deep')) return <Activity className="h-5 w-5 text-purple-500" />;
 return <Scan className="h-5 w-5 text-gray-500" />;
 };

 // Calculate summary metrics - ensure scans is always an array
 const scansArray = scans || [];
 
 // Detect stuck scans (running/pending for more than 60 minutes)
 const STUCK_SCAN_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes
 const now = Date.now();
 
 // Include both running and pending scans in active scan detection
 const activeScansData = scansArray.filter(scan => scan.status === 'running' || scan.status === 'pending');
 const stuckScans = activeScansData.filter(scan => {
 const scanTime = scan.started_at ? new Date(scan.started_at).getTime() : new Date(scan.created_at).getTime();
 return (now - scanTime) > STUCK_SCAN_THRESHOLD_MS;
 });
 const activeScans = activeScansData.filter(scan => {
 const scanTime = scan.started_at ? new Date(scan.started_at).getTime() : new Date(scan.created_at).getTime();
 return (now - scanTime) <= STUCK_SCAN_THRESHOLD_MS;
 });
 
 const runningScans = activeScansData.length;
 const hasStuckScan = stuckScans.length > 0;
 const hasActiveRunningScan = activeScans.length > 0;
 // Only block new scans if there's an ACTIVE running/pending scan (not stuck)
 const hasRunningScan = hasActiveRunningScan;
 
 const completedScans = scansArray.filter(scan => scan.status === 'completed').length;
 const totalFindings = scansArray.reduce((sum, scan) => sum + (scan.findings_count || 0), 0);
 const criticalFindings = scansArray.reduce((sum, scan) => sum + (scan.critical_count || 0), 0);

 // Mutation to cleanup stuck scans
 const cleanupStuckScansMutation = useMutation({
 mutationFn: async () => {
 // Update stuck scans to failed status via mutate-table
 const stuckScanIds = stuckScans.map(s => s.id);
 
 for (const scanId of stuckScanIds) {
 // apiClient.update expects (table, data, where)
 await apiClient.update('security_scans', {
 status: 'failed',
 completed_at: new Date().toISOString(),
 results: {
 error: 'Scan timeout - automatically marked as failed after 60 minutes',
 cleanup_reason: 'stuck_scan_auto_cleanup',
 cleanup_timestamp: new Date().toISOString()
 }
 }, { id: scanId });
 }
 
 return { cleaned: stuckScanIds.length };
 },
 onSuccess: (data) => {
 toast({
 title: t('securityScans.stuckScansCleared', 'Stuck scans cleared'),
 description: t('securityScans.stuckScansClearedDesc', '{{count}} scan(s) were marked as failed and you can start a new scan.', { count: data.cleaned }),
 });
 queryClient.invalidateQueries({ queryKey: ['security-scans'] });
 refetch();
 },
 onError: (error) => {
 toast({
 title: t('securityScans.errorClearingScans', 'Error clearing scans'),
 description: error instanceof Error ? error.message : t('common.unknownError', 'Unknown error'),
 variant: "destructive"
 });
 }
 });

 const scanLevels = [
 { 
 value: 'quick', 
 label: t('securityScans.quickScan', 'Quick Scan'), 
 description: t('securityScans.quickScanDesc', 'Essential security checks'),
 icon: <Zap className="h-6 w-6" />,
 checks: '50+',
 time: '5-10 min',
 color: 'yellow',
 bgColor: 'bg-yellow-500/10',
 borderColor: 'border-yellow-500/30',
 hoverBg: 'hover:bg-yellow-500/20',
 iconColor: 'text-yellow-500',
 buttonBg: 'bg-yellow-500 hover:bg-yellow-600'
 },
 { 
 value: 'standard', 
 label: t('securityScans.standardScan', 'Standard Scan'), 
 description: t('securityScans.standardScanDesc', 'Complete AWS security analysis'),
 icon: <Shield className="h-6 w-6" />,
 checks: '120+',
 time: '15-30 min',
 color: 'blue',
 bgColor: 'bg-blue-500/10',
 borderColor: 'border-blue-500/30',
 hoverBg: 'hover:bg-blue-500/20',
 iconColor: 'text-blue-500',
 buttonBg: 'bg-blue-500 hover:bg-blue-600'
 },
 { 
 value: 'deep', 
 label: t('securityScans.deepScan', 'Deep Scan'), 
 description: t('securityScans.deepScanDesc', 'Deep analysis with compliance frameworks'),
 icon: <Activity className="h-6 w-6" />,
 checks: '170+',
 time: '30-60 min',
 color: 'purple',
 bgColor: 'bg-purple-500/10',
 borderColor: 'border-purple-500/30',
 hoverBg: 'hover:bg-purple-500/20',
 iconColor: 'text-purple-500',
 buttonBg: 'bg-purple-500 hover:bg-purple-600'
 }
 ];

 return (
 <Layout 
 title={t('sidebar.securityScan', 'Security Scan')} 
 description={t('securityScan.fullDescription', 'Análise completa de segurança AWS com 23 scanners de serviços, 170+ verificações e suporte a 6 frameworks de compliance')}
 icon={<Shield className="h-4 w-4" />}
 >
 <div className="space-y-6">
 {/* Action Buttons */}
 <div className="flex items-center justify-end gap-2">
 <Button 
 variant="outline" 
 size="sm" 
 onClick={handleRefresh}
 disabled={isLoading}
 >
 <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
 {isLoading ? t('common.updating', 'Updating...') : t('common.refresh', 'Refresh')}
 </Button>
 <Button 
 variant="outline" 
 size="sm" 
 onClick={exportFindings}
 disabled={!findings || findings.length === 0}
 >
 <Download className="h-4 w-4 mr-2" />
 {t('securityScans.exportFindings', 'Export Findings')}
 </Button>
 </div>

 {/* Stuck Scans Alert */}
 {hasStuckScan && (
 <Card className=" border-orange-500/50 bg-orange-500/10">
 <CardContent className="pt-6">
 <div className="flex items-center justify-between gap-4">
 <div className="flex items-center gap-3">
 <AlertTriangle className="h-6 w-6 text-orange-500" />
 <div>
 <h4 className="font-semibold text-orange-600 dark:text-orange-400">
 {t('securityScans.stuckScansDetected', '{{count}} stuck scan(s) detected', { count: stuckScans.length })}
 </h4>
 <p className="text-sm text-muted-foreground">
 {t('securityScans.stuckScansDescription', 'These scans have been running for more than 60 minutes and probably failed silently. Clear them to start new scans.')}
 </p>
 </div>
 </div>
 <Button
 variant="outline"
 size="sm"
 onClick={() => cleanupStuckScansMutation.mutate()}
 disabled={cleanupStuckScansMutation.isPending}
 className="border-orange-500/50 text-orange-600 hover:bg-orange-500/20"
 >
 {cleanupStuckScansMutation.isPending ? (
 <>
 <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
 {t('securityScans.clearing', 'Clearing...')}
 </>
 ) : (
 <>
 <XCircle className="h-4 w-4 mr-2" />
 {t('securityScans.clearStuckScans', 'Clear Stuck Scans')}
 </>
 )}
 </Button>
 </div>
 </CardContent>
 </Card>
 )}

 {/* Summary Cards */}
 <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
 <Card className="transition-all duration-300">
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-medium text-muted-foreground">{t('securityScans.scansRunning', 'Scans Running')}</CardTitle>
 </CardHeader>
 <CardContent>
 {isLoading ? (
 <Skeleton className="h-8 w-12" />
 ) : (
 <div className="text-2xl font-semibold text-blue-500 animate-pulse">{runningScans}</div>
 )}
 </CardContent>
 </Card>

 <Card className="transition-all duration-300">
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-medium text-muted-foreground">{t('securityScans.scansCompleted', 'Scans Completed')}</CardTitle>
 </CardHeader>
 <CardContent>
 {isLoading ? (
 <Skeleton className="h-8 w-12" />
 ) : (
 <div className="text-2xl font-semibold text-green-500">{completedScans}</div>
 )}
 </CardContent>
 </Card>

 <Card className="transition-all duration-300">
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-medium text-muted-foreground">{t('securityScans.totalFindings', 'Total Findings')}</CardTitle>
 </CardHeader>
 <CardContent>
 {isLoading ? (
 <Skeleton className="h-8 w-12" />
 ) : (
 <div className="text-2xl font-semibold">{totalFindings}</div>
 )}
 </CardContent>
 </Card>

 <Card className="transition-all duration-300">
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-medium text-muted-foreground">{t('securityScans.criticalFindings', 'Critical Findings')}</CardTitle>
 </CardHeader>
 <CardContent>
 {isLoading ? (
 <Skeleton className="h-8 w-12" />
 ) : (
 <div className="text-2xl font-semibold text-red-500">{criticalFindings}</div>
 )}
 </CardContent>
 </Card>
 </div>

 {/* Quick Actions */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Play className="h-5 w-5 text-primary" />
 {t('securityScans.startSecurityScan', 'Start Security Scan')}
 </CardTitle>
 <CardDescription>
 {t('securityScans.startScanDescription', 'Click on one of the cards below to start the scan. Security Engine V3 supports CIS, Well-Architected, PCI-DSS, NIST, LGPD and SOC2.')}
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
 {scanLevels.map((scanLevel) => {
 const isCurrentlyStarting = startScanMutation.isPending;
 const isDisabled = isCurrentlyStarting || hasRunningScan;
 
 return (
 <div
 key={scanLevel.value}
 onClick={() => !isDisabled && handleStartScan(scanLevel.value as 'quick' | 'standard' | 'deep')}
 className={`
 relative overflow-hidden rounded-xl border-2 p-6 
 transition-all duration-300 
 ${isDisabled 
 ? 'opacity-60 cursor-not-allowed border-muted bg-muted/20' 
 : `cursor-pointer ${scanLevel.bgColor} ${scanLevel.borderColor} ${scanLevel.hoverBg} hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]`
 }
 `}
 role="button"
 tabIndex={isDisabled ? -1 : 0}
 onKeyDown={(e) => {
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault();
 if (!isDisabled) handleStartScan(scanLevel.value as 'quick' | 'standard' | 'deep');
 }
 }}
 >
 {/* Decorative gradient */}
 <div className={`absolute top-0 right-0 w-32 h-32 ${scanLevel.bgColor} rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2`} />
 
 <div className="relative space-y-4">
 {/* Icon and Badge */}
 <div className="flex items-start justify-between">
 <div className={`p-3 rounded-xl ${scanLevel.bgColor} ${scanLevel.iconColor}`}>
 {isCurrentlyStarting ? (
 <RefreshCw className="h-6 w-6 animate-spin" />
 ) : hasRunningScan ? (
 <Clock className="h-6 w-6 text-muted-foreground" />
 ) : (
 scanLevel.icon
 )}
 </div>
 <Badge variant="secondary" className="text-xs font-mono">
 {scanLevel.checks} checks
 </Badge>
 </div>
 
 {/* Title and Description */}
 <div className="space-y-2">
 <h3 className="font-semibold text-lg">
 {hasRunningScan ? t('securityScans.scanInExecution', 'Scan in Execution') : scanLevel.label}
 </h3>
 <p className="text-sm text-muted-foreground leading-relaxed">
 {hasRunningScan 
 ? t('securityScans.waitForCompletion', 'Wait for the current scan to complete before starting a new one.')
 : scanLevel.description
 }
 </p>
 </div>
 
 {/* Footer with time and CTA */}
 {!hasRunningScan && (
 <div className="flex items-center justify-between pt-2">
 <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
 <Clock className="h-4 w-4" />
 <span>{scanLevel.time}</span>
 </div>
 <div className={`flex items-center gap-1.5 text-sm font-medium ${scanLevel.iconColor}`}>
 <span>{t('securityScans.start', 'Start')}</span>
 <Play className="h-4 w-4" />
 </div>
 </div>
 )}
 </div>
 </div>
 );
 })}
 </div>
 
 <div className="mt-6 p-4 bg-muted/30 rounded-lg hover:bg-gray-50">
 <h4 className="font-semibold mb-2 flex items-center gap-2 text-sm">
 <Shield className="h-4 w-4" />
 {t('securityScans.securityEngineFeatures', 'Security Engine V3 Features')}
 </h4>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
 <div>
 <strong>{t('securityScans.awsServices', '23 AWS Services')}:</strong> EC2, S3, IAM, RDS, Lambda, CloudTrail, GuardDuty, Config, CloudFormation, {t('securityScans.andMore', 'and more')}
 </div>
 <div>
 <strong>{t('securityScans.complianceFrameworks', '6 Compliance Frameworks')}:</strong> CIS, Well-Architected, PCI-DSS, NIST, LGPD, SOC2
 </div>
 <div>
 <strong>{t('securityScans.securityChecks', '170+ Security Checks')}:</strong> {t('securityScans.checksDescription', 'Configurations, permissions, encryption, network, logging')}
 </div>
 <div>
 <strong>{t('securityScans.multiRegion', 'Multi-Region')}:</strong> {t('securityScans.multiRegionDesc', 'Automatic analysis in all configured regions')}
 </div>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Main Content */}
 <Tabs defaultValue="scans" className="w-full">
 <TabsList className="glass-card-float">
 <TabsTrigger value="scans">{t('securityScans.scanHistory', 'Scan History')}</TabsTrigger>
 <TabsTrigger value="findings">{t('securityScans.findings', 'Findings')}</TabsTrigger>
 <TabsTrigger value="schedule">{t('securityScans.schedule', 'Schedule')}</TabsTrigger>
 </TabsList>

 <TabsContent value="scans" className="space-y-4">
 {/* Filters */}
 <Card>
 <CardContent className="pt-6">
 <div className="flex items-center gap-4">
 <div className="flex-1">
 <Select value={selectedScanType} onValueChange={handleScanTypeChange}>
 <SelectTrigger className="glass-card-float">
 <SelectValue placeholder={t('securityScans.filterByScanType', 'Filter by scan type')} />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">{t('securityScans.allLevels', 'All Levels')}</SelectItem>
 <SelectItem value="quick">{t('securityScans.quickScan', 'Quick Scan')}</SelectItem>
 <SelectItem value="standard">{t('securityScans.standardScan', 'Standard Scan')}</SelectItem>
 <SelectItem value="deep">{t('securityScans.deepScan', 'Deep Scan')}</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Scans List */}
 <Card>
 <CardHeader>
 <CardTitle>{t('securityScans.scanHistory', 'Scan History')}</CardTitle>
 <CardDescription>{t('securityScans.scanHistoryDesc', 'List of all executed scans')}</CardDescription>
 </CardHeader>
 <CardContent>
 {isLoading ? (
 <div className="space-y-4">
 {[...Array(5)].map((_, i) => (
 <Skeleton key={i} className="h-24 w-full" />
 ))}
 </div>
 ) : scans.length > 0 ? (
 <div className="space-y-4">
 {scans.map((scan) => {
 const TypeIcon = getScanTypeIcon(scan.scan_type);
 return (
 <div key={scan.id} className="hover:bg-gray-50 border rounded-lg p-4 space-y-3 transition-all duration-300">
 <div className="flex items-start justify-between">
 <div className="flex items-start gap-3">
 <div className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors">
 {TypeIcon}
 </div>
 <div className="space-y-1">
 <div className="flex items-center gap-2">
 <h4 className="font-semibold text-sm">{scan.scan_type}</h4>
 <Badge variant="outline" className="text-xs font-mono">
 {scan.id.substring(0, 8)}
 </Badge>
 </div>
 <p className="text-sm text-muted-foreground">
 Security Engine V3 - {scan.scan_type.replace('_', ' ').replace('-', ' ').toUpperCase()}
 </p>
 <div className="flex items-center gap-2 text-xs text-muted-foreground">
 <span>{t('securityScans.started', 'Started')}: {new Date(scan.started_at).toLocaleString('pt-BR')}</span>
 {scan.completed_at && (
 <>
 <span>•</span>
 <span>{t('securityScans.completed', 'Completed')}: {new Date(scan.completed_at).toLocaleString('pt-BR')}</span>
 </>
 )}
 </div>
 </div>
 </div>
 <div className="text-right space-y-2">
 <div className="flex items-center gap-2">
 {getStatusIcon(scan.status)}
 {getStatusBadge(scan.status)}
 </div>
 </div>
 </div>
 
 {scan.status === 'completed' && (
 <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm animate-fade-in">
 <div className="text-center p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
 <span className="text-muted-foreground">{t('securityScans.total', 'Total')}:</span>
 <div className="font-medium text-lg">{scan.findings_count || 0}</div>
 </div>
 <div className="text-center p-3 rounded-lg bg-red-50 hover:bg-red-100 transition-colors">
 <span className="text-muted-foreground">{t('securityScans.criticals', 'Critical')}:</span>
 <div className="font-medium text-lg text-red-600">{scan.critical_count || 0}</div>
 </div>
 <div className="text-center p-3 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors">
 <span className="text-muted-foreground">{t('securityScans.highs', 'High')}:</span>
 <div className="font-medium text-lg text-orange-500">{scan.high_count || 0}</div>
 </div>
 <div className="text-center p-3 rounded-lg bg-yellow-50 hover:bg-yellow-100 transition-colors">
 <span className="text-muted-foreground">{t('securityScans.mediums', 'Medium')}:</span>
 <div className="font-medium text-lg text-yellow-500">{scan.medium_count || 0}</div>
 </div>
 <div className="text-center p-3 rounded-lg bg-green-50 hover:bg-green-100 transition-colors">
 <span className="text-muted-foreground">{t('securityScans.lows', 'Low')}:</span>
 <div className="font-medium text-lg text-green-500">{scan.low_count || 0}</div>
 </div>
 </div>
 )}
 
 {scan.status === 'completed' && (
 <div className="flex justify-end mt-3">
 <Button
 variant="outline"
 size="sm"
 onClick={() => {
 if (scan.scan_type === 'well_architected') {
 navigate('/well-architected');
 } else {
 navigate(`/security-scans/${scan.id}`);
 }
 }}
 className=" transition-all duration-300 hover:scale-105"
 >
 <Eye className="h-4 w-4 mr-2" />
 {t('securityScans.viewDetails', 'View Details')}
 </Button>
 </div>
 )}
 </div>
 );
 })}
 </div>
 ) : (
 <div className="text-center py-12">
 <Scan className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
 <h3 className="text-xl font-semibold mb-2">{t('securityScans.noScansExecuted', 'No scans executed')}</h3>
 <p className="text-muted-foreground mb-4">
 {t('securityScans.runFirstScanDesc', 'Run your first security scan to get started.')}
 </p>
 <Button onClick={() => handleStartScan('standard')}>
 <Play className="h-4 w-4 mr-2" />
 {t('securityScans.runFirstScan', 'Run First Scan')}
 </Button>
 </div>
 )}

 {/* Pagination Controls */}
 {totalPages > 1 && (
 <div className="flex items-center justify-between pt-6 border-t mt-6">
 <div className="flex items-center gap-4">
 <div className="text-sm text-muted-foreground">
 {t('securityScans.showingScans', 'Showing {{from}} to {{to}} of {{total}} scans', { from: ((currentPage - 1) * itemsPerPage) + 1, to: Math.min(currentPage * itemsPerPage, totalScans), total: totalScans })}
 </div>
 <div className="flex items-center gap-2">
 <span className="text-sm text-muted-foreground">{t('securityScans.itemsPerPage', 'Items per page')}:</span>
 <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
 <SelectTrigger className="w-20">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="5">5</SelectItem>
 <SelectItem value="10">10</SelectItem>
 <SelectItem value="20">20</SelectItem>
 <SelectItem value="50">50</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 <div className="flex items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 onClick={() => goToPage(1)}
 disabled={currentPage === 1}
 >
 <ChevronsLeft className="h-4 w-4" />
 </Button>
 <Button
 variant="outline"
 size="sm"
 onClick={() => goToPage(currentPage - 1)}
 disabled={currentPage === 1}
 >
 <ChevronLeft className="h-4 w-4" />
 </Button>
 
 {/* Page numbers */}
 {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
 let pageNum;
 if (totalPages <= 5) {
 pageNum = i + 1;
 } else if (currentPage <= 3) {
 pageNum = i + 1;
 } else if (currentPage >= totalPages - 2) {
 pageNum = totalPages - 4 + i;
 } else {
 pageNum = currentPage - 2 + i;
 }
 
 return (
 <Button
 key={pageNum}
 variant={currentPage === pageNum ? "default" : "outline"}
 size="sm"
 onClick={() => goToPage(pageNum)}
 className="w-8"
 >
 {pageNum}
 </Button>
 );
 })}
 
 <Button
 variant="outline"
 size="sm"
 onClick={() => goToPage(currentPage + 1)}
 disabled={currentPage === totalPages}
 >
 <ChevronRight className="h-4 w-4" />
 </Button>
 <Button
 variant="outline"
 size="sm"
 onClick={() => goToPage(totalPages)}
 disabled={currentPage === totalPages}
 >
 <ChevronsRight className="h-4 w-4" />
 </Button>
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 </TabsContent>

 <TabsContent value="findings" className="space-y-4">
 {/* Findings Filters */}
 <Card>
 <CardContent className="pt-6">
 <div className="flex flex-wrap items-center gap-4">
 <div className="flex-1 min-w-[200px]">
 <input
 type="text"
 placeholder={t('securityScans.searchFindings', 'Search findings...')}
 value={searchQuery}
 onChange={(e) => {
 setSearchQuery(e.target.value);
 setFindingsPage(1);
 }}
 className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
 />
 </div>
 <Select value={severityFilter} onValueChange={(value) => {
 setSeverityFilter(value);
 setFindingsPage(1);
 }}>
 <SelectTrigger className="w-[150px] glass-card-float">
 <SelectValue placeholder={t('securityScans.severity', 'Severity')} />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">{t('securityScans.allSeverities', 'All Severities')}</SelectItem>
 <SelectItem value="critical">{t('securityScans.severityCritical', 'Critical')}</SelectItem>
 <SelectItem value="high">{t('securityScans.severityHigh', 'High')}</SelectItem>
 <SelectItem value="medium">{t('securityScans.severityMedium', 'Medium')}</SelectItem>
 <SelectItem value="low">{t('securityScans.severityLow', 'Low')}</SelectItem>
 </SelectContent>
 </Select>
 <Select value={serviceFilter} onValueChange={(value) => {
 setServiceFilter(value);
 setFindingsPage(1);
 }}>
 <SelectTrigger className="w-[150px] glass-card-float">
 <SelectValue placeholder={t('securityScans.service', 'Service')} />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">{t('securityScans.allServices', 'All Services')}</SelectItem>
 {Array.from(new Set(findings?.map(f => f.service).filter(Boolean) || [])).map(service => (
 <SelectItem key={service} value={service!}>{service}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Select value={categoryFilter} onValueChange={(value) => {
 setCategoryFilter(value);
 setFindingsPage(1);
 }}>
 <SelectTrigger className="w-[150px] glass-card-float">
 <SelectValue placeholder={t('securityScans.category', 'Category')} />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">{t('securityScans.allCategories', 'All Categories')}</SelectItem>
 {Array.from(new Set(findings?.map(f => f.category).filter(Boolean) || [])).map(category => (
 <SelectItem key={category} value={category!}>{category}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <div className="flex items-center justify-between flex-wrap gap-4">
 <div>
 <CardTitle>{t('securityScans.securityFindings', 'Security Findings')}</CardTitle>
 <CardDescription>{t('securityScans.securityFindingsDesc', 'Vulnerabilities and issues identified in the last scan')}</CardDescription>
 </div>
 {findings && findings.length > 0 && (
 <div className="flex items-center gap-2">
 {selectedFindings.length > 0 && (
 <Button
 onClick={createTicketsForSelected}
 disabled={creatingBatchTickets}
 size="sm"
 className="gap-2"
 >
 <Ticket className="h-4 w-4" />
 {creatingBatchTickets 
 ? t('securityScans.creating', 'Creating...') 
 : t('securityScans.createTickets', 'Create {{count}} Ticket(s)', { count: selectedFindings.length })}
 </Button>
 )}
 </div>
 )}
 </div>
 </CardHeader>
 <CardContent>
 {findingsLoading ? (
 <div className="space-y-4">
 {[...Array(5)].map((_, i) => (
 <Skeleton key={i} className="h-20 w-full" />
 ))}
 </div>
 ) : findings && findings.length > 0 ? (
 (() => {
 // Apply filters
 const filteredFindings = findings.filter(finding => {
 // Severity filter
 if (severityFilter !== 'all' && finding.severity !== severityFilter) return false;
 // Service filter
 if (serviceFilter !== 'all' && finding.service !== serviceFilter) return false;
 // Category filter
 if (categoryFilter !== 'all' && finding.category !== categoryFilter) return false;
 // Search query
 if (searchQuery) {
 const query = searchQuery.toLowerCase();
 const matchesDescription = finding.description?.toLowerCase().includes(query);
 const matchesService = finding.service?.toLowerCase().includes(query);
 const matchesCategory = finding.category?.toLowerCase().includes(query);
 const matchesResourceId = finding.resource_id?.toLowerCase().includes(query);
 if (!matchesDescription && !matchesService && !matchesCategory && !matchesResourceId) return false;
 }
 return true;
 });

 // Pagination for findings
 const findingsPerPage = 10;
 const totalFindingsPages = Math.ceil(filteredFindings.length / findingsPerPage);
 const paginatedFindings = filteredFindings.slice(
 (findingsPage - 1) * findingsPerPage,
 findingsPage * findingsPerPage
 );

 // Check if all filtered findings are selected
 const allFilteredSelected = filteredFindings.length > 0 && 
 filteredFindings.every(f => selectedFindings.includes(f.id));

 return (
 <div className="space-y-4">
 {/* Summary with Select All */}
 <div className="flex items-center justify-between text-sm text-muted-foreground mb-4 flex-wrap gap-2">
 <div className="flex items-center gap-3">
 <Button
 variant="outline"
 size="sm"
 onClick={() => selectAllFindings(filteredFindings)}
 className="gap-2"
 >
 <CheckSquare className="h-4 w-4" />
 {allFilteredSelected ? t('securityScans.deselectAll', 'Deselect All') : t('securityScans.selectAll', 'Select All')}
 </Button>
 <span>
 {t('securityScans.showingFindings', 'Showing {{count}} of {{filtered}} findings', { count: paginatedFindings.length, filtered: filteredFindings.length })}
 {filteredFindings.length !== findings.length && ` (${findings.length} ${t('securityScans.total', 'total')})`}
 </span>
 </div>
 <div className="flex gap-2">
 <Badge variant="destructive">{filteredFindings.filter(f => f.severity === 'critical').length} {t('securityScans.criticals', 'Critical')}</Badge>
 <Badge className="bg-orange-500">{filteredFindings.filter(f => f.severity === 'high').length} {t('securityScans.highs', 'High')}</Badge>
 <Badge variant="secondary">{filteredFindings.filter(f => f.severity === 'medium').length} {t('securityScans.mediums', 'Medium')}</Badge>
 <Badge variant="outline">{filteredFindings.filter(f => f.severity === 'low').length} {t('securityScans.lows', 'Low')}</Badge>
 </div>
 </div>

 {paginatedFindings.map((finding) => {
 // Helper functions para extrair dados dos campos corretos
 const getTitle = () => {
 if (finding.details?.title) return finding.details.title;
 if (finding.details?.check_name) return finding.details.check_name;
 if (finding.description && finding.description.length <= 100) return finding.description;
 return finding.description?.substring(0, 100) + '...' || 'N/A';
 };
 
 const getResourceType = () => {
 if (finding.details?.resource_type) return finding.details.resource_type;
 if (finding.service) return finding.service;
 if (finding.resource_arn) {
 const arnParts = finding.resource_arn.split(':');
 return arnParts[2] || 'Unknown';
 }
 return null;
 };
 
 const getRegion = () => {
 if (finding.details?.region) return finding.details.region;
 if (finding.resource_arn) {
 const arnParts = finding.resource_arn.split(':');
 return arnParts[3] || 'global';
 }
 return null;
 };
 
 const getComplianceStandards = () => {
 if (finding.compliance && Array.isArray(finding.compliance)) {
 return finding.compliance;
 }
 if (finding.details?.compliance_standards && Array.isArray(finding.details.compliance_standards)) {
 return finding.details.compliance_standards;
 }
 return [];
 };
 
 const resourceType = getResourceType();
 const region = getRegion();
 const complianceStandards = getComplianceStandards();
 const isSelected = selectedFindings.includes(finding.id);
 
 return (
 <div 
 key={finding.id} 
 className={`border rounded-lg p-4 space-y-3 transition-colors ${
 isSelected ? 'border-primary bg-primary/5' : ''
 }`}
 >
 <div className="flex items-start justify-between">
 <div className="flex items-start gap-3">
 <Checkbox
 checked={isSelected}
 onCheckedChange={() => toggleFindingSelection(finding.id)}
 className="mt-1"
 />
 {getSeverityIcon(finding.severity)}
 <div className="space-y-1">
 <h4 className="font-semibold text-sm">{getTitle()}</h4>
 <p className="text-sm text-muted-foreground">{finding.description}</p>
 <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
 {finding.service && (
 <>
 <span className="font-medium">{finding.service}</span>
 <span>•</span>
 </>
 )}
 {resourceType && (
 <>
 <span>{resourceType}</span>
 <span>•</span>
 </>
 )}
 {finding.resource_id && (
 <>
 <span className="font-mono text-xs">{finding.resource_id}</span>
 <span>•</span>
 </>
 )}
 {region && (
 <span>{region}</span>
 )}
 {finding.category && (
 <>
 <span>•</span>
 <Badge variant="outline" className="text-xs">{finding.category}</Badge>
 </>
 )}
 {finding.status && (
 <>
 <span>•</span>
 <Badge variant={finding.status === 'resolved' ? 'default' : finding.status === 'new' ? 'outline' : 'secondary'} className="text-xs">
 {finding.status === 'new' ? 'New' : finding.status === 'active' ? 'Active' : finding.status === 'reopened' ? 'Reopened' : finding.status === 'resolved' ? 'Resolved' : finding.status}
 </Badge>
 </>
 )}
 </div>
 </div>
 </div>
 <div className="flex items-center gap-2">
 {finding.remediation_ticket_id ? (
 <Button
 variant="ghost"
 size="sm"
 disabled
 title={t('securityPosture.ticketLinked', 'Ticket já vinculado')}
 className="h-8 w-8 p-0 text-green-500"
 >
 <CheckCircle className="h-4 w-4" />
 </Button>
 ) : (
 <Button
 variant="ghost"
 size="sm"
 onClick={() => createTicketForFinding(finding)}
 disabled={creatingTicketId === finding.id}
 title={t('securityPosture.createTicket', 'Criar ticket de remediação')}
 className="h-8 w-8 p-0"
 >
 <Ticket className={`h-4 w-4 ${creatingTicketId === finding.id ? 'animate-pulse' : ''}`} />
 </Button>
 )}
 {getSeverityBadge(finding.severity)}
 </div>
 </div>
 
 {complianceStandards.length > 0 && (
 <div className="flex gap-2 flex-wrap">
 {complianceStandards.map((standard: string) => (
 <Badge key={standard} variant="outline" className="text-xs">
 {standard}
 </Badge>
 ))}
 </div>
 )}
 
 {finding.remediation && (
 <div className="bg-muted/30 rounded p-3 space-y-2">
 <p className="text-sm font-medium mb-2">{t('securityScans.remediation', 'Remediation')}:</p>
 {(() => {
 try {
 const remediation = typeof finding.remediation === 'string' 
 ? JSON.parse(finding.remediation) 
 : finding.remediation;
 
 return (
 <div className="space-y-3">
 {remediation.description && (
 <p className="text-sm text-muted-foreground">{remediation.description}</p>
 )}
 
 {remediation.steps && remediation.steps.length > 0 && (
 <div>
 <p className="text-sm font-medium mb-1">{t('securityScans.steps', 'Steps')}:</p>
 <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
 {remediation.steps.map((step: string, idx: number) => (
 <li key={idx}>{step}</li>
 ))}
 </ol>
 </div>
 )}
 
 <div className="flex gap-4 text-xs">
 {remediation.estimated_effort && (
 <Badge variant="outline" className="capitalize">
 {t('securityScans.effort', 'Effort')}: {remediation.estimated_effort}
 </Badge>
 )}
 {remediation.automation_available && (
 <Badge variant="secondary">
 {t('securityScans.automationAvailable', 'Automation Available')}
 </Badge>
 )}
 </div>
 
 {remediation.cli_command && (
 <div className="mt-2">
 <p className="text-xs font-medium mb-1">{t('securityScans.cliCommand', 'CLI Command')}:</p>
 <code className="block text-xs bg-muted p-2 rounded overflow-x-auto">
 {remediation.cli_command}
 </code>
 </div>
 )}
 </div>
 );
 } catch (e) {
 // Fallback para texto simples se não for JSON válido
 return <p className="text-sm text-muted-foreground">{finding.remediation}</p>;
 }
 })()}
 </div>
 )}
 </div>
 );
 })}

 {/* Findings Pagination */}
 {totalFindingsPages > 1 && (
 <div className="flex items-center justify-between pt-6 border-t mt-6">
 <div className="text-sm text-muted-foreground">
 {t('securityScans.pageOf', 'Page {{current}} of {{total}}', { current: findingsPage, total: totalFindingsPages })}
 </div>
 <div className="flex items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 onClick={() => setFindingsPage(1)}
 disabled={findingsPage === 1}
 >
 <ChevronsLeft className="h-4 w-4" />
 </Button>
 <Button
 variant="outline"
 size="sm"
 onClick={() => setFindingsPage(p => Math.max(1, p - 1))}
 disabled={findingsPage === 1}
 >
 <ChevronLeft className="h-4 w-4" />
 </Button>
 
 {Array.from({ length: Math.min(5, totalFindingsPages) }, (_, i) => {
 let pageNum;
 if (totalFindingsPages <= 5) {
 pageNum = i + 1;
 } else if (findingsPage <= 3) {
 pageNum = i + 1;
 } else if (findingsPage >= totalFindingsPages - 2) {
 pageNum = totalFindingsPages - 4 + i;
 } else {
 pageNum = findingsPage - 2 + i;
 }
 
 return (
 <Button
 key={pageNum}
 variant={findingsPage === pageNum ? "default" : "outline"}
 size="sm"
 onClick={() => setFindingsPage(pageNum)}
 className="w-8"
 >
 {pageNum}
 </Button>
 );
 })}
 
 <Button
 variant="outline"
 size="sm"
 onClick={() => setFindingsPage(p => Math.min(totalFindingsPages, p + 1))}
 disabled={findingsPage === totalFindingsPages}
 >
 <ChevronRight className="h-4 w-4" />
 </Button>
 <Button
 variant="outline"
 size="sm"
 onClick={() => setFindingsPage(totalFindingsPages)}
 disabled={findingsPage === totalFindingsPages}
 >
 <ChevronsRight className="h-4 w-4" />
 </Button>
 </div>
 </div>
 )}
 </div>
 );
 })()
 ) : (
 <div className="text-center py-12">
 <CheckCircle className="h-16 w-16 mx-auto mb-4 text-success" />
 <h3 className="text-xl font-semibold mb-2">{t('securityScans.noFindingsFound', 'No findings found')}</h3>
 <p className="text-muted-foreground">
 {t('securityScans.noFindingsFoundDesc', 'No vulnerabilities or issues were identified in the last scan.')}
 </p>
 </div>
 )}
 </CardContent>
 </Card>
 </TabsContent>

 <TabsContent value="schedule" className="space-y-4">
 <ScheduleTab 
 organizationId={organizationId}
 selectedAccountId={selectedAccountId}
 />
 </TabsContent>
 </Tabs>
 </div>
 </Layout>
 );
}