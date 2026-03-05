#!/usr/bin/env node
/**
 * Compara estruturas dos bancos Sandbox e Production
 * Verifica se todas as tabelas e colunas estão sincronizadas
 */

const { Client } = require('pg');

const PRODUCTION_CONFIG = {
  host: 'localhost',
  port: 15433, // Porta customizada para evitar conflito com sandbox direto
  database: 'evouds',
  user: 'evoadmin',
  password: 'xJB8g6z84PzUYRhWMM8QkkQb',
};

const SANDBOX_CONFIG = {
  host: 'evo-uds-v3-sandbox-postgres.csno4kowwmc9.us-east-1.rds.amazonaws.com',
  port: 5432,
  database: 'evouds',
  user: 'evoadmin',
  password: 'SandboxEvo2026Safe',
};

async function getSchema(config) {
  const client = new Client(config);
  await client.connect();

  const query = `
    SELECT 
      table_name,
      column_name,
      data_type,
      character_maximum_length,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `;

  const result = await client.query(query);
  await client.end();

  const schema = new Map();
  for (const row of result.rows) {
    if (!schema.has(row.table_name)) {
      schema.set(row.table_name, []);
    }
    schema.get(row.table_name).push(row);
  }

  return schema;
}

async function main() {
  console.log('🔍 Comparando estruturas dos bancos Sandbox e Production...\n');

  let prodSchema;
  let sandboxSchema;

  // TEMPORÁRIO: Conectar apenas ao Sandbox para validar
  console.log('⚠️  MODO TEMPORÁRIO: Comparando apenas estrutura do Sandbox\n');

  try {
    console.log('📊 Conectando ao Sandbox...');
    sandboxSchema = await getSchema(SANDBOX_CONFIG);
    console.log(`✅ Sandbox: ${sandboxSchema.size} tabelas encontradas\n`);
    
    // Listar todas as tabelas
    console.log('📋 Tabelas no Sandbox:');
    const tables = Array.from(sandboxSchema.keys()).sort();
    tables.forEach(t => {
      const cols = sandboxSchema.get(t);
      console.log(`   ${t} (${cols.length} colunas)`);
    });
    
    console.log('\n✅ Conexão ao Sandbox funcionando!\n');
    console.log('💡 Próximo passo: Configurar acesso ao Production via bastion/tunnel\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao conectar ao Sandbox:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
