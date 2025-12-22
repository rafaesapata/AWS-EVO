#!/usr/bin/env node
import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

interface ConnectionTest {
  success: boolean;
  message: string;
  details?: any;
}

function log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warning: '\x1b[33m',
  };
  const reset = '\x1b[0m';
  console.log(`${colors[type]}${message}${reset}`);
}

async function testConnection(): Promise<ConnectionTest> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return {
      success: false,
      message: 'DATABASE_URL não encontrada no .env',
    };
  }

  log('🔍 Testando conexão com o RDS...', 'info');
  log(`📡 URL: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}`, 'info');

  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false, // Para desenvolvimento
    },
  });

  try {
    // Conectar
    await client.connect();
    log('✅ Conexão estabelecida!', 'success');

    // Testar query
    const versionResult = await client.query('SELECT version()');
    const version = versionResult.rows[0].version;
    log(`✅ PostgreSQL Version: ${version.split(',')[0]}`, 'success');

    // Verificar database
    const dbResult = await client.query('SELECT current_database()');
    const database = dbResult.rows[0].current_database;
    log(`✅ Database: ${database}`, 'success');

    // Verificar usuário
    const userResult = await client.query('SELECT current_user');
    const user = userResult.rows[0].current_user;
    log(`✅ User: ${user}`, 'success');

    // Listar tabelas
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    log(`\n📊 Tabelas encontradas: ${tablesResult.rows.length}`, 'info');
    if (tablesResult.rows.length > 0) {
      tablesResult.rows.forEach(row => {
        log(`   - ${row.table_name}`, 'info');
      });
    } else {
      log('   (Nenhuma tabela encontrada - execute as migrations)', 'warning');
    }

    // Verificar extensões
    const extensionsResult = await client.query(`
      SELECT extname, extversion 
      FROM pg_extension 
      WHERE extname != 'plpgsql'
      ORDER BY extname
    `);
    
    if (extensionsResult.rows.length > 0) {
      log(`\n🔌 Extensões instaladas: ${extensionsResult.rows.length}`, 'info');
      extensionsResult.rows.forEach(row => {
        log(`   - ${row.extname} (v${row.extversion})`, 'info');
      });
    }

    // Estatísticas do banco
    const statsResult = await client.query(`
      SELECT 
        pg_size_pretty(pg_database_size(current_database())) as size,
        (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) as connections
    `);
    
    log(`\n📈 Estatísticas:`, 'info');
    log(`   - Tamanho: ${statsResult.rows[0].size}`, 'info');
    log(`   - Conexões ativas: ${statsResult.rows[0].connections}`, 'info');

    await client.end();

    return {
      success: true,
      message: 'Conexão testada com sucesso!',
      details: {
        version: version.split(',')[0],
        database,
        user,
        tables: tablesResult.rows.length,
        size: statsResult.rows[0].size,
        connections: statsResult.rows[0].connections,
      },
    };
  } catch (error: any) {
    log(`❌ Erro ao conectar: ${error.message}`, 'error');
    
    if (error.code === 'ENOTFOUND') {
      log('\n💡 Dica: Verifique se o endpoint do RDS está correto', 'warning');
    } else if (error.code === 'ECONNREFUSED') {
      log('\n💡 Dica: O RDS pode estar iniciando (aguarde 5-10 minutos)', 'warning');
    } else if (error.code === '28P01') {
      log('\n💡 Dica: Credenciais inválidas. Execute: npm run rds:credentials', 'warning');
    } else if (error.code === 'ETIMEDOUT') {
      log('\n💡 Dica: Verifique Security Groups e regras de firewall', 'warning');
    }

    return {
      success: false,
      message: error.message,
      details: {
        code: error.code,
        hint: error.hint,
      },
    };
  }
}

async function main() {
  log('\n🧪 Teste de Conexão RDS PostgreSQL\n', 'info');

  const result = await testConnection();

  if (result.success) {
    log('\n✅ Teste concluído com sucesso!', 'success');
    log('\n📋 Próximos passos:', 'info');
    log('   1. Executar migrations: npx prisma migrate deploy', 'info');
    log('   2. Seed inicial: npx prisma db seed', 'info');
    log('   3. Iniciar aplicação: npm run dev', 'info');
  } else {
    log('\n❌ Teste falhou!', 'error');
    log('\n🔧 Troubleshooting:', 'info');
    log('   1. Verificar DATABASE_URL no .env', 'info');
    log('   2. Obter credenciais: npm run rds:credentials', 'info');
    log('   3. Atualizar .env: ./scripts/update-env-with-rds.sh development', 'info');
    log('   4. Verificar status: aws rds describe-db-instances --db-instance-identifier evo-uds-dev', 'info');
    process.exit(1);
  }
}

main();
