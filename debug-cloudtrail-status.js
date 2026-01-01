/**
 * Script para verificar status das análises CloudTrail
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

async function checkCloudTrailStatus() {
  const lambdaClient = new LambdaClient({ region: 'us-east-1' });
  
  try {
    console.log('🔍 Verificando status das análises CloudTrail...');
    
    // Consultar análises CloudTrail
    const queryPayload = {
      requestContext: { http: { method: 'POST' } },
      headers: { Authorization: 'Bearer dummy' },
      body: JSON.stringify({
        table: 'cloudtrail_analyses',
        order: { column: 'created_at', ascending: false },
        limit: 10
      })
    };
    
    const command = new InvokeCommand({
      FunctionName: 'evo-uds-v3-production-query-table',
      Payload: Buffer.from(JSON.stringify(queryPayload))
    });
    
    const response = await lambdaClient.send(command);
    const result = JSON.parse(Buffer.from(response.Payload).toString());
    
    console.log('📊 Status das análises CloudTrail:');
    console.log(JSON.stringify(result, null, 2));
    
    // Se houver análises em execução, mostrar detalhes
    if (result.data && result.data.length > 0) {
      const runningAnalyses = result.data.filter(a => a.status === 'running');
      if (runningAnalyses.length > 0) {
        console.log('\n⚠️  Análises em execução encontradas:');
        runningAnalyses.forEach(analysis => {
          const startTime = new Date(analysis.started_at);
          const now = new Date();
          const runningMinutes = Math.floor((now - startTime) / (1000 * 60));
          
          console.log(`- ID: ${analysis.id}`);
          console.log(`  Status: ${analysis.status}`);
          console.log(`  Conta: ${analysis.aws_account_id}`);
          console.log(`  Iniciado: ${analysis.started_at}`);
          console.log(`  Executando há: ${runningMinutes} minutos`);
          console.log('');
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Erro ao verificar status:', error);
  }
}

checkCloudTrailStatus();