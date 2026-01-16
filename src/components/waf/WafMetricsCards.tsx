import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
 Shield, 
 ShieldAlert, 
 Ban, 
 Activity, 
 Globe, 
 AlertTriangle,
 TrendingUp
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
}

interface WafMetricsCardsProps {
 metrics?: WafMetrics;
 isLoading: boolean;
}

export function WafMetricsCards({ metrics, isLoading }: WafMetricsCardsProps) {
 const { t } = useTranslation();

 const cards = [
 {
 title: t('waf.totalRequests'),
 value: metrics?.totalRequests || 0,
 icon: Activity,
 color: "text-blue-500",
 bgColor: "bg-blue-500/10",
 },
 {
 title: t('waf.blockedRequests'),
 value: metrics?.blockedRequests || 0,
 icon: Ban,
 color: "text-red-500",
 bgColor: "bg-red-500/10",
 },
 {
 title: t('waf.uniqueAttackers'),
 value: metrics?.uniqueIps || 0,
 icon: Globe,
 color: "text-orange-500",
 bgColor: "bg-orange-500/10",
 },
 {
 title: t('waf.criticalThreats'),
 value: metrics?.criticalThreats || 0,
 icon: AlertTriangle,
 color: "text-red-600",
 bgColor: "bg-red-600/10",
 },
 {
 title: t('waf.highThreats'),
 value: metrics?.highThreats || 0,
 icon: ShieldAlert,
 color: "text-orange-500",
 bgColor: "bg-orange-500/10",
 },
 {
 title: t('waf.activeCampaigns'),
 value: metrics?.activeCampaigns || 0,
 icon: TrendingUp,
 color: "text-purple-500",
 bgColor: "bg-purple-500/10",
 },
 ];

 return (
 <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
 {cards.map((card, index) => (
 <Card key={index} className=" transition-all duration-300">
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
 <div className={`text-2xl font-semibold ${card.color}`}>
 {card.value.toLocaleString()}
 </div>
 )}
 </CardContent>
 </Card>
 ))}
 </div>
 );
}
