// Correção rápida para dados de custos zerados
// Execute no console (F12) e siga as instruções

console.log('🚀 Correção rápida de custos iniciada...');

// Função para verificar dados básicos
async function quickCheck() {
  try {
    // Verificar token
    const token = localStorage.getItem('auth_token') || localStorage.getItem('accessToken');
    if (!token) {
      console.error('❌ Faça login novamente - token não encontrado');
      return false;
    }

    // Verificar dados de custos com timeout curto
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch('/api/functions/query-table', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        table: 'daily_costs',
        count: true
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const count = data.count || 0;

    console.log(`💰 Registros de custos: ${count}`);

    if (count === 0) {
      console.log('\n🚨 PROBLEMA: Não há dados de custos!');
      console.log('\n🎯 SOLUÇÃO MANUAL:');
      console.log('1. Abra uma nova aba: https://evo.ai.udstec.io/app?tab=cost-analysis');
      console.log('2. Clique em "Busca Completa" ou "Atualizar"');
      console.log('3. Aguarde 5-10 minutos');
      console.log('4. Volte ao dashboard e recarregue');
      return false;
    } else {
      console.log('✅ Dados encontrados! Problema pode ser de cache.');
      console.log('\n🔄 Recarregando página em 3 segundos...');
      setTimeout(() => window.location.reload(), 3000);
      return true;
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
    
    if (error.name === 'AbortError') {
      console.log('⏱️ Timeout - servidor lento');
    } else if (error.message.includes('Failed to fetch')) {
      console.log('🌐 Problema de conectividade');
    }
    
    console.log('\n🆘 SOLUÇÕES ALTERNATIVAS:');
    console.log('1. Recarregue a página (Ctrl+F5)');
    console.log('2. Vá manualmente para: https://evo.ai.udstec.io/app?tab=cost-analysis');
    console.log('3. Execute a "Busca Completa" de custos');
    
    return false;
  }
}

// Executar verificação
quickCheck();