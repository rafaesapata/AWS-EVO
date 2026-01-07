import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Activity, 
  Ban, 
  CheckCircle, 
  AlertTriangle,
  Globe,
  Clock,
  Search,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

interface WafEvent {
  id: string;
  timestamp: string;
  action: string;
  source_ip: string;
  country?: string;
  user_agent?: string;
  uri: string;
  http_method: string;
  rule_matched?: string;
  threat_type?: string;
  severity: string;
  is_campaign: boolean;
}

interface WafEventsFeedProps {
  events: WafEvent[];
  isLoading: boolean;
  showFilters?: boolean;
  showPagination?: boolean;
}

export function WafEventsFeed({ events, isLoading, showFilters, showPagination }: WafEventsFeedProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const filteredEvents = events.filter(event => {
    const matchesSearch = !searchQuery || 
      event.source_ip.includes(searchQuery) ||
      event.uri.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.threat_type?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSeverity = severityFilter === "all" || event.severity === severityFilter;
    const matchesAction = actionFilter === "all" || event.action === actionFilter;
    
    return matchesSearch && matchesSeverity && matchesAction;
  });

  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
  const paginatedEvents = showPagination 
    ? filteredEvents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    : filteredEvents;

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
      case 'BLOCK': return <Ban className="h-4 w-4 text-red-500" />;
      case 'ALLOW': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'COUNT': return <Activity className="h-4 w-4 text-yellow-500" />;
      default: return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <Card className="glass border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          {t('waf.recentEvents')}
        </CardTitle>
        <CardDescription>{t('waf.recentEventsDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {showFilters && (
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('waf.searchEvents')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t('waf.severity')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t('waf.action')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                <SelectItem value="BLOCK">Block</SelectItem>
                <SelectItem value="ALLOW">Allow</SelectItem>
                <SelectItem value="COUNT">Count</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : paginatedEvents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t('waf.noEvents')}</p>
          </div>
        ) : (
          <ScrollArea className={showPagination ? "h-[500px]" : "h-[300px]"}>
            <div className="space-y-2">
              {paginatedEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="mt-1">{getActionIcon(event.action)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-medium">{event.source_ip}</span>
                      {event.country && (
                        <Badge variant="outline" className="text-xs">
                          <Globe className="h-3 w-3 mr-1" />
                          {event.country}
                        </Badge>
                      )}
                      {getSeverityBadge(event.severity)}
                      {event.is_campaign && (
                        <Badge className="bg-purple-500 text-xs">Campaign</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1 truncate">
                      <span className="font-medium">{event.http_method}</span> {event.uri}
                    </div>
                    {event.threat_type && (
                      <div className="text-xs text-orange-500 mt-1">
                        <AlertTriangle className="h-3 w-3 inline mr-1" />
                        {event.threat_type.replace(/_/g, ' ')}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTimestamp(event.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {showPagination && totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <span className="text-sm text-muted-foreground">
              {t('common.showing')} {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredEvents.length)} {t('common.of')} {filteredEvents.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
