#!/usr/bin/env node

/**
 * Script para migrar usuários do Supabase para AWS Cognito
 * 
 * Uso:
 *   node scripts/migrate-users-to-cognito.js \
 *     --user-pool-id us-east-1_XXXXXXXXX \
 *     --input users_export.json
 */

import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
import fs from 'fs/promises';

async function migrateUsers() {
  const args = process.argv.slice(2);
  const userPoolId = args[args.indexOf('--user-pool-id') + 1];
  const inputFile = args[args.indexOf('--input') + 1];

  if (!userPoolId || !inputFile) {
    console.error('❌ Missing required arguments');
    console.log('Usage: node migrate-users-to-cognito.js --user-pool-id POOL_ID --input FILE');
    process.exit(1);
  }

  console.log('🚀 Starting user migration to Cognito');
  console.log(`📋 User Pool: ${userPoolId}`);
  console.log(`📄 Input file: ${inputFile}`);

  const client = new CognitoIdentityProviderClient({});

  // Ler arquivo de usuários
  const usersData = await fs.readFile(inputFile, 'utf-8');
  const users = JSON.parse(usersData);

  console.log(`👥 Found ${users.length} users to migrate`);

  let successCount = 0;
  let errorCount = 0;

  for (const user of users) {
    try {
      console.log(`\n📝 Migrating user: ${user.email}`);

      // Criar usuário no Cognito
      const createCommand = new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: user.email,
        UserAttributes: [
          { Name: 'email', Value: user.email },
          { Name: 'email_verified', Value: 'true' },
          ...(user.raw_user_meta_data?.full_name ? [{ Name: 'name', Value: user.raw_user_meta_data.full_name }] : []),
        ],
        MessageAction: 'SUPPRESS', // Não enviar email de boas-vindas
        TemporaryPassword: generateTemporaryPassword(),
      });

      await client.send(createCommand);

      // Atualizar atributos customizados se existirem
      if (user.raw_user_meta_data?.organization_id) {
        const updateCommand = new AdminUpdateUserAttributesCommand({
          UserPoolId: userPoolId,
          Username: user.email,
          UserAttributes: [
            { Name: 'custom:organization_id', Value: user.raw_user_meta_data.organization_id },
            ...(user.raw_user_meta_data.tenant_id ? [{ Name: 'custom:tenant_id', Value: user.raw_user_meta_data.tenant_id }] : []),
            ...(user.raw_user_meta_data.roles ? [{ Name: 'custom:roles', Value: JSON.stringify(user.raw_user_meta_data.roles) }] : []),
          ],
        });

        await client.send(updateCommand);
      }

      console.log(`✅ User ${user.email} migrated successfully`);
      successCount++;

    } catch (error) {
      console.error(`❌ Failed to migrate user ${user.email}:`, error.message);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Migration Summary:');
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`📈 Total: ${users.length}`);
  console.log('='.repeat(50));

  console.log('\n⚠️  IMPORTANT: Users will need to reset their password on first login');
  console.log('   Cognito cannot import password hashes from Supabase');
}

function generateTemporaryPassword() {
  // Gerar senha temporária forte
  const length = 16;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  
  // Garantir pelo menos um de cada tipo
  password += 'A'; // Uppercase
  password += 'a'; // Lowercase
  password += '1'; // Number
  password += '!'; // Symbol
  
  // Preencher o resto
  for (let i = password.length; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  // Embaralhar
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

migrateUsers().catch(console.error);
