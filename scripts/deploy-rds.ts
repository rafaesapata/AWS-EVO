#!/usr/bin/env node
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface RDSDeploymentConfig {
  environment: string;
  region: string;
  instanceClass: string;
  allocatedStorage: number;
  multiAz: boolean;
  deletionProtection: boolean;
}

const configs: Record<string, RDSDeploymentConfig> = {
  development: {
    environment: 'development',
    region: 'us-east-1',
    instanceClass: 'db.t3.micro',
    allocatedStorage: 20,
    multiAz: false,
    deletionProtection: false,
  },
  staging: {
    environment: 'staging',
    region: 'us-east-1',
    instanceClass: 'db.t3.small',
    allocatedStorage: 50,
    multiAz: false,
    deletionProtection: true,
  },
  production: {
    environment: 'production',
    region: 'us-east-1',
    instanceClass: 'db.t3.medium',
    allocatedStorage: 100,
    multiAz: true,
    deletionProtection: true,
  },
};

function log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warning: '\x1b[33m',
  };
  const reset = '\x1b[0m';
  console.log(`${colors[type]}${message}${reset}`);
}

function execCommand(command: string, description: string): string {
  try {
    log(`⏳ ${description}...`, 'info');
    const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    log(`✅ ${description} - Concluído`, 'success');
    return output;
  } catch (error: any) {
    log(`❌ Erro ao ${description.toLowerCase()}`, 'error');
    console.error(error.message);
    throw error;
  }
}

async function deployRDS(env: string = 'development') {
  const config = configs[env];
  if (!config) {
    log(`❌ Ambiente inválido: ${env}. Use: development, staging ou production`, 'error');
    process.exit(1);
  }

  log('\n🚀 Iniciando Deploy do RDS PostgreSQL', 'info');
  log(`📦 Ambiente: ${config.environment}`, 'info');
  log(`🌎 Região: ${config.region}`, 'info');
  log(`💾 Instância: ${config.instanceClass}`, 'info');
  log(`📊 Storage: ${config.allocatedStorage}GB`, 'info');
  log(`🔒 Multi-AZ: ${config.multiAz ? 'Sim' : 'Não'}`, 'info');
  log(`🛡️  Deletion Protection: ${config.deletionProtection ? 'Sim' : 'Não'}\n`, 'info');

  try {
    // 1. Deploy Network Stack (se não existir)
    log('\n📡 Step 1: Verificando Network Stack...', 'info');
    try {
      execCommand(
        `cd infra && npx cdk deploy EvoUds${config.environment.charAt(0).toUpperCase() + config.environment.slice(1)}NetworkStack --require-approval never`,
        'Deploy Network Stack'
      );
    } catch (error) {
      log('⚠️  Network Stack já existe ou erro ao criar', 'warning');
    }

    // 2. Deploy Database Stack
    log('\n💾 Step 2: Fazendo Deploy do Database Stack...', 'info');
    execCommand(
      `cd infra && npx cdk deploy EvoUds${config.environment.charAt(0).toUpperCase() + config.environment.slice(1)}DatabaseStack --require-approval never`,
      'Deploy Database Stack'
    );

    // 3. Obter informações do RDS
    log('\n🔍 Step 3: Obtendo informações do RDS...', 'info');
    const stackName = `EvoUds${config.environment.charAt(0).toUpperCase() + config.environment.slice(1)}DatabaseStack`;
    
    const outputs = execCommand(
      `aws cloudformation describe-stacks --stack-name ${stackName} --region ${config.region} --query "Stacks[0].Outputs" --output json`,
      'Obter outputs do CloudFormation'
    );

    const parsedOutputs = JSON.parse(outputs);
    const endpoint = parsedOutputs.find((o: any) => o.OutputKey === 'DatabaseEndpoint')?.OutputValue;
    const secretArn = parsedOutputs.find((o: any) => o.OutputKey === 'DatabaseSecretArn')?.OutputValue;

    if (!endpoint || !secretArn) {
      throw new Error('Não foi possível obter endpoint ou secret ARN do RDS');
    }

    log(`✅ Endpoint: ${endpoint}`, 'success');
    log(`✅ Secret ARN: ${secretArn}`, 'success');

    // 4. Obter credenciais do Secrets Manager
    log('\n🔐 Step 4: Obtendo credenciais do Secrets Manager...', 'info');
    const secretValue = execCommand(
      `aws secretsmanager get-secret-value --secret-id ${secretArn} --region ${config.region} --query SecretString --output text`,
      'Obter credenciais'
    );

    const credentials = JSON.parse(secretValue);
    const username = credentials.username;
    const password = credentials.password;

    // 5. Construir DATABASE_URL (com URL encoding da senha)
    const encodedPassword = encodeURIComponent(password);
    const databaseUrl = `postgresql://${username}:${encodedPassword}@${endpoint}:5432/evouds`;

    log('\n📝 Step 5: Atualizando variáveis de ambiente...', 'info');

    // 6. Atualizar .env files
    const envFiles = ['.env', '.env.local', '.env.production.local'];
    
    for (const envFile of envFiles) {
      const envPath = path.join(process.cwd(), envFile);
      
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf-8');
        
        // Atualizar ou adicionar DATABASE_URL
        if (envContent.includes('DATABASE_URL=')) {
          envContent = envContent.replace(
            /DATABASE_URL=.*/,
            `DATABASE_URL=${databaseUrl}`
          );
        } else {
          envContent += `\nDATABASE_URL=${databaseUrl}\n`;
        }

        // Atualizar ou adicionar AWS_RDS_SECRET_ARN
        if (envContent.includes('AWS_RDS_SECRET_ARN=')) {
          envContent = envContent.replace(
            /AWS_RDS_SECRET_ARN=.*/,
            `AWS_RDS_SECRET_ARN=${secretArn}`
          );
        } else {
          envContent += `AWS_RDS_SECRET_ARN=${secretArn}\n`;
        }

        fs.writeFileSync(envPath, envContent);
        log(`✅ Atualizado: ${envFile}`, 'success');
      }
    }

    // 7. Criar backup das credenciais
    const credentialsBackup = {
      environment: config.environment,
      endpoint,
      secretArn,
      databaseUrl,
      deployedAt: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(process.cwd(), `.rds-credentials-${config.environment}.json`),
      JSON.stringify(credentialsBackup, null, 2)
    );

    log('\n✅ Deploy do RDS concluído com sucesso!', 'success');
    log('\n📋 Resumo:', 'info');
    log(`   Endpoint: ${endpoint}`, 'info');
    log(`   Database: evouds`, 'info');
    log(`   Username: ${username}`, 'info');
    log(`   Secret ARN: ${secretArn}`, 'info');
    log(`\n🔐 Credenciais salvas em: .rds-credentials-${config.environment}.json`, 'warning');
    log('⚠️  IMPORTANTE: Não commite este arquivo!', 'warning');

    // 8. Executar migrations (opcional)
    log('\n🔄 Step 6: Deseja executar as migrations do Prisma? (y/n)', 'info');
    // Para automação, você pode adicionar um flag --migrate
    if (process.argv.includes('--migrate')) {
      log('Executando migrations...', 'info');
      execCommand('npx prisma migrate deploy', 'Executar migrations');
      log('✅ Migrations executadas com sucesso!', 'success');
    }

  } catch (error: any) {
    log('\n❌ Erro durante o deploy do RDS', 'error');
    console.error(error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const envArg = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'development';

deployRDS(envArg);
