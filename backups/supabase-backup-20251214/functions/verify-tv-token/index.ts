import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();

    if (!token) {
      throw new Error('Token is required');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Verify token and get dashboard
    const { data: dashboard, error } = await supabaseClient
      .from('tv_dashboards')
      .select('*')
      .eq('access_token', token)
      .eq('is_active', true)
      .single();

    if (error || !dashboard) {
      throw new Error('Invalid or expired token');
    }

    // Update last accessed time
    await supabaseClient
      .from('tv_dashboards')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', dashboard.id);

    // Log access
    await supabaseClient
      .from('audit_log')
      .insert({
        user_id: dashboard.user_id,
        action: 'TV_DASHBOARD_ACCESS',
        resource_type: 'tv_dashboard',
        resource_id: dashboard.id,
        details: {
          dashboard_name: dashboard.name,
          access_method: 'token'
        }
      });

    console.log('TV Dashboard token verified:', dashboard.id);

    return new Response(
      JSON.stringify({ 
        success: true,
        dashboard: {
          id: dashboard.id,
          name: dashboard.name,
          layout: dashboard.layout,
          refreshInterval: dashboard.refresh_interval,
          organizationId: dashboard.organization_id
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in verify-tv-token:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});