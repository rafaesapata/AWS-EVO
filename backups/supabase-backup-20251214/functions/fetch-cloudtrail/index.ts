import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { getResolvedAWSCredentials, signAWSPostRequest } from '../_shared/aws-credentials-helper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get Authorization header (JWT is verified automatically by verify_jwt = true)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Parse request body to get maxEvents
    let maxEvents = 50; // Default
    try {
      const body = await req.json();
      if (body.maxEvents && [50, 200, 500].includes(body.maxEvents)) {
        maxEvents = body.maxEvents;
      }
    } catch {
      // No body or invalid JSON, use default
    }

    console.log('Requested maxEvents:', maxEvents);

    // Extract user ID from JWT token
    const token = authHeader.replace('Bearer ', '');
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT token');
    }
    
    const payload = JSON.parse(atob(parts[1]));
    const userId = payload.sub;
    
    if (!userId) {
      throw new Error('User ID not found in token');
    }

    console.log('Authenticated user:', userId);

    // Create Supabase client with SERVICE_ROLE_KEY for database operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Get user's organization
    const { data: orgId, error: orgError } = await supabase.rpc('get_user_organization', { 
      _user_id: userId 
    });
    
    if (orgError || !orgId) {
      console.error('Organization error:', orgError);
      throw new Error('Organization not found');
    }

    console.log('User organization:', orgId);

    // Get AWS credentials for user's organization
    const { data: credentials, error: credError } = await supabase
      .from('aws_credentials')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (credError || !credentials) {
      console.error('Error fetching credentials:', credError);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'AWS credentials not configured',
          userMessage: 'Credenciais AWS não configuradas'
        }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Get the first region from the regions array
    const region = credentials.regions?.[0] || 'us-east-1';
    
    console.log('Fetching CloudTrail events from region:', region);

    // Resolve credentials via AssumeRole if using CloudFormation roles
    let resolvedCreds;
    try {
      resolvedCreds = await getResolvedAWSCredentials(credentials, region);
      console.log('✅ Credentials resolved via AssumeRole');
    } catch (e) {
      console.error('❌ Failed to resolve credentials:', e);
      throw new Error(`Failed to resolve AWS credentials: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    // Fetch events with pagination
    const allEvents: any[] = [];
    let nextToken: string | undefined = undefined;
    const maxResultsPerRequest = 50; // AWS limit per request
    
    // Track request start time for duration calculation
    const requestStartTime = Date.now();
    
    // AWS CloudTrail API configuration
    const service = 'cloudtrail';
    const host = `${service}.${region}.amazonaws.com`;
    const endpoint = `https://${host}`;
    
    // Get current date and date from 90 days ago (CloudTrail API expects Unix epoch in SECONDS)
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - (90 * 24 * 60 * 60); // 90 days ago in seconds

    console.log('Time range:', new Date(startTime * 1000).toISOString(), 'to', new Date(endTime * 1000).toISOString());

    // Paginate until we have enough events or no more pages
    let pageCount = 0;
    const maxPages = Math.ceil(maxEvents / maxResultsPerRequest);
    
    while (allEvents.length < maxEvents && pageCount < maxPages) {
      pageCount++;
      console.log(`Fetching page ${pageCount}, current events: ${allEvents.length}`);

      // Prepare request body
      const requestBodyObj: any = {
        StartTime: startTime,
        EndTime: endTime,
        MaxResults: maxResultsPerRequest,
      };
      
      if (nextToken) {
        requestBodyObj.NextToken = nextToken;
      }
      
      const requestBody = JSON.stringify(requestBodyObj);

      // Sign the request using shared helper
      const headers = await signAWSPostRequest(
        resolvedCreds,
        service,
        region,
        host,
        '/',
        requestBody,
        {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'CloudTrail_20131101.LookupEvents'
        }
      );

      // Make request to CloudTrail
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: requestBody,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('CloudTrail API error:', response.status, errorText);
        
        // Parse error message for better user feedback
        let errorMessage = 'Failed to fetch CloudTrail events';
        let userMessage = 'Erro ao buscar eventos do CloudTrail';
        
        try {
          const errorJson = JSON.parse(errorText);
          console.error('CloudTrail error details:', errorJson);
          
          if (errorJson.__type?.includes('AccessDeniedException')) {
            userMessage = 'Permissão negada: O usuário AWS não possui permissão "cloudtrail:LookupEvents". Adicione esta permissão à política IAM do usuário.';
            errorMessage = 'AWS Access Denied: Missing cloudtrail:LookupEvents permission';
          } else if (errorJson.__type?.includes('InvalidParameterException')) {
            userMessage = 'Parâmetros inválidos na requisição. Verifique as configurações da conta AWS.';
            errorMessage = errorJson.message || 'Invalid parameters';
          } else if (errorJson.__type) {
            userMessage = `Erro da AWS (${errorJson.__type}): ${errorJson.message || errorText}`;
            errorMessage = errorJson.message || errorText;
          }
        } catch (e) {
          // If not JSON, use raw error text
          console.error('Error parsing CloudTrail error:', e);
          if (errorText.includes('AccessDenied')) {
            userMessage = 'Permissão negada. Verifique as permissões IAM do usuário AWS.';
          } else {
            userMessage = `Erro da AWS: ${errorText.substring(0, 200)}`;
          }
        }
        
        return new Response(
          JSON.stringify({ 
            success: false,
            error: errorMessage,
            userMessage: userMessage,
            details: errorText.substring(0, 500),
            requiresPermission: 'cloudtrail:LookupEvents',
            statusCode: response.status
          }), 
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      const data = await response.json();
      console.log(`Page ${pageCount}: fetched ${data.Events?.length || 0} events`);
      
      if (data.Events && data.Events.length > 0) {
        allEvents.push(...data.Events);
      }
      
      // Check if there are more pages
      nextToken = data.NextToken;
      if (!nextToken) {
        console.log('No more pages available');
        break;
      }
      
      // Small delay to avoid rate limiting
      if (pageCount < maxPages && allEvents.length < maxEvents) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Trim to exact requested amount
    const finalEvents = allEvents.slice(0, maxEvents);
    
    console.log('CloudTrail events fetched successfully:', finalEvents.length, 'events (requested:', maxEvents, ')');

    // Log to aws_api_logs table
    try {
      const durationMs = Date.now() - requestStartTime;
      await supabase.from('aws_api_logs').insert({
        service: 'CloudTrail',
        operation: 'LookupEvents',
        request_payload: { StartTime: startTime, EndTime: endTime, MaxEvents: maxEvents, Pages: pageCount },
        response_payload: { event_count: finalEvents.length },
        status_code: 200,
        duration_ms: Math.min(durationMs, 2147483647), // Ensure within integer range
        region: region,
        organization_id: orgId,
        aws_account_id: credentials.id,
      });
    } catch (logError) {
      // Silently ignore logging errors to not affect main functionality
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        events: finalEvents,
        count: finalEvents.length,
        requestedCount: maxEvents
      }), 
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error in fetch-cloudtrail function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        userMessage: 'Erro interno ao processar requisição. Verifique os logs para mais detalhes.'
      }), 
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
