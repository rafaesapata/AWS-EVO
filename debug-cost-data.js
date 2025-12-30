#!/usr/bin/env node

/**
 * Script para debugar os dados de custo
 * Verifica se os dados existem no banco e como estão sendo filtrados
 */

const https = require('https');

const API_BASE_URL = 'https://api-evo.ai.udstec.io';

// Você precisa pegar o JWT token do browser
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

async function debugCostData() {
  console.log('🔍 Debugging cost data...\n');
  
  try {
    // 1. Verificar contas AWS disponíveis
    console.log('1️⃣ Checking AWS accounts...');
    const accountsResponse = await makeRequest('/api/functions/list-aws-credentials', {});
    console.log('AWS Accounts Response:', JSON.stringify(accountsResponse, null, 2));
    
    let accounts = [];
    if (accountsResponse.data?.data) {
      accounts = accountsResponse.data.data.filter(acc => acc.is_active);
    }
    
    if (accounts.length === 0) {
      console.log('❌ No active AWS accounts found!');
      return;
    }
    
    console.log(`✅ Found ${accounts.length} active AWS accounts:`);
    accounts.forEach(acc => {
      console.log(`   - ${acc.account_name} (ID: ${acc.id})`);
    });
    
    // 2. Verificar dados de custo para cada conta
    console.log('\n2️⃣ Checking cost data...');
    
    for (const account of accounts) {
      console.log(`\n📊 Checking costs for account: ${account.account_name}`);
      
      // Query sem filtros de data primeiro
      const allCostsResponse = await makeRequest('/api/functions/query-table', {
        table: 'daily_costs',
        eq: { aws_account_id: account.id },
        order: { column: 'date', ascending: false },
        limit: 10
      });
      
      console.log(`Response status: ${allCostsResponse.status}`);
      console.log('Response data:', JSON.stringify(allCostsResponse.data, null, 2));
      
      if (allCostsResponse.data && allCostsResponse.data.length > 0) {
        console.log(`✅ Found ${allCostsResponse.data.length} cost records`);
        console.log('Sample records:');
        allCostsResponse.data.slice(0, 3).forEach(record => {
          console.log(`   - Date: ${record.date}, Service: ${record.service}, Cost: $${record.cost}`);
        });
        
        // Verificar com filtro de data dos últimos 30 dias
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const startDateStr = thirtyDaysAgo.toISOString().split('T')[0];
        const endDateStr = new Date().toISOString().split('T')[0];
        
        console.log(`\n🗓️ Checking with date filter: ${startDateStr} to ${endDateStr}`);
        
        const filteredCostsResponse = await makeRequest('/api/functions/query-table', {
          table: 'daily_costs',
          eq: { aws_account_id: account.id },
          gte: { date: startDateStr },
          lte: { date: endDateStr },
          order: { column: 'date', ascending: false },
          limit: 100
        });
        
        console.log(`Filtered response status: ${filteredCostsResponse.status}`);
        if (filteredCostsResponse.data && filteredCostsResponse.data.length > 0) {
          console.log(`✅ Found ${filteredCostsResponse.data.length} records in last 30 days`);
          
          // Agrupar por data para ver o breakdown
          const dateGroups = {};
          filteredCostsResponse.data.forEach(record => {
            const date = record.date.split('T')[0];
            if (!dateGroups[date]) {
              dateGroups[date] = { totalCost: 0, services: [] };
            }
            dateGroups[date].totalCost += record.cost;
            dateGroups[date].services.push(`${record.service}: $${record.cost}`);
          });
          
          console.log('\n📈 Daily cost breakdown:');
          Object.entries(dateGroups).slice(0, 5).forEach(([date, info]) => {
            console.log(`   ${date}: $${info.totalCost.toFixed(2)} (${info.services.length} services)`);
          });
          
        } else {
          console.log('❌ No records found in last 30 days');
        }
        
      } else {
        console.log('❌ No cost records found for this account');
      }
    }
    
    // 3. Verificar se há problema com organization_id
    console.log('\n3️⃣ Checking organization filter...');
    const allCostsNoFilter = await makeRequest('/api/functions/query-table', {
      table: 'daily_costs',
      order: { column: 'date', ascending: false },
      limit: 5
    });
    
    console.log('All costs (no account filter):', JSON.stringify(allCostsNoFilter.data, null, 2));
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

// Run the debug
debugCostData().catch(console.error);