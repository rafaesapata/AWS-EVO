#!/usr/bin/env node

/**
 * Script to trigger cost data fetch for the cost analysis page
 * This will call the fetch-daily-costs Lambda via API Gateway
 */

const https = require('https');

const API_BASE_URL = 'https://api-evo.ai.udstec.io';

// You'll need to get a valid JWT token from the browser
// 1. Go to https://evo.ai.udstec.io/app
// 2. Open browser dev tools -> Application -> Local Storage
// 3. Find the Cognito token or check Network tab for Authorization header
const JWT_TOKEN = process.env.JWT_TOKEN || '';

if (!JWT_TOKEN) {
  console.error('❌ JWT_TOKEN environment variable is required');
  console.error('Get it from browser dev tools when logged into the app');
  process.exit(1);
}

async function triggerCostFetch() {
  console.log('🚀 Triggering cost data fetch...');
  
  const payload = JSON.stringify({
    // No accountId = fetch for all accounts
    // incremental: true = only fetch new dates
    incremental: true,
    granularity: 'DAILY'
  });

  const options = {
    hostname: 'api-evo.ai.udstec.io',
    port: 443,
    path: '/api/functions/fetch-daily-costs',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Authorization': `Bearer ${JWT_TOKEN}`,
      'Origin': 'https://evo.ai.udstec.io'
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log(`📊 Response (${res.statusCode}):`, JSON.stringify(response, null, 2));
          
          if (res.statusCode === 200) {
            console.log('✅ Cost fetch completed successfully!');
            console.log('💡 Now refresh the cost analysis page to see data');
          } else {
            console.error('❌ Cost fetch failed');
          }
          
          resolve(response);
        } catch (e) {
          console.error('❌ Failed to parse response:', data);
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error('❌ Request failed:', e.message);
      reject(e);
    });

    req.write(payload);
    req.end();
  });
}

// Run the script
triggerCostFetch().catch(console.error);