#!/usr/bin/env node
import { execSync } from 'child_process';

interface RDSCredentials {
  endpoint: string;
  username: string;
  password: string;
  database: string;
  port: number;
  databaseUrl: string;
}

function log(message: string, type: 'info' | 'success' | 'error' = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
  };
  const reset = '\x1b[0m';
  console.log(`${colors[type]}${message}${reset}`);
}

async function getRDSCredentials(env: string = 'development'): Promise<RDSCredentials> {
  const region = process.env.AWS_REGION || 'us-east-1';
  const stackName = `EvoUds${env.charAt(0).toUpperCase() + env.slice(1)}DatabaseStack`;

  try {
    log(`🔍 Buscando credenciais do RDS (${env})...`, 'info');

    // Obter outputs do CloudFormation
    const outputsCmd = `aws cloudformation describe-stacks --stack-name ${stackName} --region ${region} --query "Stacks[0].Outputs" --output json`;
    const outputs = JSON.parse(execSync(outputsCmd, { encoding: 'utf-8' }));

    const endpoint = outputs.find((o: any) => o.OutputKey === 'DatabaseEndpoint')?.OutputValue;
    const secretArn = outputs.find((o: any) => o.OutputKey === 'DatabaseSecretArn')?.OutputValue;

    if (!endpoint || !secretArn) {
      throw new Error('Não foi possível encontrar endpoint ou secret ARN');
    }

    // Obter credenciais do Secrets Manager
    const secretCmd = `aws secretsmanager get-secret-value --secret-id ${secretArn} --region ${region} --query SecretString --output text`;
    const secretValue = execSync(secretCmd, { encoding: 'utf-8' });
    const credentials = JSON.parse(secretValue);

    const encodedPassword = encodeURIComponent(credentials.password);
    const result: RDSCredentials = {
      endpoint,
      username: credentials.username,
      password: credentials.password,
      database: 'evouds',
      port: 5432,
      databaseUrl: `postgresql://${credentials.username}:${encodedPassword}@${endpoint}:5432/evouds`,
    };

    log('\n✅ Credenciais obtidas com sucesso!', 'success');
    log('\n📋 Informações do RDS:', 'info');
    log(`   Endpoint: ${result.endpoint}`, 'info');
    log(`   Database: ${result.database}`, 'info');
    log(`   Username: ${result.username}`, 'info');
    log(`   Port: ${result.port}`, 'info');
    log(`\n🔗 DATABASE_URL:`, 'info');
    log(`   ${result.databaseUrl}`, 'success');

    return result;
  } catch (error: any) {
    log(`❌ Erro ao obter credenciais: ${error.message}`, 'error');
    throw error;
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const envArg = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'development';
const jsonOutput = args.includes('--json');

getRDSCredentials(envArg).then(credentials => {
  if (jsonOutput) {
    console.log(JSON.stringify(credentials, null, 2));
  }
}).catch(() => {
  process.exit(1);
});
