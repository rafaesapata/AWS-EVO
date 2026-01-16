# 🔄 Guia de Migração - Design System Refresh

## Objetivo

Este guia ajuda a migrar páginas existentes para o novo design system minimalista e elegante.

---

## Passo a Passo de Migração

### 1. Importar CSS do Design Refresh

```tsx
// No topo do arquivo da página
import '@/styles/design-refresh.css';
```

### 2. Atualizar Background

```tsx
// ❌ ANTES
<div className="min-h-screen bg-gradient-subtle">

// ✅ DEPOIS
<div className="min-h-screen bg-gray-50">
```

### 3. Atualizar Cards

```tsx
// ❌ ANTES
<Card className="glass border-primary/20 shadow-elegant">
  <CardHeader>
    <CardTitle className="text-xl font-bold flex items-center gap-2">
      <DollarSign className="h-6 w-6 text-green-500" />
      Custo Mensal
    </CardTitle>
  </CardHeader>
  <CardContent>
    <p className="text-4xl font-bold text-primary">$2,450</p>
  </CardContent>
</Card>

// ✅ DEPOIS
<Card className="bg-white border border-gray-200 shadow-sm">
  <CardHeader className="pb-3">
    <CardTitle className="text-base font-medium text-gray-700">
      Custo Mensal
    </CardTitle>
  </CardHeader>
  <CardContent>
    <p className="text-3xl font-semibold text-gray-800">$2,450</p>
  </CardContent>
</Card>
```

**Mudanças:**
- Remover `glass` e `border-primary/20`
- Usar `bg-white border border-gray-200 shadow-sm`
- Remover ícone de métricas puras
- Reduzir font-weight de `bold` para `semibold`
- Reduzir tamanho de fonte de `text-4xl` para `text-3xl`

### 4. Atualizar Badges

```tsx
// ❌ ANTES
<Badge variant="destructive" className="font-bold">
  CRITICAL
</Badge>

// ✅ DEPOIS - Crítico
<Badge className="bg-red-50 text-red-600 border-red-200 font-normal">
  Critical
</Badge>

// ✅ DEPOIS - Médio (Cinza + Ícone)
<Badge className="bg-gray-100 text-gray-600 border-gray-200 font-normal">
  <AlertCircle className="h-3 w-3 mr-1" />
  Medium
</Badge>

// ✅ DEPOIS - Sucesso
<Badge className="bg-green-50 text-green-600 border-green-200 font-normal">
  Ativo
</Badge>
```

**Mudanças:**
- Remover `variant="destructive"`
- Usar cores específicas (red-50, green-50, gray-100)
- Mudar `font-bold` para `font-normal`
- Adicionar ícone apenas para alertas médios/baixos

### 5. Atualizar Progress Bars

```tsx
// ❌ ANTES
<Progress value={85} className="h-2 bg-primary/20" />

// ✅ DEPOIS
<div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
  <div 
    className="h-full bg-gray-600 rounded-full transition-all"
    style={{ width: '85%' }}
  />
</div>
```

**Mudanças:**
- Reduzir altura de `h-2` para `h-1.5`
- Usar `bg-gray-100` para track
- Usar `bg-gray-600` para barra (1 cor dominante)
- Remover cores múltiplas

### 6. Atualizar Botões

```tsx
// ❌ ANTES
<Button className="glass hover-glow font-bold">
  <Play className="h-5 w-5 mr-2" />
  Iniciar Scan
</Button>

// ✅ DEPOIS
<Button className="bg-gray-800 hover:bg-gray-900 text-white font-medium">
  <Play className="h-4 w-4 mr-2" />
  Iniciar Scan
</Button>
```

**Mudanças:**
- Remover `glass` e `hover-glow`
- Usar `bg-gray-800 hover:bg-gray-900`
- Mudar `font-bold` para `font-medium`
- Reduzir ícone de `h-5 w-5` para `h-4 w-4`

### 7. Atualizar Alertas

```tsx
// ❌ ANTES
<div className="border-l-4 border-red-500 pl-4 bg-red-50/50">
  <div className="flex items-center gap-2">
    <AlertTriangle className="h-5 w-5 text-red-500" />
    <h4 className="font-bold text-red-800">S3 Bucket público</h4>
  </div>
  <p className="text-sm text-red-600 mt-1">Detectado há 2 horas</p>
</div>

// ✅ DEPOIS - Crítico
<div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
  <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
  <div className="flex-1">
    <p className="text-sm font-medium text-gray-800">S3 Bucket público detectado</p>
    <p className="text-xs font-normal text-gray-500 mt-0.5">Há 2 horas</p>
  </div>
</div>

// ✅ DEPOIS - Médio (Cinza)
<div className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
  <AlertTriangle className="h-4 w-4 text-gray-600 mt-0.5 flex-shrink-0" />
  <div className="flex-1">
    <p className="text-sm font-medium text-gray-800">Security Group aberto</p>
    <p className="text-xs font-normal text-gray-500 mt-0.5">Há 4 horas</p>
  </div>
</div>
```

**Mudanças:**
- Remover `border-l-4`, usar `border` completo
- Adicionar `rounded-lg`
- Reduzir ícone de `h-5 w-5` para `h-4 w-4`
- Mudar `font-bold` para `font-medium`
- Alertas médios/baixos em cinza, não em cores

### 8. Remover Ícones de Métricas

```tsx
// ❌ ANTES - Métrica com ícone
<div className="flex items-center justify-between">
  <div>
    <p className="text-sm font-medium text-gray-600">Recursos AWS</p>
    <p className="text-2xl font-bold text-gray-900">127</p>
  </div>
  <Server className="h-8 w-8 text-purple-500" />
</div>

// ✅ DEPOIS - Métrica SEM ícone
<div className="space-y-1">
  <p className="text-sm font-medium text-gray-600">Recursos AWS</p>
  <p className="text-3xl font-semibold text-gray-800">127</p>
  <p className="text-xs font-normal text-gray-400">Monitorados</p>
</div>
```

**Mudanças:**
- Remover ícone completamente
- Adicionar contexto adicional (ex: "Monitorados")
- Reduzir font-weight

### 9. Agrupar Cards Relacionados

```tsx
// ❌ ANTES - Cards separados
<div className="grid grid-cols-3 gap-4">
  <Card className="glass">
    <CardContent>
      <p>Custo Total</p>
      <p>$2,450</p>
    </CardContent>
  </Card>
  <Card className="glass">
    <CardContent>
      <p>Economia</p>
      <p>$340</p>
    </CardContent>
  </Card>
  <Card className="glass">
    <CardContent>
      <p>Desperdício</p>
      <p>$180</p>
    </CardContent>
  </Card>
</div>

// ✅ DEPOIS - Container único com divisores
<Card className="bg-white border border-gray-200 shadow-sm">
  <CardHeader className="pb-4">
    <CardTitle className="text-base font-medium text-gray-700">
      Visão Financeira
    </CardTitle>
  </CardHeader>
  <CardContent>
    <div className="grid grid-cols-3 gap-6">
      <div className="space-y-1">
        <p className="text-sm font-medium text-gray-600">Custo Total</p>
        <p className="text-3xl font-semibold text-gray-800">$2,450</p>
      </div>
      
      <div className="space-y-1 border-l border-gray-200 pl-6">
        <p className="text-sm font-medium text-gray-600">Economia</p>
        <p className="text-3xl font-semibold text-green-600">$340</p>
      </div>
      
      <div className="space-y-1 border-l border-gray-200 pl-6">
        <p className="text-sm font-medium text-gray-600">Desperdício</p>
        <p className="text-3xl font-semibold text-gray-800">$180</p>
      </div>
    </div>
  </CardContent>
</Card>
```

**Mudanças:**
- Agrupar métricas relacionadas em 1 card
- Usar `border-l` para separar seções
- Adicionar título de seção

### 10. Estruturar em Início, Meio, Fim

```tsx
// ✅ ESTRUTURA RECOMENDADA
<main className="max-w-7xl mx-auto py-8 px-6 lg:px-8">
  <div className="space-y-8">
    
    {/* INÍCIO - Como está hoje */}
    <section className="space-y-4">
      <h2 className="text-lg font-medium text-gray-700">Estado Atual</h2>
      {/* Métricas principais */}
    </section>

    {/* MEIO - Riscos e oportunidades */}
    <section className="space-y-4">
      <h2 className="text-lg font-medium text-gray-700">Riscos e Oportunidades</h2>
      {/* Alertas e recomendações */}
    </section>

    {/* FIM - Ações */}
    <section className="space-y-4">
      <h2 className="text-lg font-medium text-gray-700">Ações Recomendadas</h2>
      {/* Lista de ações com botões */}
    </section>

  </div>
</main>
```

---

## Checklist de Migração por Página

### Para cada página, verificar:

- [ ] Importar `design-refresh.css`
- [ ] Background alterado para `bg-gray-50`
- [ ] Cards usando `bg-white border border-gray-200 shadow-sm`
- [ ] Remover `glass` e `border-primary/20`
- [ ] Ícones removidos de métricas puras
- [ ] Badges atualizados (cores específicas, `font-normal`)
- [ ] Progress bars com `h-1.5` e 1 cor dominante
- [ ] Botões com `font-medium` (não `font-bold`)
- [ ] Alertas críticos em vermelho, médios/baixos em cinza
- [ ] Cards relacionados agrupados em container único
- [ ] Estrutura em 3 seções (Início, Meio, Fim)
- [ ] Font-weights reduzidos (máximo 3: 400, 500, 600)
- [ ] Hover states com mais contraste

---

## Páginas Prioritárias para Migração

### Alta Prioridade (Usuário vê primeiro)

1. **Dashboard** (`src/pages/Dashboard.tsx`)
   - Página inicial, maior impacto visual
   - Usar `DashboardRefreshed.tsx` como referência

2. **Executive Dashboard** (`src/pages/ExecutiveDashboard.tsx`)
   - Dashboard para C-level, precisa ser elegante
   - Reduzir número de cards visíveis

3. **Security Posture** (`src/pages/SecurityPosture.tsx`)
   - Muitos cards coloridos, precisa simplificar
   - Alertas críticos em vermelho, resto em cinza

4. **Cost Analysis** (`src/pages/CostAnalysisPage.tsx`)
   - Gráficos com muitas cores, simplificar
   - Economia em verde, resto neutro

### Média Prioridade

5. **WAF Monitoring** (`src/pages/WafMonitoring.tsx`)
6. **CloudTrail Audit** (`src/pages/CloudTrailAudit.tsx`)
7. **Monthly Invoices** (`src/pages/MonthlyInvoicesPage.tsx`)
8. **AWS Settings** (`src/pages/AWSSettings.tsx`)

### Baixa Prioridade

9. Páginas de configuração
10. Páginas administrativas

---

## Exemplo Completo: Antes e Depois

### ANTES (Dashboard Atual)

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
  <Card className="glass border-primary/20">
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">Custo Mensal</p>
          <p className="text-2xl font-bold text-gray-900">$2,450</p>
          <div className="flex items-center mt-1">
            <TrendingUp className="h-4 w-4 text-red-500 mr-1" />
            <span className="text-sm text-red-500">12%</span>
          </div>
        </div>
        <DollarSign className="h-8 w-8 text-green-500" />
      </div>
    </CardContent>
  </Card>
  {/* Mais 3 cards similares... */}
</div>
```

### DEPOIS (Dashboard Refresh)

```tsx
<Card className="bg-white border border-gray-200 shadow-sm">
  <CardHeader className="pb-4">
    <CardTitle className="text-base font-medium text-gray-700">
      Visão Financeira
    </CardTitle>
  </CardHeader>
  <CardContent>
    <div className="grid grid-cols-4 gap-6">
      <div className="space-y-1">
        <p className="text-sm font-medium text-gray-600">Custo Mensal</p>
        <p className="text-3xl font-semibold text-gray-800">$2,450</p>
        <div className="flex items-center gap-1 mt-1">
          <TrendingUp className="h-3 w-3 text-red-500" />
          <span className="text-xs font-normal text-red-500">12% vs. anterior</span>
        </div>
      </div>
      {/* Mais 3 métricas com border-l... */}
    </div>
  </CardContent>
</Card>
```

**Melhorias:**
- 4 cards separados → 1 card agrupado
- Ícone DollarSign removido (métrica pura)
- `glass` → `bg-white border border-gray-200`
- `font-bold` → `font-semibold`
- Título de seção adicionado
- Divisores entre métricas

---

## Ferramentas de Ajuda

### Script de Busca e Substituição

```bash
# Encontrar todos os cards com glass
grep -r "className.*glass.*border-primary" src/pages/

# Encontrar badges com variant
grep -r 'variant="destructive"' src/pages/

# Encontrar font-bold
grep -r "font-bold" src/pages/
```

### Regex para Substituição

```regex
# Substituir glass por bg-white
glass border-primary/20
→
bg-white border border-gray-200 shadow-sm

# Substituir font-bold por font-semibold
font-bold
→
font-semibold

# Substituir text-4xl por text-3xl
text-4xl
→
text-3xl
```

---

## Suporte

Se tiver dúvidas durante a migração:

1. Consultar `DESIGN_SYSTEM_REFRESH.md` para referência completa
2. Ver `src/pages/DashboardRefreshed.tsx` como exemplo
3. Usar `src/styles/design-refresh.css` para classes utilitárias

---

**Última atualização:** 2026-01-15  
**Versão:** 1.0  
**Status:** Pronto para uso
