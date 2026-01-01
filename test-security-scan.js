/**
 * Script para testar o endpoint de Security Scan
 */

const https = require('https');

const API_URL = 'https://api-evo.ai.udstec.io/api/functions/start-security-scan';

// Você precisa substituir este token por um token válido do Cognito
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'SEU_TOKEN_AQUI';

const payload = JSON.stringify({
  scanLevel: 'quick',
  accountId: null // Deixar null para usar a primeira credencial ativa
});

const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': payload.length,
    'Authorization': `Bearer ${AUTH_TOKEN}`
  }
};

console.log('🔍 Testando endpoint de Security Scan...');
console.log('URL:', API_URL);
console.log('Payload:', payload);

const req = https.request(API_URL, options, (res) => {
  console.log('\n📊 Status Code:', res.statusCode);
  console.log('📋 Headers:', JSON.stringify(res.headers, null, 2));
  
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('\n📦 Response Body:');
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Erro na requisição:', error);
});

req.write(payload);
req.end();
