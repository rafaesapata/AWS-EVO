#!/usr/bin/env tsx
/**
 * Script de Setup: Criar Tabelas DynamoDB
 * 
 * Este script cria as tabelas necessárias no DynamoDB:
 * 1. Organizations - Tabela de organizações
 * 2. Profiles - Tabela de perfis de usuários
 */

import { 
  DynamoDBClient, 
  CreateTableCommand,
  DescribeTableCommand,
  ListTablesCommand
} from '@aws-sdk/client-dynamodb';

const region = process.env.VITE_AWS_REGION || 'us-east-1';
const client = new DynamoDBClient({ region });

interface TableConfig {
  tableName: string;
  keySchema: any[];
  attributeDefinitions: any[];
  globalSecondaryIndexes?: any[];
}

const tables: TableConfig[] = [
  {
    tableName: 'evo-uds-organizations',
    keySchema: [
      { AttributeName: 'id', KeyType: 'HASH' }
    ],
    attributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' }
    ]
  },
  {
    tableName: 'evo-uds-profiles',
    keySchema: [
      { AttributeName: 'id', KeyType: 'HASH' }
    ],
    attributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' }
    ]
  }
];

async function tableExists(tableName: string): Promise<boolean> {
  try {
    const command = new DescribeTableCommand({ TableName: tableName });
    await client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
}

async function createTable(config: TableConfig): Promise<void> {
  const { tableName, keySchema, attributeDefinitions, globalSecondaryIndexes } = config;

  console.log(`\n📋 Criando tabela: ${tableName}...`);

  const exists = await tableExists(tableName);
  if (exists) {
    console.log(`   ⏭️  Tabela ${tableName} já existe`);
    return;
  }

  const params: any = {
    TableName: tableName,
    KeySchema: keySchema,
    AttributeDefinitions: attributeDefinitions,
    BillingMode: 'PAY_PER_REQUEST'
  };

  if (globalSecondaryIndexes && globalSecondaryIndexes.length > 0) {
    params.GlobalSecondaryIndexes = globalSecondaryIndexes;
    params.BillingMode = 'PROVISIONED';
    params.ProvisionedThroughput = {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    };
  }

  const command = new CreateTableCommand(params);

  try {
    await client.send(command);
    console.log(`   ✅ Tabela ${tableName} criada com sucesso`);
    
    // Aguardar a tabela ficar ativa
    console.log(`   ⏳ Aguardando tabela ${tableName} ficar ativa...`);
    let isActive = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!isActive && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const describeCommand = new DescribeTableCommand({ TableName: tableName });
      const response = await client.send(describeCommand);
      
      if (response.Table?.TableStatus === 'ACTIVE') {
        isActive = true;
        console.log(`   ✅ Tabela ${tableName} está ativa`);
      } else {
        attempts++;
        process.stdout.write('.');
      }
    }

    if (!isActive) {
      console.log(`   ⚠️  Timeout aguardando tabela ${tableName} ficar ativa`);
    }
  } catch (error: any) {
    console.error(`   ❌ Erro ao criar tabela ${tableName}:`, error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Iniciando setup das tabelas DynamoDB...');
  console.log(`📍 Região: ${region}\n`);

  try {
    // Listar tabelas existentes
    const listCommand = new ListTablesCommand({});
    const listResponse = await client.send(listCommand);
    console.log('📋 Tabelas existentes:', listResponse.TableNames?.length || 0);

    // Criar cada tabela
    for (const tableConfig of tables) {
      await createTable(tableConfig);
    }

    console.log('\n✅ Setup concluído com sucesso!');
    console.log('\n📊 Resumo:');
    console.log(`   - Organizations: evo-uds-organizations`);
    console.log(`   - Profiles: evo-uds-profiles`);
    console.log('\n💡 Próximo passo: Execute "npm run migrate:users-to-org" para migrar os usuários');

  } catch (error: any) {
    console.error('\n❌ Erro durante o setup:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
