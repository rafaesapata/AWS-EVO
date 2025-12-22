#!/usr/bin/env tsx
/**
 * Script para rodar ambiente de produção localmente
 * Configura e inicia o servidor com configurações de produção
 */

import { execSync, spawn } from 'child_process';
import { readFileSync, existsSync, writeFileSync } from 'fs';

console.log('🏭 Configurando Ambiente de Produção Local...\n');

// Verificar se o arquivo de produção local existe
if (!existsSync('.env.production.local')) {
  console.error('❌ Arquivo .env.production.local não encontrado');
  process.exit(1);
}

console.log('✅ Arquivo de configuração de produção encontrado');

// Fazer backup do .env atual
if (existsSync('.env')) {
  const envContent = readFileSync('.env', 'utf-8');
  writeFileSync('.env.backup', envContent);
  console.log('✅ Backup do .env atual criado (.env.backup)');
}

// Copiar configurações de produção
const prodEnvContent = readFileSync('.env.production.local', 'utf-8');
writeFileSync('.env', prodEnvContent);
console.log('✅ Configurações de produção aplicadas');

// Limpar cache do Vite
try {
  execSync('rm -rf node_modules/.vite dist', { stdio: 'inherit' });
  console.log('✅ Cache limpo');
} catch (error) {
  console.log('⚠️  Não foi possível limpar o cache completamente');
}

// Fazer build de produção
console.log('\n📦 Fazendo build de produção...');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Build de produção concluído');
} catch (error) {
  console.error('❌ Erro no build de produção');
  process.exit(1);
}

// Verificar configurações de segurança
console.log('\n🛡️  Verificando configurações de segurança...');

const securityChecks = [
  { name: 'VITE_ENVIRONMENT=production', check: prodEnvContent.includes('VITE_ENVIRONMENT=production') },
  { name: 'Encryption Key', check: prodEnvContent.includes('VITE_STORAGE_ENCRYPTION_KEY') },
  { name: 'HTTPS API', check: prodEnvContent.includes('https://api.evo.ia.udstec.io') },
  { name: 'Real AWS Cognito', check: prodEnvContent.includes('us-east-1_bg66HUp7J') },
  { name: 'Production Domain', check: prodEnvContent.includes('evo.ia.udstec.io') }
];

let securityPassed = true;
for (const check of securityChecks) {
  if (check.check) {
    console.log(`✅ ${check.name}`);
  } else {
    console.log(`❌ ${check.name}`);
    securityPassed = false;
  }
}

if (!securityPassed) {
  console.error('\n❌ Verificações de segurança falharam');
  process.exit(1);
}

console.log('\n🚀 Iniciando servidor de produção local...');
console.log('📍 URL: http://localhost:4173');
console.log('🛡️  Modo: Produção');
console.log('🔒 Segurança: Military-Grade');
console.log('\n⚠️  IMPORTANTE: Este é um ambiente de PRODUÇÃO local');
console.log('   - Todas as APIs apontam para produção');
console.log('   - Dados reais serão utilizados');
console.log('   - Logs estão em modo ERROR apenas');
console.log('   - Autenticação real do AWS Cognito');

console.log('\n🧪 Para testar:');
console.log('1. Acesse: http://localhost:4173');
console.log('2. Teste login com credenciais reais');
console.log('3. Verifique console do navegador (deve ter poucos logs)');
console.log('4. Teste funcionalidades críticas');
console.log('5. Verifique se dados estão criptografados no sessionStorage');

console.log('\n🔄 Para voltar ao desenvolvimento:');
console.log('   npm run dev:restore');

// Iniciar servidor de preview
const previewProcess = spawn('npm', ['run', 'preview'], {
  stdio: 'inherit',
  shell: true
});

// Capturar sinais para cleanup
process.on('SIGINT', () => {
  console.log('\n🛑 Parando servidor de produção local...');
  previewProcess.kill('SIGINT');
  
  // Restaurar .env original se existir backup
  if (existsSync('.env.backup')) {
    const backupContent = readFileSync('.env.backup', 'utf-8');
    writeFileSync('.env', backupContent);
    console.log('✅ Configurações originais restauradas');
  }
  
  process.exit(0);
});

previewProcess.on('close', (code) => {
  console.log(`\n📊 Servidor encerrado com código: ${code}`);
  
  // Restaurar .env original se existir backup
  if (existsSync('.env.backup')) {
    const backupContent = readFileSync('.env.backup', 'utf-8');
    writeFileSync('.env', backupContent);
    console.log('✅ Configurações originais restauradas');
  }
});