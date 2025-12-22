import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface ArticleReviewActionsProps {
  article: any;
  currentUserId?: string;
}

export function ArticleReviewActions({ article, currentUserId }: ArticleReviewActionsProps) {
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
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      toast({ 
        title: "Artigo aprovado com sucesso!",
        description: "O autor foi notificado da aprovação.",
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao aprovar artigo",
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
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      toast({ 
        title: "Artigo rejeitado",
        description: "O autor foi notificado com o motivo da rejeição.",
      });
      setShowRejectDialog(false);
      setRejectionReason("");
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao rejeitar artigo",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      toast({
        title: "Motivo obrigatório",
        description: "Por favor, informe o motivo da rejeição",
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
          Aprovar
        </Button>
        <Button 
          size="sm" 
          variant="outline" 
          className="text-red-600 border-red-600 hover:bg-red-50"
          onClick={() => setShowRejectDialog(true)}
          disabled={rejectMutation.isPending}
        >
          <XCircle className="h-4 w-4 mr-1" />
          Rejeitar
        </Button>
      </div>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Artigo</DialogTitle>
            <DialogDescription>
              Por favor, informe o motivo da rejeição para que o autor possa fazer as correções necessárias.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rejection-reason">Motivo da Rejeição *</Label>
              <Input
                id="rejection-reason"
                placeholder="Ex: Conteúdo incompleto, precisa de mais detalhes técnicos..."
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
                Cancelar
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleReject}
                disabled={!rejectionReason.trim() || rejectMutation.isPending}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Confirmar Rejeição
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
