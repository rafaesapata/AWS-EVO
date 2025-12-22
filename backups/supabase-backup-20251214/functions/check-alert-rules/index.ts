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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    console.log('Checking alert rules...');

    // Get all active alert rules
    const { data: rules, error: rulesError } = await supabaseClient
      .from('alert_rules')
      .select('*')
      .eq('is_active', true);

    if (rulesError) throw rulesError;

    const triggeredAlerts = [];

    for (const rule of rules || []) {
      console.log(`Checking rule: ${rule.name}`);

      let metricValue: number | null = null;

      // Fetch metric based on rule type
      if (rule.metric === 'total_cost') {
        const { data: metrics } = await supabaseClient
          .from('scan_history_metrics')
          .select('total_cost_savings')
          .order('metric_date', { ascending: false })
          .limit(1)
          .single();
        
        metricValue = metrics?.total_cost_savings || 0;
      } else if (rule.metric === 'critical_findings') {
        const { data: metrics } = await supabaseClient
          .from('scan_history_metrics')
          .select('critical_findings')
          .order('metric_date', { ascending: false })
          .limit(1)
          .single();
        
        metricValue = metrics?.critical_findings || 0;
      } else if (rule.metric === 'pending_tickets') {
        const { count } = await supabaseClient
          .from('remediation_tickets')
          .select('*', { count: 'exact', head: true })
          .in('status', ['pending', 'in_progress']);
        
        metricValue = count || 0;
      }

      if (metricValue === null) continue;

      // Check threshold rules
      if (rule.rule_type === 'threshold' && rule.condition) {
        const { operator, value } = rule.condition as any;
        let triggered = false;

        switch (operator) {
          case 'gt':
            triggered = metricValue > value;
            break;
          case 'lt':
            triggered = metricValue < value;
            break;
          case 'eq':
            triggered = metricValue === value;
            break;
          case 'gte':
            triggered = metricValue >= value;
            break;
          case 'lte':
            triggered = metricValue <= value;
            break;
        }

        if (triggered) {
          // Create alert with organization_id from alert_rule
          const { data: alert } = await supabaseClient
            .from('alerts')
            .insert({
              organization_id: rule.organization_id,
              alert_rule_id: rule.id,
              title: rule.name,
              message: `${rule.description || rule.name}: ${metricValue} ${operator} ${value}`,
              severity: rule.severity,
              metric_value: metricValue,
              threshold_value: value
            })
            .select()
            .single();

          if (alert) {
            triggeredAlerts.push(alert);

            // Send notification if configured
            if (rule.notification_channels && Array.isArray(rule.notification_channels)) {
              await supabaseClient.functions.invoke('send-notification', {
                body: {
                  type: 'alert',
                  title: alert.title,
                  message: alert.message,
                  severity: alert.severity,
                  channels: rule.notification_channels
                }
              });
            }
          }
        }
      }

      // Anomaly detection (simplified)
      if (rule.rule_type === 'anomaly') {
        const { data: historicalMetrics } = await supabaseClient
          .from('scan_history_metrics')
          .select(rule.metric)
          .order('metric_date', { ascending: false })
          .limit(30);

        if (historicalMetrics && historicalMetrics.length > 5) {
          const values = historicalMetrics.map((m: any) => m[rule.metric] || 0);
          const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
          const stdDev = Math.sqrt(
            values.reduce((sum: number, val: number) => sum + Math.pow(val - avg, 2), 0) / values.length
          );

          // Trigger if current value is more than 2 std deviations from mean
          if (Math.abs(metricValue - avg) > 2 * stdDev) {
            const { data: alert } = await supabaseClient
              .from('alerts')
              .insert({
                organization_id: rule.organization_id,
                alert_rule_id: rule.id,
                title: `Anomalia Detectada: ${rule.name}`,
                message: `Valor anômalo detectado: ${metricValue} (média: ${avg.toFixed(2)}, desvio: ${stdDev.toFixed(2)})`,
                severity: rule.severity,
                metric_value: metricValue,
                threshold_value: avg + 2 * stdDev
              })
              .select()
              .single();

            if (alert) triggeredAlerts.push(alert);
          }
        }
      }
    }

    console.log(`Checked ${rules?.length || 0} rules, triggered ${triggeredAlerts.length} alerts`);

    return new Response(
      JSON.stringify({ 
        success: true,
        rules_checked: rules?.length || 0,
        alerts_triggered: triggeredAlerts.length,
        alerts: triggeredAlerts
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in check-alert-rules:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
