import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting AWS Cost Anomaly Detection...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user and organization
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      console.error('User authentication error:', userError);
      throw new Error('User not authenticated');
    }

    console.log('Getting organization for user:', user.id);
    const { data: orgId, error: orgError } = await supabaseClient.rpc('get_user_organization', { 
      _user_id: user.id 
    });
    
    if (orgError) {
      console.error('RPC error getting organization:', orgError);
      throw new Error('Organization not found: ' + orgError.message);
    }
    
    if (!orgId) {
      console.error('No organization ID returned for user:', user.id);
      throw new Error('Organization not found');
    }
    
    console.log('Found organization:', orgId);

    // Get AWS credentials for this organization
    const { data: credentials, error: credError } = await supabase
      .from('aws_credentials')
      .select('id')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .maybeSingle();

    if (credError || !credentials) {
      throw new Error('AWS credentials not found');
    }

    // Get historical cost data (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: historicalCosts } = await supabase
      .from('daily_costs')
      .select('*')
      .eq('aws_account_id', credentials.id)
      .gte('cost_date', thirtyDaysAgo.toISOString())
      .order('cost_date', { ascending: false });

    // Get AWS resources for resource-level analysis
    const { data: awsResources } = await supabase
      .from('aws_resources')
      .select('resource_id, resource_type, tags, estimated_monthly_cost')
      .eq('aws_account_id', credentials.id);

    if (!historicalCosts || historicalCosts.length < 7) {
      return new Response(
        JSON.stringify({ 
          anomalies_count: 0, 
          message: 'Não há dados históricos suficientes para detectar anomalias' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const anomalies: any[] = [];

    // Calculate baseline costs by service
    const serviceBaselines = new Map<string, number>();
    
    historicalCosts.forEach(cost => {
      if (cost.service_breakdown) {
        Object.entries(cost.service_breakdown).forEach(([service, amount]) => {
          const currentBaseline = serviceBaselines.get(service) || 0;
          serviceBaselines.set(service, currentBaseline + (amount as number));
        });
      }
    });

    // Calculate average baseline
    serviceBaselines.forEach((total, service) => {
      serviceBaselines.set(service, total / historicalCosts.length);
    });

    // Map service names to resource IDs where possible
    const serviceToResourceMap = new Map<string, string>();
    if (awsResources) {
      awsResources.forEach(resource => {
        const servicePrefix = resource.resource_type.split('::')[0]; // e.g., "AWS::EC2"
        if (!serviceToResourceMap.has(servicePrefix)) {
          serviceToResourceMap.set(servicePrefix, resource.resource_id);
        }
      });
    }

    // Check today's costs against baseline
    const latestCost = historicalCosts[0];
    if (latestCost.service_breakdown) {
      Object.entries(latestCost.service_breakdown).forEach(([service, currentCost]) => {
        const baseline = serviceBaselines.get(service) || 0;
        const deviation = baseline > 0 ? ((currentCost as number - baseline) / baseline) * 100 : 0;

        // Flag anomalies with >25% deviation
        if (Math.abs(deviation) > 25) {
          const severity = Math.abs(deviation) > 75 ? 'critical' : 
                          Math.abs(deviation) > 50 ? 'high' : 'medium';

          // Try to find resource ID for this service
          const resourceId = serviceToResourceMap.get(service) || null;

          anomalies.push({
            aws_account_id: credentials.id,
            detected_at: new Date().toISOString(),
            service: service,
            resource_id: resourceId,
            anomaly_type: deviation > 0 ? 'spike' : 'drop',
            severity: severity,
            baseline_cost: baseline,
            current_cost: currentCost as number,
            deviation_percentage: Math.abs(deviation),
            time_period: {
              start: thirtyDaysAgo.toISOString(),
              end: new Date().toISOString()
            },
            details: {
              analysis: `Custo de ${service} apresentou ${deviation > 0 ? 'aumento' : 'redução'} significativo de ${Math.abs(deviation).toFixed(1)}% em relação à média dos últimos 30 dias.`,
              historical_average: baseline,
              current_value: currentCost as number,
              resource_id: resourceId
            },
            status: 'active'
          });
        }
      });
    }

    console.log(`Detected ${anomalies.length} anomalies`);

    const scanStartTime = Date.now();

    // Insert anomalies
    if (anomalies.length > 0) {
      const { error: insertError } = await supabase
        .from('cost_anomalies')
        .insert(anomalies);

      if (insertError) {
        console.error('Error inserting anomalies:', insertError);
        throw insertError;
      }
    }

    const scanDuration = Math.round((Date.now() - scanStartTime) / 1000);

    // Calculate metrics
    const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
    const highCount = anomalies.filter(a => a.severity === 'high').length;
    const mediumCount = anomalies.filter(a => a.severity === 'medium').length;
    const lowCount = anomalies.filter(a => a.severity === 'low').length;
    const spikeCount = anomalies.filter(a => a.anomaly_type === 'spike').length;
    const dropCount = anomalies.filter(a => a.anomaly_type === 'drop').length;
    const totalDeviationCost = anomalies.reduce((sum, a) => sum + Math.abs(a.current_cost - a.baseline_cost), 0);

    // Save scan history
    const { error: historyError } = await supabase
      .from('cost_anomalies_history')
      .insert({
        organization_id: orgId,
        scan_date: new Date().toISOString(),
        total_anomalies: anomalies.length,
        critical_count: criticalCount,
        high_count: highCount,
        medium_count: mediumCount,
        low_count: lowCount,
        spike_count: spikeCount,
        drop_count: dropCount,
        total_deviation_cost: totalDeviationCost,
        scan_duration_seconds: scanDuration,
        status: 'completed',
        message: `Detecção concluída com sucesso. ${anomalies.length} anomalias encontradas.`
      });

    if (historyError) {
      console.error('Error saving history:', historyError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        anomalies_count: anomalies.length,
        critical_count: criticalCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in anomaly detection:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
