#!/usr/bin/env tsx
import { DynamoDBClient, ListTablesCommand, PutItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({ region: 'us-east-1' });

async function verify() {
  console.log('=== Verificando acesso ao DynamoDB ===\n');
  
  // Test 1: List tables
  console.log('1. Listando tabelas...');
  try {
    const listCmd = new ListTablesCommand({});
    const listResult = await client.send(listCmd);
    console.log('✅ Tabelas encontradas:', listResult.TableNames);
  } catch (error: any) {
    console.error('❌ Erro ao listar tabelas:', error.message);
    return;
  }
  
  // Test 2: Put item
  console.log('\n2. Inserindo item de teste...');
  try {
    const putCmd = new PutItemCommand({
      TableName: 'evo-uds-organizations',
      Item: {
        id: { S: 'verify-test-' + Date.now() },
        name: { S: 'Verify Test' },
        slug: { S: 'verify-test' },
        created_at: { S: new Date().toISOString() },
        updated_at: { S: new Date().toISOString() }
      }
    });
    await client.send(putCmd);
    console.log('✅ Item inserido com sucesso');
  } catch (error: any) {
    console.error('❌ Erro ao inserir item:', error.message);
    console.error('Error name:', error.name);
    console.error('Metadata:', error.$metadata);
    return;
  }
  
  // Test 3: Scan
  console.log('\n3. Lendo itens...');
  try {
    const scanCmd = new ScanCommand({
      TableName: 'evo-uds-organizations',
      Limit: 5
    });
    const scanResult = await client.send(scanCmd);
    console.log('✅ Itens encontrados:', scanResult.Count);
    console.log('Items:', JSON.stringify(scanResult.Items, null, 2));
  } catch (error: any) {
    console.error('❌ Erro ao ler itens:', error.message);
    return;
  }
  
  console.log('\n✅ Todos os testes passaram! DynamoDB está acessível.');
}

verify();
