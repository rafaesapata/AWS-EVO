import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { Eye, Calendar, User } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface ArticleAuditLogProps {
  articleId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ArticleAuditLog({ articleId, isOpen, onClose }: ArticleAuditLogProps) {
  const { t } = useTranslation();
  const { data: auditLog, isLoading } = useQuery({
    queryKey: ['article-audit', articleId],
    queryFn: async () => {
      const result = await apiClient.select('knowledge_base_analytics', {
        select: `
          id,
          event_type,
          created_at,
          reading_time_seconds,
          scroll_depth_percentage,
          device_type,
          user_id,
          profiles:user_id (
            full_name,
            email
          )
        `,
        eq: { article_id: articleId, event_type: 'view' },
        order: { created_at: 'desc' }
      });
      
      if (result.error) throw new Error(getErrorMessage(result.error));
      return result.data;
    },
    enabled: isOpen,
  });

  const uniqueViewers = auditLog ? 
    [...new Set(auditLog.map(log => log.user_id))].length : 0;

  const totalViews = auditLog?.length || 0;

  const avgReadingTime = auditLog && auditLog.length > 0 ?
    Math.round(
      auditLog
        .filter(log => log.reading_time_seconds)
        .reduce((acc, log) => acc + (log.reading_time_seconds || 0), 0) / 
      auditLog.filter(log => log.reading_time_seconds).length
    ) : 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            {t('knowledgeBase.auditViews', 'View Audit')}
          </DialogTitle>
          <DialogDescription>
            {t('knowledgeBase.description', 'Organizational wiki and documentation')}
          </DialogDescription>
        </DialogHeader>

        {/* Statistics */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="p-4 border rounded-lg">
            <p className="text-sm text-muted-foreground">{t('knowledgeBase.totalViews', 'Total Views')}</p>
            <p className="text-2xl font-semibold">{totalViews}</p>
          </div>
          <div className="p-4 border rounded-lg">
            <p className="text-sm text-muted-foreground">{t('knowledgeBase.uniqueViewers', 'Unique Viewers')}</p>
            <p className="text-2xl font-semibold">{uniqueViewers}</p>
          </div>
          <div className="p-4 border rounded-lg">
            <p className="text-sm text-muted-foreground">{t('knowledgeBase.avgReadTime', 'Avg. Read Time')}</p>
            <p className="text-2xl font-semibold">
              {avgReadingTime > 0 ? `${Math.floor(avgReadingTime / 60)}m ${avgReadingTime % 60}s` : '-'}
            </p>
          </div>
        </div>

        {/* Audit log */}
        <ScrollArea className="h-96">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('knowledgeBase.loading', 'Loading...')}
            </div>
          ) : auditLog && auditLog.length > 0 ? (
            <div className="space-y-3">
              {auditLog.map((log: any) => (
                <div 
                  key={log.id}
                  className="flex items-start gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <Eye className="h-5 w-5 text-muted-foreground mt-1" />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {log.profiles?.full_name || t('knowledgeBase.author', 'Author')}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {log.profiles?.email}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {log.reading_time_seconds && (
                        <span>
                          {t('knowledgeBase.readingTime', 'Reading time:')} {Math.floor(log.reading_time_seconds / 60)}m {log.reading_time_seconds % 60}s
                        </span>
                      )}
                      {log.scroll_depth_percentage && (
                        <span>
                          Scroll: {log.scroll_depth_percentage}%
                        </span>
                      )}
                      {log.device_type && (
                        <Badge variant="secondary" className="text-xs">
                          {log.device_type}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Eye className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">{t('knowledgeBase.noViewsYet', 'No views recorded yet')}</p>
              <p className="text-xs mt-1">
                {t('knowledgeBase.description', 'Organizational wiki and documentation')}
              </p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
