#!/usr/bin/env tsx
/**
 * Script para corrigir CORS na API Gateway
 */

import { execSync } from 'child_process';

console.log('🔧 Corrigindo CORS na API Gateway...\n');

// Configurações CORS
const corsConfig = {
  allowOrigins: [
    'https://evo.ia.udstec.io',
    'https://www.evo.ia.udstec.io',
    'http://localhost:8080',
    'http://localhost:4173',
    'http://localhost:4175'
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-CSRF-Token',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposeHeaders: ['X-CSRF-Token'],
  maxAge: 86400, // 24 horas
  allowCredentials: true
};

console.log('📋 Configurações CORS:');
console.log(`  Origins: ${corsConfig.allowOrigins.join(', ')}`);
console.log(`  Methods: ${corsConfig.allowMethods.join(', ')}`);
console.log(`  Headers: ${corsConfig.allowHeaders.length} headers`);
console.log(`  Credentials: ${corsConfig.allowCredentials}`);
console.log();

// Encontrar a API Gateway
console.log('🔍 Procurando API Gateway...');

try {
  const apiList = execSync('aws apigateway get-rest-apis --query "items[?name==\'EVO UDS API\'].{id:id,name:name}" --output table', { encoding: 'utf-8' });
  console.log('APIs encontradas:');
  console.log(apiList);
  
  // Extrair API ID
  const apiIdMatch = apiList.match(/\|\s+([a-z0-9]+)\s+\|\s+EVO UDS API\s+\|/);
  
  if (!apiIdMatch) {
    console.error('❌ API Gateway EvoUdsApi não encontrada');
    process.exit(1);
  }
  
  const apiId = apiIdMatch[1];
  console.log(`✅ API Gateway encontrada: ${apiId}`);
  
  // Obter recursos da API
  console.log('\n🔍 Obtendo recursos da API...');
  const resources = JSON.parse(execSync(`aws apigateway get-resources --rest-api-id ${apiId}`, { encoding: 'utf-8' }));
  
  console.log(`📋 Encontrados ${resources.items.length} recursos`);
  
  // Configurar CORS para cada recurso
  for (const resource of resources.items) {
    console.log(`\n🔧 Configurando CORS para: ${resource.path}`);
    
    // Verificar se já existe método OPTIONS
    const hasOptions = resource.resourceMethods && resource.resourceMethods.OPTIONS;
    
    if (!hasOptions) {
      console.log('  📝 Criando método OPTIONS...');
      
      try {
        // Criar método OPTIONS
        execSync(`aws apigateway put-method \\
          --rest-api-id ${apiId} \\
          --resource-id ${resource.id} \\
          --http-method OPTIONS \\
          --authorization-type NONE`, { encoding: 'utf-8' });
        
        // Configurar integração OPTIONS
        execSync(`aws apigateway put-integration \\
          --rest-api-id ${apiId} \\
          --resource-id ${resource.id} \\
          --http-method OPTIONS \\
          --type MOCK \\
          --integration-http-method OPTIONS \\
          --request-templates '{"application/json": "{\\"statusCode\\": 200}"}'`, { encoding: 'utf-8' });
        
        // Configurar resposta OPTIONS
        execSync(`aws apigateway put-method-response \\
          --rest-api-id ${apiId} \\
          --resource-id ${resource.id} \\
          --http-method OPTIONS \\
          --status-code 200 \\
          --response-parameters '{"method.response.header.Access-Control-Allow-Origin": false, "method.response.header.Access-Control-Allow-Methods": false, "method.response.header.Access-Control-Allow-Headers": false, "method.response.header.Access-Control-Max-Age": false, "method.response.header.Access-Control-Allow-Credentials": false}'`, { encoding: 'utf-8' });
        
        // Configurar integração de resposta OPTIONS
        execSync(`aws apigateway put-integration-response \\
          --rest-api-id ${apiId} \\
          --resource-id ${resource.id} \\
          --http-method OPTIONS \\
          --status-code 200 \\
          --response-parameters '{"method.response.header.Access-Control-Allow-Origin": "\\"${corsConfig.allowOrigins[0]}\\"", "method.response.header.Access-Control-Allow-Methods": "\\"${corsConfig.allowMethods.join(',')}\\"", "method.response.header.Access-Control-Allow-Headers": "\\"${corsConfig.allowHeaders.join(',')}\\"", "method.response.header.Access-Control-Max-Age": "\\"${corsConfig.maxAge}\\"", "method.response.header.Access-Control-Allow-Credentials": "\\"${corsConfig.allowCredentials}\\""}'`, { encoding: 'utf-8' });
        
        console.log('  ✅ Método OPTIONS configurado');
      } catch (error) {
        console.log('  ⚠️  Método OPTIONS já existe ou erro na configuração');
      }
    } else {
      console.log('  ✅ Método OPTIONS já existe');
    }
    
    // Configurar CORS para outros métodos
    if (resource.resourceMethods) {
      for (const method of Object.keys(resource.resourceMethods)) {
        if (method !== 'OPTIONS') {
          console.log(`  🔧 Configurando CORS para método ${method}...`);
          
          try {
            // Adicionar headers CORS à resposta
            execSync(`aws apigateway put-method-response \\
              --rest-api-id ${apiId} \\
              --resource-id ${resource.id} \\
              --http-method ${method} \\
              --status-code 200 \\
              --response-parameters '{"method.response.header.Access-Control-Allow-Origin": false, "method.response.header.Access-Control-Allow-Credentials": false}' \\
              --no-cli-pager`, { encoding: 'utf-8' });
            
            execSync(`aws apigateway put-integration-response \\
              --rest-api-id ${apiId} \\
              --resource-id ${resource.id} \\
              --http-method ${method} \\
              --status-code 200 \\
              --response-parameters '{"method.response.header.Access-Control-Allow-Origin": "\\"${corsConfig.allowOrigins[0]}\\"", "method.response.header.Access-Control-Allow-Credentials": "\\"${corsConfig.allowCredentials}\\""}' \\
              --no-cli-pager`, { encoding: 'utf-8' });
            
            console.log(`    ✅ CORS configurado para ${method}`);
          } catch (error) {
            console.log(`    ⚠️  Erro ao configurar CORS para ${method}`);
          }
        }
      }
    }
  }
  
  // Deploy da API
  console.log('\n🚀 Fazendo deploy das mudanças...');
  execSync(`aws apigateway create-deployment --rest-api-id ${apiId} --stage-name prod --description "CORS configuration update"`, { encoding: 'utf-8' });
  
  console.log('✅ Deploy concluído');
  
  console.log('\n🎯 CORS configurado com sucesso!');
  console.log(`📍 API URL: https://${apiId}.execute-api.us-east-1.amazonaws.com/prod`);
  console.log('🔄 Aguarde alguns minutos para propagação das mudanças');
  
} catch (error) {
  console.error('❌ Erro ao configurar CORS:', error);
  process.exit(1);
}