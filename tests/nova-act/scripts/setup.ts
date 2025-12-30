#!/usr/bin/env tsx
/**
 * Setup Script - Configuração inicial do ambiente de testes Nova Act
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message: string, color = COLORS.reset): void {
  console.log(`${color}${message}${COLORS.reset}`);
}

function success(message: string): void {
  log(`✅ ${message}`, COLORS.green);
}

function warn(message: string): void {
  log(`⚠️  ${message}`, COLORS.yellow);
}

function error(message: string): void {
  log(`❌ ${message}`, COLORS.red);
}

function info(message: string): void {
  log(`ℹ️  ${message}`, COLORS.cyan);
}

async function checkNodeVersion(): Promise<boolean> {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0]);
  
  if (major < 18) {
    error(`Node.js 18+ é necessário. Versão atual: ${version}`);
    return false;
  }
  
  success(`Node.js ${version} detectado`);
  return true;
}

async function checkEnvFile(): Promise<boolean> {
  const envPath = path.join(process.cwd(), '.env');
  const envExamplePath = path.join(process.cwd(), '.env.example');
  
  try {
    await fs.access(envPath);
    success('.env encontrado');
    
    // Verificar variáveis obrigatórias
    const envContent = await fs.readFile(envPath, 'utf-8');
    const requiredVars = ['NOVA_ACT_API_KEY', 'TEST_USER_EMAIL', 'TEST_USER_PASSWORD'];
    const missingVars = requiredVars.filter(v => !envContent.includes(`${v}=`) || envContent.includes(`${v}=your_`));
    
    if (missingVars.length > 0) {
      warn(`Variáveis não configuradas: ${missingVars.join(', ')}`);
      info('Edite o arquivo .env com suas credenciais');
      return false;
    }
    
    success('Variáveis de ambiente configuradas');
    return true;
  } catch {
    warn('.env não encontrado');
    
    try {
      await fs.copyFile(envExamplePath, envPath);
      info('.env criado a partir de .env.example');
      info('Edite o arquivo .env com suas credenciais');
    } catch {
      error('Não foi possível criar .env');
    }
    
    return false;
  }
}

async function checkDependencies(): Promise<boolean> {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  
  try {
    await fs.access(nodeModulesPath);
    success('Dependências instaladas');
    return true;
  } catch {
    warn('Dependências não instaladas');
    info('Executando npm install...');
    
    try {
      execSync('npm install', { stdio: 'inherit' });
      success('Dependências instaladas com sucesso');
      return true;
    } catch {
      error('Falha ao instalar dependências');
      return false;
    }
  }
}

async function createDirectories(): Promise<void> {
  const dirs = [
    'reports',
    'reports/traces',
    'reports/screenshots',
    'reports/coverage',
  ];
  
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
  
  success('Diretórios de relatórios criados');
}

async function checkNovaActAccess(): Promise<boolean> {
  info('Verificando acesso ao Nova Act...');
  
  // Verificar se API key está configurada
  const apiKey = process.env.NOVA_ACT_API_KEY;
  
  if (!apiKey || apiKey === 'your_api_key_here') {
    warn('NOVA_ACT_API_KEY não configurada');
    info('Obtenha sua API key em: https://nova.amazon.com/act');
    return false;
  }
  
  success('API Key configurada');
  return true;
}

async function main(): Promise<void> {
  console.log('\n');
  log('╔════════════════════════════════════════════════════════════╗', COLORS.cyan);
  log('║     🤖 Nova Act Test Framework - Setup                     ║', COLORS.cyan);
  log('║     EVO UDS Platform                                       ║', COLORS.cyan);
  log('╚════════════════════════════════════════════════════════════╝', COLORS.cyan);
  console.log('\n');

  let allPassed = true;

  // 1. Verificar Node.js
  info('Verificando Node.js...');
  if (!await checkNodeVersion()) {
    allPassed = false;
  }
  console.log('');

  // 2. Verificar dependências
  info('Verificando dependências...');
  if (!await checkDependencies()) {
    allPassed = false;
  }
  console.log('');

  // 3. Verificar .env
  info('Verificando configuração...');
  if (!await checkEnvFile()) {
    allPassed = false;
  }
  console.log('');

  // 4. Criar diretórios
  info('Criando diretórios...');
  await createDirectories();
  console.log('');

  // 5. Verificar Nova Act
  if (!await checkNovaActAccess()) {
    allPassed = false;
  }
  console.log('');

  // Resultado final
  console.log('');
  if (allPassed) {
    log('╔════════════════════════════════════════════════════════════╗', COLORS.green);
    log('║     ✅ Setup completo! Pronto para executar testes.        ║', COLORS.green);
    log('╚════════════════════════════════════════════════════════════╝', COLORS.green);
    console.log('');
    info('Execute: npm test');
  } else {
    log('╔════════════════════════════════════════════════════════════╗', COLORS.yellow);
    log('║     ⚠️  Setup incompleto. Verifique os itens acima.        ║', COLORS.yellow);
    log('╚════════════════════════════════════════════════════════════╝', COLORS.yellow);
    console.log('');
    info('Após corrigir, execute: npx tsx scripts/setup.ts');
  }
  console.log('');
}

main().catch(err => {
  error(`Erro no setup: ${err.message}`);
  process.exit(1);
});
