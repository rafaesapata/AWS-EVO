# Frontend Page Standards

## 🚨 IMPORTANTE: Padrão Visual Obrigatório para Novas Páginas

Todas as páginas do frontend DEVEM seguir o padrão visual estabelecido usando o componente `<Layout>`.

## ✅ Estrutura Obrigatória de Página

```tsx
import { Layout } from '@/components/Layout';
import { SomeIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function NomeDaPagina() {
  const { t } = useTranslation();

  return (
    <Layout
      title={t('pagina.title', 'Título da Página')}
      description={t('pagina.description', 'Descrição breve da página')}
      icon={<SomeIcon className="h-4 w-4 text-white" />}
    >
      <div className="space-y-6">
        {/* Conteúdo da página */}
      </div>
    </Layout>
  );
}
```

## Props do Layout

| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| `title` | `string` | Sim | Título exibido no header |
| `description` | `string` | Sim | Descrição curta da página |
| `icon` | `ReactNode` | Recomendado | Ícone do Lucide com `h-4 w-4 text-white` |
| `children` | `ReactNode` | Sim | Conteúdo da página |

## O que o Layout Fornece

O componente `<Layout>` automaticamente inclui:

1. **Sidebar** - Menu lateral com navegação
2. **Header** - Com título, descrição, ícone, seletor de conta cloud, idioma, tema e menu do usuário
3. **Footer** - Rodapé minimalista
4. **Estilos** - Classes `glass`, `bg-gradient-subtle`, etc.

## ⛔ O QUE NÃO FAZER

```tsx
// ❌ ERRADO - Página sem Layout
export default function MinhaPage() {
  return (
    <div className="container mx-auto py-6">
      <h1>Título</h1>
      {/* conteúdo */}
    </div>
  );
}

// ❌ ERRADO - Header próprio
export default function MinhaPage() {
  return (
    <div>
      <header className="...">Meu Header</header>
      {/* conteúdo */}
    </div>
  );
}
```

## ✅ Padrões de Estilo

### Cards
```tsx
// Card padrão com glass effect
<Card className="glass border-primary/20">
  <CardHeader>
    <CardTitle>Título</CardTitle>
    <CardDescription>Descrição</CardDescription>
  </CardHeader>
  <CardContent>
    {/* conteúdo */}
  </CardContent>
</Card>
```

### Tabs
```tsx
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList className="glass">
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1" className="space-y-6">
    {/* conteúdo */}
  </TabsContent>
</Tabs>
```

### Botões
```tsx
// Botão primário com glow
<Button className="glass hover-glow">
  <Icon className="h-4 w-4 mr-2" />
  Texto
</Button>

// Botão outline
<Button variant="outline" className="glass hover-glow">
  Texto
</Button>
```

### Espaçamento
```tsx
// Container principal
<div className="space-y-6">
  {/* Seções com gap de 1.5rem */}
</div>

// Grid responsivo
<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
  {/* Cards */}
</div>
```

## Classes CSS Customizadas Disponíveis

| Classe | Descrição |
|--------|-----------|
| `glass` | Efeito glassmorphism com blur |
| `hover-glow` | Efeito glow no hover |
| `bg-gradient-subtle` | Background gradiente sutil |
| `bg-gradient-primary` | Background gradiente primário |
| `shadow-elegant` | Sombra elegante |
| `shadow-glow` | Sombra com glow |
| `border-primary/20` | Borda primária com 20% opacidade |

## Exemplo Completo

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, RefreshCw } from 'lucide-react';

export default function MinhaNovaPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('overview');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['minha-query'],
    queryFn: async () => {
      // fetch data
    },
  });

  return (
    <Layout
      title={t('minhaPage.title', 'Minha Página')}
      description={t('minhaPage.description', 'Descrição da minha página')}
      icon={<Settings className="h-4 w-4 text-white" />}
    >
      <div className="space-y-6">
        {/* Header Card */}
        <Card className="glass border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Título da Seção</CardTitle>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => refetch()}
                className="glass hover-glow"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                {t('common.refresh', 'Atualizar')}
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="glass">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="details">Detalhes</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="glass">
                <CardContent className="p-6">
                  {/* conteúdo */}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="details" className="space-y-6">
            {/* conteúdo */}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
```

## Checklist para Novas Páginas

- [ ] Usar `<Layout>` como wrapper principal
- [ ] Definir `title` e `description` com i18n
- [ ] Adicionar ícone apropriado do Lucide
- [ ] Usar classes `glass` e `border-primary/20` em Cards
- [ ] Usar `space-y-6` para espaçamento vertical
- [ ] Usar `grid gap-6` para layouts em grid
- [ ] Adicionar traduções em `src/i18n/locales/pt.json` e `en.json`
- [ ] Testar responsividade (mobile, tablet, desktop)

---

**Última atualização:** 2026-01-12
**Versão:** 1.0
