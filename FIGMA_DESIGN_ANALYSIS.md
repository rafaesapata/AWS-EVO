# Análise do Design Figma - EVO Interface

## 📋 Informações do Arquivo

**Figma File:** EVO - Interface  
**URL:** https://www.figma.com/design/909Nysrfi4pKGgKOkD5Csn/EVO---Interface?node-id=1-2  
**Versão:** 2310484658241380878  
**Data de Análise:** 2026-01-18

---

## 🎨 Design System Observado

### Paleta de Cores

**Cores Principais:**
- Background Principal: `#F1F3F7` (cinza muito claro)
- Cards: `#FFFFFF` (branco puro)
- Primary Blue: `#00B2FF` (azul claro vibrante)
- Success Green: `#5EB10B` (verde para economia)
- Text Primary: `#393939` (cinza escuro)
- Text Secondary: `#5F5F5F` (cinza médio)
- Border/Stroke: Gradiente branco para `#CBCDE5`

**Observação:** A paleta é mais clara e vibrante do que a implementação atual.

### Tipografia

**Fonte:** Inter (Light, Regular, Extra Light)

**Hierarquia:**
- Título Principal: 30px, Light (300)
- Subtítulo/Data: 16px, Light (300)
- Labels de Cards: 16px, Light (300)
- Valores Grandes: 35px, Extra Light (200)
- Valores Médios: 25px, Extra Light (200)
- Valores Pequenos: 16px, Extra Light (200)
- Texto Auxiliar: 14px, Light (300)
- Texto Pequeno: 12px, Light (300)
- Texto Uppercase: 11px, Light (300), UPPERCASE

**Observação:** Uso consistente de pesos leves (200-300) para aparência clean.

---

## 📊 Seção: Resumo Executivo (Performance Metrics)

### Layout Observado no Figma

**Estrutura:** Grid 2x2 com 4 cards principais

```
┌─────────────────┐  ┌─────────────────┐
│ Score de Saúde  │  │ SLA de Uptime   │
│                 │  │                 │
│    79/100       │  │    66.70%       │
│                 │  │                 │
│ [Otimizar →]    │  │ Meta: 99.9%     │
└─────────────────┘  └─────────────────┘

┌─────────────────┐  ┌─────────────────┐
│ Gasto MTD       │  │ Potencial de    │
│                 │  │ Economia        │
│ $4,697 (83%)    │  │                 │
│ [Progress Bar]  │  │ $30,960/ano     │
│                 │  │ $2,580/mês      │
└─────────────────┘  └─────────────────┘
```

### Card 1: Score de Saúde

**Elementos:**
- Título: "Score de Saúde" (16px, Light)
- Ícone: Info (?) no canto superior direito
- Visual: Círculo de progresso (donut chart)
  - Cor: Azul `#00B2FF`
  - Stroke: 6px
  - Background: Cinza claro com 10% opacidade
- Valor Central: "79/100"
  - "79": 35px, Extra Light
  - "/100": 35px, Regular
- Texto Descritivo: "Loren ipsun sit dolor..." (12px, Light, cinza)
- CTA: "Otimizar saúde →" (12px, Light, centralizado)

**Diferenças da Implementação Atual:**
- ❌ Falta o círculo de progresso visual (donut chart)
- ❌ Falta o texto descritivo abaixo do valor
- ❌ Falta o CTA "Otimizar saúde →"
- ✅ Ícone de info presente (mas posicionamento diferente)

### Card 2: SLA de Uptime

**Elementos:**
- Título: "SLA de Uptime" (16px, Light)
- Ícone: Info (?) no canto superior direito
- Valor Principal: "66.70%" (35px, Extra Light)
- Meta: "Meta: 99.9%" (14px, Light, cinza)

**Diferenças da Implementação Atual:**
- ✅ Estrutura similar
- ⚠️ Valor menor (text-5xl vs 35px)
- ❌ Falta espaçamento vertical adequado

### Card 3: Gasto MTD

**Elementos:**
- Título: "Gasto MTD" (16px, Light)
- Ícone: Info (?) no canto superior direito
- Valor Principal: "$4,697" (35px, Extra Light, azul)
- Porcentagem: "(83%)" (16px, Light, cinza, alinhado à direita)
- Barra de Progresso:
  - Background: Cinza `#E9E9E9`
  - Fill: Azul `#00B2FF`
  - Height: 8px
  - Border Radius: 15px
- Label da Barra: "Orçamento" (12px, Light, azul)

**Diferenças da Implementação Atual:**
- ✅ Estrutura similar
- ⚠️ Porcentagem posicionada diferente (direita vs abaixo)
- ⚠️ Barra de progresso mais fina (8px vs atual)
- ❌ Valor não está em azul

### Card 4: Potencial de Economia

**Elementos:**
- Título: "Potencial de Economia" (16px, Light)
- Ícone: Info (?) no canto superior direito
- Valor Anual: "$30,960/ano"
  - "$30,960": 35px, Extra Light, verde `#5EB10B`
  - "/ano": 20px, Extra Light
- Valor Mensal: "$2,580/mês" (16px, Extra Light)
- CTA: "Aumentar economia →" (12px, Light, alinhado à direita)

**Diferenças da Implementação Atual:**
- ✅ Estrutura similar
- ❌ Falta valor anual destacado
- ❌ Falta CTA "Aumentar economia →"
- ⚠️ Cores diferentes (verde mais vibrante no Figma)

---

## 📊 Seção: Alertas Ativos

### Layout Observado no Figma

**Card Separado Abaixo dos 4 Cards Principais**

**Elementos:**
- Título: "Alertas Ativos" (16px, Light, centralizado)
- Ícone: Info (?) no canto superior direito
- 3 Contadores em Grid Horizontal:

```
┌─────────┬─────────┬─────────┐
│   447   │   134   │    54   │
│  MÉDIO  │  ALTO   │ CRÍTICO │
└─────────┴─────────┴─────────┘
```

**Contador Individual:**
- Número: 25px, Extra Light
- Label: 11px, Light, UPPERCASE, cinza
- Espaçamento vertical entre número e label

**CTA:** "Ver alertas →" (12px, Light, alinhado à direita)

**Diferenças da Implementação Atual:**
- ✅ Estrutura similar (banner separado)
- ⚠️ Layout diferente (grid horizontal vs badges inline)
- ❌ Falta CTA "Ver alertas →"
- ⚠️ Números menores no Figma (25px vs 3xl atual)

---

## 🎯 Elementos Visuais Importantes

### 1. Ícones de Info (?)

**Posicionamento:** Canto superior direito de cada card  
**Estilo:** Círculo com "?" dentro  
**Cor:** Cinza `#A5A5A5`  
**Tamanho:** ~10px

**Implementação Sugerida:**
```tsx
<div className="absolute top-4 right-4">
  <HelpCircle className="h-4 w-4 text-gray-400" />
</div>
```

### 2. Círculo de Progresso (Donut Chart)

**Card:** Score de Saúde  
**Características:**
- Stroke Width: 6px
- Cor Ativa: `#00B2FF`
- Cor Background: `#00B2FF` com 10% opacidade
- Rotação: -120° (início no topo esquerdo)
- Tamanho: ~270px diâmetro

**Biblioteca Sugerida:** Recharts ou custom SVG

### 3. Barra de Progresso

**Card:** Gasto MTD  
**Características:**
- Height: 8px
- Border Radius: 15px (totalmente arredondado)
- Background: `#E9E9E9`
- Fill: `#00B2FF`
- Transição suave

### 4. CTAs (Call to Actions)

**Estilo Consistente:**
- Texto: 12px, Light (300)
- Cor: Cinza escuro `#484848`
- Seta: "→"
- Hover: Sublinhado ou mudança de cor

**Exemplos:**
- "Otimizar saúde →"
- "Aumentar economia →"
- "Ver alertas →"

---

## 📐 Espaçamento e Layout

### Grid Principal

**Gap entre Cards:** ~24px (gap-6)  
**Padding dos Cards:** ~20px (p-5)  
**Border Radius:** 15px (rounded-2xl)

### Hierarquia Vertical

```
Título do Card
  ↓ 12px
Valor Principal
  ↓ 8px
Valor Secundário / Meta
  ↓ 16px
Elemento Visual (barra, etc)
  ↓ 8px
Label / CTA
```

### Alinhamento

- **Títulos:** Esquerda
- **Valores Principais:** Esquerda (exceto Score de Saúde que é centralizado)
- **CTAs:** Variável (centro ou direita)
- **Ícones de Info:** Sempre canto superior direito

---

## 🎨 Efeitos e Sombras

### Cards

**Background:** Branco `#FFFFFF`  
**Border:** Gradiente sutil
- Start: `#FFFFFF`
- End: `#CBCDE5`
- Opacity: 80%

**Shadow:**
- Color: `#CFD4DF` com 85% opacidade
- Blur: 8.1px
- Offset: 0, 0
- Spread: 0

**Blur Effect:** Layer blur com radius 0 (desabilitado)

**Implementação Sugerida:**
```css
.card {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid;
  border-image: linear-gradient(
    135deg,
    rgba(255, 255, 255, 1) 0%,
    rgba(203, 205, 229, 1) 100%
  ) 1;
  box-shadow: 0 0 8.1px rgba(207, 212, 223, 0.85);
  border-radius: 15px;
}
```

---

## 🔄 Comparação: Implementação Atual vs Figma

### ✅ O que está correto:

1. Grid 2x2 / 4 colunas responsivo
2. Estrutura básica dos cards
3. Uso de ícones
4. Banner de alertas separado
5. Valores formatados corretamente

### ⚠️ O que precisa ajuste:

1. **Cores:** Azul mais vibrante (`#00B2FF` vs `#003C7D`)
2. **Tipografia:** Pesos mais leves (200-300 vs 300-400)
3. **Tamanhos:** Valores menores (35px vs text-5xl/48px)
4. **Espaçamento:** Mais compacto no Figma
5. **Sombras:** Mais sutis no Figma

### ❌ O que está faltando:

1. **Círculo de Progresso** no Score de Saúde
2. **Texto Descritivo** abaixo dos valores
3. **CTAs** nos cards ("Otimizar saúde →", "Aumentar economia →")
4. **Ícones de Info (?)** em todos os cards
5. **Valor Anual** destacado no Potencial de Economia
6. **CTA "Ver alertas →"** no banner de alertas

---

## 📝 Recomendações de Implementação

### Prioridade ALTA

1. **Adicionar Círculo de Progresso** no Score de Saúde
   - Usar Recharts ou SVG customizado
   - Stroke: 6px, cor `#00B2FF`

2. **Adicionar Ícones de Info (?)**
   - Usar `HelpCircle` do lucide-react
   - Posicionar no canto superior direito
   - Tooltip ao hover

3. **Adicionar CTAs nos Cards**
   - "Otimizar saúde →"
   - "Aumentar economia →"
   - "Ver alertas →"

### Prioridade MÉDIA

4. **Ajustar Cores**
   - Primary: `#00B2FF` (mais vibrante)
   - Success: `#5EB10B` (verde mais vibrante)
   - Background: `#F1F3F7`

5. **Ajustar Tipografia**
   - Reduzir tamanhos (35px para valores principais)
   - Usar pesos mais leves (200-300)

6. **Melhorar Sombras**
   - Sombras mais sutis
   - Border com gradiente

### Prioridade BAIXA

7. **Adicionar Textos Descritivos**
   - Placeholder text abaixo dos valores
   - Contexto adicional

8. **Refinar Espaçamento**
   - Reduzir padding interno
   - Ajustar gaps

---

## 🎯 Próximos Passos

1. Criar componente `DonutChart` para Score de Saúde
2. Criar componente `InfoIcon` reutilizável
3. Adicionar CTAs com navegação
4. Atualizar paleta de cores no design system
5. Ajustar tipografia (tamanhos e pesos)
6. Implementar sombras e borders do Figma
7. Adicionar textos descritivos (i18n)
8. Testar responsividade com novo layout

---

## 📚 Referências Técnicas

### Componentes Necessários

```tsx
// DonutChart.tsx
interface DonutChartProps {
  value: number;
  max: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}

// InfoIcon.tsx
interface InfoIconProps {
  tooltip?: string;
  className?: string;
}

// CardCTA.tsx
interface CardCTAProps {
  text: string;
  href: string;
  align?: 'left' | 'center' | 'right';
}
```

### Cores para Tailwind Config

```js
colors: {
  primary: {
    DEFAULT: '#00B2FF',
    dark: '#0090CC',
  },
  success: {
    DEFAULT: '#5EB10B',
    dark: '#4A8E09',
  },
  background: {
    DEFAULT: '#F1F3F7',
    card: '#FFFFFF',
  },
  text: {
    primary: '#393939',
    secondary: '#5F5F5F',
    muted: '#A5A5A5',
  },
}
```

---

**Última atualização:** 2026-01-18  
**Versão:** 1.0  
**Baseado em:** Figma file 909Nysrfi4pKGgKOkD5Csn
