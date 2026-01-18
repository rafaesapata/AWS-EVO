import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/Layout";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useOrganization } from "@/hooks/useOrganization";
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

 // Get scan details
 const { data: scan, isLoading: scanLoading } = useQuery({
 queryKey: ['security-scan', scanId, organizationId],
 enabled: !!scanId && !!organizationId,
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

 // Get scan findings
 const { data: findings, isLoading: findingsLoading } = useQuery({
 queryKey: ['scan-findings', scanId, organizationId],
 enabled: !!scanId && !!organizationId,
 queryFn: async () => {
 const response = await apiClient.select('findings', {
 select: '*',
 eq: { 
 organization_id: organizationId,
 source: 'security-engine'
 },
 order: { column: 'created_at', ascending: false }
 });

 if (response.error) {
 throw new Error(response.error.message || 'Error fetching findings');
 }

 return (response.data as Finding[]) || [];
 },
 });

 // Create remediation ticket
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

 if (scanLoading) {
 return (
 <Layout title={t('common.loading', 'Carregando...')} description={t('securityScanDetails.loadingDescription', 'Carregando detalhes do scan...')}>
 <div className="flex items-center justify-center h-64">
 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
 </div>
 </Layout>
 );
 }

 if (!scan) {
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
 title={`${t('sidebar.securityScans', 'Security Scan')} - ${scan.scan_type}`}
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
 {scan.scan_type.replace('_', ' ').replace('-', ' ').toUpperCase()}
 </CardTitle>
 <CardDescription>
 Executado em {new Date(scan.started_at).toLocaleString('pt-BR')}
 {scan.completed_at && ` • Concluído em ${new Date(scan.completed_at).toLocaleString('pt-BR')}`}
 </CardDescription>
 </div>
 <div className="text-right">
 {scan.status === 'completed' ? (
 <div className="p-3 rounded-full bg-green-100 hover:bg-green-200 transition-colors">
 <CheckCircle className="h-8 w-8 text-green-500" />
 </div>
 ) : scan.status === 'running' ? (
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
 {scan.status === 'completed' && (
 <div className="grid grid-cols-2 md:grid-cols-5 gap-4 animate-fade-in">
 <div className="text-center p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
 <div className="text-2xl font-semibold">{scan.findings_count || 0}</div>
 <div className="text-sm text-muted-foreground">Total</div>
 </div>
 <div className="text-center p-4 rounded-lg bg-red-50 hover:bg-red-100 transition-colors">
 <div className="text-2xl font-semibold text-red-600">{scan.critical_count || 0}</div>
 <div className="text-sm text-muted-foreground">Críticos</div>
 </div>
 <div className="text-center p-4 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors">
 <div className="text-2xl font-semibold text-red-500">{scan.high_count || 0}</div>
 <div className="text-sm text-muted-foreground">Altos</div>
 </div>
 <div className="text-center p-4 rounded-lg bg-yellow-50 hover:bg-yellow-100 transition-colors">
 <div className="text-2xl font-semibold text-yellow-500">{scan.medium_count || 0}</div>
 <div className="text-sm text-muted-foreground">Médios</div>
 </div>
 <div className="text-center p-4 rounded-lg bg-green-50 hover:bg-green-100 transition-colors">
 <div className="text-2xl font-semibold text-green-500">{scan.low_count || 0}</div>
 <div className="text-sm text-muted-foreground">Baixos</div>
 </div>
 </div>
 )}
 
 {scan.results && (
 <div className="mt-4 p-4 bg-muted/30 rounded-lg hover:bg-gray-50">
 <h4 className="font-semibold mb-2 text-sm">Métricas do Scan</h4>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
 <div>
 <strong>Duração:</strong> {Math.round((scan.results.duration_ms || 0) / 1000)}s
 </div>
 <div>
 <strong>Serviços:</strong> {scan.results.services_scanned || 0}
 </div>
 <div>
 <strong>Regiões:</strong> {scan.results.regions_scanned || 0}
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
 <h3 className="text-xl font-semibold mb-2">Nenhum achado encontrado</h3>
 <p className="text-muted-foreground">
 {searchTerm || severityFilter !== 'all' || serviceFilter !== 'all' || statusFilter !== 'all'
 ? 'Nenhum achado corresponde aos filtros aplicados.'
 : 'Nenhuma vulnerabilidade ou problema foi identificado neste scan.'
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