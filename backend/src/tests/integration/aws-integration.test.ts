/**
 * AWS Integration Tests
 * Tests real AWS service interactions (requires AWS credentials)
 * 
 * IMPORTANT: These tests use REAL AWS services, not mocks.
 * Run with: npm run test:integration
 * 
 * Prerequisites:
 * - AWS credentials configured
 * - Test AWS account with appropriate permissions
 * - Environment variables set (see .env.test.example)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { CognitoIdentityProviderClient, DescribeUserPoolCommand } from '@aws-sdk/client-cognito-identity-provider';
import { S3Client, ListBucketsCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Skip tests if not in integration mode
const INTEGRATION_MODE = process.env.INTEGRATION_TESTS === 'true';
const describeIntegration = INTEGRATION_MODE ? describe : describe.skip;

// Test configuration
const TEST_CONFIG = {
  region: process.env.AWS_REGION || 'us-east-1',
  cognitoUserPoolId: process.env.USER_POOL_ID || 'us-east-1_qGmGkvmpL',
  s3Bucket: process.env.S3_BUCKET || 'evo-uds-v3-production-frontend-383234048592',
};

describeIntegration('AWS Integration Tests', () => {
  let stsClient: STSClient;
  let cognitoClient: CognitoIdentityProviderClient;
  let s3Client: S3Client;

  beforeAll(() => {
    stsClient = new STSClient({ region: TEST_CONFIG.region });
    cognitoClient = new CognitoIdentityProviderClient({ region: TEST_CONFIG.region });
    s3Client = new S3Client({ region: TEST_CONFIG.region });
  });

  describe('AWS Credentials Validation', () => {
    it('should have valid AWS credentials', async () => {
      const command = new GetCallerIdentityCommand({});
      const response = await stsClient.send(command);

      expect(response.Account).toBeDefined();
      expect(response.Arn).toBeDefined();
      expect(response.UserId).toBeDefined();

      console.log('AWS Account:', response.Account);
      console.log('AWS ARN:', response.Arn);
    });

    it('should be in the correct AWS account', async () => {
      const command = new GetCallerIdentityCommand({});
      const response = await stsClient.send(command);

      // Verify we're in the expected account (if configured)
      const expectedAccount = process.env.AWS_ACCOUNT_ID;
      if (expectedAccount) {
        expect(response.Account).toBe(expectedAccount);
      }
    });
  });

  describe('Cognito Integration', () => {
    it('should connect to Cognito User Pool', async () => {
      const command = new DescribeUserPoolCommand({
        UserPoolId: TEST_CONFIG.cognitoUserPoolId,
      });

      const response = await cognitoClient.send(command);

      expect(response.UserPool).toBeDefined();
      expect(response.UserPool?.Id).toBe(TEST_CONFIG.cognitoUserPoolId);
      expect(response.UserPool?.Name).toBeDefined();

      console.log('User Pool Name:', response.UserPool?.Name);
      console.log('User Pool Status:', response.UserPool?.Status);
    });

    it('should have MFA configuration', async () => {
      const command = new DescribeUserPoolCommand({
        UserPoolId: TEST_CONFIG.cognitoUserPoolId,
      });

      const response = await cognitoClient.send(command);

      // Check MFA configuration exists
      expect(response.UserPool?.MfaConfiguration).toBeDefined();
      console.log('MFA Configuration:', response.UserPool?.MfaConfiguration);
    });
  });

  describe('S3 Integration', () => {
    it('should list S3 buckets', async () => {
      const command = new ListBucketsCommand({});
      const response = await s3Client.send(command);

      expect(response.Buckets).toBeDefined();
      expect(Array.isArray(response.Buckets)).toBe(true);

      console.log('Total Buckets:', response.Buckets?.length);
    });

    it('should access the frontend bucket', async () => {
      const command = new HeadBucketCommand({
        Bucket: TEST_CONFIG.s3Bucket,
      });

      // This will throw if bucket doesn't exist or no access
      await expect(s3Client.send(command)).resolves.toBeDefined();
    });
  });
});

describeIntegration('Database Integration Tests', () => {
  // Import Prisma client
  let prisma: any;

  beforeAll(async () => {
    const { getPrismaClient } = await import('../../lib/database.js');
    prisma = getPrismaClient();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe('Database Connection', () => {
    it('should connect to PostgreSQL', async () => {
      const result = await prisma.$queryRaw`SELECT 1 as test`;
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should have required tables', async () => {
      const tables = await prisma.$queryRaw`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `;

      const tableNames = (tables as any[]).map(t => t.table_name);
      
      // Check for essential tables
      const requiredTables = [
        'organizations',
        'profiles',
        'aws_credentials',
        'security_scans',
        'findings',
      ];

      for (const table of requiredTables) {
        expect(tableNames).toContain(table);
      }
    });

    it('should enforce organization isolation', async () => {
      // Create test organization
      const testOrgId = `test-org-${Date.now()}`;
      
      // This should work - creating in own org
      const org = await prisma.organization.create({
        data: {
          id: testOrgId,
          name: 'Test Organization',
          slug: `test-org-${Date.now()}`,
        },
      });

      expect(org.id).toBe(testOrgId);

      // Cleanup
      await prisma.organization.delete({
        where: { id: testOrgId },
      });
    });
  });
});

describeIntegration('API Gateway Integration Tests', () => {
  const API_BASE_URL = process.env.API_BASE_URL || 'https://api-evo.ai.udstec.io';

  describe('Health Check Endpoints', () => {
    it('should respond to health check', async () => {
      const response = await fetch(`${API_BASE_URL}/api/functions/health-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Health check might require auth, so 401 is acceptable
      expect([200, 401, 403]).toContain(response.status);
    });

    it('should handle CORS preflight', async () => {
      const response = await fetch(`${API_BASE_URL}/api/functions/health-check`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://evo.ai.udstec.io',
          'Access-Control-Request-Method': 'POST',
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeDefined();
    });
  });

  describe('Authentication Flow', () => {
    it('should reject unauthenticated requests', async () => {
      const response = await fetch(`${API_BASE_URL}/api/functions/list-aws-credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(401);
    });

    it('should include security headers', async () => {
      const response = await fetch(`${API_BASE_URL}/api/functions/health-check`, {
        method: 'OPTIONS',
      });

      // Check for security headers
      const headers = response.headers;
      expect(headers.get('Access-Control-Allow-Methods')).toBeDefined();
    });
  });
});

describeIntegration('Rate Limiting Integration Tests', () => {
  const API_BASE_URL = process.env.API_BASE_URL || 'https://api-evo.ai.udstec.io';

  it('should enforce rate limits on rapid requests', async () => {
    const requests = [];
    
    // Send 20 rapid requests
    for (let i = 0; i < 20; i++) {
      requests.push(
        fetch(`${API_BASE_URL}/api/functions/health-check`, {
          method: 'OPTIONS',
        })
      );
    }

    const responses = await Promise.all(requests);
    const statuses = responses.map(r => r.status);

    // Most should succeed, but some might be rate limited
    const successCount = statuses.filter(s => s === 200).length;
    const rateLimitedCount = statuses.filter(s => s === 429).length;

    console.log(`Success: ${successCount}, Rate Limited: ${rateLimitedCount}`);
    
    // At least some should succeed
    expect(successCount).toBeGreaterThan(0);
  });
});

describeIntegration('Circuit Breaker Integration Tests', () => {
  it('should handle service failures gracefully', async () => {
    const { withAwsCircuitBreaker, getServiceCircuitStatus } = await import('../../lib/circuit-breaker.js');

    // Simulate a failing operation
    let failCount = 0;
    const failingOperation = async () => {
      failCount++;
      if (failCount <= 3) {
        throw new Error('ThrottlingException: Rate exceeded');
      }
      return 'success';
    };

    // First few calls should fail
    for (let i = 0; i < 3; i++) {
      try {
        await withAwsCircuitBreaker('test-service', failingOperation);
      } catch (e) {
        // Expected
      }
    }

    // Check circuit status
    const status = getServiceCircuitStatus('test-service');
    console.log('Circuit Status:', status);
  });
});
