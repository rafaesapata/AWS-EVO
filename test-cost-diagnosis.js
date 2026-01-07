// Script para testar o diagnóstico de custos
// Execute no console do navegador na página do sistema

async function testCostDiagnosis() {
  console.log('🔍 Executando diagnóstico de custos...');
  
  try {
    // Primeiro, vamos testar se conseguimos acessar dados básicos
    console.log('\n1️⃣ Testando acesso aos dados básicos...');
    
    const token = localStorage.getItem('auth_token') || localStorage.getItem('accessToken');
    if (!token) {
      console.error('❌ Token de autenticação não encontrado');
      return;
    }
    
    // Testar query-table para verificar organização
    const orgResponse = await fetch('/api/functions/query-table', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        table: 'profiles',
        select: ['organization_id', 'user_id', 'full_name']
      })
    });
    
    if (!orgResponse.ok) {
      console.error('❌ Erro ao buscar perfil:', orgResponse.status, orgResponse.statusText);
      return;
    }
    
    const orgData = await orgResponse.json();
    console.log('👤 Dados do perfil:', orgData);
    
    if (!orgData.data || orgData.data.length === 0) {
      console.error('❌ Nenhum perfil encontrado');
      return;
    }
    
    const organizationId = orgData.data[0].organization_id;
    console.log('🏢 Organization ID:', organizationId);
    
    // Testar contas AWS
    console.log('\n2️⃣ Verificando contas AWS...');
    const awsResponse = await fetch('/api/functions/query-table', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        table: 'aws_credentials',
        filters: { 
          organization_id: organizationId,
          is_active: true 
        }
      })
    });
    
    const awsData = await awsResponse.json();
    console.log('☁️ Contas AWS:', awsData);
    
    // Testar dados de custos
    console.log('\n3️⃣ Verificando dados de custos...');
    const costsResponse = await fetch('/api/functions/query-table', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        table: 'daily_costs',
        filters: { organization_id: organizationId },
        limit: 5,
        orderBy: { column: 'date', ascending: false }
      })
    });
    
    const costsData = await costsResponse.json();
    console.log('💰 Dados de custos:', costsData);
    
    // Contar total de registros
    console.log('\n4️⃣ Contando registros de custos...');
    const countResponse = await fetch('/api/functions/query-table', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        table: 'daily_costs',
        filters: { organization_id: organizationId },
        count: true
      })
    });
    
    const countData = await countResponse.json();
    console.log('📊 Total de registros:', countData);
    
    // Testar busca de custos se não houver dados
    if (countData.count === 0 && awsData.data && awsData.data.length > 0) {
      console.log('\n5️⃣ Tentando buscar custos via Lambda...');
      const accountId = awsData.data[0].id;
      
      try {
        const fetchResponse = await fetch('/api/functions/fetch-daily-costs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            accountId: accountId,
            days: 30,
            incremental: false
          })
        });
        
        const fetchData = await fetchResponse.json();
        console.log('⚡ Resultado da busca de custos:', fetchData);
        
        if (fetchData.error) {
          console.error('❌ Erro na busca de custos:', fetchData.error);
          
          // Verificar se é erro de permissão AWS
          if (fetchData.error.includes('AssumeRole') || fetchData.error.includes('not authorized')) {
            console.log('\n🚨 PROBLEMA IDENTIFICADO: Erro de permissões AWS');
            console.log('💡 SOLUÇÕES:');
            console.log('1. Verificar se a IAM Role tem permissões para Cost Explorer');
            console.log('2. Verificar se a Trust Policy permite AssumeRole');
            console.log('3. Verificar se o External ID está correto');
            console.log('\n📋 Permissões necessárias:');
            console.log('- ce:GetCostAndUsage');
            console.log('- ce:GetReservationUtilization');
            console.log('- ce:GetSavingsPlansUtilization');
          }
        }
      } catch (fetchError) {
        console.error('❌ Erro ao executar fetch-daily-costs:', fetchError);
      }
    }
    
    // Resumo final
    console.log('\n📋 RESUMO DO DIAGNÓSTICO:');
    console.log('- Organization ID:', organizationId);
    console.log('- Contas AWS ativas:', awsData.data?.length || 0);
    console.log('- Registros de custos:', countData.count || 0);
    
    if (countData.count === 0) {
      console.log('\n🎯 AÇÃO NECESSÁRIA:');
      console.log('1. Vá para: https://evo.ai.udstec.io/app?tab=cost-analysis');
      console.log('2. Clique em "Busca Completa" ou "Atualizar"');
      console.log('3. Aguarde o processamento (pode levar alguns minutos)');
      console.log('4. Verifique se os dados aparecem no dashboard');
    } else {
      console.log('\n✅ Dados encontrados! O problema pode ser na agregação do frontend.');
    }
    
  } catch (error) {
    console.error('❌ Erro durante o diagnóstico:', error);
  }
}

// Executar o diagnóstico
testCostDiagnosis();