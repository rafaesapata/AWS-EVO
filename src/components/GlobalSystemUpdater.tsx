import { useState } from "react";
import { PlayCircle, CheckCircle, XCircle, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";

interface RoutineStatus {
  name: string;
  displayName: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
  duration?: number;
}

export function GlobalSystemUpdater({ accountId }: { accountId?: string }) {
  const queryClient = useQueryClient();
  const { data: organizationId } = useOrganization();
  const [isOpen, setIsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [routines, setRoutines] = useState<RoutineStatus[]>([]);

  const systemRoutines = [
    { name: 'fetch-daily-costs', displayName: 'Coleta de Custos Diários' },
    { name: 'fetch-cloudwatch-metrics', displayName: 'Métricas CloudWatch e Recursos' },
    { name: 'security-scan', displayName: 'Análise de Segurança' },
    { name: 'cost-optimization', displayName: 'Otimização de Custos' },
    { name: 'waste-detection', displayName: 'Detecção de Desperdício' },
    { name: 'well-architected-scan', displayName: 'Well-Architected Scan' },
    { name: 'drift-detection', displayName: 'Detecção de Drift' },
    { name: 'predict-incidents', displayName: 'Predição de Incidentes (ML)' },
    { name: 'detect-anomalies', displayName: 'Detecção de Anomalias' },
  ];

  const executeRoutine = async (routine: { name: string; displayName: string }, awsAccountId: string, orgId: string): Promise<RoutineStatus> => {
    const startTime = Date.now();
    
    try {
      // CRITICAL: Pass BOTH accountId AND organizationId to Lambda functions for proper data isolation
      const result = await apiClient.invoke(routine.name, {
        body: {
          accountId: awsAccountId, 
          organizationId: orgId
        }
      });

      const duration = Date.now() - startTime;

      if (result.error) throw result.error;
      const data = result.data;

      return {
        ...routine,
        status: 'success',
        message: data?.message || 'Executado com sucesso',
        duration
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        ...routine,
        status: 'error',
        message: error.message || 'Erro na execução',
        duration
      };
    }
  };

  const runAllRoutines = async () => {
    if (!accountId) {
      toast.error("Nenhuma conta AWS conectada");
      return;
    }

    if (!organizationId) {
      toast.error("Organização não identificada");
      return;
    }

    setIsRunning(true);
    setIsOpen(true);

    // Inicializar status
    const initialStatus: RoutineStatus[] = systemRoutines.map(r => ({
      ...r,
      status: 'pending' as const
    }));
    setRoutines(initialStatus);

    // Executar todas as rotinas em paralelo
    const promises = systemRoutines.map(async (routine, index) => {
      // Marcar como running
      setRoutines(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], status: 'running' };
        return updated;
      });

      const result = await executeRoutine(routine, accountId, organizationId);

      // Atualizar com resultado
      setRoutines(prev => {
        const updated = [...prev];
        updated[index] = result;
        return updated;
      });

      return result;
    });

    const results = await Promise.all(promises);
    
    setIsRunning(false);

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    // CRITICAL: Invalidate all data caches after system update
    await queryClient.invalidateQueries({ queryKey: ['daily-costs'] });
    await queryClient.invalidateQueries({ queryKey: ['cost-recommendations'] });
    await queryClient.invalidateQueries({ queryKey: ['security-posture'] });
    await queryClient.invalidateQueries({ queryKey: ['findings'] });
    await queryClient.invalidateQueries({ queryKey: ['waste-detection'] });
    await queryClient.invalidateQueries({ queryKey: ['well-architected'] });
    await queryClient.invalidateQueries({ queryKey: ['drift-detection'] });
    await queryClient.invalidateQueries({ queryKey: ['resource-inventory'] });
    await queryClient.invalidateQueries({ queryKey: ['predictive-incidents'] });
    await queryClient.invalidateQueries({ queryKey: ['anomaly-detections'] });
    await queryClient.invalidateQueries({ queryKey: ['edge-resources'] });
    await queryClient.invalidateQueries({ queryKey: ['edge-metrics'] });
    await queryClient.invalidateQueries({ queryKey: ['cloudwatch-metrics'] });
    
    console.log('🔄 Cache invalidated after system update');

    toast.success(`Execução concluída: ${successCount} sucesso, ${errorCount} falhas`);
  };

  const progress = routines.length > 0 
    ? (routines.filter(r => r.status === 'success' || r.status === 'error').length / routines.length) * 100 
    : 0;

  const getStatusIcon = (status: RoutineStatus['status']) => {
    switch (status) {
      case 'pending':
        return <PlayCircle className="h-4 w-4 text-muted-foreground" />;
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  if (!accountId) return null;

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={runAllRoutines}
        disabled={isRunning}
        title="Executar todas as rotinas do sistema"
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Zap className="h-4 w-4" />
        )}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Execução de Rotinas do Sistema
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progresso</span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} />
            </div>

            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {routines.map((routine, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                  >
                    <div className="mt-0.5">
                      {getStatusIcon(routine.status)}
                    </div>
                    
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">
                          {routine.displayName}
                        </span>
                        {routine.duration && (
                          <Badge variant="outline" className="text-xs">
                            {routine.duration}ms
                          </Badge>
                        )}
                      </div>
                      
                      {routine.message && (
                        <p className={`text-xs ${
                          routine.status === 'error' 
                            ? 'text-destructive' 
                            : 'text-muted-foreground'
                        }`}>
                          {routine.message}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={isRunning}
              >
                Fechar
              </Button>
              <Button
                onClick={runAllRoutines}
                disabled={isRunning}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Executando...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Executar Novamente
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
