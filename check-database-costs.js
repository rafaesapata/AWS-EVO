#!/usr/bin/env node

/**
 * Script para verificar dados de custo diretamente no banco
 */

const https = require('https');

const JWT_TOKEN = process.env.JWT_TOKEN || '';

if (!JWT_TOKEN) {
  console.error('❌ JWT_TOKEN environment variable is required');
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

async function checkDatabase() {
  console.log('🔍 Checking database for cost data...\n');
  
  try {
    // 1. Verificar TODOS os dados de custo no banco (sem filtros)
    console.log('1️⃣ Checking ALL cost data in database...');
    const allCostsResponse = await makeRequest('/api/functions/query-table', {
      table: 'daily_costs',
      order: { column: 'date', ascending: false },
      limit: 20
    });
    
    console.log(`Status: ${allCostsResponse.status}`);
    
    if (allCostsResponse.data && allCostsResponse.data.length > 0) {
      console.log(`✅ Found ${allCostsResponse.data.length} total cost records in database`);
      
      // Agrupar por aws_account_id para ver quais contas têm dados
      const accountGroups = {};
      allCostsResponse.data.forEach(record => {
        const accountId = record.aws_account_id;
        if (!accountGroups[accountId]) {
          accountGroups[accountId] = { count: 0, dates: new Set(), totalCost: 0 };
        }
        accountGroups[accountId].count++;
        accountGroups[accountId].dates.add(record.date.split('T')[0]);
        accountGroups[accountId].totalCost += record.cost || 0;
      });
      
      console.log('\n📊 Cost data by AWS Account ID:');
      Object.entries(accountGroups).forEach(([accountId, info]) => {
        console.log(`   Account ${accountId}:`);
        console.log(`     - Records: ${info.count}`);
        console.log(`     - Date range: ${Math.min(...info.dates)} to ${Math.max(...info.dates)}`);
        console.log(`     - Total cost: $${info.totalCost.toFixed(2)}`);
      });
      
      console.log('\n📋 Sample records:');
      allCostsResponse.data.slice(0, 5).forEach(record => {
        console.log(`   - Date: ${record.date.split('T')[0]}, Account: ${record.aws_account_id}, Service: ${record.service}, Cost: $${record.cost}`);
      });
      
    } else {
      console.log('❌ No cost records found in database');
      console.log('Response:', JSON.stringify(allCostsResponse.data, null, 2));
    }
    
    // 2. Verificar dados para a organização específica
    console.log('\n2️⃣ Checking cost data for organization 865f299e-2009-4145-8279-f9a73e0278aa...');
    const orgCostsResponse = await makeRequest('/api/functions/query-table', {
      table: 'daily_costs',
      eq: { organization_id: '865f299e-2009-4145-8279-f9a73e0278aa' },
      order: { column: 'date', ascending: false },
      limit: 10
    });
    
    if (orgCostsResponse.data && orgCostsResponse.data.length > 0) {
      console.log(`✅ Found ${orgCostsResponse.data.length} cost records for this organization`);
      
      // Agrupar por aws_account_id
      const orgAccountGroups = {};
      orgCostsResponse.data.forEach(record => {
        const accountId = record.aws_account_id;
        if (!orgAccountGroups[accountId]) {
          orgAccountGroups[accountId] = { count: 0, totalCost: 0 };
        }
        orgAccountGroups[accountId].count++;
        orgAccountGroups[accountId].totalCost += record.cost || 0;
      });
      
      console.log('📊 Organization cost data by Account ID:');
      Object.entries(orgAccountGroups).forEach(([accountId, info]) => {
        console.log(`   Account ${accountId}: ${info.count} records, $${info.totalCost.toFixed(2)}`);
      });
      
    } else {
      console.log('❌ No cost records found for this organization');
    }
    
    // 3. Verificar dados para a conta específica que está selecionada
    console.log('\n3️⃣ Checking cost data for selected account 447d6499-19f3-4382-9249-5f12a320e835...');
    const accountCostsResponse = await makeRequest('/api/functions/query-table', {
      table: 'daily_costs',
      eq: { 
        organization_id: '865f299e-2009-4145-8279-f9a73e0278aa',
        aws_account_id: '447d6499-19f3-4382-9249-5f12a320e835'
      },
      order: { column: 'date', ascending: false },
      limit: 10
    });
    
    if (accountCostsResponse.data && accountCostsResponse.data.length > 0) {
      console.log(`✅ Found ${accountCostsResponse.data.length} cost records for selected account`);
    } else {
      console.log('❌ No cost records found for selected account');
      console.log('This explains why the cost analysis page shows no data!');
    }
    
    // 4. Verificar se há dados com account_id diferente (problema de mapeamento)
    console.log('\n4️⃣ Checking for potential ID mapping issues...');
    
    // Verificar se há dados com os números de conta AWS reais
    const awsAccountNumbers = ['103548788372', '563366818355'];
    
    for (const accountNumber of awsAccountNumbers) {
      console.log(`\n🔍 Checking for account number ${accountNumber}...`);
      
      // Verificar se há dados usando account_id (campo antigo)
      const oldFieldResponse = await makeRequest('/api/functions/query-table', {
        table: 'daily_costs',
        eq: { account_id: accountNumber },
        limit: 5
      });
      
      if (oldFieldResponse.data && oldFieldResponse.data.length > 0) {
        console.log(`⚠️ Found ${oldFieldResponse.data.length} records using old 'account_id' field!`);
        console.log('This indicates a schema migration issue.');
      }
      
      // Verificar se há dados usando aws_account_id com o número da conta
      const numberResponse = await makeRequest('/api/functions/query-table', {
        table: 'daily_costs',
        eq: { aws_account_id: accountNumber },
        limit: 5
      });
      
      if (numberResponse.data && numberResponse.data.length > 0) {
        console.log(`⚠️ Found ${numberResponse.data.length} records using account number as aws_account_id!`);
        console.log('This indicates the Lambda is storing account numbers instead of UUIDs.');
      }
    }
    
  } catch (error) {
    console.error('❌ Database check failed:', error);
  }
}

// Run the check
checkDatabase().catch(console.error);