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
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Validate this is a system call (cron job)
    const isSystemCall = authHeader && authHeader.includes(serviceRoleKey);

    if (!isSystemCall) {
      console.error('❌ Unauthorized: Only system calls allowed for execute-scheduled-job');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: System call required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('⚙️ System call validated for execute-scheduled-job');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    
    // Store serviceRoleKey for later use in function invocation
    const serviceKey = serviceRoleKey;

    const { jobId } = await req.json();

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: 'Job ID is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`📋 Executing scheduled job: ${jobId}`);

    // Fetch job details
    const { data: job, error: jobError } = await supabase
      .from('scheduled_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      console.error('Job not found:', jobError);
      return new Response(
        JSON.stringify({ error: 'Job not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`🚀 Invoking function: ${job.function_name}`);

    const startTime = performance.now(); // Use performance.now() for precise timing
    let success = false;
    let errorMessage = null;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s timeout (Edge Function max is 60s)

    try {
      // Invoke the edge function with timeout
      const response = await fetch(
        `${supabaseUrl}/functions/v1/${job.function_name}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify(job.payload || {}),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      success = true;
      console.log(`✅ Function ${job.function_name} executed successfully`);
      console.log('Response:', JSON.stringify(data));

    } catch (error: any) {
      clearTimeout(timeoutId);
      success = false;
      
      if (error.name === 'AbortError') {
        errorMessage = 'Function execution timeout (55s)';
        console.error(`⏱️ Function ${job.function_name} timeout`);
      } else {
        errorMessage = error.message || 'Unknown error';
        console.error(`❌ Function ${job.function_name} failed:`, errorMessage);
      }
    }

    const duration = Math.round(performance.now() - startTime);

    // Update job statistics
    const updates: any = {
      last_run_at: new Date().toISOString(),
      run_count: job.run_count + 1,
    };

    if (success) {
      updates.last_error = null;
    } else {
      updates.failure_count = job.failure_count + 1;
      updates.last_error = errorMessage;
    }

    const { error: updateError } = await supabase
      .from('scheduled_jobs')
      .update(updates)
      .eq('id', jobId);

    if (updateError) {
      console.error('Failed to update job statistics:', updateError);
    }

    console.log(`📊 Job stats updated: run_count=${updates.run_count}, failure_count=${updates.failure_count}, duration=${duration}ms`);

    return new Response(
      JSON.stringify({
        success,
        jobName: job.name,
        functionName: job.function_name,
        duration,
        error: errorMessage,
        stats: {
          runCount: updates.run_count,
          failureCount: updates.failure_count,
        }
      }),
      {
        status: success ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error executing scheduled job:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute job'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
