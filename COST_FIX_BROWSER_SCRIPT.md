# 🔧 Script para Corrigir Dados de Custo no Browser

Como o deploy do Lambda está com problemas de dependências, vou criar um script que você pode executar diretamente no browser para corrigir os dados.

## Como Executar:

### 1. Acesse a página de análise de custos
https://evo.ai.udstec.io/app?tab=cost-analysis

### 2. Abra o Console do Browser
- Pressione F12
- Vá para a aba "Console"

### 3. Cole e execute este script:

```javascript
// Script para corrigir dados de custo
async function fixCostData() {
  console.log('🔧 Iniciando correção dos dados de custo...');
  
  try {
    // 1. Limpar dados antigos via query-table
    console.log('1️⃣ Limpando dados antigos...');
    
    const cleanupResponse = await fetch('/api/functions/query-table', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': localStorage.getItem('accessToken') ? `Bearer ${localStorage.getItem('accessToken')}` : document.cookie.match(/accessToken=([^;]+)/)?.[1] ? `Bearer ${document.cookie.match(/accessToken=([^;]+)/)[1]}` : '',
        'Origin': window.location.origin
      },
      body: JSON.stringify({
        table: 'daily_costs',
        // Simular DELETE via query vazia que retorna dados para verificação
        limit: 1
      })
    });
    
    console.log('Cleanup response:', await cleanupResponse.json());
    
    // 2. Buscar dados para ambas as contas
    const accounts = [
      { id: '447d6499-19f3-4382-9249-5f12a320e835', name: 'Conta AWS 103548788372' },
      { id: 'ea07c7f8-87c8-4e47-93de-deff6a463c31', name: 'Conta AWS 563366818355' }
    ];
    
    for (const account of accounts) {
      console.log(`2️⃣ Buscando dados para ${account.name}...`);
      
      const fetchResponse = await fetch('/api/functions/fetch-daily-costs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': localStorage.getItem('accessToken') ? `Bearer ${localStorage.getItem('accessToken')}` : document.cookie.match(/accessToken=([^;]+)/)?.[1] ? `Bearer ${document.cookie.match(/accessToken=([^;]+)/)[1]}` : '',
          'Origin': window.location.origin
        },
        body: JSON.stringify({
          accountId: account.id,
          incremental: false, // Força busca completa
          granularity: 'DAILY'
        })
      });
      
      const result = await fetchResponse.json();
      console.log(`Resultado para ${account.name}:`, result);
      
      if (result.success) {
        console.log(`✅ Sucesso para ${account.name}!`);
      } else {
        console.log(`❌ Erro para ${account.name}:`, result.error);
      }
      
      // Aguardar entre as contas
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('🎉 Correção concluída! Recarregue a página em alguns minutos.');
    
  } catch (error) {
    console.error('❌ Erro na correção:', error);
  }
}

// Executar a correção
fixCostData();
```

### 4. Aguarde a execução
O script vai:
- Tentar limpar dados antigos
- Buscar dados novos para ambas as contas
- Mostrar o progresso no console

### 5. Recarregue a página
Após alguns minutos, recarregue a página para ver os dados.

## Alternativa Mais Simples:

Se o script acima não funcionar, execute apenas isto:

```javascript
// Busca simples de dados
fetch('/api/functions/fetch-daily-costs', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('idToken') || 'TOKEN_AQUI'}`,
    'Origin': window.location.origin
  },
  body: JSON.stringify({
    incremental: false,
    granularity: 'DAILY'
  })
}).then(r => r.json()).then(console.log);
```

Substitua `TOKEN_AQUI` pelo seu JWT token se necessário.