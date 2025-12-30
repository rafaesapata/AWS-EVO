#!/usr/bin/env tsx
/**
 * E2E Test Runner - Playwright + Bedrock Nova
 * 
 * Executa testes E2E reais na aplicação EVO UDS
 */

import { createPlaywrightNovaClient, type ActResult } from './lib/playwright-nova-client';
import { config } from './config/nova-act.config';
import * as fs from 'fs/promises';

interface TestResult {
  name: string;
  category: string;
  success: boolean;
  duration: number;
  steps: string[];
  error?: string;
}

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(message: string, color = COLORS.reset): void {
  console.log(`${color}${message}${COLORS.reset}`);
}

async function runTests(): Promise<void> {
  console.log('\n');
  log('╔════════════════════════════════════════════════════════════╗', COLORS.cyan);
  log('║     🤖 EVO UDS - E2E Test Suite                            ║', COLORS.cyan);
  log('║     Playwright + Amazon Bedrock Nova                       ║', COLORS.cyan);
  log('╚════════════════════════════════════════════════════════════╝', COLORS.cyan);
  console.log('\n');

  const results: TestResult[] = [];
  const startTime = Date.now();

  // Criar cliente
  const client = createPlaywrightNovaClient(config.app.baseUrl, {
    headless: config.novaAct.headless,
    timeout: 30000,
    logsDirectory: './reports/screenshots',
  });

  try {
    // Iniciar browser
    log('🚀 Iniciando browser...', COLORS.cyan);
    await client.start();
    console.log('');

    // ========================================
    // TEST 1: Login
    // ========================================
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', COLORS.dim);
    log('📋 TEST 1: Login com Credenciais Válidas', COLORS.cyan);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', COLORS.dim);
    
    const loginResult = await client.login(
      config.testUser.email,
      config.testUser.password
    );
    
    results.push({
      name: 'Login com Credenciais Válidas',
      category: 'auth',
      success: loginResult.success,
      duration: loginResult.duration,
      steps: loginResult.steps,
      error: loginResult.error,
    });
    
    loginResult.steps.forEach(step => log(`  ${step}`, COLORS.dim));
    log(loginResult.success ? '  ✅ PASSED' : `  ❌ FAILED: ${loginResult.error}`, 
        loginResult.success ? COLORS.green : COLORS.red);
    console.log('');

    if (!loginResult.success) {
      log('⚠️  Login falhou - pulando testes que requerem autenticação', COLORS.yellow);
    } else {
      // ========================================
      // TEST 2: Dashboard Load
      // ========================================
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', COLORS.dim);
      log('📋 TEST 2: Carregamento do Dashboard', COLORS.cyan);
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', COLORS.dim);
      
      const dashboardResult = await client.checkDashboard();
      
      results.push({
        name: 'Carregamento do Dashboard',
        category: 'dashboard',
        success: dashboardResult.success,
        duration: dashboardResult.duration,
        steps: dashboardResult.steps,
        error: dashboardResult.error,
      });
      
      dashboardResult.steps.forEach(step => log(`  ${step}`, COLORS.dim));
      log(dashboardResult.success ? '  ✅ PASSED' : `  ❌ FAILED: ${dashboardResult.error}`,
          dashboardResult.success ? COLORS.green : COLORS.red);
      console.log('');

      // ========================================
      // TEST 3: Navigation - Security Scans
      // ========================================
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', COLORS.dim);
      log('📋 TEST 3: Navegação para Scans de Segurança', COLORS.cyan);
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', COLORS.dim);
      
      const securityNavResult = await client.navigate('Análises');
      
      results.push({
        name: 'Navegação para Scans de Segurança',
        category: 'navigation',
        success: securityNavResult.success,
        duration: securityNavResult.duration,
        steps: securityNavResult.steps,
        error: securityNavResult.error,
      });
      
      securityNavResult.steps.forEach(step => log(`  ${step}`, COLORS.dim));
      log(securityNavResult.success ? '  ✅ PASSED' : `  ❌ FAILED: ${securityNavResult.error}`,
          securityNavResult.success ? COLORS.green : COLORS.red);
      console.log('');

      // ========================================
      // TEST 4: Navigation - Cost Optimization
      // ========================================
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', COLORS.dim);
      log('📋 TEST 4: Navegação para Otimização de Custos', COLORS.cyan);
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', COLORS.dim);
      
      const costNavResult = await client.navigate('Otimização');
      
      results.push({
        name: 'Navegação para Otimização de Custos',
        category: 'navigation',
        success: costNavResult.success,
        duration: costNavResult.duration,
        steps: costNavResult.steps,
        error: costNavResult.error,
      });
      
      costNavResult.steps.forEach(step => log(`  ${step}`, COLORS.dim));
      log(costNavResult.success ? '  ✅ PASSED' : `  ❌ FAILED: ${costNavResult.error}`,
          costNavResult.success ? COLORS.green : COLORS.red);
      console.log('');

      // ========================================
      // TEST 5: Navigation - AWS Settings
      // ========================================
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', COLORS.dim);
      log('📋 TEST 5: Navegação para Configurações AWS', COLORS.cyan);
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', COLORS.dim);
      
      const awsNavResult = await client.navigate('Configurações AWS');
      
      results.push({
        name: 'Navegação para Configurações AWS',
        category: 'navigation',
        success: awsNavResult.success,
        duration: awsNavResult.duration,
        steps: awsNavResult.steps,
        error: awsNavResult.error,
      });
      
      awsNavResult.steps.forEach(step => log(`  ${step}`, COLORS.dim));
      log(awsNavResult.success ? '  ✅ PASSED' : `  ❌ FAILED: ${awsNavResult.error}`,
          awsNavResult.success ? COLORS.green : COLORS.red);
      console.log('');

      // ========================================
      // TEST 6: Back to Dashboard
      // ========================================
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', COLORS.dim);
      log('📋 TEST 6: Voltar para Dashboard', COLORS.cyan);
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', COLORS.dim);
      
      const backResult = await client.navigate('Dashboard');
      
      results.push({
        name: 'Voltar para Dashboard',
        category: 'navigation',
        success: backResult.success,
        duration: backResult.duration,
        steps: backResult.steps,
        error: backResult.error,
      });
      
      backResult.steps.forEach(step => log(`  ${step}`, COLORS.dim));
      log(backResult.success ? '  ✅ PASSED' : `  ❌ FAILED: ${backResult.error}`,
          backResult.success ? COLORS.green : COLORS.red);
      console.log('');

      // ========================================
      // TEST 7: Logout
      // ========================================
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', COLORS.dim);
      log('📋 TEST 7: Logout', COLORS.cyan);
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', COLORS.dim);
      
      const logoutResult = await client.logout();
      
      results.push({
        name: 'Logout',
        category: 'auth',
        success: logoutResult.success,
        duration: logoutResult.duration,
        steps: logoutResult.steps,
        error: logoutResult.error,
      });
      
      logoutResult.steps.forEach(step => log(`  ${step}`, COLORS.dim));
      log(logoutResult.success ? '  ✅ PASSED' : `  ❌ FAILED: ${logoutResult.error}`,
          logoutResult.success ? COLORS.green : COLORS.red);
      console.log('');
    }

  } catch (error) {
    log(`\n❌ Erro fatal: ${error}`, COLORS.red);
  } finally {
    await client.stop();
  }

  // ========================================
  // SUMMARY
  // ========================================
  const totalDuration = Date.now() - startTime;
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const total = results.length;

  console.log('\n');
  log('╔════════════════════════════════════════════════════════════╗', COLORS.cyan);
  log('║                    📊 RESUMO DOS TESTES                    ║', COLORS.cyan);
  log('╚════════════════════════════════════════════════════════════╝', COLORS.cyan);
  console.log('');
  
  log(`  Total de testes: ${total}`, COLORS.reset);
  log(`  ✅ Passou: ${passed}`, COLORS.green);
  log(`  ❌ Falhou: ${failed}`, COLORS.red);
  log(`  ⏱️  Duração: ${(totalDuration / 1000).toFixed(2)}s`, COLORS.dim);
  log(`  📈 Taxa de sucesso: ${((passed / total) * 100).toFixed(1)}%`, 
      passed === total ? COLORS.green : COLORS.yellow);
  
  console.log('');

  // Salvar relatório JSON
  const reportPath = './reports/e2e-report.json';
  await fs.mkdir('./reports', { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    duration: totalDuration,
    summary: { total, passed, failed },
    results,
  }, null, 2));
  
  log(`📄 Relatório salvo em: ${reportPath}`, COLORS.dim);
  log(`📸 Screenshots em: ./reports/screenshots/`, COLORS.dim);
  console.log('');

  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

// Run
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
