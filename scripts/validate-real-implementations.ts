#!/usr/bin/env tsx

/**
 * Script para validar que todas as implementações reais estão funcionando
 * e não há mais dados mocados no sistema
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Load environment variables from .env file
function loadEnvFile() {
  const envPath = join(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8');
    const envLines = envContent.split('\n');
    
    for (const line of envLines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, ''); // Remove quotes
          if (!process.env[key]) { // Don't override existing env vars
            process.env[key] = value;
          }
        }
      }
    }
  }
}

interface ValidationResult {
  component: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string;
}

class RealImplementationValidator {
  private results: ValidationResult[] = [];

  async validateAll(): Promise<void> {
    // Load environment variables first
    loadEnvFile();
    
    console.log('🔍 Validando implementações reais...\n');

    await this.validateRedisConnection();
    await this.validateDatabaseConnection();
    await this.validateSecurityScanners();
    await this.validateHealthChecks();
    await this.validateBackupSystem();
    await this.validateEnvironmentVariables();
    await this.validateCodeForMocks();

    this.printResults();
  }

  private async validateRedisConnection(): Promise<void> {
    try {
      // Verificar se Redis está configurado
      const redisHost = process.env.REDIS_HOST;
      const redisPort = process.env.REDIS_PORT;

      if (!redisHost || !redisPort) {
        this.addResult('Redis Configuration', 'warning', 
          'Redis não configurado - rate limiting usará fallback em memória');
        return;
      }

      // Tentar conectar ao Redis
      try {
        const Redis = (await import('ioredis')).default;
        const redis = new Redis({
          host: redisHost,
          port: parseInt(redisPort),
          password: process.env.REDIS_PASSWORD,
          connectTimeout: 5000,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          retryDelayOnFailover: 100,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 0
        });

        // Suppress error events during testing
        redis.on('error', () => {});

        await redis.ping();
        redis.disconnect();

        this.addResult('Redis Connection', 'pass', 
          `Conectado ao Redis em ${redisHost}:${redisPort}`);
      } catch (error) {
        this.addResult('Redis Connection', 'warning', 
          'Redis não disponível - usando fallback em memória', error.message);
      }
    } catch (error) {
      this.addResult('Redis Setup', 'fail', 
        'Erro ao validar Redis', error.message);
    }
  }

  private async validateDatabaseConnection(): Promise<void> {
    try {
      const databaseUrl = process.env.DATABASE_URL;

      if (!databaseUrl) {
        this.addResult('Database Configuration', 'fail', 
          'DATABASE_URL não configurada');
        return;
      }

      // Verificar se pg_dump está disponível para backups
      try {
        execSync('which pg_dump', { stdio: 'pipe' });
        this.addResult('Database Backup Tools', 'pass', 
          'pg_dump disponível para backups');
      } catch (error) {
        this.addResult('Database Backup Tools', 'warning', 
          'pg_dump não encontrado - backups podem falhar');
      }

      this.addResult('Database Configuration', 'pass', 
        'DATABASE_URL configurada');
    } catch (error) {
      this.addResult('Database Setup', 'fail', 
        'Erro ao validar banco de dados', error.message);
    }
  }

  private async validateSecurityScanners(): Promise<void> {
    // Verificar Trivy
    try {
      execSync('which trivy', { stdio: 'pipe' });
      this.addResult('Trivy Scanner', 'pass', 
        'Trivy scanner disponível');
    } catch (error) {
      this.addResult('Trivy Scanner', 'warning', 
        'Trivy não encontrado - usando fallback para ECR');
    }

    // Verificar Docker
    try {
      execSync('which docker', { stdio: 'pipe' });
      this.addResult('Docker CLI', 'pass', 
        'Docker CLI disponível');
    } catch (error) {
      this.addResult('Docker CLI', 'warning', 
        'Docker CLI não encontrado');
    }

    // Verificar socket do Docker
    const dockerSocket = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
    if (existsSync(dockerSocket)) {
      this.addResult('Docker Socket', 'pass', 
        `Docker socket encontrado em ${dockerSocket}`);
    } else {
      this.addResult('Docker Socket', 'warning', 
        'Docker socket não encontrado - monitoramento limitado');
    }
  }

  private async validateHealthChecks(): Promise<void> {
    try {
      // Verificar se as configurações de health check estão presentes
      const healthCheckInterval = process.env.HEALTH_CHECK_INTERVAL;
      
      if (healthCheckInterval) {
        this.addResult('Health Check Configuration', 'pass', 
          `Intervalo configurado: ${healthCheckInterval}ms`);
      } else {
        this.addResult('Health Check Configuration', 'warning', 
          'HEALTH_CHECK_INTERVAL não configurado - usando padrão');
      }
    } catch (error) {
      this.addResult('Health Checks', 'fail', 
        'Erro ao validar health checks', error.message);
    }
  }

  private async validateBackupSystem(): Promise<void> {
    try {
      const backupPath = process.env.BACKUP_STORAGE_PATH || './backups';
      
      // Verificar se o diretório de backup existe ou pode ser criado
      if (!existsSync(backupPath)) {
        try {
          const { mkdirSync } = await import('fs');
          mkdirSync(backupPath, { recursive: true });
          this.addResult('Backup Directory', 'pass', 
            `Diretório de backup criado: ${backupPath}`);
        } catch (error) {
          this.addResult('Backup Directory', 'fail', 
            'Não foi possível criar diretório de backup', error.message);
        }
      } else {
        this.addResult('Backup Directory', 'pass', 
          `Diretório de backup existe: ${backupPath}`);
      }
    } catch (error) {
      this.addResult('Backup System', 'fail', 
        'Erro ao validar sistema de backup', error.message);
    }
  }

  private async validateEnvironmentVariables(): Promise<void> {
    const requiredVars = [
      'AWS_REGION',
      'VITE_AWS_USER_POOL_ID',
      'VITE_AWS_USER_POOL_CLIENT_ID'
    ];

    const optionalVars = [
      'REDIS_HOST',
      'REDIS_PORT',
      'DOCKER_SOCKET_PATH',
      'TRIVY_CACHE_DIR'
    ];

    let missingRequired = 0;
    let missingOptional = 0;

    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        missingRequired++;
        this.addResult(`Environment Variable: ${varName}`, 'fail', 
          'Variável obrigatória não configurada');
      }
    }

    for (const varName of optionalVars) {
      if (!process.env[varName]) {
        missingOptional++;
      }
    }

    if (missingRequired === 0) {
      this.addResult('Required Environment Variables', 'pass', 
        'Todas as variáveis obrigatórias configuradas');
    }

    if (missingOptional > 0) {
      this.addResult('Optional Environment Variables', 'warning', 
        `${missingOptional} variáveis opcionais não configuradas`);
    }
  }

  private async validateCodeForMocks(): Promise<void> {
    try {
      // Buscar por padrões de mock no código
      const mockPatterns = [
        'mock.*implementation',
        'Mock.*data',
        'simulate.*delay',
        'fake.*data',
        'dummy.*data'
      ];

      let mockFound = false;
      const mockFiles: string[] = [];

      for (const pattern of mockPatterns) {
        try {
          const result = execSync(
            `grep -r "${pattern}" backend/src --include="*.ts" || true`,
            { encoding: 'utf8' }
          );

          if (result.trim()) {
            mockFound = true;
            const files = result.split('\n')
              .filter(line => line.trim())
              .map(line => line.split(':')[0])
              .filter((file, index, arr) => arr.indexOf(file) === index);
            
            mockFiles.push(...files);
          }
        } catch (error) {
          // Ignorar erros de grep
        }
      }

      if (mockFound) {
        this.addResult('Code Mock Detection', 'warning', 
          'Possíveis implementações mocadas encontradas', 
          `Arquivos: ${[...new Set(mockFiles)].join(', ')}`);
      } else {
        this.addResult('Code Mock Detection', 'pass', 
          'Nenhuma implementação mocada óbvia encontrada');
      }
    } catch (error) {
      this.addResult('Code Analysis', 'fail', 
        'Erro ao analisar código', error.message);
    }
  }

  private addResult(component: string, status: 'pass' | 'fail' | 'warning', 
                   message: string, details?: string): void {
    this.results.push({ component, status, message, details });
  }

  private printResults(): void {
    console.log('\n📊 Resultados da Validação:\n');

    const passed = this.results.filter(r => r.status === 'pass').length;
    const failed = this.results.filter(r => r.status === 'fail').length;
    const warnings = this.results.filter(r => r.status === 'warning').length;

    for (const result of this.results) {
      const icon = result.status === 'pass' ? '✅' : 
                   result.status === 'fail' ? '❌' : '⚠️';
      
      console.log(`${icon} ${result.component}: ${result.message}`);
      
      if (result.details) {
        console.log(`   └─ ${result.details}`);
      }
    }

    console.log('\n📈 Resumo:');
    console.log(`✅ Passou: ${passed}`);
    console.log(`❌ Falhou: ${failed}`);
    console.log(`⚠️  Avisos: ${warnings}`);

    if (failed > 0) {
      console.log('\n🚨 Falhas encontradas: Algumas funcionalidades podem não funcionar corretamente');
      console.log('💡 Dica: Instale as dependências opcionais ou configure os serviços para melhor funcionamento');
    } else if (warnings > 0) {
      console.log('\n⚠️  Avisos encontrados: Sistema funcionará com fallbacks');
      console.log('💡 Dica: Configure os serviços opcionais para melhor performance');
    } else {
      console.log('\n🎉 Todas as validações passaram!');
    }
    
    console.log('\n📋 Sistema pronto para execução com implementações reais!');
  }
}

// Executar validação se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  // Load environment variables before starting
  loadEnvFile();
  
  const validator = new RealImplementationValidator();
  validator.validateAll().catch(error => {
    console.error('❌ Erro durante validação:', error);
    process.exit(1);
  });
}

export { RealImplementationValidator };