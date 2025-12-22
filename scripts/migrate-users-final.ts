#!/usr/bin/env tsx
/**
 * Script de Migração: Vincular Usuários à Organização UDS (DynamoDB)
 * Versão Final - Usando Raw DynamoDB Client
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { 
  CognitoIdentityProviderClient, 
  ListUsersCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { 
  DynamoDBClient, 
  PutItemCommand,
  ScanCommand
} from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';

// Load environment variables (but don't override AWS credentials from ~/.aws/credentials)
config({ path: resolve(process.cwd(), '.env'), override: false });

const region = 'us-east-1';

// Force use of default AWS credentials profile
const dynamoClient = new DynamoDBClient({ 
  region
  // Let SDK use default credential chain (~/.aws/credentials)
});

const ORGANIZATIONS_TABLE = 'evo-uds-organizations';
const PROFILES_TABLE = 'evo-uds-profiles';

interface CognitoUser {
  username: string;
  userId: string;
  email: string;
  name?: string;
}

async function getOrganizationBySlug(slug: string): Promise<any | null> {
  try {
    // Scan all items without filter first
    const command = new ScanCommand({
      TableName: ORGANIZATIONS_TABLE
    });

    const response = await dynamoClient.send(command);
    if (response.Items && response.Items.length > 0) {
      // Filter manually
      for (const item of response.Items) {
        if (item.slug && item.slug.S === slug) {
          return {
            id: item.id.S,
            name: item.name.S,
            slug: item.slug.S,
            created_at: item.created_at.S,
            updated_at: item.updated_at.S
          };
        }
      }
    }
    return null;
  } catch (error: any) {
    console.error('Erro ao buscar organização:', error.message);
    return null;
  }
}

async function createOrganization(name: string, slug: string): Promise<any> {
  const now = new Date().toISOString();
  const id = randomUUID();

  const command = new PutItemCommand({
    TableName: ORGANIZATIONS_TABLE,
    Item: {
      id: { S: id },
      name: { S: name },
      slug: { S: slug },
      created_at: { S: now },
      updated_at: { S: now }
    }
  });

  await dynamoClient.send(command);
  return { id, name, slug, created_at: now, updated_at: now };
}

async function getProfileByUserId(userId: string): Promise<any | null> {
  try {
    const command = new ScanCommand({
      TableName: PROFILES_TABLE,
      FilterExpression: 'user_id = :user_id',
      ExpressionAttributeValues: {
        ':user_id': { S: userId }
      }
    });

    const response = await dynamoClient.send(command);
    if (response.Items && response.Items.length > 0) {
      const item = response.Items[0];
      return {
        id: item.id.S,
        user_id: item.user_id.S,
        organization_id: item.organization_id.S,
        full_name: item.full_name?.S,
        role: item.role.S
      };
    }
    return null;
  } catch (error: any) {
    console.error('Erro ao buscar profile:', error.message);
    return null;
  }
}

async function createProfile(userId: string, organizationId: string, fullName: string): Promise<any> {
  const now = new Date().toISOString();
  const id = randomUUID();

  const command = new PutItemCommand({
    TableName: PROFILES_TABLE,
    Item: {
      id: { S: id },
      user_id: { S: userId },
      organization_id: { S: organizationId },
      full_name: { S: fullName },
      role: { S: 'user' },
      created_at: { S: now },
      updated_at: { S: now }
    }
  });

  await dynamoClient.send(command);
  return { id, user_id: userId, organization_id: organizationId, full_name: fullName, role: 'user' };
}

async function listCognitoUsers(): Promise<CognitoUser[]> {
  const userPoolId = process.env.VITE_AWS_USER_POOL_ID || process.env.USER_POOL_ID;
  const cognitoRegion = userPoolId?.split('_')[0] || region;

  if (!userPoolId) {
    throw new Error('USER_POOL_ID não configurado. Configure VITE_AWS_USER_POOL_ID ou USER_POOL_ID');
  }

  const cognitoClient = new CognitoIdentityProviderClient({ region: cognitoRegion });
  const users: CognitoUser[] = [];

  try {
    let paginationToken: string | undefined;

    do {
      const command = new ListUsersCommand({
        UserPoolId: userPoolId,
        PaginationToken: paginationToken,
        Limit: 60,
      });

      const response = await cognitoClient.send(command);

      if (response.Users) {
        for (const user of response.Users) {
          const email = user.Attributes?.find(attr => attr.Name === 'email')?.Value;
          const name = user.Attributes?.find(attr => attr.Name === 'name')?.Value;
          const sub = user.Attributes?.find(attr => attr.Name === 'sub')?.Value;

          if (email && sub) {
            users.push({
              username: user.Username || email,
              userId: sub,
              email,
              name,
            });
          }
        }
      }

      paginationToken = response.PaginationToken;
    } while (paginationToken);

    return users;
  } catch (error) {
    console.error('Erro ao listar usuários do Cognito:', error);
    throw error;
  }
}

async function countProfilesByOrganization(organizationId: string): Promise<number> {
  try {
    const command = new ScanCommand({
      TableName: PROFILES_TABLE,
      FilterExpression: 'organization_id = :org_id',
      ExpressionAttributeValues: {
        ':org_id': { S: organizationId }
      },
      Select: 'COUNT'
    });

    const response = await dynamoClient.send(command);
    return response.Count || 0;
  } catch (error: any) {
    console.error('Erro ao contar profiles:', error.message);
    return 0;
  }
}

async function main() {
  console.log('🚀 Iniciando migração de usuários para organização UDS (DynamoDB)...\n');

  try {
    // Step 1: Criar ou obter organização UDS
    console.log('📋 Step 1: Verificando organização UDS...');
    let organization = await getOrganizationBySlug('uds');

    if (!organization) {
      console.log('   ➕ Criando organização UDS...');
      organization = await createOrganization('UDS', 'uds');
      console.log(`   ✅ Organização UDS criada: ${organization.id}`);
    } else {
      console.log(`   ✅ Organização UDS já existe: ${organization.id}`);
    }

    // Step 2: Listar usuários do Cognito
    console.log('\n📋 Step 2: Listando usuários do Cognito...');
    const cognitoUsers = await listCognitoUsers();
    console.log(`   ✅ Encontrados ${cognitoUsers.length} usuários no Cognito`);

    // Step 3: Verificar e criar profiles
    console.log('\n📋 Step 3: Verificando e criando profiles...');
    let createdCount = 0;
    let existingCount = 0;
    let errorCount = 0;

    for (const cognitoUser of cognitoUsers) {
      try {
        // Verificar se já existe profile
        const existingProfile = await getProfileByUserId(cognitoUser.userId);

        if (existingProfile) {
          console.log(`   ⏭️  Usuário ${cognitoUser.email} já possui profile`);
          existingCount++;
          continue;
        }

        // Criar profile vinculado à organização UDS
        const profile = await createProfile(
          cognitoUser.userId,
          organization.id,
          cognitoUser.name || cognitoUser.email
        );

        console.log(`   ✅ Profile criado para ${cognitoUser.email} (${profile.id})`);
        createdCount++;
      } catch (error) {
        console.error(`   ❌ Erro ao criar profile para ${cognitoUser.email}:`, error);
        errorCount++;
      }
    }

    // Step 4: Resumo
    console.log('\n📊 Resumo da Migração:');
    console.log(`   Total de usuários no Cognito: ${cognitoUsers.length}`);
    console.log(`   Profiles criados: ${createdCount}`);
    console.log(`   Profiles já existentes: ${existingCount}`);
    console.log(`   Erros: ${errorCount}`);

    // Step 5: Verificar resultado
    console.log('\n📋 Step 5: Verificando resultado...');
    const profileCount = await countProfilesByOrganization(organization.id);
    console.log(`   ✅ Total de profiles na organização UDS: ${profileCount}`);

    console.log('\n✅ Migração concluída com sucesso!');
  } catch (error) {
    console.error('\n❌ Erro durante a migração:', error);
    process.exit(1);
  }
}

main().catch(console.error);
