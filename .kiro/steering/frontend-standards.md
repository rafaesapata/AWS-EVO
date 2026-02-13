---
inclusion: fileMatch
fileMatchPattern: ['src/**/*.tsx', 'src/**/*.ts', 'src/components/**/*', 'src/pages/**/*']
---

# Frontend Standards

## Regras Obrigatórias
1. Usar componentes shadcn/ui existentes — nunca recriar Button, Card, Dialog, etc.
2. Todas as páginas com `<Layout title description icon>` — sem headers/sidebars custom
3. Glassmorphism: `glass` em cards/containers, `glass hover-glow` em buttons
4. Spacing: `space-y-6` vertical, `gap-6` grids, `p-6` padding
5. i18n: `useTranslation()` + `t()` — nunca hardcode strings. Atualizar `pt.json` E `en.json`

## Page Template

```tsx
import { Layout } from '@/components/Layout';
import { IconName } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function PageName() {
  const { t } = useTranslation();
  return (
    <Layout title={t('page.title', 'Title')} description={t('page.desc', 'Desc')} icon={<IconName className="h-4 w-4 text-white" />}>
      <div className="space-y-6">{/* content */}</div>
    </Layout>
  );
}
```

## CSS Classes

| Elemento | Classes |
|----------|---------|
| Card | `glass border-primary/20` |
| Button | `glass hover-glow` |
| TabsList | `glass` |
| Container | `space-y-6` |
| Grid | `grid gap-6 md:grid-cols-2 lg:grid-cols-3` |

Custom: `glass`, `hover-glow`, `bg-gradient-subtle`, `bg-gradient-primary`, `shadow-elegant`, `shadow-glow`

## Component Patterns

```tsx
// Card
<Card className="glass border-primary/20">
  <CardHeader><CardTitle>{t('title')}</CardTitle></CardHeader>
  <CardContent>{/* ... */}</CardContent>
</Card>

// Tabs
<Tabs value={tab} onValueChange={setTab}>
  <TabsList className="glass">
    <TabsTrigger value="t1">{t('tab1')}</TabsTrigger>
  </TabsList>
  <TabsContent value="t1" className="space-y-6">{/* ... */}</TabsContent>
</Tabs>
```

## Cores e Responsividade
- Cores semânticas: `primary`, `secondary`, `muted`, `accent`, `destructive`
- Responsive: `md:` (768px+), `lg:` (1024px+), `xl:` (1280px+)
- Ícones: sempre `lucide-react` com `h-4 w-4`

## Estrutura
```
src/components/ui/    — shadcn/ui (NÃO MODIFICAR)
src/components/       — Layout.tsx + componentes feature
src/pages/            — Páginas (DEVEM usar Layout)
src/i18n/locales/     — pt.json, en.json
src/lib/              — Utilitários
```

## 🎨 Referência Visual Obrigatória — Tela "Meu Perfil"

Toda tela nova DEVE seguir as orientações visuais implementadas na tela "Meu Perfil" (`src/pages/Profile.tsx`). Esta tela é a referência canônica de:
- Estrutura de layout com `<Layout>` e uso correto de ícones
- Organização em `<Tabs>` com `glass` effect
- Cards com `glass border-primary/20` e espaçamento `space-y-6`
- Formulários com labels, inputs e botões seguindo o design system
- Feedback visual (toasts, loading states, badges)
- Responsividade e grid layout
- Uso correto de i18n com `useTranslation()`

Antes de criar qualquer tela nova, leia `src/pages/Profile.tsx` como referência e replique os mesmos padrões visuais, de espaçamento, componentes e interação.

## ⛔ Erros Comuns
- Headers/sidebars custom → usar `<Layout>`
- Strings hardcoded → usar `t()`
- Sem glass effect → adicionar `glass` class
- Duplicar shadcn/ui → verificar `src/components/ui/` primeiro
- CSS custom → usar Tailwind + design system classes

## Figma
File: `https://www.figma.com/design/Jom0yrnksZYm6xvjZAcaTu/EVO?node-id=5776-15`
Usar como referência visual, mapear para shadcn/ui, não copiar código.
