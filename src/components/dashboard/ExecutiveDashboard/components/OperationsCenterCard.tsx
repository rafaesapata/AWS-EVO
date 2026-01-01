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
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary icon-pulse" />
          <CardTitle className="text-base">{t('executiveDashboard.operationsCenter', 'Operations Center')}</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {t('executiveDashboard.operationsCenterDesc', 'Endpoint health and operational status')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Endpoint Status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">
              {t('executiveDashboard.endpointStatus', 'Endpoint Status')}
            </span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {data.endpoints.total} monitored
            </Badge>
          </div>

          <div className="grid grid-cols-4 gap-1.5 animate-stagger">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-center transition-all hover:scale-105">
              <Server className="h-3.5 w-3.5 mx-auto mb-0.5 text-primary icon-bounce" />
              <div className="text-base font-bold tabular-nums">{data.endpoints.total}</div>
              <span className="text-[10px] text-muted-foreground">Total</span>
            </div>
            <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-center transition-all hover:scale-105 glow-success">
              <CheckCircle2 className="h-3.5 w-3.5 mx-auto mb-0.5 text-green-500 icon-pulse" />
              <div className="text-base font-bold text-green-500 tabular-nums">{data.endpoints.healthy}</div>
              <span className="text-[10px] text-muted-foreground">Healthy</span>
            </div>
            <div className={cn(
              "p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center transition-all hover:scale-105",
              data.endpoints.degraded > 0 && "alert-pulse"
            )}>
              <AlertTriangle className="h-3.5 w-3.5 mx-auto mb-0.5 text-yellow-500" />
              <div className="text-base font-bold text-yellow-500 tabular-nums">{data.endpoints.degraded}</div>
              <span className="text-[10px] text-muted-foreground">Degraded</span>
            </div>
            <div className={cn(
              "p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-center transition-all hover:scale-105",
              data.endpoints.down > 0 && "glow-danger alert-pulse"
            )}>
              <AlertTriangle className="h-3.5 w-3.5 mx-auto mb-0.5 text-red-500" />
              <div className="text-base font-bold text-red-500 tabular-nums">{data.endpoints.down}</div>
              <span className="text-[10px] text-muted-foreground">Down</span>
            </div>
          </div>
        </div>

        {/* Uptime & Response Time */}
        <div className="grid grid-cols-2 gap-2 animate-stagger">
          <div className="p-2.5 rounded-lg bg-muted/50 transition-all hover:bg-muted/70 hover:scale-[1.02]">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity className="h-3.5 w-3.5 text-muted-foreground icon-pulse" />
              <span className="text-[10px] text-muted-foreground">Uptime</span>
            </div>
            <div className={cn('text-lg font-bold tabular-nums', getUptimeColor(data.uptime.current))}>
              {data.uptime.current.toFixed(2)}%
            </div>
            <span className="text-[10px] text-muted-foreground">
              Target: {data.uptime.target}%
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/50 transition-all hover:bg-muted/70 hover:scale-[1.02]">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-3.5 w-3.5 text-muted-foreground icon-bounce" />
              <span className="text-[10px] text-muted-foreground">Avg Response</span>
            </div>
            <div className="text-lg font-bold tabular-nums">
              {data.responseTime.avg}ms
            </div>
            <span className="text-[10px] text-muted-foreground">
              {data.responseTime.avg < 500 ? 'Good' : data.responseTime.avg < 1000 ? 'Fair' : 'Slow'}
            </span>
          </div>
        </div>

        {/* Active Alerts */}
        {data.alerts.active.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">
                {t('executiveDashboard.activeAlerts', 'Active Alerts')}
              </span>
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                {data.alerts.active.length}
              </Badge>
            </div>
            <div className="space-y-1.5 max-h-24 overflow-y-auto animate-stagger">
              {data.alerts.active.slice(0, 3).map((alert) => (
                <div 
                  key={alert.id} 
                  className={cn(
                    "flex items-center gap-1.5 p-1.5 rounded-lg bg-red-500/5 border border-red-500/20 transition-all hover:bg-red-500/10 hover:translate-x-1",
                    alert.severity.toLowerCase() === 'critical' && "alert-pulse glow-danger"
                  )}
                >
                  <AlertTriangle className={cn(
                    'h-3.5 w-3.5 flex-shrink-0',
                    alert.severity.toLowerCase() === 'critical' ? 'text-red-500 icon-pulse' : 'text-orange-500'
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{alert.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Since {new Date(alert.since).toLocaleString()}
                    </div>
                  </div>
                  <Badge variant={alert.severity.toLowerCase() === 'critical' ? 'destructive' : 'secondary'} className="text-[10px] px-1 py-0">
                    {alert.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Remediations */}
        <div className="border-t pt-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5 text-muted-foreground icon-rotate" />
            <span className="text-xs font-medium">
              {t('executiveDashboard.remediations', 'Remediations')}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 animate-stagger">
            <div className="p-1.5 rounded-lg bg-yellow-500/10 text-center transition-all hover:scale-105">
              <div className="text-sm font-bold text-yellow-500 tabular-nums">{data.remediations.pending}</div>
              <span className="text-[10px] text-muted-foreground">Pending</span>
            </div>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-center transition-all hover:scale-105">
              <div className="text-sm font-bold text-blue-500 tabular-nums">{data.remediations.inProgress}</div>
              <span className="text-[10px] text-muted-foreground">In Progress</span>
            </div>
            <div className="p-1.5 rounded-lg bg-green-500/10 text-center transition-all hover:scale-105 glow-success">
              <div className="text-sm font-bold text-green-500 tabular-nums">{data.remediations.resolved}</div>
              <span className="text-[10px] text-muted-foreground">Resolved</span>
            </div>
          </div>

          {data.remediations.total > 0 && (
            <div className="text-[10px] text-muted-foreground text-center">
              {data.remediations.resolved}/{data.remediations.total} completed
            </div>
          )}
        </div>

        {/* Last Check */}
        {data.lastCheckDate && (
          <div className="text-[10px] text-muted-foreground text-center">
            Last check: {new Date(data.lastCheckDate).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
