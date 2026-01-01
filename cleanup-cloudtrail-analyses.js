/**
 * Script para limpar análises CloudTrail travadas
 * Executa via Lambda invoke
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

async function cleanupCloudTrailAnalyses() {
  const lambdaClient = new LambdaClient({ region: 'us-east-1' });
  
  try {
    console.log('🧹 Executando limpeza de análises CloudTrail travadas...');
    
    // Payload para limpeza com threshold de 30 minutos
    const payload = {
      thresholdMinutes: 30,
      dryRun: false
    };
    
    const command = new InvokeCommand({
      FunctionName: 'evo-uds-v3-production-cleanup-stuck-scans',
      Payload: Buffer.from(JSON.stringify(payload))
    });
    
    const response = await lambdaClient.send(command);
    const result = JSON.parse(Buffer.from(response.Payload).toString());
    
    console.log('✅ Resultado da limpeza:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Erro na limpeza:', error);
  }
}

cleanupCloudTrailAnalyses();