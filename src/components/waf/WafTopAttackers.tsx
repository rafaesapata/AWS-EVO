import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Globe, 
  Ban, 
  AlertTriangle,
  TrendingUp
} from "lucide-react";

interface TopAttacker {
  sourceIp: string;
  country?: string;
  blockedRequests: number;
}

interface WafTopAttackersProps {
  topAttackers: TopAttacker[];
  isLoading: boolean;
  onBlockIp?: (ip: string) => void;
}

export function WafTopAttackers({ topAttackers, isLoading, onBlockIp }: WafTopAttackersProps) {
  const { t } = useTranslation();

  const maxRequests = Math.max(...topAttackers.map(a => a.blockedRequests), 1);

  return (
    <Card className="glass border-primary/20">
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
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500/10 text-red-500 font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{attacker.sourceIp}</span>
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
                      onClick={() => onBlockIp(attacker.sourceIp)}
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
  );
}
