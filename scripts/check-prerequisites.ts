#!/usr/bin/env tsx
/**
 * Verificação de Pré-requisitos para Deploy
 * Verifica se todos os requisitos estão instalados e configurados
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface PrerequisiteCheck {
  name: string;
  description: string;
  check: () => Promise<boolean>;
  fix?: string;
  required: boolean;
}

class PrerequisiteChecker {
  private checks: PrerequisiteCheck[] = [];
  private results: Array<{ name: string; passed: boolean; message?: string }> = [];

  constructor() {
    this.initializeChecks();
  }

  private initializeChecks(): void {
    this.checks = [
      {
        name: 'node-version',
        description: 'Node.js versão 18 ou superior',
        check: async () => {
          const version = process.version;
          const major = parseInt(version.slice(1).split('.')[0]);
          return major >= 18;
        },
        fix: 'Instale Node.js 18+ de https://nodejs.org/',
        required: true,
      },
      {
        name: 'npm',
        description: 'NPM instalado',
        check: async () => {
          try {
            execSync('npm --version', { stdio: 'pipe' });
            return true;
          } catch {
            return false;
          }
        },
        fix: 'NPM vem com Node.js. Reinstale Node.js.',
        required: true,
      },
      {
        name: 'aws-cli',
        description: 'AWS CLI instalado',
        check: async () => {
          try {
            execSync('aws --version', { stdio: 'pipe' });
            return true;
          } catch {
            return false;
          }
        },
        fix: 'Instale AWS CLI: https://aws.amazon.com/cli/',
        required: true,
      },
      {
        name: 'aws-credentials',
        description: 'Credenciais AWS configuradas',
        check: async () => {
          try {
            execSync('aws sts get-caller-identity', { stdio: 'pipe' });
            return true;
          } catch {
            return false;
          }
        },
        fix: 'Configure credenciais: aws configure',
        required: true,
      },
      {
        name: 'aws-cdk',
        description: 'AWS CDK instalado',
        check: async () => {
          try {
            execSync('cdk --version', { stdio: 'pipe' });
            return true;
          } catch {
            return false;
          }
        },
        fix: 'Instale CDK: npm install -g aws-cdk',
        required: true,
      },
      {
        name: 'tsx',
        description: 'TSX para executar TypeScript',
        check: async () => {
          try {
            execSync('tsx --version', { stdio: 'pipe' });
            return true;
          } catch {
            return false;
          }
        },
        fix: 'Instale TSX: npm install -g tsx',
        required: true,
      },
      {
        name: 'git',
        description: 'Git instalado',
        check: async () => {
          try {
            execSync('git --version', { stdio: 'pipe' });
            return true;
          } catch {
            return false;
          }
        },
        fix: 'Instale Git: https://git-scm.com/',
        required: false,
      },
      {
        name: 'docker',
        description: 'Docker instalado (opcional)',
        check: async () => {
          try {
            execSync('docker --version', { stdio: 'pipe' });
            return true;
          } catch {
            return false;
          }
        },
        fix: 'Instale Docker: https://docker.com/',
        required: false,
      },
      {
        name: 'project-structure',
        description: 'Estrutura do projeto válida',
        check: async () => {
          const requiredFiles = [
            'package.json',
            'src',
            'backend',
            'infra',
          ];
          
          return requiredFiles.every(file => 
            fs.existsSync(path.join(process.cwd(), file))
          );
        },
        fix: 'Certifique-se de estar no diretório raiz do projeto',
        required: true,
      },
      {
        name: 'env-file',
        description: 'Arquivo .env existe',
        check: async () => {
          return fs.existsSync(path.join(process.cwd(), '.env'));
        },
        fix: 'Crie arquivo .env baseado no .env.example',
        required: false,
      },
    ];
  }

  async runChecks(): Promise<boolean> {
    console.log('🔍 Verificando pré-requisitos para deploy...\n');

    let allPassed = true;

    for (const check of this.checks) {
      process.stdout.write(`   ${check.description}... `);
      
      try {
        const passed = await check.check();
        
        if (passed) {
          console.log('✅');
          this.results.push({ name: check.name, passed: true });
        } else {
          console.log('❌');
          this.results.push({ 
            name: check.name, 
            passed: false, 
            message: check.fix 
          });
          
          if (check.required) {
            allPassed = false;
          }
        }
      } catch (error) {
        console.log('❌');
        this.results.push({ 
          name: check.name, 
          passed: false, 
          message: `Erro: ${error}` 
        });
        
        if (check.required) {
          allPassed = false;
        }
      }
    }

    this.showResults(allPassed);
    return allPassed;
  }

  private showResults(allPassed: boolean): void {
    console.log('\n' + '='.repeat(60));
    
    if (allPassed) {
      console.log('🎉 Todos os pré-requisitos obrigatórios foram atendidos!');
      console.log('✅ Sistema pronto para deploy');
    } else {
      console.log('❌ Alguns pré-requisitos obrigatórios não foram atendidos');
      console.log('\n📋 Ações necessárias:');
      
      this.results
        .filter(result => !result.passed && result.message)
        .forEach(result => {
          console.log(`   • ${result.message}`);
        });
    }

    // Mostra estatísticas
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const required = this.checks.filter(c => c.required).length;
    const requiredPassed = this.results.filter((r, i) => 
      r.passed && this.checks[i].required
    ).length;

    console.log('\n�� Estatísticas:');
    console.log(`   Total: ${passed}/${total} verificações passaram`);
    console.log(`   Obrigatórios: ${requiredPassed}/${required} passaram`);

    // Informações adicionais
    if (allPassed) {
      console.log('\n🚀 Próximos passos:');
      console.log('   1. Execute: npm run deploy:dev (para desenvolvimento)');
      console.log('   2. Execute: npm run deploy:staging (para staging)');
      console.log('   3. Execute: npm run deploy:prod (para produção)');
      
      console.log('\n💡 Dicas:');
      console.log('   • Use --verbose para ver logs detalhados');
      console.log('   • Use --skip-tests para pular testes (não recomendado)');
      console.log('   • Use --domain=seu-dominio.com para configurar domínio customizado');
    }

    console.log('='.repeat(60));
  }

  async autoFix(): Promise<void> {
    console.log('🔧 Tentando corrigir problemas automaticamente...\n');

    const failedChecks = this.results.filter(r => !r.passed);
    
    for (const result of failedChecks) {
      const check = this.checks.find(c => c.name === result.name);
      if (!check) continue;

      console.log(`🔧 Tentando corrigir: ${check.description}`);
      
      try {
        switch (check.name) {
          case 'aws-cdk':
            console.log('   Instalando AWS CDK...');
            execSync('npm install -g aws-cdk', { stdio: 'inherit' });
            break;
            
          case 'tsx':
            console.log('   Instalando TSX...');
            execSync('npm install -g tsx', { stdio: 'inherit' });
            break;
            
          case 'env-file':
            console.log('   Criando arquivo .env...');
            const envContent = `# EVO Platform Environment Configuration
NODE_ENV=development
AWS_REGION=us-east-1
DATABASE_URL=postgresql://localhost:5432/evouds
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
`;
            fs.writeFileSync('.env', envContent);
            break;
            
          default:
            console.log(`   ⚠️  Correção manual necessária: ${result.message}`);
        }
        
        console.log('   ✅ Corrigido com sucesso');
      } catch (error) {
        console.log(`   ❌ Falha na correção: ${error}`);
      }
    }

    console.log('\n🔄 Executando verificações novamente...');
    await this.runChecks();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🔍 Verificador de Pré-requisitos EVO Platform

Uso: npm run check-prerequisites [opções]

Opções:
  --fix        Tenta corrigir problemas automaticamente
  --help, -h   Mostra esta ajuda

Exemplos:
  npm run check-prerequisites
  npm run check-prerequisites -- --fix
    `);
    process.exit(0);
  }

  const checker = new PrerequisiteChecker();
  
  const allPassed = await checker.runChecks();
  
  if (!allPassed && args.includes('--fix')) {
    await checker.autoFix();
  }
  
  process.exit(allPassed ? 0 : 1);
}

// Executa se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Erro na verificação:', error);
    process.exit(1);
  });
}

export { PrerequisiteChecker };