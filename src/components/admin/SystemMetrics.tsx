import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { metricsCollector } from '@/lib/metrics-collector';
import { configManager, SystemConfig } from '@/lib/config-manager';
import { timerManager } from '@/lib/timer-manager';
import { RefreshCw, Activity, Clock, Settings, TrendingUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export function SystemMetrics() {
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<Record<string, any>>({});
  const [config, setConfig] = useState<SystemConfig>(configManager.getConfig());
  const [activeTimers, setActiveTimers] = useState<string[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(metricsCollector.getAllStats());
      setActiveTimers(timerManager.getActiveTimers());
    }, 1000);

    const unsubscribe = configManager.subscribe('system-metrics', (newConfig) => {
      setConfig(newConfig);
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const updateInterval = (key: keyof SystemConfig['intervals'], value: number) => {
    configManager.updateConfig({
      intervals: {
        ...config.intervals,
        [key]: value,
      },
    });
    toast({
      title: 'Configuração Atualizada',
      description: `Intervalo ${key} atualizado para ${value}ms`,
    });
  };

  const resetConfig = () => {
    configManager.resetToDefaults();
    toast({
      title: 'Configuração Resetada',
      description: 'Todas as configurações foram restauradas para os valores padrão',
    });
  };

  const clearMetrics = () => {
    metricsCollector.clear();
    toast({
      title: 'Métricas Limpas',
      description: 'Todas as métricas foram resetadas',
    });
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-semibold">System Metrics & Configuration</h2>
          <p className="text-muted-foreground">Monitor performance and configure system behavior</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => metricsCollector.logSummary()}>
            <Activity className="h-4 w-4 mr-2" />
            Log to Console
          </Button>
          <Button variant="outline" size="sm" onClick={clearMetrics}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Clear Metrics
          </Button>
        </div>
      </div>

      <Tabs defaultValue="metrics">
        <TabsList>
          <TabsTrigger value="metrics">
            <TrendingUp className="h-4 w-4 mr-2" />
            Metrics
          </TabsTrigger>
          <TabsTrigger value="timers">
            <Clock className="h-4 w-4 mr-2" />
            Timers
          </TabsTrigger>
          <TabsTrigger value="config">
            <Settings className="h-4 w-4 mr-2" />
            Configuration
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(metrics).map(([name, stats]) => (
              <Card key={name}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">{name}</CardTitle>
                  <CardDescription>Performance statistics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Count:</span>
                    <span className="font-mono">{stats.count}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Average:</span>
                    <span className="font-mono">{formatDuration(stats.avg)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">P50:</span>
                    <span className="font-mono">{formatDuration(stats.p50)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">P95:</span>
                    <span className="font-mono">{formatDuration(stats.p95)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">P99:</span>
                    <span className="font-mono">{formatDuration(stats.p99)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Min/Max:</span>
                    <span className="font-mono">
                      {formatDuration(stats.min)} / {formatDuration(stats.max)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
            {Object.keys(metrics).length === 0 && (
              <Card className="col-span-full">
                <CardContent className="py-8 text-center text-muted-foreground">
                  No metrics collected yet. Metrics will appear as the system operates.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="timers">
          <Card>
            <CardHeader>
              <CardTitle>Active Timers</CardTitle>
              <CardDescription>
                {activeTimers.length} timer{activeTimers.length !== 1 ? 's' : ''} currently active
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {activeTimers.map((timerId) => (
                    <div
                      key={timerId}
                      className="flex items-center justify-between p-3 rounded-lg "
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" />
                        <span className="font-mono text-sm">{timerId}</span>
                      </div>
                      <Badge variant="outline">Active</Badge>
                    </div>
                  ))}
                  {activeTimers.length === 0 && (
                    <div className="py-8 text-center text-muted-foreground">
                      No active timers
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Refresh Intervals</CardTitle>
              <CardDescription>Configure automatic refresh intervals (in milliseconds)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(config.intervals).map(([key, value]) => (
                <div key={key} className="grid gap-2">
                  <Label htmlFor={key} className="capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id={key}
                      type="number"
                      value={value}
                      onChange={(e) =>
                        updateInterval(key as keyof SystemConfig['intervals'], parseInt(e.target.value))
                      }
                      className="font-mono"
                    />
                    <Badge variant="outline" className="shrink-0">
                      {formatDuration(value)}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Retry Configuration</CardTitle>
              <CardDescription>Configure retry behavior for failed operations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Max Attempts</Label>
                <Input
                  type="number"
                  value={config.retry.maxAttempts}
                  onChange={(e) =>
                    configManager.updateConfig({
                      retry: { ...config.retry, maxAttempts: parseInt(e.target.value) },
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Base Delay (ms)</Label>
                <Input
                  type="number"
                  value={config.retry.baseDelay}
                  onChange={(e) =>
                    configManager.updateConfig({
                      retry: { ...config.retry, baseDelay: parseInt(e.target.value) },
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Max Delay (ms)</Label>
                <Input
                  type="number"
                  value={config.retry.maxDelay}
                  onChange={(e) =>
                    configManager.updateConfig({
                      retry: { ...config.retry, maxDelay: parseInt(e.target.value) },
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Button onClick={resetConfig} variant="outline">
            Reset to Defaults
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
