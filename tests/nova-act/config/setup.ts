/**
 * Test Setup - Configuração inicial dos testes
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { config } from './nova-act.config';

// Validar configuração antes de executar testes
beforeAll(async () => {
  console.log('\n🚀 Iniciando suite de testes Nova Act...\n');
  
  // Verificar se Nova Act está configurado
  if (!config.novaAct.apiKey && !config.novaAct.useIAM) {
    console.warn('⚠️  NOVA_ACT_API_KEY não configurada. Usando IAM credentials.');
  }
  
  // Verificar credenciais de teste
  if (!config.testUser.email || !config.testUser.password) {
    throw new Error('❌ TEST_USER_EMAIL e TEST_USER_PASSWORD são obrigatórios');
  }
  
  // Verificar URL da aplicação
  console.log(`📍 URL da aplicação: ${config.app.baseUrl}`);
  console.log(`📍 Ambiente: ${config.app.environment}`);
  console.log(`📍 Headless: ${config.novaAct.headless}`);
  console.log(`📍 Record Video: ${config.novaAct.recordVideo}\n`);
});

afterAll(async () => {
  console.log('\n✅ Suite de testes Nova Act finalizada.\n');
});

// Log antes de cada teste
beforeEach(async (context) => {
  const testName = context.task.name;
  console.log(`\n▶️  Executando: ${testName}`);
});

// Log após cada teste
afterEach(async (context) => {
  const testName = context.task.name;
  const duration = context.task.result?.duration || 0;
  const status = context.task.result?.state === 'pass' ? '✅' : '❌';
  console.log(`${status} ${testName} (${(duration / 1000).toFixed(2)}s)`);
});

// Exportar helpers globais
export const testHelpers = {
  /**
   * Aguardar um tempo específico
   */
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  /**
   * Gerar timestamp único para testes
   */
  timestamp: () => new Date().toISOString().replace(/[:.]/g, '-'),
  
  /**
   * Verificar se estamos em CI
   */
  isCI: () => process.env.CI === 'true',
};
