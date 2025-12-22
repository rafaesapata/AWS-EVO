import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SystemEvent {
  id: string;
  event_type: string;
  event_source: string;
  organization_id: string;
  event_data: Record<string, any>;
  metadata: Record<string, any>;
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

    // CRITICAL: Authenticate user before processing any events
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

    const { event_type, limit = 100 } = await req.json();

    // Fetch pending events - CRITICAL: Filter by organization
    let query = supabase
      .from('system_events')
      .select('*')
      .eq('processing_status', 'pending')
      .eq('organization_id', orgId) // ENFORCE organization isolation
      .order('created_at', { ascending: true })
      .limit(limit);

    if (event_type) {
      query = query.eq('event_type', event_type);
    }

    const { data: events, error: fetchError } = await query;

    if (fetchError) throw fetchError;

    const results = [];

    // Process each event
    for (const event of events as SystemEvent[]) {
      try {
        // Mark as processing
        await supabase
          .from('system_events')
          .update({ processing_status: 'processing' })
          .eq('id', event.id);

        // Route to appropriate handler based on event type
        let result;
        switch (event.event_type) {
          case 'cost_data_updated':
            result = await handleCostDataUpdated(event, supabase);
            break;
          case 'security_finding_created':
            result = await handleSecurityFinding(event, supabase);
            break;
          case 'license_status_changed':
            result = await handleLicenseChange(event, supabase);
            break;
          default:
            result = { processed: true, message: 'No handler for event type' };
        }

        // Mark as completed
        await supabase
          .from('system_events')
          .update({
            processing_status: 'completed',
            processed_at: new Date().toISOString(),
          })
          .eq('id', event.id);

        results.push({ event_id: event.id, success: true, result });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // Mark as failed
        await supabase
          .from('system_events')
          .update({
            processing_status: 'failed',
            error_message: errorMessage,
          })
          .eq('id', event.id);

        results.push({ event_id: event.id, success: false, error: errorMessage });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

// Event handlers
async function handleCostDataUpdated(event: SystemEvent, supabase: any) {
  const { total_cost, cost_date, organization_id } = event.event_data;

  // Check if cost exceeds threshold
  const { data: alerts } = await supabase
    .from('alert_rules')
    .select('*')
    .eq('organization_id', organization_id)
    .eq('is_active', true)
    .eq('rule_type', 'cost_threshold');

  for (const alert of alerts || []) {
    const threshold = alert.condition?.threshold || 0;
    if (total_cost > threshold) {
      // Create dashboard alert
      await supabase.from('dashboard_alerts').insert({
        organization_id,
        alert_type: 'cost_exceeded',
        severity: 'high',
        title: 'Cost Threshold Exceeded',
        message: `Daily cost of $${total_cost} exceeded threshold of $${threshold} on ${cost_date}`,
        metric_value: total_cost,
        threshold_value: threshold,
      });
    }
  }

  return { processed: true, alerts_checked: alerts?.length || 0 };
}

async function handleSecurityFinding(event: SystemEvent, supabase: any) {
  const { severity, organization_id } = event.event_data;

  // Auto-create ticket for critical/high severity findings
  if (severity === 'critical' || severity === 'high') {
    await supabase.from('remediation_tickets').insert({
      organization_id,
      title: `Security Finding: ${event.event_data.description}`,
      description: JSON.stringify(event.event_data),
      priority: severity === 'critical' ? 'urgent' : 'high',
      status: 'open',
    });
  }

  return { processed: true, ticket_created: severity === 'critical' || severity === 'high' };
}

async function handleLicenseChange(event: SystemEvent, supabase: any) {
  const { customer_id, valid, organization_id } = event.event_data;

  // Send notification about license status change
  if (!valid) {
    await supabase.from('dashboard_alerts').insert({
      organization_id,
      alert_type: 'license_expired',
      severity: 'critical',
      title: 'License Expired',
      message: `License for customer ${customer_id} has expired. Please renew to continue using the system.`,
      action_url: '/license',
    });
  }

  return { processed: true, notification_sent: !valid };
}
