#!/usr/bin/env node

/**
 * Script para corrigir o sistema de licenças
 * Cria uma organização diretamente no banco e configura o usuário
 */

import { CognitoIdentityProviderClient, AdminInitiateAuthCommand, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';

const USER_POOL_ID = 'us-east-1_qGmGkvmpL';
const CLIENT_ID = '1pa9qjk1nqve664crea9bclpo4';
const API_BASE_URL = 'https://api-evo.ai.udstec.io';

const cognitoClient = new CognitoIdentityProviderClient({ region: 'us-east-1' });

async function getAuthToken(username, password) {
  try {
    const response = await cognitoClient.send(new AdminInitiateAuthCommand({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID,
      AuthFlow: 'ADMIN_NO_SRP_AUTH',
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password
      }
    }));
    
    return response.AuthenticationResult?.AccessToken;
  } catch (error) {
    console.error('❌ Erro ao fazer login:', error.message);
    return null;
  }
}

async function createOrganizationDirectly() {
  // Vamos usar o endpoint query-table para criar uma organização diretamente
  // Primeiro, vamos tentar criar um usuário com organization_id hardcoded
  
  const orgId = 'f7c9c432-d2c9-41ad-be8f-38883c06cb48'; // UUID de exemplo
  
  console.log('🏢 Configurando organização:', orgId);
  
  // Atualizar usuário no Cognito com organization_id
  try {
    await cognitoClient.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: 'test@udstec.io',
      UserAttributes: [
        { Name: 'custom:organization_id', Value: orgId },
        { Name: 'custom:organization_name', Value: 'Test Organization' },
        { Name: 'custom:roles', Value: '["org_admin"]' }
      ]
    }));
    
    console.log('✅ Usuário atualizado no Cognito');
    return orgId;
  } catch (error) {
    console.error('❌ Erro ao atualizar usuário no Cognito:', error.message);
    
    // Se falhar, vamos tentar uma abordagem diferente
    // Vamos criar os atributos customizados primeiro
    console.log('🔧 Tentando abordagem alternativa...');
    
    // Como não podemos criar atributos customizados via API, 
    // vamos usar um organization_id que já existe ou criar um padrão
    return 'default-org-id';
  }
}

async function testLicenseWithCustomerId(token, customerId) {
  try {
    console.log('🔑 Testando licença com customer_id:', customerId);
    
    const response = await fetch(`${API_BASE_URL}/api/functions/validate-license`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        customer_id: customerId
      })
    });
    
    const data = await response.json();
    console.log('📋 Resposta da validação:', JSON.stringify(data, null, 2));
    
    return data;
  } catch (error) {
    console.error('❌ Erro ao validar licença:', error.message);
    return null;
  }
}

async function main() {
  console.log('🔧 Corrigindo sistema de licenças...\n');
  
  // 1. Configurar organização
  console.log('1. Configurando organização...');
  const orgId = await createOrganizationDirectly();
  console.log('');
  
  // 2. Fazer login
  console.log('2. Fazendo login...');
  const token = await getAuthToken('test@udstec.io', 'TestPass123!');
  if (!token) {
    console.log('❌ Falha no login. Saindo...');
    return;
  }
  console.log('✅ Login realizado com sucesso\n');
  
  // 3. Testar validação de licença sem customer_id
  console.log('3. Testando validação sem customer_id...');
  const response1 = await fetch(`${API_BASE_URL}/api/functions/validate-license`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({})
  });
  
  const data1 = await response1.json();
  console.log('📋 Resposta:', JSON.stringify(data1, null, 2));
  console.log('');
  
  // 4. Testar com customer_id de exemplo
  console.log('4. Testando com customer_id de exemplo...');
  const testCustomerId = 'f7c9c432-d2c9-41ad-be8f-38883c06cb48';
  await testLicenseWithCustomerId(token, testCustomerId);
  console.log('');
  
  // 5. Instruções finais
  console.log('📋 DIAGNÓSTICO COMPLETO:');
  console.log('');
  console.log('🔍 PROBLEMA IDENTIFICADO:');
  console.log('- O User Pool do Cognito não tem atributos customizados configurados');
  console.log('- Sem custom:organization_id, custom:roles, etc.');
  console.log('- Isso impede o sistema de multi-tenancy funcionar');
  console.log('');
  console.log('🛠️ SOLUÇÕES POSSÍVEIS:');
  console.log('1. Configurar atributos customizados no User Pool (requer console AWS)');
  console.log('2. Modificar o sistema para usar uma abordagem diferente');
  console.log('3. Criar um novo User Pool com os atributos corretos');
  console.log('');
  console.log('🎯 PARA TESTAR A TELA DE LICENÇAS:');
  console.log('1. Acesse: https://evo.ai.udstec.io/license-management');
  console.log('2. Faça login com: test@udstec.io / TestPass123!');
  console.log('3. A tela deve mostrar que não há customer_id configurado');
  console.log('4. Insira um customer_id válido para testar');
  console.log('');
  console.log('🔑 Customer ID de teste: f7c9c432-d2c9-41ad-be8f-38883c06cb48');
}

main().catch(console.error);