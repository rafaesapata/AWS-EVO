import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  Ban, 
  Globe,
  Clock,
  Copy,
  ExternalLink,
  Shield,
  FileText,
  User,
  AlertTriangle
} from "lucide-react";

interface BlockedRequest {
  id: string;
  timestamp: string;
  source_ip: string;
  country?: string;
  user_agent?: string;
  uri: string;
  http_method: string;
  rule_matched?: string;
  threat_type?: string;
  severity: string;
  host?: string;
  labels?: string[];
}

interface WafBlockedRequestsListProps {
  blockedRequests: BlockedRequest[];
  isLoading: boolean;
}

export function WafBlockedRequestsList({ blockedRequests, isLoading }: WafBlockedRequestsListProps) {
  const { t } = useTranslation();
  const [selectedRequest, setSelectedRequest] = useState<BlockedRequest | null>(null);

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive">Critical</Badge>;
      case 'high': return <Badge className="bg-orange-500">High</Badge>;
      case 'medium': return <Badge className="bg-yellow-500">Medium</Badge>;
      case 'low': return <Badge variant="outline">Low</Badge>;
      default: return <Badge variant="secondary">{severity}</Badge>;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Card className="">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ban className="h-5 w-5 text-red-500" />
          {t('waf.blockedRequests', 'Blocked Requests')}
        </CardTitle>
        <CardDescription>
          {t('waf.blockedRequestsDesc', 'Recent requests blocked by WAF rules in the last 24 hours')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : blockedRequests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t('waf.noBlockedRequests', 'No blocked requests in the last 24 hours')}</p>
          </div>
        ) : (
          <ScrollArea className="h-[350px]">
            <div className="space-y-2">
              {blockedRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20 hover:bg-red-500/10 transition-colors cursor-pointer"
                  onClick={() => setSelectedRequest(request)}
                >
                  <div className="mt-1">
                    <Ban className="h-4 w-4 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-medium">{request.source_ip}</span>
                      {request.country && (
                        <Badge variant="outline" className="text-xs">
                          <Globe className="h-3 w-3 mr-1" />
                          {request.country}
                        </Badge>
                      )}
                      {getSeverityBadge(request.severity)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1 truncate">
                      <span className="font-medium">{request.http_method}</span> {request.uri}
                    </div>
                    {request.threat_type && (
                      <div className="text-xs text-orange-500 mt-1">
                        <AlertTriangle className="h-3 w-3 inline mr-1" />
                        {request.threat_type.replace(/_/g, ' ')}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                    <Clock className="h-3 w-3" />
                    {formatTimestamp(request.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Request Details Modal */}
        <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-red-500" />
                {t('waf.blockedRequestDetails', 'Blocked Request Details')}
              </DialogTitle>
              <DialogDescription>
                {selectedRequest && formatTimestamp(selectedRequest.timestamp)}
              </DialogDescription>
            </DialogHeader>
            
            {selectedRequest && (
              <div className="space-y-6">
                {/* Severity */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="destructive" className="text-sm px-3 py-1">BLOCKED</Badge>
                  {getSeverityBadge(selectedRequest.severity)}
                </div>

                {/* Source IP Section */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    {t('waf.sourceInfo', 'Source Information')}
                  </h4>
                  <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t('waf.ipAddress', 'IP Address')}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{selectedRequest.source_ip}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(selectedRequest.source_ip)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    {selectedRequest.country && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t('waf.country', 'Country')}</span>
                        <span className="font-medium">{selectedRequest.country}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Request Section */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {t('waf.requestInfo', 'Request Information')}
                  </h4>
                  <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t('waf.method', 'Method')}</span>
                      <Badge variant="outline">{selectedRequest.http_method}</Badge>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-sm text-muted-foreground shrink-0">{t('waf.uri', 'URI')}</span>
                      <span className="font-mono text-sm break-all text-right">{selectedRequest.uri}</span>
                    </div>
                    {selectedRequest.host && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t('waf.host', 'Host')}</span>
                        <span className="font-mono text-sm">{selectedRequest.host}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Threat Section */}
                {(selectedRequest.threat_type || selectedRequest.rule_matched) && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      {t('waf.threatInfo', 'Threat Information')}
                    </h4>
                    <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                      {selectedRequest.threat_type && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{t('waf.threatType', 'Threat Type')}</span>
                          <Badge variant="destructive">{selectedRequest.threat_type.replace(/_/g, ' ')}</Badge>
                        </div>
                      )}
                      {selectedRequest.rule_matched && (
                        <div className="flex items-start justify-between gap-4">
                          <span className="text-sm text-muted-foreground shrink-0">{t('waf.ruleMatched', 'Rule Matched')}</span>
                          <span className="font-mono text-sm text-right">{selectedRequest.rule_matched}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* User Agent Section */}
                {selectedRequest.user_agent && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {t('waf.userAgent', 'User Agent')}
                    </h4>
                    <div className="bg-muted/30 rounded-lg p-4">
                      <p className="text-sm font-mono break-all">{selectedRequest.user_agent}</p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`https://www.abuseipdb.com/check/${selectedRequest.source_ip}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {t('waf.checkAbuseIPDB', 'Check AbuseIPDB')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      // Fetch geolocation to get coordinates
                      try {
                        const response = await fetch(`https://ipapi.co/${selectedRequest.source_ip}/json/`);
                        const data = await response.json();
                        if (data.latitude && data.longitude) {
                          window.open(`https://www.google.com/maps?q=${data.latitude},${data.longitude}`, '_blank');
                        } else {
                          // Fallback to IP search if no coordinates
                          window.open(`https://www.google.com/maps/search/${selectedRequest.source_ip}`, '_blank');
                        }
                      } catch {
                        window.open(`https://www.google.com/maps/search/${selectedRequest.source_ip}`, '_blank');
                      }
                    }}
                  >
                    <Globe className="h-4 w-4 mr-2" />
                    {t('waf.viewOnMap', 'View on Map')}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
