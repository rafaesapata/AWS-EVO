# 🔧 Correção do Gráfico de Tempo de Resposta - Endpoint Monitoring

## 🚨 Problema Identificado

O gráfico de "Tempo de Resposta" na página de Monitoramento de Endpoints apresentava os seguintes problemas:

### 1. **Eixo X (Tempo) Desordenado**
- Horários apareciam fora de ordem: `22:30, 22:20, 22:10, 22:00, 21:50...`
- Horários duplicados de diferentes períodos
- Impossível identificar tendências temporais

### 2. **Spikes Anormais**
- Picos súbitos de ~4500ms (4.5 segundos)
- Variações extremas sem contexto
- Dados de múltiplos endpoints misturados sem agregação

### 3. **Dados Não Agregados**
- O código original pegava dados de TODOS os endpoints e os misturava em um único array
- Sem ordenação por timestamp
- `.slice(0, 50)` pegava os primeiros 50 registros aleatórios, não os mais recentes

## 🔍 Causa Raiz

### Código Original (INCORRETO):

```typescript
const responseTimeData = endpoints?.flatMap(e => 
  (e.check_history || []).map(h => ({
    time: new Date(h.checked_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    response_time: h.response_time,
    availability: h.status === 'up' ? 100 : 0
  }))
).slice(0, 50) || [];
```

**Problemas:**
1. `flatMap` mistura dados de todos os endpoints sem ordenação
2. `toLocaleTimeString` cria strings de tempo que não são ordenáveis
3. `.slice(0, 50)` pega os primeiros 50, não os mais recentes
4. Nenhuma agregação por período de tempo

**Resultado:**
- Se Endpoint A tem check às 22:10 com 200ms
- E Endpoint B tem check às 22:10 com 4500ms
- Ambos aparecem como pontos separados no gráfico
- Criando spikes e confusão visual

## ✅ Solução Implementada

### Código Corrigido:

```typescript
const responseTimeData = (() => {
  if (!endpoints || endpoints.length === 0) return [];
  
  // 1. Coletar todos os checks de todos os endpoints
  const allChecks = endpoints.flatMap(e => 
    (e.check_history || []).map(h => ({
      timestamp: new Date(h.checked_at).getTime(), // Timestamp numérico para ordenação
      time: new Date(h.checked_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      response_time: h.response_time,
      availability: h.status === 'up' ? 100 : 0
    }))
  );
  
  // 2. Ordenar por timestamp (mais antigo primeiro)
  allChecks.sort((a, b) => a.timestamp - b.timestamp);
  
  // 3. Agrupar por minuto (média de todos os checks no mesmo minuto)
  const groupedByMinute = new Map<string, { response_times: number[], availabilities: number[] }>();
  
  allChecks.forEach(check => {
    const key = check.time;
    if (!groupedByMinute.has(key)) {
      groupedByMinute.set(key, { response_times: [], availabilities: [] });
    }
    groupedByMinute.get(key)!.response_times.push(check.response_time);
    groupedByMinute.get(key)!.availabilities.push(check.availability);
  });
  
  // 4. Calcular médias e criar array final
  const result = Array.from(groupedByMinute.entries()).map(([time, data]) => ({
    time,
    response_time: Math.round(data.response_times.reduce((sum, val) => sum + val, 0) / data.response_times.length),
    availability: Math.round(data.availabilities.reduce((sum, val) => sum + val, 0) / data.availabilities.length)
  }));
  
  // 5. Pegar últimos 50 pontos (mais recentes)
  return result.slice(-50);
})();
```

### Melhorias Implementadas:

1. **Ordenação Temporal Correta**
   - Usa `timestamp` numérico para ordenação precisa
   - Garante que o eixo X seja cronológico

2. **Agregação por Minuto**
   - Agrupa todos os checks do mesmo minuto
   - Calcula média de tempo de resposta
   - Elimina spikes causados por endpoints individuais

3. **Últimos 50 Pontos**
   - `.slice(-50)` pega os 50 mais recentes (não os primeiros)
   - Garante que o gráfico mostre dados atuais

4. **Tooltip Melhorado**
   - Formatação clara: `1205ms` em vez de `1205`
   - Label descritivo: "Tempo de Resposta"

5. **Descrição Clara**
   - Mudou de "Histórico recente" para "Média agregada de todos os endpoints (últimos 50 pontos)"
   - Deixa claro que é uma média, não dados individuais

## 📊 Resultado Esperado

### Antes:
```
Tempo (eixo X): 22:30, 22:20, 22:10, 22:00, 21:50 (desordenado)
Valores: 1000ms, 4500ms, 200ms, 1200ms, 300ms (spikes aleatórios)
```

### Depois:
```
Tempo (eixo X): 21:50, 22:00, 22:10, 22:20, 22:30 (ordenado)
Valores: 800ms, 850ms, 900ms, 820ms, 780ms (média suavizada)
```

## 🎯 Benefícios

1. **Visualização Clara**
   - Eixo X cronológico e legível
   - Tendências temporais visíveis

2. **Dados Agregados**
   - Média de todos os endpoints por minuto
   - Elimina ruído de endpoints individuais

3. **Performance**
   - Menos pontos no gráfico (50 em vez de potencialmente centenas)
   - Renderização mais rápida

4. **Contexto**
   - Descrição clara do que está sendo mostrado
   - Tooltip informativo

## 🔍 Verificação

Para verificar se a correção funcionou:

1. **Eixo X deve estar ordenado cronologicamente**
   - Horários devem aumentar da esquerda para direita
   - Sem horários duplicados ou fora de ordem

2. **Valores devem ser mais estáveis**
   - Sem spikes extremos (a menos que TODOS os endpoints estejam lentos)
   - Curva mais suave representando a média

3. **Tooltip deve mostrar**
   - Horário formatado: "Horário: 22:10"
   - Tempo de resposta: "1205ms"

## 📝 Notas Técnicas

### Por que agrupar por minuto?

- `toLocaleTimeString` com `{ hour: '2-digit', minute: '2-digit' }` retorna strings como "22:10"
- Múltiplos checks no mesmo minuto terão a mesma string
- Agrupamos por essa string e calculamos a média
- Isso suaviza os dados e torna o gráfico mais legível

### Por que `.slice(-50)` em vez de `.slice(0, 50)`?

- `.slice(0, 50)` pega os primeiros 50 elementos (mais antigos)
- `.slice(-50)` pega os últimos 50 elementos (mais recentes)
- Queremos mostrar dados recentes, não históricos

### E se houver apenas 1 endpoint?

- A lógica continua funcionando
- Apenas não haverá agregação (média de 1 valor = o próprio valor)
- Mas a ordenação temporal ainda será correta

## 🚀 Próximos Passos (Opcional)

Se quiser melhorar ainda mais:

1. **Filtro por Endpoint**
   - Adicionar dropdown para ver gráfico de endpoint específico
   - Manter opção "Todos" para média agregada

2. **Período de Tempo Configurável**
   - Permitir escolher: última hora, últimas 24h, última semana
   - Ajustar `.slice(-50)` dinamicamente

3. **Linha de Baseline**
   - Adicionar linha horizontal mostrando tempo de resposta "normal"
   - Destacar quando valores excedem baseline

4. **Alertas Visuais**
   - Marcar no gráfico quando alertas foram disparados
   - Correlacionar spikes com eventos

---

**Data da Correção:** 2026-01-16  
**Versão:** 1.0  
**Status:** ✅ Implementado e testado
