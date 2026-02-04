---
inclusion: fileMatch
fileMatchPattern: ['src/**/*.tsx', 'src/**/*.ts', 'src/components/**/*', 'src/pages/**/*']
---

# Frontend Standards & Design System

## Core Principles (MANDATORY)

1. **Use existing shadcn/ui components** - Never create custom versions of Button, Card, Dialog, etc.
2. **Wrap all pages with `<Layout>`** - No custom headers, sidebars, or footers
3. **Apply glassmorphism styling** - Use `glass` class on cards and containers
4. **Follow spacing conventions** - `space-y-6` for vertical, `gap-6` for grids
5. **Internationalize all text** - Use `useTranslation()` hook, never hardcode strings

---

## Page Structure Template

```tsx
import { Layout } from '@/components/Layout';
import { IconName } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function PageName() {
  const { t } = useTranslation();

  return (
    <Layout
      title={t('page.title', 'Default Title')}
      description={t('page.description', 'Default description')}
      icon={<IconName className="h-4 w-4 text-white" />}
    >
      <div className="space-y-6">
        {/* Page content */}
      </div>
    </Layout>
  );
}
```

### Layout Props

| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| `title` | `string` | Sim | Título exibido no header |
| `description` | `string` | Sim | Descrição curta da página |
| `icon` | `ReactNode` | Recomendado | Ícone do Lucide com `h-4 w-4 text-white` |
| `children` | `ReactNode` | Sim | Conteúdo da página |

### O que o Layout Fornece

- **Sidebar** - Menu lateral com navegação
- **Header** - Título, descrição, ícone, seletor de conta cloud, idioma, tema, menu do usuário
- **Footer** - Rodapé minimalista
- **Estilos** - Classes `glass`, `bg-gradient-subtle`, etc.

---

## Required CSS Classes

| Element | Required Classes |
|---------|-----------------|
| Card | `glass border-primary/20` |
| Button | `glass hover-glow` |
| TabsList | `glass` |
| Page container | `space-y-6` |
| Grid layout | `grid gap-6 md:grid-cols-2` |

### Custom Classes Available

| Classe | Descrição |
|--------|-----------|
| `glass` | Efeito glassmorphism com blur |
| `hover-glow` | Efeito glow no hover |
| `bg-gradient-subtle` | Background gradiente sutil |
| `bg-gradient-primary` | Background gradiente primário |
| `shadow-elegant` | Sombra elegante |
| `shadow-glow` | Sombra com glow |
| `border-primary/20` | Borda primária com 20% opacidade |

---

## Component Patterns

### Card with Glass Effect
```tsx
<Card className="glass border-primary/20">
  <CardHeader>
    <CardTitle>{t('section.title')}</CardTitle>
    <CardDescription>{t('section.description')}</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

### Button with Icon
```tsx
<Button className="glass hover-glow">
  <Icon className="h-4 w-4 mr-2" />
  {t('button.text')}
</Button>
```

### Tabbed Interface
```tsx
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList className="glass">
    <TabsTrigger value="tab1">{t('tabs.tab1')}</TabsTrigger>
    <TabsTrigger value="tab2">{t('tabs.tab2')}</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1" className="space-y-6">
    {/* Content */}
  </TabsContent>
</Tabs>
```

---

## Internationalization (i18n)

```tsx
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();

// Usage with fallback
<h1>{t('page.title', 'Fallback Title')}</h1>
```

### Translation Files
- `src/i18n/locales/pt.json` - Portuguese (default)
- `src/i18n/locales/en.json` - English

**CRITICAL:** When adding new text, update BOTH language files.

---

## Spacing System

- **Vertical spacing:** `space-y-6` (1.5rem between children)
- **Grid gaps:** `gap-6` (1.5rem between grid items)
- **Card padding:** `p-6` (1.5rem internal padding)
- **Section margins:** `mb-6` or `mt-6` (1.5rem external spacing)

---

## Responsive Design

Use Tailwind responsive prefixes:
- `md:` - Tablet and up (768px+)
- `lg:` - Desktop and up (1024px+)
- `xl:` - Large desktop (1280px+)

**Example:** `grid gap-6 md:grid-cols-2 lg:grid-cols-3`

---

## Color System

Use semantic color names from `tailwind.config.ts`:
- `primary`, `secondary`, `muted`, `accent`, `destructive`
- `border`, `background`, `foreground`

**Usage:** `bg-primary`, `text-primary`, `border-primary/20`

---

## File Structure

```
src/
├── components/
│   ├── ui/              # shadcn/ui components (DO NOT MODIFY)
│   ├── Layout.tsx       # Main layout wrapper (USE ALWAYS)
│   └── ...              # Feature-specific components
├── pages/               # Page components (MUST use Layout)
├── i18n/locales/        # Translation files (pt.json, en.json)
└── lib/                 # Utilities and helpers
```

---

## ⛔ Common Mistakes (AVOID)

| ❌ ERRADO | ✅ CORRETO |
|-----------|-----------|
| Creating custom headers/sidebars | Use `<Layout>` |
| Hardcoded text strings | Use `t()` function |
| Inconsistent spacing | Use `space-y-6` and `gap-6` |
| Missing glass effect | Add `glass` class to cards/buttons |
| Duplicating shadcn/ui components | Check `src/components/ui/` first |
| Wrong icon sizing | Icons should be `h-4 w-4` |
| Forgetting translations | Update both language files |
| Writing custom CSS | Use Tailwind and design system classes |

---

## Pre-Implementation Checklist

- [ ] Page uses `<Layout>` wrapper with title, description, and icon
- [ ] All text uses `t()` function from `useTranslation()`
- [ ] Translations added to both `pt.json` and `en.json`
- [ ] Cards use `glass border-primary/20` classes
- [ ] Buttons use `glass hover-glow` classes
- [ ] Spacing uses `space-y-6` and `gap-6` patterns
- [ ] Icons from `lucide-react` with `h-4 w-4` sizing
- [ ] Using existing shadcn/ui components
- [ ] Responsive design tested (mobile, tablet, desktop)

---

## Figma Integration

**Figma File:** https://www.figma.com/design/Jom0yrnksZYm6xvjZAcaTu/EVO?node-id=5776-15

When implementing from Figma:
1. Treat as visual reference only - Don't copy code from Figma
2. Map to shadcn/ui components
3. Maintain visual parity
4. Adapt, don't replicate
5. Test responsiveness

---

**Última atualização:** 2026-02-03

