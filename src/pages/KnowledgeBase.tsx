import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { useOrganizationQuery } from "@/hooks/useOrganizationQuery";
import { Book, Search, Plus, ThumbsUp, Eye, Edit2, Trash2, Star, Clock, CheckCircle, XCircle, AlertCircle, FileText, Download, History, Lock, Shield } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import ReactMarkdown from 'react-markdown';
import RichEditor from "@/components/knowledge-base/RichEditor";
import CommentsThread from "@/components/knowledge-base/CommentsThread";
import VersionHistory from "@/components/knowledge-base/VersionHistory";
import { ArticleReviewActions } from "@/components/knowledge-base/ArticleReviewActions";
import { ApprovalStatusBadge } from "@/components/knowledge-base/ApprovalStatusBadge";
import { ArticlePermissionsManager } from "@/components/knowledge-base/ArticlePermissionsManager";
import { ArticleAttachments } from "@/components/knowledge-base/ArticleAttachments";
import { ArticleAuditLog } from "@/components/knowledge-base/ArticleAuditLog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Layout } from "@/components/Layout";

function KnowledgeBaseContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: organizationId } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedTab, setSelectedTab] = useState<string>("all");
  const [selectedApprovalStatus, setSelectedApprovalStatus] = useState<string>("all");
  const [viewingVersions, setViewingVersions] = useState<any>(null);
  const [rejectingArticle, setRejectingArticle] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Debounce search with 500ms delay
  useMemo(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);
  const [isAddingArticle, setIsAddingArticle] = useState(false);
  const [viewingArticle, setViewingArticle] = useState<any>(null);
  const [editingArticle, setEditingArticle] = useState<any>(null);
  const [deletingArticle, setDeletingArticle] = useState<string | null>(null);
  const [managingPermissions, setManagingPermissions] = useState<any>(null);
  const [viewingAudit, setViewingAudit] = useState<any>(null);
  
  const [newArticle, setNewArticle] = useState({
    title: "",
    content: "",
    category: "general",
    tags: "",
    is_public: false,
    is_restricted: false,
  });

  // Get current user info for display
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  useMemo(() => {
    cognitoAuth.getCurrentUser().then((user) => {
      if (user) {
        setCurrentUser({
          id: user.username,
          email: user.attributes?.email || 'Unknown',
          name: user.attributes?.name || user.attributes?.email?.split('@')[0] || 'Unknown'
        });
      }
    });
  }, []);

  const { data: articles, isLoading, error: articlesError } = useOrganizationQuery(
    ['knowledge-base', debouncedSearch, selectedCategory, selectedTab, selectedApprovalStatus],
    async (orgId) => {
      let filters: any = { organization_id: orgId };
      
      if (selectedCategory !== 'all') {
        filters.category = selectedCategory;
      }

      if (selectedApprovalStatus !== 'all') {
        query = query.eq('approval_status', selectedApprovalStatus);
      }

      if (selectedTab === 'favorites') {
        const user = await cognitoAuth.getCurrentUser();
        if (user) {
          const favs = await apiClient.select('knowledge_base_favorites', {
            select: 'article_id',
            eq: { user_id: user.username }
          });
          
          if (favs.data && favs.data.length > 0) {
            const articleIds = favs.data.map((f: any) => f.article_id);
            filters.id = { in: articleIds };
          } else {
            // No favorites, return empty
            return [];
          }
        }
      } else if (selectedTab === 'my-articles') {
        const user = await cognitoAuth.getCurrentUser();
        if (user) {
          filters.author_id = user.username;
        }
      } else if (selectedTab === 'pending') {
        query = query.eq('approval_status', 'pending_review');
      } else if (selectedTab !== 'all') {
        query = query.eq('approval_status', 'approved');
      }

      if (debouncedSearch) {
        // Escape special characters to prevent SQL injection
        const escapedSearch = debouncedSearch.replace(/[%_]/g, '\\$&');
        query = query.or(`title.ilike.%${escapedSearch}%,content.ilike.%${escapedSearch}%,tags.cs.{${escapedSearch}}`);
      }

      const { data, error } = await query;
      
      return data || [];
    },
    { staleTime: 30000, gcTime: 60000 } // Cache for 30 seconds, keep in memory for 1 minute
  );

  const { data: stats } = useOrganizationQuery(
    ['knowledge-base-stats'],
    async (orgId) => {
      const result = await apiClient.select('knowledge_base_articles', {
        select: 'approval_status',
        eq: { organization_id: orgId }
      });

      if (result.error) throw new Error(getErrorMessage(result.error));

      const data = result.data || [];
      return {
        total: data.length,
        approved: data.filter((a: any) => a.approval_status === 'approved').length,
        pending: data.filter((a: any) => a.approval_status === 'pending_review').length,
        draft: data.filter((a: any) => a.approval_status === 'draft').length,
      };
    },
    { staleTime: 60000, gcTime: 120000 } // Cache for 1 minute
  );

  const addArticleMutation = useMutation({
    mutationFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user || !organizationId) throw new Error('Not authenticated');

      const tags = newArticle.tags.split(',').map(t => t.trim()).filter(Boolean);

      const result = await apiClient.insert('knowledge_base_articles', {
        organization_id: organizationId,
        author_id: user.id,
        title: newArticle.title.trim(),
        content: newArticle.content.trim(),
        category: newArticle.category,
        tags,
        is_public: newArticle.is_public,
        is_restricted: newArticle.is_restricted,
        approval_status: 'draft',
      });

      if (result.error) throw new Error(getErrorMessage(result.error));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-base-stats'] });
      setIsAddingArticle(false);
      setNewArticle({ title: "", content: "", category: "general", tags: "", is_public: false, is_restricted: false });
      toast({
        title: "Article created",
        description: "Knowledge base article added successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create article",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateArticleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const tags = typeof data.tags === 'string' 
        ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : data.tags;

      const result = await apiClient.update('knowledge_base_articles', {
        title: data.title,
        content: data.content,
        category: data.category,
        tags,
      }, { eq: { id } });

      if (result.error) throw new Error(getErrorMessage(result.error));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      setEditingArticle(null);
      toast({
        title: "Article updated",
        description: "Changes saved successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update article",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteArticleMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.delete('knowledge_base_articles', {
        eq: { id }
      });

      if (result.error) throw new Error(getErrorMessage(result.error));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-base-stats'] });
      setDeletingArticle(null);
      toast({
        title: "Article deleted",
        description: "Article removed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete article",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (articleId: string) => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      const existing = await apiClient.select('knowledge_base_favorites', {
        select: 'id',
        eq: { article_id: articleId, user_id: user.username },
        single: true
      });

      if (existing.data) {
        const result = await apiClient.delete('knowledge_base_favorites', {
          eq: { id: existing.data.id }
        });
        if (result.error) throw new Error(getErrorMessage(result.error));
      } else {
        const result = await apiClient.insert('knowledge_base_favorites', {
          article_id: articleId,
          user_id: user.username,
        });
        if (result.error) throw new Error(getErrorMessage(result.error));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
    },
  });

  const markHelpfulMutation = useMutation({
    mutationFn: async (articleId: string) => {
      const result = await apiClient.invoke('increment_article_helpful', {
        body: { article_id: articleId }
      });
      if (result.error) throw new Error(getErrorMessage(result.error));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      toast({
        title: "Marked as helpful",
        description: "Thank you for your feedback!",
      });
    },
  });

  const updateApprovalMutation = useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: string; reason?: string }) => {
      const user = await cognitoAuth.getCurrentUser();
      const result = await apiClient.update('knowledge_base_articles', {
        approval_status: status,
        approved_by: status === 'approved' ? user?.username : null,
        approved_at: status === 'approved' ? new Date().toISOString() : null,
        rejection_reason: status === 'rejected' ? reason : null,
      }, { eq: { id } });

      if (result.error) throw new Error(getErrorMessage(result.error));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-base-stats'] });
      toast({
        title: "Status updated",
        description: "Article approval status updated",
      });
    },
  });

  const incrementViewCount = async (articleId: string) => {
    await apiClient.invoke('increment_article_views', { body: { article_id: articleId } });
  };

  const handleViewArticle = async (article: any) => {
    setViewingArticle(article);
    
    // Track view for audit
    await apiClient.invoke('track_article_view_detailed', {
      body: {
        p_article_id: article.id,
        p_device_type: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
      }
    });
  };

  const categories = [
    { value: "all", label: "All Categories" },
    { value: "general", label: "General" },
    { value: "security", label: "Security" },
    { value: "cost", label: "Cost Optimization" },
    { value: "operations", label: "Operations" },
    { value: "compliance", label: "Compliance" },
    { value: "troubleshooting", label: "Troubleshooting" },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'pending_review': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'rejected': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      approved: "default",
      pending_review: "secondary",
      rejected: "destructive",
      draft: "outline",
    };
    return <Badge variant={variants[status] || "outline"}>{status.replace('_', ' ')}</Badge>;
  };

  const handleExport = async (articleId: string, format: string) => {
    try {
      const result = await apiClient.invoke('kb-export-pdf', {
        body: { articleId, format }
      });

      if (result.error) throw new Error(getErrorMessage(result.error));
      const data = result.data;

      // Create download link
      const blob = new Blob([data.content], { type: data.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Exportação concluída",
        description: `Artigo exportado como ${format.toUpperCase()}`,
      });
    } catch (error: any) {
      toast({
        title: "Erro ao exportar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Knowledge Base</h1>
            <p className="text-muted-foreground">Organizational wiki and documentation</p>
          </div>
        </div>

        {/* Stats Cards Skeleton */}
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                <div className="h-4 w-4 bg-muted animate-pulse rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-12 bg-muted animate-pulse rounded mb-2" />
                <div className="h-3 w-32 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters Skeleton */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="h-10 flex-1 bg-muted animate-pulse rounded" />
              <div className="h-10 w-40 bg-muted animate-pulse rounded" />
            </div>
          </CardHeader>
        </Card>

        {/* Articles List Skeleton */}
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-6 w-3/4 bg-muted animate-pulse rounded mb-2" />
                <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-4 w-full bg-muted animate-pulse rounded" />
                  <div className="h-4 w-5/6 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-4/6 bg-muted animate-pulse rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Knowledge Base</h1>
          <p className="text-muted-foreground">Organizational wiki and documentation</p>
        </div>
        <Dialog open={isAddingArticle} onOpenChange={setIsAddingArticle}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Article
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Knowledge Base Article</DialogTitle>
              <DialogDescription>
                Share knowledge and best practices with your team
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={newArticle.title}
                  onChange={(e) => setNewArticle({ ...newArticle, title: e.target.value })}
                  placeholder="Article title"
                  maxLength={200}
                />
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={newArticle.category} onValueChange={(v) => setNewArticle({ ...newArticle, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.filter(c => c.value !== 'all').map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="content">Content</Label>
                <RichEditor
                  value={newArticle.content}
                  onChange={(content) => setNewArticle({ ...newArticle, content })}
                  placeholder="Escreva o conteúdo do seu artigo..."
                />
              </div>
              <div>
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  value={newArticle.tags}
                  onChange={(e) => setNewArticle({ ...newArticle, tags: e.target.value })}
                  placeholder="aws, ec2, optimization"
                />
              </div>
              
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="is-restricted" className="font-medium cursor-pointer">
                      Documento Restrito
                    </Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Apenas usuários com permissão específica poderão visualizar
                  </p>
                </div>
                <Switch
                  id="is-restricted"
                  checked={newArticle.is_restricted}
                  onCheckedChange={(checked) => setNewArticle({ ...newArticle, is_restricted: checked })}
                />
              </div>

              <Button
                onClick={() => addArticleMutation.mutate()}
                disabled={!newArticle.title.trim() || !newArticle.content.trim() || addArticleMutation.isPending}
                className="w-full"
              >
                {addArticleMutation.isPending ? "Creating..." : "Create Article"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Articles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Draft</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-600">{stats.draft}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="all">All Articles</TabsTrigger>
          <TabsTrigger value="favorites">Favorites</TabsTrigger>
          <TabsTrigger value="my-articles">My Articles</TabsTrigger>
          <TabsTrigger value="pending">Pending Review</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoading && (
              <div className="col-span-full text-center py-8 text-muted-foreground">
                Loading articles...
              </div>
            )}

            {articles?.map((article) => {
              return (
                <Card key={article.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => handleViewArticle(article)}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            {article.title}
                            {article.is_restricted && (
                              <Lock className="h-4 w-4 text-orange-500" />
                            )}
                          </CardTitle>
                          {getStatusIcon(article.approval_status)}
                        </div>
                        <CardDescription className="mt-1">
                          Por {currentUser?.id === article.author_id ? currentUser.name : 'Autor'} · {new Date(article.created_at).toLocaleDateString()}
                        </CardDescription>
                      </div>
                      <div className="flex flex-col gap-2 items-end">
                        <div className="flex gap-2">
                          <Badge variant="outline">{article.category}</Badge>
                          {article.is_restricted && (
                            <Badge variant="outline" className="text-orange-600 border-orange-600">
                              <Lock className="h-3 w-3 mr-1" />
                              Restrito
                            </Badge>
                          )}
                        </div>
                        <ApprovalStatusBadge 
                          status={article.approval_status} 
                          rejectionReason={article.rejection_reason}
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {article.content.substring(0, 150)}...
                    </p>
                    
                    {article.tags && Array.isArray(article.tags) && article.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {(article.tags as string[]).slice(0, 3).map((tag, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {article.tags.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{article.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex gap-3">
                        <div className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {article.view_count || 0}
                        </div>
                        <div className="flex items-center gap-1">
                          <ThumbsUp className="h-3 w-3" />
                          {article.helpful_count || 0}
                        </div>
                        <div className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          v{article.version || 1}
                        </div>
                      </div>
                      <div className="flex gap-1 items-center" onClick={(e) => e.stopPropagation()}>
                        <ArticleReviewActions 
                          article={article} 
                          currentUserId={currentUser?.id}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleFavoriteMutation.mutate(article.id)}
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {articles?.length === 0 && !isLoading && (
              <div className="col-span-full">
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <Book className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                    <h3 className="text-xl font-semibold mb-2">Nenhum artigo encontrado</h3>
                    <p className="text-muted-foreground text-center mb-6 max-w-md">
                      {selectedTab === 'all' && selectedCategory === 'all' && !debouncedSearch
                        ? 'Comece criando seu primeiro artigo da base de conhecimento'
                        : 'Nenhum artigo corresponde aos filtros selecionados. Tente ajustar sua busca.'}
                    </p>
                    {selectedTab === 'all' && selectedCategory === 'all' && !debouncedSearch && (
                      <Button onClick={() => setIsAddingArticle(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Criar Primeiro Artigo
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* View Article Dialog */}
      <Dialog open={!!viewingArticle} onOpenChange={(open) => !open && setViewingArticle(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {viewingArticle && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <DialogTitle className="text-2xl">{viewingArticle.title}</DialogTitle>
                    <DialogDescription className="mt-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>Por {currentUser?.id === viewingArticle.author_id ? currentUser.name : 'Autor'}</span>
                        <span>·</span>
                        <span>{new Date(viewingArticle.created_at).toLocaleDateString()}</span>
                        <span>·</span>
                        <Badge variant="outline">{viewingArticle.category}</Badge>
                        <span>·</span>
                        {getStatusBadge(viewingArticle.approval_status)}
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          Versão {viewingArticle.version || 1}
                        </span>
                      </div>
                    </DialogDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        markHelpfulMutation.mutate(viewingArticle.id);
                      }}
                    >
                      <ThumbsUp className="h-4 w-4 mr-1" />
                      {viewingArticle.helpful_count || 0}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-1" />
                          Exportar
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => handleExport(viewingArticle.id, 'pdf')}>
                          PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExport(viewingArticle.id, 'markdown')}>
                          Markdown
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExport(viewingArticle.id, 'html')}>
                          HTML
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewingVersions(viewingArticle)}
                    >
                      <History className="h-4 w-4 mr-1" />
                      Histórico
                    </Button>
                    
                    {viewingArticle.is_restricted && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setManagingPermissions(viewingArticle);
                        }}
                      >
                        <Shield className="h-4 w-4 mr-1" />
                        Gerenciar Acesso
                      </Button>
                    )}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewingAudit(viewingArticle)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Auditoria
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingArticle(viewingArticle);
                        setViewingArticle(null);
                      }}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingArticle(viewingArticle.id);
                        setViewingArticle(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </DialogHeader>
              
              <div className="prose dark:prose-invert max-w-none mt-4">
                <ReactMarkdown>{viewingArticle.content}</ReactMarkdown>
              </div>
              
              {/* Attachments Section */}
              <div className="mt-6 pt-6 border-t">
                <ArticleAttachments 
                  articleId={viewingArticle.id}
                  organizationId={organizationId || ''}
                  isAuthor={viewingArticle.author_id === currentUser?.id}
                />
              </div>
              
              {/* Comments Section */}
              <div className="mt-6 pt-6 border-t">
                <h3 className="text-lg font-semibold mb-4">Comentários</h3>
                <CommentsThread articleId={viewingArticle.id} />
              </div>
              {viewingArticle.tags && Array.isArray(viewingArticle.tags) && viewingArticle.tags.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-4 pt-4 border-t">
                  {(viewingArticle.tags as string[]).map((tag, i) => (
                    <Badge key={i} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              {viewingArticle.approval_status === 'pending_review' && (
                <div className="flex gap-2 mt-4 pt-4 border-t">
                  <Button
                    onClick={() => updateApprovalMutation.mutate({ id: viewingArticle.id, status: 'approved' })}
                    className="flex-1"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => updateApprovalMutation.mutate({ id: viewingArticle.id, status: 'rejected', reason: 'Needs review' })}
                    className="flex-1"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Article Dialog */}
      <Dialog open={!!editingArticle} onOpenChange={(open) => !open && setEditingArticle(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {editingArticle && (
            <>
              <DialogHeader>
                <DialogTitle>Edit Article</DialogTitle>
                <DialogDescription>
                  Make changes to your article
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-title">Title</Label>
                  <Input
                    id="edit-title"
                    value={editingArticle.title}
                    onChange={(e) => setEditingArticle({ ...editingArticle, title: e.target.value })}
                    maxLength={200}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-category">Category</Label>
                  <Select 
                    value={editingArticle.category} 
                    onValueChange={(v) => setEditingArticle({ ...editingArticle, category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.filter(c => c.value !== 'all').map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-content">Content</Label>
                  <RichEditor
                    value={editingArticle.content}
                    onChange={(content) => setEditingArticle({ ...editingArticle, content })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-tags">Tags (comma-separated)</Label>
                  <Input
                    id="edit-tags"
                    value={Array.isArray(editingArticle.tags) ? editingArticle.tags.join(', ') : editingArticle.tags}
                    onChange={(e) => setEditingArticle({ ...editingArticle, tags: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => updateArticleMutation.mutate({ id: editingArticle.id, data: editingArticle })}
                    disabled={updateArticleMutation.isPending}
                    className="flex-1"
                  >
                    {updateArticleMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (editingArticle.approval_status === 'draft') {
                        updateApprovalMutation.mutate({ id: editingArticle.id, status: 'pending_review' });
                        setEditingArticle(null);
                      }
                    }}
                    disabled={editingArticle.approval_status !== 'draft'}
                  >
                    Submit for Review
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingArticle} onOpenChange={(open) => !open && setDeletingArticle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the article and all its versions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingArticle && deleteArticleMutation.mutate(deletingArticle)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Version History Dialog */}
      {viewingVersions && (
        <VersionHistory
          articleId={viewingVersions.id}
          currentVersion={viewingVersions.version || 1}
          isOpen={!!viewingVersions}
          onClose={() => setViewingVersions(null)}
        />
      )}
      
      {/* Permissions Manager */}
      {managingPermissions && (
        <ArticlePermissionsManager
          articleId={managingPermissions.id}
          organizationId={organizationId || ''}
          isOpen={!!managingPermissions}
          onClose={() => setManagingPermissions(null)}
        />
      )}
      
      {/* Audit Log */}
      {viewingAudit && (
        <ArticleAuditLog
          articleId={viewingAudit.id}
          isOpen={!!viewingAudit}
          onClose={() => setViewingAudit(null)}
        />
      )}
    </div>
  );
}

// Export content component for use inside Index.tsx tab view
export { KnowledgeBaseContent };

export default function KnowledgeBase() {
  return (
    <Layout
      title="Base de Conhecimento"
      description="Wiki organizacional e documentação"
      icon={<Book className="h-6 w-6 text-white" />}
    >
      <KnowledgeBaseContent />
    </Layout>
  );
}
