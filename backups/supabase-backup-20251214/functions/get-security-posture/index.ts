import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body for accountId filter
    let accountId: string | null = null;
    try {
      const body = await req.json();
      accountId = body.accountId || null;
    } catch {
      // No body or invalid JSON - accountId remains null
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: orgId, error: orgError } = await supabaseClient
      .rpc('get_user_organization', { _user_id: user.id });

    if (orgError || !orgId) {
      return new Response(
        JSON.stringify({ error: 'Organization not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Build query with mandatory organization_id filter
    let query = supabaseClient
      .from('security_posture')
      .select('*')
      .eq('organization_id', orgId);

    // SECURITY: Apply aws_account_id filter if provided for multi-account isolation
    if (accountId) {
      query = query.eq('aws_account_id', accountId);
    }

    const { data: posture, error: postureError } = await query
      .order('calculated_at', { ascending: false })
      .limit(1);

    if (postureError) {
      return new Response(
        JSON.stringify({ error: postureError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ data: posture?.[0] || null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
