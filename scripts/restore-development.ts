#!/usr/bin/env tsx
/**
 * Script para restaurar ambiente de desenvolvimento
 */

import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';

console.log('🔄 Restaurando Ambiente de Desenvolvimento...\n');

// Restaurar .env original se existir backup
if (existsSync('.env.backup')) {
  const backupContent = readFileSync('.env.backup', 'utf-8');
  writeFileSync('.env', backupContent);
  unlinkSync('.env.backup');
  console.log('✅ Configurações de desenvolvimento restauradas');
} else {
  // Criar .env de desenvolvimento padrão
  const devEnvContent = `# EVO UDS - Development Environment
NODE_ENV=development
VITE_ENVIRONMENT=development
LOG_LEVEL=debug

# AWS Cognito (Development - Mock)
VITE_AWS_USER_POOL_ID=us-east-1_DEV123456
VITE_AWS_USER_POOL_CLIENT_ID=dev123456789abcdef123456789
VITE_API_BASE_URL=http://localhost:3000

# Security (Development)
VITE_STORAGE_ENCRYPTION_KEY=dev-key-32-chars-for-local-testing

# Application - Version is auto-loaded from src/lib/version.ts
`;
  
  writeFileSync('.env', devEnvContent);
  console.log('✅ Configurações de desenvolvimento padrão criadas');
}

// Limpar cache
try {
  execSync('rm -rf node_modules/.vite dist', { stdio: 'inherit' });
  console.log('✅ Cache limpo');
} catch (error) {
  console.log('⚠️  Cache já estava limpo');
}

console.log('\n🎯 Ambiente restaurado para desenvolvimento');
console.log('🚀 Execute "npm run dev" para iniciar o servidor de desenvolvimento');
console.log('🛡️  Modo: Desenvolvimento com mocks de segurança');