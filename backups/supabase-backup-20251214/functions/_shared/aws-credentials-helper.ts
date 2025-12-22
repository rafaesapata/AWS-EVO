/**
 * AWS Credentials Helper
 * 
 * SECURITY CRITICAL: This module handles AWS credentials
 * 
 * IMPORTANT: This system ONLY supports CloudFormation + Role + AssumeRole credentials.
 * Direct IAM Access Keys are NOT supported and will be rejected.
 * 
 * All edge functions MUST use getResolvedAWSCredentials() for AWS API calls.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

// Types
export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  accountId?: string;
  expiresAt?: Date;
  credentialType: 'iam_role';
}

export interface CredentialResolutionResult {
  success: boolean;
  credentials?: AWSCredentials;
  error?: string;
  isRoleBased: boolean;
}

// Cache for role-based credentials (expire before actual expiration for safety margin)
const credentialCache = new Map<string, { credentials: AWSCredentials; expiresAt: number }>();
const CACHE_SAFETY_MARGIN_MS = 5 * 60 * 1000; // 5 minutes before expiration

/**
 * Resolves AWS credentials from database record
 * 
 * SECURITY: This function ONLY accepts role-based credentials (CloudFormation pattern)
 * Direct IAM Access Keys will be REJECTED
 */
export async function resolveCredentials(
  awsCredentialsRecord: {
    id: string;
    access_key_id: string;
    secret_access_key: string;
    regions: string[];
    account_id?: string;
  },
  preferredRegion?: string
): Promise<CredentialResolutionResult> {
  const region = preferredRegion || awsCredentialsRecord.regions?.[0] || 'us-east-1';
  
  // SECURITY CHECK: Only role-based credentials are allowed
  const isRoleBased = awsCredentialsRecord.access_key_id.startsWith('ROLE:');
  
  if (!isRoleBased) {
    console.error('❌ SECURITY: Direct IAM Access Keys are NOT supported. Use CloudFormation + Role instead.');
    return {
      success: false,
      isRoleBased: false,
      error: 'Direct IAM Access Keys are not supported. Please configure AWS access using CloudFormation with IAM Role.'
    };
  }
  
  return resolveRoleBasedCredentials(awsCredentialsRecord, region);
}

/**
 * Resolves role-based credentials via STS AssumeRole
 * Uses caching to minimize STS calls
 */
async function resolveRoleBasedCredentials(
  record: {
    id: string;
    access_key_id: string;
    secret_access_key: string;
    account_id?: string;
  },
  region: string
): Promise<CredentialResolutionResult> {
  const cacheKey = `${record.id}-${region}`;
  
  // Check cache first
  const cached = credentialCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    console.log(`✅ Using cached role credentials for ${record.id}`);
    return {
      success: true,
      isRoleBased: true,
      credentials: cached.credentials
    };
  }
  
  // Extract Role ARN and External ID
  const roleArn = record.access_key_id.replace('ROLE:', '');
  const externalId = record.secret_access_key.replace('EXTERNAL_ID:', '');
  
  if (!roleArn || !externalId) {
    return {
      success: false,
      isRoleBased: true,
      error: 'Invalid role-based credentials format. Expected ROLE:arn and EXTERNAL_ID:id'
    };
  }
  
  console.log(`🔐 Assuming role: ${roleArn.substring(0, 50)}...`);
  
  try {
    // Call STS AssumeRole
    const assumeRoleResult = await assumeRole(roleArn, externalId, region);
    
    if (!assumeRoleResult.success || !assumeRoleResult.credentials) {
      return {
        success: false,
        isRoleBased: true,
        error: assumeRoleResult.error || 'Failed to assume role'
      };
    }
    
    const credentials: AWSCredentials = {
      accessKeyId: assumeRoleResult.credentials.accessKeyId,
      secretAccessKey: assumeRoleResult.credentials.secretAccessKey,
      sessionToken: assumeRoleResult.credentials.sessionToken,
      region,
      accountId: record.account_id,
      expiresAt: assumeRoleResult.credentials.expiresAt,
      credentialType: 'iam_role'
    };
    
    // Cache the credentials
    const expiresAt = assumeRoleResult.credentials.expiresAt?.getTime() || (Date.now() + 3600000);
    credentialCache.set(cacheKey, {
      credentials,
      expiresAt: expiresAt - CACHE_SAFETY_MARGIN_MS
    });
    
    console.log(`✅ Role assumed successfully, expires at ${assumeRoleResult.credentials.expiresAt}`);
    
    return {
      success: true,
      isRoleBased: true,
      credentials
    };
    
  } catch (error) {
    console.error('❌ Error assuming role:', error);
    return {
      success: false,
      isRoleBased: true,
      error: error instanceof Error ? error.message : 'Unknown error assuming role'
    };
  }
}

/**
 * Signs STS AssumeRole request using AWS Platform credentials
 */
async function signSTSAssumeRoleRequest(
  platformAccessKeyId: string,
  platformSecretAccessKey: string,
  host: string,
  body: string,
  region: string
): Promise<Record<string, string>> {
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = timestamp.substring(0, 8);
  const service = 'sts';
  
  const contentType = 'application/x-www-form-urlencoded; charset=utf-8';
  
  const headersToSign: Record<string, string> = {
    'content-type': contentType,
    'host': host,
    'x-amz-date': timestamp,
  };
  
  const sortedHeaderNames = Object.keys(headersToSign).sort();
  const canonicalHeaders = sortedHeaderNames.map(name => `${name}:${headersToSign[name]}\n`).join('');
  const signedHeaders = sortedHeaderNames.join(';');
  
  const payloadHash = await sha256(body);
  
  const canonicalRequest = [
    'POST',
    '/',
    '', // query string (empty for POST)
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  
  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope,
    await sha256(canonicalRequest)
  ].join('\n');
  
  const signingKey = await getSignatureKey(platformSecretAccessKey, date, region, service);
  const signature = await hmacHex(signingKey, stringToSign);
  
  const authHeader = `AWS4-HMAC-SHA256 Credential=${platformAccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  return {
    'Content-Type': contentType,
    'Host': host,
    'X-Amz-Date': timestamp,
    'Authorization': authHeader,
  };
}

/**
 * Performs STS AssumeRole call using AWS Platform credentials for authentication
 */
async function assumeRole(
  roleArn: string,
  externalId: string,
  region: string
): Promise<{
  success: boolean;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiresAt: Date;
  };
  error?: string;
}> {
  // Get platform credentials from environment
  const platformAccessKeyId = Deno.env.get('AWS_PLATFORM_ACCESS_KEY_ID');
  const platformSecretAccessKey = Deno.env.get('AWS_PLATFORM_SECRET_ACCESS_KEY');
  
  if (!platformAccessKeyId || !platformSecretAccessKey) {
    console.error('❌ AWS Platform credentials not configured');
    return {
      success: false,
      error: 'AWS Platform credentials not configured. Please configure AWS_PLATFORM_ACCESS_KEY_ID and AWS_PLATFORM_SECRET_ACCESS_KEY.'
    };
  }
  
  const stsRegion = region === 'us-east-1' ? 'us-east-1' : region;
  const host = stsRegion === 'us-east-1' ? 'sts.amazonaws.com' : `sts.${stsRegion}.amazonaws.com`;
  const endpoint = `https://${host}/`;
  
  // Build AssumeRole request body
  const params = new URLSearchParams();
  params.append('Action', 'AssumeRole');
  params.append('Version', '2011-06-15');
  params.append('RoleArn', roleArn);
  params.append('RoleSessionName', `evo-platform-${Date.now()}`);
  params.append('ExternalId', externalId);
  params.append('DurationSeconds', '3600'); // 1 hour
  
  const body = params.toString();
  
  console.log(`📤 Calling STS AssumeRole at ${endpoint}`);
  
  // Sign the request using platform credentials
  const signedHeaders = await signSTSAssumeRoleRequest(
    platformAccessKeyId,
    platformSecretAccessKey,
    host,
    body,
    stsRegion
  );
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: signedHeaders,
    body
  });
  
  const responseText = await response.text();
  
  if (!response.ok) {
    console.error('❌ STS AssumeRole failed:', response.status);
    console.error('Response:', responseText.substring(0, 500));
    
    // Parse error from XML
    const errorMatch = responseText.match(/<Message>(.*?)<\/Message>/);
    const errorCode = responseText.match(/<Code>(.*?)<\/Code>/);
    
    return {
      success: false,
      error: errorMatch?.[1] || errorCode?.[1] || `STS error: ${response.status}`
    };
  }
  
  // Parse successful response
  const accessKeyIdMatch = responseText.match(/<AccessKeyId>(.*?)<\/AccessKeyId>/);
  const secretAccessKeyMatch = responseText.match(/<SecretAccessKey>(.*?)<\/SecretAccessKey>/);
  const sessionTokenMatch = responseText.match(/<SessionToken>(.*?)<\/SessionToken>/);
  const expirationMatch = responseText.match(/<Expiration>(.*?)<\/Expiration>/);
  
  if (!accessKeyIdMatch || !secretAccessKeyMatch || !sessionTokenMatch) {
    return {
      success: false,
      error: 'Invalid response from STS AssumeRole'
    };
  }
  
  console.log('✅ STS AssumeRole successful');
  
  return {
    success: true,
    credentials: {
      accessKeyId: accessKeyIdMatch[1],
      secretAccessKey: secretAccessKeyMatch[1],
      sessionToken: sessionTokenMatch[1],
      expiresAt: expirationMatch ? new Date(expirationMatch[1]) : new Date(Date.now() + 3600000)
    }
  };
}

/**
 * Clears credential cache for a specific account
 */
export function clearCredentialCache(accountId: string): void {
  for (const key of credentialCache.keys()) {
    if (key.startsWith(accountId)) {
      credentialCache.delete(key);
    }
  }
}

/**
 * Validates if credentials are role-based
 */
export function isRoleBasedCredential(accessKeyId: string): boolean {
  return accessKeyId.startsWith('ROLE:');
}

/**
 * MAIN FUNCTION: Get resolved AWS credentials for API calls
 * 
 * All edge functions MUST use this function to obtain AWS credentials.
 * This ensures all AWS access goes through the CloudFormation + Role pattern.
 */
export async function getResolvedAWSCredentials(
  dbCredentials: {
    id: string;
    access_key_id: string;
    secret_access_key: string;
    regions: string[];
    account_id?: string;
  },
  region?: string
): Promise<{
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}> {
  const result = await resolveCredentials(dbCredentials, region);
  
  if (!result.success || !result.credentials) {
    throw new Error(result.error || 'Failed to resolve AWS credentials');
  }
  
  return {
    accessKeyId: result.credentials.accessKeyId,
    secretAccessKey: result.credentials.secretAccessKey,
    sessionToken: result.credentials.sessionToken,
    region: result.credentials.region
  };
}

// ============================================================================
// AWS SIGNATURE V4 HELPERS
// ============================================================================

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacRaw(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  // Create a fresh Uint8Array to avoid SharedArrayBuffer issues
  let keyData: Uint8Array;
  if (key instanceof Uint8Array) {
    keyData = new Uint8Array(key.length);
    keyData.set(key);
  } else {
    keyData = new Uint8Array(key);
  }
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData as BufferSource,
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function hmacHex(key: ArrayBuffer | Uint8Array, message: string): Promise<string> {
  const sig = await hmacRaw(key, message);
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getSignatureKey(secretKey: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const kDate = await hmacRaw(encoder.encode(`AWS4${secretKey}`), dateStamp);
  const kRegion = await hmacRaw(kDate, region);
  const kService = await hmacRaw(kRegion, service);
  return await hmacRaw(kService, 'aws4_request');
}

/**
 * AWS Signature V4 signing for GET requests
 * Properly handles Role credentials with session token
 * IMPORTANT: Includes x-amz-content-sha256 header required by S3 and other services
 */
export async function signAWSGetRequest(
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  service: string,
  region: string,
  host: string,
  path: string,
  queryString: string
): Promise<Record<string, string>> {
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = timestamp.substring(0, 8);
  
  const payloadHash = await sha256('');
  
  // Build canonical headers - MUST include content-sha256 (required by S3) and session token if present
  let canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timestamp}\n`;
  let signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  
  if (credentials.sessionToken) {
    canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timestamp}\nx-amz-security-token:${credentials.sessionToken}\n`;
    signedHeaders = 'host;x-amz-content-sha256;x-amz-date;x-amz-security-token';
  }
  
  const canonicalRequest = [
    'GET',
    path,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  
  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope,
    await sha256(canonicalRequest)
  ].join('\n');
  
  const signingKey = await getSignatureKey(credentials.secretAccessKey, date, region, service);
  const signature = await hmacHex(signingKey, stringToSign);
  
  const authHeader = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  const headers: Record<string, string> = {
    'Host': host,
    'X-Amz-Date': timestamp,
    'X-Amz-Content-Sha256': payloadHash,
    'Authorization': authHeader
  };
  
  if (credentials.sessionToken) {
    headers['X-Amz-Security-Token'] = credentials.sessionToken;
  }
  
  return headers;
}

/**
 * AWS Signature V4 signing for POST requests with JSON body
 * Properly handles Role credentials with session token
 */
export async function signAWSPostRequest(
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  service: string,
  region: string,
  host: string,
  path: string,
  body: string,
  extraHeaders: Record<string, string> = {}
): Promise<Record<string, string>> {
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = timestamp.substring(0, 8);
  
  const contentType = extraHeaders['Content-Type'] || 'application/json';
  
  // Collect all headers that need to be signed (sorted alphabetically by lowercase name)
  const headersToSign: Record<string, string> = {
    'content-type': contentType,
    'host': host,
    'x-amz-date': timestamp,
  };
  
  // Add X-Amz-Target if present
  if (extraHeaders['X-Amz-Target']) {
    headersToSign['x-amz-target'] = extraHeaders['X-Amz-Target'];
  }
  
  // Add session token if present
  if (credentials.sessionToken) {
    headersToSign['x-amz-security-token'] = credentials.sessionToken;
  }
  
  // Sort headers by name
  const sortedHeaderNames = Object.keys(headersToSign).sort();
  
  // Build canonical headers string
  const canonicalHeaders = sortedHeaderNames.map(name => `${name}:${headersToSign[name]}\n`).join('');
  const signedHeaders = sortedHeaderNames.join(';');
  
  const payloadHash = await sha256(body);
  
  const canonicalRequest = [
    'POST',
    path,
    '', // query string (empty for POST)
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  
  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope,
    await sha256(canonicalRequest)
  ].join('\n');
  
  const signingKey = await getSignatureKey(credentials.secretAccessKey, date, region, service);
  const signature = await hmacHex(signingKey, stringToSign);
  
  const authHeader = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  // Build final headers
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Host': host,
    'X-Amz-Date': timestamp,
    'Authorization': authHeader,
  };
  
  if (extraHeaders['X-Amz-Target']) {
    headers['X-Amz-Target'] = extraHeaders['X-Amz-Target'];
  }
  
  if (credentials.sessionToken) {
    headers['X-Amz-Security-Token'] = credentials.sessionToken;
  }
  
  return headers;
}

/**
 * AWS Signature V4 signing for form-urlencoded POST requests (e.g., EC2, RDS Query APIs)
 */
export async function signAWSFormRequest(
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  service: string,
  region: string,
  host: string,
  path: string,
  formBody: string
): Promise<Record<string, string>> {
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = timestamp.substring(0, 8);
  
  const contentType = 'application/x-www-form-urlencoded';
  
  // Build headers to sign
  const headersToSign: Record<string, string> = {
    'content-type': contentType,
    'host': host,
    'x-amz-date': timestamp,
  };
  
  if (credentials.sessionToken) {
    headersToSign['x-amz-security-token'] = credentials.sessionToken;
  }
  
  const sortedHeaderNames = Object.keys(headersToSign).sort();
  const canonicalHeaders = sortedHeaderNames.map(name => `${name}:${headersToSign[name]}\n`).join('');
  const signedHeaders = sortedHeaderNames.join(';');
  
  const payloadHash = await sha256(formBody);
  
  const canonicalRequest = [
    'POST',
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  
  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope,
    await sha256(canonicalRequest)
  ].join('\n');
  
  const signingKey = await getSignatureKey(credentials.secretAccessKey, date, region, service);
  const signature = await hmacHex(signingKey, stringToSign);
  
  const authHeader = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Host': host,
    'X-Amz-Date': timestamp,
    'Authorization': authHeader,
  };
  
  if (credentials.sessionToken) {
    headers['X-Amz-Security-Token'] = credentials.sessionToken;
  }
  
  return headers;
}

/**
 * Helper to make AWS API GET requests with proper signing
 */
export async function makeSignedAWSGetRequest(
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  service: string,
  region: string,
  action: string,
  params: Record<string, string> = {},
  apiVersion?: string
): Promise<Response> {
  const host = service === 'iam' ? 'iam.amazonaws.com' : `${service}.${region}.amazonaws.com`;
  const signingRegion = service === 'iam' ? 'us-east-1' : region;
  
  const queryParams = new URLSearchParams({
    Action: action,
    Version: apiVersion || getAPIVersion(service),
    ...params
  });
  
  const queryString = queryParams.toString();
  const endpoint = `https://${host}/?${queryString}`;
  
  const headers = await signAWSGetRequest(credentials, service, signingRegion, host, '/', queryString);
  
  return fetch(endpoint, {
    method: 'GET',
    headers
  });
}

/**
 * Helper to make AWS API POST requests with JSON body
 */
export async function makeSignedAWSPostRequest(
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  service: string,
  region: string,
  target: string,
  body: object
): Promise<Response> {
  const host = `${service}.${region}.amazonaws.com`;
  const bodyStr = JSON.stringify(body);
  
  const headers = await signAWSPostRequest(
    credentials,
    service,
    region,
    host,
    '/',
    bodyStr,
    {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': target
    }
  );
  
  return fetch(`https://${host}/`, {
    method: 'POST',
    headers,
    body: bodyStr
  });
}

function getAPIVersion(service: string): string {
  const versions: Record<string, string> = {
    's3': '2006-03-01',
    'iam': '2010-05-08',
    'ec2': '2016-11-15',
    'rds': '2014-10-31',
    'elasticloadbalancing': '2015-12-01',
    'wafv2': '2019-07-29',
    'guardduty': '2017-11-28',
    'ssm': '2014-11-06',
    'apigateway': '2015-07-09',
    'ecs': '2014-11-13',
    'lambda': '2015-03-31',
    'kms': '2014-11-01',
    'sns': '2010-03-31',
    'sqs': '2012-11-05',
    'config': '2014-11-12',
    'securityhub': '2018-10-26',
    'cloudwatch': '2010-08-01',
    'cloudtrail': '2013-11-01'
  };
  return versions[service] || '2014-11-01';
}
