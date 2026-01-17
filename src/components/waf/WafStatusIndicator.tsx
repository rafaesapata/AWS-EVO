import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, AlertTriangle, AlertCircle, CheckCircle } from "lucide-react";

interface WafStatusIndicatorProps {
  metrics?: {
    totalRequests: number;
    blockedRequests: number;
    criticalThreats: number;
    highThreats: number;
  };
}

export function WafStatusIndicator({ metrics }: WafStatusIndicatorProps) {
  const { t } = useTranslation();

  // Calculate risk level
  const getRiskLevel = () => {
    if (!metrics) return { level: 'unknown', color: 'gray', icon: Shield, text: t('waf.unknown') };
    
    const blockRate = metrics.totalRequests > 0 
      ? (metrics.blockedRequests / metrics.totalRequests) * 100 
      : 0;
    
    const criticalCount = metrics.criticalThreats || 0;
    const highCount = metrics.highThreats || 0;

    if (criticalCount > 10 || blockRate > 50) {
      return { 
        level: 'critical', 
        color: 'red', 
        icon: AlertCircle, 
        text: t('waf.statusCritical', 'Crítico'),
        bgColor: 'bg-red-500/10',
        textColor: 'text-red-500'
      };
    }
    
    if (criticalCount > 0 || highCount > 20 || blockRate > 20) {
      return { 
        level: 'high', 
        color: 'orange', 
        icon: AlertTriangle, 
        text: t('waf.statusHigh', 'Alto'),
        bgColor: 'bg-orange-500/10',
        textColor: 'text-orange-500'
      };
    }
    
    if (highCount > 0 || blockRate > 5) {
      return { 
        level: 'medium', 
        color: 'yellow', 
        icon: AlertTriangle, 
        text: t('waf.statusMedium', 'Médio'),
        bgColor: 'bg-yellow-500/10',
        textColor: 'text-yellow-500'
      };
    }
    
    return { 
      level: 'low', 
      color: 'green', 
      icon: CheckCircle, 
      text: t('waf.statusLow', 'Baixo'),
      bgColor: 'bg-green-500/10',
      textColor: 'text-green-500'
    };
  };

  const status = getRiskLevel();
  const StatusIcon = status.icon;

  return (
    <Card className={`glass border-primary/20 ${status.bgColor}`}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-full ${status.bgColor}`}>
              <StatusIcon className={`h-6 w-6 ${status.textColor}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {t('waf.riskLevel', 'Nível de Risco')}
              </p>
              <p className={`text-2xl font-bold ${status.textColor}`}>
                {status.text}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${status.textColor} animate-pulse`} />
            <span className="text-sm text-muted-foreground">
              {t('waf.monitoring', 'Monitorando')}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
