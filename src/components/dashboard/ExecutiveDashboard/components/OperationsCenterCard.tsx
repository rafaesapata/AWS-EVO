/**
 * Operations Center Card - Endpoints, alerts, and remediations
 * Clean Light Design with color palette:
 *   - Primary: #003C7D (dark blue)
 *   - Secondary: #008CFF (light blue)
 *   - Success: #10B981 (green)
 *   - Background: #FFFFFF / #F9FAFB
 *   - Text: #1F2937 (dark gray)
 */

import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Clock,
  Server
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
    if (uptime >= 99.9) return 'text-[#10B981]';
    if (uptime >= 99) return 'text-[#1F2937]';
    return 'text-red-600';
  };

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-base font-semibold text-[#1F2937]">
          {t('executiveDashboard.operationsCenter', 'Operations Center')}
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {t('executiveDashboard.operationsCenterDesc', 'Endpoint health and operational status')}
        </p>
      </div>

      <div className="p-6 space-y-5">
        {/* Endpoint Status */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#1F2937]">
              {t('executiveDashboard.endpointStatus', 'Endpoint Status')}
            </span>
            <Badge className="text-xs px-2.5 py-1 bg-[#003C7D]/10 text-[#003C7D] border-[#003C7D]/20 rounded-full font-medium">
              {data.endpoints.total} monitored
            </Badge>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="p-3 rounded-xl bg-[#F9FAFB] border border-gray-100 text-center">
              <Server className="h-4 w-4 mx-auto mb-1 text-[#003C7D]" />
              <div className="text-2xl font-light text-[#1F2937] tabular-nums">{data.endpoints.total}</div>
              <span className="text-xs text-gray-500">Total</span>
            </div>
            <div className="p-3 rounded-xl bg-[#10B981]/10 border border-[#10B981]/20 text-center">
              <CheckCircle2 className="h-4 w-4 mx-auto mb-1 text-[#10B981]" />
              <div className="text-2xl font-light text-[#10B981] tabular-nums">{data.endpoints.healthy}</div>
              <span className="text-xs text-gray-500">Healthy</span>
            </div>
            <div className={cn(
              "p-3 rounded-xl text-center border",
              data.endpoints.degraded > 0 ? 'bg-amber-50 border-amber-200' : 'bg-[#F9FAFB] border-gray-100'
            )}>
              <AlertTriangle className={cn(
                "h-4 w-4 mx-auto mb-1",
                data.endpoints.degraded > 0 ? 'text-amber-500' : 'text-gray-400'
              )} />
              <div className={cn(
                "text-2xl font-light tabular-nums",
                data.endpoints.degraded > 0 ? 'text-amber-600' : 'text-[#1F2937]'
              )}>{data.endpoints.degraded}</div>
              <span className="text-xs text-gray-500">Degraded</span>
            </div>
            <div className={cn(
              "p-3 rounded-xl text-center border",
              data.endpoints.down > 0 ? 'bg-red-50 border-red-200' : 'bg-[#F9FAFB] border-gray-100'
            )}>
              <AlertTriangle className={cn(
                "h-4 w-4 mx-auto mb-1",
                data.endpoints.down > 0 ? 'text-red-600' : 'text-gray-400'
              )} />
              <div className={cn(
                "text-2xl font-light tabular-nums",
                data.endpoints.down > 0 ? 'text-red-600' : 'text-[#1F2937]'
              )}>
                {data.endpoints.down}
              </div>
              <span className="text-xs text-gray-500">Down</span>
            </div>
          </div>
        </div>

        {/* Uptime & Response Time */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-[#F9FAFB] border border-gray-100">
            <span className="text-xs text-gray-500">Uptime</span>
            <div className={cn('text-3xl font-light tabular-nums mt-1', getUptimeColor(data.uptime.current))}>
              {data.uptime.current.toFixed(2)}%
            </div>
            <span className="text-xs text-gray-400">
              Target: {data.uptime.target}%
            </span>
          </div>
          <div className="p-4 rounded-xl bg-[#F9FAFB] border border-gray-100">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs text-gray-500">Avg Response</span>
            </div>
            <div className="text-3xl font-light text-[#1F2937] tabular-nums mt-1">
              {data.responseTime.avg}ms
            </div>
            <span className={cn(
              "text-xs",
              data.responseTime.avg < 500 ? 'text-[#10B981]' : data.responseTime.avg < 1000 ? 'text-amber-500' : 'text-red-500'
            )}>
              {data.responseTime.avg < 500 ? 'Good' : data.responseTime.avg < 1000 ? 'Fair' : 'Slow'}
            </span>
          </div>
        </div>

        {/* Active Alerts */}
        {data.alerts.active.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#1F2937]">
                {t('executiveDashboard.activeAlerts', 'Active Alerts')}
              </span>
              <Badge className="text-xs px-2.5 py-1 bg-red-100 text-red-600 border-red-200 rounded-full font-medium">
                {data.alerts.active.length}
              </Badge>
            </div>
            <div className="space-y-2 max-h-28 overflow-y-auto">
              {data.alerts.active.slice(0, 3).map((alert) => (
                <div 
                  key={alert.id} 
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-xl border",
                    alert.severity.toLowerCase() === 'critical' ? 'bg-red-50 border-red-200' : 'bg-[#F9FAFB] border-gray-100'
                  )}
                >
                  <AlertTriangle className={cn(
                    'h-4 w-4 flex-shrink-0',
                    alert.severity.toLowerCase() === 'critical' ? 'text-red-600' : 'text-amber-500'
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#1F2937] truncate">{alert.title}</div>
                    <div className="text-xs text-gray-500">
                      Since {new Date(alert.since).toLocaleString()}
                    </div>
                  </div>
                  <Badge 
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      alert.severity.toLowerCase() === 'critical' 
                        ? 'bg-red-100 text-red-600 border-red-200' 
                        : 'bg-amber-100 text-amber-600 border-amber-200'
                    )}
                  >
                    {alert.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Remediations */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <span className="text-sm font-semibold text-[#1F2937]">
            {t('executiveDashboard.remediations', 'Remediations')}
          </span>

          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-xl bg-[#F9FAFB] border border-gray-100 text-center">
              <div className="text-xl font-light text-[#1F2937] tabular-nums">{data.remediations.pending}</div>
              <span className="text-xs text-gray-500">Pending</span>
            </div>
            <div className="p-3 rounded-xl bg-[#008CFF]/10 border border-[#008CFF]/20 text-center">
              <div className="text-xl font-light text-[#008CFF] tabular-nums">{data.remediations.inProgress}</div>
              <span className="text-xs text-gray-500">In Progress</span>
            </div>
            <div className="p-3 rounded-xl bg-[#10B981]/10 border border-[#10B981]/20 text-center">
              <div className="text-xl font-light text-[#10B981] tabular-nums">{data.remediations.resolved}</div>
              <span className="text-xs text-gray-500">Resolved</span>
            </div>
          </div>

          {data.remediations.total > 0 && (
            <div className="text-xs text-gray-400 text-center">
              {data.remediations.resolved}/{data.remediations.total} completed
            </div>
          )}
        </div>

        {/* Last Check */}
        {data.lastCheckDate && (
          <div className="text-xs text-gray-400 text-center">
            Last check: {new Date(data.lastCheckDate).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
