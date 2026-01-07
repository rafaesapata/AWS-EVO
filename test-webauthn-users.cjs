#!/usr/bin/env node

const https = require('https');

const testUsers = [
  'admin@udstec.io',
  'andre.almeida@uds.com.br',
  'test@example.com',
  'user@udstec.io'
];

async function testWebAuthnForUser(email) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      action: 'start',
      email: email
    });

    const options = {
      hostname: 'api-evo.ai.udstec.io',
      port: 443,
      path: '/api/functions/webauthn-authenticate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({
            email,
            statusCode: res.statusCode,
            response: parsed
          });
        } catch (error) {
          resolve({
            email,
            statusCode: res.statusCode,
            response: responseData,
            parseError: error.message
          });
        }
      });
    });

    req.on('error', (error) => {
      reject({ email, error: error.message });
    });

    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('🔐 Testing WebAuthn status for different users...\n');
  
  for (const email of testUsers) {
    try {
      const result = await testWebAuthnForUser(email);
      console.log(`📧 ${email}:`);
      console.log(`   Status: ${result.statusCode}`);
      
      if (result.response && typeof result.response === 'object') {
        if (result.response.success) {
          console.log(`   ✅ Success: ${result.response.data?.message || 'OK'}`);
          console.log(`   🔐 Has WebAuthn: ${result.response.data?.hasWebAuthn || false}`);
        } else {
          console.log(`   ❌ Error: ${result.response.error}`);
        }
      } else {
        console.log(`   📄 Raw response: ${result.response}`);
      }
      console.log('');
    } catch (error) {
      console.log(`📧 ${email}:`);
      console.log(`   ❌ Request failed: ${error.error}`);
      console.log('');
    }
  }
}

main().catch(console.error);