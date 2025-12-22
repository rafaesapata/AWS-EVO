import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    // Create client with ANON KEY for user authentication (RLS applies)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    // Get the token and verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      console.error('User verification failed:', userError);
      throw new Error('Unauthorized');
    }

    console.log('User authenticated successfully:', user.id);

    // Create service role client for database operations (bypass RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get organization
    const { data: orgData, error: orgError } = await supabase.rpc('get_user_organization', { _user_id: user.id });
    if (orgError || !orgData) {
      console.error('Failed to get organization:', orgError);
      throw new Error('Organization not found');
    }

    const organization_id = orgData;

    console.log(`Starting anomaly detection for organization: ${organization_id}`);

    // Clear previous active anomalies for fresh scan
    await supabase
      .from('anomaly_detections')
      .delete()
      .eq('organization_id', organization_id);

    const detectedAnomalies = [];
    let costCount = 0, usageCount = 0, perfCount = 0, multiCount = 0;

    // Get configuration
    const { data: configs } = await supabase
      .from('anomaly_detection_config')
      .select('*')
      .eq('organization_id', organization_id)
      .eq('enabled', true);

    // If no config, use defaults
    const activeConfigs = configs?.length
      ? configs
      : [
          { detection_type: 'cost', sensitivity: 0.7, lookback_days: 30 },
          { detection_type: 'usage', sensitivity: 0.7, lookback_days: 30 },
          { detection_type: 'performance', sensitivity: 0.7, lookback_days: 7 },
          { detection_type: 'multi_dimensional', sensitivity: 0.7, lookback_days: 30 }
        ];

    for (const config of activeConfigs) {
      try {
        console.log(`Running ${config.detection_type} detection...`);

        switch (config.detection_type) {
          case 'cost':
            const costAnomalies = await detectCostAnomalies(organization_id, config, supabase);
            detectedAnomalies.push(...costAnomalies);
            costCount = costAnomalies.length;
            break;

          case 'usage':
            const usageAnomalies = await detectUsageAnomalies(organization_id, config, supabase);
            detectedAnomalies.push(...usageAnomalies);
            usageCount = usageAnomalies.length;
            break;

          case 'performance':
            const perfAnomalies = await detectPerformanceAnomalies(organization_id, config, supabase);
            detectedAnomalies.push(...perfAnomalies);
            perfCount = perfAnomalies.length;
            break;

          case 'multi_dimensional':
            const multiAnomalies = await detectMultiDimensionalAnomalies(organization_id, config, supabase);
            detectedAnomalies.push(...multiAnomalies);
            multiCount = multiAnomalies.length;
            break;
        }
      } catch (error) {
        console.error(`Error in ${config.detection_type} detection:`, error);
      }
    }

    // Save detected anomalies
    if (detectedAnomalies.length > 0) {
      const { error: insertError } = await supabase
        .from('anomaly_detections')
        .insert(detectedAnomalies);

      if (insertError) {
        console.error('Error saving anomalies:', insertError);
      }
    }

    // Calculate metrics
    const criticalCount = detectedAnomalies.filter(a => a.severity === 'critical').length;
    const highCount = detectedAnomalies.filter(a => a.severity === 'high').length;
    const mediumCount = detectedAnomalies.filter(a => a.severity === 'medium').length;
    const lowCount = detectedAnomalies.filter(a => a.severity === 'low').length;

    const totalCostImpact = detectedAnomalies
      .filter(a => a.detection_type === 'cost')
      .reduce((sum, a) => {
        const current = a.current_metrics?.cost || 0;
        const baseline = a.baseline_metrics?.mean || 0;
        return sum + Math.max(0, Number(current) - Number(baseline));
      }, 0);

    const executionTimeSeconds = Math.round((Date.now() - startTime) / 1000);

    // Save to history
    await supabase.from('anomaly_detections_history').insert({
      organization_id,
      scan_date: new Date().toISOString(),
      total_anomalies: detectedAnomalies.length,
      critical_count: criticalCount,
      high_count: highCount,
      medium_count: mediumCount,
      low_count: lowCount,
      cost_anomalies_count: costCount,
      usage_anomalies_count: usageCount,
      performance_anomalies_count: perfCount,
      multi_dimensional_count: multiCount,
      total_cost_impact: totalCostImpact,
      execution_time_seconds: executionTimeSeconds,
      detection_summary: {
        by_type: {
          cost: costCount,
          usage: usageCount,
          performance: perfCount,
          multi_dimensional: multiCount
        },
        by_severity: {
          critical: criticalCount,
          high: highCount,
          medium: mediumCount,
          low: lowCount
        }
      },
      status: 'completed'
    });

    return new Response(
      JSON.stringify({
        success: true,
        anomalies_count: detectedAnomalies.length,
        critical_count: criticalCount,
        high_count: highCount,
        medium_count: mediumCount,
        low_count: lowCount,
        cost_impact: totalCostImpact,
        execution_time: executionTimeSeconds,
        breakdown: {
          cost: costCount,
          usage: usageCount,
          performance: perfCount,
          multi_dimensional: multiCount
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in anomaly detection:', error);
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

// Helper function to construct AWS ARN
function buildResourceArn(resourceType: string, resourceId: string, region: string, accountId: string): string {
  const cleanResourceType = resourceType.toLowerCase();
  
  if (cleanResourceType.includes('ec2') || cleanResourceType === 'instance') {
    return `arn:aws:ec2:${region}:${accountId}:instance/${resourceId}`;
  } else if (cleanResourceType.includes('rds') || cleanResourceType === 'db.instance') {
    return `arn:aws:rds:${region}:${accountId}:db:${resourceId}`;
  } else if (cleanResourceType.includes('lambda')) {
    return `arn:aws:lambda:${region}:${accountId}:function:${resourceId}`;
  } else if (cleanResourceType.includes('s3')) {
    return `arn:aws:s3:::${resourceId}`;
  } else if (cleanResourceType.includes('elb') || cleanResourceType.includes('loadbalancer')) {
    return `arn:aws:elasticloadbalancing:${region}:${accountId}:loadbalancer/${resourceId}`;
  } else if (cleanResourceType.includes('ecs')) {
    return `arn:aws:ecs:${region}:${accountId}:cluster/${resourceId}`;
  }
  
  return `arn:aws:${cleanResourceType}:${region}:${accountId}:${resourceId}`;
}

// ================= COST ANOMALIES =================
async function detectCostAnomalies(orgId: string, config: any, supabase: any): Promise<any[]> {
  const anomalies: any[] = [];

  // Get AWS credentials for account info
  const { data: credentials } = await supabase
    .from('aws_credentials')
    .select('account_id, regions')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .single();

  const accountId = credentials?.account_id || 'unknown';
  const region = credentials?.regions?.[0] || 'us-east-1';

  // Get daily costs
  const { data: costs } = await supabase
    .from('daily_costs')
    .select('*')
    .eq('organization_id', orgId)
    .gte('cost_date', new Date(Date.now() - (config.lookback_days || 30) * 24 * 60 * 60 * 1000).toISOString())
    .order('cost_date', { ascending: false });

  if (!costs || costs.length < 7) return anomalies;

  // Calculate statistical baseline
  const recentCosts = costs.slice(0, 7);
  const historicalCosts = costs.slice(7);
  
  if (historicalCosts.length < 7) return anomalies;

  const historicalMean = historicalCosts.reduce((sum: number, c: any) => sum + Number(c.total_cost), 0) / historicalCosts.length;
  const historicalStdDev = Math.sqrt(
    historicalCosts.reduce((sum: number, c: any) => sum + Math.pow(Number(c.total_cost) - historicalMean, 2), 0) / historicalCosts.length
  );

  // Detect anomalies in recent costs
  for (const cost of recentCosts) {
    const costValue = Number(cost.total_cost);
    const zScore = historicalStdDev > 0 ? Math.abs(costValue - historicalMean) / historicalStdDev : 0;
    const threshold = (config.threshold_multiplier || 2.0) * (config.sensitivity || 0.7);

    if (zScore > threshold) {
      const deviationPct = ((costValue - historicalMean) / historicalMean) * 100;
      const anomalyScore = Math.min(zScore / 5, 1);
      const severity =
        anomalyScore > 0.8 ? 'critical' : 
        anomalyScore > 0.6 ? 'high' : 
        anomalyScore > 0.4 ? 'medium' : 'low';

      anomalies.push({
        organization_id: orgId,
        detection_type: 'cost',
        resource_type: 'daily_cost',
        resource_id: cost.id,
        anomaly_score: anomalyScore,
        severity,
        dimensions: {
          metric: 'total_cost',
          value: costValue,
          z_score: zScore,
          date: cost.cost_date
        },
        baseline_metrics: { 
          mean: historicalMean, 
          std_dev: historicalStdDev,
          sample_size: historicalCosts.length
        },
        current_metrics: { 
          cost: costValue, 
          date: cost.cost_date,
          service_breakdown: cost.service_breakdown
        },
        deviation_percentage: deviationPct,
        confidence_level: Math.min(zScore / threshold, 1),
        detection_method: 'statistical_zscore',
        features_analyzed: ['total_cost', 'daily_trend', 'service_distribution'],
        recommendations: [
          `Custo ${deviationPct > 0 ? 'aumentou' : 'diminuiu'} ${Math.abs(deviationPct).toFixed(1)}% em relação à média histórica`,
          'Investigue mudanças em uso de recursos',
          'Verifique eventos de scaling automático',
          'Analise breakdown por serviço para identificar contribuintes principais'
        ],
        metadata: {
          historical_period_days: historicalCosts.length,
          detection_timestamp: new Date().toISOString(),
          arn: `arn:aws:ce:${region}:${accountId}:cost/${cost.cost_date}`,
          account_id: accountId,
          region: region
        }
      });
    }
  }

  return anomalies;
}

// ================= USAGE ANOMALIES =================
async function detectUsageAnomalies(orgId: string, config: any, supabase: any): Promise<any[]> {
  const anomalies: any[] = [];

  // Get AWS credentials for ARN construction
  const { data: credentials } = await supabase
    .from('aws_credentials')
    .select('account_id, regions')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .single();

  const accountId = credentials?.account_id || 'unknown';
  const primaryRegion = credentials?.regions?.[0] || 'us-east-1';

  // Analyze CloudWatch metrics for usage patterns
  const { data: metrics } = await supabase
    .from('cloudwatch_metrics')
    .select('*')
    .eq('organization_id', orgId)
    .gte('timestamp', new Date(Date.now() - (config.lookback_days || 30) * 24 * 60 * 60 * 1000).toISOString())
    .in('metric_name', ['CPUUtilization', 'NetworkIn', 'NetworkOut', 'DatabaseConnections', 'FreeStorageSpace']);

  if (!metrics || metrics.length < 10) return anomalies;

  // Group by resource and metric
  const metricsByResource = metrics.reduce((acc: any, m: any) => {
    const key = `${m.resource_type}:${m.resource_id}:${m.metric_name}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  for (const [key, resourceMetrics] of Object.entries(metricsByResource) as any) {
    const [resourceType, resourceId, metricName] = key.split(':');
    const values = resourceMetrics.map((m: any) => Number(m.metric_value)).filter((v: number) => !isNaN(v));
    
    if (values.length < 7) continue;

    const recent = values.slice(0, Math.ceil(values.length * 0.2));
    const historical = values.slice(Math.ceil(values.length * 0.2));

    const recentMean = recent.reduce((a: number, b: number) => a + b, 0) / recent.length;
    const historicalMean = historical.reduce((a: number, b: number) => a + b, 0) / historical.length;
    const historicalStdDev = Math.sqrt(
      historical.reduce((sum: number, v: number) => sum + Math.pow(v - historicalMean, 2), 0) / historical.length
    );

    if (historicalStdDev === 0) continue;

    const zScore = Math.abs(recentMean - historicalMean) / historicalStdDev;
    const threshold = (config.threshold_multiplier || 2.0) * (config.sensitivity || 0.7);

    if (zScore > threshold) {
      const deviationPct = ((recentMean - historicalMean) / historicalMean) * 100;
      const anomalyScore = Math.min(zScore / 5, 1);
      const region = resourceMetrics[0]?.region || primaryRegion;

      anomalies.push({
        organization_id: orgId,
        detection_type: 'usage',
        resource_type: resourceType,
        resource_id: resourceId,
        anomaly_score: anomalyScore,
        severity: anomalyScore > 0.7 ? 'high' : anomalyScore > 0.5 ? 'medium' : 'low',
        dimensions: {
          metric: metricName,
          current_avg: recentMean,
          baseline_avg: historicalMean,
          z_score: zScore
        },
        baseline_metrics: { mean: historicalMean, std_dev: historicalStdDev },
        current_metrics: { avg: recentMean, max: Math.max(...recent), min: Math.min(...recent) },
        deviation_percentage: deviationPct,
        confidence_level: Math.min(zScore / threshold, 1),
        detection_method: 'statistical_zscore',
        features_analyzed: [metricName, 'usage_pattern', 'temporal_trend'],
        recommendations: [
          `Métrica ${metricName} ${deviationPct > 0 ? 'aumentou' : 'diminuiu'} ${Math.abs(deviationPct).toFixed(1)}%`,
          'Verifique configuração de recursos',
          'Analise logs de aplicação para mudanças de comportamento',
          'Considere ajuste de capacidade'
        ],
        metadata: {
          arn: buildResourceArn(resourceType, resourceId, region, accountId),
          account_id: accountId,
          region: region
        }
      });
    }
  }

  return anomalies;
}

// ================= PERFORMANCE ANOMALIES =================
async function detectPerformanceAnomalies(orgId: string, config: any, supabase: any): Promise<any[]> {
  const anomalies: any[] = [];

  // Get AWS credentials for account info
  const { data: credentials } = await supabase
    .from('aws_credentials')
    .select('account_id, regions')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .single();

  const accountId = credentials?.account_id || 'unknown';
  const region = credentials?.regions?.[0] || 'us-east-1';

  // Analyze endpoint monitor performance
  const { data: monitors } = await supabase
    .from('endpoint_monitors')
    .select('id, name, organization_id, url')
    .eq('organization_id', orgId)
    .eq('is_active', true);

  for (const monitor of monitors || []) {
    const { data: stats } = await supabase
      .from('endpoint_monitor_stats')
      .select('*')
      .eq('monitor_id', monitor.id)
      .gte('stat_date', new Date(Date.now() - (config.lookback_days || 7) * 24 * 60 * 60 * 1000).toISOString())
      .order('stat_date', { ascending: false });

    if (!stats || stats.length < 3) continue;

    // Calculate baseline
    const avgResponseTime =
      stats.reduce((sum: number, s: any) => sum + Number(s.avg_response_time_ms || 0), 0) / stats.length;
    const stdDev = Math.sqrt(
      stats.reduce((sum: number, s: any) => sum + Math.pow(Number(s.avg_response_time_ms || 0) - avgResponseTime, 2), 0) /
        stats.length
    );

    const latest = stats[0];
    const latestResponseTime = Number(latest.avg_response_time_ms || 0);

    if (stdDev > 0) {
      const zScore = Math.abs(latestResponseTime - avgResponseTime) / stdDev;
      const threshold = (config.threshold_multiplier || 2.0) * (config.sensitivity || 0.7);

      if (zScore > threshold) {
        const deviationPct = ((latestResponseTime - avgResponseTime) / avgResponseTime) * 100;
        
        anomalies.push({
          organization_id: orgId,
          detection_type: 'performance',
          resource_type: 'endpoint_monitor',
          resource_id: monitor.id,
          anomaly_score: Math.min(zScore / 5, 1),
          severity: zScore > 4 ? 'high' : zScore > 3 ? 'medium' : 'low',
          dimensions: {
            metric: 'response_time',
            current: latestResponseTime,
            baseline: avgResponseTime,
            z_score: zScore
          },
          baseline_metrics: { avg: avgResponseTime, std_dev: stdDev },
          current_metrics: { ...latest, monitor_name: monitor.name },
          deviation_percentage: deviationPct,
          confidence_level: Math.min(zScore / threshold, 1),
          detection_method: 'statistical_zscore',
          features_analyzed: ['avg_response_time_ms', 'uptime_percentage', 'failed_checks'],
          recommendations: [
            `Tempo de resposta ${deviationPct > 0 ? 'aumentou' : 'diminuiu'} ${Math.abs(deviationPct).toFixed(1)}%`,
            'Verifique saúde do endpoint',
            'Analise logs de aplicação',
            'Considere otimização ou scaling'
          ],
          metadata: {
            arn: `arn:aws:monitoring:${region}:${accountId}:endpoint/${monitor.id}`,
            account_id: accountId,
            region: region,
            endpoint_url: monitor.url,
            monitor_name: monitor.name
          }
        });
      }
    }
  }

  return anomalies;
}

// ================= MULTI-DIMENSIONAL ANOMALIES (AI) =================
async function detectMultiDimensionalAnomalies(orgId: string, config: any, supabase: any): Promise<any[]> {
  const anomalies: any[] = [];

  if (!LOVABLE_API_KEY) {
    console.log('Skipping AI analysis - no API key');
    return anomalies;
  }

  // Get AWS credentials for ARN construction
  const { data: credentials } = await supabase
    .from('aws_credentials')
    .select('account_id, regions')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .single();

  const accountId = credentials?.account_id || 'unknown';
  const region = credentials?.regions?.[0] || 'us-east-1';

  // Get comprehensive data
  const { data: costs } = await supabase
    .from('daily_costs')
    .select('*')
    .eq('organization_id', orgId)
    .gte('cost_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('cost_date', { ascending: false });

  if (!costs || costs.length < 7) return anomalies;

  const recent = costs.slice(0, 7);
  const historical = costs.slice(7);
  
  const recentAvg = recent.reduce((s: number, c: any) => s + Number(c.total_cost), 0) / recent.length;
  const historicalAvg = historical.length > 0 
    ? historical.reduce((s: number, c: any) => s + Number(c.total_cost), 0) / historical.length 
    : recentAvg;

  try {
    const prompt = `Analise os seguintes dados de custo AWS e identifique anomalias complexas:

ÚLTIMOS 7 DIAS:
${recent.map((c: any) => `${c.cost_date}: $${c.total_cost} (Serviços: ${JSON.stringify(c.service_breakdown || {})})`).join('\n')}

MÉDIA HISTÓRICA: $${historicalAvg.toFixed(2)}
MÉDIA RECENTE: $${recentAvg.toFixed(2)}
VARIAÇÃO: ${((recentAvg - historicalAvg) / historicalAvg * 100).toFixed(1)}%

Identifique:
1. Padrões anormais nos custos
2. Serviços com crescimento atípico
3. Correlações entre múltiplos serviços
4. Anomalias sazonais ou temporais

Retorne JSON: { "anomalies": [{ "description": "string", "severity": "low|medium|high|critical", "affected_services": ["string"], "recommendation": "string", "confidence": 0-1 }] }`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      }),
    });

    if (response.ok) {
      const aiData = await response.json();
      const aiAnalysis = aiData.choices?.[0]?.message?.content;

      if (aiAnalysis) {
        try {
          // Extract JSON from markdown code blocks if present
          const jsonMatch = aiAnalysis.match(/```json\n([\s\S]*?)\n```/) || aiAnalysis.match(/\{[\s\S]*\}/);
          const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiAnalysis;
          const parsed = JSON.parse(jsonText);
          
          for (const anomaly of parsed.anomalies || []) {
            anomalies.push({
              organization_id: orgId,
              detection_type: 'multi_dimensional',
              resource_type: 'cost_pattern',
              anomaly_score: anomaly.confidence || (anomaly.severity === 'critical' ? 0.9 : anomaly.severity === 'high' ? 0.7 : 0.5),
              severity: anomaly.severity,
              dimensions: {
                ai_analysis: anomaly.description,
                affected_services: anomaly.affected_services || [],
                pattern_type: 'multi_service_correlation'
              },
              baseline_metrics: { historical_avg: historicalAvg },
              current_metrics: { recent_avg: recentAvg },
              confidence_level: anomaly.confidence || 0.75,
              detection_method: 'ai_multi_dimensional',
              features_analyzed: ['cost_trends', 'service_distribution', 'temporal_patterns', 'cross_service_correlation'],
              recommendations: [anomaly.recommendation],
              metadata: {
                ai_model: 'google/gemini-2.5-flash',
                analysis_timestamp: new Date().toISOString(),
                arn: `arn:aws:ce:${region}:${accountId}:anomaly/multi-dimensional-${Date.now()}`,
                account_id: accountId,
                region: region,
                affected_services: anomaly.affected_services || []
              }
            });
          }
        } catch (e) {
          console.error('Failed to parse AI analysis:', e);
        }
      }
    }
  } catch (error) {
    console.error('AI analysis failed:', error);
  }

  return anomalies;
}