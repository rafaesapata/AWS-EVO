# Correção da Ordenação de Recursos no Monitoramento

## Problema Identificado
A ordenação dos recursos no monitoramento não estava mostrando todos os recursos ativos primeiro, conforme prometido na descrição "recursos encontrados (ativos primeiro)".

## Causa Raiz
1. **Critério único de ordenação**: A ordenação usava apenas o status, sem critérios secundários
2. **Status incompletos**: Alguns status não estavam mapeados corretamente
3. **Ordenação instável**: Recursos com mesmo status não tinham ordem determinística

## Correções Implementadas

### 1. **Mapeamento de Status Expandido**
```typescript
const statusOrder: Record<string, number> = {
  'running': 0,      // Recursos ativos
  'active': 0,       // Recursos ativos  
  'available': 0,    // Recursos ativos
  'pending': 1,      // Recursos em transição
  'stopping': 1,     // Recursos em transição
  'stopped': 2,      // Recursos parados
  'terminated': 3,   // Recursos terminados
  'failed': 3,       // Recursos com falha
  'unknown': 4       // Status desconhecido
};
```

### 2. **Ordenação Multi-Critério**
Implementada ordenação com 3 níveis:

1. **Primeiro critério**: Status (ativos primeiro)
2. **Segundo critério**: Tipo de recurso (alfabético)
3. **Terceiro critério**: Nome do recurso (alfabético)

```typescript
return [...filtered].sort((a, b) => {
  // Primeiro critério: status (ativos primeiro)
  const aOrder = statusOrder[a.status?.toLowerCase()] ?? 4;
  const bOrder = statusOrder[b.status?.toLowerCase()] ?? 4;
  
  if (aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  
  // Segundo critério: tipo de recurso (alfabético)
  const typeComparison = a.resource_type.localeCompare(b.resource_type);
  if (typeComparison !== 0) {
    return typeComparison;
  }
  
  // Terceiro critério: nome do recurso (alfabético)
  const aName = a.resource_name || a.resource_id || '';
  const bName = b.resource_name || b.resource_id || '';
  return aName.localeCompare(bName);
});
```

### 3. **Badges de Status Melhorados**
Implementada função para cores mais intuitivas:

```typescript
const getStatusBadgeVariant = (status: string) => {
  const statusLower = status?.toLowerCase();
  if (['running', 'active', 'available'].includes(statusLower)) {
    return 'default'; // Verde - Recursos ativos
  }
  if (['pending', 'stopping'].includes(statusLower)) {
    return 'outline'; // Amarelo/neutro - Em transição
  }
  if (['stopped', 'terminated', 'failed'].includes(statusLower)) {
    return 'destructive'; // Vermelho - Parados/com problema
  }
  return 'secondary'; // Cinza - Status desconhecido
};
```

### 4. **Descrição Visual Melhorada**
Atualizada a descrição para ser mais clara:

```typescript
<CardDescription>
  {filteredResources?.length || 0} recursos encontrados
  <span className="text-xs text-muted-foreground ml-2">
    (🟢 Ativos → 🟡 Parados → 🔴 Terminados)
  </span>
</CardDescription>
```

### 5. **Debug Logging**
Adicionado logging para verificar a ordenação:

```typescript
console.log('[ResourceMonitoring] Recursos ordenados:', 
  sorted.slice(0, 10).map(r => ({
    name: r.resource_name,
    type: r.resource_type,
    status: r.status,
    statusOrder: statusOrder[r.status?.toLowerCase()] ?? 4
  }))
);
```

## Resultado Esperado

Agora os recursos serão exibidos na seguinte ordem:

1. **🟢 Recursos Ativos** (`running`, `active`, `available`)
   - Ordenados por tipo (EC2, Lambda, RDS, etc.)
   - Depois por nome (alfabético)

2. **🟡 Recursos em Transição** (`pending`, `stopping`)
   - Ordenados por tipo e nome

3. **🔴 Recursos Parados/Terminados** (`stopped`, `terminated`, `failed`)
   - Ordenados por tipo e nome

4. **⚪ Status Desconhecido** (`unknown` ou outros)
   - Ordenados por tipo e nome

## Como Verificar

1. Acesse `/resource-monitoring`
2. Observe que recursos com status `active`, `running`, `available` aparecem primeiro
3. Dentro de cada grupo de status, recursos são ordenados por tipo e nome
4. As cores dos badges refletem o status:
   - Verde: Ativos
   - Amarelo: Em transição
   - Vermelho: Parados/com problema
   - Cinza: Desconhecido

## Logs de Debug

Para verificar a ordenação, abra o console do navegador e procure por:
```
[ResourceMonitoring] Recursos ordenados: [...]
```

Isso mostrará os primeiros 10 recursos com seus status e ordem de prioridade.

A correção garante que a promessa "ativos primeiro" seja cumprida de forma consistente e visualmente clara.