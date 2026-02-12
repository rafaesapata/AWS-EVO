#!/usr/bin/env tsx
/**
 * Nova Act Test Runner - Script principal de execução
 * 
 * Uso:
 *   npx tsx run-tests.ts                    # Todos os testes
 *   npx tsx run-tests.ts --category auth    # Apenas testes de auth
 *   npx tsx run-tests.ts --priority critical # Apenas testes críticos
 *   npx tsx run-tests.ts --parallel 4       # 4 sessões paralelas
 */

import { createTestRunner, type TestCase } from './lib/test-runner';
import { generateHtmlReport, generateJsonReport, generateConsoleReport } from './lib/report-generator';
import { config } from './config/nova-act.config';
import { logger, ensureDir } from './lib/utils';
import * as path from 'path';

// Definição dos casos de teste
const TEST_CASES: TestCase[] = [
  // Auth Tests
  {
    id: 'auth-login-valid',
    name: 'Login com Credenciais Válidas',
    description: 'Verifica se o login funciona com credenciais corretas',
    category: 'auth',
    priority: 'critical',
    tags: ['login', 'smoke'],
    steps: [
      {
        name: 'Carregar página de login',
        action: 'Navigate to the login page and verify it loaded with email and password fields',
      },
      {
        name: 'Preencher email',
        action: `Fill the email input field with "${config.testUser.email}"`,
      },
      {
        name: 'Preencher senha',
        action: `Fill the password input field with "${config.testUser.password}"`,
      },
      {
        name: 'Clicar em login',
        action: 'Click the login button or Entrar button',
      },
      {
        name: 'Verificar dashboard',
        action: 'Wait for dashboard to load and verify KPI cards are visible',
        expectedResult: 'dashboard',
      },
    ],
  },
  {
    id: 'auth-login-invalid',
    name: 'Login com Credenciais Inválidas',
    description: 'Verifica se o sistema exibe erro para credenciais incorretas',
    category: 'auth',
    priority: 'high',
    tags: ['login', 'error-handling'],
    steps: [
      {
        name: 'Carregar página de login',
        action: 'Navigate to the login page',
      },
      {
        name: 'Preencher credenciais inválidas',
        action: 'Fill email with "invalid@test.com" and password with "wrongpassword"',
      },
      {
        name: 'Tentar login',
        action: 'Click the login button',
      },
      {
        name: 'Verificar mensagem de erro',
        action: 'Check if an error message is displayed about invalid credentials',
        expectedResult: 'error',
      },
    ],
  },

  // Dashboard Tests
  {
    id: 'dashboard-load',
    name: 'Carregamento do Dashboard',
    description: 'Verifica se o dashboard carrega corretamente após login',
    category: 'dashboard',
    priority: 'critical',
    tags: ['dashboard', 'smoke'],
    steps: [
      {
        name: 'Login',
        action: `Login with email "${config.testUser.email}" and password "${config.testUser.password}"`,
      },
      {
        name: 'Verificar KPI de Custo',
        action: 'Verify that the monthly cost card is visible',
      },
      {
        name: 'Verificar KPI de Segurança',
        action: 'Verify that the security score card is visible',
      },
      {
        name: 'Verificar KPI de Alertas',
        action: 'Verify that the active alerts card is visible',
      },
      {
        name: 'Verificar Sidebar',
        action: 'Verify that the navigation sidebar is visible',
      },
    ],
  },
  {
    id: 'dashboard-navigation',
    name: 'Navegação do Dashboard',
    description: 'Verifica se a navegação entre páginas funciona',
    category: 'dashboard',
    priority: 'high',
    tags: ['navigation'],
    steps: [
      {
        name: 'Login',
        action: `Login with email "${config.testUser.email}" and password "${config.testUser.password}"`,
      },
      {
        name: 'Navegar para Security Scans',
        action: 'Click on Security Scans in the sidebar',
      },
      {
        name: 'Verificar página Security',
        action: 'Verify that the security scans page loaded',
        expectedResult: 'security',
      },
      {
        name: 'Navegar para Cost Optimization',
        action: 'Click on Cost Optimization in the sidebar',
      },
      {
        name: 'Verificar página Cost',
        action: 'Verify that the cost optimization page loaded',
        expectedResult: 'cost',
      },
      {
        name: 'Voltar para Dashboard',
        action: 'Click on Dashboard in the sidebar',
      },
    ],
  },

  // Security Tests
  {
    id: 'security-scans-list',
    name: 'Lista de Security Scans',
    description: 'Verifica se a lista de scans é exibida corretamente',
    category: 'security',
    priority: 'high',
    tags: ['security', 'scans'],
    steps: [
      {
        name: 'Login e navegar',
        action: `Login and navigate to Security Scans page`,
      },
      {
        name: 'Verificar lista de scans',
        action: 'Verify that a list of security scans is displayed',
      },
      {
        name: 'Verificar botão novo scan',
        action: 'Verify that a button to run new scan is visible',
      },
      {
        name: 'Verificar filtros',
        action: 'Verify that filter options are available',
      },
    ],
  },
  {
    id: 'security-posture',
    name: 'Security Posture Score',
    description: 'Verifica se o score de segurança é exibido',
    category: 'security',
    priority: 'high',
    tags: ['security', 'posture'],
    steps: [
      {
        name: 'Login e navegar',
        action: 'Login and navigate to Security Posture page',
      },
      {
        name: 'Verificar score',
        action: 'Verify that the security score is displayed as a number between 0 and 100',
      },
      {
        name: 'Verificar categorias',
        action: 'Verify that security categories like IAM, Network, Data Protection are shown',
      },
      {
        name: 'Verificar recomendações',
        action: 'Verify that improvement recommendations are displayed',
      },
    ],
  },

  // Cost Tests
  {
    id: 'cost-overview',
    name: 'Visão Geral de Custos',
    description: 'Verifica se os dados de custo são exibidos',
    category: 'cost',
    priority: 'high',
    tags: ['cost', 'overview'],
    steps: [
      {
        name: 'Login e navegar',
        action: 'Login and navigate to Cost Optimization page',
      },
      {
        name: 'Verificar custo total',
        action: 'Verify that total monthly cost is displayed',
      },
      {
        name: 'Verificar breakdown',
        action: 'Verify that cost breakdown by service is shown',
      },
      {
        name: 'Verificar recomendações',
        action: 'Verify that cost optimization recommendations are displayed',
      },
    ],
  },
];

// Parse argumentos da linha de comando
function parseArgs(): {
  category?: string;
  priority?: string;
  tags?: string[];
  parallel?: number;
  headless?: boolean;
  report?: boolean;
} {
  const args = process.argv.slice(2);
  const options: ReturnType<typeof parseArgs> = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--category':
      case '-c':
        options.category = args[++i];
        break;
      case '--priority':
      case '-p':
        options.priority = args[++i];
        break;
      case '--tags':
      case '-t':
        options.tags = args[++i]?.split(',');
        break;
      case '--parallel':
        options.parallel = parseInt(args[++i]);
        break;
      case '--headless':
        options.headless = args[++i] !== 'false';
        break;
      case '--report':
        options.report = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Nova Act Test Runner - EVO Platform

Uso:
  npx tsx run-tests.ts [options]

Opções:
  -c, --category <category>   Filtrar por categoria (auth, dashboard, security, cost)
  -p, --priority <priority>   Filtrar por prioridade (critical, high, medium, low)
  -t, --tags <tags>           Filtrar por tags (separadas por vírgula)
  --parallel <n>              Número de sessões paralelas
  --headless <true|false>     Executar em modo headless (default: true)
  --report                    Gerar relatório HTML
  -h, --help                  Mostrar esta ajuda

Exemplos:
  npx tsx run-tests.ts                           # Todos os testes
  npx tsx run-tests.ts -c auth                   # Apenas testes de auth
  npx tsx run-tests.ts -p critical               # Apenas testes críticos
  npx tsx run-tests.ts -t smoke,login            # Testes com tags smoke ou login
  npx tsx run-tests.ts --parallel 4 --report     # 4 paralelos com relatório
`);
}

// Main
async function main(): Promise<void> {
  const options = parseArgs();
  
  logger.info('🤖 Nova Act Test Runner - EVO Platform\n');
  
  // Filtrar testes
  let tests = [...TEST_CASES];
  
  if (options.category) {
    tests = tests.filter(t => t.category === options.category);
    logger.info(`Filtrado por categoria: ${options.category}`);
  }
  
  if (options.priority) {
    tests = tests.filter(t => t.priority === options.priority);
    logger.info(`Filtrado por prioridade: ${options.priority}`);
  }
  
  if (options.tags?.length) {
    tests = tests.filter(t => t.tags?.some(tag => options.tags!.includes(tag)));
    logger.info(`Filtrado por tags: ${options.tags.join(', ')}`);
  }
  
  if (tests.length === 0) {
    logger.warn('Nenhum teste encontrado com os filtros especificados');
    process.exit(0);
  }
  
  logger.info(`Executando ${tests.length} testes...\n`);
  
  // Criar runner
  const runner = createTestRunner({
    headless: options.headless ?? config.novaAct.headless,
    stopOnFailure: false,
    screenshotOnFailure: true,
    reportDir: './reports',
  });
  
  // Executar testes
  const result = await runner.runTests(tests);
  
  // Gerar relatórios
  generateConsoleReport(result);
  
  if (options.report) {
    const reportDir = './reports';
    await ensureDir(reportDir);
    
    await generateHtmlReport(
      result,
      path.join(reportDir, `nova-act-report-${Date.now()}.html`)
    );
    
    await generateJsonReport(
      result,
      path.join(reportDir, `nova-act-report-${Date.now()}.json`)
    );
  }
  
  // Exit code baseado no resultado
  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch(error => {
  logger.error('Erro fatal:', error);
  process.exit(1);
});
