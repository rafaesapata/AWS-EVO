import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/Layout";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useOrganization } from "@/hooks/useOrganization";
import { useDemoAwareQuery } from "@/hooks/useDemoAwareQuery";
import { FindingCard } from "@/components/security/FindingCard";
import { CreateTicketDialog } from "@/components/security/CreateTicketDialog";
import { FindingsFilters } from "@/components/security/FindingsFilters";
import { FindingsPagination } from "@/components/security/FindingsPagination";
import { 
 ArrowLeft,
 Shield,
 CheckCircle,
 XCircle,
 Clock,
 Download
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
 results: any;
 created_at: string;
 // AWS fields
 aws_account_id?: string;
 // Azure fields
 azure_credential_id?: string;
 cloud_provider?: 'AWS' | 'AZURE';
}

interface Finding {
 id: string;
 severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
 title: string;
 description: string;
 details: any;
 resource_id: string;
 resource_arn: string;
 service: string;
 category: string;
 scan_type: string;
 compliance: string[];
 remediation: string;
 evidence: any;
 risk_vector: string;
 source: string;
 status: string;
 created_at: string;
}

export default function SecurityScanDetails() {
 const { t } = useTranslation();
 const { scanId } = useParams<{ scanId: string }>();
 const navigate = useNavigate();
 const { toast } = useToast();
 const { data: organizationId } = useOrganization();
 const { isInDemoMode } = useDemoAwareQuery();
 
 const [searchTerm, setSearchTerm] = useState<string>("");
 const [severityFilter, setSeverityFilter] = useState<string>("all");
 const [serviceFilter, setServiceFilter] = useState<string>("all");
 const [statusFilter, setStatusFilter] = useState<string>("all");
 const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());
 const [selectedFindings, setSelectedFindings] = useState<Set<string>>(new Set());
 
 // Pagination state
 const [currentPage, setCurrentPage] = useState<number>(1);
 const [itemsPerPage, setItemsPerPage] = useState<number>(10);
 const [sortBy, setSortBy] = useState<'severity' | 'created_at' | 'service'>('severity');
 const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

 // Demo data for scan details
 const isDemoScan = isInDemoMode && scanId?.startsWith('demo-');
 const demoScanData = useMemo<SecurityScan | null>(() => {
   if (!isDemoScan) return null;
   const now = new Date();
   const demoScans: Record<string, SecurityScan> = {
     'demo-scan-001': {
       id: 'demo-scan-001', scan_type: 'deep', status: 'completed',
       started_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
       completed_at: new Date(now.getTime() - 1.5 * 60 * 60 * 1000).toISOString(),
       findings_count: 10, critical_count: 2, high_count: 3, medium_count: 3, low_count: 2,
       scan_config: { level: 'deep', frameworks: ['CIS', 'LGPD', 'PCI-DSS'] },
       results: { duration_ms: 1800000, services_scanned: 23, regions_scanned: 4 },
       created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
       cloud_provider: 'AWS',
     },
     'demo-scan-002': {
       id: 'demo-scan-002', scan_type: 'standard', status: 'completed',
       started_at: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
       completed_at: new Date(now.getTime() - 23.5 * 60 * 60 * 1000).toISOString(),
       findings_count: 8, critical_count: 1, high_count: 2, medium_count: 3, low_count: 2,
       scan_config: { level: 'standard', frameworks: ['CIS'] },
       results: { duration_ms: 900000, services_scanned: 15, regions_scanned: 2 },
       created_at: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
       cloud_provider: 'AWS',
     },
     'demo-scan-003': {
       id: 'demo-scan-003', scan_type: 'quick', status: 'completed',
       started_at: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
       completed_at: new Date(now.getTime() - 47.9 * 60 * 60 * 1000).toISOString(),
       findings_count: 6, critical_count: 1, high_count: 1, medium_count: 2, low_count: 2,
       scan_config: { level: 'quick' },
       results: { duration_ms: 360000, services_scanned: 8, regions_scanned: 1 },
       created_at: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
       cloud_provider: 'AWS',
     },
   };
   return demoScans[scanId!] || demoScans['demo-scan-001'];
 }, [isDemoScan, scanId]);

 const demoFindings = useMemo<Finding[]>(() => {
   if (!isDemoScan) return [];
   const now = new Date();
   return [
     { id: 'demo-f-001', severity: 'critical', title: 'S3 Bucket com acesso público', description: 'O bucket demo-company-data está configurado com acesso público, expondo dados sensíveis.', details: {}, resource_id: 'demo-company-data', resource_arn: 'arn:aws:s3:::demo-company-data', service: 'S3', category: 'Data Protection', scan_type: 'deep', compliance: ['CIS 2.1.1', 'LGPD Art. 46'], remediation: 'Remover a política de acesso público e habilitar Block Public Access.', evidence: {}, risk_vector: 'network/public-exposure', source: 'security-engine', status: 'open', created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() },
     { id: 'demo-f-002', severity: 'critical', title: 'Root account sem MFA', description: 'A conta root não possui MFA habilitada, representando risco crítico.', details: {}, resource_id: 'root-account', resource_arn: 'arn:aws:iam::123456789012:root', service: 'IAM', category: 'Identity & Access', scan_type: 'deep', compliance: ['CIS 1.5', 'NIST AC-2'], remediation: 'Habilitar MFA virtual ou hardware na conta root.', evidence: {}, risk_vector: 'identity/root-access', source: 'security-engine', status: 'open', created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() },
     { id: 'demo-f-003', severity: 'high', title: 'Security Group com porta 22 aberta', description: 'Security Group permite SSH (porta 22) de qualquer IP (0.0.0.0/0).', details: {}, resource_id: 'sg-demo-001', resource_arn: 'arn:aws:ec2:us-east-1:123456789012:security-group/sg-demo-001', service: 'EC2', category: 'Network Security', scan_type: 'deep', compliance: ['CIS 5.2', 'PCI-DSS 1.3'], remediation: 'Restringir acesso SSH apenas a IPs conhecidos.', evidence: {}, risk_vector: 'network/open-ports', source: 'security-engine', status: 'open', created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() },
     { id: 'demo-f-004', severity: 'high', title: 'RDS sem criptografia', description: 'Instância RDS demo-db não possui criptografia at-rest habilitada.', details: {}, resource_id: 'demo-db', resource_arn: 'arn:aws:rds:us-east-1:123456789012:db:demo-db', service: 'RDS', category: 'Data Protection', scan_type: 'deep', compliance: ['CIS 2.3.1', 'LGPD Art. 46'], remediation: 'Habilitar criptografia at-rest na instância RDS.', evidence: {}, risk_vector: 'data/unencrypted-storage', source: 'security-engine', status: 'open', created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() },
     { id: 'demo-f-005', severity: 'high', title: 'IAM User com chaves antigas', description: 'Usuário demo-admin possui access keys com mais de 90 dias sem rotação.', details: {}, resource_id: 'demo-admin', resource_arn: 'arn:aws:iam::123456789012:user/demo-admin', service: 'IAM', category: 'Identity & Access', scan_type: 'deep', compliance: ['CIS 1.4', 'NIST IA-5'], remediation: 'Rotacionar as access keys do usuário.', evidence: {}, risk_vector: 'identity/stale-credentials', source: 'security-engine', status: 'open', created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() },
     { id: 'demo-f-006', severity: 'medium', title: 'CloudTrail sem multi-região', description: 'CloudTrail configurado apenas para us-east-1.', details: {}, resource_id: 'demo-trail', resource_arn: 'arn:aws:cloudtrail:us-east-1:123456789012:trail/demo-trail', service: 'CloudTrail', category: 'Logging & Monitoring', scan_type: 'deep', compliance: ['CIS 3.1', 'NIST AU-2'], remediation: 'Habilitar CloudTrail multi-região.', evidence: {}, risk_vector: 'logging/incomplete-coverage', source: 'security-engine', status: 'open', created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() },
     { id: 'demo-f-007', severity: 'medium', title: 'EBS Volume sem criptografia', description: 'Volume EBS vol-demo-001 não possui criptografia habilitada.', details: {}, resource_id: 'vol-demo-001', resource_arn: 'arn:aws:ec2:us-east-1:123456789012:volume/vol-demo-001', service: 'EC2', category: 'Data Protection', scan_type: 'deep', compliance: ['CIS 2.2.1'], remediation: 'Criar snapshot criptografado e substituir o volume.', evidence: {}, risk_vector: 'data/unencrypted-storage', source: 'security-engine', status: 'open', created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() },
     { id: 'demo-f-008', severity: 'medium', title: 'Lambda sem VPC', description: 'Função Lambda demo-processor não está em VPC, sem acesso a recursos privados.', details: {}, resource_id: 'demo-processor', resource_arn: 'arn:aws:lambda:us-east-1:123456789012:function:demo-processor', service: 'Lambda', category: 'Network Security', scan_type: 'deep', compliance: ['NIST SC-7'], remediation: 'Configurar a função Lambda para executar dentro da VPC.', evidence: {}, risk_vector: 'network/no-vpc', source: 'security-engine', status: 'open', created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() },
     { id: 'demo-f-009', severity: 'low', title: 'S3 Bucket sem versionamento', description: 'Bucket demo-logs não possui versionamento habilitado.', details: {}, resource_id: 'demo-logs', resource_arn: 'arn:aws:s3:::demo-logs', service: 'S3', category: 'Data Protection', scan_type: 'deep', compliance: ['CIS 2.1.3'], remediation: 'Habilitar versionamento no bucket S3.', evidence: {}, risk_vector: 'data/no-versioning', source: 'security-engine', status: 'open', created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() },
     { id: 'demo-f-010', severity: 'low', title: 'Tag padrão ausente', description: 'Recurso EC2 i-demo-001 não possui tags obrigatórias (Environment, Owner).', details: {}, resource_id: 'i-demo-001', resource_arn: 'arn:aws:ec2:us-east-1:123456789012:instance/i-demo-001', service: 'EC2', category: 'Governance', scan_type: 'deep', compliance: ['Internal Policy'], remediation: 'Adicionar tags Environment e Owner ao recurso.', evidence: {}, risk_vector: 'governance/missing-tags', source: 'security-engine', status: 'open', created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() },
   ];
 }, [isDemoScan]);

 // Get scan details
 const { data: scan, isLoading: scanLoading } = useQuery({
 queryKey: ['security-scan', scanId, organizationId],
 enabled: !!scanId && !!organizationId && !isDemoScan,
 queryFn: async () => {
 const response = await apiClient.select('security_scans', {
 select: '*',
 eq: { id: scanId, organization_id: organizationId },
 order: { column: 'created_at', ascending: false },
 limit: 1
 });

 if (response.error) {
 throw new Error(response.error.message || 'Error fetching scan');
 }

 const scans = response.data as SecurityScan[];
 return scans?.[0] || null;
 },
 });

 // Get scan findings - filter by scan's credential (AWS or Azure)
 const { data: findingsData, isLoading: findingsLoading } = useQuery({
 queryKey: ['scan-findings', scanId, organizationId, (isDemoScan ? demoScanData : scan)?.aws_account_id, (isDemoScan ? demoScanData : scan)?.azure_credential_id, (isDemoScan ? demoScanData : scan)?.cloud_provider],
 enabled: !!scanId && !!organizationId && !!(isDemoScan ? demoScanData : scan) && !isDemoScan,
 queryFn: async () => {
 const activeScan = scan;
 if (!activeScan) return [];
 
 // Determine if this is an Azure or AWS scan
 const isAzureScan = scan.cloud_provider === 'AZURE' || scan.azure_credential_id || scan.scan_type?.startsWith('azure-');
 
 // Build filter based on scan properties
 const filter: Record<string, any> = { 
 organization_id: organizationId,
 };
 
 if (isAzureScan) {
 // For Azure scans, filter by azure_credential_id and Azure sources
 if (scan.azure_credential_id) {
   filter.azure_credential_id = scan.azure_credential_id;
 }
 // Azure findings use different source values
 // We'll fetch all and filter client-side for Azure sources
 } else {
 // For AWS scans, filter by aws_account_id and security-engine source
 filter.source = 'security-engine';
 if (scan.aws_account_id) {
   filter.aws_account_id = scan.aws_account_id;
 }
 }
 
 const response = await apiClient.select('findings', {
 select: '*',
 eq: filter,
 order: { column: 'created_at', ascending: false },
 limit: 500
 });

 if (response.error) {
 throw new Error(response.error.message || 'Error fetching findings');
 }

 let results = (response.data as Finding[]) || [];
 
 // For Azure scans, filter to only Azure sources
 if (isAzureScan) {
 results = results.filter(f => 
   f.source === 'azure-security-scan' || 
   f.source === 'azure-module-scanner' ||
   f.source === 'azure-defender'
 );
 }

 return results;
 },
 });

 // Create remediation ticket
 // Resolve scan and findings: use demo data when in demo mode
 const activeScan = isDemoScan ? demoScanData : scan;
 const findings = isDemoScan ? demoFindings : (findingsData || []);
 const isActiveScanLoading = isDemoScan ? false : scanLoading;

 const createTicketMutation = useMutation({
 mutationFn: async ({ findingIds, title, description }: { findingIds: string[], title: string, description: string }) => {
 const response = await apiClient.invoke('create-remediation-ticket', {
 body: {
 findingIds,
 title,
 description,
 priority: 'high',
 organizationId
 }
 });

 if (response.error) {
 throw new Error(getErrorMessage(response.error));
 }

 return response.data;
 },
 onSuccess: () => {
 toast({
 title: "Ticket criado",
 description: "Ticket de remediação criado com sucesso.",
 });
 setSelectedFindings(new Set());
 },
 onError: (error) => {
 toast({
 title: "Erro ao criar ticket",
 description: error instanceof Error ? error.message : "Erro desconhecido",
 variant: "destructive"
 });
 }
 });

 const toggleFindingExpansion = (findingId: string) => {
 const newExpanded = new Set(expandedFindings);
 if (newExpanded.has(findingId)) {
 newExpanded.delete(findingId);
 } else {
 newExpanded.add(findingId);
 }
 setExpandedFindings(newExpanded);
 };

 const toggleFindingSelection = (findingId: string) => {
 const newSelected = new Set(selectedFindings);
 if (newSelected.has(findingId)) {
 newSelected.delete(findingId);
 } else {
 newSelected.add(findingId);
 }
 setSelectedFindings(newSelected);
 };

 const copyToClipboard = (text: string) => {
 navigator.clipboard.writeText(text);
 toast({
 title: "Copiado",
 description: "Texto copiado para a área de transferência.",
 });
 };

 // Severity priority for sorting
 const getSeverityPriority = (severity: string): number => {
 switch (severity) {
 case 'critical': return 5;
 case 'high': return 4;
 case 'medium': return 3;
 case 'low': return 2;
 case 'info': return 1;
 default: return 0;
 }
 };

 // Filter and sort findings
 const filteredAndSortedFindings = (findings || []).filter(finding => {
 const matchesSearch = !searchTerm || 
 finding.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
 finding.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
 finding.resource_id?.toLowerCase().includes(searchTerm.toLowerCase());
 
 const matchesSeverity = severityFilter === 'all' || finding.severity === severityFilter;
 const matchesService = serviceFilter === 'all' || finding.service === serviceFilter;
 const matchesStatus = statusFilter === 'all' || finding.status === statusFilter;

 return matchesSearch && matchesSeverity && matchesService && matchesStatus;
 }).sort((a, b) => {
 let comparison = 0;
 
 switch (sortBy) {
 case 'severity':
 comparison = getSeverityPriority(b.severity) - getSeverityPriority(a.severity);
 break;
 case 'created_at':
 comparison = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
 break;
 case 'service':
 comparison = (a.service || '').localeCompare(b.service || '');
 break;
 default:
 comparison = 0;
 }
 
 return sortOrder === 'desc' ? comparison : -comparison;
 });

 // Pagination calculations
 const totalItems = filteredAndSortedFindings.length;
 const totalPages = Math.ceil(totalItems / itemsPerPage);
 const startIndex = (currentPage - 1) * itemsPerPage;
 const endIndex = startIndex + itemsPerPage;
 const paginatedFindings = filteredAndSortedFindings.slice(startIndex, endIndex);

 // Reset to first page when filters change
 const handleFilterChange = (filterType: string, value: string) => {
 setCurrentPage(1);
 switch (filterType) {
 case 'search':
 setSearchTerm(value);
 break;
 case 'severity':
 setSeverityFilter(value);
 break;
 case 'service':
 setServiceFilter(value);
 break;
 case 'status':
 setStatusFilter(value);
 break;
 }
 };

 // Handle sort change
 const handleSortChange = (newSortBy: 'severity' | 'created_at' | 'service') => {
 if (sortBy === newSortBy) {
 setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
 } else {
 setSortBy(newSortBy);
 setSortOrder('desc');
 }
 setCurrentPage(1);
 };

 // Get unique services for filter
 const uniqueServices = [...new Set((findings || []).map(f => f.service).filter(Boolean))];

 if (isActiveScanLoading) {
 return (
 <Layout title={t('common.loading', 'Carregando...')} description={t('securityScanDetails.loadingDescription', 'Carregando detalhes do scan...')}>
 <div className="flex items-center justify-center h-64">
 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
 </div>
 </Layout>
 );
 }

 if (!activeScan) {
 return (
 <Layout title={t('securityScanDetails.notFound', 'Scan não encontrado')} description={t('securityScanDetails.notFoundDescription', 'O scan solicitado não foi encontrado.')}>
 <div className="text-center py-12">
 <XCircle className="h-16 w-16 mx-auto mb-4 text-red-500" />
 <h3 className="text-xl font-semibold mb-2">{t('securityScanDetails.notFound', 'Scan não encontrado')}</h3>
 <p className="text-muted-foreground mb-4">
 {t('securityScanDetails.notFoundMessage', 'O scan solicitado não foi encontrado ou você não tem permissão para visualizá-lo.')}
 </p>
 <Button onClick={() => navigate('/security-scans')} className=" transition-all duration-300 hover:scale-105">
 <ArrowLeft className="h-4 w-4 mr-2" />
 {t('securityScanDetails.backToScans', 'Voltar aos Scans')}
 </Button>
 </div>
 </Layout>
 );
 }

 return (
 <Layout 
 title={`${t('sidebar.securityScans', 'Security Scan')} - ${activeScan.scan_type}`}
 description={t('securityScanDetails.description', 'Detalhes completos do scan de segurança')}
 icon={<Shield className="h-7 w-7" />}
 >
 <div className="space-y-6">
 {/* Header */}
 <div className="flex items-center justify-between">
 <Button variant="ghost" onClick={() => navigate('/security-scans')} className=" transition-all duration-300 hover:scale-105">
 <ArrowLeft className="h-4 w-4 mr-2" />
 Voltar aos Scans
 </Button>
 
 <div className="flex items-center gap-2">
 {selectedFindings.size > 0 && (
 <CreateTicketDialog 
 selectedFindings={Array.from(selectedFindings)}
 findings={findings || []}
 onCreateTicket={createTicketMutation.mutate}
 isLoading={createTicketMutation.isPending}
 />
 )}
 <Button variant="outline" size="sm" className=" transition-all duration-300 hover:scale-105">
 <Download className="h-4 w-4 mr-2" />
 Exportar Relatório
 </Button>
 </div>
 </div>

 {/* Scan Overview */}
 <Card className="transition-all duration-300">
 <CardHeader>
 <div className="flex items-center justify-between">
 <div>
 <CardTitle className="flex items-center gap-2">
 <div className="p-2 rounded-lg bg-primary/10">
 <Shield className="h-6 w-6 text-primary" />
 </div>
 {activeScan.scan_type.replace('_', ' ').replace('-', ' ').toUpperCase()}
 </CardTitle>
 <CardDescription>
 Executado em {new Date(activeScan.started_at).toLocaleString('pt-BR')}
 {activeScan.completed_at && ` • Concluído em ${new Date(activeScan.completed_at).toLocaleString('pt-BR')}`}
 </CardDescription>
 </div>
 <div className="text-right">
 {activeScan.status === 'completed' ? (
 <div className="p-3 rounded-full bg-green-100 hover:bg-green-200 transition-colors">
 <CheckCircle className="h-8 w-8 text-green-500" />
 </div>
 ) : activeScan.status === 'running' ? (
 <div className="p-3 rounded-full bg-blue-100 hover:bg-blue-200 transition-colors">
 <Clock className="h-8 w-8 text-blue-500 animate-spin" />
 </div>
 ) : (
 <div className="p-3 rounded-full bg-red-100 hover:bg-red-200 transition-colors">
 <XCircle className="h-8 w-8 text-red-500" />
 </div>
 )}
 </div>
 </div>
 </CardHeader>
 <CardContent>
 {activeScan.status === 'completed' && (
 <div className="grid grid-cols-2 md:grid-cols-5 gap-4 animate-fade-in">
 <div className="text-center p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
 <div className="text-2xl font-semibold">{activeScan.findings_count || 0}</div>
 <div className="text-sm text-muted-foreground">Total</div>
 </div>
 <div className="text-center p-4 rounded-lg bg-red-50 hover:bg-red-100 transition-colors">
 <div className="text-2xl font-semibold text-red-600">{activeScan.critical_count || 0}</div>
 <div className="text-sm text-muted-foreground">Críticos</div>
 </div>
 <div className="text-center p-4 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors">
 <div className="text-2xl font-semibold text-red-500">{activeScan.high_count || 0}</div>
 <div className="text-sm text-muted-foreground">Altos</div>
 </div>
 <div className="text-center p-4 rounded-lg bg-yellow-50 hover:bg-yellow-100 transition-colors">
 <div className="text-2xl font-semibold text-yellow-500">{activeScan.medium_count || 0}</div>
 <div className="text-sm text-muted-foreground">Médios</div>
 </div>
 <div className="text-center p-4 rounded-lg bg-green-50 hover:bg-green-100 transition-colors">
 <div className="text-2xl font-semibold text-green-500">{activeScan.low_count || 0}</div>
 <div className="text-sm text-muted-foreground">Baixos</div>
 </div>
 </div>
 )}
 
 {activeScan.results && (
 <div className="mt-4 p-4 bg-muted/30 rounded-lg hover:bg-gray-50">
 <h4 className="font-semibold mb-2 text-sm">Métricas do Scan</h4>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
 <div>
 <strong>Duração:</strong> {Math.round((activeScan.results.duration_ms || 0) / 1000)}s
 </div>
 <div>
 <strong>Serviços:</strong> {activeScan.results.services_scanned || 0}
 </div>
 <div>
 <strong>Regiões:</strong> {activeScan.results.regions_scanned || 0}
 </div>
 </div>
 </div>
 )}
 </CardContent>
 </Card>

 {/* Findings Section */}
 <Card className="transition-all duration-300">
 <CardHeader>
 <div className="flex items-center justify-between">
 <div>
 <CardTitle>Achados de Segurança</CardTitle>
 <CardDescription>
 {totalItems} achados encontrados
 {selectedFindings.size > 0 && ` • ${selectedFindings.size} selecionados`}
 {totalItems > 0 && ` • Página ${currentPage} de ${totalPages}`}
 </CardDescription>
 </div>
 </div>
 
 {/* Filters and Controls */}
 <div className="mt-4">
 <FindingsFilters
 searchTerm={searchTerm}
 severityFilter={severityFilter}
 serviceFilter={serviceFilter}
 statusFilter={statusFilter}
 sortBy={sortBy}
 sortOrder={sortOrder}
 itemsPerPage={itemsPerPage}
 uniqueServices={uniqueServices}
 onSearchChange={(value) => handleFilterChange('search', value)}
 onSeverityChange={(value) => handleFilterChange('severity', value)}
 onServiceChange={(value) => handleFilterChange('service', value)}
 onStatusChange={(value) => handleFilterChange('status', value)}
 onSortChange={handleSortChange}
 onItemsPerPageChange={(value) => {
 setItemsPerPage(parseInt(value) || 10);
 setCurrentPage(1);
 }}
 />
 </div>
 </CardHeader>
 <CardContent>
 {findingsLoading ? (
 <div className="space-y-4">
 {[...Array(5)].map((_, i) => (
 <div key={i} className="h-20 bg-muted/30 rounded animate-pulse" />
 ))}
 </div>
 ) : paginatedFindings.length > 0 ? (
 <>
 <div className="space-y-4">
 {paginatedFindings.map((finding) => (
 <FindingCard
 key={finding.id}
 finding={finding}
 isExpanded={expandedFindings.has(finding.id)}
 isSelected={selectedFindings.has(finding.id)}
 onToggleExpansion={() => toggleFindingExpansion(finding.id)}
 onToggleSelection={() => toggleFindingSelection(finding.id)}
 onCopyToClipboard={copyToClipboard}
 />
 ))}
 </div>

 {/* Pagination Controls */}
 <FindingsPagination
 currentPage={currentPage}
 totalPages={totalPages}
 totalItems={totalItems}
 startIndex={startIndex}
 endIndex={endIndex}
 onPageChange={setCurrentPage}
 />
 </>
 ) : (
 <div className="text-center py-12">
 <div className="p-4 rounded-full bg-green-100 w-fit mx-auto mb-4">
 <CheckCircle className="h-16 w-16 text-success" />
 </div>
 <h3 className="text-xl font-semibold mb-2">{t('securityScans.noFindingsFound', 'Nenhum achado encontrado')}</h3>
 <p className="text-muted-foreground">
 {searchTerm || severityFilter !== 'all' || serviceFilter !== 'all' || statusFilter !== 'all'
 ? t('securityScans.noFindingsMatchFilters', 'Nenhum achado corresponde aos filtros aplicados.')
 : t('securityScans.noFindingsFoundDesc', 'Nenhuma vulnerabilidade ou problema foi identificado neste scan.')
 }
 </p>
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 </Layout>
 );
}