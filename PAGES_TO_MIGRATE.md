# 🔄 Páginas para Migração - Design Refresh

## Estratégia de Migração Rápida

Devido ao tamanho das páginas, vou aplicar mudanças incrementais usando `strReplace` para atualizar os estilos principais sem reescrever arquivos completos.

---

## 1. Cost Analysis Page

### Mudanças a Aplicar
- [ ] Background: `bg-gradient-subtle` → `bg-gray-50`
- [ ] Cards: `glass border-primary/20` → `bg-white border border-gray-200 shadow-sm`
- [ ] Badges: Atualizar para variantes minimalistas
- [ ] Progress bars: Reduzir altura e usar 1 cor
- [ ] Font-weights: `font-bold` → `font-semibold`
- [ ] Ícones: Remover de métricas puras

### Arquivo
`src/pages/CostAnalysisPage.tsx`

---

## 2. Security Posture

### Mudanças a Aplicar
- [ ] Background: `bg-gradient-subtle` → `bg-gray-50`
- [ ] Cards: `glass border-primary/20` → `bg-white border border-gray-200 shadow-sm`
- [ ] Alertas críticos: Manter vermelho
- [ ] Alertas médios/baixos: Mudar para cinza
- [ ] Remover ícones de métricas
- [ ] Agrupar cards relacionados

### Arquivo
`src/pages/SecurityPosture.tsx`

---

## 3. Executive Dashboard

### Mudanças a Aplicar
- [ ] Estruturar em 3 seções (Início, Meio, Fim)
- [ ] Agrupar métricas financeiras
- [ ] Reduzir número de cards visíveis
- [ ] Aplicar estilos minimalistas

### Arquivo
`src/components/dashboard/ExecutiveDashboard.tsx`

---

## 4. WAF Monitoring

### Mudanças a Aplicar
- [ ] Cards minimalistas
- [ ] Alertas em cinza/vermelho
- [ ] Remover efeitos glass

### Arquivo
`src/pages/WafMonitoring.tsx`

---

## 5. CloudTrail Audit

### Mudanças a Aplicar
- [ ] Cards minimalistas
- [ ] Eventos críticos em vermelho
- [ ] Resto em cinza

### Arquivo
`src/pages/CloudTrailAudit.tsx`

---

## 6. Monthly Invoices

### Mudanças a Aplicar
- [ ] Cards minimalistas
- [ ] Gráficos com 1 cor dominante
- [ ] Métricas sem ícones

### Arquivo
`src/pages/MonthlyInvoicesPage.tsx`

---

## Abordagem de Implementação

### Opção 1: Substituição Incremental (Recomendado)
Usar `strReplace` para atualizar classes CSS específicas em cada arquivo.

**Vantagens:**
- Rápido
- Menos risco de quebrar funcionalidade
- Mantém lógica existente

**Desvantagens:**
- Não reestrutura completamente
- Pode precisar de ajustes manuais depois

### Opção 2: Reescrita Completa
Reescrever cada página do zero seguindo o padrão do Dashboard.

**Vantagens:**
- Resultado final perfeito
- Estrutura otimizada

**Desvantagens:**
- Muito tempo (2-3 horas por página)
- Risco de quebrar funcionalidade
- Precisa testar extensivamente

---

## Decisão: Opção 1 (Substituição Incremental)

Vou aplicar mudanças CSS incrementais em todas as páginas agora, e depois podemos refinar individualmente se necessário.

---

## Padrões de Substituição

### 1. Background
```bash
# Buscar
bg-gradient-subtle

# Substituir por
bg-gray-50
```

### 2. Cards
```bash
# Buscar
glass border-primary/20

# Substituir por
bg-white border border-gray-200 shadow-sm
```

### 3. Font-weight
```bash
# Buscar
font-bold

# Substituir por
font-semibold
```

### 4. Text Size
```bash
# Buscar
text-4xl

# Substituir por
text-3xl
```

### 5. Badges Críticos
```bash
# Buscar
variant="destructive"

# Substituir por
className="bg-red-50 text-red-600 border-red-200 font-normal"
```

---

## Execução

Vou executar as substituições agora em todas as 6 páginas.
