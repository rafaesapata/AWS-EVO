# Ordenação de Recursos por Quantidade de Dados

## Problema Identificado
Recursos sem dados detalhados (métricas) apareciam antes dos que tinham dados completos, dificultando a visualização dos recursos mais informativos.

## Solução Implementada

### **Nova Ordenação Multi-Critério**

A ordenação agora segue esta hierarquia:

1. **🟢 Status** (ativos primeiro)
2. **📊 Quantidade de Métricas** (mais dados primeiro)
3. **🔤 Tipo de Recurso** (alfabético)
4. **📝 Nome do Recurso** (alfabético)

### **Código da Ordenação**

```typescript
const sorted = [...filtered].sort((a, b) => {
  // Primeiro critério: status (ativos primeiro)
  const aOrder = statusOrder[a.status?.toLowerCase()] ?? 4;
  const bOrder = statusOrder[b.status?.toLowerCase()] ?? 4;
  
  if (aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  
  // Segundo critério: quantidade de métricas disponíveis
  const aMetrics = metrics?.filter(m => 
    m.resource_id === a.resource_id && m.resource_type === a.resource_type
  ) || [];
  const bMetrics = metrics?.filter(m => 
    m.resource_id === b.resource_id && m.resource_type === b.resource_type
  ) || [];
  
  const aMetricsCount = aMetrics.length;
  const bMetricsCount = bMetrics.length;
  
  if (aMetricsCount !== bMetricsCount) {
    return bMetricsCount - aMetricsCount; // Mais métricas primeiro
  }
  
  // Terceiro critério: tipo de recurso (alfabético)
  const typeComparison = a.resource_type.localeCompare(b.resource_type);
  if (typeComparison !== 0) {
    return typeComparison;
  }
  
  // Quarto critério: nome do recurso (alfabético)
  const aName = a.resource_name || a.resource_id || '';
  const bName = b.resource_name || b.resource_id || '';
  return aName.localeCompare(bName);
});
```

### **Indicadores Visuais Adicionados**

#### **1. Badge de Métricas**
Cada recurso com dados agora mostra um badge indicando quantas métricas possui:

```typescript
{resourceSpecificMetrics.length > 0 && (
  <Badge variant="secondary" className="text-xs">
    📊 {resourceSpecificMetrics.length}
  </Badge>
)}
```

#### **2. Descrição Atualizada**
```typescript
<CardDescription>
  {filteredResources?.length || 0} recursos encontrados
  <span className="text-xs text-muted-foreground ml-2">
    (🟢 Ativos → 📊 Com mais dados → 🔤 Por tipo)
  </span>
</CardDescription>
```

#### **3. Debug Logging Melhorado**
```typescript
console.log('[ResourceMonitoring] Recursos ordenados:', 
  sorted.slice(0, 10).map(r => {
    const resourceMetrics = metrics?.filter(m => 
      m.resource_id === r.resource_id && m.resource_type === r.resource_type
    ) || [];
    return {
      name: r.resource_name,
      type: r.resource_type,
      status: r.status,
      statusOrder: statusOrder[r.status?.toLowerCase()] ?? 4,
      metricsCount: resourceMetrics.length
    };
  })
);
```

## Resultado Esperado

### **Ordem de Exibição:**

1. **🟢 Recursos Ativos com Mais Dados**
   - Lambda com 5 métricas
   - EC2 com 4 métricas
   - RDS com 3 métricas
   - API Gateway com 2 métricas
   - Recursos sem métricas

2. **🟡 Recursos em Transição com Mais Dados**
   - Ordenados por quantidade de métricas
   - Depois por tipo e nome

3. **🔴 Recursos Parados com Mais Dados**
   - Ordenados por quantidade de métricas
   - Depois por tipo e nome

### **Benefícios:**

- ✅ **Recursos informativos primeiro**: Usuários veem imediatamente os recursos com dados completos
- ✅ **Indicador visual claro**: Badge mostra quantas métricas cada recurso possui
- ✅ **Ordenação estável**: Critérios múltiplos garantem ordem consistente
- ✅ **Debug facilitado**: Logs mostram contagem de métricas para troubleshooting

## Como Verificar

1. **Acesse** `/resource-monitoring`
2. **Observe** que recursos com badge "📊 X métricas" aparecem primeiro
3. **Verifique** que dentro do mesmo status, recursos com mais métricas vêm antes
4. **Confira** no console do navegador os logs de debug com contagem de métricas

## Exemplo de Ordenação

```
🟢 ACTIVE
├── lambda-function-1     📊 5 métricas
├── ec2-instance-1        📊 4 métricas  
├── rds-database-1        📊 3 métricas
├── api-gateway-1         📊 2 métricas
└── elb-loadbalancer-1    (sem métricas)

🟡 PENDING
├── ec2-instance-2        📊 2 métricas
└── lambda-function-2     (sem métricas)

🔴 STOPPED
├── ec2-instance-3        📊 1 métrica
└── rds-database-2        (sem métricas)
```

Esta implementação garante que os recursos mais informativos e úteis sejam priorizados na visualização, melhorando significativamente a experiência do usuário.