#!/usr/bin/env tsx
/**
 * Script para Invalidação de Cache do CloudFront
 * Invalida o cache do CloudFront após cada deploy do frontend
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface CloudFrontConfig {
  distributionId?: string;
  paths?: string[];
  callerReference?: string;
  verbose?: boolean;
}

class CloudFrontInvalidator {
  private config: CloudFrontConfig;

  constructor(config: CloudFrontConfig = {}) {
    this.config = {
      paths: ['/*'],
      verbose: false,
      ...config
    };
  }

  /**
   * Executa a invalidação do cache
   */
  async invalidateCache(): Promise<void> {
    try {
      // 1. Obter Distribution ID se não fornecido
      if (!this.config.distributionId) {
        this.config.distributionId = await this.getDistributionId();
      }

      if (!this.config.distributionId) {
        throw new Error('Distribution ID não encontrado. Verifique se o CloudFront foi deployado.');
      }

      this.log(`🔄 Iniciando invalidação do CloudFront...`, 'info');
      this.log(`📋 Distribution ID: ${this.config.distributionId}`, 'info');
      this.log(`📂 Paths: ${this.config.paths?.join(', ')}`, 'info');

      // 2. Criar invalidação
      const invalidationId = await this.createInvalidation();
      
      this.log(`✅ Invalidação criada com sucesso!`, 'success');
      this.log(`🆔 Invalidation ID: ${invalidationId}`, 'info');

      // 3. Aguardar conclusão (opcional)
      if (this.config.verbose) {
        await this.waitForInvalidation(invalidationId);
      } else {
        this.log(`ℹ️  A invalidação será processada em segundo plano (2-5 minutos)`, 'info');
      }

    } catch (error) {
      this.log(`❌ Erro na invalidação: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Obtém o Distribution ID do CloudFront
   */
  private async getDistributionId(): Promise<string | null> {
    try {
      // Tenta obter do CDK outputs primeiro
      const distributionId = await this.getDistributionFromCDK();
      if (distributionId) {
        return distributionId;
      }

      // Se não encontrar, lista todas as distribuições
      this.log('🔍 Buscando distribuições do CloudFront...', 'info');
      
      const result = execSync('aws cloudfront list-distributions --query "DistributionList.Items[?Comment==\'EVO Platform Frontend Distribution\' || contains(Comment, \'evo-platform\') || contains(Comment, \'evo-uds\')].{Id:Id,Comment:Comment,DomainName:DomainName}" --output json', {
        stdio: 'pipe'
      }).toString();

      const distributions = JSON.parse(result);
      
      if (distributions.length === 0) {
        throw new Error('Nenhuma distribuição CloudFront encontrada para EVO Platform');
      }

      if (distributions.length === 1) {
        this.log(`✅ Distribuição encontrada: ${distributions[0].DomainName}`, 'success');
        return distributions[0].Id;
      }

      // Se múltiplas distribuições, mostra opções
      this.log('📋 Múltiplas distribuições encontradas:', 'info');
      distributions.forEach((dist: any, index: number) => {
        this.log(`   ${index + 1}. ${dist.Id} - ${dist.DomainName} (${dist.Comment})`, 'info');
      });

      // Por padrão, usa a primeira
      return distributions[0].Id;

    } catch (error) {
      this.log(`⚠️  Erro ao buscar Distribution ID: ${error}`, 'warn');
      return null;
    }
  }

  /**
   * Obtém Distribution ID dos outputs do CDK
   */
  private async getDistributionFromCDK(): Promise<string | null> {
    try {
      // Tenta diferentes nomes de stack
      const stackNames = [
        'EvoUdsDevelopmentFrontendStack',
        'EvoUdsStagingFrontendStack', 
        'EvoUdsProductionFrontendStack',
        'EvoUds-dev-Frontend',
        'EvoUds-staging-Frontend',
        'EvoUds-prod-Frontend'
      ];

      for (const stackName of stackNames) {
        try {
          const result = execSync(`aws cloudformation describe-stacks --stack-name ${stackName} --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" --output text`, {
            stdio: 'pipe'
          }).toString().trim();

          if (result && result !== 'None' && !result.includes('does not exist')) {
            this.log(`✅ Distribution ID encontrado no stack ${stackName}`, 'success');
            return result;
          }
        } catch {
          // Stack não existe, continua tentando
          continue;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Cria a invalidação no CloudFront
   */
  private async createInvalidation(): Promise<string> {
    const callerReference = this.config.callerReference || `invalidation-${Date.now()}`;
    const paths = this.config.paths?.join(' ') || '/*';

    const command = `aws cloudfront create-invalidation --distribution-id ${this.config.distributionId} --paths ${paths} --query "Invalidation.Id" --output text`;
    
    this.log(`🔧 Executando: ${command}`, 'debug');
    
    const result = execSync(command, { stdio: 'pipe' }).toString().trim();
    
    if (!result || result === 'None') {
      throw new Error('Falha ao criar invalidação');
    }

    return result;
  }

  /**
   * Aguarda a conclusão da invalidação
   */
  private async waitForInvalidation(invalidationId: string): Promise<void> {
    this.log(`⏳ Aguardando conclusão da invalidação...`, 'info');
    
    const maxAttempts = 30; // 5 minutos máximo
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const result = execSync(`aws cloudfront get-invalidation --distribution-id ${this.config.distributionId} --id ${invalidationId} --query "Invalidation.Status" --output text`, {
          stdio: 'pipe'
        }).toString().trim();

        this.log(`📊 Status: ${result} (tentativa ${attempts + 1}/${maxAttempts})`, 'debug');

        if (result === 'Completed') {
          this.log(`✅ Invalidação concluída com sucesso!`, 'success');
          return;
        }

        if (result === 'InProgress') {
          await new Promise(resolve => setTimeout(resolve, 10000)); // Aguarda 10 segundos
          attempts++;
          continue;
        }

        throw new Error(`Status inesperado: ${result}`);

      } catch (error) {
        this.log(`⚠️  Erro ao verificar status: ${error}`, 'warn');
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    this.log(`⚠️  Timeout aguardando invalidação. Verifique manualmente no console AWS.`, 'warn');
  }

  /**
   * Verifica se há invalidações em progresso
   */
  async checkInProgressInvalidations(): Promise<void> {
    try {
      if (!this.config.distributionId) {
        this.config.distributionId = await this.getDistributionId();
      }

      if (!this.config.distributionId) {
        return;
      }

      const result = execSync(`aws cloudfront list-invalidations --distribution-id ${this.config.distributionId} --query "InvalidationList.Items[?Status=='InProgress'].{Id:Id,Status:Status,CreateTime:CreateTime}" --output json`, {
        stdio: 'pipe'
      }).toString();

      const inProgress = JSON.parse(result);

      if (inProgress.length > 0) {
        this.log(`⚠️  ${inProgress.length} invalidação(ões) em progresso:`, 'warn');
        inProgress.forEach((inv: any) => {
          this.log(`   - ${inv.Id} (${inv.CreateTime})`, 'info');
        });
        this.log(`ℹ️  Aguarde a conclusão antes de criar nova invalidação`, 'info');
      } else {
        this.log(`✅ Nenhuma invalidação em progresso`, 'success');
      }

    } catch (error) {
      this.log(`⚠️  Erro ao verificar invalidações: ${error}`, 'warn');
    }
  }

  /**
   * Lista histórico de invalidações
   */
  async listInvalidations(limit: number = 10): Promise<void> {
    try {
      if (!this.config.distributionId) {
        this.config.distributionId = await this.getDistributionId();
      }

      if (!this.config.distributionId) {
        return;
      }

      const result = execSync(`aws cloudfront list-invalidations --distribution-id ${this.config.distributionId} --max-items ${limit} --query "InvalidationList.Items[].{Id:Id,Status:Status,CreateTime:CreateTime}" --output json`, {
        stdio: 'pipe'
      }).toString();

      const invalidations = JSON.parse(result);

      this.log(`📋 Últimas ${invalidations.length} invalidações:`, 'info');
      invalidations.forEach((inv: any) => {
        const status = inv.Status === 'Completed' ? '✅' : inv.Status === 'InProgress' ? '⏳' : '❓';
        this.log(`   ${status} ${inv.Id} - ${inv.Status} (${inv.CreateTime})`, 'info');
      });

    } catch (error) {
      this.log(`⚠️  Erro ao listar invalidações: ${error}`, 'warn');
    }
  }

  /**
   * Sistema de logging
   */
  private log(message: string, level: 'info' | 'success' | 'warn' | 'error' | 'debug' = 'info'): void {
    if (level === 'debug' && !this.config.verbose) {
      return;
    }

    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      warn: '\x1b[33m',    // Yellow
      error: '\x1b[31m',   // Red
      debug: '\x1b[90m',   // Gray
    };
    const reset = '\x1b[0m';
    
    const timestamp = new Date().toISOString();
    console.log(`${colors[level]}[${timestamp}] ${message}${reset}`);
  }
}

/**
 * Função principal
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Parse argumentos
  const config: CloudFrontConfig = {
    distributionId: args.find(arg => arg.startsWith('--distribution-id='))?.split('=')[1],
    paths: args.find(arg => arg.startsWith('--paths='))?.split('=')[1]?.split(',') || ['/*'],
    verbose: args.includes('--verbose') || args.includes('-v'),
  };
  
  // Comandos especiais
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🔄 Invalidação de Cache do CloudFront - EVO Platform

Uso: npm run invalidate-cloudfront [opções]

Opções:
  --distribution-id=<id>    ID da distribuição CloudFront
  --paths=<paths>           Paths para invalidar (separados por vírgula) [default: /*]
  --verbose, -v             Output detalhado
  --check                   Verifica invalidações em progresso
  --list                    Lista histórico de invalidações
  --help, -h                Mostra esta ajuda

Exemplos:
  npm run invalidate-cloudfront                           # Invalida tudo (/*) 
  npm run invalidate-cloudfront -- --paths=/index.html,/assets/*
  npm run invalidate-cloudfront -- --distribution-id=E1234567890 --verbose
  npm run invalidate-cloudfront -- --check               # Verifica status
  npm run invalidate-cloudfront -- --list                # Lista histórico
    `);
    process.exit(0);
  }

  const invalidator = new CloudFrontInvalidator(config);

  if (args.includes('--check')) {
    await invalidator.checkInProgressInvalidations();
    return;
  }

  if (args.includes('--list')) {
    await invalidator.listInvalidations();
    return;
  }

  // Executa invalidação
  await invalidator.invalidateCache();
}

// Executa se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Invalidação falhou:', error);
    process.exit(1);
  });
}

export { CloudFrontInvalidator, type CloudFrontConfig };