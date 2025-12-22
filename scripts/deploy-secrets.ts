#!/usr/bin/env tsx
/**
 * Deploy Secrets Script
 * Deploys application secrets from .env to AWS Secrets Manager
 */

import { deploySecrets } from '../src/lib/secrets-manager';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables from .env file
function loadEnvFile(envPath: string) {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          process.env[key.trim()] = value;
        }
      }
    });
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const envFile = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || '.env';
  const environment = args.find(arg => arg.startsWith('--environment='))?.split('=')[1] || process.env.NODE_ENV || 'development';
  const dryRun = args.includes('--dry-run');
  const help = args.includes('--help') || args.includes('-h');
  
  if (help) {
    console.log(`
🔐 Deploy Secrets to AWS Secrets Manager

Usage: npm run deploy:secrets [options]

Options:
  --env=<file>           Environment file to read (.env by default)
  --environment=<env>    Target environment (development, staging, production)
  --dry-run             Show what would be deployed without actually deploying
  --help, -h            Show this help message

Examples:
  npm run deploy:secrets
  npm run deploy:secrets -- --env=.env.production --environment=production
  npm run deploy:secrets -- --dry-run

Environment Variables Required:
  AWS_ACCESS_KEY_ID      AWS Access Key
  AWS_SECRET_ACCESS_KEY  AWS Secret Key
  AWS_REGION            AWS Region (default: us-east-1)

The script will create/update a secret named: evo-uds/{environment}/app-secrets
    `);
    process.exit(0);
  }
  
  console.log('🔐 EVO UDS Secrets Deployment');
  console.log('═'.repeat(50));
  console.log(`📁 Environment file: ${envFile}`);
  console.log(`🌍 Target environment: ${environment}`);
  console.log(`🏃 Dry run: ${dryRun ? 'Yes' : 'No'}`);
  console.log('═'.repeat(50));
  
  // Check if environment file exists
  const envPath = path.resolve(envFile);
  if (!fs.existsSync(envPath)) {
    console.error(`❌ Environment file not found: ${envPath}`);
    process.exit(1);
  }
  
  // Load environment variables from the file
  loadEnvFile(envPath);
  
  // Set NODE_ENV for the deployment
  process.env.NODE_ENV = environment;
  
  // Check AWS credentials
  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    console.error('❌ AWS credentials not found. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY or configure AWS_PROFILE');
    console.error(`💡 Current AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? 'Set' : 'Not set'}`);
    console.error(`💡 Current AWS_PROFILE: ${process.env.AWS_PROFILE ? 'Set' : 'Not set'}`);
    process.exit(1);
  }
  
  if (dryRun) {
    console.log('🔍 DRY RUN - Analyzing environment file...');
    
    try {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const envVars: Record<string, string> = {};
      
      envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').replace(/^["']|["']$/g, '');
            envVars[key.trim()] = value;
          }
        }
      });
      
      const relevantKeys = [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY', 
        'AWS_SESSION_TOKEN',
        'BEDROCK_REGION',
        'BEDROCK_MODEL_ID',
        'BEDROCK_CLAUDE_MODEL_ID',
        'DATABASE_URL',
        'DATABASE_PASSWORD',
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY',
        'JWT_SECRET',
        'ENCRYPTION_KEY',
        'STRIPE_SECRET_KEY',
        'SENDGRID_API_KEY',
        'NODE_ENV',
        'LOG_LEVEL'
      ];
      
      const secretsToDeployCount = relevantKeys.filter(key => envVars[key]).length;
      const secretsToDeployList = relevantKeys.filter(key => envVars[key]);
      
      console.log(`\n📊 Analysis Results:`);
      console.log(`   Total variables in ${envFile}: ${Object.keys(envVars).length}`);
      console.log(`   Relevant secrets found: ${secretsToDeployCount}`);
      console.log(`   Target secret name: evo-uds/${environment}/app-secrets`);
      
      console.log(`\n📋 Secrets that would be deployed:`);
      secretsToDeployList.forEach(key => {
        const value = envVars[key];
        const maskedValue = key.includes('KEY') || key.includes('SECRET') || key.includes('PASSWORD') 
          ? '*'.repeat(Math.min(value.length, 8))
          : value.length > 20 ? value.substring(0, 20) + '...' : value;
        console.log(`   ✓ ${key}: ${maskedValue}`);
      });
      
      console.log(`\n🎯 To actually deploy, run without --dry-run flag`);
      
    } catch (error: any) {
      console.error('❌ Error during dry run:', error.message);
      process.exit(1);
    }
    
    return;
  }
  
  try {
    console.log('🚀 Starting deployment...');
    await deploySecrets(envFile);
    
    console.log('\n✅ Secrets deployment completed successfully!');
    console.log(`\n📝 Next steps:`);
    console.log(`   1. Verify secrets in AWS Console: https://console.aws.amazon.com/secretsmanager/`);
    console.log(`   2. Update your application to use the secrets`);
    console.log(`   3. Test the application with the new secrets`);
    
  } catch (error: any) {
    console.error('\n❌ Deployment failed:', error.message);
    
    if (error.message.includes('AccessDenied')) {
      console.error('\n💡 Possible solutions:');
      console.error('   - Check if your AWS credentials have SecretsManager permissions');
      console.error('   - Ensure you have secretsmanager:CreateSecret and secretsmanager:UpdateSecret permissions');
    }
    
    if (error.message.includes('ResourceNotFoundException')) {
      console.error('\n💡 This might be the first deployment. The script will create the secret automatically.');
    }
    
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

export default main;