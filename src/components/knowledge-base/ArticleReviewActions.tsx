import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface ArticleReviewActionsProps {
  article: any;
  currentUserId?: string;
}

export function ArticleReviewActions({ article, currentUserId }: ArticleReviewActionsProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const approveMutation = useMutation({
    mutationFn: async () => {
      const result = await apiClient.update('knowledge_base_articles', {
        approval_status: 'approved',
        approved_by: currentUserId,
        approved_at: new Date().toISOString(),
        rejection_reason: null,
      }, { eq: { id: article.id } });
      if (result.error) throw new Error(getErrorMessage(result.error));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      toast({ 
        title: t('knowledgeBase.articleApprovedSuccess', 'Article approved successfully!'),
        description: t('knowledgeBase.articleApprovedNotified', 'The author has been notified of the approval.'),
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: t('knowledgeBase.errorApproving', 'Error approving article'),
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (reason: string) => {
      const result = await apiClient.update('knowledge_base_articles', {
        approval_status: 'rejected',
        approved_by: currentUserId,
        approved_at: new Date().toISOString(),
        rejection_reason: reason,
      }, { eq: { id: article.id } });
      if (result.error) throw new Error(getErrorMessage(result.error));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      toast({ 
        title: t('knowledgeBase.articleRejectedSuccess', 'Article rejected'),
        description: t('knowledgeBase.articleRejectedNotified', 'The author has been notified with the rejection reason.'),
      });
      setShowRejectDialog(false);
      setRejectionReason("");
    },
    onError: (error: Error) => {
      toast({ 
        title: t('knowledgeBase.errorRejecting', 'Error rejecting article'),
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      toast({
        title: t('knowledgeBase.reasonRequired', 'Reason required'),
        description: t('knowledgeBase.reasonRequiredDesc', 'Please provide the rejection reason'),
        variant: "destructive"
      });
      return;
    }
    rejectMutation.mutate(rejectionReason);
  };

  if (article.approval_status !== 'pending' && article.approval_status !== null) {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button 
          size="sm" 
          variant="outline" 
          className="text-green-600 border-green-600 hover:bg-green-50"
          onClick={() => approveMutation.mutate()}
          disabled={approveMutation.isPending}
        >
          <CheckCircle className="h-4 w-4 mr-1" />
          {t('knowledgeBase.approve', 'Approve')}
        </Button>
        <Button 
          size="sm" 
          variant="outline" 
          className="text-red-600 border-red-600 hover:bg-red-50"
          onClick={() => setShowRejectDialog(true)}
          disabled={rejectMutation.isPending}
        >
          <XCircle className="h-4 w-4 mr-1" />
          {t('knowledgeBase.reject', 'Reject')}
        </Button>
      </div>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('knowledgeBase.rejectArticle', 'Reject Article')}</DialogTitle>
            <DialogDescription>
              {t('knowledgeBase.rejectArticleDesc', 'Provide a reason for rejecting this article. The author will be notified.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rejection-reason">{t('knowledgeBase.rejectionReason', 'Rejection Reason *')}</Label>
              <Input
                id="rejection-reason"
                placeholder={t('knowledgeBase.rejectionPlaceholder', 'E.g.: Incomplete content, needs more technical details...')}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="mt-2"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowRejectDialog(false);
                  setRejectionReason("");
                }}
              >
                {t('knowledgeBase.cancel', 'Cancel')}
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleReject}
                disabled={!rejectionReason.trim() || rejectMutation.isPending}
              >
                <XCircle className="h-4 w-4 mr-2" />
                {t('knowledgeBase.confirmReject', 'Confirm Rejection')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
