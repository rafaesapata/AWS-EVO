import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlertCheck {
  type: string;
  threshold: number;
  unit: string;
  currentValue: number;
  exceeded: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const startTime = performance.now();
    const alerts: AlertCheck[] = [];

    // Get all organizations
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name');

    if (orgsError) throw orgsError;

    for (const org of orgs || []) {
      // Get alert configurations for this org
      const { data: configs } = await supabase
        .from('system_alerts_config')
        .select('*')
        .eq('organization_id', org.id)
        .eq('is_enabled', true);

      if (!configs || configs.length === 0) continue;

      // Check job failure rate
      const failureConfig = configs.find(c => c.alert_type === 'job_failure_rate');
      if (failureConfig) {
        const { data: jobStats } = await supabase
          .from('background_jobs')
          .select('status')
          .eq('organization_id', org.id)
          .gte('created_at', new Date(Date.now() - 3600000).toISOString()); // Last hour

        if (jobStats && jobStats.length > 0) {
          const failedCount = jobStats.filter(j => j.status === 'failed').length;
          const failureRate = (failedCount / jobStats.length) * 100;
          
          if (failureRate > failureConfig.threshold_value) {
            alerts.push({
              type: 'job_failure_rate',
              threshold: failureConfig.threshold_value,
              unit: failureConfig.threshold_unit,
              currentValue: failureRate,
              exceeded: true
            });

            await createAlert(supabase, org.id, {
              type: 'job_failure_rate',
              title: 'High Job Failure Rate',
              message: `Job failure rate is ${failureRate.toFixed(1)}% (threshold: ${failureConfig.threshold_value}%)`,
              severity: 'critical',
              metadata: { failureRate, threshold: failureConfig.threshold_value }
            });
          }
        }
      }

      // Check DLQ growth
      const dlqConfig = configs.find(c => c.alert_type === 'dlq_growth');
      if (dlqConfig) {
        const { count: dlqCount } = await supabase
          .from('background_jobs_dlq')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', org.id)
          .gte('moved_to_dlq_at', new Date(Date.now() - 3600000).toISOString());

        if (dlqCount && dlqCount > dlqConfig.threshold_value) {
          alerts.push({
            type: 'dlq_growth',
            threshold: dlqConfig.threshold_value,
            unit: dlqConfig.threshold_unit,
            currentValue: dlqCount,
            exceeded: true
          });

          await createAlert(supabase, org.id, {
            type: 'dlq_growth',
            title: 'Dead Letter Queue Growing',
            message: `${dlqCount} jobs moved to DLQ in the last hour (threshold: ${dlqConfig.threshold_value})`,
            severity: 'high',
            metadata: { dlqCount, threshold: dlqConfig.threshold_value }
          });
        }
      }

      // Check health status
      const healthConfig = configs.find(c => c.alert_type === 'health_degraded');
      if (healthConfig) {
        try {
          const healthResponse = await fetch(`${supabaseUrl}/functions/v1/health-check`, {
            headers: { 'apikey': supabaseKey }
          });
          const health = await healthResponse.json();

          if (health.status === 'degraded' || health.status === 'unhealthy') {
            alerts.push({
              type: 'health_degraded',
              threshold: healthConfig.threshold_value,
              unit: healthConfig.threshold_unit,
              currentValue: 1,
              exceeded: true
            });

            await createAlert(supabase, org.id, {
              type: 'health_degraded',
              title: `System Health ${health.status === 'degraded' ? 'Degraded' : 'Unhealthy'}`,
              message: `System health check returned ${health.status} status`,
              severity: health.status === 'unhealthy' ? 'critical' : 'high',
              metadata: { healthStatus: health.status, checks: health.checks }
            });
          }
        } catch (error) {
          console.error('Health check failed:', error);
        }
      }

      // Check error rate from logs
      const errorConfig = configs.find(c => c.alert_type === 'high_error_rate');
      if (errorConfig) {
        const { data: errorLogs } = await supabase
          .from('job_logs')
          .select('id')
          .eq('log_level', 'error')
          .gte('created_at', new Date(Date.now() - 60000).toISOString()); // Last minute

        if (errorLogs && errorLogs.length > errorConfig.threshold_value) {
          alerts.push({
            type: 'high_error_rate',
            threshold: errorConfig.threshold_value,
            unit: errorConfig.threshold_unit,
            currentValue: errorLogs.length,
            exceeded: true
          });

          await createAlert(supabase, org.id, {
            type: 'high_error_rate',
            title: 'High Error Rate Detected',
            message: `${errorLogs.length} errors in the last minute (threshold: ${errorConfig.threshold_value})`,
            severity: 'high',
            metadata: { errorCount: errorLogs.length, threshold: errorConfig.threshold_value }
          });
        }
      }
    }

    const executionTime = performance.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        alerts,
        executionTime: `${executionTime.toFixed(2)}ms`,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Auto-alerts error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function createAlert(
  supabase: any,
  organizationId: string,
  alert: {
    type: string;
    title: string;
    message: string;
    severity: string;
    metadata: any;
  }
) {
  // Check if similar alert was created recently (last 15 minutes)
  const { data: recentAlerts } = await supabase
    .from('dashboard_alerts')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('alert_type', alert.type)
    .gte('created_at', new Date(Date.now() - 900000).toISOString())
    .limit(1);

  // Don't create duplicate alerts
  if (recentAlerts && recentAlerts.length > 0) {
    console.log(`Skipping duplicate alert: ${alert.type} for org ${organizationId}`);
    return;
  }

  await supabase
    .from('dashboard_alerts')
    .insert({
      organization_id: organizationId,
      alert_type: alert.type,
      title: alert.title,
      message: alert.message,
      severity: alert.severity,
      metadata: alert.metadata,
      is_read: false
    });

  console.log(`Created alert: ${alert.title} for org ${organizationId}`);
}
