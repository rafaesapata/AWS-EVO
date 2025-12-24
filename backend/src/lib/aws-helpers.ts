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

/**
 * Assume role para obter credenciais temporárias
 */
export async function assumeRole(
  roleArn: string,
  externalId: string,
  region: string = 'us-east-1',
  sessionName: string = 'evo-uds-session'
): Promise<AWSCredentials> {
  const stsClient = new STSClient({ region });
  
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
  
  return {
    accessKeyId: response.Credentials.AccessKeyId!,
    secretAccessKey: response.Credentials.SecretAccessKey!,
    sessionToken: response.Credentials.SessionToken,
    region,
  };
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
  // Check if access_key_id contains ROLE: prefix (CloudFormation deployment pattern)
  // In this case, the role ARN is stored in access_key_id with ROLE: prefix
  // and external_id is stored in secret_access_key with EXTERNAL_ID: prefix
  if (credential.access_key_id?.startsWith('ROLE:')) {
    const roleArn = credential.access_key_id.replace('ROLE:', '');
    const externalId = credential.external_id || 
                       credential.secret_access_key?.replace('EXTERNAL_ID:', '') || '';
    
    console.log('🔐 Assuming role (from ROLE: prefix):', roleArn);
    console.log('🔐 External ID:', externalId ? `${externalId.substring(0, 8)}...` : 'EMPTY');
    console.log('🔐 credential.external_id:', credential.external_id ? 'SET' : 'NULL');
    console.log('🔐 credential.secret_access_key starts with EXTERNAL_ID:', credential.secret_access_key?.startsWith('EXTERNAL_ID:'));
    return assumeRole(roleArn, externalId, region);
  }
  
  // Se tem role_arn, usa AssumeRole
  if (credential.role_arn && credential.external_id) {
    console.log('🔐 Assuming role:', credential.role_arn);
    return assumeRole(credential.role_arn, credential.external_id, region);
  }
  
  // Senão, usa credenciais diretas
  if (credential.access_key_id && credential.secret_access_key) {
    console.log('🔑 Using direct credentials');
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
