import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface GeoData {
  country: string;
  blockedRequests: number;
}

interface WafWorldMapProps {
  geoDistribution: GeoData[];
  isLoading: boolean;
}

export function WafWorldMap({ geoDistribution, isLoading }: WafWorldMapProps) {
  const { t } = useTranslation();

  // Get top 10 countries
  const topCountries = geoDistribution.slice(0, 10);
  const maxBlocked = Math.max(...topCountries.map(c => c.blockedRequests), 1);

  if (isLoading) {
    return (
      <Card className="glass border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t('waf.geographicDistribution', 'Distribuição Geográfica')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          {t('waf.geographicDistribution', 'Distribuição Geográfica')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {topCountries.map((country, index) => {
            const percentage = (country.blockedRequests / maxBlocked) * 100;
            const intensity = Math.min(percentage / 100, 1);
            
            return (
              <div key={country.country} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">#{index + 1}</span>
                    <span className="text-sm">{country.country}</span>
                  </div>
                  <Badge variant="destructive">
                    {country.blockedRequests.toLocaleString()}
                  </Badge>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-500"
                    style={{ 
                      width: `${percentage}%`,
                      opacity: 0.5 + (intensity * 0.5)
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {topCountries.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            {t('waf.noGeoData', 'Nenhum dado geográfico disponível')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
