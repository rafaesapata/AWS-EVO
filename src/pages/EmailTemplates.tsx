import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Mail, Plus, Pencil, Trash2, Eye, Copy, Search, ToggleLeft, ToggleRight, Code, FileText, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/integrations/aws/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cognitoAuth } from '@/integrations/aws/cognito-client-simple';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface EmailTemplate {
  id: string;
  template_type: string;
  name: string;
  description: string | null;
  subject: string;
  html_body?: string;
  text_body?: string | null;
  variables: string[];
  category: string;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  { value: 'general', label: 'Geral' },
  { value: 'security', label: 'Segurança' },
  { value: 'cost', label: 'Custos' },
  { value: 'notification', label: 'Notificações' },
  { value: 'report', label: 'Relatórios' },
  { value: 'auth', label: 'Autenticação' },
];

export default function EmailTemplates() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editDialog, setEditDialog] = useState(false);
  const [previewDialog, setPreviewDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState('html');
  const [previewHtml, setPreviewHtml] = useState('');
  const [form, setForm] = useState({
    template_type: '',
    name: '',
    description: '',
    subject: '',
    html_body: '',
    text_body: '',
    variables: '' as string,
    category: 'general',
    is_active: true,
  });

  // Check super admin access
  const [isAuthorized, setIsAuthorized] = useState(false);
  useEffect(() => {
    const checkAccess = async () => {
      const user = await cognitoAuth.getCurrentUser();
      const roles = user?.attributes?.['custom:roles'] || '';
      setIsAuthorized(roles.includes('super_admin'));
    };
    checkAccess();
  }, []);

  const { data: templates, isLoading } = useQuery({
    queryKey: ['email-templates'],
    enabled: isAuthorized,
    queryFn: async () => {
      const response = await apiClient.post<{ templates: EmailTemplate[] }>('/api/functions/manage-email-templates', {
        action: 'list',
      });
      if (response.error) throw new Error('Failed to load templates');
      return response.data?.templates || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form & { id?: string }) => {
      const action = data.id ? 'update' : 'create';
      const payload: Record<string, unknown> = { action };
      
      if (data.id) {
        payload.id = data.id;
        if (data.name) payload.name = data.name;
        if (data.description) payload.description = data.description;
        if (data.subject) payload.subject = data.subject;
        if (data.html_body) payload.html_body = data.html_body;
        if (data.text_body) payload.text_body = data.text_body;
        if (data.variables) payload.variables = data.variables.split(',').map((v: string) => v.trim()).filter(Boolean);
        if (data.category) payload.category = data.category;
        payload.is_active = data.is_active;
      } else {
        payload.template_type = data.template_type;
        payload.name = data.name;
        payload.description = data.description || undefined;
        payload.subject = data.subject;
        payload.html_body = data.html_body;
        payload.text_body = data.text_body || undefined;
        payload.variables = data.variables ? data.variables.split(',').map((v: string) => v.trim()).filter(Boolean) : [];
        payload.category = data.category;
        payload.is_active = data.is_active;
      }

      const response = await apiClient.post('/api/functions/manage-email-templates', payload);
      if (response.error) throw new Error('Failed to save template');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      setEditDialog(false);
      toast.success(isCreating ? t('emailTemplates.created', 'Template criado com sucesso') : t('emailTemplates.updated', 'Template atualizado com sucesso'));
    },
    onError: () => {
      toast.error(t('emailTemplates.saveError', 'Erro ao salvar template'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.post('/api/functions/manage-email-templates', { action: 'delete', id });
      if (response.error) throw new Error('Failed to delete template');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      setDeleteDialog(false);
      toast.success(t('emailTemplates.deleted', 'Template excluído com sucesso'));
    },
    onError: () => {
      toast.error(t('emailTemplates.deleteError', 'Erro ao excluir template'));
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const response = await apiClient.post('/api/functions/manage-email-templates', {
        action: 'update', id, is_active,
      });
      if (response.error) throw new Error('Failed to toggle template');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success(t('emailTemplates.toggled', 'Status atualizado'));
    },
  });

  const openCreate = () => {
    setIsCreating(true);
    setSelectedTemplate(null);
    setForm({ template_type: '', name: '', description: '', subject: '', html_body: '', text_body: '', variables: '', category: 'general', is_active: true });
    setActiveTab('html');
    setEditDialog(true);
  };

  const openEdit = async (template: EmailTemplate) => {
    // Fetch full template with html_body
    const response = await apiClient.post<{ template: EmailTemplate }>('/api/functions/manage-email-templates', {
      action: 'get', id: template.id,
    });
    const full = response.data?.template || template;
    setIsCreating(false);
    setSelectedTemplate(full);
    setForm({
      template_type: full.template_type,
      name: full.name,
      description: full.description || '',
      subject: full.subject,
      html_body: full.html_body || '',
      text_body: full.text_body || '',
      variables: full.variables?.join(', ') || '',
      category: full.category,
      is_active: full.is_active,
    });
    setActiveTab('html');
    setEditDialog(true);
  };

  const openPreview = async (template: EmailTemplate) => {
    const response = await apiClient.post<{ template: EmailTemplate & { preview_html: string } }>('/api/functions/manage-email-templates', {
      action: 'preview', id: template.id,
    });
    const preview = response.data?.template;
    if (preview) {
      setPreviewHtml(preview.preview_html || preview.html_body || '');
      setSelectedTemplate(template);
      setPreviewDialog(true);
    }
  };

  const handleSave = () => {
    saveMutation.mutate({
      ...form,
      id: selectedTemplate?.id,
    } as typeof form & { id?: string });
  };

  const filteredTemplates = (templates || []).filter(t => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.template_type.toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === 'all' || t.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  const getCategoryColor = (cat: string) => {
    const colors: Record<string, string> = {
      general: 'bg-gray-500', security: 'bg-red-500', cost: 'bg-green-500',
      notification: 'bg-blue-500', report: 'bg-purple-500', auth: 'bg-orange-500',
    };
    return colors[cat] || 'bg-gray-500';
  };

  if (!isAuthorized) {
    return (
      <Layout title={t('emailTemplates.title', 'Templates de Email')} description={t('emailTemplates.noAccess', 'Acesso restrito')} icon={<Mail className="h-4 w-4 text-white" />}>
        <Card className="glass border-primary/20">
          <CardContent className="p-12 text-center">
            <Mail className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg text-muted-foreground">{t('emailTemplates.superAdminOnly', 'Apenas super administradores podem acessar esta página.')}</p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout title={t('emailTemplates.title', 'Templates de Email')} description={t('emailTemplates.description', 'Gerencie os templates de email da plataforma')} icon={<Mail className="h-4 w-4 text-white" />}>
      <div className="space-y-6">
        {/* Header actions */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex gap-3 flex-1 w-full sm:w-auto">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t('emailTemplates.search', 'Buscar templates...')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 glass" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px] glass">
                <SelectValue placeholder={t('emailTemplates.allCategories', 'Todas')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('emailTemplates.allCategories', 'Todas')}</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={openCreate} className="glass hover-glow">
            <Plus className="h-4 w-4 mr-2" /> {t('emailTemplates.create', 'Novo Template')}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="glass border-primary/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><FileText className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-2xl font-semibold">{templates?.length || 0}</p>
                <p className="text-xs text-muted-foreground">{t('emailTemplates.total', 'Total')}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="glass border-primary/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10"><ToggleRight className="h-5 w-5 text-green-500" /></div>
              <div>
                <p className="text-2xl font-semibold">{templates?.filter(t => t.is_active).length || 0}</p>
                <p className="text-xs text-muted-foreground">{t('emailTemplates.active', 'Ativos')}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="glass border-primary/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><Code className="h-5 w-5 text-blue-500" /></div>
              <div>
                <p className="text-2xl font-semibold">{templates?.filter(t => t.is_system).length || 0}</p>
                <p className="text-xs text-muted-foreground">{t('emailTemplates.system', 'Sistema')}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="glass border-primary/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10"><Copy className="h-5 w-5 text-purple-500" /></div>
              <div>
                <p className="text-2xl font-semibold">{templates?.filter(t => !t.is_system).length || 0}</p>
                <p className="text-xs text-muted-foreground">{t('emailTemplates.custom', 'Customizados')}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Templates list */}
        {isLoading ? (
          <Card className="glass border-primary/20"><CardContent className="p-12 text-center"><p className="text-muted-foreground">{t('common.loading', 'Carregando...')}</p></CardContent></Card>
        ) : filteredTemplates.length === 0 ? (
          <Card className="glass border-primary/20"><CardContent className="p-12 text-center"><Mail className="h-12 w-12 mx-auto mb-3 text-muted-foreground" /><p className="text-muted-foreground">{t('emailTemplates.noTemplates', 'Nenhum template encontrado')}</p></CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map(template => (
              <Card key={template.id} className="glass border-primary/20 hover:shadow-elegant transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-medium truncate">{template.name}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1 font-mono">{template.template_type}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      {template.is_system && <Badge variant="outline" className="text-xs">Sistema</Badge>}
                      <Badge className={`text-xs text-white ${getCategoryColor(template.category)}`}>{template.category}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {template.description && (
                    template.description.includes('Disparado por:') ? (
                      <div className="flex items-start gap-1.5">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors" aria-label={t('emailTemplates.triggerInfo', 'Informação do trigger')}>
                                <Info className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-sm text-xs whitespace-pre-wrap">
                              <p>{template.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <p className="text-xs text-muted-foreground line-clamp-2">{template.description.replace(/^ℹ️\s*/, '')}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
                    )
                  )}
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">{t('emailTemplates.subjectLabel', 'Assunto')}:</span> {template.subject}
                  </div>
                  {template.variables?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {template.variables.slice(0, 4).map(v => <Badge key={v} variant="secondary" className="text-xs font-mono">{`{${v}}`}</Badge>)}
                      {template.variables.length > 4 && <Badge variant="secondary" className="text-xs">+{template.variables.length - 4}</Badge>}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-primary/10">
                    <div className="flex items-center gap-2">
                      <Switch checked={template.is_active} disabled={template.is_system} onCheckedChange={checked => toggleActiveMutation.mutate({ id: template.id, is_active: checked })} />
                      <span className="text-xs text-muted-foreground">{template.is_active ? t('emailTemplates.active', 'Ativo') : t('emailTemplates.inactive', 'Inativo')}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPreview(template)} title={t('emailTemplates.preview', 'Visualizar')}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(template)} title={t('emailTemplates.edit', 'Editar')}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {!template.is_system && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { setSelectedTemplate(template); setDeleteDialog(true); }} title={t('emailTemplates.delete', 'Excluir')}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isCreating ? t('emailTemplates.createTitle', 'Criar Novo Template') : t('emailTemplates.editTitle', 'Editar Template')}</DialogTitle>
            <DialogDescription>{isCreating ? t('emailTemplates.createDesc', 'Defina o conteúdo e variáveis do novo template') : t('emailTemplates.editDesc', 'Modifique o conteúdo do template')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {isCreating && (
                <div className="space-y-2">
                  <Label>{t('emailTemplates.typeLabel', 'Tipo (identificador único)')}</Label>
                  <Input value={form.template_type} onChange={e => setForm(f => ({ ...f, template_type: e.target.value }))} placeholder="ex: welcome_email" className="font-mono" />
                </div>
              )}
              <div className="space-y-2">
                <Label>{t('emailTemplates.nameLabel', 'Nome')}</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('emailTemplates.namePlaceholder', 'Nome do template')} />
              </div>
              <div className="space-y-2">
                <Label>{t('emailTemplates.categoryLabel', 'Categoria')}</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('emailTemplates.descriptionLabel', 'Descrição')}</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t('emailTemplates.descriptionPlaceholder', 'Descrição breve do template')} />
            </div>
            <div className="space-y-2">
              <Label>{t('emailTemplates.subjectLabel', 'Assunto do Email')}</Label>
              <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder={t('emailTemplates.subjectPlaceholder', 'Assunto com {variáveis}')} />
            </div>
            <div className="space-y-2">
              <Label>{t('emailTemplates.variablesLabel', 'Variáveis (separadas por vírgula)')}</Label>
              <Input value={form.variables} onChange={e => setForm(f => ({ ...f, variables: e.target.value }))} placeholder="userName, organizationName, alertTitle" className="font-mono" />
              <p className="text-xs text-muted-foreground">{t('emailTemplates.variablesHelp', 'Use {nomeVariavel} no HTML/assunto para inserir valores dinâmicos')}</p>
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="glass">
                <TabsTrigger value="html"><Code className="h-3.5 w-3.5 mr-1.5" /> HTML</TabsTrigger>
                <TabsTrigger value="text"><FileText className="h-3.5 w-3.5 mr-1.5" /> {t('emailTemplates.textVersion', 'Texto')}</TabsTrigger>
                <TabsTrigger value="preview"><Eye className="h-3.5 w-3.5 mr-1.5" /> {t('emailTemplates.preview', 'Preview')}</TabsTrigger>
              </TabsList>
              <TabsContent value="html" className="mt-3">
                <Textarea value={form.html_body} onChange={e => setForm(f => ({ ...f, html_body: e.target.value }))} placeholder="<html>...</html>" className="font-mono text-xs min-h-[300px]" />
              </TabsContent>
              <TabsContent value="text" className="mt-3">
                <Textarea value={form.text_body} onChange={e => setForm(f => ({ ...f, text_body: e.target.value }))} placeholder={t('emailTemplates.textPlaceholder', 'Versão texto puro do email (opcional)')} className="min-h-[300px]" />
              </TabsContent>
              <TabsContent value="preview" className="mt-3">
                <div className="border rounded-lg overflow-hidden bg-white">
                  <iframe srcDoc={form.html_body || '<p style="padding:20px;color:#999;">Sem conteúdo HTML</p>'} className="w-full min-h-[400px]" sandbox="" title="Email Preview" />
                </div>
              </TabsContent>
            </Tabs>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={checked => setForm(f => ({ ...f, is_active: checked }))} />
              <Label>{t('emailTemplates.activeLabel', 'Template ativo')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>{t('common.cancel', 'Cancelar')}</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="glass hover-glow">
              {saveMutation.isPending ? t('common.saving', 'Salvando...') : t('common.save', 'Salvar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewDialog} onOpenChange={setPreviewDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{selectedTemplate?.name} - {t('emailTemplates.preview', 'Preview')}</DialogTitle>
            <DialogDescription>{selectedTemplate?.subject}</DialogDescription>
          </DialogHeader>
          <div className="border rounded-lg overflow-hidden bg-white">
            <iframe srcDoc={previewHtml || '<p style="padding:20px;color:#999;">Sem conteúdo</p>'} className="w-full min-h-[500px]" sandbox="" title="Email Preview" />
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('emailTemplates.deleteTitle', 'Excluir Template')}</DialogTitle>
            <DialogDescription>{t('emailTemplates.deleteConfirm', 'Tem certeza que deseja excluir o template "{name}"? Esta ação não pode ser desfeita.').replace('{name}', selectedTemplate?.name || '')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>{t('common.cancel', 'Cancelar')}</Button>
            <Button variant="destructive" onClick={() => selectedTemplate && deleteMutation.mutate(selectedTemplate.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? t('common.deleting', 'Excluindo...') : t('common.delete', 'Excluir')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
