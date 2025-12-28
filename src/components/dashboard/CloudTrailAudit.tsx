import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Shield, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  AlertTriangle,
  Eye,
  FileText,
  Download,
  Loader2,
  History,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Users,
  Activity,
  User
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useOrganizationId } from "@/hooks/useOrganizationId";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

const ITEMS_PER_PAGE = 15;

interface UserActivity {
  userName: string;
  userType: string;
  arn?: string;
  eventCount: number;
  lastActivity?: string;
  criticalCount: number;
  highCount: number;
}

const CloudTrailAudit = () => {
  const organizationId = useOrganizationId();
  const { selectedAccountId } = useAwsAccount();
  const queryClient = useQueryClient();
  
  // Scan state
  const [isFetching, setIsFetching] = useState(false);
  const [maxEvents, setMaxEvents] = useState<string>("50");
  
  // Findings filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedFinding, setSelectedFinding] = useState<any>(null);
  
  // History state
  const [historyPeriod, setHistoryPeriod] = useState<string>("30d");
  const [expandedScan, setExpandedScan] = useState<string | null>(null);

  // Fetch findings with account filtering
  const { data: findings, isLoading: findingsLoading, refetch: refetchFindings } = useQuery({
    queryKey: ['cloudtrail-findings', organizationId, selectedAccountId],
    queryFn: async () => {
      const result = await apiClient.select('findings', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          source: 'cloudtrail'
        },
        order: { created_at: 'desc' }
      });

      if (result.error) throw new Error(getErrorMessage(result.error));
      
      // Client-side filter for account isolation
      if (selectedAccountId && result.data) {
        return result.data.filter((f: any) => {
          const details = f.details as any;
          return details?.aws_account_id === selectedAccountId || !details?.aws_account_id;
        });
      }
      return result.data || [];
    },
    enabled: !!organizationId,
  });

  // Fetch history
  const getDateFilter = () => {
    const now = new Date();
    switch (historyPeriod) {
      case "7d": return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case "30d": return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case "90d": return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      default: return null;
    }
  };

  const { data: history, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ['cloudtrail-history', organizationId, selectedAccountId, historyPeriod],
    queryFn: async () => {
      const filters: any = { organization_id: organizationId };
      
      // Filter by account if provided
      if (selectedAccountId) {
        filters.aws_account_id = selectedAccountId;
      }

      const dateFilter = getDateFilter();
      const result = await apiClient.select('cloudtrail_scans_history', {
        select: '*',
        eq: filters,
        ...(dateFilter && { gte: { scan_date: dateFilter.toISOString() } }),
        order: { scan_date: 'desc' },
        limit: 50
      });

      if (result.error) {
        throw new Error(getErrorMessage(result.error));
      }
      return result.data || [];
    },
    enabled: !!organizationId,
  });

  // Calculate most active users from findings
  const activeUsers = useMemo<UserActivity[]>(() => {
    if (!findings || findings.length === 0) return [];

    const userMap = new Map<string, UserActivity>();

    findings.forEach((finding) => {
      const userIdentity = finding.user_identity as any;
      if (!userIdentity) return;

      // Extract user name from various identity formats
      let userName = 'Unknown';
      let userType = 'Unknown';
      let arn = '';

      if (userIdentity.userName) {
        userName = userIdentity.userName;
        userType = userIdentity.type || 'IAMUser';
        arn = userIdentity.arn || '';
      } else if (userIdentity.sessionContext?.sessionIssuer?.userName) {
        userName = userIdentity.sessionContext.sessionIssuer.userName;
        userType = 'AssumedRole';
        arn = userIdentity.arn || '';
      } else if (userIdentity.invokedBy) {
        userName = userIdentity.invokedBy;
        userType = 'AWSService';
      } else if (userIdentity.principalId) {
        userName = userIdentity.principalId.split(':')[1] || userIdentity.principalId;
        userType = userIdentity.type || 'Unknown';
        arn = userIdentity.arn || '';
      } else if (userIdentity.arn) {
        const arnParts = userIdentity.arn.split('/');
        userName = arnParts[arnParts.length - 1] || userIdentity.arn;
        userType = userIdentity.type || 'Unknown';
        arn = userIdentity.arn;
      }

      const key = userName;
      const existing = userMap.get(key);

      if (existing) {
        existing.eventCount++;
        if (finding.severity === 'critical') existing.criticalCount++;
        if (finding.severity === 'high') existing.highCount++;
        if (finding.event_time && (!existing.lastActivity || new Date(finding.event_time) > new Date(existing.lastActivity))) {
          existing.lastActivity = finding.event_time;
        }
      } else {
        userMap.set(key, {
          userName,
          userType,
          arn,
          eventCount: 1,
          lastActivity: finding.event_time,
          criticalCount: finding.severity === 'critical' ? 1 : 0,
          highCount: finding.severity === 'high' ? 1 : 0,
        });
      }
    });

    return Array.from(userMap.values())
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10);
  }, [findings]);

  const handleScan = async () => {
    setIsFetching(true);
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) {
        toast.error("Sessão expirada", { description: "Por favor, faça login novamente" });
        setIsFetching(false);
        return;
      }

      const requestedEvents = parseInt(maxEvents);
      
      toast.info("Conectando à AWS", {
        description: `Buscando até ${requestedEvents} eventos do CloudTrail...`,
      });

      const result = await apiClient.invoke('fetch-cloudtrail', {
        body: { maxEvents: requestedEvents }
      });

      if (result.error) throw new Error(getErrorMessage(result.error));
      const data = result.data;

      if (data?.success === false || data?.error) {
        toast.error("Erro de Permissão AWS", {
          description: data.userMessage || data.error,
          duration: 10000,
        });
        setIsFetching(false);
        return;
      }

      if (!data.events || data.events.length === 0) {
        toast.warning("Nenhum evento encontrado", {
          description: "Não foram encontrados eventos no período dos últimos 90 dias",
        });
        setIsFetching(false);
        return;
      }

      toast.info("Eventos obtidos", {
        description: `${data.events.length} eventos encontrados. Iniciando análise com IA...`,
      });

      const analyzeResult = await apiClient.invoke('analyze-cloudtrail', {
        body: {
          events: data.events, 
          accountId: selectedAccountId
        }
      });

      if (analyzeResult.error) throw new Error(analyzeResult.error);

      toast.success("Auditoria concluída", {
        description: `${data.events.length} eventos foram analisados com sucesso`,
      });

      // Refresh data
      refetchFindings();
      refetchHistory();
      queryClient.invalidateQueries({ queryKey: ['cloudtrail-findings'] });
      queryClient.invalidateQueries({ queryKey: ['cloudtrail-history'] });
      
    } catch (error: any) {
      toast.error("Erro na auditoria", {
        description: error.message || "Verifique suas credenciais AWS",
        duration: 10000,
      });
    } finally {
      setIsFetching(false);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return <Badge variant="destructive">Crítico</Badge>;
      case 'high':
        return <Badge className="bg-orange-500/20 text-orange-600 border-orange-500/30">Alto</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">Médio</Badge>;
      case 'low':
        return <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30">Baixo</Badge>;
      default:
        return <Badge variant="secondary">{severity}</Badge>;
    }
  };

  // Filter findings
  const filteredFindings = findings?.filter(finding => {
    const matchesSearch = searchTerm === "" || 
      finding.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      finding.event_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      finding.ai_analysis?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSeverity = severityFilter === "all" || 
      finding.severity?.toLowerCase() === severityFilter.toLowerCase();
    
    return matchesSearch && matchesSeverity;
  }) || [];

  // Pagination
  const totalPages = Math.ceil(filteredFindings.length / ITEMS_PER_PAGE);
  const paginatedFindings = filteredFindings.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Counts
  const criticalCount = findings?.filter(f => f.severity === 'critical').length || 0;
  const highCount = findings?.filter(f => f.severity === 'high').length || 0;
  const mediumCount = findings?.filter(f => f.severity === 'medium').length || 0;
  const lowCount = findings?.filter(f => f.severity === 'low').length || 0;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                <CardTitle className="text-2xl">Auditoria CloudTrail</CardTitle>
              </div>
              <CardDescription className="mt-2">
                Análise de segurança de eventos AWS CloudTrail com inteligência artificial
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Select value={maxEvents} onValueChange={setMaxEvents} disabled={isFetching}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50 eventos</SelectItem>
                  <SelectItem value="200">200 eventos</SelectItem>
                  <SelectItem value="500">500 eventos</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleScan} disabled={isFetching} size="lg">
                {isFetching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analisando...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Iniciar Auditoria
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-destructive">{criticalCount}</div>
            <p className="text-sm text-muted-foreground">Críticos</p>
          </CardContent>
        </Card>
        <Card className="border-orange-500/50 bg-orange-500/5">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-orange-600">{highCount}</div>
            <p className="text-sm text-muted-foreground">Altos</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">{mediumCount}</div>
            <p className="text-sm text-muted-foreground">Médios</p>
          </CardContent>
        </Card>
        <Card className="border-blue-500/50 bg-blue-500/5">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{lowCount}</div>
            <p className="text-sm text-muted-foreground">Baixos</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="findings" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="findings">Achados ({findings?.length || 0})</TabsTrigger>
          <TabsTrigger value="users">
            <Users className="h-4 w-4 mr-1.5" />
            Usuários Ativos
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-1.5" />
            Histórico ({history?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* Findings Tab */}
        <TabsContent value="findings" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por descrição, evento ou análise..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10"
              />
            </div>
            <Select 
              value={severityFilter} 
              onValueChange={(value) => {
                setSeverityFilter(value);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Severidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas ({findings?.length || 0})</SelectItem>
                <SelectItem value="critical">Crítico ({criticalCount})</SelectItem>
                <SelectItem value="high">Alto ({highCount})</SelectItem>
                <SelectItem value="medium">Médio ({mediumCount})</SelectItem>
                <SelectItem value="low">Baixo ({lowCount})</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => refetchFindings()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Results */}
          {findingsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : filteredFindings.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum achado encontrado</p>
                  <p className="text-sm">Clique em "Iniciar Auditoria" para analisar eventos do CloudTrail</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Severidade</TableHead>
                        <TableHead className="w-[150px]">Evento</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-[150px]">Data</TableHead>
                        <TableHead className="w-[80px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedFindings.map((finding) => (
                        <TableRow key={finding.id}>
                          <TableCell>{getSeverityBadge(finding.severity)}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {finding.event_name || '-'}
                          </TableCell>
                          <TableCell className="max-w-md truncate">
                            {finding.description}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {finding.event_time 
                              ? format(new Date(finding.event_time), "dd/MM/yyyy HH:mm", { locale: ptBR })
                              : '-'
                            }
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedFinding(finding)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between p-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, filteredFindings.length)} de {filteredFindings.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">
                        Página {currentPage} de {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          {findingsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : activeUsers.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhuma atividade de usuário registrada</p>
                  <p className="text-sm">Execute uma auditoria para ver os usuários mais ativos</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Top 10 Usuários Mais Ativos
                </CardTitle>
                <CardDescription>
                  Ranking de usuários com mais interações nos eventos CloudTrail analisados
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">#</TableHead>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-center">Eventos</TableHead>
                        <TableHead className="text-center">Críticos</TableHead>
                        <TableHead className="text-center">Altos</TableHead>
                        <TableHead>Última Atividade</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeUsers.map((user, index) => (
                        <TableRow key={user.userName}>
                          <TableCell className="font-medium">
                            {index < 3 ? (
                              <Badge 
                                variant={index === 0 ? "default" : "secondary"}
                                className={
                                  index === 0 ? "bg-yellow-500 text-black" :
                                  index === 1 ? "bg-gray-400 text-black" :
                                  "bg-orange-600 text-white"
                                }
                              >
                                {index + 1}º
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">{index + 1}º</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{user.userName}</span>
                            </div>
                            {user.arn && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]" title={user.arn}>
                                {user.arn}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{user.userType}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-bold text-lg">{user.eventCount}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            {user.criticalCount > 0 ? (
                              <Badge variant="destructive">{user.criticalCount}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {user.highCount > 0 ? (
                              <Badge className="bg-orange-500/20 text-orange-600">{user.highCount}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {user.lastActivity 
                              ? format(new Date(user.lastActivity), "dd/MM/yyyy HH:mm", { locale: ptBR })
                              : '-'
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Summary */}
                <div className="mt-4 grid grid-cols-3 gap-4">
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{activeUsers.length}</div>
                      <p className="text-xs text-muted-foreground">Usuários únicos</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">
                        {activeUsers.reduce((sum, u) => sum + u.eventCount, 0)}
                      </div>
                      <p className="text-xs text-muted-foreground">Total de eventos</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-destructive">
                        {activeUsers.filter(u => u.criticalCount > 0 || u.highCount > 0).length}
                      </div>
                      <p className="text-xs text-muted-foreground">Usuários com alertas</p>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {history?.length || 0} execuções encontradas
            </p>
            <div className="flex items-center gap-2">
              <Select value={historyPeriod} onValueChange={setHistoryPeriod}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">7 dias</SelectItem>
                  <SelectItem value="30d">30 dias</SelectItem>
                  <SelectItem value="90d">90 dias</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => refetchHistory()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {historyLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !history || history.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhuma auditoria registrada</p>
                  <p className="text-sm">Execute uma auditoria para ver o histórico</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {history.map((scan) => (
                <Card key={scan.id}>
                  <CardContent className="p-4">
                    <div 
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedScan(expandedScan === scan.id ? null : scan.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          {format(new Date(scan.scan_date), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </div>
                        <Badge variant={scan.status === 'completed' ? 'default' : 'destructive'}>
                          {scan.status === 'completed' ? 'Concluído' : 'Erro'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          {scan.critical_count > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {scan.critical_count} críticos
                            </Badge>
                          )}
                          {scan.high_count > 0 && (
                            <Badge className="bg-orange-500/20 text-orange-600 text-xs">
                              {scan.high_count} altos
                            </Badge>
                          )}
                        </div>
                        {expandedScan === scan.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </div>

                    {expandedScan === scan.id && (
                      <div className="mt-4 pt-4 border-t space-y-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Eventos totais:</span>
                            <span className="ml-2 font-medium">{scan.total_events}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Analisados:</span>
                            <span className="ml-2 font-medium">{scan.analyzed_events}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Duração:</span>
                            <span className="ml-1 font-medium">{scan.execution_time_seconds || 0}s</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Total achados:</span>
                            <span className="ml-2 font-medium">
                              {(scan.critical_count || 0) + (scan.high_count || 0) + (scan.medium_count || 0) + (scan.low_count || 0)}
                            </span>
                          </div>
                        </div>
                        {scan.message && (
                          <p className="text-sm text-muted-foreground">{scan.message}</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={!!selectedFinding} onOpenChange={() => setSelectedFinding(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Detalhes do Achado
            </DialogTitle>
            <DialogDescription>
              Informações completas do evento CloudTrail
            </DialogDescription>
          </DialogHeader>
          {selectedFinding && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Severidade</label>
                    <div className="mt-1">{getSeverityBadge(selectedFinding.severity)}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Evento</label>
                    <p className="font-mono text-sm mt-1">{selectedFinding.event_name || '-'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Data do Evento</label>
                    <p className="text-sm mt-1">
                      {selectedFinding.event_time 
                        ? format(new Date(selectedFinding.event_time), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })
                        : '-'
                      }
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <p className="text-sm mt-1 capitalize">{selectedFinding.status || 'pending'}</p>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">Descrição</label>
                  <p className="text-sm mt-1">{selectedFinding.description}</p>
                </div>

                {selectedFinding.ai_analysis && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Análise de IA</label>
                    <p className="text-sm mt-1 bg-muted/50 p-3 rounded-md">
                      {selectedFinding.ai_analysis}
                    </p>
                  </div>
                )}

                {selectedFinding.user_identity && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Identidade do Usuário</label>
                    <pre className="text-xs mt-1 bg-muted/50 p-3 rounded-md overflow-x-auto">
                      {JSON.stringify(selectedFinding.user_identity, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedFinding.details && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Detalhes do Evento</label>
                    <pre className="text-xs mt-1 bg-muted/50 p-3 rounded-md overflow-x-auto max-h-48">
                      {JSON.stringify(selectedFinding.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CloudTrailAudit;
