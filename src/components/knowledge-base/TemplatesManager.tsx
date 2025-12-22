import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganizationQuery } from "@/hooks/useOrganizationQuery";
import { useOrganization } from "@/hooks/useOrganization";
import { FileText, Plus, Trash2, Copy, Edit2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface TemplatesManagerProps {
  onSelectTemplate?: (template: any) => void;
}

export default function TemplatesManager({ onSelectTemplate }: TemplatesManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<string | null>(null);
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    description: "",
    content_template: "",
    category: "general",
  });

  const { data: templates, isLoading } = useOrganizationQuery(
    ['kb-templates'],
    async (orgId) => {
      const result = await apiClient.select('knowledge_base_templates', {
        select: '*',
        eq: { organization_id: orgId },
        order: { created_at: 'desc' }
      });
      const { data, error } = { data: result.data, error: result.error };

      
      return data || [];
    }
  );

  const { data: organizationId } = useOrganization();

  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      if (!organizationId) throw new Error('No organization');

      const result = await apiClient.insert('knowledge_base_templates', {
          name: newTemplate.name,
          description: newTemplate.description,
          content: newTemplate.content_template,
          category: newTemplate.category,
          template_type: 'custom',
          organization_id: organizationId,
          created_by: user.username,
        });

      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-templates'] });
      setIsCreating(false);
      setNewTemplate({ name: "", description: "", content_template: "", category: "general" });
      toast({
        title: "Template criado",
        description: "Novo template adicionado com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.delete('knowledge_base_templates', {
        eq: { id }
      });

      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-templates'] });
      setDeletingTemplate(null);
      toast({
        title: "Template removido",
        description: "Template excluído com sucesso",
      });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const result = await apiClient.update('knowledge_base_templates', updates, {
        eq: { id }
      });

      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-templates'] });
      setEditingTemplate(null);
      toast({
        title: "Template atualizado",
        description: "Template modificado com sucesso",
      });
    },
  });

  const handleUseTemplate = (template: any) => {
    if (onSelectTemplate) {
      onSelectTemplate(template);
      toast({
        title: "Template aplicado",
        description: "O conteúdo do template foi inserido no editor",
      });
    }
  };

  const predefinedTemplates = [
    {
      name: "Guia de Procedimento",
      description: "Template para criar guias passo a passo",
      category: "runbook",
      content_template: `# [Título do Procedimento]

## Objetivo
Descreva o que este procedimento visa alcançar.

## Pré-requisitos
- Item 1
- Item 2

## Passo a Passo

### 1. Primeiro Passo
Descrição detalhada...

### 2. Segundo Passo
Descrição detalhada...

## Solução de Problemas
Possíveis problemas e suas soluções.

## Referências
Links e documentação relacionada.`
    },
    {
      name: "Documentação Técnica",
      description: "Template para documentação de sistemas e APIs",
      category: "documentation",
      content_template: `# [Nome do Sistema/API]

## Visão Geral
Descrição breve do sistema.

## Arquitetura
Diagrama e explicação da arquitetura.

## Endpoints/Funcionalidades
### Endpoint 1
- **Método**: GET/POST/etc
- **URL**: /api/...
- **Parâmetros**:
- **Resposta**:

## Exemplos de Uso
\`\`\`javascript
// Código exemplo
\`\`\`

## Considerações de Segurança
Pontos importantes de segurança.`
    },
    {
      name: "Análise de Incidente",
      description: "Template para documentar incidentes e post-mortems",
      category: "incident",
      content_template: `# Análise de Incidente: [Nome do Incidente]

## Resumo
Breve descrição do incidente.

## Cronologia
- **[Hora]**: Evento 1
- **[Hora]**: Evento 2

## Impacto
- Serviços afetados
- Usuários impactados
- Duração

## Causa Raiz
Análise detalhada da causa.

## Ações Corretivas
- [ ] Ação 1
- [ ] Ação 2

## Lições Aprendidas
O que foi aprendido com este incidente.`
    }
  ];

  if (isLoading) {
    return <Card><CardContent className="p-6">Carregando templates...</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Gerenciar Templates
          </CardTitle>
          <Dialog open={isCreating} onOpenChange={setIsCreating}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Novo Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Criar Novo Template</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome do Template</Label>
                  <Input
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                    placeholder="Ex: Guia de Deploy"
                  />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Input
                    value={newTemplate.description}
                    onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                    placeholder="Breve descrição do template"
                  />
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Input
                    value={newTemplate.category}
                    onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                    placeholder="Ex: runbook, documentation"
                  />
                </div>
                <div>
                  <Label>Conteúdo do Template</Label>
                  <Textarea
                    value={newTemplate.content_template}
                    onChange={(e) => setNewTemplate({ ...newTemplate, content_template: e.target.value })}
                    placeholder="Digite o conteúdo do template em Markdown..."
                    className="min-h-[300px] font-mono"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsCreating(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={() => createTemplateMutation.mutate()}
                    disabled={!newTemplate.name || !newTemplate.content_template || createTemplateMutation.isPending}
                  >
                    Criar Template
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Predefined Templates */}
        <div>
          <h3 className="text-sm font-medium mb-3">Templates Pré-definidos</h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {predefinedTemplates.map((template, index) => (
              <Card key={index} className="hover:border-primary transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{template.name}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                    </div>
                    <Badge variant="secondary" className="ml-2">{template.category}</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => handleUseTemplate(template)}
                  >
                    <Copy className="h-3 w-3 mr-2" />
                    Usar Template
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Custom Templates */}
        {templates && templates.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-3">Templates Personalizados</h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <Card key={template.id} className="hover:border-primary transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">{template.name}</h4>
                        <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                      </div>
                      <Badge variant="secondary" className="ml-2">{template.category}</Badge>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleUseTemplate(template)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Usar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingTemplate(template)}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDeletingTemplate(template.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {(!templates || templates.length === 0) && (
          <p className="text-center text-muted-foreground py-8">
            Nenhum template personalizado. Crie um novo ou use os pré-definidos.
          </p>
        )}
      </CardContent>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingTemplate} onOpenChange={() => setDeletingTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este template? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingTemplate && deleteTemplateMutation.mutate(deletingTemplate)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      {editingTemplate && (
        <Dialog open={!!editingTemplate} onOpenChange={() => setEditingTemplate(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={editingTemplate.name}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input
                  value={editingTemplate.description}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                />
              </div>
              <div>
                <Label>Conteúdo</Label>
                <Textarea
                  value={editingTemplate.content_template}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, content_template: e.target.value })}
                  className="min-h-[300px] font-mono"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingTemplate(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => updateTemplateMutation.mutate({
                    id: editingTemplate.id,
                    updates: {
                      name: editingTemplate.name,
                      description: editingTemplate.description,
                      content_template: editingTemplate.content_template,
                    }
                  })}
                >
                  Salvar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
