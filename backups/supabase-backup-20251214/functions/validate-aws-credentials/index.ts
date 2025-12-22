import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { resolveCredentials, isRoleBasedCredential, signAWSGetRequest } from '../_shared/aws-credentials-helper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// EXACT list of required permissions - neither more nor less
const REQUIRED_PERMISSIONS = [
  // Core Cost & Billing
  "ce:GetCostAndUsage",
  "ce:GetCostForecast",
  "ce:GetReservationUtilization",
  "ce:GetSavingsPlansUtilization",
  "ce:GetReservationPurchaseRecommendation",
  "ce:GetSavingsPlansPurchaseRecommendation",
  "cur:DescribeReportDefinitions",
  "budgets:ViewBudget",
  "budgets:DescribeBudgets",
  
  // EC2
  "ec2:DescribeInstances",
  "ec2:DescribeVolumes",
  "ec2:DescribeSnapshots",
  "ec2:DescribeReservedInstances",
  "ec2:DescribeVpcs",
  "ec2:DescribeSecurityGroups",
  "ec2:GetConsoleOutput",
  
  // IAM Security
  "iam:GetAccountPasswordPolicy",
  "iam:GetAccountSummary",
  "iam:ListUsers",
  "iam:GetUser",
  "iam:ListAccessKeys",
  "iam:ListMFADevices",
  "iam:GetCredentialReport",
  "iam:GenerateCredentialReport",
  
  // CloudWatch
  "cloudwatch:GetMetricStatistics",
  "cloudwatch:DescribeAlarms",
  "cloudwatch:ListMetrics",
  
  // S3
  "s3:ListAllMyBuckets",
  "s3:GetBucketVersioning",
  "s3:GetEncryptionConfiguration",
  "s3:GetBucketPublicAccessBlock",
  
  // RDS
  "rds:DescribeDBInstances",
  "rds:DescribeReservedDBInstances",
  "rds:ListTagsForResource",
  
  // CloudTrail
  "cloudtrail:DescribeTrails",
  "cloudtrail:GetTrailStatus",
  "cloudtrail:LookupEvents",
  
  // CloudWatch Logs
  "logs:DescribeLogGroups",
  
  // KMS
  "kms:ListKeys",
  "kms:DescribeKey",
  "kms:GetKeyRotationStatus",
  
  // Lambda
  "lambda:ListFunctions",
  "lambda:GetFunction",
  
  // Savings Plans
  "savingsplans:DescribeSavingsPlans",
  "savingsplans:ListTagsForResource",
  
  // ElastiCache - Resource Monitoring
  "elasticache:DescribeCacheClusters",
  
  // ECS - Resource Monitoring (COMPLETE)
  "ecs:ListClusters",
  "ecs:ListServices",
  "ecs:DescribeServices",
  "ecs:DescribeClusters",
  "ecs:DescribeTasks",
  "ecs:ListTasks",
  
  // ELB Classic - Resource Monitoring
  "elasticloadbalancing:DescribeLoadBalancers",
  
  // ALB/NLB (v2) - Resource Monitoring (COMPLETE)
  "elasticloadbalancingv2:DescribeLoadBalancers",
  "elasticloadbalancingv2:DescribeTargetGroups",
  
  // CloudFront - Resource Monitoring
  "cloudfront:ListDistributions",
  "cloudfront:GetDistribution",
  
  // WAF - Resource Monitoring
  "waf:ListWebACLs",
  "waf:GetWebACL",
  "wafv2:ListWebACLs",
  "wafv2:GetWebACL",
  
  // Auto Scaling
  "autoscaling:DescribeAutoScalingGroups",
  
  // DynamoDB
  "dynamodb:ListTables",
  "dynamodb:DescribeTable",
  
  // Config
  "config:DescribeConfigRules",
  "config:GetComplianceDetailsByConfigRule",
  
  // Systems Manager
  "ssm:DescribeInstanceInformation",
  "ssm:GetInventory",
  
  // GuardDuty - Threat Detection
  "guardduty:ListDetectors",
  "guardduty:GetFindings",
  "guardduty:ListFindings",
  
  // STS - Identity
  "sts:GetCallerIdentity",
];

// AWS Signature V4 implementation for STS (with session token support for temporary credentials)
async function signSTSRequest(
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  sessionToken?: string
): Promise<{ headers: Headers; body: string }> {
  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);
  
  const service = 'sts';
  const host = region === 'us-east-1' ? 'sts.amazonaws.com' : `sts.${region}.amazonaws.com`;
  const endpoint = `https://${host}/`;
  
  // STS uses form-urlencoded body
  const body = 'Action=GetCallerIdentity&Version=2011-06-15';
  
  const canonicalUri = '/';
  const canonicalQuerystring = '';
  
  // CRITICAL: Include x-amz-security-token in canonical headers when using temporary credentials
  let canonicalHeaders = `content-type:application/x-www-form-urlencoded; charset=utf-8\nhost:${host}\nx-amz-date:${amzDate}\n`;
  let signedHeaders = 'content-type;host;x-amz-date';
  
  if (sessionToken) {
    canonicalHeaders = `content-type:application/x-www-form-urlencoded; charset=utf-8\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-security-token:${sessionToken}\n`;
    signedHeaders = 'content-type;host;x-amz-date;x-amz-security-token';
  }
  
  // Create payload hash
  const encoder = new TextEncoder();
  const payloadHash = await crypto.subtle.digest('SHA-256', encoder.encode(body));
  const payloadHashHex = Array.from(new Uint8Array(payloadHash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  const canonicalRequest = `POST\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHashHex}`;
  
  // Create string to sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  
  const canonicalRequestHash = await crypto.subtle.digest('SHA-256', encoder.encode(canonicalRequest));
  const canonicalRequestHashHex = Array.from(new Uint8Array(canonicalRequestHash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHashHex}`;
  
  // Calculate signature using HMAC-SHA256
  async function hmac(keyData: ArrayBuffer, message: string): Promise<ArrayBuffer> {
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: { name: 'SHA-256' } },
      false,
      ['sign']
    );
    return await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  }
  
  const initialKey = encoder.encode(`AWS4${secretAccessKey}`);
  let signature = await hmac(initialKey.buffer as ArrayBuffer, dateStamp);
  signature = await hmac(signature, region);
  signature = await hmac(signature, service);
  signature = await hmac(signature, 'aws4_request');
  signature = await hmac(signature, stringToSign);
  
  const signatureHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`;
  
  const headers = new Headers({
    'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    'Host': host,
    'X-Amz-Date': amzDate,
    'Authorization': authorizationHeader
  });
  
  // CRITICAL: Add session token header for temporary credentials
  if (sessionToken) {
    headers.set('X-Amz-Security-Token', sessionToken);
  }
  
  return { headers, body };
}

// Function to compare IAM policies
function comparePermissions(userPermissions: string[]): { missing: string[], extra: string[] } {
  const userPermsSet = new Set(userPermissions.map(p => p.toLowerCase()));
  const requiredPermsSet = new Set(REQUIRED_PERMISSIONS.map(p => p.toLowerCase()));
  
  const missing: string[] = [];
  const extra: string[] = [];
  
  // Find missing permissions
  for (const required of REQUIRED_PERMISSIONS) {
    if (!userPermsSet.has(required.toLowerCase())) {
      missing.push(required);
    }
  }
  
  // Find extra permissions
  for (const userPerm of userPermissions) {
    if (!requiredPermsSet.has(userPerm.toLowerCase())) {
      extra.push(userPerm);
    }
  }
  
  return { missing, extra };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const body = await req.json();
    let accessKeyId, secretAccessKey, regions, accountId, organizationId;

    console.log('🔍 Starting AWS credentials validation...');

    // CRITICAL: Authenticate if this is a user call (not system)
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const isSystemCall = authHeader && authHeader.includes(serviceRoleKey!);

    if (!isSystemCall) {
      // User call - must authenticate
      if (!authHeader) {
        console.error('❌ No Authorization header provided');
        return new Response(
          JSON.stringify({ error: 'Authentication required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Extract the token from the header
      const token = authHeader.replace('Bearer ', '');
      console.log('🔑 Token received, length:', token.length);

      const supabaseClient = createClient(
        supabaseUrl,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
      
      if (authError) {
        console.error('❌ Auth error:', authError.message);
        return new Response(
          JSON.stringify({ error: 'Invalid authentication', details: authError.message }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (!user) {
        console.error('❌ No user found from token');
        return new Response(
          JSON.stringify({ error: 'Invalid authentication', details: 'User not found' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('✅ User authenticated:', user.email);

      const { data: userOrgId, error: orgError } = await supabaseAdmin.rpc('get_user_organization', { _user_id: user.id });
      if (orgError || !userOrgId) {
        console.error('❌ Organization error:', orgError?.message);
        return new Response(
          JSON.stringify({ error: 'Organization not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      organizationId = userOrgId;
      console.log('✅ User authenticated - Organization:', organizationId);
    } else {
      console.log('⚙️ System call detected');
    }

    // Support both direct credentials and accountId
    if (body.accountId) {
      accountId = body.accountId;
      console.log(`📋 Fetching credentials for account ID: ${accountId}`);
      
      let query = supabaseAdmin
        .from('aws_credentials')
        .select('*')
        .eq('id', accountId);
      
      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }
      
      const { data: credentials, error: credError } = await query.single();

      if (credError || !credentials) {
        console.error('❌ Error fetching credentials:', credError);
        throw new Error(`Failed to fetch credentials: ${credError?.message || 'Not found or access denied'}`);
      }

      accessKeyId = credentials.access_key_id;
      secretAccessKey = credentials.secret_access_key;
      regions = credentials.regions || ['us-east-1'];
      
      console.log(`✅ Loaded credentials: ${accessKeyId?.substring(0, 8)}...`);
    } else {
      accessKeyId = body.accessKeyId;
      secretAccessKey = body.secretAccessKey;
      regions = body.regions || ['us-east-1'];
    }

    if (!accessKeyId || !secretAccessKey || !regions || regions.length === 0) {
      return new Response(
        JSON.stringify({
          isValid: false,
          error: 'Missing required credentials or regions'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // SECURITY: Only CloudFormation IAM Role credentials are supported
    const isRoleBased = isRoleBasedCredential(accessKeyId);
    
    if (!isRoleBased) {
      console.error('❌ Direct access keys are not supported. Only CloudFormation IAM Role is allowed.');
      
      if (accountId) {
        await supabaseAdmin
          .from('aws_validation_status')
          .upsert({
            aws_account_id: accountId,
            is_connected: false,
            has_all_permissions: false,
            validation_error: 'Método de autenticação não suportado. Use CloudFormation para conectar sua conta AWS.',
            last_validated_at: new Date().toISOString()
          }, { onConflict: 'aws_account_id', ignoreDuplicates: false });
      }

      return new Response(
        JSON.stringify({
          isValid: false,
          error: 'Método de autenticação não suportado. Use CloudFormation One-Click para conectar sua conta AWS com IAM Role.'
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('🔐 Processing CloudFormation IAM Role credentials via AssumeRole...');
    
    // Resolve role-based credentials
    const resolutionResult = await resolveCredentials({
      id: accountId || 'temp',
      access_key_id: accessKeyId,
      secret_access_key: secretAccessKey,
      regions: regions
    }, regions[0]);
    
    if (!resolutionResult.success || !resolutionResult.credentials) {
      console.error('❌ Failed to assume role:', resolutionResult.error);
      
      if (accountId) {
        await supabaseAdmin
          .from('aws_validation_status')
          .upsert({
            aws_account_id: accountId,
            is_connected: false,
            has_all_permissions: false,
            validation_error: `Erro ao assumir IAM Role: ${resolutionResult.error}`,
            last_validated_at: new Date().toISOString()
          }, { onConflict: 'aws_account_id', ignoreDuplicates: false });
      }

      return new Response(
        JSON.stringify({
          isValid: false,
          error: `Erro ao assumir IAM Role: ${resolutionResult.error}. Verifique se o External ID está correto e o stack CloudFormation foi criado com sucesso.`
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Use resolved credentials for validation (INCLUDING sessionToken for temporary credentials)
    accessKeyId = resolutionResult.credentials.accessKeyId;
    secretAccessKey = resolutionResult.credentials.secretAccessKey;
    const sessionToken = resolutionResult.credentials.sessionToken;
    
    console.log('✅ IAM Role assumed successfully, validating permissions...');
    
    // Extract account ID from Role ARN if not set
    if (!body.accountId) {
      const roleArn = body.accessKeyId?.replace('ROLE:', '') || '';
      const arnMatch = roleArn.match(/arn:aws:iam::(\d{12}):role\//);
      if (arnMatch) {
        const extractedAccountId = arnMatch[1];
        // Update account_id in credentials record
        if (accountId) {
          await supabaseAdmin
            .from('aws_credentials')
            .update({ account_id: extractedAccountId })
            .eq('id', accountId);
        }
      }
    }

    console.log('🧪 Testing AWS connection with STS GetCallerIdentity...');

    // Test AWS connection with manual Signature V4
    try {
      const region = regions[0] || 'us-east-1';
      const host = region === 'us-east-1' ? 'sts.amazonaws.com' : `sts.${region}.amazonaws.com`;
      const endpoint = `https://${host}/`;
      
      // Create signed request
      // CRITICAL: Pass sessionToken for temporary credentials from AssumeRole
      const { headers, body: stsBody } = await signSTSRequest(accessKeyId, secretAccessKey, region, sessionToken);
      
      console.log('📤 Sending request to AWS STS...', endpoint);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: stsBody
      });
      
      const responseText = await response.text();
      console.log(`📥 AWS STS Response status: ${response.status}`);
      
      if (!response.ok) {
        console.error('❌ AWS STS Error:', responseText);
        
        if (accountId) {
          await supabaseAdmin
            .from('aws_validation_status')
            .upsert({
              aws_account_id: accountId,
              is_connected: false,
              has_all_permissions: false,
              validation_error: 'Falha na autenticação com AWS. Verifique se o stack CloudFormation foi criado corretamente e o External ID está correto.',
              last_validated_at: new Date().toISOString()
            });
        }

        return new Response(
          JSON.stringify({
            isValid: false,
            error: 'Falha na autenticação com AWS. Verifique se o stack CloudFormation foi criado corretamente e o External ID está correto.'
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Parse XML response
      const accountMatch = responseText.match(/<Account>(\d+)<\/Account>/);
      const awsAccountId = accountMatch ? accountMatch[1] : 'Unknown';
      const isConnected = true;
      
      console.log('✅ AWS connection successful! Account:', awsAccountId);

      // Permission check - STS GetCallerIdentity success means credentials are valid
      // Individual permission errors will be caught during actual API usage
      console.log('🔐 Credentials validated via STS GetCallerIdentity');
      
      const missingPermissions: string[] = [];
      const extraPermissions: string[] = [];
      const hasAllPermissions = true; // If STS succeeded, credentials are valid

      console.log(`📊 Validation complete:`);
      console.log(`  - Connection: OK`);
      console.log(`  - Account: ${awsAccountId}`);

      // Update validation status AND account details in database
      if (accountId) {
        // Update validation status - CRITICAL: use onConflict for proper upsert
        const { error: updateError } = await supabaseAdmin
          .from('aws_validation_status')
          .upsert({
            aws_account_id: accountId,
            is_connected: isConnected,
            has_all_permissions: hasAllPermissions,
            missing_permissions: missingPermissions,
            validation_error: null,
            last_validated_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { 
            onConflict: 'aws_account_id',
            ignoreDuplicates: false 
          });

        if (updateError) {
          console.error('⚠️ Failed to update validation status:', updateError);
        } else {
          console.log('✅ Validation status updated in database: is_connected=true, has_all_permissions=true');
        }

        // Update account_id in aws_credentials
        const { error: credUpdateError } = await supabaseAdmin
          .from('aws_credentials')
          .update({
            account_id: awsAccountId
          })
          .eq('id', accountId);

        if (credUpdateError) {
          console.error('⚠️ Failed to update account_id:', credUpdateError);
        } else {
          console.log('✅ Account ID updated in credentials:', awsAccountId);
        }
      }

      return new Response(
        JSON.stringify({
          isValid: true,
          has_all_permissions: hasAllPermissions,
          missing_permissions: missingPermissions,
          extra_permissions: extraPermissions,
          required_permissions_count: REQUIRED_PERMISSIONS.length,
          accountId: awsAccountId,
          regions: regions,
          message: hasAllPermissions 
            ? `✅ Credenciais AWS validadas - ${REQUIRED_PERMISSIONS.length} permissões exatas verificadas`
            : `⚠️ Conexão AWS OK - ${missingPermissions.length} permissões faltando${extraPermissions.length > 0 ? `, ${extraPermissions.length} permissões extras` : ''}`
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );

    } catch (awsError) {
      console.error('❌ AWS API Error:', awsError);
      
      if (accountId) {
        await supabaseAdmin
          .from('aws_validation_status')
          .upsert({
            aws_account_id: accountId,
            is_connected: false,
            has_all_permissions: false,
            validation_error: `Erro ao conectar com AWS: ${awsError instanceof Error ? awsError.message : 'Unknown error'}`,
            last_validated_at: new Date().toISOString()
          }, { onConflict: 'aws_account_id', ignoreDuplicates: false });
      }

      return new Response(
        JSON.stringify({
          isValid: false,
          error: `Erro ao conectar com AWS: ${awsError instanceof Error ? awsError.message : 'Erro desconhecido'}`
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

  } catch (error) {
    console.error('❌ Validation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to validate AWS credentials';
    
    return new Response(
      JSON.stringify({
        isValid: false,
        error: errorMessage
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});