#!/usr/bin/env node

import https from 'https';

const FRONTEND_URL = 'https://del4pu28krnxt.cloudfront.net';

console.log('🔍 Testing frontend availability...');
console.log(`📍 URL: ${FRONTEND_URL}`);

https.get(FRONTEND_URL, (res) => {
  console.log(`📊 Status Code: ${res.statusCode}`);
  console.log(`📋 Headers:`, res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`📄 Content Length: ${data.length} bytes`);
    
    // Check if HTML contains expected elements
    const hasTitle = data.includes('<title>EVO - Plataforma de Análise AWS com IA</title>');
    const hasRootDiv = data.includes('<div id="root"></div>');
    const hasJavaScript = data.includes('.js');
    
    console.log(`✅ Has correct title: ${hasTitle}`);
    console.log(`✅ Has root div: ${hasRootDiv}`);
    console.log(`✅ Has JavaScript: ${hasJavaScript}`);
    
    if (hasTitle && hasRootDiv && hasJavaScript) {
      console.log('🎉 Frontend HTML is loading correctly!');
      console.log('💡 If page appears blank, check browser console for JavaScript errors');
    } else {
      console.log('❌ Frontend HTML has issues');
    }
  });
}).on('error', (err) => {
  console.error('❌ Error testing frontend:', err.message);
});