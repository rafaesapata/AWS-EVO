import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: boolean;
    backgroundJobs: boolean;
    scheduledJobs: boolean;
  };
  metrics: {
    pendingJobs: number;
    failedJobs: number;
    activeTimers: number;
  };
  errors: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = performance.now();
    const errors: string[] = [];
    const checks = {
      database: false,
      backgroundJobs: false,
      scheduledJobs: false,
    };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check database connectivity
    try {
      const { error } = await supabase.from('organizations').select('count').limit(1);
      checks.database = !error;
      if (error) errors.push(`Database: ${error.message}`);
    } catch (error: any) {
      errors.push(`Database connection failed: ${error.message}`);
    }

    // Check background jobs health
    let pendingJobs = 0;
    let failedJobs = 0;
    try {
      const { data: jobs, error } = await supabase
        .from('background_jobs')
        .select('status')
        .in('status', ['pending', 'failed', 'retrying']);

      if (!error && jobs) {
        checks.backgroundJobs = true;
        pendingJobs = jobs.filter(j => j.status === 'pending' || j.status === 'retrying').length;
        failedJobs = jobs.filter(j => j.status === 'failed').length;

        // Alert if too many failed jobs
        if (failedJobs > 10) {
          errors.push(`High number of failed jobs: ${failedJobs}`);
        }
        // Alert if job queue is backing up
        if (pendingJobs > 100) {
          errors.push(`Job queue backing up: ${pendingJobs} pending`);
        }
      } else if (error) {
        errors.push(`Background jobs check failed: ${error.message}`);
      }
    } catch (error: any) {
      errors.push(`Background jobs health check error: ${error.message}`);
    }

    // Check scheduled jobs health
    try {
      const { data: scheduledJobs, error } = await supabase
        .from('scheduled_jobs')
        .select('is_active, last_error')
        .eq('is_active', true);

      if (!error && scheduledJobs) {
        checks.scheduledJobs = true;
        const jobsWithErrors = scheduledJobs.filter(j => j.last_error !== null);
        if (jobsWithErrors.length > 0) {
          errors.push(`${jobsWithErrors.length} scheduled jobs have errors`);
        }
      } else if (error) {
        errors.push(`Scheduled jobs check failed: ${error.message}`);
      }
    } catch (error: any) {
      errors.push(`Scheduled jobs health check error: ${error.message}`);
    }

    // Determine overall health status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    const healthyChecks = Object.values(checks).filter(Boolean).length;

    if (healthyChecks === 3 && errors.length === 0) {
      status = 'healthy';
    } else if (healthyChecks >= 2) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    const response: HealthStatus = {
      status,
      timestamp: new Date().toISOString(),
      uptime: performance.now() - startTime,
      checks,
      metrics: {
        pendingJobs,
        failedJobs,
        activeTimers: 0, // This would need to be tracked separately
      },
      errors,
    };

    const httpStatus = status === 'healthy' ? 200 : status === 'degraded' ? 207 : 503;

    return new Response(JSON.stringify(response, null, 2), {
      status: httpStatus,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Health check error:', error);
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
