import { useState } from "react";
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

 // Get security scans
 const { data: scanData, isLoading, refetch } = useQuery<{ scans: SecurityScan[], total: number }>({
 queryKey: ['security-scans', organizationId, selectedAccountId, selectedScanType, currentPage, itemsPerPage],
 enabled: !!organizationId, // Only require organizationId, accountId is optional
 staleTime: 10 * 1000, // 10 seconds - faster updates for running scans
 refetchInterval: (query) => {
 // Auto-refresh every 5 seconds if there are running scans
 const data = query.state.data as { scans: SecurityScan[], total: number } | undefined;
 const hasRunningScans = data?.scans?.some((scan: SecurityScan) => scan.status === 'running');
 return hasRunningScans ? 5000 : false;
 },
 queryFn: async (): Promise<{ scans: SecurityScan[], total: number }> => {
 console.log('SecurityScans: Fetching scans', { organizationId, selectedAccountId, selectedScanType, currentPage, itemsPerPage });
 
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

 // Get scan findings for the latest completed scan
 const { data: findings, isLoading: findingsLoading } = useQuery<ScanFinding[]>({
 queryKey: ['scan-findings', organizationId, selectedAccountId],
 enabled: !!organizationId && scans && scans.length > 0,
 staleTime: 2 * 60 * 1000,
 queryFn: async (): Promise<ScanFinding[]> => {
 const latestCompletedScan = scans?.find((scan: SecurityScan) => scan.status === 'completed');
 if (!latestCompletedScan) return [];

 const filters: any = { 
 organization_id: organizationId
 };

 // Buscar todos os findings sem limite para exportação completa
 const response = await apiClient.select('findings', {
 select: '*',
 eq: filters,
 order: { column: 'created_at', ascending: false }
 });

 if (response.error) {
 console.error('Error fetching findings:', response.error);
 return [];
 }

 // Ensure we always return an array
 return Array.isArray(response.data) ? response.data as ScanFinding[] : [];
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
 title: "Security Scan Iniciado",
 description: `O scan de segurança ${providerName} foi iniciado com sucesso usando o Security Engine V3.`,
 });
 
 // Invalidate and refetch immediately
 queryClient.invalidateQueries({ queryKey: ['security-scans'] });
 
 // Force refetch after a short delay to ensure the scan is persisted
 setTimeout(() => {
 refetch();
 }, 2000);
 },
 onError: (error) => {
 console.error('❌ Start scan mutation error:', error);
 
 let errorMessage = error instanceof Error ? error.message : t('common.unknownError', 'Unknown error');
 const isAzure = selectedProvider === 'AZURE';
 
 // Mensagens de erro mais amigáveis
 if (errorMessage.includes('No AWS credentials') || errorMessage.includes('No Azure credentials')) {
 errorMessage = isAzure 
 ? "Nenhuma credencial Azure ativa encontrada. Por favor, adicione uma credencial Azure antes de iniciar o scan."
 : "Nenhuma credencial AWS ativa encontrada. Por favor, adicione uma credencial AWS antes de iniciar o scan.";
 } else if (errorMessage.includes('Já existe um scan') || errorMessage.includes('already running')) {
 errorMessage = "Já existe um scan de segurança em execução. Aguarde a conclusão antes de iniciar um novo.";
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
 title: "Dados atualizados",
 description: "Os scans de segurança foram atualizados.",
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
 escapeCSV(finding.status || 'pending'),
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
 title: "Relatório exportado",
 description: `${findings.length} achados de segurança foram exportados com sucesso.`,
 });
 };

 const getStatusIcon = (status: string) => {
 switch (status) {
 case 'running': return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
 case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
 case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
 case 'scheduled': return <Clock className="h-4 w-4 text-yellow-500" />;
 default: return <Clock className="h-4 w-4 text-gray-500" />;
 }
 };

 const getStatusBadge = (status: string) => {
 switch (status) {
 case 'running': return <Badge className="bg-blue-500">Executando</Badge>;
 case 'completed': return <Badge className="bg-green-500">Concluído</Badge>;
 case 'failed': return <Badge variant="destructive">Falhou</Badge>;
 case 'scheduled': return <Badge variant="secondary">Agendado</Badge>;
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
 await apiClient.update('findings', finding.id, {
 remediation_ticket_id: ticketId
 });
 }

 toast({ 
 title: t('dashboard.ticketCreated', 'Ticket criado'),
 description: t('dashboard.ticketCreatedSuccess', 'Ticket de remediação criado com sucesso')
 });
 
 // Invalidate queries to refresh the data
 queryClient.invalidateQueries({ queryKey: ['remediation-tickets'] });
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
 case 'critical': return <Badge variant="destructive">Crítico</Badge>;
 case 'high': return <Badge variant="destructive">Alto</Badge>;
 case 'medium': return <Badge variant="secondary">Médio</Badge>;
 case 'low': return <Badge variant="outline">Baixo</Badge>;
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
 
 // Detect stuck scans (running for more than 60 minutes)
 const STUCK_SCAN_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes
 const now = Date.now();
 
 const runningScansData = scansArray.filter(scan => scan.status === 'running');
 const stuckScans = runningScansData.filter(scan => {
 const startedAt = new Date(scan.started_at).getTime();
 return (now - startedAt) > STUCK_SCAN_THRESHOLD_MS;
 });
 const activeScans = runningScansData.filter(scan => {
 const startedAt = new Date(scan.started_at).getTime();
 return (now - startedAt) <= STUCK_SCAN_THRESHOLD_MS;
 });
 
 const runningScans = runningScansData.length;
 const hasStuckScan = stuckScans.length > 0;
 const hasActiveRunningScan = activeScans.length > 0;
 // Only block new scans if there's an ACTIVE running scan (not stuck)
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
 await apiClient.update('security_scans', scanId, {
 status: 'failed',
 completed_at: new Date().toISOString(),
 results: {
 error: 'Scan timeout - automatically marked as failed after 60 minutes',
 cleanup_reason: 'stuck_scan_auto_cleanup',
 cleanup_timestamp: new Date().toISOString()
 }
 });
 }
 
 return { cleaned: stuckScanIds.length };
 },
 onSuccess: (data) => {
 toast({
 title: "Scans travados limpos",
 description: `${data.cleaned} scan(s) foram marcados como falhos e você pode iniciar um novo scan.`,
 });
 queryClient.invalidateQueries({ queryKey: ['security-scans'] });
 refetch();
 },
 onError: (error) => {
 toast({
 title: "Erro ao limpar scans",
 description: error instanceof Error ? error.message : 'Erro desconhecido',
 variant: "destructive"
 });
 }
 });

 const scanLevels = [
 { 
 value: 'quick', 
 label: 'Quick Scan', 
 description: 'Verificações essenciais de segurança',
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
 label: 'Standard Scan', 
 description: 'Análise completa de segurança AWS',
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
 label: 'Deep Scan', 
 description: 'Análise profunda com compliance frameworks',
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
 title="Security Scan" 
 description="Análise completa de segurança AWS com 23 scanners de serviços, 170+ verificações e suporte a 6 frameworks de compliance"
 icon={<Shield className="h-4 w-4 text-white" />}
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
 {isLoading ? 'Atualizando...' : 'Atualizar'}
 </Button>
 <Button 
 variant="outline" 
 size="sm" 
 onClick={exportFindings}
 disabled={!findings || findings.length === 0}
 >
 <Download className="h-4 w-4 mr-2" />
 Exportar Achados
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
 {stuckScans.length} scan(s) travado(s) detectado(s)
 </h4>
 <p className="text-sm text-muted-foreground">
 Estes scans estão em execução há mais de 60 minutos e provavelmente falharam silenciosamente.
 Limpe-os para poder iniciar novos scans.
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
 Limpando...
 </>
 ) : (
 <>
 <XCircle className="h-4 w-4 mr-2" />
 Limpar Scans Travados
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
 <CardTitle className="text-sm font-medium text-muted-foreground">Scans Executando</CardTitle>
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
 <CardTitle className="text-sm font-medium text-muted-foreground">Scans Concluídos</CardTitle>
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
 <CardTitle className="text-sm font-medium text-muted-foreground">Total de Achados</CardTitle>
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
 <CardTitle className="text-sm font-medium text-muted-foreground">Achados Críticos</CardTitle>
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
 Iniciar Security Scan
 </CardTitle>
 <CardDescription>
 Clique em um dos cards abaixo para iniciar o scan. O Security Engine V3 suporta CIS, Well-Architected, PCI-DSS, NIST, LGPD e SOC2.
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
 {hasRunningScan ? 'Scan em Execução' : scanLevel.label}
 </h3>
 <p className="text-sm text-muted-foreground leading-relaxed">
 {hasRunningScan 
 ? 'Aguarde a conclusão do scan atual antes de iniciar um novo.'
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
 <span>Iniciar</span>
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
 Security Engine V3 Features
 </h4>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
 <div>
 <strong>23 AWS Services:</strong> EC2, S3, IAM, RDS, Lambda, CloudTrail, GuardDuty, Config, CloudFormation, e mais
 </div>
 <div>
 <strong>6 Compliance Frameworks:</strong> CIS, Well-Architected, PCI-DSS, NIST, LGPD, SOC2
 </div>
 <div>
 <strong>170+ Security Checks:</strong> Configurações, permissões, criptografia, rede, logging
 </div>
 <div>
 <strong>Multi-Region:</strong> Análise automática em todas as regiões configuradas
 </div>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Main Content */}
 <Tabs defaultValue="scans" className="w-full">
 <TabsList className="glass-card-float">
 <TabsTrigger value="scans">Histórico de Scans</TabsTrigger>
 <TabsTrigger value="findings">Achados</TabsTrigger>
 <TabsTrigger value="schedule">Agendamento</TabsTrigger>
 </TabsList>

 <TabsContent value="scans" className="space-y-4">
 {/* Filters */}
 <Card>
 <CardContent className="pt-6">
 <div className="flex items-center gap-4">
 <div className="flex-1">
 <Select value={selectedScanType} onValueChange={handleScanTypeChange}>
 <SelectTrigger className="glass-card-float">
 <SelectValue placeholder="Filtrar por tipo de scan" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">Todos os Níveis</SelectItem>
 <SelectItem value="quick">Quick Scan</SelectItem>
 <SelectItem value="standard">Standard Scan</SelectItem>
 <SelectItem value="deep">Deep Scan</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Scans List */}
 <Card>
 <CardHeader>
 <CardTitle>Histórico de Scans</CardTitle>
 <CardDescription>Lista de todos os scans executados</CardDescription>
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
 <span>Iniciado: {new Date(scan.started_at).toLocaleString('pt-BR')}</span>
 {scan.completed_at && (
 <>
 <span>•</span>
 <span>Concluído: {new Date(scan.completed_at).toLocaleString('pt-BR')}</span>
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
 <span className="text-muted-foreground">Total:</span>
 <div className="font-medium text-lg">{scan.findings_count || 0}</div>
 </div>
 <div className="text-center p-3 rounded-lg bg-red-50 hover:bg-red-100 transition-colors">
 <span className="text-muted-foreground">Críticos:</span>
 <div className="font-medium text-lg text-red-600">{scan.critical_count || 0}</div>
 </div>
 <div className="text-center p-3 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors">
 <span className="text-muted-foreground">Altos:</span>
 <div className="font-medium text-lg text-orange-500">{scan.high_count || 0}</div>
 </div>
 <div className="text-center p-3 rounded-lg bg-yellow-50 hover:bg-yellow-100 transition-colors">
 <span className="text-muted-foreground">Médios:</span>
 <div className="font-medium text-lg text-yellow-500">{scan.medium_count || 0}</div>
 </div>
 <div className="text-center p-3 rounded-lg bg-green-50 hover:bg-green-100 transition-colors">
 <span className="text-muted-foreground">Baixos:</span>
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
 Ver Detalhes
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
 <h3 className="text-xl font-semibold mb-2">Nenhum scan executado</h3>
 <p className="text-muted-foreground mb-4">
 Execute seu primeiro scan de segurança para começar.
 </p>
 <Button onClick={() => handleStartScan('standard')}>
 <Play className="h-4 w-4 mr-2" />
 Executar Primeiro Scan
 </Button>
 </div>
 )}

 {/* Pagination Controls */}
 {totalPages > 1 && (
 <div className="flex items-center justify-between pt-6 border-t mt-6">
 <div className="flex items-center gap-4">
 <div className="text-sm text-muted-foreground">
 Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, totalScans)} de {totalScans} scans
 </div>
 <div className="flex items-center gap-2">
 <span className="text-sm text-muted-foreground">Itens por página:</span>
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
 placeholder="Buscar achados..."
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
 <SelectValue placeholder="Severidade" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">Todas Severidades</SelectItem>
 <SelectItem value="critical">Crítico</SelectItem>
 <SelectItem value="high">Alto</SelectItem>
 <SelectItem value="medium">Médio</SelectItem>
 <SelectItem value="low">Baixo</SelectItem>
 </SelectContent>
 </Select>
 <Select value={serviceFilter} onValueChange={(value) => {
 setServiceFilter(value);
 setFindingsPage(1);
 }}>
 <SelectTrigger className="w-[150px] glass-card-float">
 <SelectValue placeholder="Serviço" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">Todos Serviços</SelectItem>
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
 <SelectValue placeholder="Categoria" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">Todas Categorias</SelectItem>
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
 <CardTitle>Achados de Segurança</CardTitle>
 <CardDescription>Vulnerabilidades e problemas identificados no último scan</CardDescription>
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
 ? 'Criando...' 
 : `Criar ${selectedFindings.length} Ticket(s)`}
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
 {allFilteredSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}
 </Button>
 <span>
 Mostrando {paginatedFindings.length} de {filteredFindings.length} achados
 {filteredFindings.length !== findings.length && ` (${findings.length} total)`}
 </span>
 </div>
 <div className="flex gap-2">
 <Badge variant="destructive">{filteredFindings.filter(f => f.severity === 'critical').length} Críticos</Badge>
 <Badge className="bg-orange-500">{filteredFindings.filter(f => f.severity === 'high').length} Altos</Badge>
 <Badge variant="secondary">{filteredFindings.filter(f => f.severity === 'medium').length} Médios</Badge>
 <Badge variant="outline">{filteredFindings.filter(f => f.severity === 'low').length} Baixos</Badge>
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
 {finding.status && finding.status !== 'pending' && (
 <>
 <span>•</span>
 <Badge variant={finding.status === 'resolved' ? 'default' : 'secondary'} className="text-xs">
 {finding.status}
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
 <p className="text-sm font-medium mb-2">Remediação:</p>
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
 <p className="text-sm font-medium mb-1">Passos:</p>
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
 Esforço: {remediation.estimated_effort}
 </Badge>
 )}
 {remediation.automation_available && (
 <Badge variant="secondary">
 Automação Disponível
 </Badge>
 )}
 </div>
 
 {remediation.cli_command && (
 <div className="mt-2">
 <p className="text-xs font-medium mb-1">Comando CLI:</p>
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
 Página {findingsPage} de {totalFindingsPages}
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
 <h3 className="text-xl font-semibold mb-2">Nenhum achado encontrado</h3>
 <p className="text-muted-foreground">
 Nenhuma vulnerabilidade ou problema foi identificado no último scan.
 </p>
 </div>
 )}
 </CardContent>
 </Card>
 </TabsContent>

 <TabsContent value="schedule" className="space-y-4">
 <Card>
 <CardHeader>
 <CardTitle>Agendamento de Scans</CardTitle>
 <CardDescription>Configure scans automáticos recorrentes</CardDescription>
 </CardHeader>
 <CardContent>
 <div className="h-[400px] flex items-center justify-center text-muted-foreground">
 <div className="text-center">
 <Clock className="h-12 w-12 mx-auto mb-4" />
 <h3 className="text-lg font-semibold mb-2">Agendamento em desenvolvimento</h3>
 <p>Sistema de agendamento automático será implementado em breve.</p>
 </div>
 </div>
 </CardContent>
 </Card>
 </TabsContent>
 </Tabs>
 </div>
 </Layout>
 );
}