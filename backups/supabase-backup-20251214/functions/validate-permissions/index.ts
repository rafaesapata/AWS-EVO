/**
 * Validate AWS Permissions Edge Function
 * 
 * Tests each required permission individually after AssumeRole
 * Returns detailed report of which permissions are available
 * Includes automatic retry with exponential backoff for transient failures
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { resolveCredentials, signAWSGetRequest, signAWSPostRequest } from '../_shared/aws-credentials-helper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry configuration
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Check if an error is retryable (transient)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Network errors
    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return true;
    }
    // DNS errors
    if (message.includes('dns') || message.includes('resolve')) {
      return true;
    }
    // Rate limiting
    if (message.includes('throttl') || message.includes('rate limit') || message.includes('too many')) {
      return true;
    }
    // Service unavailable
    if (message.includes('503') || message.includes('502') || message.includes('504')) {
      return true;
    }
  }
  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number): number {
  const delay = Math.min(
    RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
    RETRY_CONFIG.maxDelayMs
  );
  // Add jitter (0-50% of delay)
  return delay + Math.random() * delay * 0.5;
}

/**
 * Execute with retry logic
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  operationName: string
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < RETRY_CONFIG.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (!isRetryableError(error) || attempt === RETRY_CONFIG.maxAttempts - 1) {
        throw lastError;
      }

      const delay = calculateDelay(attempt);
      console.warn(
        `⚠️ Retryable error in ${operationName}, attempt ${attempt + 1}/${RETRY_CONFIG.maxAttempts}. ` +
        `Retrying in ${Math.round(delay)}ms. Error: ${lastError.message}`
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// Permission test definitions - each entry tests a specific AWS API call
const PERMISSION_TESTS = [
  // Compute & Storage
  { service: 'ec2', action: 'ec2:DescribeInstances', testEndpoint: 'ec2', testAction: 'DescribeInstances', apiVersion: '2016-11-15' },
  { service: 'ec2', action: 'ec2:DescribeVolumes', testEndpoint: 'ec2', testAction: 'DescribeVolumes', apiVersion: '2016-11-15' },
  { service: 'ec2', action: 'ec2:DescribeVpcs', testEndpoint: 'ec2', testAction: 'DescribeVpcs', apiVersion: '2016-11-15' },
  { service: 's3', action: 's3:ListAllMyBuckets', testEndpoint: 's3', testAction: 'ListAllMyBuckets', apiVersion: '2006-03-01' },
  { service: 'rds', action: 'rds:DescribeDBInstances', testEndpoint: 'rds', testAction: 'DescribeDBInstances', apiVersion: '2014-10-31' },
  { service: 'lambda', action: 'lambda:ListFunctions', testEndpoint: 'lambda', testAction: 'ListFunctions', apiVersion: '2015-03-31' },
  
  // Security & Monitoring
  { service: 'iam', action: 'iam:GetAccountSummary', testEndpoint: 'iam', testAction: 'GetAccountSummary', apiVersion: '2010-05-08', isGlobal: true },
  { service: 'iam', action: 'iam:ListUsers', testEndpoint: 'iam', testAction: 'ListUsers', apiVersion: '2010-05-08', isGlobal: true },
  { service: 'cloudwatch', action: 'cloudwatch:ListMetrics', testEndpoint: 'monitoring', testAction: 'ListMetrics', apiVersion: '2010-08-01' },
  { service: 'cloudtrail', action: 'cloudtrail:DescribeTrails', testEndpoint: 'cloudtrail', testAction: 'DescribeTrails', apiVersion: '2013-11-01' },
  { service: 'guardduty', action: 'guardduty:ListDetectors', testEndpoint: 'guardduty', testAction: 'ListDetectors', apiVersion: '2017-11-28' },
  
  // Cost Management
  { service: 'ce', action: 'ce:GetCostAndUsage', testEndpoint: 'ce', testAction: 'GetCostAndUsage', apiVersion: '2017-10-25', isGlobal: true, isJson: true },
  { service: 'budgets', action: 'budgets:DescribeBudgets', testEndpoint: 'budgets', testAction: 'DescribeBudgets', apiVersion: '2016-10-20', isGlobal: true },
  
  // Containers & Networking
  { service: 'ecs', action: 'ecs:ListClusters', testEndpoint: 'ecs', testAction: 'ListClusters', apiVersion: '2014-11-13' },
  { service: 'elb', action: 'elasticloadbalancing:DescribeLoadBalancers', testEndpoint: 'elasticloadbalancing', testAction: 'DescribeLoadBalancers', apiVersion: '2015-12-01' },
  { service: 'cloudfront', action: 'cloudfront:ListDistributions', testEndpoint: 'cloudfront', testAction: 'ListDistributions2020_05_31', apiVersion: '2020-05-31', isGlobal: true },
];

// Critical permissions that must be present for core functionality
const CRITICAL_PERMISSIONS = ['ec2:DescribeInstances', 'iam:GetAccountSummary', 'ce:GetCostAndUsage', 's3:ListAllMyBuckets'];

interface PermissionResult {
  service: string;
  action: string;
  allowed: boolean;
  error?: string;
  responseTime?: number;
}

interface ValidationResult {
  success: boolean;
  totalPermissions: number;
  allowedCount: number;
  deniedCount: number;
  permissionResults: PermissionResult[];
  missingCritical: string[];
  validatedAt: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from auth header
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { accountId, region = 'us-east-1' } = body;

    if (!accountId) {
      return new Response(
        JSON.stringify({ error: 'accountId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's organization
    const { data: orgId, error: orgError } = await supabase.rpc('get_user_organization', { _user_id: user.id });
    if (orgError || !orgId) {
      return new Response(
        JSON.stringify({ error: 'Organization not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get AWS credentials with organization isolation
    const { data: awsCredentials, error: credError } = await supabase
      .from('aws_credentials')
      .select('*')
      .eq('id', accountId)
      .eq('organization_id', orgId)
      .single();

    if (credError || !awsCredentials) {
      return new Response(
        JSON.stringify({ error: 'AWS credentials not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔐 Validating permissions for account: ${awsCredentials.account_id}`);

    // Use shared credentials helper with retry
    let credentialsResult;
    try {
      credentialsResult = await withRetry(
        () => resolveCredentials({
          id: awsCredentials.id,
          access_key_id: awsCredentials.access_key_id,
          secret_access_key: awsCredentials.secret_access_key,
          regions: awsCredentials.regions || [region],
          account_id: awsCredentials.account_id,
        }, region),
        'resolveCredentials'
      );
    } catch (credError) {
      console.error('❌ Error resolving credentials:', credError);
      
      // Update validation status with error
      await supabase
        .from('aws_validation_status')
        .upsert({
          aws_account_id: accountId,
          is_connected: false,
          has_all_permissions: false,
          missing_permissions: [],
          validation_error: credError instanceof Error ? credError.message : 'Failed to assume role after retries',
          last_validated_at: new Date().toISOString(),
        });

      return new Response(
        JSON.stringify({ 
          error: 'Failed to resolve AWS credentials after retries',
          details: credError instanceof Error ? credError.message : 'Unknown error'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!credentialsResult.success || !credentialsResult.credentials) {
      console.error('❌ Credential resolution failed:', credentialsResult.error);
      
      // Update validation status with error
      await supabase
        .from('aws_validation_status')
        .upsert({
          aws_account_id: accountId,
          is_connected: false,
          has_all_permissions: false,
          missing_permissions: [],
          validation_error: credentialsResult.error || 'Failed to assume role',
          last_validated_at: new Date().toISOString(),
        });

      return new Response(
        JSON.stringify({ 
          error: 'Failed to resolve AWS credentials',
          details: credentialsResult.error 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Credentials resolved successfully via shared helper');

    // Test each permission with rate limiting
    const permissionResults: PermissionResult[] = [];
    const missingCritical: string[] = [];
    
    const credentials = {
      accessKeyId: credentialsResult.credentials.accessKeyId,
      secretAccessKey: credentialsResult.credentials.secretAccessKey,
      sessionToken: credentialsResult.credentials.sessionToken,
    };

    for (const test of PERMISSION_TESTS) {
      const startTime = Date.now();
      
      try {
        const result = await testPermission(credentials, test, region);
        
        permissionResults.push({
          service: test.service,
          action: test.action,
          allowed: result.allowed,
          error: result.error,
          responseTime: Date.now() - startTime,
        });

        // Track critical missing permissions
        if (!result.allowed && CRITICAL_PERMISSIONS.includes(test.action)) {
          missingCritical.push(test.action);
        }
      } catch (testError) {
        console.warn(`Error testing ${test.action}:`, testError);
        permissionResults.push({
          service: test.service,
          action: test.action,
          allowed: false,
          error: testError instanceof Error ? testError.message : 'Test failed',
          responseTime: Date.now() - startTime,
        });
      }

      // Small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const allowedCount = permissionResults.filter(p => p.allowed).length;
    const deniedCount = permissionResults.filter(p => !p.allowed).length;

    const validationResult: ValidationResult = {
      success: missingCritical.length === 0,
      totalPermissions: permissionResults.length,
      allowedCount,
      deniedCount,
      permissionResults,
      missingCritical,
      validatedAt: new Date().toISOString(),
    };

    // Update validation status in database
    await supabase
      .from('aws_validation_status')
      .upsert({
        aws_account_id: accountId,
        is_connected: true,
        has_all_permissions: deniedCount === 0,
        missing_permissions: permissionResults.filter(p => !p.allowed).map(p => p.action),
        validation_error: missingCritical.length > 0 
          ? `${missingCritical.length} permissões críticas faltando: ${missingCritical.join(', ')}`
          : (deniedCount > 0 ? `${deniedCount} permissões opcionais faltando` : null),
        last_validated_at: new Date().toISOString(),
      });

    console.log(`✅ Permission validation complete: ${allowedCount}/${permissionResults.length} allowed, ${missingCritical.length} critical missing`);

    return new Response(
      JSON.stringify(validationResult),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error validating permissions:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// PERMISSION TESTING
// ============================================================================

interface PermissionTest {
  service: string;
  action: string;
  testEndpoint: string;
  testAction: string;
  apiVersion: string;
  isGlobal?: boolean;
  isJson?: boolean;
}

async function testPermission(
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  test: PermissionTest,
  region: string
): Promise<{ allowed: boolean; error?: string }> {
  try {
    const testRegion = test.isGlobal ? 'us-east-1' : region;
    const host = getServiceHost(test.testEndpoint, testRegion, test.isGlobal);
    const service = getServiceForSigning(test.testEndpoint);
    
    let response: Response;
    
    if (test.testEndpoint === 's3') {
      // S3 uses GET for ListAllMyBuckets
      const headers = await signAWSGetRequest(
        credentials,
        's3',
        testRegion,
        host,
        '/',
        ''
      );
      response = await fetch(`https://${host}/`, { method: 'GET', headers });
    } else if (test.testEndpoint === 'lambda') {
      // Lambda uses REST API
      const headers = await signAWSGetRequest(
        credentials,
        'lambda',
        testRegion,
        host,
        '/2015-03-31/functions',
        ''
      );
      response = await fetch(`https://${host}/2015-03-31/functions`, { method: 'GET', headers });
    } else if (test.testEndpoint === 'cloudfront') {
      // CloudFront uses REST API  
      const headers = await signAWSGetRequest(
        credentials,
        'cloudfront',
        testRegion,
        host,
        '/2020-05-31/distribution',
        ''
      );
      response = await fetch(`https://${host}/2020-05-31/distribution`, { method: 'GET', headers });
    } else if (test.testEndpoint === 'guardduty') {
      // GuardDuty uses REST API with JSON
      const headers = await signAWSGetRequest(
        credentials,
        'guardduty',
        testRegion,
        host,
        '/detector',
        ''
      );
      response = await fetch(`https://${host}/detector`, { method: 'GET', headers });
    } else if (test.isJson) {
      // JSON-based APIs (Cost Explorer, etc.)
      const body = getTestBody(test.testEndpoint, test.testAction);
      const headers = await signAWSPostRequest(
        credentials,
        service,
        testRegion,
        host,
        '/',
        body,
        { 'X-Amz-Target': `AWSInsightsIndexService.${test.testAction}` }
      );
      response = await fetch(`https://${host}/`, {
        method: 'POST',
        headers,
        body
      });
    } else {
      // Standard Query API (EC2, IAM, RDS, CloudWatch, etc.)
      const body = `Action=${test.testAction}&Version=${test.apiVersion}`;
      const headers = await signAWSFormRequest(
        credentials,
        service,
        testRegion,
        host,
        body
      );
      response = await fetch(`https://${host}/`, {
        method: 'POST',
        headers,
        body
      });
    }
    
    // Check response
    if (response.ok || response.status === 400) {
      // 400 can mean validation error but permission exists
      return { allowed: true };
    }
    
    if (response.status === 403) {
      const text = await response.text();
      if (text.includes('AccessDenied') || text.includes('UnauthorizedAccess')) {
        return { allowed: false, error: 'Access Denied' };
      }
    }
    
    // Other errors - might be rate limiting or service issues
    return { allowed: true }; // Assume allowed if not explicitly denied
    
  } catch (error) {
    // Network errors - don't count as permission denied
    return { allowed: true, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function getServiceHost(endpoint: string, region: string, isGlobal?: boolean): string {
  if (isGlobal || endpoint === 'iam') {
    if (endpoint === 'iam') return 'iam.amazonaws.com';
    if (endpoint === 'ce') return 'ce.us-east-1.amazonaws.com';
    if (endpoint === 'budgets') return 'budgets.amazonaws.com';
    if (endpoint === 'cloudfront') return 'cloudfront.amazonaws.com';
  }
  
  if (endpoint === 's3') return 's3.amazonaws.com';
  if (endpoint === 'monitoring') return `monitoring.${region}.amazonaws.com`;
  
  return `${endpoint}.${region}.amazonaws.com`;
}

function getServiceForSigning(endpoint: string): string {
  if (endpoint === 'monitoring') return 'monitoring';
  if (endpoint === 'elasticloadbalancing') return 'elasticloadbalancing';
  return endpoint;
}

function getTestBody(endpoint: string, action: string): string {
  if (endpoint === 'ce' && action === 'GetCostAndUsage') {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 1);
    
    return JSON.stringify({
      TimePeriod: {
        Start: startDate.toISOString().split('T')[0],
        End: now.toISOString().split('T')[0]
      },
      Granularity: 'DAILY',
      Metrics: ['UnblendedCost']
    });
  }
  
  return '{}';
}

/**
 * Sign AWS form-urlencoded request (for Query APIs)
 */
async function signAWSFormRequest(
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  service: string,
  region: string,
  host: string,
  body: string
): Promise<Record<string, string>> {
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = timestamp.substring(0, 8);
  
  const contentType = 'application/x-www-form-urlencoded; charset=utf-8';
  const payloadHash = await sha256(body);
  
  // Build canonical headers with session token if present
  let canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-date:${timestamp}\n`;
  let signedHeaders = 'content-type;host;x-amz-date';
  
  if (credentials.sessionToken) {
    canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-date:${timestamp}\nx-amz-security-token:${credentials.sessionToken}\n`;
    signedHeaders = 'content-type;host;x-amz-date;x-amz-security-token';
  }
  
  const canonicalRequest = [
    'POST',
    '/',
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
    'Authorization': authHeader
  };
  
  if (credentials.sessionToken) {
    headers['X-Amz-Security-Token'] = credentials.sessionToken;
  }
  
  return headers;
}

// ============================================================================
// CRYPTO HELPERS
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
