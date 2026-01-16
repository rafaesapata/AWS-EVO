import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/aws/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, XCircle, AlertTriangle, Shield } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useOrganization } from "@/hooks/useOrganization";

export default function EndpointHealthCard() {
 const { data: organizationId } = useOrganization();

 const { data: monitors } = useQuery({
 queryKey: ['endpoint-monitors-health', organizationId],
 enabled: !!organizationId,
 staleTime: 0,
 gcTime: 0,
 queryFn: async () => {
 const response = await apiClient.select('endpoint_monitors', {
 eq: { organization_id: organizationId, is_active: true },
 order: { column: 'created_at', ascending: false }
 });
 if (response.error) return [];
 return response.data || [];
 },
 refetchInterval: 30000,
 });

 if (!monitors || monitors.length === 0) return null;

 const totalMonitors = monitors.length;
 const healthyMonitors = monitors.filter((m: any) => m.consecutive_failures === 0).length;
 const sslWarnings = monitors.filter((m: any) => m.monitor_ssl && m.ssl_days_until_expiry && m.ssl_days_until_expiry <= 30).length;
 const downMonitors = monitors.filter((m: any) => m.consecutive_failures > 0).length;
 const healthPercentage = Math.round((healthyMonitors / totalMonitors) * 100);

 return (
 <Card className=" hover-scale">
 <CardHeader>
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Activity className="h-5 w-5 text-primary" />
 <CardTitle>Saúde dos Endpoints</CardTitle>
 </div>
 <Badge variant={healthPercentage >= 80 ? "default" : healthPercentage >= 50 ? "secondary" : "destructive"}>
 {healthPercentage}%
 </Badge>
 </div>
 <CardDescription>Status de monitoramento em tempo real</CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="space-y-2">
 <div className="flex items-center justify-between text-sm">
 <span className="text-muted-foreground">Disponibilidade</span>
 <span className="font-medium">{healthyMonitors}/{totalMonitors}</span>
 </div>
 <Progress value={healthPercentage} className="h-2" />
 </div>

 <div className="grid grid-cols-3 gap-3">
 <div className="flex flex-col items-center p-3 rounded-lg bg-green-500/10 border border-green-500/20">
 <CheckCircle2 className="h-5 w-5 text-green-500 mb-1" />
 <span className="text-2xl font-semibold text-green-500">{healthyMonitors}</span>
 <span className="text-xs text-muted-foreground">Saudáveis</span>
 </div>
 <div className="flex flex-col items-center p-3 rounded-lg bg-red-500/10 border border-red-500/20">
 <XCircle className="h-5 w-5 text-red-500 mb-1" />
 <span className="text-2xl font-semibold text-red-500">{downMonitors}</span>
 <span className="text-xs text-muted-foreground">Com Falha</span>
 </div>
 {sslWarnings > 0 && (
 <div className="flex flex-col items-center p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
 <Shield className="h-5 w-5 text-yellow-500 mb-1" />
 <span className="text-2xl font-semibold text-yellow-500">{sslWarnings}</span>
 <span className="text-xs text-muted-foreground">SSL Alerta</span>
 </div>
 )}
 </div>

 {(downMonitors > 0 || sslWarnings > 0) && (
 <div className="pt-3 border-t border-border">
 <div className="space-y-2">
 {downMonitors > 0 && (
 <div className="flex items-center gap-2 text-sm text-red-500">
 <AlertTriangle className="h-4 w-4" />
 <span>{downMonitors} endpoint{downMonitors > 1 ? 's' : ''} com problemas</span>
 </div>
 )}
 {sslWarnings > 0 && (
 <div className="flex items-center gap-2 text-sm text-yellow-500">
 <Shield className="h-4 w-4" />
 <span>{sslWarnings} certificado{sslWarnings > 1 ? 's' : ''} próximo{sslWarnings > 1 ? 's' : ''} do vencimento</span>
 </div>
 )}
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 );
}
