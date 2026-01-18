/**
 * Operations Center Card - Endpoints, alerts, and remediations
 * Design aligned with Executive Summary Bar:
 *   - Primary: #00B2FF (light blue)
 *   - Text: #393939 (dark gray)
 *   - Labels: #5F5F5F (medium gray)
 *   - Background: #FFFFFF
 *   - Border: border-gray-200
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
import InfoIcon from './InfoIcon';

interface Props {
  data: OperationsCenter;
}

export default function OperationsCenterCard({ data }: Props) {
  const { t } = useTranslation();

  const getUptimeColor = (uptime: number) => {
    if (uptime >= 99.9) return 'text-[#00B2FF]';
    if (uptime >= 99) return 'text-[#393939]';
    return 'text-red-500';
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <p className="text-base font-light text-[#5F5F5F]">
            {t('executiveDashboard.operationsCenter', 'Operations Center')}
          </p>
          <InfoIcon tooltip={t('executiveDashboard.operationsCenterTooltip', 'Monitors the health and availability of your endpoints and services. This data is organization-wide and does not filter by cloud account.')} />
        </div>
      </div>

      <div className="p-5 space-y-5 flex-1">
        {/* Endpoint Status */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-light text-[#5F5F5F]">
              {t('executiveDashboard.endpointStatus', 'Endpoint Status')}
            </span>
            <Badge className="text-xs px-2 py-0.5 bg-[#00B2FF]/10 text-[#00B2FF] border-[#00B2FF]/20 rounded-full font-light">
              {data.endpoints.total} {t('executiveDashboard.monitored', 'monitored')}
            </Badge>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="p-3 rounded-xl bg-white border border-gray-200 text-center">
              <Server className="h-4 w-4 text-[#00B2FF] mx-auto mb-1" />
              <div className="text-xl font-light text-[#393939] tabular-nums">{data.endpoints.total}</div>
              <span className="text-xs font-light text-[#5F5F5F]">{t('executiveDashboard.total', 'Total')}</span>
            </div>
            <div className="p-3 rounded-xl bg-[#00B2FF]/5 border border-[#00B2FF]/20 text-center">
              <CheckCircle2 className="h-4 w-4 text-[#00B2FF] mx-auto mb-1" />
              <div className="text-xl font-light text-[#00B2FF] tabular-nums">{data.endpoints.healthy}</div>
              <span className="text-xs font-light text-[#5F5F5F]">{t('executiveDashboard.healthy', 'Healthy')}</span>
            </div>
            <div className={cn(
              "p-3 rounded-xl text-center border",
              data.endpoints.degraded > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'
            )}>
              <AlertTriangle className={cn(
                "h-4 w-4 mx-auto mb-1",
                data.endpoints.degraded > 0 ? 'text-amber-500' : 'text-gray-400'
              )} />
              <div className={cn(
                "text-xl font-light tabular-nums",
                data.endpoints.degraded > 0 ? 'text-amber-500' : 'text-[#393939]'
              )}>{data.endpoints.degraded}</div>
              <span className="text-xs font-light text-[#5F5F5F]">{t('executiveDashboard.degraded', 'Degraded')}</span>
            </div>
            <div className={cn(
              "p-3 rounded-xl text-center border",
              data.endpoints.down > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
            )}>
              <AlertTriangle className={cn(
                "h-4 w-4 mx-auto mb-1",
                data.endpoints.down > 0 ? 'text-red-500' : 'text-gray-400'
              )} />
              <div className={cn(
                "text-xl font-light tabular-nums",
                data.endpoints.down > 0 ? 'text-red-500' : 'text-[#393939]'
              )}>
                {data.endpoints.down}
              </div>
              <span className="text-xs font-light text-[#5F5F5F]">{t('executiveDashboard.down', 'Down')}</span>
            </div>
          </div>
        </div>

        {/* Uptime & Response Time */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-white border border-gray-200">
            <span className="text-sm font-light text-[#5F5F5F]">{t('executiveDashboard.uptime', 'Uptime')}</span>
            <p className={cn('tabular-nums mt-1', getUptimeColor(data.uptime.current))} style={{ fontSize: '32px', lineHeight: '1', fontWeight: '300' }}>
              {data.uptime.current.toFixed(2)}%
            </p>
            <span className="text-sm font-light text-[#5F5F5F]">
              {t('executiveDashboard.target', 'Meta')}: {data.uptime.target}%
            </span>
          </div>
          <div className="p-4 rounded-xl bg-white border border-gray-200">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-[#5F5F5F]" />
              <span className="text-sm font-light text-[#5F5F5F]">{t('executiveDashboard.avgResponse', 'Avg Response')}</span>
            </div>
            <p className="text-[#393939] tabular-nums mt-1" style={{ fontSize: '32px', lineHeight: '1', fontWeight: '300' }}>
              {data.responseTime.avg}ms
            </p>
            <span className={cn(
              "text-sm font-light",
              data.responseTime.avg < 500 ? 'text-[#00B2FF]' : data.responseTime.avg < 1000 ? 'text-amber-500' : 'text-red-500'
            )}>
              {data.responseTime.avg < 500 ? t('executiveDashboard.responseGood', 'Good') : data.responseTime.avg < 1000 ? t('executiveDashboard.responseFair', 'Fair') : t('executiveDashboard.responseSlow', 'Slow')}
            </span>
          </div>
        </div>

        {/* Active Alerts */}
        {data.alerts.active.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-light text-[#5F5F5F]">
                {t('executiveDashboard.activeAlerts', 'Active Alerts')}
              </span>
              <Badge className="text-xs px-2 py-0.5 bg-red-100 text-red-500 border-red-200 rounded-full font-light">
                {data.alerts.active.length}
              </Badge>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="max-h-[140px] overflow-y-auto">
                {data.alerts.active.slice(0, 3).map((alert, index) => (
                  <div 
                    key={alert.id} 
                    className={cn(
                      "flex items-center gap-2 p-2.5",
                      alert.severity.toLowerCase() === 'critical' ? 'bg-red-50' : 'bg-white',
                      index > 0 && 'border-t border-gray-100'
                    )}
                  >
                    <AlertTriangle className={cn(
                      'h-3.5 w-3.5 flex-shrink-0',
                      alert.severity.toLowerCase() === 'critical' ? 'text-red-500' : 'text-amber-500'
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-light text-[#393939] truncate">{alert.title}</div>
                    </div>
                    <Badge 
                      className={cn(
                        "text-xs px-1.5 py-0 rounded-full font-light",
                        alert.severity.toLowerCase() === 'critical' 
                          ? 'bg-red-100 text-red-500 border-red-200' 
                          : 'bg-amber-100 text-amber-500 border-amber-200'
                      )}
                    >
                      {alert.severity}
                    </Badge>
                  </div>
                ))}
              </div>
              {data.alerts.active.length > 3 && (
                <div className="px-2.5 py-1.5 bg-gray-50 border-t border-gray-100 text-center">
                  <span className="text-xs font-light text-[#5F5F5F]">
                    +{data.alerts.active.length - 3} {t('executiveDashboard.moreAlerts', 'more alerts')}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Remediations */}
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <span className="text-sm font-light text-[#5F5F5F]">
            {t('executiveDashboard.remediations', 'Remediations')}
          </span>

          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-xl bg-white border border-gray-200 text-center">
              <div className="text-lg font-light text-[#393939] tabular-nums">{data.remediations.pending}</div>
              <span className="text-xs font-light text-[#5F5F5F]">{t('executiveDashboard.pending', 'Pending')}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#00B2FF]/5 border border-[#00B2FF]/20 text-center">
              <div className="text-lg font-light text-[#00B2FF] tabular-nums">{data.remediations.inProgress}</div>
              <span className="text-xs font-light text-[#5F5F5F]">{t('executiveDashboard.inProgress', 'In Progress')}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#00B2FF]/5 border border-[#00B2FF]/20 text-center">
              <div className="text-lg font-light text-[#00B2FF] tabular-nums">{data.remediations.resolved}</div>
              <span className="text-xs font-light text-[#5F5F5F]">{t('executiveDashboard.resolved', 'Resolved')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
