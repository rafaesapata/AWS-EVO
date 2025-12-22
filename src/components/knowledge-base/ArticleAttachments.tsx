import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Upload, Download, Trash2, File } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ArticleAttachmentsProps {
  articleId: string;
  organizationId: string;
  isAuthor: boolean;
}

export function ArticleAttachments({ articleId, organizationId, isAuthor }: ArticleAttachmentsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const { data: attachments, isLoading } = useQuery({
    queryKey: ['article-attachments', articleId],
    queryFn: async () => {
      const result = await apiClient.select('knowledge_base_attachments', {
        select: '*',
        eq: { article_id: articleId },
        order: { uploaded_at: 'desc' }
      });
      
      if (result.error) throw result.error;
      return result.data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop();
      const fileName = `${articleId}/${Date.now()}.${fileExt}`;
      
      // Upload to S3 storage via API
      const uploadResult = await apiClient.invoke('upload-attachment', {
        fileName,
        fileContent: await file.arrayBuffer(),
        contentType: file.type
      });

      if (uploadError) throw uploadError;

      // Save metadata
      const result = await apiClient.insert('knowledge_base_attachments', {
        article_id: articleId,
        organization_id: organizationId,
        file_name: file.name,
        file_path: fileName,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: user.username,
      });

      if (result.error) {
        // Rollback storage upload if DB insert fails
        await apiClient.invoke('storage-delete', {
          bucket: 'knowledge-base-attachments',
          paths: [fileName]
        });
        throw new Error(result.error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['article-attachments', articleId] });
      toast({ title: "Anexo enviado com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao enviar anexo",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, filePath }: { id: string; filePath: string }) => {
      // Delete from storage
      const storageResult = await apiClient.invoke('storage-delete', {
        bucket: 'knowledge-base-attachments',
        paths: [filePath]
      });

      if (storageResult.error) throw new Error(storageResult.error);

      // Delete from database
      const result = await apiClient.delete('knowledge_base_attachments', {
        eq: { id }
      });

      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['article-attachments', articleId] });
      toast({ title: "Anexo removido" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao remover anexo",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (50MB max)
    if (file.size > 52428800) {
      toast({
        title: "Arquivo muito grande",
        description: "O tamanho máximo permitido é 50MB",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    try {
      await uploadMutation.mutateAsync(file);
    } finally {
      setUploading(false);
      event.target.value = ''; // Reset input
    }
  };

  const handleDownload = async (attachment: any) => {
    const result = await apiClient.invoke('storage-download', {
      bucket: 'knowledge-base-attachments',
      path: attachment.file_path
    });
    const { data, error } = { data: result.data, error: result.error };

    if (error) {
      toast({
        title: "Erro ao baixar arquivo",
        description: error.message,
        variant: "destructive"
      });
      return;
    }

    // Create download link
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Paperclip className="h-5 w-5" />
            <h3 className="font-semibold">Anexos</h3>
            {attachments && attachments.length > 0 && (
              <Badge variant="secondary">{attachments.length}</Badge>
            )}
          </div>
          
          {isAuthor && (
            <div>
              <input
                type="file"
                id="file-upload"
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploading}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => document.getElementById('file-upload')?.click()}
                disabled={uploading}
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? 'Enviando...' : 'Adicionar Anexo'}
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando anexos...</p>
        ) : attachments && attachments.length > 0 ? (
          <div className="space-y-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <File className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {attachment.file_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(attachment.file_size)} · {new Date(attachment.uploaded_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDownload(attachment)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {isAuthor && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => deleteMutation.mutate({
                        id: attachment.id,
                        filePath: attachment.file_path
                      })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum anexo</p>
            {isAuthor && (
              <p className="text-xs mt-1">
                Clique em "Adicionar Anexo" para fazer upload de arquivos
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
