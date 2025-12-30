/**
 * Operations Center Card - Endpoints, alerts, and remediations
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  Clock,
  Server,
  Wrench
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { OperationsCenter } from '../types';

interface Props {
  data: OperationsCenter;
}

export default function OperationsCenterCard({ data }: Props) {
  const { t } = useTranslation();

  const getUptimeColor = (uptime: number) => {
    if (uptime >= 99.9) return 'text-green-500';
    if (uptime >= 99) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <Card className="h-full card-hover-lift card-shine">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary icon-pulse" />
          <CardTitle>{t('executiveDashboard.operationsCenter', 'Operations Center')}</CardTitle>
        </div>
        <CardDescription>
          {t('executiveDashboard.operationsCenterDesc', 'Endpoint health and operational status')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Endpoint Status */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {t('executiveDashboard.endpointStatus', 'Endpoint Status')}
            </span>
            <Badge variant="outline">
              {data.endpoints.total} monitored
            </Badge>
          </div>

          <div className="grid grid-cols-4 gap-2 animate-stagger">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-center transition-all hover:scale-105">
              <Server className="h-4 w-4 mx-auto mb-1 text-primary icon-bounce" />
              <div className="text-xl font-bold tabular-nums">{data.endpoints.total}</div>
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-center transition-all hover:scale-105 glow-success">
              <CheckCircle2 className="h-4 w-4 mx-auto mb-1 text-green-500 icon-pulse" />
              <div className="text-xl font-bold text-green-500 tabular-nums">{data.endpoints.healthy}</div>
              <span className="text-xs text-muted-foreground">Healthy</span>
            </div>
            <div className={cn(
              "p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center transition-all hover:scale-105",
              data.endpoints.degraded > 0 && "alert-pulse"
            )}>
              <AlertTriangle className="h-4 w-4 mx-auto mb-1 text-yellow-500" />
              <div className="text-xl font-bold text-yellow-500 tabular-nums">{data.endpoints.degraded}</div>
              <span className="text-xs text-muted-foreground">Degraded</span>
            </div>
            <div className={cn(
              "p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-center transition-all hover:scale-105",
              data.endpoints.down > 0 && "glow-danger alert-pulse"
            )}>
              <AlertTriangle className="h-4 w-4 mx-auto mb-1 text-red-500" />
              <div className="text-xl font-bold text-red-500 tabular-nums">{data.endpoints.down}</div>
              <span className="text-xs text-muted-foreground">Down</span>
            </div>
          </div>
        </div>

        {/* Uptime & Response Time */}
        <div className="grid grid-cols-2 gap-4 animate-stagger">
          <div className="p-4 rounded-lg bg-muted/50 transition-all hover:bg-muted/70 hover:scale-[1.02]">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-muted-foreground icon-pulse" />
              <span className="text-sm text-muted-foreground">Uptime</span>
            </div>
            <div className={cn('text-2xl font-bold tabular-nums', getUptimeColor(data.uptime.current))}>
              {data.uptime.current.toFixed(2)}%
            </div>
            <span className="text-xs text-muted-foreground">
              Target: {data.uptime.target}%
            </span>
          </div>
          <div className="p-4 rounded-lg bg-muted/50 transition-all hover:bg-muted/70 hover:scale-[1.02]">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-muted-foreground icon-bounce" />
              <span className="text-sm text-muted-foreground">Avg Response</span>
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {data.responseTime.avg}ms
            </div>
            <span className="text-xs text-muted-foreground">
              {data.responseTime.avg < 500 ? 'Good' : data.responseTime.avg < 1000 ? 'Fair' : 'Slow'}
            </span>
          </div>
        </div>

        {/* Active Alerts */}
        {data.alerts.active.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {t('executiveDashboard.activeAlerts', 'Active Alerts')}
              </span>
              <Badge variant="destructive">
                {data.alerts.active.length}
              </Badge>
            </div>
            <div className="space-y-2 max-h-32 overflow-y-auto animate-stagger">
              {data.alerts.active.slice(0, 3).map((alert) => (
                <div 
                  key={alert.id} 
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg bg-red-500/5 border border-red-500/20 transition-all hover:bg-red-500/10 hover:translate-x-1",
                    alert.severity.toLowerCase() === 'critical' && "alert-pulse glow-danger"
                  )}
                >
                  <AlertTriangle className={cn(
                    'h-4 w-4 flex-shrink-0',
                    alert.severity.toLowerCase() === 'critical' ? 'text-red-500 icon-pulse' : 'text-orange-500'
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{alert.title}</div>
                    <div className="text-xs text-muted-foreground">
                      Since {new Date(alert.since).toLocaleString()}
                    </div>
                  </div>
                  <Badge variant={alert.severity.toLowerCase() === 'critical' ? 'destructive' : 'secondary'}>
                    {alert.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Remediations */}
        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground icon-rotate" />
            <span className="text-sm font-medium">
              {t('executiveDashboard.remediations', 'Remediations')}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 animate-stagger">
            <div className="p-2 rounded-lg bg-yellow-500/10 text-center transition-all hover:scale-105">
              <div className="text-lg font-bold text-yellow-500 tabular-nums">{data.remediations.pending}</div>
              <span className="text-xs text-muted-foreground">Pending</span>
            </div>
            <div className="p-2 rounded-lg bg-blue-500/10 text-center transition-all hover:scale-105">
              <div className="text-lg font-bold text-blue-500 tabular-nums">{data.remediations.inProgress}</div>
              <span className="text-xs text-muted-foreground">In Progress</span>
            </div>
            <div className="p-2 rounded-lg bg-green-500/10 text-center transition-all hover:scale-105 glow-success">
              <div className="text-lg font-bold text-green-500 tabular-nums">{data.remediations.resolved}</div>
              <span className="text-xs text-muted-foreground">Resolved</span>
            </div>
          </div>

          {data.remediations.total > 0 && (
            <div className="text-xs text-muted-foreground text-center">
              {data.remediations.resolved}/{data.remediations.total} completed
            </div>
          )}
        </div>

        {/* Last Check */}
        {data.lastCheckDate && (
          <div className="text-xs text-muted-foreground text-center">
            Last check: {new Date(data.lastCheckDate).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
