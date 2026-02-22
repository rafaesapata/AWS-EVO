/**
 * Helpers para interação com serviços AWS
 */

import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import type { AwsCredentialIdentity } from '@aws-sdk/types';

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

// Cache for assumed role credentials (key: roleArn, value: credentials + expiry)
const assumeRoleCache = new Map<string, { creds: AWSCredentials; expiresAt: number }>();

/**
 * Assume role para obter credenciais temporárias (with caching)
 */
export async function assumeRole(
  roleArn: string,
  externalId: string,
  region: string = 'us-east-1',
  sessionName: string = 'evo-uds-session'
): Promise<AWSCredentials> {
  // Check cache — reuse credentials if still valid (with 5min buffer)
  const cacheKey = `${roleArn}:${externalId}`;
  const cached = assumeRoleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 300_000) {
    return { ...cached.creds, region };
  }

  // Always use us-east-1 for STS to get globally-valid tokens
  // Regional STS endpoints may produce tokens rejected by services in other regions
  // if the customer hasn't enabled regional STS endpoints in their account
  const stsClient = new STSClient({ region: 'us-east-1' });
  
  console.log('🔐 AssumeRole STS call (cache miss):', roleArn.split('/').pop());
  
  const command = new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: sessionName,
    ExternalId: externalId,
    DurationSeconds: 3600, // 1 hora
  });
  
  const response = await stsClient.send(command);
  
  if (!response.Credentials) {
    throw new Error('Failed to assume role: no credentials returned');
  }
  
  const creds: AWSCredentials = {
    accessKeyId: response.Credentials.AccessKeyId!,
    secretAccessKey: response.Credentials.SecretAccessKey!,
    sessionToken: response.Credentials.SessionToken,
    region,
  };

  // Cache with expiry (key includes roleArn+externalId, region is set on retrieval)
  assumeRoleCache.set(cacheKey, {
    creds,
    expiresAt: response.Credentials.Expiration?.getTime() || (Date.now() + 3600_000),
  });

  return creds;
}

/**
 * Invalidate cached credentials for a role (call when token is rejected)
 */
export function invalidateAssumeRoleCache(roleArn?: string): void {
  if (roleArn) {
    for (const key of assumeRoleCache.keys()) {
      if (key.startsWith(roleArn)) {
        assumeRoleCache.delete(key);
      }
    }
  } else {
    assumeRoleCache.clear();
  }
}

/**
 * Converte credenciais para formato AWS SDK
 */
export function toAwsCredentials(creds: AWSCredentials): AwsCredentialIdentity {
  return {
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
  };
}

/**
 * Resolve credenciais AWS (assume role se necessário)
 */
export async function resolveAwsCredentials(
  credential: {
    access_key_id?: string | null;
    secret_access_key?: string | null;
    role_arn?: string | null;
    external_id?: string | null;
    session_token?: string | null;
  },
  region: string
): Promise<AWSCredentials> {
  // PRIORITY 1: Se tem role_arn explícito, usa ele (mais confiável)
  if (credential.role_arn && credential.external_id) {
    return assumeRole(credential.role_arn, credential.external_id, region);
  }
  
  // PRIORITY 2: Check if access_key_id contains ROLE: prefix (CloudFormation deployment pattern)
  if (credential.access_key_id?.startsWith('ROLE:')) {
    const roleArn = credential.access_key_id.replace('ROLE:', '');
    const externalId = credential.external_id || 
                       credential.secret_access_key?.replace('EXTERNAL_ID:', '') || '';
    return assumeRole(roleArn, externalId, region);
  }
  
  // Senão, usa credenciais diretas
  if (credential.access_key_id && credential.secret_access_key) {
    return {
      accessKeyId: credential.access_key_id,
      secretAccessKey: credential.secret_access_key,
      sessionToken: credential.session_token || undefined,
      region,
    };
  }
  
  throw new Error('No valid AWS credentials found');
}

/**
 * Valida se credenciais AWS são válidas
 */
export async function validateAwsCredentials(creds: AWSCredentials): Promise<boolean> {
  try {
    const stsClient = new STSClient({
      region: creds.region,
      credentials: toAwsCredentials(creds),
    });
    
    const { GetCallerIdentityCommand } = await import('@aws-sdk/client-sts');
    await stsClient.send(new GetCallerIdentityCommand({}));
    
    return true;
  } catch (error) {
    console.error('❌ Invalid AWS credentials:', error);
    return false;
  }
}
