import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, TrendingUp, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MetricTarget {
  id: string;
  metric_type: string;
  target_value: number;
  current_value: number;
  period: string;
}

export default function MetricsWithTargets({ organizationId }: { organizationId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [targetValue, setTargetValue] = useState("");
  const [metricType, setMetricType] = useState("cost_reduction");

  const { data: targets, refetch, isLoading } = useQuery({
    queryKey: ['metrics-targets', organizationId],
    queryFn: async () => {
      const response = await apiClient.select(tableName, { eq: filters });
      const data = response.data;
      const error = response.error;
      return data as MetricTarget[];
    }
  });

  const handleSetTarget = async () => {
    try {
      const { error } = await apiClient.post('/dashboard_metrics_targets', {
        organization_id: organizationId,
        metric_type: metricType,
        target_value: parseFloat(targetValue),
        current_value: 0,
        start_date: new Date().toISOString(),
        period: 'monthly'
      });

      

      toast({
        title: "Meta definida",
        description: "Meta de métrica criada com sucesso"
      });
      
      setOpen(false);
      refetch();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Falha ao criar meta",
        variant: "destructive"
      });
    }
  };

  const getProgress = (target: MetricTarget) => {
    return Math.min(100, (target.current_value / target.target_value) * 100);
  };

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Metas e Progresso
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              Definir Meta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Meta</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Tipo de Métrica</Label>
                <select 
                  className="w-full p-2 border rounded"
                  value={metricType}
                  onChange={(e) => setMetricType(e.target.value)}
                >
                  <option value="cost_reduction">Redução de Custo</option>
                  <option value="security_score">Score de Segurança</option>
                  <option value="finding_resolution">Resolução de Findings</option>
                </select>
              </div>
              <div>
                <Label>Valor Alvo</Label>
                <Input 
                  type="number" 
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder="Ex: 10000"
                />
              </div>
              <Button onClick={handleSetTarget} className="w-full">
                Salvar Meta
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <>
            {[1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-2 w-full" />
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            {targets?.map(target => {
          const progress = getProgress(target);
          const isOnTrack = progress >= 70;
          
          return (
            <div key={target.id} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium capitalize">
                  {target.metric_type.replace('_', ' ')}
                </span>
                <span className="flex items-center gap-1">
                  {isOnTrack ? (
                    <TrendingUp className="h-4 w-4 text-success" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-warning" />
                  )}
                  {progress.toFixed(0)}%
                </span>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Atual: ${target.current_value.toLocaleString()}</span>
                <span>Meta: ${target.target_value.toLocaleString()}</span>
              </div>
            </div>
          );
            })}
            
            {(!targets || targets.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma meta definida. Clique em "Definir Meta" para começar.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}