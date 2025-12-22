import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { getResolvedAWSCredentials, signAWSPostRequest } from '../_shared/aws-credentials-helper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function fetchAWSCosts(resolvedCreds: { accessKeyId: string; secretAccessKey: string; sessionToken?: string }, startDate: string, endDate: string) {
  const region = 'us-east-1'; // Cost Explorer endpoint is only available in us-east-1
  const host = `ce.${region}.amazonaws.com`;
  const path = '/';
  
  const payload = JSON.stringify({
    TimePeriod: {
      Start: startDate,
      End: endDate
    },
    Granularity: 'DAILY',
    Metrics: ['UnblendedCost'],
    GroupBy: [
      { Type: 'DIMENSION', Key: 'SERVICE' }
    ]
  });

  const signedHeaders = await signAWSPostRequest(
    resolvedCreds,
    'ce',
    region,
    host,
    path,
    payload,
    {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSInsightsIndexService.GetCostAndUsage'
    }
  );

  const response = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers: signedHeaders,
    body: payload
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('AWS Cost Explorer error:', errorText);
    throw new Error(`AWS API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const body = await req.json();
    const accountId = body?.accountId;
    const days = body?.days || 365;

    // Create service role client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization token (JWT already verified by verify_jwt = true)
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Not authenticated' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Decode JWT to extract user info (JWT already verified by verify_jwt = true)
    const token = authHeader.replace('Bearer ', '');
    let userId: string;
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      userId = payload.sub;
      
      if (!userId) {
        throw new Error('User ID not found in token');
      }
    } catch (error) {
      console.error('❌ Failed to decode JWT:', error);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    console.log('✅ User authenticated:', userId);

    // CRITICAL: Get user's organization to ensure data isolation
    const { data: userOrgId, error: orgError } = await supabase
      .rpc('get_user_organization', { _user_id: userId });

    console.log('📌 User organization:', userOrgId, 'Error:', orgError);

    if (orgError || !userOrgId) {
      console.error('❌ Organization not found for user:', userId);
      return new Response(
        JSON.stringify({ success: false, error: 'Organization not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // CRITICAL: Get AWS credentials for the organization
    let credQuery = supabase
      .from('aws_credentials')
      .select('*')
      .eq('organization_id', userOrgId)
      .eq('is_active', true);

    // If specific accountId provided, filter by it
    if (accountId) {
      console.log(`🔍 Fetching specific account ${accountId} for organization ${userOrgId}`);
      credQuery = credQuery.eq('id', accountId);
    } else {
      console.log(`🔍 Fetching first active account for organization ${userOrgId}`);
    }

    const { data: credentials, error: credError } = await credQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log('💳 Credentials query result:', { found: !!credentials, error: credError?.message });

    if (credError || !credentials) {
      console.error('❌ AWS credentials not found. OrgId:', userOrgId, 'Error:', credError);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Credenciais AWS não encontradas para esta organização'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    console.log(`🔄 Fetching FRESH AWS costs from ${startDateStr} to ${endDateStr}`);

    // CRITICAL: Resolve credentials via AssumeRole (CloudFormation Role-based)
    let resolvedCreds;
    try {
      resolvedCreds = await getResolvedAWSCredentials(credentials, 'us-east-1');
      console.log('✅ Credentials resolved successfully via AssumeRole');
    } catch (credError) {
      console.error('❌ Failed to resolve AWS credentials:', credError);
      
      // Log the error
      await supabase.from('aws_api_logs').insert({
        organization_id: credentials.organization_id,
        aws_account_id: accountId,
        service: 'sts',
        operation: 'AssumeRole',
        status_code: 500,
        error_message: credError instanceof Error ? credError.message : 'Failed to assume role',
        request_payload: { accountId }
      });
      
      throw new Error(`Falha ao assumir Role AWS: ${credError instanceof Error ? credError.message : 'Erro desconhecido'}`);
    }

    let awsData;
    try {
      awsData = await fetchAWSCosts(resolvedCreds, startDateStr, endDateStr);
    } catch (awsError) {
      const errorMessage = awsError instanceof Error ? awsError.message : 'Unknown AWS error';
      console.error('❌ AWS Cost Explorer error:', errorMessage);
      
      // Log failed API call
      await supabase.from('aws_api_logs').insert({
        organization_id: credentials.organization_id,
        aws_account_id: accountId,
        service: 'ce',
        operation: 'GetCostAndUsage',
        status_code: 500,
        error_message: errorMessage,
        request_payload: { 
          startDate: startDateStr, 
          endDate: endDateStr,
          accountId 
        }
      });
      
      throw new Error(`Erro ao conectar com AWS Cost Explorer: ${errorMessage}. Verifique suas permissões IAM.`);
    }

    // Validate we got actual data from AWS
    if (!awsData.ResultsByTime || awsData.ResultsByTime.length === 0) {
      console.error('⚠️ AWS returned empty data');
      throw new Error('AWS Cost Explorer retornou dados vazios. Verifique se há custos no período solicitado.');
    }

    console.log(`📊 AWS returned ${awsData.ResultsByTime.length} days of cost data`);

    // Delete old data for this account, organization, and date range to ensure fresh data
    console.log(`🗑️ Deleting old cost data for account ${accountId} from ${startDateStr} to ${endDateStr}`);
    const { error: deleteError } = await supabase
      .from('daily_costs')
      .delete()
      .eq('aws_account_id', accountId)
      .eq('organization_id', credentials.organization_id)
      .gte('cost_date', startDateStr)
      .lte('cost_date', endDateStr);
    
    if (deleteError) {
      console.error('⚠️ Warning: Could not delete old data:', deleteError);
    } else {
      console.log('✅ Old data deleted successfully');
    }

    // Process REAL data from AWS
    const dailyCostsMap = new Map();
    
    for (const result of awsData.ResultsByTime || []) {
      const dateStr = result.TimePeriod.Start;
      let totalCost = 0;
      const serviceBreakdown: Record<string, number> = {};

      for (const group of result.Groups || []) {
        const service = group.Keys[0];
        const amount = parseFloat(group.Metrics.UnblendedCost.Amount);
        serviceBreakdown[service] = amount;
        totalCost += amount;
      }

      dailyCostsMap.set(dateStr, {
        aws_account_id: accountId,
        organization_id: credentials.organization_id,
        cost_date: dateStr,
        total_cost: parseFloat(totalCost.toFixed(2)),
        service_breakdown: serviceBreakdown,
        cost_by_region: {},
        forecasted_month_end: null,
        compared_to_yesterday: null,
        compared_to_last_week: null
      });
    }

    // Use UPSERT to insert/update cost data (prevents duplicate key errors)
    console.log(`💾 Upserting ${dailyCostsMap.size} days of fresh cost data`);
    
    const costDataArray = Array.from(dailyCostsMap.values());
    const { error: upsertError } = await supabase
      .from('daily_costs')
      .upsert(costDataArray, {
        onConflict: 'aws_account_id,cost_date,organization_id',
        ignoreDuplicates: false
      });

    if (upsertError) {
      console.error('❌ Error upserting cost data:', upsertError);
      throw new Error(`Erro ao salvar dados de custo: ${upsertError.message}`);
    }

    console.log(`✅ Successfully fetched and saved ${dailyCostsMap.size} days of REAL AWS cost data`);
    
    // Log successful API call
    await supabase.from('aws_api_logs').insert({
      organization_id: credentials.organization_id,
      aws_account_id: accountId,
      service: 'ce',
      operation: 'GetCostAndUsage',
      status_code: 200,
      request_payload: { 
        startDate: startDateStr, 
        endDate: endDateStr,
        accountId,
        daysReturned: dailyCostsMap.size
      },
      duration_ms: 0
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          dailyCosts: Array.from(dailyCostsMap.values())
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching daily costs:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch daily costs'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
