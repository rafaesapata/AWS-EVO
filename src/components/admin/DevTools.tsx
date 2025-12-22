import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Search, Activity, AlertCircle, CheckCircle2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AWSLog {
  id: string;
  service: string;
  operation: string;
  request_payload: any;
  response_payload: any;
  status_code: number;
  error_message: string;
  duration_ms: number;
  created_at: string;
  region: string;
  user_id: string;
}

export const DevTools = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<AWSLog | null>(null);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['aws-api-logs', serviceFilter],
    queryFn: async () => {
      const result = await apiClient.select('aws_api_logs', {
        select: '*',
        order: { created_at: 'desc' },
        limit: 500,
        ...(serviceFilter !== 'all' && { eq: { service: serviceFilter } })
      });
      
      if (result.error) throw result.error;
      return (result.data || []) as AWSLog[];
    },
  });

  const { data: services } = useQuery({
    queryKey: ['aws-services'],
    queryFn: async () => {
      const result = await apiClient.select('aws_api_logs', {
        select: 'service',
        order: { service: 'asc' }
      });
      
      if (result.error) throw result.error;
      const uniqueServices = [...new Set((result.data || []).map(d => d.service))];
      return uniqueServices;
    },
  });

  const filteredLogs = logs?.filter(log => 
    log.operation.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.service.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (statusCode: number) => {
    if (statusCode >= 200 && statusCode < 300) return "bg-success/20 text-success";
    if (statusCode >= 400) return "bg-destructive/20 text-destructive";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Dev Tools - AWS API Logs
          </CardTitle>
          <CardDescription>
            Logs centralizados de todas as requisições AWS (somente Super Admin)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por operação ou serviço..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filtrar por serviço" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os serviços</SelectItem>
                {services?.map((service) => (
                  <SelectItem key={service} value={service}>
                    {service}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Lista de Requisições</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  {isLoading ? (
                    <p className="text-center text-muted-foreground py-8">Carregando logs...</p>
                  ) : filteredLogs && filteredLogs.length > 0 ? (
                    <div className="space-y-2">
                      {filteredLogs.map((log) => (
                        <div
                          key={log.id}
                          onClick={() => setSelectedLog(log)}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-accent ${
                            selectedLog?.id === log.id ? 'bg-accent border-primary' : 'border-border'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm">{log.operation}</span>
                            <Badge className={getStatusColor(log.status_code)}>
                              {log.status_code || 'N/A'}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{log.service}</span>
                            <span>{log.duration_ms}ms</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(log.created_at).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">Nenhum log encontrado</p>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Detalhes da Requisição</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  {selectedLog ? (
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Serviço</label>
                        <p className="text-sm font-medium">{selectedLog.service}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Operação</label>
                        <p className="text-sm font-medium">{selectedLog.operation}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Região</label>
                        <p className="text-sm">{selectedLog.region || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Status</label>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={getStatusColor(selectedLog.status_code)}>
                            {selectedLog.status_code || 'N/A'}
                          </Badge>
                          {selectedLog.error_message && (
                            <span className="text-xs text-destructive">{selectedLog.error_message}</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Duração</label>
                        <p className="text-sm">{selectedLog.duration_ms}ms</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Data/Hora</label>
                        <p className="text-sm">{new Date(selectedLog.created_at).toLocaleString('pt-BR')}</p>
                      </div>
                      
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Request Payload</label>
                        <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-48">
                          {JSON.stringify(selectedLog.request_payload, null, 2)}
                        </pre>
                      </div>
                      
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Response Payload</label>
                        <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-48">
                          {JSON.stringify(selectedLog.response_payload, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <div className="text-center">
                        <Activity className="h-12 w-12 mx-auto mb-2 opacity-20" />
                        <p className="text-sm">Selecione um log para ver os detalhes</p>
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
