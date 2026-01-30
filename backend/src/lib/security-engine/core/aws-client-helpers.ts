/**
 * Security Engine V3 - AWS Client Helpers
 * Provides retry-enabled send functions for all AWS SDK clients
 */

import { withRetry, RetryConfig, DEFAULT_RETRY_CONFIG } from './aws-retry.js';

// Default retry config for security scanners
const SCANNER_RETRY_CONFIG: Partial<RetryConfig> = {
  maxRetries: 3,
  baseDelayMs: 200,
  maxDelayMs: 5000,
};

/**
 * Send AWS SDK command with retry
 * Works with any AWS SDK v3 client
 */
export async function sendWithRetry<TClient extends { send: (command: any) => Promise<any> }, TOutput>(
  client: TClient,
  command: { constructor: { name: string } },
  customConfig?: Partial<RetryConfig>
): Promise<TOutput> {
  const operationName = command.constructor?.name || 'UnknownCommand';
  const config = { ...SCANNER_RETRY_CONFIG, ...customConfig };
  
  return withRetry(
    () => client.send(command),
    operationName,
    config
  ) as Promise<TOutput>;
}

/**
 * Create a retry-enabled wrapper for any AWS SDK client
 */
export function wrapClientWithRetry<TClient extends { send: (command: any) => Promise<any> }>(
  client: TClient,
  customConfig?: Partial<RetryConfig>
): TClient & { sendRetry: <T>(command: any) => Promise<T> } {
  const wrappedClient = client as TClient & { sendRetry: <T>(command: any) => Promise<T> };
  
  wrappedClient.sendRetry = async <T>(command: any): Promise<T> => {
    return sendWithRetry<TClient, T>(client, command, customConfig);
  };
  
  return wrappedClient;
}

/**
 * Execute multiple AWS commands in parallel with retry
 */
export async function sendAllWithRetry<TClient extends { send: (command: any) => Promise<any> }>(
  client: TClient,
  commands: Array<{ constructor: { name: string } }>,
  customConfig?: Partial<RetryConfig>
): Promise<PromiseSettledResult<any>[]> {
  return Promise.allSettled(
    commands.map(command => sendWithRetry(client, command, customConfig))
  );
}

/**
 * Execute AWS command with retry, returning null on specific errors
 */
export async function sendWithRetryOrNull<TClient extends { send: (command: any) => Promise<any> }, TOutput>(
  client: TClient,
  command: { constructor: { name: string } },
  ignoredErrors: string[],
  customConfig?: Partial<RetryConfig>
): Promise<TOutput | null> {
  try {
    return await sendWithRetry<TClient, TOutput>(client, command, customConfig);
  } catch (error: any) {
    if (ignoredErrors.includes(error.name) || ignoredErrors.includes(error.code)) {
      return null;
    }
    throw error;
  }
}

/**
 * Common ignored errors for AWS services
 */
export const COMMON_IGNORED_ERRORS = {
  IAM: ['NoSuchEntityException'],
  S3: [
    'NoSuchBucketPolicy',
    'ServerSideEncryptionConfigurationNotFoundError',
    'NoSuchLifecycleConfiguration',
    'NoSuchWebsiteConfiguration',
    'NoSuchCORSConfiguration',
    'ObjectLockConfigurationNotFoundError',
  ],
  Lambda: ['ResourceNotFoundException', 'ResourceNotFoundError'],
  KMS: ['NotFoundException', 'DisabledException'],
  ECR: ['LifecyclePolicyNotFoundException', 'RepositoryPolicyNotFoundException'],
  Backup: ['ResourceNotFoundException'],
  Macie: ['ResourceNotFoundException'],
  Config: ['NoSuchConfigRuleException'],
  GuardDuty: ['BadRequestException'],
  SecurityHub: ['ResourceNotFoundException'],
};
