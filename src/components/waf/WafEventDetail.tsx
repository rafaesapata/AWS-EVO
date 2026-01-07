import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Globe, 
  Clock, 
  AlertTriangle, 
  Ban,
  CheckCircle,
  Activity,
  Copy,
  ExternalLink
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WafEvent {
  id: string;
  timestamp: string;
  action: string;
  source_ip: string;
  country?: string;
  region?: string;
  user_agent?: string;
  uri: string;
  http_method: string;
  rule_matched?: string;
  threat_type?: string;
  severity: string;
  is_campaign: boolean;
  campaign_id?: string;
  raw_log?: any;
}

interface WafEventDetailProps {
  event: WafEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBlockIp?: (ip: string) => void;
}

export function WafEventDetail({ event, open, onOpenChange, onBlockIp }: WafEventDetailProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  if (!event) return null;

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive">Critical</Badge>;
      case 'high': return <Badge className="bg-orange-500">High</Badge>;
      case 'medium': return <Badge className="bg-yellow-500">Medium</Badge>;
      case 'low': return <Badge variant="outline">Low</Badge>;
      default: return <Badge variant="secondary">{severity}</Badge>;
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'BLOCK': return <Ban className="h-5 w-5 text-red-500" />;
      case 'ALLOW': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'COUNT': return <Activity className="h-5 w-5 text-yellow-500" />;
      default: return <Activity className="h-5 w-5 text-gray-500" />;
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t('common.copied'), description: `${label} ${t('common.copiedToClipboard')}` });
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getActionIcon(event.action)}
            {t('waf.eventDetails')}
          </DialogTitle>
          <DialogDescription>
            {t('waf.eventId')}: {event.id}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6 pr-4">
            {/* Summary */}
            <div className="flex items-center gap-4 flex-wrap">
              <Badge variant={event.action === 'BLOCK' ? 'destructive' : 'secondary'}>
                {event.action}
              </Badge>
              {getSeverityBadge(event.severity)}
              {event.is_campaign && (
                <Badge className="bg-purple-500">Campaign</Badge>
              )}
              {event.threat_type && (
                <Badge variant="outline" className="text-orange-500 border-orange-500">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {event.threat_type.replace(/_/g, ' ')}
                </Badge>
              )}
            </div>

            <Separator />

            {/* Request Info */}
            <div className="space-y-4">
              <h4 className="font-semibold">{t('waf.requestInfo')}</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">{t('waf.sourceIp')}</label>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{event.source_ip}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(event.source_ip, 'IP')}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                
                <div>
                  <label className="text-sm text-muted-foreground">{t('waf.location')}</label>
                  <div className="flex items-center gap-1">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span>{event.country || 'Unknown'}{event.region ? `, ${event.region}` : ''}</span>
                  </div>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground">{t('waf.timestamp')}</label>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{formatTimestamp(event.timestamp)}</span>
                  </div>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground">{t('waf.httpMethod')}</label>
                  <Badge variant="outline">{event.http_method}</Badge>
                </div>
              </div>

              <div>
                <label className="text-sm text-muted-foreground">{t('waf.uri')}</label>
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-muted px-2 py-1 rounded break-all">
                    {event.uri}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(event.uri, 'URI')}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {event.user_agent && (
                <div>
                  <label className="text-sm text-muted-foreground">{t('waf.userAgent')}</label>
                  <code className="text-sm bg-muted px-2 py-1 rounded block break-all">
                    {event.user_agent}
                  </code>
                </div>
              )}

              {event.rule_matched && (
                <div>
                  <label className="text-sm text-muted-foreground">{t('waf.ruleMatched')}</label>
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    {event.rule_matched}
                  </code>
                </div>
              )}
            </div>

            <Separator />

            {/* Raw Log */}
            {event.raw_log && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">{t('waf.rawLog')}</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(JSON.stringify(event.raw_log, null, 2), 'Raw log')}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    {t('common.copy')}
                  </Button>
                </div>
                <ScrollArea className="h-[200px] rounded-md border">
                  <pre className="text-xs p-4 bg-muted/50">
                    {JSON.stringify(event.raw_log, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            )}

            {/* Actions */}
            {onBlockIp && event.action !== 'BLOCK' && (
              <>
                <Separator />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="destructive"
                    onClick={() => {
                      onBlockIp(event.source_ip);
                      onOpenChange(false);
                    }}
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    {t('waf.blockThisIp')}
                  </Button>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
