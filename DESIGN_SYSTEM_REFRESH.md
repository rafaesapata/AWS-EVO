# 🎨 Design System Refresh - EVO Platform

## Objetivo

Transformar a interface atual em um design mais elegante, minimalista e com hierarquia visual clara, seguindo os princípios:

- **Base neutra** com cinzas quentes ou azul acinzentado
- **Cores apenas para exceções** (alertas críticos, impacto positivo)
- **Tipografia mais leve** e elegante
- **Menos ícones** (apenas onde houver ação/alerta)
- **Hierarquia clara** (início, meio, fim)

---

## 1. Sistema de Cores Atualizado

### Paleta Base (Cinzas Quentes)

```css
/* Cinzas Neutros com Toque Quente */
--gray-50: #fafaf9;    /* Background principal */
--gray-100: #f5f5f4;   /* Background secundário */
--gray-200: #e7e5e4;   /* Borders sutis */
--gray-300: #d6d3d1;   /* Borders padrão */
--gray-400: #a8a29e;   /* Text muted */
--gray-500: #78716c;   /* Text secondary */
--gray-600: #57534e;   /* Text primary */
--gray-700: #44403c;   /* Text emphasis */
--gray-800: #292524;   /* Headings */
--gray-900: #1c1917;   /* Strong emphasis */

/* Azul Acinzentado (Alternativa) */
--slate-50: #f8fafc;
--slate-100: #f1f5f9;
--slate-200: #e2e8f0;
--slate-300: #cbd5e1;
--slate-400: #94a3b8;
--slate-500: #64748b;
--slate-600: #475569;
--slate-700: #334155;
--slate-800: #1e293b;
--slate-900: #0f172a;
```

### Cores de Exceção (Saturação Reduzida em 15%)

```css
/* Crítico/Erro - Vermelho Suave */
--red-50: #fef2f2;
--red-500: #dc2626;    /* Reduzido de #ef4444 */
--red-600: #b91c1c;

/* Alerta/Warning - Âmbar Suave */
--amber-50: #fffbeb;
--amber-500: #d97706;  /* Reduzido de #f59e0b */
--amber-600: #b45309;

/* Sucesso/Positivo - Verde Suave */
--green-50: #f0fdf4;
--green-500: #059669;  /* Reduzido de #10b981 */
--green-600: #047857;

/* Informação - Azul Suave */
--blue-50: #eff6ff;
--blue-500: #2563eb;   /* Reduzido de #3b82f6 */
--blue-600: #1d4ed8;
```

### Aplicação de Cores

| Elemento | Cor | Quando Usar |
|----------|-----|-------------|
| Background principal | `gray-50` | Todo o app |
| Cards | `white` com `gray-200` border | Containers |
| Texto primário | `gray-800` | Títulos, labels |
| Texto secundário | `gray-500` | Descrições, hints |
| Texto muted | `gray-400` | Timestamps, metadata |
| Alertas críticos | `red-500` | Apenas severidade CRITICAL |
| Alertas médios | `gray-600` + ícone | Severidade MEDIUM/LOW |
| Impacto positivo | `green-500` | Economia, melhorias |
| Borders | `gray-200` | Padrão (1px) |

---

## 2. Tipografia Atualizada

### Font Weights (Máximo 3 pesos)

```css
/* Usar APENAS estes 3 pesos */
--font-normal: 400;    /* Texto corrido, descrições */
--font-medium: 500;    /* Labels, subtítulos */
--font-semibold: 600;  /* Títulos de seção, números-chave */

/* ❌ EVITAR: 300, 700, 800, 900 */
```

### Hierarquia Tipográfica

```tsx
// Títulos de Página (H1)
<h1 className="text-2xl font-semibold text-gray-800">
  Dashboard Executivo
</h1>

// Títulos de Seção (H2)
<h2 className="text-lg font-medium text-gray-700">
  Visão Financeira
</h2>

// Títulos de Card (H3)
<h3 className="text-base font-medium text-gray-700">
  Custo Mensal
</h3>

// Labels
<span className="text-sm font-medium text-gray-600">
  Total de Recursos
</span>

// Texto Corrido
<p className="text-sm font-normal text-gray-500">
  Descrição ou informação adicional
</p>

// Números-Chave (Destaque)
<span className="text-3xl font-semibold text-gray-800">
  $2,450
</span>

// Metadata (Timestamps, etc)
<span className="text-xs font-normal text-gray-400">
  Há 2 horas
</span>
```

### Regras de Uso

- **Números grandes**: `font-semibold` (não `font-bold`)
- **Títulos**: `font-medium` ou `font-semibold`
- **Texto corrido**: `font-normal`
- **Métricas puras**: SEM ícone, apenas número + label

---

## 3. Componentes Atualizados

### 3.1. Cards

```tsx
// Card Padrão - Minimalista
<Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
  <CardHeader className="pb-3">
    <CardTitle className="text-base font-medium text-gray-700">
      Título do Card
    </CardTitle>
  </CardHeader>
  <CardContent>
    {/* Conteúdo */}
  </CardContent>
</Card>

// Card de Métrica (SEM ícone)
<Card className="bg-white border border-gray-200">
  <CardContent className="p-6">
    <div className="space-y-1">
      <p className="text-sm font-medium text-gray-600">Custo Mensal</p>
      <p className="text-3xl font-semibold text-gray-800">$2,450</p>
      <p className="text-xs text-gray-400">vs. mês anterior</p>
    </div>
  </CardContent>
</Card>

// Card de Alerta Crítico (COM ícone)
<Card className="bg-white border border-red-200">
  <CardContent className="p-4">
    <div className="flex items-start gap-3">
      <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-sm font-medium text-gray-800">S3 Bucket público</p>
        <p className="text-xs text-gray-500">Há 2 horas</p>
      </div>
    </div>
  </CardContent>
</Card>
```

### 3.2. Badges

```tsx
// Badge Crítico
<Badge className="bg-red-50 text-red-600 border-red-200 font-normal">
  Critical
</Badge>

// Badge Médio (Cinza + Ícone)
<Badge className="bg-gray-100 text-gray-600 border-gray-200 font-normal">
  <AlertCircle className="h-3 w-3 mr-1" />
  Medium
</Badge>

// Badge Sucesso
<Badge className="bg-green-50 text-green-600 border-green-200 font-normal">
  Ativo
</Badge>

// Badge Neutro
<Badge className="bg-gray-100 text-gray-600 border-gray-200 font-normal">
  12 recursos
</Badge>
```

### 3.3. Progress Bars

```tsx
// Progress Minimalista (1 cor dominante)
<div className="space-y-2">
  <div className="flex justify-between items-center">
    <span className="text-sm font-medium text-gray-600">EC2 Instances</span>
    <span className="text-sm font-normal text-gray-500">$1,580</span>
  </div>
  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
    <div 
      className="h-full bg-gray-600 rounded-full transition-all"
      style={{ width: '65%' }}
    />
  </div>
</div>

// Progress com Destaque (apenas série principal)
<div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
  <div className="h-full bg-blue-500 rounded-full" style={{ width: '85%' }} />
</div>
```

### 3.4. Botões

```tsx
// Botão Primário
<Button className="bg-gray-800 hover:bg-gray-900 text-white font-medium">
  Iniciar Scan
</Button>

// Botão Secundário
<Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50 font-medium">
  Cancelar
</Button>

// Botão Destrutivo
<Button className="bg-red-500 hover:bg-red-600 text-white font-medium">
  Remover
</Button>

// Botão Sucesso
<Button className="bg-green-500 hover:bg-green-600 text-white font-medium">
  Aplicar Economia
</Button>
```

---

## 4. Layout e Espaçamento

### 4.1. Borders e Sombras

```css
/* Borders - Mais finos */
border: 1px solid theme('colors.gray.200');
border-radius: 8px; /* Reduzido de 12px */

/* Sombras - Mais sutis */
box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.04); /* Reduzido de 0.05 */

/* Hover */
box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.08); /* Reduzido de 0.1 */
```

### 4.2. Agrupamento de Cards

```tsx
// Container Maior para Cards Relacionados
<div className="bg-white border border-gray-200 rounded-lg p-6">
  <h2 className="text-lg font-medium text-gray-700 mb-4">Visão Financeira</h2>
  
  <div className="grid grid-cols-3 gap-4">
    {/* Cards internos SEM border, apenas divisor */}
    <div className="space-y-1">
      <p className="text-sm font-medium text-gray-600">Custo Total</p>
      <p className="text-2xl font-semibold text-gray-800">$2,450</p>
    </div>
    
    <div className="space-y-1 border-l border-gray-200 pl-4">
      <p className="text-sm font-medium text-gray-600">Economia</p>
      <p className="text-2xl font-semibold text-green-600">$340</p>
    </div>
    
    <div className="space-y-1 border-l border-gray-200 pl-4">
      <p className="text-sm font-medium text-gray-600">Desperdício</p>
      <p className="text-2xl font-semibold text-gray-800">$180</p>
    </div>
  </div>
</div>
```

### 4.3. Hierarquia Visual (Início, Meio, Fim)

```tsx
// INÍCIO - Como a infraestrutura está hoje
<section className="space-y-4">
  <h2 className="text-lg font-medium text-gray-700">Estado Atual</h2>
  
  <div className="grid grid-cols-4 gap-4">
    {/* Métricas principais */}
  </div>
</section>

// MEIO - Onde estão os riscos/desperdícios
<section className="space-y-4 mt-8">
  <h2 className="text-lg font-medium text-gray-700">Riscos e Oportunidades</h2>
  
  <div className="grid grid-cols-2 gap-4">
    {/* Alertas e recomendações */}
  </div>
</section>

// FIM - O que pode ser feito agora
<section className="space-y-4 mt-8">
  <h2 className="text-lg font-medium text-gray-700">Ações Recomendadas</h2>
  
  <div className="space-y-3">
    {/* Lista de ações com botões */}
  </div>
</section>
```

---

## 5. Gráficos

### Regras para Gráficos

```tsx
// 1 cor dominante por gráfico
const chartConfig = {
  primary: {
    color: 'rgb(75, 85, 99)', // gray-600
    strokeWidth: 1.5, // Reduzido de 2px
  },
  secondary: {
    color: 'rgb(209, 213, 219)', // gray-300 (resto em cinza)
    strokeWidth: 1.5,
  }
};

// Destacar apenas 1 série principal
<Line
  data={data}
  options={{
    elements: {
      line: {
        borderWidth: 1.5, // Mais fino
      },
      point: {
        radius: 3, // Pontos menores
      }
    }
  }}
/>
```

---

## 6. Ícones

### Quando Usar Ícones

| Situação | Usar Ícone? | Exemplo |
|----------|-------------|---------|
| Métrica pura | ❌ NÃO | "Custo Mensal: $2,450" |
| Ação (botão) | ✅ SIM | "Iniciar Scan" com Play icon |
| Alerta | ✅ SIM | AlertTriangle para crítico |
| Navegação | ✅ SIM | ChevronRight em links |
| Status | ✅ SIM | CheckCircle para sucesso |
| Número/Estatística | ❌ NÃO | "127 recursos" |

### Tamanho de Ícones

```tsx
// Ícones pequenos (padrão)
<Icon className="h-4 w-4" />

// Ícones em alertas
<AlertTriangle className="h-4 w-4 text-red-500" />

// Ícones em botões
<Button>
  <Play className="h-4 w-4 mr-2" />
  Iniciar
</Button>
```

---

## 7. Estados de Hover

### Hover com Mais Contraste

```css
/* Hover em cards */
.card-hover {
  transition: all 0.2s ease;
}

.card-hover:hover {
  border-color: theme('colors.gray.300'); /* Mais contraste */
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.08);
}

/* Hover em botões */
.button-hover {
  transition: all 0.2s ease;
}

.button-hover:hover {
  background-color: theme('colors.gray.900'); /* Mais escuro */
  transform: translateY(-1px);
}

/* Hover em links */
.link-hover {
  color: theme('colors.gray.600');
  transition: color 0.2s ease;
}

.link-hover:hover {
  color: theme('colors.gray.900'); /* Muito mais contraste */
}
```

---

## 8. Checklist de Implementação

### Para Cada Página

- [ ] Reduzir número de cards visíveis simultaneamente
- [ ] Agrupar informações por seções (Início, Meio, Fim)
- [ ] Usar base neutra (gray-50 ou slate-50)
- [ ] Cores apenas para exceções (crítico, sucesso)
- [ ] Reduzir saturação de cores em 15%
- [ ] Usar apenas 3 font-weights (400, 500, 600)
- [ ] Remover ícones de métricas puras
- [ ] Reduzir border-radius para 8px
- [ ] Reduzir sombras para 1px/4% opacidade
- [ ] Padronizar altura de cards, botões, inputs
- [ ] Gráficos com 1 cor dominante, linhas 1.5px
- [ ] Hover com mais contraste

---

## 9. Exemplo Completo: Dashboard Reformulado

Ver arquivo: `src/pages/DashboardRefreshed.tsx`

---

**Última atualização:** 2026-01-15  
**Versão:** 1.0  
**Status:** Pronto para implementação
