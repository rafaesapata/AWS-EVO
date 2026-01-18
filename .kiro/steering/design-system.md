---
inclusion: fileMatch
fileMatchPattern: ['src/**/*.tsx', 'src/**/*.ts', 'src/components/**/*', 'src/pages/**/*']
---

# EVO Design System

## Core Principles (MANDATORY)

When creating or modifying UI components, you MUST:

1. **Use existing shadcn/ui components** - Never create custom versions of Button, Card, Dialog, etc.
2. **Wrap all pages with `<Layout>`** - No custom headers, sidebars, or footers
3. **Apply glassmorphism styling** - Use `glass` class on cards and containers
4. **Follow spacing conventions** - `space-y-6` for vertical, `gap-6` for grids
5. **Internationalize all text** - Use `useTranslation()` hook, never hardcode strings

## Page Structure Template

Every page component MUST follow this exact structure:

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

**What `<Layout>` provides automatically:**
- Sidebar navigation
- Header (title, description, icon, cloud account selector, language/theme toggles, user menu)
- Footer
- Responsive design
- Consistent styling

**NEVER create:** Custom headers, sidebars, footers, or navigation components.

## Required CSS Classes by Element

| Element | Required Classes | Example |
|---------|-----------------|---------|
| Card | `glass border-primary/20` | `<Card className="glass border-primary/20">` |
| Button | `glass hover-glow` | `<Button className="glass hover-glow">` |
| TabsList | `glass` | `<TabsList className="glass">` |
| Page container | `space-y-6` | `<div className="space-y-6">` |
| Grid layout | `grid gap-6 md:grid-cols-2` | `<div className="grid gap-6 md:grid-cols-2">` |

## Available Custom Classes

- `glass` - Glassmorphism effect with backdrop blur
- `hover-glow` - Glow effect on hover
- `bg-gradient-subtle` - Subtle gradient background
- `bg-gradient-primary` - Primary gradient background
- `shadow-elegant` - Elegant shadow
- `shadow-glow` - Shadow with glow effect
- `border-primary/20` - Primary border at 20% opacity

## Spacing System

Use these spacing values consistently:

- **Vertical spacing:** `space-y-6` (1.5rem between children)
- **Grid gaps:** `gap-6` (1.5rem between grid items)
- **Card padding:** `p-6` (1.5rem internal padding)
- **Section margins:** `mb-6` or `mt-6` (1.5rem external spacing)

## shadcn/ui Components (ALWAYS USE)

Located in `src/components/ui/` - DO NOT modify or duplicate these:

**Layout & Structure:**
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- `Dialog`, `AlertDialog`
- `Table`

**Interactive:**
- `Button`
- `Input`, `Textarea`, `Select`
- `Badge`

**Feedback:**
- `Skeleton` (loading states)

## Component Usage Patterns

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

## Internationalization (i18n)

### Required Pattern
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

## Typography

- **Page titles:** Use `<Layout title="">` prop (automatic styling)
- **Section headings:** Use `<CardTitle>` component
- **Descriptions:** Use `<CardDescription>` component
- **Body text:** Default styling (no class needed)
- **Small text:** `text-sm`
- **Muted text:** `text-muted-foreground`

## Color System

Use semantic color names from `tailwind.config.ts`:

- `primary` - Primary brand color
- `secondary` - Secondary brand color
- `muted` - Muted backgrounds
- `accent` - Accent highlights
- `destructive` - Error/danger states
- `border` - Border colors
- `background` - Page backgrounds
- `foreground` - Text colors

**Usage:** `bg-primary`, `text-primary`, `border-primary/20`

## Responsive Design

Use Tailwind responsive prefixes:

- `md:` - Tablet and up (768px+)
- `lg:` - Desktop and up (1024px+)
- `xl:` - Large desktop (1280px+)

**Example:** `grid gap-6 md:grid-cols-2 lg:grid-cols-3`

## Figma Integration

**Figma File:** https://www.figma.com/design/Jom0yrnksZYm6xvjZAcaTu/EVO?node-id=5776-15

When implementing from Figma:

1. **Treat as visual reference only** - Don't copy code from Figma
2. **Map to shadcn/ui components** - Use existing components that match the design
3. **Maintain visual parity** - Match colors, spacing, and layout
4. **Adapt, don't replicate** - Translate designs into project patterns
5. **Test responsiveness** - Ensure mobile, tablet, and desktop work

**Branding elements:**
- "IA-Powered Optimization Engine"
- "AWS Cost Shield"
- "Cloud Optimization Guaranteed"

## File Structure

```
src/
├── components/
│   ├── ui/              # shadcn/ui components (DO NOT MODIFY)
│   ├── Layout.tsx       # Main layout wrapper (USE ALWAYS)
│   ├── waf/            # WAF-specific components
│   ├── security/       # Security-specific components
│   ├── cost/           # Cost analysis components
│   └── ...             # Feature-specific components
├── pages/              # Page components (MUST use Layout)
├── i18n/
│   └── locales/        # Translation files (pt.json, en.json)
└── lib/                # Utilities and helpers
```

## Pre-Implementation Checklist

Before creating or modifying UI components:

- [ ] Page uses `<Layout>` wrapper with title, description, and icon
- [ ] All text uses `t()` function from `useTranslation()`
- [ ] Translations added to both `pt.json` and `en.json`
- [ ] Cards use `glass border-primary/20` classes
- [ ] Buttons use `glass hover-glow` classes
- [ ] Spacing uses `space-y-6` and `gap-6` patterns
- [ ] Icons from `lucide-react` with `h-4 w-4` sizing
- [ ] Using existing shadcn/ui components (not creating new ones)
- [ ] Responsive design tested (mobile, tablet, desktop)
- [ ] Matches Figma design visually (if applicable)

## Common Mistakes (AVOID)

1. ❌ Creating custom headers/sidebars → ✅ Use `<Layout>`
2. ❌ Hardcoded text strings → ✅ Use `t()` function
3. ❌ Inconsistent spacing → ✅ Use `space-y-6` and `gap-6`
4. ❌ Missing glass effect → ✅ Add `glass` class to cards/buttons
5. ❌ Duplicating shadcn/ui components → ✅ Check `src/components/ui/` first
6. ❌ Wrong icon sizing → ✅ Icons should be `h-4 w-4`
7. ❌ Forgetting translations → ✅ Update both language files
8. ❌ Writing custom CSS → ✅ Use Tailwind and design system classes

---

**Version:** 2.1  
**Last Updated:** 2026-01-18
