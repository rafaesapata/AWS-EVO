import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  Ban, 
  Unlock, 
  Clock, 
  Plus,
  AlertTriangle
} from "lucide-react";

interface BlockedIp {
  ipAddress: string;
  reason: string;
  blockedBy: string;
  blockedAt: string;
  expiresAt: string;
}

interface WafBlockedIpsListProps {
  blockedIps: BlockedIp[];
  isLoading: boolean;
  onUnblock?: (ip: string) => void;
  onBlock?: (ip: string, reason: string) => void;
}

export function WafBlockedIpsList({ blockedIps, isLoading, onUnblock, onBlock }: WafBlockedIpsListProps) {
  const { t } = useTranslation();
  const [newIp, setNewIp] = useState("");
  const [newReason, setNewReason] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleBlock = () => {
    if (newIp && onBlock) {
      onBlock(newIp, newReason || "Manual block");
      setNewIp("");
      setNewReason("");
      setDialogOpen(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const isExpiringSoon = (expiresAt: string) => {
    const expires = new Date(expiresAt);
    const now = new Date();
    const hoursUntilExpiry = (expires.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilExpiry < 2;
  };

  return (
    <Card className="glass border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-primary" />
              {t('waf.blockedIps')}
            </CardTitle>
            <CardDescription>{t('waf.blockedIpsDesc')}</CardDescription>
          </div>
          {onBlock && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t('waf.blockIp')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('waf.blockIpTitle')}</DialogTitle>
                  <DialogDescription>{t('waf.blockIpDesc')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="ip">{t('waf.ipAddress')}</Label>
                    <Input
                      id="ip"
                      placeholder="192.168.1.1"
                      value={newIp}
                      onChange={(e) => setNewIp(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reason">{t('waf.reason')}</Label>
                    <Input
                      id="reason"
                      placeholder={t('waf.reasonPlaceholder')}
                      value={newReason}
                      onChange={(e) => setNewReason(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button onClick={handleBlock} disabled={!newIp}>
                    {t('waf.block')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : blockedIps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
            <Ban className="h-12 w-12 mb-4 opacity-50" />
            <p>{t('waf.noBlockedIps')}</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {blockedIps.map((ip) => (
                <div
                  key={ip.ipAddress}
                  className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-red-500/20"
                >
                  <div className="p-2 rounded-lg bg-red-500/10">
                    <Ban className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-medium">{ip.ipAddress}</span>
                      <Badge variant={ip.blockedBy === 'auto' ? 'secondary' : 'outline'}>
                        {ip.blockedBy === 'auto' ? t('waf.autoBlocked') : t('waf.manualBlocked')}
                      </Badge>
                      {isExpiringSoon(ip.expiresAt) && (
                        <Badge variant="destructive" className="text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {t('waf.expiringSoon')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{ip.reason}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {t('waf.blockedAt')}: {formatDate(ip.blockedAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {t('waf.expiresAt')}: {formatDate(ip.expiresAt)}
                      </span>
                    </div>
                  </div>
                  {onUnblock && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onUnblock(ip.ipAddress)}
                      className="text-green-500 hover:text-green-600 hover:bg-green-500/10"
                    >
                      <Unlock className="h-4 w-4 mr-1" />
                      {t('waf.unblock')}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
