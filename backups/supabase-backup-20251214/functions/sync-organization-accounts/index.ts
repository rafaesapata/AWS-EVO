import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { getResolvedAWSCredentials, signAWSPostRequest } from '../_shared/aws-credentials-helper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AWS Signature V4
async function signRequest(method: string, host: string, path: string, query: string, headers: Record<string, string>, payload: string, credentials: any) {
  const algorithm = 'AWS4-HMAC-SHA256';
  const service = 'organizations';
  const region = 'us-east-1'; // Organizations is always in us-east-1
  
  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  const canonicalUri = path;
  const canonicalQuerystring = query;
  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k.toLowerCase()}:${v}\n`)
    .join('');
  const signedHeaders = Object.keys(headers).sort().map(k => k.toLowerCase()).join(';');

  const encoder = new TextEncoder();
  const payloadHash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(payload)))
  ).map(b => b.toString(16).padStart(2, '0')).join('');

  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  
  const canonicalRequestHash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(canonicalRequest)))
  ).map(b => b.toString(16).padStart(2, '0')).join('');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

  async function hmac(key: Uint8Array | string, data: string): Promise<Uint8Array> {
    const keyData = typeof key === 'string' ? encoder.encode(key) : key;
    const keyBuffer = new Uint8Array(keyData);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
    return new Uint8Array(signature);
  }

  const kDate = await hmac(`AWS4${credentials.secret_access_key}`, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = Array.from(await hmac(kSigning, stringToSign))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  const authorizationHeader = `${algorithm} Credential=${credentials.access_key_id}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...headers,
    'Authorization': authorizationHeader,
    'x-amz-date': amzDate,
  };
}

async function listOrganizationAccounts(credentials: any) {
  const host = 'organizations.us-east-1.amazonaws.com';
  const path = '/';
  
  const payload = JSON.stringify({});

  const headers = {
    'Content-Type': 'application/x-amz-json-1.1',
    'X-Amz-Target': 'AWSOrganizationsV20161128.ListAccounts',
    'Host': host
  };

  const signedHeaders = await signRequest('POST', host, path, '', headers, payload, credentials);

  const response = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers: signedHeaders,
    body: payload
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('AWS Organizations error:', errorText);
    throw new Error(`AWS Organizations API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if this is a system/cron call or user call
    const authHeader = req.headers.get('Authorization');
    const isSystemCall = authHeader && authHeader.includes(supabaseKey);

    let organizationId: string | null = null;
    let payerAccountId: string | null = null;

    if (!isSystemCall) {
      // User call - authenticate
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Authentication required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const userClient = createClient(
        supabaseUrl,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid authentication' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: userOrgId, error: orgError } = await supabase.rpc('get_user_organization', { _user_id: user.id });
      if (orgError || !userOrgId) {
        return new Response(
          JSON.stringify({ error: 'Organization not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      organizationId = userOrgId;
      console.log('✅ User authenticated - Organization:', organizationId);
    } else {
      console.log('⚙️ System/cron call detected');
    }

    // Get request body
    try {
      const body = await req.json();
      payerAccountId = body.payerAccountId;
    } catch {
      // If no body, get the first active payer account (only for system calls)
      if (isSystemCall) {
        let query = supabase
          .from('aws_credentials')
          .select('id')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (organizationId) {
          query = query.eq('organization_id', organizationId);
        }
        
        const { data: firstAccount } = await query.maybeSingle();
        payerAccountId = firstAccount?.id;
      }
    }

    if (!payerAccountId) {
      throw new Error('No payer account ID provided and no active accounts found');
    }

    console.log('Syncing organization accounts for payer account:', payerAccountId);

    // Get payer account credentials with organization isolation
    let credQuery = supabase
      .from('aws_credentials')
      .select('*')
      .eq('id', payerAccountId);
    
    if (organizationId) {
      credQuery = credQuery.eq('organization_id', organizationId);
    }
    
    const { data: payerCreds, error: credError } = await credQuery.single();

    if (credError || !payerCreds) {
      throw new Error('Payer account credentials not found or access denied');
    }

    // List all accounts in the organization
    const orgData = await listOrganizationAccounts(payerCreds);
    
    console.log(`Found ${orgData.Accounts?.length || 0} accounts in organization`);

    const syncedAccounts = [];
    
    for (const account of orgData.Accounts || []) {
      // Skip the payer account itself
      if (account.Id === payerCreds.account_id) {
        continue;
      }

      // Check if account already exists
      const { data: existing } = await supabase
        .from('aws_credentials')
        .select('id')
        .eq('account_id', account.Id)
        .eq('organization_id', payerCreds.organization_id)
        .maybeSingle();

      if (!existing) {
        // Create new account entry (uses same credentials as payer for cross-account access)
        const { data: newAccount, error: insertError } = await supabase
          .from('aws_credentials')
          .insert({
            account_id: account.Id,
            account_name: account.Name || account.Email || `Account ${account.Id}`,
            access_key_id: payerCreds.access_key_id,
            secret_access_key: payerCreds.secret_access_key,
            regions: payerCreds.regions,
            organization_id: payerCreds.organization_id,
            is_active: account.Status === 'ACTIVE'
          })
          .select()
          .single();

        if (!insertError && newAccount) {
          syncedAccounts.push({
            id: newAccount.id,
            accountId: account.Id,
            accountName: newAccount.account_name,
            status: account.Status
          });
        }
      } else {
        // Update existing account
        await supabase
          .from('aws_credentials')
          .update({
            account_name: account.Name || account.Email || `Account ${account.Id}`,
            is_active: account.Status === 'ACTIVE'
          })
          .eq('id', existing.id);

        syncedAccounts.push({
          id: existing.id,
          accountId: account.Id,
          accountName: account.Name || account.Email || `Account ${account.Id}`,
          status: account.Status
        });
      }
    }

    console.log(`✅ Synced ${syncedAccounts.length} member accounts`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          totalAccounts: orgData.Accounts?.length || 0,
          syncedAccounts: syncedAccounts.length,
          accounts: syncedAccounts
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error syncing organization accounts:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync organization accounts'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});