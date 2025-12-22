/**
 * AWS Test Environment Setup
 * Configures tests to use real AWS services when credentials are available,
 * otherwise falls back to mocks
 */

import { vi } from 'vitest';
// import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

// Check if AWS credentials are available
export const hasAWSCredentials = (): boolean => {
  return !!(
    process.env.AWS_ACCESS_KEY_ID || 
    process.env.AWS_PROFILE ||
    process.env.AWS_ROLE_ARN
  );
};

// Check if we're in CI environment
export const isCI = (): boolean => {
  return !!(process.env.CI || process.env.GITHUB_ACTIONS);
};

// Determine if we should use real AWS services
export const shouldUseRealAWS = (): boolean => {
  return hasAWSCredentials() && !isCI();
};

// Create a test-friendly Bedrock client
export const createTestBedrockClient = () => {
  if (shouldUseRealAWS()) {
    // return new BedrockRuntimeClient({ 
    //   region: 'us-east-1',
    //   // Use default credential chain
    throw new Error('Real AWS testing disabled - BedrockRuntimeClient not available in frontend');
    });
  }
  
  // Return a mock client for testing
  return {
    send: vi.fn().mockImplementation(async (command) => {
      // Simulate successful Bedrock responses
      if (command.input?.body) {
        const body = JSON.parse(command.input.body);
        
        // Mock different types of responses based on the prompt
        if (body.prompt?.includes('suggest 5-8 relevant tags')) {
          return {
            body: new TextEncoder().encode(JSON.stringify({
              completion: 'aws, cost-optimization, ec2, monitoring'
            }))
          };
        }
        
        if (body.prompt?.includes('Create a concise summary')) {
          return {
            body: new TextEncoder().encode(JSON.stringify({
              completion: 'This article provides comprehensive guidance on optimizing AWS costs through EC2 instance rightsizing and monitoring.'
            }))
          };
        }
        
        if (body.prompt?.includes('Improve the following text')) {
          return {
            body: new TextEncoder().encode(JSON.stringify({
              completion: 'This is improved writing with correct grammar and clear, concise sentences.'
            }))
          };
        }
        
        if (body.prompt?.includes('Translate the following content to Portuguese')) {
          return {
            body: new TextEncoder().encode(JSON.stringify({
              completion: 'Olá, este é um artigo de teste sobre serviços AWS.'
            }))
          };
        }
        
        if (body.prompt?.includes('terraform')) {
          return {
            body: new TextEncoder().encode(JSON.stringify({
              completion: `# Terraform Script - S3 Bucket Encryption

resource "aws_s3_bucket_server_side_encryption_configuration" "bucket_encryption" {
  bucket = var.bucket_name

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Enable versioning for additional protection
resource "aws_s3_bucket_versioning" "bucket_versioning" {
  bucket = var.bucket_name
  versioning_configuration {
    status = "Enabled"
  }
}`
            }))
          };
        }
        
        // Default response
        return {
          body: new TextEncoder().encode(JSON.stringify({
            completion: 'Mock AI response for testing'
          }))
        };
      }
      
      throw new Error('Invalid command');
    })
  };
};

// Enhanced mock implementations that work with real data patterns
export const createEnhancedMocks = () => {
  const mockCognitoAuth = {
    getCurrentUser: vi.fn(),
    getCurrentSession: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  };

  const mockApiClient = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    rpc: vi.fn(),
    invoke: vi.fn(),
  };

  // Configure realistic mock responses
  const mockUser = {
    id: 'test-user-123',
    username: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User',
    organizationId: 'test-org-123',
  };

  const mockSession = {
    user: mockUser,
    accessToken: 'valid-token',
    idToken: 'mock-id-token',
    refreshToken: 'mock-refresh-token',
  };

  // Setup default successful responses
  mockCognitoAuth.getCurrentUser.mockResolvedValue(mockUser);
  mockCognitoAuth.getCurrentSession.mockResolvedValue(mockSession);
  mockCognitoAuth.signIn.mockResolvedValue(mockSession);
  
  mockApiClient.rpc.mockResolvedValue({ 
    data: mockUser.organizationId, 
    error: null 
  });
  
  mockApiClient.invoke.mockResolvedValue({ 
    data: { 
      isValid: true, 
      plan: 'enterprise',
      features: ['advanced-analytics', 'multi-account'],
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }, 
    error: null 
  });

  mockApiClient.select.mockResolvedValue({ 
    data: [], 
    error: null 
  });

  return {
    mockCognitoAuth,
    mockApiClient,
    mockUser,
    mockSession,
  };
};

// Test utilities for AWS integration
export const waitForAWSResponse = async (
  fn: () => Promise<any>, 
  timeout: number = 10000
): Promise<any> => {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    try {
      const result = await fn();
      if (result !== undefined && result !== null && result !== '') {
        return result;
      }
    } catch (error) {
      // If using real AWS and we get a credential error, skip the test
      if (shouldUseRealAWS() && error.message?.includes('credential')) {
        throw new Error('SKIP_TEST: AWS credentials not properly configured');
      }
      throw error;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error(`Timeout waiting for AWS response after ${timeout}ms`);
};

// Skip test if AWS credentials are not available for integration tests
export const skipIfNoAWS = () => {
  if (!shouldUseRealAWS()) {
    return true; // Skip the test
  }
  return false;
};

export default {
  hasAWSCredentials,
  isCI,
  shouldUseRealAWS,
  createTestBedrockClient,
  createEnhancedMocks,
  waitForAWSResponse,
  skipIfNoAWS,
};