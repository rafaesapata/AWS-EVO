import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { History, RotateCcw, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from 'react-markdown';
import { ScrollArea } from "@/components/ui/scroll-area";

interface VersionHistoryProps {
  articleId: string;
  currentVersion: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function VersionHistory({ articleId, currentVersion, isOpen, onClose }: VersionHistoryProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: organizationId } = useOrganization();
  const [viewingVersion, setViewingVersion] = useState<any>(null);

  const { data: versions, isLoading } = useQuery({
    queryKey: ['article-versions', articleId],
    queryFn: async () => {
      const result = await apiClient.select('knowledge_base_versions', {
        select: '*',
        eq: { article_id: articleId },
        order: { version_number: 'desc' }
      });

      if (result.error) throw new Error(getErrorMessage(result.error));
      return result.data;
    },
    enabled: isOpen,
  });

  const restoreVersionMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const version = versions?.find(v => v.id === versionId);
      if (!version) throw new Error('Version not found');

      const result = await apiClient.update('knowledge_base_articles', {
          title: version.title,
          content: version.content,
          category: version.category,
          tags: version.tags,
        }, { eq: { id: articleId } });

      if (result.error) throw new Error(getErrorMessage(result.error));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      queryClient.invalidateQueries({ queryKey: ['article-versions'] });
      toast({
        title: t('versionHistory.restoreSuccess'),
        description: t('versionHistory.restoredFrom', { version: viewingVersion?.version_number }),
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('versionHistory.restoreError'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              {t('versionHistory.title')}
            </DialogTitle>
            <DialogDescription>
              {t('versionHistory.version')} {currentVersion}. {t('versionHistory.description')}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[60vh] pr-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('common.loading')}
              </div>
            ) : versions && versions.length > 0 ? (
              <div className="space-y-3">
                {versions.map((version) => (
                  <Card key={version.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <CardTitle className="text-base">{version.title}</CardTitle>
                            {version.version_number === currentVersion && (
                              <Badge>{t('versionHistory.current')}</Badge>
                            )}
                          </div>
                          <CardDescription className="text-xs">
                            {t('versionHistory.version')} {version.version_number} · {new Date(version.edited_at).toLocaleString()}
                          </CardDescription>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setViewingVersion(version)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {version.version_number !== currentVersion && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => restoreVersionMutation.mutate(version.id)}
                              disabled={restoreVersionMutation.isPending}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{version.category}</Badge>
                        {version.tags && version.tags.length > 0 && (
                          <>
                            {version.tags.slice(0, 3).map((tag: string, i: number) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('versionHistory.noVersions')}</p>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Version Preview Dialog */}
      <Dialog open={!!viewingVersion} onOpenChange={(open) => !open && setViewingVersion(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          {viewingVersion && (
            <>
              <DialogHeader>
                <DialogTitle>{viewingVersion.title}</DialogTitle>
                <DialogDescription>
                  {t('versionHistory.version')} {viewingVersion.version_number} · {new Date(viewingVersion.edited_at).toLocaleString()}
                </DialogDescription>
              </DialogHeader>
              
              <ScrollArea className="h-[60vh] pr-4">
                <div className="prose dark:prose-invert max-w-none">
                  <ReactMarkdown>{viewingVersion.content}</ReactMarkdown>
                </div>
                
                {viewingVersion.tags && viewingVersion.tags.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-4 pt-4 border-t">
                    {viewingVersion.tags.map((tag: string, i: number) => (
                      <Badge key={i} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </ScrollArea>

              <div className="flex gap-2 pt-4 border-t">
                <Button
                  onClick={() => {
                    restoreVersionMutation.mutate(viewingVersion.id);
                    setViewingVersion(null);
                  }}
                  disabled={restoreVersionMutation.isPending}
                  className="flex-1"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  {t('versionHistory.restore')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setViewingVersion(null)}
                  className="flex-1"
                >
                  {t('common.close')}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
