import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Globe, 
  Ban, 
  AlertTriangle,
  TrendingUp,
  MapPin,
  Building2,
  Network,
  Clock,
  Shield,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  Activity
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";

interface TopAttacker {
  sourceIp: string;
  country?: string;
  blockedRequests: number;
}

interface IpGeoInfo {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  regionName: string;
  city: string;
  zip: string;
  lat: number;
  lon: number;
  timezone: string;
  isp: string;
  org: string;
  as: string;
  query: string;
}

interface IpEvent {
  id: string;
  timestamp: string;
  action: string;
  uri: string;
  http_method: string;
  threat_type?: string;
  severity: string;
}

interface WafTopAttackersProps {
  topAttackers: TopAttacker[];
  isLoading: boolean;
  onBlockIp?: (ip: string) => void;
  accountId?: string;
}

export function WafTopAttackers({ topAttackers, isLoading, onBlockIp, accountId }: WafTopAttackersProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const maxRequests = Math.max(...topAttackers.map(a => a.blockedRequests), 1);

  // Fetch IP geolocation info when an IP is selected
  const { data: geoInfo, isLoading: geoLoading, error: geoError } = useQuery<IpGeoInfo>({
    queryKey: ['ip-geo-info', selectedIp],
    enabled: !!selectedIp,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    queryFn: async () => {
      // Using ip-api.com - note: their free tier only supports HTTP, not HTTPS
      // For HTTPS sites, we need to use a CORS proxy or alternative API
      // Using ipapi.co which supports HTTPS and has a free tier
      const response = await fetch(`https://ipapi.co/${selectedIp}/json/`);
      if (!response.ok) {
        throw new Error('Failed to fetch IP info');
      }
      const data = await response.json();
      if (data.error) {
        throw new Error(data.reason || 'Failed to fetch IP info');
      }
      // Map ipapi.co response to our interface
      return {
        ip: data.ip,
        country: data.country_name,
        countryCode: data.country_code,
        region: data.region_code,
        regionName: data.region,
        city: data.city,
        zip: data.postal,
        lat: data.latitude,
        lon: data.longitude,
        timezone: data.timezone,
        isp: data.org,
        org: data.org,
        as: data.asn ? `AS${data.asn} ${data.org}` : '',
        query: data.ip,
      };
    },
  });

  // Fetch recent events for the selected IP
  const { data: ipEventsData, isLoading: ipEventsLoading } = useQuery({
    queryKey: ['ip-events', selectedIp, accountId],
    enabled: !!selectedIp && !!accountId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const response = await apiClient.invoke<{ events: IpEvent[] }>('waf-dashboard-api', {
        body: { action: 'events', accountId, sourceIp: selectedIp, limit: 10 }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
  });

  const ipEvents = ipEventsData?.events || [];

  const selectedAttacker = topAttackers.find(a => a.sourceIp === selectedIp);

  const handleCopyIp = async () => {
    if (selectedIp) {
      await navigator.clipboard.writeText(selectedIp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: t('common.copied', 'Copiado!'), description: selectedIp });
    }
  };

  const handleOpenInMaps = () => {
    if (geoInfo?.lat && geoInfo?.lon) {
      window.open(`https://www.google.com/maps?q=${geoInfo.lat},${geoInfo.lon}`, '_blank');
    }
  };

  const handleOpenAbuseIpDb = () => {
    if (selectedIp) {
      window.open(`https://www.abuseipdb.com/check/${selectedIp}`, '_blank');
    }
  };

  return (
    <>
      <Card className="">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            {t('waf.topAttackers')}
          </CardTitle>
          <CardDescription>{t('waf.topAttackersDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : topAttackers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mb-4 opacity-50" />
              <p>{t('waf.noAttackers')}</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {topAttackers.map((attacker, index) => (
                  <div
                    key={attacker.sourceIp}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedIp(attacker.sourceIp)}
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500/10 text-red-500 font-semibold text-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium hover:text-primary transition-colors">
                          {attacker.sourceIp}
                        </span>
                        {attacker.country && (
                          <Badge variant="outline" className="text-xs">
                            <Globe className="h-3 w-3 mr-1" />
                            {attacker.country}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-red-500 rounded-full transition-all"
                              style={{ width: `${(attacker.blockedRequests / maxRequests) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground min-w-[60px] text-right">
                            {attacker.blockedRequests.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    {onBlockIp && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onBlockIp(attacker.sourceIp);
                        }}
                        className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      >
                        <Ban className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* IP Details Modal */}
      <Dialog open={!!selectedIp} onOpenChange={(open) => !open && setSelectedIp(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-500" />
              {t('waf.ipDetails', 'Detalhes do IP')}
            </DialogTitle>
            <DialogDescription>
              {t('waf.ipDetailsDesc', 'Informações de geolocalização e rede')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* IP Address Header */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <Network className="h-5 w-5 text-primary" />
                <span className="font-mono text-lg font-semibold">{selectedIp}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={handleCopyIp}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Attack Stats */}
            {selectedAttacker && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t('waf.blockedRequests', 'Requisições Bloqueadas')}
                  </span>
                  <Badge variant="destructive" className="text-lg px-3">
                    {selectedAttacker.blockedRequests.toLocaleString()}
                  </Badge>
                </div>
              </div>
            )}

            {/* Geolocation Info */}
            {geoLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>{t('common.loading', 'Carregando...')}</span>
              </div>
            ) : geoError ? (
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
                <p className="text-sm text-muted-foreground">
                  {t('waf.geoInfoUnavailable', 'Informações de geolocalização indisponíveis')}
                </p>
              </div>
            ) : geoInfo ? (
              <div className="space-y-3">
                {/* Location */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <MapPin className="h-3 w-3" />
                      {t('waf.location', 'Localização')}
                    </div>
                    <p className="font-medium">
                      {geoInfo.city || 'N/A'}, {geoInfo.regionName || geoInfo.region || 'N/A'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {geoInfo.country} ({geoInfo.countryCode})
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <Globe className="h-3 w-3" />
                      {t('waf.coordinates', 'Coordenadas')}
                    </div>
                    <p className="font-medium font-mono text-sm">
                      {geoInfo.lat?.toFixed(4)}, {geoInfo.lon?.toFixed(4)}
                    </p>
                    {geoInfo.zip && (
                      <p className="text-sm text-muted-foreground">CEP: {geoInfo.zip}</p>
                    )}
                  </div>
                </div>

                {/* ISP & Organization */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <Building2 className="h-3 w-3" />
                      {t('waf.isp', 'Provedor (ISP)')}
                    </div>
                    <p className="font-medium text-sm truncate" title={geoInfo.isp}>
                      {geoInfo.isp || 'N/A'}
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <Network className="h-3 w-3" />
                      {t('waf.organization', 'Organização')}
                    </div>
                    <p className="font-medium text-sm truncate" title={geoInfo.org}>
                      {geoInfo.org || 'N/A'}
                    </p>
                  </div>
                </div>

                {/* AS Number & Timezone */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <Shield className="h-3 w-3" />
                      {t('waf.asNumber', 'AS Number')}
                    </div>
                    <p className="font-medium text-sm truncate" title={geoInfo.as}>
                      {geoInfo.as || 'N/A'}
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <Clock className="h-3 w-3" />
                      {t('waf.timezone', 'Fuso Horário')}
                    </div>
                    <p className="font-medium text-sm">
                      {geoInfo.timezone || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              {geoInfo?.lat && geoInfo?.lon && (
                <Button variant="outline" size="sm" onClick={handleOpenInMaps} className="flex-1">
                  <MapPin className="h-4 w-4 mr-2" />
                  {t('waf.viewOnMap', 'Ver no Mapa')}
                  <ExternalLink className="h-3 w-3 ml-2" />
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleOpenAbuseIpDb} className="flex-1">
                <Shield className="h-4 w-4 mr-2" />
                {t('waf.checkAbuseDb', 'Verificar AbuseIPDB')}
                <ExternalLink className="h-3 w-3 ml-2" />
              </Button>
            </div>

            {/* Recent Events from this IP */}
            <div className="space-y-2 pt-2 border-t">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                {t('waf.recentRequestsFromIp', 'Últimas Requisições deste IP')}
              </h4>
              {ipEventsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm">{t('common.loading', 'Carregando...')}</span>
                </div>
              ) : ipEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('waf.noRecentRequests', 'Nenhuma requisição recente')}
                </p>
              ) : (
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {ipEvents.map((evt) => (
                      <div
                        key={evt.id}
                        className="p-2 rounded-lg bg-muted/30 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={evt.action === 'BLOCK' ? 'destructive' : evt.action === 'ALLOW' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {evt.action}
                            </Badge>
                            <span className="font-medium">{evt.http_method}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(evt.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-1" title={evt.uri}>
                          {evt.uri}
                        </p>
                        {evt.threat_type && (
                          <Badge variant="outline" className="text-xs mt-1">
                            {evt.threat_type.replace(/_/g, ' ')}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Block IP Button */}
            {onBlockIp && selectedIp && (
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => {
                  onBlockIp(selectedIp);
                  setSelectedIp(null);
                }}
              >
                <Ban className="h-4 w-4 mr-2" />
                {t('waf.blockThisIp', 'Bloquear este IP')}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
