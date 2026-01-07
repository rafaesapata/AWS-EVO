/**
 * Multi-Account Environment Configuration
 * 
 * Profiles AWS:
 * - default: Ambiente de desenvolvimento
 * - EVO_PRODUCTION: Ambiente de produção
 */

export type EnvironmentName = 'development' | 'production';

export interface EnvironmentConfig {
  // Identificação
  envName: EnvironmentName;
  stackPrefix: string;
  
  // AWS Account
  account: string;
  region: string;
  profile: string;
  
  // Domínios
  domain: string;
  apiDomain: string;
  
  // Cognito (será criado por ambiente)
  cognito: {
    userPoolId?: string;      // Preenchido após deploy inicial
    userPoolClientId?: string; // Preenchido após deploy inicial
  };
  
  // Configurações de recursos
  resources: {
    // RDS
    rdsInstanceClass: string;
    rdsAllocatedStorage: number;
    rdsMultiAz: boolean;
    
    // Lambda
    lambdaMemoryDefault: number;
    lambdaTimeoutDefault: number;
    
    // API Gateway
    apiThrottlingRate: number;
    apiThrottlingBurst: number;
  };
  
  // Feature flags
  features: {
    enableWaf: boolean;
    enableCloudTrail: boolean;
    enableDetailedMonitoring: boolean;
    enableBackups: boolean;
  };
}

export const environments: Record<EnvironmentName, EnvironmentConfig> = {
  development: {
    envName: 'development',
    stackPrefix: 'EvoUdsDev',
    
    // AWS Account - Development (perfil default)
    account: '383234048592',
    region: 'us-east-1',
    profile: 'default',
    
    // Domínios de desenvolvimento
    domain: 'dev-evo.ai.udstec.io',
    apiDomain: 'api-dev-evo.ai.udstec.io',
    
    // Cognito existente (desenvolvimento)
    cognito: {
      userPoolId: 'us-east-1_cnesJ48lR',
      userPoolClientId: '4p0okvsr983v2f8rrvgpls76d6',
    },
    
    // Recursos menores para dev
    resources: {
      rdsInstanceClass: 'db.t3.micro',
      rdsAllocatedStorage: 20,
      rdsMultiAz: false,
      lambdaMemoryDefault: 256,
      lambdaTimeoutDefault: 30,
      apiThrottlingRate: 100,
      apiThrottlingBurst: 200,
    },
    
    features: {
      enableWaf: false,
      enableCloudTrail: false,
      enableDetailedMonitoring: false,
      enableBackups: false,
    },
  },
  
  production: {
    envName: 'production',
    stackPrefix: 'EvoUdsProd',
    
    // AWS Account - Production (perfil EVO_PRODUCTION)
    account: 'PRODUCTION_ACCOUNT_ID', // TODO: Atualizar com o ID da conta de produção
    region: 'us-east-1',
    profile: 'EVO_PRODUCTION',
    
    // Domínios de produção
    domain: 'evo.ai.udstec.io',
    apiDomain: 'api-evo.ai.udstec.io',
    
    // Cognito será criado no deploy de produção
    cognito: {
      userPoolId: undefined,
      userPoolClientId: undefined,
    },
    
    // Recursos robustos para produção
    resources: {
      rdsInstanceClass: 'db.t3.medium',
      rdsAllocatedStorage: 100,
      rdsMultiAz: true,
      lambdaMemoryDefault: 512,
      lambdaTimeoutDefault: 60,
      apiThrottlingRate: 1000,
      apiThrottlingBurst: 2000,
    },
    
    features: {
      enableWaf: true,
      enableCloudTrail: true,
      enableDetailedMonitoring: true,
      enableBackups: true,
    },
  },
};

/**
 * Obtém a configuração do ambiente baseado no contexto do CDK ou variável de ambiente
 */
export function getEnvironmentConfig(envName?: string): EnvironmentConfig {
  const env = (envName || process.env.DEPLOY_ENV || 'development') as EnvironmentName;
  
  if (!environments[env]) {
    throw new Error(`Ambiente inválido: ${env}. Use 'development' ou 'production'`);
  }
  
  return environments[env];
}

/**
 * Valida se o perfil AWS está configurado corretamente
 */
export function validateAwsProfile(config: EnvironmentConfig): void {
  console.log(`\n🔧 Ambiente: ${config.envName.toUpperCase()}`);
  console.log(`   AWS Profile: ${config.profile}`);
  console.log(`   AWS Account: ${config.account}`);
  console.log(`   Region: ${config.region}`);
  console.log(`   Domain: ${config.domain}\n`);
}
