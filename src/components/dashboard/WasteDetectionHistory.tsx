import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import AWSService from "@/services/aws-service";
import { History, TrendingDown, TrendingUp, Trash2, Eye } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface WasteDetectionHistoryProps {
  organizationId: string;
  onViewScan?: (scanId: string) => void;
}

export const WasteDetectionHistory = ({ organizationId, onViewScan }: WasteDetectionHistoryProps) => {
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  const { data: scanHistory, isLoading } = useQuery({
    queryKey: ['waste-detection-history-full', organizationId, selectedPeriod],
    queryFn: async () => {
      // Filter by period
      const filters: any = { organization_id: organizationId };
      if (selectedPeriod !== 'all') {
        const daysAgo = selectedPeriod === '7d' ? 7 : selectedPeriod === '30d' ? 30 : 90;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
        filters.scan_date_gte = cutoffDate.toISOString();
      }

      const { data, error } = await AWSService.query('waste_detection_history', filters);

      
      return data || [];
    }
  });

  // Prepare chart data
  const chartData = scanHistory?.slice().reverse().map(scan => ({
    date: format(new Date(scan.scan_date), 'dd/MM', { locale: ptBR }),
    fullDate: format(new Date(scan.scan_date), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
    wasteCount: scan.total_waste_count,
    monthlyWaste: scan.total_monthly_cost,
    yearlyWaste: scan.total_yearly_cost
  })) || [];

  // Calculate trends
  const latestScan = scanHistory?.[0];
  const previousScan = scanHistory?.[1];
  
  const wasteTrend = latestScan && previousScan 
    ? latestScan.total_waste_count - previousScan.total_waste_count 
    : 0;
  
  const costTrend = latestScan && previousScan 
    ? latestScan.total_yearly_cost - previousScan.total_yearly_cost 
    : 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Detecção de Desperdício
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Detecção de Desperdício
            </CardTitle>
            <CardDescription>
              Evolução dos recursos desperdiçados ao longo do tempo
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {(['7d', '30d', '90d', 'all'] as const).map((period) => (
              <Button
                key={period}
                variant={selectedPeriod === period ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedPeriod(period)}
              >
                {period === '7d' && '7 dias'}
                {period === '30d' && '30 dias'}
                {period === '90d' && '90 dias'}
                {period === 'all' && 'Todos'}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Trend Summary */}
        {latestScan && previousScan && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Recursos Desperdiçados</p>
                    <p className="text-2xl font-semibold">{latestScan.total_waste_count}</p>
                  </div>
                  <div className={`flex items-center gap-1 ${wasteTrend < 0 ? 'text-green-500' : wasteTrend > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {wasteTrend < 0 ? (
                      <TrendingDown className="h-5 w-5" />
                    ) : wasteTrend > 0 ? (
                      <TrendingUp className="h-5 w-5" />
                    ) : null}
                    <span className="font-semibold">{Math.abs(wasteTrend)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Desperdício Anual</p>
                    <p className="text-2xl font-semibold text-destructive">${latestScan.total_yearly_cost.toFixed(2)}</p>
                  </div>
                  <div className={`flex items-center gap-1 ${costTrend < 0 ? 'text-green-500' : costTrend > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {costTrend < 0 ? (
                      <TrendingDown className="h-5 w-5" />
                    ) : costTrend > 0 ? (
                      <TrendingUp className="h-5 w-5" />
                    ) : null}
                    <span className="font-semibold">${Math.abs(costTrend).toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Chart */}
        {chartData.length > 0 ? (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-4">Evolução dos Recursos Desperdiçados</h4>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(label) => {
                      const item = chartData.find(d => d.date === label);
                      return item?.fullDate || label;
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="wasteCount" stroke="#ef4444" strokeWidth={2} name="Recursos com Desperdício" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-4">Evolução do Desperdício de Custos</h4>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorYearly" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorMonthly" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(label) => {
                      const item = chartData.find(d => d.date === label);
                      return item?.fullDate || label;
                    }}
                    formatter={(value: any) => `$${value.toFixed(2)}`}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="yearlyWaste" stroke="#ef4444" fillOpacity={1} fill="url(#colorYearly)" name="Desperdício Anual ($)" />
                  <Area type="monotone" dataKey="monthlyWaste" stroke="#f97316" fillOpacity={1} fill="url(#colorMonthly)" name="Desperdício Mensal ($)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Trash2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhum scan encontrado no período selecionado</p>
          </div>
        )}

        {/* Scan List */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Scans Recentes</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {scanHistory?.map((scan) => (
              <Card key={scan.id} className="hover:bg-accent/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Trash2 className="h-4 w-4 text-primary" />
                        <span className="font-medium">
                          {format(new Date(scan.scan_date), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <div className="flex gap-2 flex-wrap items-center">
                        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
                          {scan.total_waste_count} recursos
                        </Badge>
                        <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
                          ${scan.total_monthly_cost.toFixed(2)}/mês
                        </Badge>
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                          ${scan.total_yearly_cost.toFixed(2)}/ano
                        </Badge>
                      </div>
                      {scan.scan_duration_seconds && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Tempo de execução: {scan.scan_duration_seconds}s
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={scan.status === 'completed' ? 'default' : 'secondary'}>
                        {scan.status}
                      </Badge>
                      {onViewScan && scan.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onViewScan(scan.id)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Ver Detalhes
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
