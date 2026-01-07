// Script para forçar a busca de custos
// Execute no console do navegador na página do sistema

async function forceCostFetch() {
  console.log('🚀 Forçando busca de custos...');
  
  try {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('accessToken');
    if (!token) {
      console.error('❌ Token não encontrado');
      return;
    }
    
    // 1. Buscar contas AWS ativas
    console.log('1️⃣ Buscando contas AWS...');
    const awsResponse = await fetch('/api/functions/query-table', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        table: 'aws_credentials',
        filters: { is_active: true }
      })
    });
    
    const awsData = await awsResponse.json();
    console.log('☁️ Contas encontradas:', awsData.data?.length || 0);
    
    if (!awsData.data || awsData.data.length === 0) {
      console.error('❌ Nenhuma conta AWS ativa encontrada');
      console.log('💡 Configure uma conta em: https://evo.ai.udstec.io/app?tab=aws-credentials');
      return;
    }
    
    // 2. Para cada conta, executar busca de custos
    for (const account of awsData.data) {
      console.log(`\n2️⃣ Buscando custos para: ${account.account_name} (${account.id})`);
      
      try {
        const fetchResponse = await fetch('/api/functions/fetch-daily-costs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            accountId: account.id,
            days: 90, // Buscar últimos 90 dias
            incremental: false // Busca completa
          })
        });
        
        if (!fetchResponse.ok) {
          console.error(`❌ Erro HTTP ${fetchResponse.status} para conta ${account.account_name}`);
          continue;
        }
        
        const fetchData = await fetchResponse.json();
        
        if (fetchData.error) {
          console.error(`❌ Erro para conta ${account.account_name}:`, fetchData.error);
          
          // Diagnóstico específico do erro
          const errorMsg = fetchData.error.toLowerCase();
          if (errorMsg.includes('assumerole') || errorMsg.includes('not authorized')) {
            console.log('🔧 PROBLEMA: Permissões AWS');
            console.log('   - Verifique a IAM Role');
            console.log('   - Verifique a Trust Policy');
            console.log('   - Verifique o External ID');
          } else if (errorMsg.includes('cost explorer')) {
            console.log('🔧 PROBLEMA: Cost Explorer não disponível');
            console.log('   - Verifique se Cost Explorer está habilitado na conta AWS');
          } else if (errorMsg.includes('timeout')) {
            console.log('🔧 PROBLEMA: Timeout');
            console.log('   - Tente novamente em alguns minutos');
          }
        } else {
          console.log(`✅ Sucesso para ${account.account_name}:`);
          console.log(`   - Registros processados: ${fetchData.summary?.totalRecords || 0}`);
          console.log(`   - Novos registros: ${fetchData.summary?.newRecords || 0}`);
          console.log(`   - Custo total: $${fetchData.summary?.totalCost || 0}`);
        }
        
      } catch (accountError) {
        console.error(`❌ Erro na conta ${account.account_name}:`, accountError);
      }
      
      // Aguardar um pouco entre as contas para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // 3. Verificar se dados foram inseridos
    console.log('\n3️⃣ Verificando dados inseridos...');
    const verifyResponse = await fetch('/api/functions/query-table', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        table: 'daily_costs',
        count: true
      })
    });
    
    const verifyData = await verifyResponse.json();
    console.log(`📊 Total de registros de custos: ${verifyData.count || 0}`);
    
    if (verifyData.count > 0) {
      console.log('\n✅ SUCESSO! Dados de custos foram inseridos.');
      console.log('🔄 Recarregue a página do dashboard para ver os dados atualizados.');
      
      // Opcional: recarregar a página automaticamente
      const reload = confirm('Deseja recarregar a página para ver os dados atualizados?');
      if (reload) {
        window.location.reload();
      }
    } else {
      console.log('\n❌ Nenhum dado foi inserido. Verifique os erros acima.');
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

// Executar
forceCostFetch();