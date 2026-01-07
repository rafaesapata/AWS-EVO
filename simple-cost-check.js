// Verificação simples e rápida dos dados de custos
// Execute no console do navegador (F12)

async function simpleCostCheck() {
  console.log('🔍 Verificação rápida de custos...');
  
  try {
    // Verificar token
    const token = localStorage.getItem('auth_token') || localStorage.getItem('accessToken');
    if (!token) {
      console.error('❌ Token não encontrado. Faça login novamente.');
      return;
    }
    
    // Headers para as requisições
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
    
    // 1. Verificar se há dados de custos
    console.log('1️⃣ Verificando dados de custos...');
    
    const response = await fetch('/api/functions/query-table', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        table: 'daily_costs',
        count: true
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const costCount = data.count || 0;
    
    console.log(`💰 Registros de custos encontrados: ${costCount}`);
    
    if (costCount === 0) {
      console.log('\n🚨 PROBLEMA: Não há dados de custos no sistema!');
      console.log('\n💡 SOLUÇÃO RÁPIDA:');
      console.log('1. Vá para: https://evo.ai.udstec.io/app?tab=cost-analysis');
      console.log('2. Clique no botão "Busca Completa" ou "Atualizar"');
      console.log('3. Aguarde 5-10 minutos para o processamento');
      console.log('4. Recarregue a página do dashboard');
      
      // 2. Verificar se há contas AWS configuradas
      console.log('\n2️⃣ Verificando contas AWS...');
      
      try {
        const awsResponse = await fetch('/api/functions/query-table', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            table: 'aws_credentials',
            filters: { is_active: true },
            count: true
          })
        });
        
        const awsData = await awsResponse.json();
        const awsCount = awsData.count || 0;
        
        console.log(`☁️ Contas AWS ativas: ${awsCount}`);
        
        if (awsCount === 0) {
          console.log('\n❌ PROBLEMA ADICIONAL: Nenhuma conta AWS configurada!');
          console.log('💡 Configure primeiro uma conta AWS em:');
          console.log('   https://evo.ai.udstec.io/app?tab=aws-credentials');
        }
        
      } catch (awsError) {
        console.log('⚠️ Não foi possível verificar contas AWS:', awsError.message);
      }
      
    } else {
      console.log('✅ Dados de custos encontrados!');
      console.log('\n🔍 Se o dashboard ainda mostra $0.00, pode ser um problema de cache.');
      console.log('💡 Tente:');
      console.log('1. Recarregar a página (Ctrl+F5)');
      console.log('2. Aguardar alguns segundos para os dados carregarem');
      console.log('3. Verificar se está na conta AWS correta (seletor no topo)');
    }
    
  } catch (error) {
    console.error('❌ Erro na verificação:', error.message);
    
    if (error.message.includes('Failed to fetch') || error.message.includes('Load failed')) {
      console.log('\n🌐 PROBLEMA DE CONECTIVIDADE:');
      console.log('1. Verifique sua conexão com a internet');
      console.log('2. Recarregue a página (Ctrl+F5)');
      console.log('3. Tente em uma aba anônima');
      console.log('4. Limpe o cache do navegador');
    } else if (error.message.includes('401') || error.message.includes('403')) {
      console.log('\n🔐 PROBLEMA DE AUTENTICAÇÃO:');
      console.log('1. Faça logout e login novamente');
      console.log('2. Verifique se sua sessão não expirou');
    } else {
      console.log('\n🆘 ERRO DESCONHECIDO:');
      console.log('1. Recarregue a página completamente');
      console.log('2. Tente novamente em alguns minutos');
    }
  }
}

// Executar verificação
simpleCostCheck();