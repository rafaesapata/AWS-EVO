// Script para debugar dados de custos para rafael@uds.com.br
// Execute no console do navegador na página do sistema

async function debugCostData() {
  console.log('🔍 Investigando dados de custos para rafael@uds.com.br...');
  
  try {
    // 1. Verificar organização do usuário
    console.log('\n1️⃣ Verificando organização do usuário...');
    const orgResponse = await fetch('/api/functions/query-table', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token') || localStorage.getItem('accessToken')}`
      },
      body: JSON.stringify({
        table: 'profiles',
        filters: {},
        select: ['organization_id', 'user_id', 'full_name']
      })
    });
    
    const orgData = await orgResponse.json();
    console.log('👤 Perfil do usuário:', orgData);
    
    if (!orgData.data || orgData.data.length === 0) {
      console.error('❌ Nenhum perfil encontrado');
      return;
    }
    
    const organizationId = orgData.data[0].organization_id;
    console.log('🏢 Organization ID:', organizationId);
    
    // 2. Verificar contas AWS ativas
    console.log('\n2️⃣ Verificando contas AWS ativas...');
    const awsResponse = await fetch('/api/functions/query-table', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token') || localStorage.getItem('accessToken')}`
      },
      body: JSON.stringify({
        table: 'aws_credentials',
        filters: { 
          organization_id: organizationId,
          is_active: true 
        },
        select: ['id', 'account_name', 'account_id', 'is_active', 'created_at']
      })
    });
    
    const awsData = await awsResponse.json();
    console.log('☁️ Contas AWS ativas:', awsData);
    
    if (!awsData.data || awsData.data.length === 0) {
      console.error('❌ Nenhuma conta AWS ativa encontrada');
      return;
    }
    
    // 3. Verificar dados de custos diários
    console.log('\n3️⃣ Verificando dados de custos diários...');
    const costsResponse = await fetch('/api/functions/query-table', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token') || localStorage.getItem('accessToken')}`
      },
      body: JSON.stringify({
        table: 'daily_costs',
        filters: { 
          organization_id: organizationId
        },
        select: ['aws_account_id', 'date', 'service', 'cost', 'created_at'],
        orderBy: { column: 'date', ascending: false },
        limit: 10
      })
    });
    
    const costsData = await costsResponse.json();
    console.log('💰 Dados de custos (últimos 10):', costsData);
    
    // 4. Contar total de registros de custos
    console.log('\n4️⃣ Contando total de registros de custos...');
    const countResponse = await fetch('/api/functions/query-table', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token') || localStorage.getItem('accessToken')}`
      },
      body: JSON.stringify({
        table: 'daily_costs',
        filters: { 
          organization_id: organizationId
        },
        count: true
      })
    });
    
    const countData = await countResponse.json();
    console.log('📊 Total de registros de custos:', countData);
    
    // 5. Verificar dados de RI/SP
    console.log('\n5️⃣ Verificando dados de Reserved Instances...');
    const riResponse = await fetch('/api/functions/query-table', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token') || localStorage.getItem('accessToken')}`
      },
      body: JSON.stringify({
        table: 'reserved_instances',
        filters: { 
          organization_id: organizationId
        },
        count: true
      })
    });
    
    const riData = await riResponse.json();
    console.log('🔒 Reserved Instances:', riData);
    
    // 6. Verificar dados de Savings Plans
    console.log('\n6️⃣ Verificando dados de Savings Plans...');
    const spResponse = await fetch('/api/functions/query-table', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token') || localStorage.getItem('accessToken')}`
      },
      body: JSON.stringify({
        table: 'savings_plans',
        filters: { 
          organization_id: organizationId
        },
        count: true
      })
    });
    
    const spData = await spResponse.json();
    console.log('💡 Savings Plans:', spData);
    
    // 7. Testar busca de custos via Lambda
    console.log('\n7️⃣ Testando busca de custos via Lambda...');
    if (awsData.data && awsData.data.length > 0) {
      const accountId = awsData.data[0].id;
      console.log('🎯 Testando com conta:', accountId);
      
      try {
        const lambdaResponse = await fetch('/api/functions/fetch-daily-costs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token') || localStorage.getItem('accessToken')}`
          },
          body: JSON.stringify({
            accountId: accountId,
            days: 7,
            incremental: false
          })
        });
        
        const lambdaData = await lambdaResponse.json();
        console.log('⚡ Resultado da Lambda fetch-daily-costs:', lambdaData);
      } catch (lambdaError) {
        console.error('❌ Erro na Lambda:', lambdaError);
      }
    }
    
    // 8. Resumo final
    console.log('\n📋 RESUMO:');
    console.log('- Organization ID:', organizationId);
    console.log('- Contas AWS ativas:', awsData.data?.length || 0);
    console.log('- Registros de custos:', countData.count || 0);
    console.log('- Reserved Instances:', riData.count || 0);
    console.log('- Savings Plans:', spData.count || 0);
    
    if (countData.count === 0) {
      console.log('\n🚨 PROBLEMA IDENTIFICADO: Não há dados de custos no banco!');
      console.log('💡 SOLUÇÃO: Execute a busca de custos manualmente ou verifique as permissões AWS.');
    }
    
  } catch (error) {
    console.error('❌ Erro durante a investigação:', error);
  }
}

// Execute a função
debugCostData();