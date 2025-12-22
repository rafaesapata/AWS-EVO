/**
 * Cleanup Expired External IDs Edge Function
 * 
 * Scheduled to run daily to clean up unused external IDs
 * that have passed their TTL expiration
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Validate system call (cron job)
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const isSystemCall = authHeader && authHeader.includes(serviceRoleKey);

    if (!isSystemCall) {
      console.error('❌ Unauthorized: Only system calls allowed');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: System call required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🧹 Starting External ID cleanup job...');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey
    );

    // Call the database function to cleanup expired external IDs
    const { data: deletedCount, error: cleanupError } = await supabase
      .rpc('cleanup_expired_external_ids');

    if (cleanupError) {
      console.error('❌ Error cleaning up external IDs:', cleanupError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: cleanupError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const duration = Date.now() - startTime;
    console.log(`✅ External ID cleanup complete. Deleted: ${deletedCount || 0} records. Duration: ${duration}ms`);

    // Record system metric
    try {
      await supabase.rpc('record_system_metric', {
        p_metric_name: 'external_id_cleanup',
        p_metric_value: deletedCount || 0,
        p_metadata: { duration_ms: duration }
      });
    } catch (metricError) {
      // Ignore metric recording errors
      console.warn('Could not record metric:', metricError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        deletedCount: deletedCount || 0,
        durationMs: duration,
        cleanedAt: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in cleanup job:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
