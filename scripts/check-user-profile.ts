#!/usr/bin/env tsx
/**
 * Script para verificar se o usuário tem profile no DynamoDB
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { 
  CognitoIdentityProviderClient, 
  ListUsersCommand
} from '@aws-sdk/client-cognito-identity-provider';

config({ path: resolve(process.cwd(), '.env'), override: false });

const region = 'us-east-1';
const dynamoClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

async function main() {
  console.log('🔍 Verificando profiles no DynamoDB...\n');

  try {
    // 1. Listar organizações
    console.log('📋 Step 1: Listando organizações...');
    const orgsCommand = new ScanCommand({
      TableName: 'evo-uds-organizations'
    });
    const orgsResult = await docClient.send(orgsCommand);
    console.log(`   ✅ Encontradas ${orgsResult.Count} organizações:`);
    orgsResult.Items?.forEach(org => {
      console.log(`      - ${org.name} (${org.id}) - slug: ${org.slug}`);
    });

    // 2. Listar profiles
    console.log('\n📋 Step 2: Listando profiles...');
    const profilesCommand = new ScanCommand({
      TableName: 'evo-uds-profiles'
    });
    const profilesResult = await docClient.send(profilesCommand);
    console.log(`   ✅ Encontrados ${profilesResult.Count} profiles:`);
    profilesResult.Items?.forEach(profile => {
      console.log(`      - ${profile.full_name} (user_id: ${profile.user_id})`);
      console.log(`        org_id: ${profile.organization_id}`);
      console.log(`        role: ${profile.role}`);
    });

    // 3. Listar usuários do Cognito
    console.log('\n📋 Step 3: Listando usuários do Cognito...');
    const userPoolId = process.env.VITE_AWS_USER_POOL_ID;
    if (!userPoolId) {
      console.error('   ❌ VITE_AWS_USER_POOL_ID não configurado');
      return;
    }

    const cognitoClient = new CognitoIdentityProviderClient({ region });
    const usersCommand = new ListUsersCommand({
      UserPoolId: userPoolId,
      Limit: 60
    });
    const usersResult = await cognitoClient.send(usersCommand);
    
    console.log(`   ✅ Encontrados ${usersResult.Users?.length || 0} usuários:`);
    usersResult.Users?.forEach(user => {
      const email = user.Attributes?.find(a => a.Name === 'email')?.Value;
      const sub = user.Attributes?.find(a => a.Name === 'sub')?.Value;
      const name = user.Attributes?.find(a => a.Name === 'name')?.Value;
      
      console.log(`      - ${email} (${name})`);
      console.log(`        sub: ${sub}`);
      
      // Check if has profile
      const hasProfile = profilesResult.Items?.some(p => p.user_id === sub);
      if (hasProfile) {
        console.log(`        ✅ TEM PROFILE`);
      } else {
        console.log(`        ❌ SEM PROFILE`);
      }
    });

    // 4. Resumo
    console.log('\n📊 Resumo:');
    console.log(`   Organizações: ${orgsResult.Count}`);
    console.log(`   Profiles: ${profilesResult.Count}`);
    console.log(`   Usuários Cognito: ${usersResult.Users?.length || 0}`);
    
    const usersWithoutProfile = (usersResult.Users?.length || 0) - (profilesResult.Count || 0);
    if (usersWithoutProfile > 0) {
      console.log(`\n⚠️  ${usersWithoutProfile} usuário(s) sem profile!`);
      console.log('   Execute: npm run migrate:users-to-org');
    } else {
      console.log('\n✅ Todos os usuários têm profile!');
    }

  } catch (error) {
    console.error('\n❌ Erro:', error);
    process.exit(1);
  }
}

main();
