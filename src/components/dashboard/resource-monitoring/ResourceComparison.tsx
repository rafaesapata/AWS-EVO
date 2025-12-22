import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface Resource {
  resource_id: string;
  resource_name: string;
  resource_type: string;
  status: string;
}

interface Metric {
  resource_id: string;
  metric_name: string;
  metric_value: number;
  metric_unit: string;
  timestamp: string;
}

interface Props {
  resources: Resource[];
  metrics: Metric[];
}

export function ResourceComparison({ resources, metrics }: Props) {
  const [selectedResources, setSelectedResources] = useState<string[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<string>("CPUUtilization");

  const availableMetrics = Array.from(
    new Set(metrics.map(m => m.metric_name))
  );

  const addResource = (resourceId: string) => {
    if (selectedResources.length < 5 && !selectedResources.includes(resourceId)) {
      setSelectedResources([...selectedResources, resourceId]);
    }
  };

  const removeResource = (resourceId: string) => {
    setSelectedResources(selectedResources.filter(r => r !== resourceId));
  };

  // Preparar dados para o gráfico
  const chartData = (() => {
    if (selectedResources.length === 0) return [];

    const timestamps = Array.from(
      new Set(
        metrics
          .filter(m => m.metric_name === selectedMetric)
          .map(m => m.timestamp)
      )
    ).sort();

    return timestamps.map(timestamp => {
      const dataPoint: any = {
        timestamp: new Date(timestamp).toLocaleTimeString('pt-BR', { 
          hour: '2-digit', 
          minute: '2-digit' 
        })
      };

      selectedResources.forEach(resourceId => {
        const metric = metrics.find(
          m => m.resource_id === resourceId && 
               m.timestamp === timestamp && 
               m.metric_name === selectedMetric
        );
        
        const resource = resources.find(r => r.resource_id === resourceId);
        dataPoint[resource?.resource_name || resourceId] = metric?.metric_value || null;
      });

      return dataPoint;
    });
  })();

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comparação de Recursos</CardTitle>
        <CardDescription>Compare métricas de até 5 recursos simultaneamente</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium mb-2 block">Adicionar Recurso</label>
            <Select onValueChange={addResource} value="">
              <SelectTrigger>
                <SelectValue placeholder="Selecione um recurso" />
              </SelectTrigger>
              <SelectContent>
                {resources
                  .filter(r => !selectedResources.includes(r.resource_id))
                  .map(resource => (
                    <SelectItem key={resource.resource_id} value={resource.resource_id}>
                      {resource.resource_name} ({resource.resource_type})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Métrica</label>
            <Select value={selectedMetric} onValueChange={setSelectedMetric}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableMetrics.map(metric => (
                  <SelectItem key={metric} value={metric}>
                    {metric}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedResources.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedResources.map((resourceId, idx) => {
              const resource = resources.find(r => r.resource_id === resourceId);
              return (
                <Badge
                  key={resourceId}
                  variant="outline"
                  className="cursor-pointer hover:bg-destructive/10"
                  onClick={() => removeResource(resourceId)}
                  style={{ borderColor: COLORS[idx] }}
                >
                  {resource?.resource_name || resourceId} ✕
                </Badge>
              );
            })}
          </div>
        )}

        {selectedResources.length > 0 && chartData.length > 0 ? (
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="timestamp" 
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {selectedResources.map((resourceId, idx) => {
                  const resource = resources.find(r => r.resource_id === resourceId);
                  return (
                    <Line
                      key={resourceId}
                      type="monotone"
                      dataKey={resource?.resource_name || resourceId}
                      stroke={COLORS[idx]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Selecione recursos para comparar métricas
          </div>
        )}
      </CardContent>
    </Card>
  );
}
