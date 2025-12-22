import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ResourceCommentsProps {
  resourceType: string;
  resourceId: string;
}

export default function ResourceComments({ resourceType, resourceId }: ResourceCommentsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [mentionInput, setMentionInput] = useState("");

  const { data: comments, isLoading } = useQuery({
    queryKey: ['resource-comments', resourceType, resourceId],
    queryFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      const orgResult = await apiClient.invoke('get-user-organization', { userId: user.username });
      if (!orgResult.data) throw new Error('No organization found');

      const result = await apiClient.select('resource_comments', {
        select: '*, profiles:user_id(email)',
        eq: { 
          organization_id: orgResult.data, 
          resource_type: resourceType, 
          resource_id: resourceId,
          parent_comment_id: null 
        },
        order: { created_at: 'desc' }
      });

      if (result.error) throw result.error;
      return result.data || [];
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async (comment: string) => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      const orgResult = await apiClient.invoke('get-user-organization', { userId: user.username });
      if (!orgResult.data) throw new Error('No organization found');

      // Extract mentions (@username)
      const mentionRegex = /@(\w+)/g;
      const mentions = [...comment.matchAll(mentionRegex)].map(m => m[1]);

      const commentData = await apiClient.insert('resource_comments', {
        organization_id: orgResult.data,
        resource_type: resourceType,
        resource_id: resourceId,
        user_id: user.username,
        comment: comment.trim(),
        mentions: mentions.length > 0 ? mentions : null,
      });

      if (commentData.error) throw commentData.error;

      // Create mention notifications
      if (mentions.length > 0) {
        const mentionedUsers = await apiClient.select('profiles', {
          select: 'id',
          eq: { organization_id: orgResult.data },
          in: { email: mentions }
        });

        if (mentionedUsers.data && mentionedUsers.data.length > 0) {
          await apiClient.insert('mention_notifications',
            mentionedUsers.data.map(mu => ({
              organization_id: orgResult.data,
              mentioned_user_id: mu.id,
              mentioning_user_id: user.username,
              comment_id: commentData.data[0].id,
              resource_type: resourceType,
              resource_id: resourceId,
            }))
          );
        }
      }

      return commentData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resource-comments', resourceType, resourceId] });
      setNewComment("");
      toast({
        title: "Comment added",
        description: "Your comment has been posted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add comment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      const orgResult = await apiClient.invoke('get-user-organization', { userId: user.username });
      if (!orgResult.data) throw new Error('No organization found');

      // Security: Only delete if comment belongs to user's organization
      const result = await apiClient.delete('resource_comments', {
        eq: { id: commentId, organization_id: orgResult.data }
      });

      if (result.error) throw result.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resource-comments', resourceType, resourceId] });
      toast({
        title: "Comment deleted",
        description: "Comment removed successfully",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    addCommentMutation.mutate(newComment);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Comments & Collaboration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-2">
          <Textarea
            placeholder="Add a comment... Use @username to mention team members"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="min-h-[80px]"
          />
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              Tip: Use @username to notify team members
            </p>
            <Button
              type="submit"
              size="sm"
              disabled={!newComment.trim() || addCommentMutation.isPending}
            >
              <Send className="h-4 w-4 mr-2" />
              Comment
            </Button>
          </div>
        </form>

        <div className="space-y-3">
          {isLoading && (
            <div className="text-center py-4 text-muted-foreground">
              Loading comments...
            </div>
          )}

          {comments?.map((comment) => (
            <div key={comment.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {(comment.profiles as any)?.email?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">
                      {(comment.profiles as any)?.email || 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteCommentMutation.mutate(comment.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <p className="text-sm whitespace-pre-wrap">{comment.comment}</p>

              {comment.mentions && Array.isArray(comment.mentions) && comment.mentions.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {comment.mentions.map((mention: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      @{mention}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}

          {comments?.length === 0 && !isLoading && (
            <div className="text-center py-8 text-muted-foreground">
              No comments yet. Be the first to comment!
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}