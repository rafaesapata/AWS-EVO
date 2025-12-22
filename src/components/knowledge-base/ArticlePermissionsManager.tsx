import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, UserPlus, X, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ArticlePermissionsManagerProps {
  articleId: string;
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
}

export function ArticlePermissionsManager({ 
  articleId, 
  isOpen, 
  onClose,
  organizationId 
}: ArticlePermissionsManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchEmail, setSearchEmail] = useState("");

  // Fetch current permissions
  const { data: permissions, isLoading } = useQuery({
    queryKey: ['article-permissions', articleId, organizationId],
    queryFn: async () => {
      // Verify article belongs to organization
      const article = await apiClient.select('knowledge_base_articles', {
        select: 'organization_id',
        eq: { id: articleId, organization_id: organizationId },
        single: true
      });

      if (!article.data) throw new Error('Unauthorized access');

      const result = await apiClient.select('knowledge_base_article_permissions', {
        select: `
          id,
          user_id,
          granted_at,
          profiles:user_id (
            full_name,
            email
          )
        `,
        eq: { article_id: articleId }
      });
      
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: isOpen && !!organizationId,
  });

  // Fetch organization users for search
  const { data: orgUsers } = useQuery({
    queryKey: ['org-users', organizationId, searchEmail],
    queryFn: async () => {
      let filters: any = {
        organization_id: organizationId
      };
      
      if (searchEmail) {
        filters.email = { ilike: `%${searchEmail}%` };
      }
      
      const result = await apiClient.select('profiles', {
        select: 'id, full_name, email',
        ...filters,
        limit: 10
      });
      if (result.error) throw new Error(result.error);
      
      // Filter out users who already have permission
      const permissionedUserIds = permissions?.map((p: any) => p.user_id) || [];
      return result.data?.filter((u: any) => !permissionedUserIds.includes(u.id)) || [];
    },
    enabled: isOpen && searchEmail.length > 2,
  });

  const addPermissionMutation = useMutation({
    mutationFn: async (userId: string) => {
      const user = await cognitoAuth.getCurrentUser();
      const result = await apiClient.insert('knowledge_base_article_permissions', {
        article_id: articleId,
        user_id: userId,
        granted_by: user?.username,
      });
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['article-permissions', articleId, organizationId] });
      setSearchEmail("");
      toast({ title: "Permissão adicionada com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao adicionar permissão",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const removePermissionMutation = useMutation({
    mutationFn: async (permissionId: string) => {
      // Verify article belongs to organization before removing permission
      const article = await apiClient.select('knowledge_base_articles', {
        select: 'organization_id',
        eq: { id: articleId, organization_id: organizationId },
        single: true
      });

      if (!article.data) throw new Error('Unauthorized access');

      const result = await apiClient.delete('knowledge_base_article_permissions', {
        eq: { id: permissionId }
      });
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['article-permissions', articleId, organizationId] });
      toast({ title: "Permissão removida" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao remover permissão",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Gerenciar Permissões de Acesso
          </DialogTitle>
          <DialogDescription>
            Controle quem pode visualizar este artigo restrito
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search users */}
          <div>
            <Label htmlFor="search-user">Adicionar Usuário</Label>
            <div className="flex gap-2 mt-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search-user"
                  placeholder="Buscar por email..."
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            {/* Search results */}
            {searchEmail.length > 2 && orgUsers && orgUsers.length > 0 && (
              <div className="mt-2 border rounded-md p-2 max-h-40 overflow-y-auto">
                {orgUsers.map(user => (
                  <div 
                    key={user.id} 
                    className="flex items-center justify-between p-2 hover:bg-muted rounded cursor-pointer"
                    onClick={() => addPermissionMutation.mutate(user.id)}
                  >
                    <div>
                      <p className="text-sm font-medium">{user.full_name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <Button size="sm" variant="ghost">
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Current permissions */}
          <div>
            <Label>Usuários com Acesso ({permissions?.length || 0})</Label>
            <ScrollArea className="h-64 mt-2 border rounded-md p-2">
              {isLoading ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Carregando...
                </p>
              ) : permissions && permissions.length > 0 ? (
                <div className="space-y-2">
                  {permissions.map((permission: any) => (
                    <div 
                      key={permission.id}
                      className="flex items-center justify-between p-3 border rounded-md"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {permission.profiles?.full_name || 'Usuário'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {permission.profiles?.email}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Acesso concedido em {new Date(permission.granted_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => removePermissionMutation.mutate(permission.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Lock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhum usuário com permissão</p>
                  <p className="text-xs mt-1">
                    Adicione usuários para que possam visualizar este artigo
                  </p>
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
