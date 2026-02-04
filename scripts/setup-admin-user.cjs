#!/usr/bin/env node

/**
 * Script para configurar usuário admin no banco de dados
 */

const { Client } = require('pg');

async function setupAdminUser() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔌 Conectando ao banco de dados...');
    await client.connect();
    console.log('✅ Conectado ao banco de dados');

    // Verificar se existe a tabela organizations
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('organizations', 'profiles')
    `);

    console.log('📋 Tabelas encontradas:', tablesResult.rows.map(r => r.table_name));

    if (tablesResult.rows.length === 0) {
      console.log('⚠️  Tabelas não encontradas. Execute as migrações do Prisma primeiro.');
      return;
    }

    // Verificar se já existe uma organização
    const orgResult = await client.query('SELECT * FROM organizations LIMIT 1');
    
    let organizationId;
    if (orgResult.rows.length === 0) {
      console.log('🏢 Criando organização padrão...');
      const createOrgResult = await client.query(`
        INSERT INTO organizations (id, name, slug, created_at, updated_at) 
        VALUES (gen_random_uuid(), 'EVO Platform Admin', 'evo-platform-admin', NOW(), NOW())
        RETURNING id
      `);
      organizationId = createOrgResult.rows[0].id;
      console.log('✅ Organização criada:', organizationId);
    } else {
      organizationId = orgResult.rows[0].id;
      console.log('✅ Organização existente encontrada:', organizationId);
    }

    // Verificar se já existe um perfil para o usuário admin
    const profileResult = await client.query(`
      SELECT * FROM profiles 
      WHERE user_id = $1 OR email = $2
    `, ['admin-user', 'admin@evouds.com']);

    if (profileResult.rows.length === 0) {
      console.log('👤 Criando perfil admin...');
      await client.query(`
        INSERT INTO profiles (id, user_id, organization_id, email, full_name, role, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
      `, ['admin-user', organizationId, 'admin@evouds.com', 'Admin User', 'admin']);
      console.log('✅ Perfil admin criado');
    } else {
      console.log('✅ Perfil admin já existe');
    }

    // Verificar dados finais
    const finalCheck = await client.query(`
      SELECT 
        p.user_id,
        p.email,
        p.full_name,
        p.role,
        o.name as organization_name
      FROM profiles p
      JOIN organizations o ON p.organization_id = o.id
      WHERE p.user_id = $1 OR p.email = $2
    `, ['admin-user', 'admin@evouds.com']);

    if (finalCheck.rows.length > 0) {
      console.log('🎉 Configuração do usuário admin concluída:');
      console.log('   User ID:', finalCheck.rows[0].user_id);
      console.log('   Email:', finalCheck.rows[0].email);
      console.log('   Nome:', finalCheck.rows[0].full_name);
      console.log('   Role:', finalCheck.rows[0].role);
      console.log('   Organização:', finalCheck.rows[0].organization_name);
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Verificar se DATABASE_URL está definida
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não está definida');
  process.exit(1);
}

setupAdminUser().catch(console.error);