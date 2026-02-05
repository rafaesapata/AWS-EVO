import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { calculatePercentageChange } from "@/lib/utils";
import { 
 Shield, 
 ShieldAlert, 
 Ban, 
 Activity, 
 Globe, 
 AlertTriangle,
 TrendingUp,
 TrendingDown,
 Minus
} from "lucide-react";

interface WafMetrics {
 totalRequests: number;
 blockedRequests: number;
 allowedRequests: number;
 countedRequests: number;
 uniqueIps: number;
 uniqueCountries: number;
 criticalThreats: number;
 highThreats: number;
 mediumThreats: number;
 lowThreats: number;
 activeCampaigns: number;
 // Previous period metrics for comparison
 previousPeriod?: {
   totalRequests: number;
   blockedRequests: number;
   uniqueIps: number;
   criticalThreats: number;
   highThreats: number;
   activeCampaigns: number;
 };
}

interface WafMetricsCardsProps {
 metrics?: WafMetrics;
 isLoading: boolean;
 onCardClick?: (filter: { severity?: string; type?: string }) => void;
}

function calculateTrend(current: number, previous: number): { value: number; direction: 'up' | 'down' | 'neutral' } {
  const percentChange = calculatePercentageChange(current, previous);
  
  if (Math.abs(percentChange) < 1) {
    return { value: 0, direction: 'neutral' };
  }
  
  return {
    value: Math.abs(Math.round(percentChange)),
    direction: percentChange > 0 ? 'up' : 'down'
  };
}

function TrendIndicator({ trend, inverse = false }: { trend: { value: number; direction: 'up' | 'down' | 'neutral' }; inverse?: boolean }) {
  const { t } = useTranslation();
  
  if (trend.direction === 'neutral' || trend.value === 0) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        <span>{t('waf.metrics.noChange')}</span>
      </div>
    );
  }
  
  // For metrics like blocked requests, increase is bad (red), decrease is good (green)
  // For metrics like total requests, it's neutral
  const isGood = inverse ? trend.direction === 'down' : trend.direction === 'up';
  const colorClass = inverse 
    ? (trend.direction === 'up' ? 'text-red-500' : 'text-green-500')
    : (trend.direction === 'up' ? 'text-green-500' : 'text-red-500');
  
  return (
    <div className={`flex items-center gap-1 text-xs ${colorClass}`}>
      {trend.direction === 'up' ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      <span>{trend.value}%</span>
    </div>
  );
}

export function WafMetricsCards({ metrics, isLoading, onCardClick }: WafMetricsCardsProps) {
 const { t } = useTranslation();

 const cards = [
 {
 title: t('waf.totalRequests'),
 value: metrics?.totalRequests || 0,
 previousValue: metrics?.previousPeriod?.totalRequests || 0,
 icon: Activity,
 color: "text-blue-500",
 bgColor: "bg-blue-500/10",
 inverse: false,
 filter: null, // No filter for total requests
 },
 {
 title: t('waf.blockedRequests'),
 value: metrics?.blockedRequests || 0,
 previousValue: metrics?.previousPeriod?.blockedRequests || 0,
 icon: Ban,
 color: "text-red-500",
 bgColor: "bg-red-500/10",
 inverse: true,
 filter: { type: 'blocked' }, // Filter by blocked action
 },
 {
 title: t('waf.uniqueAttackers'),
 value: metrics?.uniqueIps || 0,
 previousValue: metrics?.previousPeriod?.uniqueIps || 0,
 icon: Globe,
 color: "text-orange-500",
 bgColor: "bg-orange-500/10",
 inverse: true,
 filter: null, // Unique Attackers não deve filtrar eventos (é uma métrica agregada)
 },
 {
 title: t('waf.criticalThreats'),
 value: metrics?.criticalThreats || 0,
 previousValue: metrics?.previousPeriod?.criticalThreats || 0,
 icon: AlertTriangle,
 color: "text-red-600",
 bgColor: "bg-red-600/10",
 inverse: true,
 filter: { severity: 'critical' },
 },
 {
 title: t('waf.highThreats'),
 value: metrics?.highThreats || 0,
 previousValue: metrics?.previousPeriod?.highThreats || 0,
 icon: ShieldAlert,
 color: "text-orange-500",
 bgColor: "bg-orange-500/10",
 inverse: true,
 filter: { severity: 'high' },
 },
 {
 title: t('waf.activeCampaigns'),
 value: metrics?.activeCampaigns || 0,
 previousValue: metrics?.previousPeriod?.activeCampaigns || 0,
 icon: TrendingUp,
 color: "text-purple-500",
 bgColor: "bg-purple-500/10",
 inverse: true,
 filter: { type: 'campaign' }, // Show campaigns
 },
 ];

 return (
 <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
 {cards.map((card, index) => {
   const trend = calculateTrend(card.value, card.previousValue);
   const isClickable = card.filter !== null && card.value > 0;
   
   return (
     <Card 
       key={index} 
       className={`transition-all duration-300 ${isClickable ? 'cursor-pointer hover:shadow-lg hover:scale-105' : 'hover:shadow-lg'}`}
       onClick={() => {
         if (isClickable && onCardClick && card.filter) {
           onCardClick(card.filter);
         }
       }}
     >
       <CardHeader className="pb-2">
         <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
           <div className={`p-1.5 rounded-md ${card.bgColor}`}>
             <card.icon className={`h-4 w-4 ${card.color}`} />
           </div>
           {card.title}
         </CardTitle>
       </CardHeader>
       <CardContent>
         {isLoading ? (
           <Skeleton className="h-8 w-16" />
         ) : (
           <div className="space-y-1">
             <div className={`text-2xl font-semibold ${card.color}`}>
               {card.value.toLocaleString()}
             </div>
             {card.previousValue > 0 && (
               <TrendIndicator trend={trend} inverse={card.inverse} />
             )}
             {isClickable && (
               <p className="text-xs text-muted-foreground mt-1">
                 {t('waf.clickToFilter', 'Clique para filtrar')}
               </p>
             )}
           </div>
         )}
       </CardContent>
     </Card>
   );
 })}
 </div>
 );
}
