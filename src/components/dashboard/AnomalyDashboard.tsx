import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { cognitoAuth } from '@/integrations/aws/cognito-client-simple';
import { apiClient, getErrorMessage } from '@/integrations/aws/api-client';
import { useOrganization } from '@/hooks/useOrganization';
import { useCloudAccount, useAccountFilter } from '@/contexts/CloudAccountContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, TrendingUp, Activity, Shield, CheckCircle, X, Search, ChevronLeft, ChevronRight, Loader2, FileText, Cloud } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { AnomalyHistoryView } from './AnomalyHistoryView';

interface AnomalyFinding {
 id: string;
 severity: string;
 description: string;
 details: {
 type?: string;
 category?: string;
 title?: string;
 metric?: string;
 expectedValue?: number;
 actualValue?: number;
 };
 status: string;
 service?: string;
 category?: string;
 resource_id?: string;
 remediation?: string;
 created_at: string;
}

interface AnomalyDashboardProps {
  isInDemoMode?: boolean;
}

export function AnomalyDashboard({ isInDemoMode = false }: AnomalyDashboardProps) {
 const { t } = useTranslation();
 const { data: organizationId } = useOrganization();
 const { selectedAccountId, selectedProvider } = useCloudAccount();
 const { getAccountFilter } = useAccountFilter();
 const { toast } = useToast();
 const [selectedAnomaly, setSelectedAnomaly] = useState<string | null>(null);
 const [activeTab, setActiveTab] = useState<'detection' | 'history'>('detection');
 const [searchTerm, setSearchTerm] = useState('');
 const [severityFilter, setSeverityFilter] = useState<string>('all');
 const [statusFilter, setStatusFilter] = useState<string>('all');
 const [typeFilter, setTypeFilter] = useState<string>('all');
 const [currentPage, setCurrentPage] = useState(1);
 const itemsPerPage = 10;
 const [isExecuting, setIsExecuting] = useState(false);

 // Fetch anomalies from findings table with scan_type = 'anomaly_detection'
 // In demo mode, we call the API which returns demo data from backend
 const { data: anomalies = [], isLoading, refetch } = useQuery({
 queryKey: ['anomaly-findings', organizationId, selectedAccountId, isInDemoMode],
 queryFn: async () => {
 if (!organizationId) return [];

 // In demo mode, call the detect-anomalies endpoint to get demo data
 if (isInDemoMode) {
   const result = await apiClient.invoke('detect-anomalies', {
     body: { 
       awsAccountId: 'demo-account',
       analysisType: 'all',
       sensitivity: 'medium',
       lookbackDays: 30
     }
   });
   
   if (result.error) {
     console.error('Error fetching demo anomalies:', result.error);
     return [];
   }
   
   const data = result.data as any;
   // Transform demo anomalies to match the expected format
   return (data?.anomalies || []).map((a: any) => ({
     id: a.id,
     severity: a.severity,
     description: a.description,
     details: {
       type: a.type,
       category: a.category,
       title: a.title,
       metric: a.metric,
       expectedValue: a.expectedValue,
       actualValue: a.actualValue,
     },
     status: 'OPEN',
     service: 'ML',
     category: a.category,
     resource_id: a.resourceId,
     remediation: a.recommendation,
     created_at: a.timestamp || new Date().toISOString(),
   })) as AnomalyFinding[];
 }

 const filters: Record<string, any> = { 
 organization_id: organizationId, 
 scan_type: 'anomaly_detection',
 ...getAccountFilter() // Multi-cloud compatible
 };

 const result = await apiClient.select('findings', {
 select: '*',
 eq: filters,
 order: { column: 'created_at', ascending: false },
 limit: 100
 });
 
 return (result.data || []) as AnomalyFinding[];
 },
 enabled: !!organizationId && (isInDemoMode || !!selectedAccountId),
 });

 const runDetection = async () => {
 if (isExecuting) return;
 
 // Azure requires a real credential ID (UUID), demo mode not supported for Azure
 if (selectedProvider === 'AZURE' && !selectedAccountId) {
 toast({
 title: t('common.error'),
 description: t('anomalyDetection.selectAzureAccountFirst', 'Please select an Azure account first'),
 variant: 'destructive',
 });
 return;
 }
 
 if (!selectedAccountId && !isInDemoMode) {
 toast({
 title: t('common.error'),
 description: t('anomalyDetection.selectAccountFirst'),
 variant: 'destructive',
 });
 return;
 }
 
 setIsExecuting(true);
 try {
 toast({
 title: t('common.executing'),
 description: t('anomalyDetection.detectionInProgress'),
 });

 // Use provider-specific endpoint
 const endpoint = selectedProvider === 'AZURE' ? 'azure-detect-anomalies' : 'detect-anomalies';
 const bodyParams = selectedProvider === 'AZURE' 
 ? {
 credentialId: selectedAccountId, // Azure handler expects 'credentialId' (UUID)
 sensitivityLevel: 'medium', // Azure handler expects 'sensitivityLevel'
 lookbackDays: 30
 }
 : { 
 awsAccountId: selectedAccountId || 'demo-account',
 analysisType: 'all',
 sensitivity: 'medium',
 lookbackDays: 30
 };

 const result = await apiClient.invoke(endpoint, {
 body: bodyParams
 });

 if (result.error) {
 toast({
 title: t('common.error'),
 description: getErrorMessage(result.error),
 variant: 'destructive',
 });
 } else {
 const data = result.data as { summary?: { totalAnomalies?: number } };
 toast({
 title: t('common.success'),
 description: `${t('anomalyDetection.detectionCompleted')} - ${data?.summary?.totalAnomalies || 0} ${t('anomalyDetection.anomaliesDetectedCount')}`,
 });
 refetch();
 }
 } catch (err: any) {
 toast({
 title: t('common.error'),
 description: err.message || t('anomalyDetection.detectionFailed'),
 variant: 'destructive',
 });
 } finally {
 setIsExecuting(false);
 }
 };

 const createTicket = async (anomaly: AnomalyFinding) => {
 try {
 const user = await cognitoAuth.getCurrentUser();
 if (!user) throw new Error('User not authenticated');

 const result = await apiClient.insert('remediation_tickets', {
 title: `Anomalia: ${anomaly.details?.type || anomaly.category} - ${anomaly.service || 'Sistema'}`,
 description: `${t('anomalyDetection.title')}: ${anomaly.details?.title || anomaly.description}
 
${t('anomalyDetection.detected')}: ${new Date(anomaly.created_at).toLocaleString()}
${t('common.type')}: ${anomaly.details?.type || anomaly.category}
${t('common.severity')}: ${anomaly.severity}
${t('common.metric')}: ${anomaly.details?.metric || 'N/A'}
${t('anomalyDetection.expectedValue')}: ${anomaly.details?.expectedValue?.toFixed(2) || 'N/A'}
${t('anomalyDetection.actualValue')}: ${anomaly.details?.actualValue?.toFixed(2) || 'N/A'}

${t('anomalyDetection.recommendations')}:
${anomaly.remediation || t('anomalyDetection.noRecommendations')}`,
 severity: anomaly.severity,
 status: 'pending',
 source: 'anomaly_detection',
 source_id: anomaly.id,
 assigned_to: user.email,
 organization_id: organizationId
 });

 if (result.error) throw new Error(getErrorMessage(result.error));

 toast({
 title: t('anomalyDetection.ticketCreated'),
 description: t('anomalyDetection.ticketCreatedSuccess'),
 });
 } catch (error: any) {
 console.error('Error creating ticket:', error);
 toast({
 title: t('common.error'),
 description: `${t('anomalyDetection.errorCreatingTicket')}: ${error.message}`,
 variant: 'destructive',
 });
 }
 };

 const updateAnomalyStatus = async (anomalyId: string, newStatus: string) => {
 try {
 const user = await cognitoAuth.getCurrentUser();
 if (!user) throw new Error('User not authenticated');

 const result = await apiClient.update('findings', {
 status: newStatus,
 updated_at: new Date().toISOString(),
 }, { 
 eq: { id: anomalyId, organization_id: organizationId }
 });

 if (result.error) {
 throw new Error(getErrorMessage(result.error));
 }

 toast({
 title: t('common.success'),
 description: t('anomalyDetection.statusUpdated'),
 });
 refetch();
 } catch (error: any) {
 toast({
 title: t('common.error'),
 description: error.message,
 variant: 'destructive',
 });
 }
 };

 const getTypeIcon = (type: string | undefined) => {
 switch (type?.toLowerCase()) {
 case 'cost':
 case 'cost_spike':
 return <TrendingUp className="h-4 w-4" />;
 case 'performance':
 case 'error_spike':
 return <Activity className="h-4 w-4" />;
 case 'security':
 case 'security_event_spike':
 return <Shield className="h-4 w-4" />;
 default:
 return <AlertTriangle className="h-4 w-4" />;
 }
 };

 const getSeverityColor = (severity: string) => {
 switch (severity?.toUpperCase()) {
 case 'CRITICAL':
 return 'bg-red-600 text-white';
 case 'HIGH':
 return 'bg-orange-600 text-white';
 case 'MEDIUM':
 return 'bg-yellow-600 text-white';
 default:
 return 'bg-blue-600 text-white';
 }
 };

 const getStatusBadge = (status: string) => {
 switch (status?.toLowerCase()) {
 case 'open':
 return <Badge variant="destructive">{t('anomalyDetection.statusOpen')}</Badge>;
 case 'investigating':
 return <Badge variant="secondary">{t('anomalyDetection.statusInvestigating')}</Badge>;
 case 'resolved':
 return <Badge variant="outline" className="bg-green-100 text-green-800">{t('anomalyDetection.statusResolved')}</Badge>;
 case 'false_positive':
 return <Badge variant="outline">{t('anomalyDetection.statusFalsePositive')}</Badge>;
 default:
 return <Badge variant="outline">{status}</Badge>;
 }
 };

 // Filter anomalies based on search and filters
 const filteredAnomalies = anomalies.filter((a) => {
 const matchesSearch = searchTerm === '' || 
 a.resource_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
 a.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
 a.service?.toLowerCase().includes(searchTerm.toLowerCase());
 
 const matchesSeverity = severityFilter === 'all' || a.severity?.toUpperCase() === severityFilter.toUpperCase();
 const matchesStatus = statusFilter === 'all' || a.status?.toLowerCase() === statusFilter.toLowerCase();
 const matchesType = typeFilter === 'all' || a.category?.toLowerCase() === typeFilter.toLowerCase();
 
 return matchesSearch && matchesSeverity && matchesStatus && matchesType;
 });

 // Pagination
 const totalPages = Math.ceil(filteredAnomalies.length / itemsPerPage);
 const startIndex = (currentPage - 1) * itemsPerPage;
 const endIndex = startIndex + itemsPerPage;
 const paginatedAnomalies = filteredAnomalies.slice(startIndex, endIndex);

 const stats = {
 total: anomalies.length,
 open: anomalies.filter((a) => a.status === 'OPEN').length,
 investigating: anomalies.filter((a) => a.status === 'investigating').length,
 resolved: anomalies.filter((a) => a.status === 'resolved').length,
 critical: anomalies.filter((a) => a.severity === 'CRITICAL').length,
 high: anomalies.filter((a) => a.severity === 'HIGH').length,
 };

 return (
 <div className="space-y-6">
 <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'detection' | 'history')}>
 <TabsList className=" grid w-full max-w-md grid-cols-2">
 <TabsTrigger value="detection">{t('anomalyDetection.currentDetection')}</TabsTrigger>
 <TabsTrigger value="history">{t('anomalyDetection.history')}</TabsTrigger>
 </TabsList>

 <TabsContent value="detection" className="space-y-6">
 {isLoading ? (
 <div className="text-center py-12">
 <Activity className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
 <p className="text-muted-foreground">{t('anomalyDetection.loadingAnomalies')}</p>
 </div>
 ) : !selectedAccountId && !isInDemoMode ? (
 <Card>
 <CardContent className="py-12">
 <div className="text-center">
 <Cloud className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
 <h3 className="text-lg font-semibold mb-2">{t('anomalyDetection.noAccountSelected')}</h3>
 <p className="text-muted-foreground mb-6">
 {t('anomalyDetection.selectAccountInHeader')}
 </p>
 </div>
 </CardContent>
 </Card>
 ) : anomalies.length === 0 ? (
 <Card>
 <CardContent className="py-12">
 <div className="text-center">
 <AlertTriangle className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
 <h3 className="text-lg font-semibold mb-2">{t('anomalyDetection.noAnomaliesDetected')}</h3>
 <p className="text-muted-foreground mb-6">
 {t('anomalyDetection.runDetectionToAnalyze')}
 </p>
 <Button onClick={runDetection} size="lg" disabled={isExecuting}>
 <Activity className="h-5 w-5 mr-2" />
 {t('anomalyDetection.runFirstDetection')}
 </Button>
 </div>
 </CardContent>
 </Card>
 ) : (
 <>
 {/* Stats */}
 <div className="grid gap-4 md:grid-cols-4 ">
 <Card className=" ">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm font-medium">{t('anomalyDetection.totalAnomalies')}</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="text-2xl font-semibold tabular-nums">{stats.total}</div>
 </CardContent>
 </Card>
 <Card className=" ">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm font-medium">{t('anomalyDetection.open')}</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="text-2xl font-semibold text-red-600 tabular-nums">{stats.open}</div>
 </CardContent>
 </Card>
 <Card className=" ">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm font-medium">{t('anomalyDetection.critical')}</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="text-2xl font-semibold text-red-600 tabular-nums">{stats.critical}</div>
 </CardContent>
 </Card>
 <Card className=" ">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm font-medium">{t('anomalyDetection.highSeverity')}</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="text-2xl font-semibold text-orange-600 tabular-nums">{stats.high}</div>
 </CardContent>
 </Card>
 </div>

 {/* Filters and Search */}
 <Card className="">
 <CardHeader>
 <CardTitle>{t('anomalyDetection.detectedAnomalies')}</CardTitle>
 <CardDescription>{t('anomalyDetection.analysisResults')}</CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 {/* Search and Filters */}
 <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder={t('anomalyDetection.searchPlaceholder')}
 value={searchTerm}
 onChange={(e) => {
 setSearchTerm(e.target.value);
 setCurrentPage(1);
 }}
 className="pl-10"
 />
 </div>
 
 <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setCurrentPage(1); }}>
 <SelectTrigger>
 <SelectValue placeholder={t('common.severity')} />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">{t('anomalyDetection.allSeverities')}</SelectItem>
 <SelectItem value="CRITICAL">{t('anomalyDetection.severityCritical')}</SelectItem>
 <SelectItem value="HIGH">{t('anomalyDetection.severityHigh')}</SelectItem>
 <SelectItem value="MEDIUM">{t('anomalyDetection.severityMedium')}</SelectItem>
 <SelectItem value="LOW">{t('anomalyDetection.severityLow')}</SelectItem>
 </SelectContent>
 </Select>

 <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
 <SelectTrigger>
 <SelectValue placeholder="Status" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">{t('anomalyDetection.allStatuses')}</SelectItem>
 <SelectItem value="OPEN">{t('anomalyDetection.statusOpen', 'Open')}</SelectItem>
 <SelectItem value="investigating">{t('anomalyDetection.statusInvestigating')}</SelectItem>
 <SelectItem value="resolved">{t('anomalyDetection.statusResolved')}</SelectItem>
 <SelectItem value="false_positive">{t('anomalyDetection.statusFalsePositive')}</SelectItem>
 </SelectContent>
 </Select>

 <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setCurrentPage(1); }}>
 <SelectTrigger>
 <SelectValue placeholder={t('common.category')} />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">{t('anomalyDetection.allTypes')}</SelectItem>
 <SelectItem value="cost">{t('anomalyDetection.typeCost')}</SelectItem>
 <SelectItem value="performance">{t('anomalyDetection.typePerformance')}</SelectItem>
 <SelectItem value="security">{t('anomalyDetection.typeSecurity', 'Security')}</SelectItem>
 </SelectContent>
 </Select>
 </div>

 {/* Results count */}
 <div className="text-sm text-muted-foreground">
 {t('anomalyDetection.showing')} {startIndex + 1}-{Math.min(endIndex, filteredAnomalies.length)} {t('anomalyDetection.of')} {filteredAnomalies.length} {t('anomalyDetection.anomalies')}
 </div>

 {/* Anomalies List */}
 <div className="space-y-3">
 {paginatedAnomalies.length > 0 ? (
 paginatedAnomalies.map((anomaly) => (
 <Card
 key={anomaly.id}
 className={`cursor-pointer transition-colors overflow-hidden ${
 selectedAnomaly === anomaly.id ? 'ring-2 ring-primary' : ''
 }`}
 onClick={() => setSelectedAnomaly(anomaly.id)}
 >
 <CardContent className="p-4">
 <div className="space-y-3">
 <div className="flex items-start justify-between gap-4 flex-wrap">
 <div className="flex items-center gap-2 flex-wrap">
 {getTypeIcon(anomaly.details?.type || anomaly.category)}
 <Badge variant="outline">{anomaly.category || anomaly.details?.category || 'N/A'}</Badge>
 <Badge className={getSeverityColor(anomaly.severity)}>{anomaly.severity}</Badge>
 {getStatusBadge(anomaly.status)}
 </div>
 <div className="flex gap-2 flex-shrink-0">
 <Button 
 variant="default" 
 size="sm"
 onClick={(e) => {
 e.stopPropagation();
 createTicket(anomaly);
 }}
 className="gap-1"
 >
 <FileText className="h-4 w-4" />
 {t('anomalyDetection.createTicket')}
 </Button>
 {anomaly.status === 'OPEN' && (
 <Button variant="ghost" size="sm" onClick={(e) => {
 e.stopPropagation();
 updateAnomalyStatus(anomaly.id, 'investigating');
 }} title={t('anomalyDetection.markAsInvestigating', 'Mark as investigating')}>
 <CheckCircle className="h-4 w-4" />
 </Button>
 )}
 {anomaly.status === 'investigating' && (
 <>
 <Button variant="ghost" size="sm" onClick={(e) => {
 e.stopPropagation();
 updateAnomalyStatus(anomaly.id, 'resolved');
 }} title={t('anomalyDetection.markAsResolved', 'Mark as resolved')}>
 <CheckCircle className="h-4 w-4 text-green-600" />
 </Button>
 <Button
 variant="ghost"
 size="sm"
 onClick={(e) => {
 e.stopPropagation();
 updateAnomalyStatus(anomaly.id, 'false_positive');
 }}
 title={t('anomalyDetection.markAsFalsePositive', 'Mark as false positive')}
 >
 <X className="h-4 w-4" />
 </Button>
 </>
 )}
 </div>
 </div>

 <div className="space-y-1">
 <p className="text-sm font-medium">
 {anomaly.details?.title || anomaly.description}
 </p>
 {anomaly.resource_id && (
 <p className="text-sm text-muted-foreground">
 <span className="font-medium">{t('anomalyDetection.resource')}:</span> {anomaly.resource_id}
 </p>
 )}
 {anomaly.service && (
 <p className="text-sm text-muted-foreground">
 <span className="font-medium">{t('anomalyDetection.service', 'Service')}:</span> {anomaly.service}
 </p>
 )}
 <p className="text-xs text-muted-foreground">
 {t('anomalyDetection.detected')} {formatDistanceToNow(new Date(anomaly.created_at))} {t('anomalyDetection.ago', 'ago')}
 </p>
 </div>

 {(anomaly.details?.expectedValue !== undefined || anomaly.details?.actualValue !== undefined) && (
 <div className="p-2 bg-muted rounded-md">
 <div className="grid grid-cols-2 gap-4 text-sm">
 <div>
 <span className="text-muted-foreground">{t('anomalyDetection.expectedValue')}:</span>
 <span className="ml-2 font-medium">
 {anomaly.details?.expectedValue !== undefined 
 ? `$${anomaly.details.expectedValue < 0.01 && anomaly.details.expectedValue > 0 
 ? anomaly.details.expectedValue.toFixed(4) 
 : anomaly.details.expectedValue.toFixed(2)}`
 : 'N/A'}
 </span>
 </div>
 <div>
 <span className="text-muted-foreground">{t('anomalyDetection.actualValue')}:</span>
 <span className="ml-2 font-medium">
 {anomaly.details?.actualValue !== undefined 
 ? `$${anomaly.details.actualValue < 0.01 && anomaly.details.actualValue > 0 
 ? anomaly.details.actualValue.toFixed(4) 
 : anomaly.details.actualValue.toFixed(2)}`
 : 'N/A'}
 </span>
 </div>
 </div>
 </div>
 )}

 {anomaly.remediation && (
 <div className="space-y-1">
 <p className="text-xs font-medium">{t('anomalyDetection.recommendation', 'Recommendation')}:</p>
 <p className="text-xs text-muted-foreground">{anomaly.remediation}</p>
 </div>
 )}
 </div>
 </CardContent>
 </Card>
 ))
 ) : (
 <div className="text-center py-12 text-muted-foreground">
 <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
 <p className="font-semibold text-lg">
 {t('anomalyDetection.noAnomaliesWithFilters', 'No anomalies found with the applied filters')}
 </p>
 </div>
 )}
 </div>

 {/* Pagination Controls */}
 {filteredAnomalies.length > 0 && totalPages > 1 && (
 <div className="flex items-center justify-between mt-6 pt-4 border-t">
 <div className="flex items-center gap-4">
 <div className="text-sm text-muted-foreground">
 {t('common.page')} {currentPage} {t('common.of')} {totalPages}
 </div>
 </div>
 <div className="flex gap-2">
 <Button
 variant="outline"
 size="sm"
 onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
 disabled={currentPage === 1}
 >
 <ChevronLeft className="h-4 w-4 mr-1" />
 {t('common.previous')}
 </Button>
 <Button
 variant="outline"
 size="sm"
 onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
 disabled={currentPage === totalPages}
 >
 {t('common.next')}
 <ChevronRight className="h-4 w-4 ml-1" />
 </Button>
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 </>
 )}
 </TabsContent>

 <TabsContent value="history">
 {organizationId && <AnomalyHistoryView organizationId={organizationId} />}
 </TabsContent>
 </Tabs>
 </div>
 );
}
