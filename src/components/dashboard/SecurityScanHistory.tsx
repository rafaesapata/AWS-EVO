import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/aws/api-client";
import { History, TrendingDown, TrendingUp, Shield, Eye, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SecurityScan {
  id: string;
  created_at: string;
  started_at: string;
  completed_at: string | null;
  scan_type: string;
  status: string;
  findings_count: number | null;
  critical_count: number | null;
  high_count: number | null;
  medium_count: number | null;
  low_count: number | null;
  scan_config?: any;
  results?: any;
}

interface SecurityScanHistoryProps {
  organizationId: string;
  accountId?: string;
  onViewScan?: (scanId: string) => void;
}

export const SecurityScanHistory = ({ organizationId, accountId, onViewScan }: SecurityScanHistoryProps) => {
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

  const { data: scanHistory, isLoading } = useQuery({
    queryKey: ['security-scan-history', organizationId, accountId, selectedPeriod, currentPage, itemsPerPage],
    enabled: !!organizationId,
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: (query) => {
      // Auto-refresh every 5 seconds if there are running scans
      const data = query.state.data as { scans: SecurityScan[], total: number } | undefined;
      const hasRunningScans = data?.scans?.some(scan => scan.status === 'running');
      return hasRunningScans ? 5000 : false;
    },
    queryFn: async () => {
      let cutoffDate: string | null = null;
      if (selectedPeriod !== 'all') {
        const daysAgo = selectedPeriod === '7d' ? 7 : selectedPeriod === '30d' ? 30 : 90;
        const date = new Date();
        date.setDate(date.getDate() - daysAgo);
        cutoffDate = date.toISOString();
      }

      const filters: Record<string, any> = { organization_id: organizationId };
      if (accountId) filters.aws_account_id = accountId;

      // Calculate offset for pagination
      const offset = (currentPage - 1) * itemsPerPage;

      const response = await apiClient.select<SecurityScan>('security_scans', {
        eq: filters,
        order: { column: 'created_at', ascending: false },
        limit: itemsPerPage,
        offset: offset
      });
      
      if (response.error) {
        console.error('SecurityScanHistory: API error', response.error);
        return { scans: [], total: 0 };
      }
      
      let data = response.data || [];
      
      console.log('SecurityScanHistory: Raw data from API', { count: data.length, data });
      
      if (cutoffDate) {
        const beforeFilter = data.length;
        data = data.filter((s) => s.created_at >= cutoffDate!);
        console.log('SecurityScanHistory: After date filter', { beforeFilter, afterFilter: data.length, cutoffDate });
      }

      // Get total count for pagination (separate query)
      const countResponse = await apiClient.select<SecurityScan>('security_scans', {
        eq: filters,
        select: 'id'
      });
      
      let totalCount = countResponse.data?.length || 0;
      if (cutoffDate && countResponse.data) {
        totalCount = countResponse.data.filter((s) => s.created_at >= cutoffDate!).length;
      }
      
      return { scans: data, total: totalCount };
    }
  });

  const scans = scanHistory?.scans || [];
  const totalScans = scanHistory?.total || 0;
  const totalPages = Math.ceil(totalScans / itemsPerPage);

  // Reset to first page when filters change
  const handlePeriodChange = (period: '7d' | '30d' | '90d' | 'all') => {
    setSelectedPeriod(period);
    setCurrentPage(1);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(parseInt(value));
    setCurrentPage(1);
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const chartData = scans?.slice().reverse().map((scan) => {
    // Calculate security score based on findings
    // Formula: 100 - (critical*10 + high*5 + medium*2 + low*0.5), min 0
    const critical = scan.critical_count || 0;
    const high = scan.high_count || 0;
    const medium = scan.medium_count || 0;
    const low = scan.low_count || 0;
    const penalty = (critical * 10) + (high * 5) + (medium * 2) + (low * 0.5);
    const score = Math.max(0, Math.round(100 - penalty));
    
    return {
      date: format(new Date(scan.created_at), 'dd/MM', { locale: ptBR }),
      fullDate: format(new Date(scan.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
      total: scan.findings_count || 0,
      critical,
      high,
      medium,
      low,
      score
    };
  }) || [];

  const latestScan = scans?.[0] as SecurityScan | undefined;
  const previousScan = scans?.[1] as SecurityScan | undefined;
  const totalTrend = latestScan && previousScan ? (latestScan.findings_count || 0) - (previousScan.findings_count || 0) : 0;
  const criticalTrend = latestScan && previousScan ? (latestScan.critical_count || 0) - (previousScan.critical_count || 0) : 0;

  if (isLoading) {
    return <Card><CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Histórico de Scans</CardTitle></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Histórico de Scans de Segurança</CardTitle>
            <CardDescription>Evolução das vulnerabilidades ao longo do tempo</CardDescription>
          </div>
          <div className="flex gap-2">
            {(['7d', '30d', '90d', 'all'] as const).map((period) => (
              <Button key={period} variant={selectedPeriod === period ? 'default' : 'outline'} size="sm" onClick={() => handlePeriodChange(period)}>
                {period === '7d' && '7 dias'}{period === '30d' && '30 dias'}{period === '90d' && '90 dias'}{period === 'all' && 'Todos'}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {latestScan && previousScan && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total de Vulnerabilidades</p>
                    <p className="text-2xl font-semibold">{latestScan.findings_count || 0}</p>
                  </div>
                  <div className={`flex items-center gap-1 ${totalTrend < 0 ? 'text-green-500' : totalTrend > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {totalTrend < 0 ? <TrendingDown className="h-5 w-5" /> : totalTrend > 0 ? <TrendingUp className="h-5 w-5" /> : null}
                    <span className="font-semibold">{Math.abs(totalTrend)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Vulnerabilidades Críticas</p>
                    <p className="text-2xl font-semibold">{latestScan.critical_count || 0}</p>
                  </div>
                  <div className={`flex items-center gap-1 ${criticalTrend < 0 ? 'text-green-500' : criticalTrend > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {criticalTrend < 0 ? <TrendingDown className="h-5 w-5" /> : criticalTrend > 0 ? <TrendingUp className="h-5 w-5" /> : null}
                    <span className="font-semibold">{Math.abs(criticalTrend)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {chartData.length > 0 ? (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-4">Evolução das Vulnerabilidades</h4>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorCritical" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.8}/><stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip labelFormatter={(label) => chartData.find(d => d.date === label)?.fullDate || label} />
                  <Legend />
                  <Area type="monotone" dataKey="critical" stroke="#ef4444" fillOpacity={1} fill="url(#colorCritical)" name="Críticas" />
                  <Area type="monotone" dataKey="high" stroke="#f97316" fillOpacity={1} fill="url(#colorHigh)" name="Altas" />
                  <Area type="monotone" dataKey="total" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorTotal)" name="Total" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-4">Score de Segurança</h4>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip labelFormatter={(label) => chartData.find(d => d.date === label)?.fullDate || label} />
                  <Legend />
                  <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={2} name="Score Geral" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhum scan encontrado no período selecionado</p>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Scans Recentes</h4>
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
          
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {scans?.map((scan: any) => (
              <Card key={scan.id} className="hover:bg-accent/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="h-4 w-4 text-primary" />
                        <span className="font-medium">{format(new Date(scan.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}</span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">{scan.critical_count || 0} Críticas</Badge>
                        <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">{scan.high_count || 0} Altas</Badge>
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">{scan.medium_count || 0} Médias</Badge>
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">{scan.low_count || 0} Baixas</Badge>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="secondary" className="text-lg font-semibold">{scan.findings_count || 0}</Badge>
                      {onViewScan && (
                        <Button size="sm" variant="ghost" onClick={() => onViewScan(scan.id)}>
                          <Eye className="h-4 w-4 mr-1" />Ver Detalhes
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, totalScans)} de {totalScans} scans
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
        </div>
      </CardContent>
    </Card>
  );
};
