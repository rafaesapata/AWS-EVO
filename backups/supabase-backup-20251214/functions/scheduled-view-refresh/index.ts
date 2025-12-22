import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Validate this is a system call (cron job)
    const isSystemCall = authHeader && authHeader.includes(serviceRoleKey);

    if (!isSystemCall) {
      console.error('❌ Unauthorized: Only system calls allowed for scheduled-view-refresh');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: System call required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('⚙️ System call validated for scheduled-view-refresh');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey
    );

    console.log('Starting materialized view refresh...');
    const startTime = performance.now(); // Use performance.now() for precise timing

    // Call the incremental refresh function
    const { error: refreshError } = await supabase.rpc('refresh_materialized_views_incremental');

    if (refreshError) {
      console.error('Failed to refresh views:', refreshError);
      throw refreshError;
    }

    const duration = Math.round(performance.now() - startTime);
    console.log(`Materialized views refreshed successfully in ${duration}ms`);

    // Record metric
    await supabase.rpc('record_system_metric', {
      p_metric_name: 'materialized_view_refresh_duration',
      p_metric_value: duration,
      p_metric_unit: 'milliseconds',
      p_tags: { scheduled: true },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Materialized views refreshed successfully',
        duration_ms: duration,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error refreshing views:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
