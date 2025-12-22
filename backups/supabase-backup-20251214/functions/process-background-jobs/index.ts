import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BackgroundJob {
  id: string;
  job_type: string;
  job_name: string;
  payload: Record<string, any>;
  organization_id: string;
  retry_count: number;
  max_retries: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // CRITICAL: Authenticate user before processing any jobs
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authentication required');
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Authentication required');
    }

    // Get user's organization (enforces organization isolation)
    const { data: orgId, error: orgError } = await supabase.rpc('get_user_organization', { _user_id: user.id });
    if (orgError || !orgId) {
      throw new Error('Organization not found for user');
    }

    console.log('✅ User authenticated:', user.id, '| Organization:', orgId);

    const workerId = crypto.randomUUID();
    const { job_types, batch_size = 10 } = await req.json().catch(() => ({}));

    console.log(`[Worker ${workerId}] Starting job processing...`);

    const processedJobs = [];
    let processedCount = 0;

    // Process jobs in batch
    for (let i = 0; i < batch_size; i++) {
      // Claim next job
      const { data: jobId, error: claimError } = await supabase.rpc('claim_next_job', {
        p_job_types: job_types || null,
        p_worker_id: workerId,
      });

      if (claimError || !jobId) {
        console.log(`[Worker ${workerId}] No more jobs available`);
        break;
      }

      // Get job details - CRITICAL: Validate organization ownership
      const { data: job, error: jobError } = await supabase
        .from('background_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('organization_id', orgId) // ENFORCE organization isolation
        .single();

      if (jobError || !job) {
        console.error(`[Worker ${workerId}] Failed to fetch job ${jobId}:`, jobError);
        continue;
      }

      console.log(`[Worker ${workerId}] Processing job ${job.id} (${job.job_type})`);

      try {
        // Log start
        await supabase.rpc('log_job_progress', {
          p_job_id: job.id,
          p_level: 'info',
          p_message: `Starting job execution`,
          p_metadata: { worker_id: workerId },
        });

        // Execute job based on type
        let result;
        switch (job.job_type) {
          case 'cost_analysis':
            result = await executeCostAnalysis(job, supabase);
            break;
          case 'security_scan':
            result = await executeSecurityScan(job, supabase);
            break;
          case 'anomaly_detection':
            result = await executeAnomalyDetection(job, supabase);
            break;
          case 'data_export':
            result = await executeDataExport(job, supabase);
            break;
          case 'notification':
            result = await executeNotification(job, supabase);
            break;
          default:
            throw new Error(`Unknown job type: ${job.job_type}`);
        }

        // Mark as completed
        await supabase
          .from('background_jobs')
          .update({
            status: 'completed',
            result,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        await supabase.rpc('log_job_progress', {
          p_job_id: job.id,
          p_level: 'info',
          p_message: 'Job completed successfully',
          p_metadata: { result, execution_time_ms: Date.now() },
        });

        processedJobs.push({ job_id: job.id, status: 'completed' });
        processedCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : '';

        console.error(`[Worker ${workerId}] Job ${job.id} failed:`, error);

        // Log error
        await supabase.rpc('log_job_progress', {
          p_job_id: job.id,
          p_level: 'error',
          p_message: errorMessage,
          p_metadata: { stack: errorStack },
        });

        // Check if we should retry
        if (job.retry_count < job.max_retries) {
          await supabase
            .from('background_jobs')
            .update({
              status: 'retrying',
              retry_count: job.retry_count + 1,
              error_message: errorMessage,
              scheduled_for: new Date(Date.now() + Math.pow(2, job.retry_count) * 60000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id);

          processedJobs.push({ job_id: job.id, status: 'retrying' });
        } else {
          // Job exceeded max retries - move to Dead Letter Queue
          try {
            const { data: dlqId, error: dlqError } = await supabase.rpc('move_job_to_dlq', {
              p_job_id: job.id
            });
            
            if (dlqError) {
              console.error('Failed to move job to DLQ:', dlqError);
              // Fallback: just mark as failed
              await supabase
                .from('background_jobs')
                .update({
                  status: 'failed',
                  error_message: errorMessage,
                  error_stack: errorStack,
                  completed_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', job.id);
            } else {
              console.log(`Job ${job.id} moved to DLQ with ID: ${dlqId}`);
            }
            
            processedJobs.push({ job_id: job.id, status: 'moved_to_dlq', error: errorMessage, dlq_id: dlqId });
          } catch (dlqMoveError) {
            console.error('Error moving to DLQ:', dlqMoveError);
            // Final fallback
            await supabase
              .from('background_jobs')
              .update({
                status: 'failed',
                error_message: errorMessage,
                error_stack: errorStack,
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', job.id);
            
            processedJobs.push({ job_id: job.id, status: 'failed', error: errorMessage });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        worker_id: workerId,
        processed: processedCount,
        jobs: processedJobs,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error processing jobs:', error);
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

// Job executors
async function executeCostAnalysis(job: BackgroundJob, supabase: any) {
  const { organization_id, date_range } = job.payload;

  const { data: costs } = await supabase
    .from('daily_costs')
    .select('*')
    .eq('organization_id', organization_id)
    .gte('cost_date', date_range.start)
    .lte('cost_date', date_range.end);

  const totalCost = costs?.reduce((sum: number, c: any) => sum + Number(c.total_cost), 0) || 0;
  const avgCost = costs?.length ? totalCost / costs.length : 0;

  return { total_cost: totalCost, avg_cost: avgCost, days_analyzed: costs?.length || 0 };
}

async function executeSecurityScan(job: BackgroundJob, supabase: any) {
  const { organization_id, scan_type } = job.payload;

  // Invoke security scan function
  const { data, error } = await supabase.functions.invoke('security-scan', {
    body: { organization_id, scan_type },
  });

  if (error) throw error;
  return data;
}

async function executeAnomalyDetection(job: BackgroundJob, supabase: any) {
  const { organization_id } = job.payload;

  // Invoke anomaly detection function
  const { data, error } = await supabase.functions.invoke('detect-anomalies', {
    body: { organization_id },
  });

  if (error) throw error;
  return data;
}

async function executeDataExport(job: BackgroundJob, supabase: any) {
  const { organization_id, export_type, format } = job.payload;

  // Invoke export function
  const { data, error } = await supabase.functions.invoke('generate-excel-report', {
    body: { organization_id, export_type, format },
  });

  if (error) throw error;
  return data;
}

async function executeNotification(job: BackgroundJob, supabase: any) {
  const { recipient, subject, message, channel } = job.payload;

  // Invoke notification function
  const { data, error } = await supabase.functions.invoke('send-notification', {
    body: { recipient, subject, message, channel },
  });

  if (error) throw error;
  return data;
}
