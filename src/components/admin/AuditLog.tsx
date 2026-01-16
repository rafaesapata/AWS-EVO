import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiClient } from "@/integrations/aws/api-client";
import { 
  Search, 
  RefreshCw, 
  FileText, 
  User, 
  Clock, 
  Shield,
  Eye,
  Download,
  Filter,
  Activity
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTranslation } from "react-i18next";

interface AuditLogEntry {
  id: string;
  organization_id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

const actionColors: Record<string, string> = {
  'CREATE': 'bg-green-500/10 text-green-500 border-green-500/20',
  'UPDATE': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  'DELETE': 'bg-red-500/10 text-red-500 border-red-500/20',
  'LOGIN': 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  'LOGOUT': 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  'VIEW': 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  'EXPORT': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  'SCAN': 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  'AI_CHAT': 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
};

const getActionColor = (action: string): string => {
  const upperAction = action.toUpperCase();
  for (const [key, value] of Object.entries(actionColors)) {
    if (upperAction.includes(key)) return value;
  }
  return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
};

export default function AuditLog() {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [resourceFilter, setResourceFilter] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['audit-logs', actionFilter, resourceFilter],
    queryFn: async () => {
      // Build filter object for apiClient.select
      const eqFilter: Record<string, any> = {};
      if (actionFilter !== 'all') {
        eqFilter.action = actionFilter;
      }
      if (resourceFilter !== 'all') {
        eqFilter.resource_type = resourceFilter;
      }
      
      const response = await apiClient.select('audit_logs', {
        select: '*',
        eq: Object.keys(eqFilter).length > 0 ? eqFilter : undefined,
        order: { column: 'created_at', ascending: false },
        limit: 500,
      });
      
      if (response.error) {
        console.error('Error fetching audit logs:', response.error);
        return [];
      }
      
      return (response.data || []) as AuditLogEntry[];
    },
    refetchInterval: 30000,
  });

  const logs = data || [];
  
  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      log.action.toLowerCase().includes(search) ||
      log.resource_type?.toLowerCase().includes(search) ||
      log.resource_id?.toLowerCase().includes(search) ||
      log.user_id?.toLowerCase().includes(search)
    );
  });

  const uniqueActions = [...new Set(logs.map(l => l.action.split('_')[0]))];
  const uniqueResources = [...new Set(logs.map(l => l.resource_type).filter(Boolean))];

  const exportLogs = () => {
    const csv = [
      ['Data/Hora', 'Ação', 'Recurso', 'ID Recurso', 'Usuário', 'IP'].join(','),
      ...filteredLogs.map(log => [
        format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss'),
        log.action,
        log.resource_type || '-',
        log.resource_id || '-',
        log.user_id || '-',
        log.ip_address || '-'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Auditoria do Sistema
          </h1>
          <p className="text-muted-foreground mt-1">
            Registro de todas as ações realizadas na plataforma
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportLogs}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Eventos</p>
                <p className="text-2xl font-semibold">{logs.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-500/10">
                <FileText className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Criações</p>
                <p className="text-2xl font-semibold">
                  {logs.filter(l => l.action.toUpperCase().includes('CREATE')).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <User className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Logins</p>
                <p className="text-2xl font-semibold">
                  {logs.filter(l => l.action.toUpperCase().includes('LOGIN')).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-red-500/10">
                <Shield className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Exclusões</p>
                <p className="text-2xl font-semibold">
                  {logs.filter(l => l.action.toUpperCase().includes('DELETE')).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por ação, recurso, usuário..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tipo de Ação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Ações</SelectItem>
                {uniqueActions.map(action => (
                  <SelectItem key={action} value={action}>{action}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={resourceFilter} onValueChange={setResourceFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tipo de Recurso" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Recursos</SelectItem>
                {uniqueResources.map(resource => (
                  <SelectItem key={resource} value={resource!}>{resource}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Registros de Auditoria</CardTitle>
          <CardDescription>
            Mostrando {filteredLogs.length} de {logs.length} registros
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">Nenhum registro de auditoria encontrado</p>
              <p className="text-sm mt-2">
                Os registros de auditoria são criados automaticamente quando ações são realizadas no sistema,
                como conversas com IA, criação de usuários, scans de segurança, etc.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Data/Hora</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Recurso</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead className="w-[80px]">Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {format(new Date(log.created_at), "dd/MM/yy HH:mm:ss", { locale: ptBR })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getActionColor(log.action)}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {log.resource_type ? (
                          <div>
                            <span className="font-medium">{log.resource_type}</span>
                            {log.resource_id && (
                              <span className="text-xs text-muted-foreground block truncate max-w-[150px]">
                                {log.resource_id}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {log.user_id ? (
                          <span className="font-mono text-xs truncate max-w-[120px] block">
                            {log.user_id.substring(0, 8)}...
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Sistema</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">
                          {log.ip_address || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedLog(log)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Detalhes do Registro</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">ID</label>
                                  <p className="font-mono text-sm">{log.id}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Data/Hora</label>
                                  <p>{format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Ação</label>
                                  <p><Badge variant="outline" className={getActionColor(log.action)}>{log.action}</Badge></p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Recurso</label>
                                  <p>{log.resource_type || '-'}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">ID do Recurso</label>
                                  <p className="font-mono text-sm break-all">{log.resource_id || '-'}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Usuário</label>
                                  <p className="font-mono text-sm break-all">{log.user_id || 'Sistema'}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">IP</label>
                                  <p className="font-mono">{log.ip_address || '-'}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">User Agent</label>
                                  <p className="text-xs truncate">{log.user_agent || '-'}</p>
                                </div>
                              </div>
                              {log.details && (
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Detalhes Adicionais</label>
                                  <ScrollArea className="h-[200px] mt-2">
                                    <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto">
                                      {JSON.stringify(log.details, null, 2)}
                                    </pre>
                                  </ScrollArea>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
