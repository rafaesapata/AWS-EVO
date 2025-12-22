import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, Send, Trash2, AtSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganizationQuery } from "@/hooks/useOrganizationQuery";
import { useOrganization } from "@/hooks/useOrganization";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from 'react-markdown';

interface CommentsThreadProps {
  articleId: string;
}

export default function CommentsThread({ articleId }: CommentsThreadProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const { data: comments, isLoading } = useOrganizationQuery(
    ['article-comments', articleId],
    async (orgId) => {
      const result = await apiClient.select('knowledge_base_comments', {
        select: '*, parent:parent_comment_id(*)',
        eq: { article_id: articleId },
        is: { parent_comment_id: null },
        order: { created_at: 'desc' }
      });

      if (result.error) throw new Error(result.error);

      const commentsWithReplies = await Promise.all(
        (result.data || []).map(async (comment: any) => {
          const replies = await apiClient.select('knowledge_base_comments', {
            select: '*',
            eq: { parent_comment_id: comment.id },
            order: { created_at: 'asc' }
          });

          if (replies.error) throw new Error(replies.error);
          return { ...comment, replies: replies.data || [], author_email: 'User' };
        })
      );

      return commentsWithReplies;
    }
  );

  const { data: organizationId } = useOrganization();

  const addCommentMutation = useMutation({
    mutationFn: async ({ content, parentId }: { content: string; parentId?: string }) => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      if (!organizationId) throw new Error('No organization');

      const result = await apiClient.insert('knowledge_base_comments', {
        article_id: articleId,
        author_id: user.username,
        organization_id: organizationId,
        content,
        parent_comment_id: parentId || null,
      });

      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['article-comments', articleId] });
      setNewComment("");
      setReplyingTo(null);
      toast({
        title: "Comentário adicionado",
        description: "Seu comentário foi publicado com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao adicionar comentário",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      if (!organizationId) throw new Error('No organization');

      // Security: Only delete if comment belongs to user's organization
      const result = await apiClient.delete('knowledge_base_comments', {
        eq: { id: commentId, organization_id: organizationId }
      });

      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['article-comments', articleId] });
      toast({
        title: "Comentário removido",
        description: "O comentário foi excluído com sucesso",
      });
    },
  });

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    addCommentMutation.mutate({ content: newComment, parentId: replyingTo || undefined });
  };

  const getInitials = (email: string) => {
    return email?.substring(0, 2).toUpperCase() || 'U';
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Comentários ({comments?.length || 0})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* New Comment Form */}
        <div className="space-y-2">
          {replyingTo && (
            <Badge variant="secondary" className="mb-2">
              Respondendo a comentário
              <Button
                variant="ghost"
                size="sm"
                className="ml-2 h-4 w-4 p-0"
                onClick={() => setReplyingTo(null)}
              >
                ×
              </Button>
            </Badge>
          )}
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Escreva seu comentário... Use @ para mencionar alguém"
            className="min-h-[80px]"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              <AtSign className="h-3 w-3 inline mr-1" />
              Use @username para mencionar
            </p>
            <Button
              onClick={handleSubmit}
              disabled={!newComment.trim() || addCommentMutation.isPending}
              size="sm"
            >
              <Send className="h-4 w-4 mr-2" />
              {replyingTo ? 'Responder' : 'Comentar'}
            </Button>
          </div>
        </div>

        {/* Comments List */}
        <div className="space-y-4 mt-6">
          {comments?.map((comment) => (
            <div key={comment.id} className="space-y-3">
              <div className="flex gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {getInitials(comment.author_email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{comment.author_email}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {formatDate(comment.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReplyingTo(comment.id)}
                      >
                        Responder
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteCommentMutation.mutate(comment.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{comment.content}</ReactMarkdown>
                  </div>
                </div>
              </div>

              {/* Replies */}
              {comment.replies && comment.replies.length > 0 && (
                <div className="ml-11 space-y-3 border-l-2 border-border pl-4">
                  {comment.replies.map((reply: any) => (
                    <div key={reply.id} className="flex gap-3">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {getInitials(reply.profiles?.email || 'U')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium">{reply.profiles?.email}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {formatDate(reply.created_at)}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteCommentMutation.mutate(reply.id)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                        <div className="text-sm prose prose-sm max-w-none dark:prose-invert">
                          <ReactMarkdown>{reply.content}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {(!comments || comments.length === 0) && (
            <p className="text-center text-muted-foreground py-8">
              Nenhum comentário ainda. Seja o primeiro a comentar!
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
