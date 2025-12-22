import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 Getting findings...');

    // Parse request body for filters
    const { severity, status, source, accountId } = await req.json().catch(() => ({}));

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      console.error('❌ No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'No authorization provided' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user auth
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      console.error('❌ User authentication failed:', userError?.message || 'User not found');
      return new Response(
        JSON.stringify({ 
          error: 'Authentication failed', 
          details: userError?.message || 'Invalid or expired token'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ User authenticated:', user.id);

    // Get user's organization
    const { data: orgId, error: orgError } = await supabaseClient
      .rpc('get_user_organization', { _user_id: user.id });

    if (orgError || !orgId) {
      console.error('❌ Failed to get organization:', orgError);
      return new Response(
        JSON.stringify({ error: 'Organization not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🏢 Organization:', orgId);
    console.log('🔍 Filters:', { severity, status, source, accountId });

    // Build query with filters
    let query = supabaseClient
      .from('findings')
      .select('*')
      .eq('organization_id', orgId);

    // Apply filters
    if (source && source !== 'all') {
      query = query.eq('source', source);
    }

    if (severity && severity !== 'all') {
      query = query.eq('severity', severity);
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    // Filter by account if provided (check details.aws_account_id)
    if (accountId) {
      query = query.contains('details', { aws_account_id: accountId });
    }

    // Execute query
    const { data: findings, error: findingsError } = await query
      .order('created_at', { ascending: false });

    if (findingsError) {
      console.error('❌ Error fetching findings:', findingsError);
      return new Response(
        JSON.stringify({ error: findingsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Findings fetched:', findings?.length || 0, 'records for account:', accountId || 'all');

    return new Response(
      JSON.stringify({ data: findings || [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
