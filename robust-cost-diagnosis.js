// Diagnóstico robusto de custos com tratamento de erros
// Execute no console do navegador (F12) na página do sistema

async function robustCostDiagnosis() {
  console.log('🔍 Diagnóstico robusto de custos iniciado...');
  
  // Função auxiliar para fazer requisições com retry
  async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        console.log(`📡 Tentativa ${i + 1}/${maxRetries}: ${url}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        console.warn(`⚠️ Tentativa ${i + 1} falhou:`, error.message);
        
        if (i === maxRetries - 1) {
          throw error;
        }
        
        // Aguardar antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
      }
    }
  }
  
  try {
    // Verificar token
    const token = localStorage.getItem('auth_token') || 
                  localStorage.getItem('accessToken') || 
                  sessionStorage.getItem('auth_token');
    
    if (!token) {
      console.error('❌ Token de autenticação não encontrado');
      console.log('💡 Faça login novamente ou recarregue a página');
      return;
    }
    
    console.log('✅ Token encontrado');
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
    
    // 1. Verificar perfil do usuário
    console.log('\n1️⃣ Verificando perfil do usuário...');
    
    let organizationId;
    try {
      const profileData = await fetchWithRetry('/api/functions/query-table', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          table: 'profiles',
          select: ['organization_id', 'user_id', 'full_name']
        })
      });
      
      console.log('👤 Perfil:', profileData);
      
      if (!profileData.data || profileData.data.length === 0) {
        console.error('❌ Nenhum perfil encontrado');
        return;
      }
      
      organizationId = profileData.data[0].organization_id;
      console.log('🏢 Organization ID:', organizationId);
      
    } catch (error) {
      console.error('❌ Erro ao buscar perfil:', error.message);
      console.log('💡 Possíveis causas:');
      console.log('   - Sessão expirada (faça login novamente)');
      console.log('   - Problema de conectividade');
      console.log('   - Servidor indisponível');
      return;
    }
    
    // 2. Verificar contas AWS
    console.log('\n2️⃣ Verificando contas AWS...');
    
    let awsAccounts = [];
    try {
      const awsData = await fetchWithRetry('/api/functions/query-table', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          table: 'aws_credentials',
          filters: { 
            organization_id: organizationId,
            is_active: true 
          }
        })
      });
      
      awsAccounts = awsData.data || [];
      console.log(`☁️ Contas AWS ativas: ${awsAccounts.length}`);
      
      if (awsAccounts.length === 0) {
        console.log('⚠️ Nenhuma conta AWS ativa encontrada');
        console.log('💡 Configure uma conta em: https://evo.ai.udstec.io/app?tab=aws-credentials');
      } else {
        awsAccounts.forEach((acc, i) => {
          console.log(`   ${i + 1}. ${acc.account_name} (${acc.id})`);
        });
      }
      
    } catch (error) {
      console.error('❌ Erro ao buscar contas AWS:', error.message);
    }
    
    // 3. Verificar dados de custos
    console.log('\n3️⃣ Verificando dados de custos...');
    
    try {
      const costCount = await fetchWithRetry('/api/functions/query-table', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          table: 'daily_costs',
          filters: { organization_id: organizationId },
          count: true
        })
      });
      
      console.log(`💰 Total de registros de custos: ${costCount.count || 0}`);
      
      if (costCount.count === 0) {
        console.log('🚨 PROBLEMA IDENTIFICADO: Não há dados de custos no banco!');
        
        if (awsAccounts.length > 0) {
          console.log('\n4️⃣ Tentando buscar custos automaticamente...');
          
          const accountId = awsAccounts[0].id;
          console.log(`🎯 Usando conta: ${awsAccounts[0].account_name}`);
          
          try {
            const fetchResult = await fetchWithRetry('/api/functions/fetch-daily-costs', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                accountId: accountId,
                days: 30,
                incremental: false
              })
            }, 1); // Apenas 1 tentativa para não sobrecarregar
            
            console.log('⚡ Resultado da busca:', fetchResult);
            
            if (fetchResult.error) {
              console.error('❌ Erro na busca de custos:', fetchResult.error);
              
              // Diagnóstico do erro
              const errorMsg = fetchResult.error.toLowerCase();
              if (errorMsg.includes('assumerole') || errorMsg.includes('not authorized')) {
                console.log('\n🔧 DIAGNÓSTICO: Problema de permissões AWS');
                console.log('📋 Verifique:');
                console.log('   1. IAM Role tem permissões para Cost Explorer');
                console.log('   2. Trust Policy permite AssumeRole');
                console.log('   3. External ID está correto');
                console.log('\n📄 Permissões necessárias na IAM Role:');
                console.log('   - ce:GetCostAndUsage');
                console.log('   - ce:GetReservationUtilization');
                console.log('   - ce:GetSavingsPlansUtilization');
              } else if (errorMsg.includes('timeout')) {
                console.log('\n🔧 DIAGNÓSTICO: Timeout na requisição');
                console.log('💡 Tente novamente em alguns minutos');
              }
            } else {
              console.log('✅ Busca de custos executada com sucesso!');
              console.log('🔄 Recarregue a página para ver os dados atualizados');
            }
            
          } catch (fetchError) {
            console.error('❌ Erro ao executar busca de custos:', fetchError.message);
            console.log('💡 Tente manualmente: Dashboard > Análise de Custos > "Busca Completa"');
          }
        }
      } else {
        console.log('✅ Dados de custos encontrados no banco!');
        
        // Buscar alguns registros recentes
        try {
          const recentCosts = await fetchWithRetry('/api/functions/query-table', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              table: 'daily_costs',
              filters: { organization_id: organizationId },
              orderBy: { column: 'date', ascending: false },
              limit: 3
            })
          });
          
          console.log('📊 Registros recentes:');
          recentCosts.data?.forEach((cost, i) => {
            console.log(`   ${i + 1}. ${cost.date} - ${cost.service}: $${cost.cost}`);
          });
          
        } catch (error) {
          console.log('⚠️ Não foi possível buscar registros recentes');
        }
      }
      
    } catch (error) {
      console.error('❌ Erro ao verificar dados de custos:', error.message);
    }
    
    // Resumo final
    console.log('\n📋 RESUMO:');
    console.log(`- Organization ID: ${organizationId}`);
    console.log(`- Contas AWS: ${awsAccounts.length}`);
    console.log('- Status: ' + (awsAccounts.length > 0 ? '✅ Configurado' : '❌ Não configurado'));
    
    console.log('\n🎯 PRÓXIMOS PASSOS:');
    if (awsAccounts.length === 0) {
      console.log('1. Configure uma conta AWS em: https://evo.ai.udstec.io/app?tab=aws-credentials');
    } else {
      console.log('1. Vá para: https://evo.ai.udstec.io/app?tab=cost-analysis');
      console.log('2. Clique em "Busca Completa"');
      console.log('3. Aguarde o processamento (5-10 minutos)');
      console.log('4. Recarregue o dashboard');
    }
    
  } catch (error) {
    console.error('❌ Erro geral no diagnóstico:', error);
    console.log('\n🆘 SOLUÇÕES ALTERNATIVAS:');
    console.log('1. Recarregue a página (Ctrl+F5)');
    console.log('2. Limpe o cache do navegador');
    console.log('3. Faça logout e login novamente');
    console.log('4. Tente em uma aba anônima/privada');
  }
}

// Executar diagnóstico
console.log('🚀 Iniciando diagnóstico robusto...');
robustCostDiagnosis();