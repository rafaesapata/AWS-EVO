#!/usr/bin/env node

/**
 * Script para debugar o problema de licenças
 * Cria uma organização de teste e associa o usuário
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

async function createOrganization(token) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/functions/manage-organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        action: 'create',
        name: 'Test Organization',
        slug: 'test-org'
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('❌ Erro ao criar organização:', data);
      return null;
    }
    
    console.log('✅ Organização criada:', data);
    return data;
  } catch (error) {
    console.error('❌ Erro na requisição:', error.message);
    return null;
  }
}

async function updateUserOrganization(username, organizationId) {
  try {
    await cognitoClient.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      UserAttributes: [
        { Name: 'custom:organization_id', Value: organizationId },
        { Name: 'custom:organization_name', Value: 'Test Organization' },
        { Name: 'custom:roles', Value: JSON.stringify(['org_admin']) }
      ]
    }));
    
    console.log('✅ Usuário atualizado com organização:', organizationId);
    return true;
  } catch (error) {
    console.error('❌ Erro ao atualizar usuário:', error.message);
    return false;
  }
}

async function testLicenseValidation(token) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/functions/validate-license`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({})
    });
    
    const data = await response.json();
    console.log('📋 Resposta da validação de licença:', JSON.stringify(data, null, 2));
    
    return data;
  } catch (error) {
    console.error('❌ Erro ao validar licença:', error.message);
    return null;
  }
}

async function main() {
  console.log('🔍 Debugando problema de licenças...\n');
  
  // 1. Fazer login
  console.log('1. Fazendo login...');
  const token = await getAuthToken('test@udstec.io', 'TestPass123!');
  if (!token) {
    console.log('❌ Falha no login. Saindo...');
    return;
  }
  console.log('✅ Login realizado com sucesso\n');
  
  // 2. Tentar validar licença (deve falhar)
  console.log('2. Testando validação de licença (deve falhar)...');
  await testLicenseValidation(token);
  console.log('');
  
  // 3. Criar organização (como super admin)
  console.log('3. Criando organização de teste...');
  const org = await createOrganization(token);
  if (!org) {
    console.log('❌ Falha ao criar organização. Tentando com usuário admin existente...');
    
    // Tentar com admin@udstec.io
    const adminToken = await getAuthToken('admin@udstec.io', 'AdminPass123!');
    if (adminToken) {
      const adminOrg = await createOrganization(adminToken);
      if (adminOrg) {
        console.log('✅ Organização criada com admin');
        org = adminOrg;
      }
    }
  }
  
  if (!org) {
    console.log('❌ Não foi possível criar organização. Saindo...');
    return;
  }
  console.log('');
  
  // 4. Associar usuário à organização
  console.log('4. Associando usuário à organização...');
  const updated = await updateUserOrganization('test@udstec.io', org.id);
  if (!updated) {
    console.log('❌ Falha ao associar usuário. Saindo...');
    return;
  }
  console.log('');
  
  // 5. Fazer novo login para pegar token atualizado
  console.log('5. Fazendo novo login com dados atualizados...');
  const newToken = await getAuthToken('test@udstec.io', 'TestPass123!');
  if (!newToken) {
    console.log('❌ Falha no novo login. Saindo...');
    return;
  }
  console.log('✅ Novo login realizado\n');
  
  // 6. Testar validação de licença novamente
  console.log('6. Testando validação de licença novamente...');
  const licenseResult = await testLicenseValidation(newToken);
  console.log('');
  
  // 7. Resumo
  console.log('📊 RESUMO:');
  console.log('- Organização criada:', org.id);
  console.log('- Usuário associado:', 'test@udstec.io');
  console.log('- Licença configurada:', licenseResult?.configured || false);
  console.log('- Customer ID:', licenseResult?.customer_id || 'Não configurado');
  
  if (!licenseResult?.configured) {
    console.log('\n🔧 PRÓXIMOS PASSOS:');
    console.log('1. Configure um customer_id válido na organização');
    console.log('2. Use o endpoint validate-license com customer_id no body');
    console.log('3. Exemplo:');
    console.log(`   curl -X POST ${API_BASE_URL}/api/functions/validate-license \\`);
    console.log(`     -H "Authorization: Bearer ${newToken.substring(0, 20)}..." \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"customer_id": "f7c9c432-d2c9-41ad-be8f-38883c06cb48"}'`);
  }
}

main().catch(console.error);