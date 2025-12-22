#!/usr/bin/env node

import https from 'https';

const API_URL = 'https://z3z39jk585.execute-api.us-east-1.amazonaws.com/dev';
const FRONTEND_URL = 'https://del4pu28krnxt.cloudfront.net';

console.log('🔍 Testing EVO UDS Platform...');
console.log(`🌐 Frontend: ${FRONTEND_URL}`);
console.log(`🔌 API: ${API_URL}`);

// Test API health
function testAPI() {
  return new Promise((resolve, reject) => {
    console.log('\n📡 Testing API health...');
    
    https.get(`${API_URL}/health`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`📊 API Status: ${res.statusCode}`);
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            console.log(`✅ API Health: ${response.status || 'OK'}`);
            resolve(true);
          } catch (e) {
            console.log(`✅ API responding (non-JSON response)`);
            resolve(true);
          }
        } else {
          console.log(`❌ API Error: ${res.statusCode}`);
          resolve(false);
        }
      });
    }).on('error', (err) => {
      console.log(`❌ API Connection Error: ${err.message}`);
      resolve(false);
    });
  });
}

// Test frontend loading
function testFrontend() {
  return new Promise((resolve, reject) => {
    console.log('\n🌐 Testing frontend loading...');
    
    https.get(FRONTEND_URL, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`📊 Frontend Status: ${res.statusCode}`);
        
        if (res.statusCode === 200) {
          const hasTitle = data.includes('<title>EVO - Plataforma de Análise AWS com IA</title>');
          const hasRootDiv = data.includes('<div id="root"></div>');
          const hasJavaScript = data.includes('.js');
          const hasReactRouter = data.includes('react-router');
          
          console.log(`✅ HTML Structure: ${hasTitle && hasRootDiv ? 'OK' : 'FAIL'}`);
          console.log(`✅ JavaScript Bundle: ${hasJavaScript ? 'OK' : 'FAIL'}`);
          
          resolve(hasTitle && hasRootDiv && hasJavaScript);
        } else {
          console.log(`❌ Frontend Error: ${res.statusCode}`);
          resolve(false);
        }
      });
    }).on('error', (err) => {
      console.log(`❌ Frontend Connection Error: ${err.message}`);
      resolve(false);
    });
  });
}

// Run tests
async function runTests() {
  console.log('🚀 Starting comprehensive platform test...\n');
  
  const apiOK = await testAPI();
  const frontendOK = await testFrontend();
  
  console.log('\n📋 Test Results Summary:');
  console.log(`🔌 API Health: ${apiOK ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`🌐 Frontend Loading: ${frontendOK ? '✅ PASS' : '❌ FAIL'}`);
  
  if (apiOK && frontendOK) {
    console.log('\n🎉 Platform is ready for testing!');
    console.log('\n👤 Admin Login Credentials:');
    console.log('   Username: admin-user');
    console.log('   Password: AdminPass123!');
    console.log(`\n🔗 Access: ${FRONTEND_URL}`);
    console.log('\n💡 Next steps:');
    console.log('   1. Open the frontend URL in your browser');
    console.log('   2. Try logging in with the admin credentials');
    console.log('   3. Check browser console for any JavaScript errors');
  } else {
    console.log('\n❌ Platform has issues that need to be resolved');
  }
}

runTests().catch(console.error);