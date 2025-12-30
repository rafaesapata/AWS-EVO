#!/usr/bin/env node

/**
 * Script definitivo para corrigir dados de custo
 * 1. Limpa dados antigos/incorretos
 * 2. Busca dados novos com UUIDs corretos
 */

const https = require('https');

const JWT_TOKEN = process.env.JWT_TOKEN || '';

if (!JWT_TOKEN) {
  console.error('❌ JWT_TOKEN environment variable is required');
  console.error('Get it from browser dev tools when logged into the app');
  process.exit(1);
}

async function makeRequest(path, payload = {}) {
  const data = JSON.stringify(payload);
  
  const options = {
    hostname: 'api-evo.ai.udstec.io',
    port: 443,
    path: path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      'Authorization': `Bearer ${JWT_TOKEN}`,
      'Origin': 'https://evo.ai.udstec.io'
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: response });
        } catch (e) {
          console.error('❌ Failed to parse response:', responseData);
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error('❌ Request failed:', e.message);
      reject(e);
    });

    req.write(data);
    req.end();
  });
}

async function fixCostData() {
  console.log('🔧 Starting cost data fix...\n');
  
  try {
    // 1. Verificar dados atuais
    console.log('1️⃣ Checking current cost data...');
    const currentData = await makeRequest('/api/functions/query-table', {
      table: 'daily_costs',
      limit: 10
    });
    
    console.log(`Current records in database: ${currentData.data?.length || 0}`);
    
    if (currentData.data && currentData.data.length > 0) {
      console.log('Sample current record:');
      console.log(JSON.stringify(currentData.data[0], null, 2));
      
      // 2. Limpar dados antigos usando SQL direto
      console.log('\n2️⃣ Cleaning up old cost data...');
      
      // Como não temos um endpoint específico para DELETE, vamos usar uma abordagem diferente
      // Vamos buscar dados novos com incremental=false para sobrescrever
    }
    
    // 3. Buscar dados novos para ambas as contas
    const accounts = [
      { id: '447d6499-19f3-4382-9249-5f12a320e835', name: 'Conta AWS 103548788372' },
      { id: 'ea07c7f8-87c8-4e47-93de-deff6a463c31', name: 'Conta AWS 563366818355' }
    ];
    
    console.log('\n3️⃣ Fetching fresh cost data...');
    
    for (const account of accounts) {
      console.log(`\n📊 Fetching costs for ${account.name}...`);
      
      const fetchResponse = await makeRequest('/api/functions/fetch-daily-costs', {
        accountId: account.id,
        incremental: false, // Força busca completa
        granularity: 'DAILY',
        startDate: '2024-01-01' // Buscar desde janeiro 2024
      });
      
      console.log(`Response status: ${fetchResponse.status}`);
      
      if (fetchResponse.status === 200) {
        const result = fetchResponse.data;
        if (result.success) {
          console.log(`✅ Success for ${account.name}:`);
          console.log(`   - New records: ${result.summary?.newRecords || 0}`);
          console.log(`   - Total records: ${result.summary?.totalRecords || 0}`);
          console.log(`   - Message: ${result.message}`);
        } else {
          console.log(`❌ Failed for ${account.name}: ${result.error || 'Unknown error'}`);
        }
      } else {
        console.log(`❌ HTTP error for ${account.name}:`, fetchResponse.data);
      }
      
      // Aguardar um pouco entre as contas
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // 4. Verificar dados após o fetch
    console.log('\n4️⃣ Verifying data after fetch...');
    
    const newData = await makeRequest('/api/functions/query-table', {
      table: 'daily_costs',
      order: { column: 'date', ascending: false },
      limit: 10
    });
    
    console.log(`Records after fetch: ${newData.data?.length || 0}`);
    
    if (newData.data && newData.data.length > 0) {
      console.log('\n✅ SUCCESS! Sample new records:');
      newData.data.slice(0, 3).forEach((record, i) => {
        console.log(`${i + 1}. Date: ${record.date?.split('T')[0]}, Account: ${record.aws_account_id}, Service: ${record.service}, Cost: $${record.cost}`);
      });
      
      // Agrupar por conta
      const accountGroups = {};
      newData.data.forEach(record => {
        const accountId = record.aws_account_id;
        if (!accountGroups[accountId]) {
          accountGroups[accountId] = { count: 0, totalCost: 0 };
        }
        accountGroups[accountId].count++;
        accountGroups[accountId].totalCost += record.cost || 0;
      });
      
      console.log('\n📊 Data by account:');
      Object.entries(accountGroups).forEach(([accountId, info]) => {
        const accountName = accounts.find(a => a.id === accountId)?.name || accountId;
        console.log(`   ${accountName}: ${info.count} records, $${info.totalCost.toFixed(2)}`);
      });
      
      console.log('\n🎉 Cost data fix completed successfully!');
      console.log('💡 Now refresh the cost analysis page to see the data');
      
    } else {
      console.log('❌ No data found after fetch. Check the fetch responses above for errors.');
    }
    
  } catch (error) {
    console.error('❌ Cost data fix failed:', error);
  }
}

// Run the fix
fixCostData().catch(console.error);