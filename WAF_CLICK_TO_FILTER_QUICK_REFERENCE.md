# WAF Click-to-Filter - Quick Reference

## 🎯 Funcionalidade

Clique nos cards de métricas para filtrar eventos automaticamente.

---

## 📊 Cards Clicáveis

| Card | Filtro Aplicado | Resultado |
|------|-----------------|-----------|
| **Critical Threats** | `severity: 'critical'` | Mostra apenas eventos críticos |
| **High Threats** | `severity: 'high'` | Mostra apenas eventos de alta severidade |
| **Blocked Requests** | `action: 'BLOCK'` | Mostra apenas requisições bloqueadas |
| **Active Campaigns** | `campaign: true` | Mostra apenas eventos de campanhas |
| **Total Requests** | Nenhum | ❌ Não clicável |
| **Unique Attackers** | `action: 'BLOCK'` | Mostra IPs bloqueados |

---

## 🎨 Visual Feedback

### Card Clicável (valor > 0)
- ✅ Cursor: `pointer` (mãozinha)
- ✅ Hover: Zoom 105% + sombra
- ✅ Texto: "Clique para filtrar"

### Card Não Clicável (valor = 0)
- ❌ Cursor: Normal
- ❌ Hover: Apenas sombra
- ❌ Texto: Nenhum

---

## 🔄 Fluxo de Uso

1. **Usuário vê**: "Critical Threats 1" no card
2. **Usuário clica**: No card
3. **Sistema muda**: Para aba "Eventos"
4. **Sistema filtra**: Mostra apenas eventos com severity "critical"
5. **Usuário vê**: Lista filtrada de eventos críticos

---

## 💻 Código Exemplo

### Clicar em Card
```typescript
// WafMetricsCards.tsx
<Card 
  className="cursor-pointer hover:scale-105"
  onClick={() => onCardClick({ severity: 'critical' })}
>
  <CardTitle>Critical Threats</CardTitle>
  <div className="text-2xl">1</div>
  <p className="text-xs">Clique para filtrar</p>
</Card>
```

### Handler de Clique
```typescript
// WafMonitoring.tsx
const handleMetricCardClick = (filter) => {
  setActiveTab('events'); // Muda para aba de eventos
  setExternalEventFilters(filter); // Aplica filtro
};
```

### Filtrar Eventos
```typescript
// WafEventsFeed.tsx
const filteredEvents = events.filter(event => {
  if (externalSeverityFilter) {
    return event.severity === externalSeverityFilter;
  }
  if (externalActionFilter) {
    return event.action === externalActionFilter;
  }
  if (externalCampaignFilter) {
    return event.is_campaign === true;
  }
  return true;
});
```

---

## 🧪 Testes

### Teste 1: Critical Threats
```
1. Clicar em "Critical Threats 1"
2. ✅ Muda para aba "Eventos"
3. ✅ Mostra apenas eventos com severity "critical"
4. ✅ Filtro de severidade = "critical"
```

### Teste 2: Blocked Requests
```
1. Clicar em "Blocked Requests 45"
2. ✅ Muda para aba "Eventos"
3. ✅ Mostra apenas eventos com action "BLOCK"
4. ✅ Filtro de ação = "BLOCK"
```

### Teste 3: Card com Valor 0
```
1. Ver card "Critical Threats 0"
2. ✅ Sem cursor pointer
3. ✅ Sem texto "Clique para filtrar"
4. ✅ Clicar não faz nada
```

---

## 📱 Responsividade

- **Desktop**: Grid 6 colunas (todos os cards visíveis)
- **Tablet**: Grid 3 colunas (2 linhas)
- **Mobile**: Grid 2 colunas (3 linhas)

Todos os cards mantêm funcionalidade de clique em todos os tamanhos de tela.

---

## 🌐 Traduções

### Português
```json
"waf": {
  "clickToFilter": "Clique para filtrar"
}
```

### English
```json
"waf": {
  "clickToFilter": "Click to filter"
}
```

---

## 🚀 Deploy Status

- ✅ Frontend: Deployado em S3
- ✅ CloudFront: Cache invalidado (Status: Completed)
- ✅ Traduções: PT e EN completas
- ✅ Testes: Funcionando em produção

**URL:** https://evo.ai.udstec.io/waf-monitoring

---

**Última atualização:** 2026-01-17  
**Versão:** 1.0
