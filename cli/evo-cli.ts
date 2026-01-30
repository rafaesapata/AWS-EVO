#!/usr/bin/env node

/**
 * EVO UDS CLI
 * Command-line interface using AWS SDK (no Supabase)
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  ListUsersCommand,
  AdminGetUserCommand
} from '@aws-sdk/client-cognito-identity-provider';
import {
  LambdaClient,
  InvokeCommand
} from '@aws-sdk/client-lambda';
import { fromEnv } from '@aws-sdk/credential-providers';

// Environment Configuration
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const USER_POOL_ID = process.env.AWS_USER_POOL_ID || '';
const API_BASE_URL = process.env.VITE_API_BASE_URL || '';

interface CLIConfig {
  region: string;
  userPoolId: string;
  apiBaseUrl: string;
}

class EvoCLI {
  private cognito: CognitoIdentityProviderClient;
  private lambda: LambdaClient;
  private config: CLIConfig;

  constructor() {
    const credentials = fromEnv();
    
    this.config = {
      region: AWS_REGION,
      userPoolId: USER_POOL_ID,
      apiBaseUrl: API_BASE_URL
    };

    this.cognito = new CognitoIdentityProviderClient({
      region: this.config.region,
      credentials
    });
    
    this.lambda = new LambdaClient({
      region: this.config.region,
      credentials
    });
  }

  // ============ USER MANAGEMENT ============

  async listUsers(limit: number = 60): Promise<void> {
    try {
      const command = new ListUsersCommand({
        UserPoolId: this.config.userPoolId,
        Limit: limit
      });
      
      const response = await this.cognito.send(command);
      
      console.log('\n📋 Users in EVO UDS:\n');
      response.Users?.forEach((user, index) => {
        const email = user.Attributes?.find(a => a.Name === 'email')?.Value || 'N/A';
        const name = user.Attributes?.find(a => a.Name === 'name')?.Value || 'N/A';
        const status = user.UserStatus || 'N/A';
        const enabled = user.Enabled ? '✅' : '❌';
        
        console.log(`${index + 1}. ${user.Username}`);
        console.log(`   Email: ${email}`);
        console.log(`   Name: ${name}`);
        console.log(`   Status: ${status} ${enabled}`);
        console.log(`   Created: ${user.UserCreateDate?.toISOString()}`);
        console.log('');
      });
      
      console.log(`Total: ${response.Users?.length || 0} users`);
    } catch (error) {
      console.error('❌ Error listing users:', error);
      process.exit(1);
    }
  }

  async createUser(email: string, name: string, tempPassword: string): Promise<void> {
    try {
      const command = new AdminCreateUserCommand({
        UserPoolId: this.config.userPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: name }
        ],
        TemporaryPassword: tempPassword,
        MessageAction: 'SUPPRESS'
      });
      
      await this.cognito.send(command);
      console.log(`✅ User created: ${email}`);
      console.log(`   Name: ${name}`);
      console.log(`   Temporary password: ${tempPassword}`);
      console.log('   User must change password on first login.');
    } catch (error: any) {
      if (error.name === 'UsernameExistsException') {
        console.error(`❌ User ${email} already exists`);
      } else {
        console.error('❌ Error creating user:', error.message);
      }
      process.exit(1);
    }
  }

  async deleteUser(username: string): Promise<void> {
    try {
      const command = new AdminDeleteUserCommand({
        UserPoolId: this.config.userPoolId,
        Username: username
      });
      
      await this.cognito.send(command);
      console.log(`✅ User deleted: ${username}`);
    } catch (error: any) {
      console.error('❌ Error deleting user:', error.message);
      process.exit(1);
    }
  }

  async disableUser(username: string): Promise<void> {
    try {
      const command = new AdminDisableUserCommand({
        UserPoolId: this.config.userPoolId,
        Username: username
      });
      
      await this.cognito.send(command);
      console.log(`✅ User disabled: ${username}`);
    } catch (error: any) {
      console.error('❌ Error disabling user:', error.message);
      process.exit(1);
    }
  }

  async enableUser(username: string): Promise<void> {
    try {
      const command = new AdminEnableUserCommand({
        UserPoolId: this.config.userPoolId,
        Username: username
      });
      
      await this.cognito.send(command);
      console.log(`✅ User enabled: ${username}`);
    } catch (error: any) {
      console.error('❌ Error enabling user:', error.message);
      process.exit(1);
    }
  }

  // ============ LAMBDA INVOCATION ============

  async invokeLambda(functionName: string, payload?: any): Promise<any> {
    try {
      const command = new InvokeCommand({
        FunctionName: functionName,
        Payload: payload ? JSON.stringify(payload) : undefined
      });
      
      const response = await this.lambda.send(command);
      
      if (response.Payload) {
        const result = JSON.parse(new TextDecoder().decode(response.Payload));
        return result;
      }
      return null;
    } catch (error: any) {
      console.error(`❌ Error invoking Lambda ${functionName}:`, error.message);
      throw error;
    }
  }

  // ============ SCANS ============

  async runSecurityScan(organizationId?: string): Promise<void> {
    console.log('🔒 Starting security scan...\n');
    
    try {
      const result = await this.invokeLambda('evo-security-scan', {
        organization_id: organizationId,
        scan_type: 'full'
      });
      
      if (result?.body) {
        const data = JSON.parse(result.body);
        console.log('✅ Security scan completed!');
        console.log(`   Findings: ${data.findings_count || 0}`);
        console.log(`   Critical: ${data.critical || 0}`);
        console.log(`   High: ${data.high || 0}`);
        console.log(`   Medium: ${data.medium || 0}`);
        console.log(`   Low: ${data.low || 0}`);
      }
    } catch (error) {
      console.error('❌ Security scan failed');
      process.exit(1);
    }
  }

  async runCostOptimization(organizationId?: string): Promise<void> {
    console.log('💰 Starting cost optimization analysis...\n');
    
    try {
      const result = await this.invokeLambda('evo-cost-optimization', {
        organization_id: organizationId
      });
      
      if (result?.body) {
        const data = JSON.parse(result.body);
        console.log('✅ Cost optimization completed!');
        console.log(`   Recommendations: ${data.recommendations_count || 0}`);
        console.log(`   Potential savings: $${data.potential_savings || 0}/month`);
      }
    } catch (error) {
      console.error('❌ Cost optimization failed');
      process.exit(1);
    }
  }

  // ============ HEALTH CHECK ============

  async healthCheck(): Promise<void> {
    console.log('\n🏥 EVO UDS Health Check\n');
    console.log('─'.repeat(40));
    
    // Check Cognito
    process.stdout.write('Cognito User Pool... ');
    try {
      const command = new ListUsersCommand({
        UserPoolId: this.config.userPoolId,
        Limit: 1
      });
      await this.cognito.send(command);
      console.log('✅ OK');
    } catch (error) {
      console.log('❌ FAILED');
    }
    
    // Check Lambda (health-check function)
    process.stdout.write('Lambda Functions... ');
    try {
      await this.invokeLambda('evo-health-check');
      console.log('✅ OK');
    } catch (error) {
      console.log('❌ FAILED');
    }
    
    // Check API Gateway
    process.stdout.write('API Gateway... ');
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/health`);
      if (response.ok) {
        console.log('✅ OK');
      } else {
        console.log('⚠️  WARNING');
      }
    } catch (error) {
      console.log('❌ FAILED');
    }
    
    console.log('─'.repeat(40));
    console.log('');
  }

  // ============ REPORTS ============

  async generateReport(type: string, organizationId?: string): Promise<void> {
    console.log(`📊 Generating ${type} report...\n`);
    
    const functionMap: Record<string, string> = {
      'security': 'evo-generate-security-pdf',
      'cost': 'evo-generate-cost-report',
      'excel': 'evo-generate-excel-report',
      'compliance': 'evo-compliance-scan'
    };
    
    const functionName = functionMap[type];
    if (!functionName) {
      console.error(`❌ Unknown report type: ${type}`);
      console.log('   Available types: security, cost, excel, compliance');
      process.exit(1);
    }
    
    try {
      const result = await this.invokeLambda(functionName, {
        organization_id: organizationId
      });
      
      console.log('✅ Report generated successfully!');
      if (result?.body) {
        const data = JSON.parse(result.body);
        if (data.url) {
          console.log(`   Download: ${data.url}`);
        }
      }
    } catch (error) {
      console.error('❌ Report generation failed');
      process.exit(1);
    }
  }
}

// CLI Setup
const program = new Command();
const cli = new EvoCLI();

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));

program
  .name('evo-cli')
  .description('EVO UDS Command Line Interface (AWS)')
  .version(packageJson.version);

// User Commands
const users = program.command('users').description('User management');

users
  .command('list')
  .description('List all users')
  .option('-l, --limit <number>', 'Number of users to list', '60')
  .action((options) => cli.listUsers(parseInt(options.limit)));

users
  .command('create')
  .description('Create a new user')
  .argument('<email>', 'User email')
  .argument('<name>', 'User full name')
  .argument('<password>', 'Temporary password')
  .action((email, name, password) => cli.createUser(email, name, password));

users
  .command('delete')
  .description('Delete a user')
  .argument('<username>', 'Username to delete')
  .action((username) => cli.deleteUser(username));

users
  .command('disable')
  .description('Disable a user')
  .argument('<username>', 'Username to disable')
  .action((username) => cli.disableUser(username));

users
  .command('enable')
  .description('Enable a user')
  .argument('<username>', 'Username to enable')
  .action((username) => cli.enableUser(username));

// Scan Commands
const scan = program.command('scan').description('Run security and cost scans');

scan
  .command('security')
  .description('Run security scan')
  .option('-o, --org <id>', 'Organization ID')
  .action((options) => cli.runSecurityScan(options.org));

scan
  .command('cost')
  .description('Run cost optimization analysis')
  .option('-o, --org <id>', 'Organization ID')
  .action((options) => cli.runCostOptimization(options.org));

// Report Commands
const report = program.command('report').description('Generate reports');

report
  .command('generate')
  .description('Generate a report')
  .argument('<type>', 'Report type (security, cost, excel, compliance)')
  .option('-o, --org <id>', 'Organization ID')
  .action((type, options) => cli.generateReport(type, options.org));

// Health Command
program
  .command('health')
  .description('Run health checks')
  .action(() => cli.healthCheck());

// Help text
program.addHelpText('after', `
Environment Variables:
  AWS_REGION              AWS region (default: us-east-1)
  AWS_USER_POOL_ID        Cognito User Pool ID
  VITE_API_BASE_URL       API Gateway base URL
  AWS_ACCESS_KEY_ID       AWS access key
  AWS_SECRET_ACCESS_KEY   AWS secret key

Examples:
  $ evo-cli users list
  $ evo-cli users create john@example.com "John Doe" "TempPass123!"
  $ evo-cli scan security --org org_123
  $ evo-cli report generate security
  $ evo-cli health
`);

program.parse();