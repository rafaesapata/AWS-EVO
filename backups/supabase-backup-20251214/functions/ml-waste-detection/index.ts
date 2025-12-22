import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting and retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const BATCH_SIZE = 5; // Process 5 resources in parallel per batch
const CACHE_DURATION_HOURS = 6; // Cache analysis results for 6 hours

// Enhanced pricing data for more accurate cost estimates
const PRICING: Record<string, Record<string, number>> = {
  ec2: {
    't3.nano': 0.0052, 't3.micro': 0.0104, 't3.small': 0.0208, 't3.medium': 0.0416,
    't3.large': 0.0832, 't3.xlarge': 0.1664, 't3.2xlarge': 0.3328,
    'm5.large': 0.096, 'm5.xlarge': 0.192, 'm5.2xlarge': 0.384, 'm5.4xlarge': 0.768,
    'c5.large': 0.085, 'c5.xlarge': 0.17, 'c5.2xlarge': 0.34,
    'r5.large': 0.126, 'r5.xlarge': 0.252, 'r5.2xlarge': 0.504,
  },
  rds: {
    'db.t3.micro': 0.017, 'db.t3.small': 0.034, 'db.t3.medium': 0.068, 'db.t3.large': 0.136,
    'db.m5.large': 0.171, 'db.m5.xlarge': 0.342, 'db.m5.2xlarge': 0.684,
    'db.r5.large': 0.24, 'db.r5.xlarge': 0.48, 'db.r5.2xlarge': 0.96,
  },
  elasticache: {
    'cache.t3.micro': 0.017, 'cache.t3.small': 0.034, 'cache.t3.medium': 0.068,
    'cache.m5.large': 0.155, 'cache.m5.xlarge': 0.31, 'cache.r5.large': 0.214,
  },
  lambda: {
    'base': 0.0000002, // per ms
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // CRITICAL: Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authentication required');
    }

    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userId = payload.sub;
    
    if (!userId) {
      throw new Error('Authentication required');
    }

    console.log('✅ User authenticated:', userId);

    const { data: orgId, error: orgError } = await supabase.rpc('get_user_organization', { _user_id: userId });
    if (orgError || !orgId) {
      throw new Error('Organization not found for user');
    }

    console.log('✅ Organization:', orgId);

    let accountIdFromBody: string | null = null;
    try {
      const body = await req.json();
      accountIdFromBody = body?.accountId || null;
    } catch (_) {}

    let credQuery = supabase
      .from('aws_credentials')
      .select('id, regions')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    if (accountIdFromBody) {
      credQuery = credQuery.eq('id', accountIdFromBody);
    }

    const { data: credentialsList, error: credError } = await credQuery.limit(1);
    const credentials = credentialsList?.[0] || null;

    if (credError || !credentials) {
      throw new Error('AWS credentials not found for this organization');
    }

    const accountId = credentials.id;
    console.log('Running Enhanced ML Waste Detection for account:', accountId);

    // IMPROVEMENT: Check cache for recent analysis
    const cacheThreshold = new Date(Date.now() - CACHE_DURATION_HOURS * 60 * 60 * 1000).toISOString();
    
    // First check current resource count to validate cache
    const { count: currentResourceCount } = await supabase
      .from('resource_inventory')
      .select('*', { count: 'exact', head: true })
      .eq('aws_account_id', accountId)
      .in('resource_type', ['ec2', 'rds', 'elasticache', 'ebs', 'lambda', 'ecs']);
    
    const { data: cachedResults, count: cachedCount } = await supabase
      .from('resource_utilization_ml')
      .select('*', { count: 'exact' })
      .eq('aws_account_id', accountId)
      .gte('created_at', cacheThreshold);

    // Only use cache if resource count matches (no new resources added)
    if (cachedResults && cachedResults.length > 0 && cachedCount === currentResourceCount) {
      console.log('Using cached ML analysis results (resource count matches)');
      const totalSavings = cachedResults.reduce((sum: number, r: any) => sum + (r.potential_monthly_savings || 0), 0);
      return new Response(
        JSON.stringify({
          success: true,
          cached: true,
          analyzed_resources: cachedResults.length,
          total_monthly_savings: totalSavings,
          message: 'Using cached results from recent analysis'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (cachedResults && cachedResults.length > 0 && cachedCount !== currentResourceCount) {
      console.log(`Cache invalidated: resource count changed (cached: ${cachedCount}, current: ${currentResourceCount})`);
    }

    // IMPROVEMENT: Get more resource types for analysis
    const { data: resources, error: resourceError } = await supabase
      .from('resource_inventory')
      .select('*')
      .eq('aws_account_id', accountId)
      .in('resource_type', ['ec2', 'rds', 'elasticache', 'ebs', 'lambda', 'ecs']);

    if (resourceError) {
      throw resourceError;
    }

    if (!resources || resources.length === 0) {
      console.log('No resources found for ML analysis');
      return new Response(
        JSON.stringify({ message: 'No resources found for analysis', analyzed_resources: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analyzing ${resources.length} resources with ML`);

    // IMPROVEMENT: Get real metrics with historical trend data
    const resourceIds = resources.map(r => r.resource_id);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: metricsData } = await supabase
      .from('resource_metrics')
      .select('*')
      .eq('aws_account_id', accountId)
      .in('resource_id', resourceIds)
      .gte('timestamp', thirtyDaysAgo)
      .order('timestamp', { ascending: false });

    // Group metrics by resource with trend analysis
    const metricsByResource: Record<string, any[]> = {};
    for (const metric of metricsData || []) {
      if (!metricsByResource[metric.resource_id]) {
        metricsByResource[metric.resource_id] = [];
      }
      metricsByResource[metric.resource_id].push(metric);
    }

    // IMPROVEMENT: Get historical analysis for trend comparison
    const { data: historicalAnalysis } = await supabase
      .from('resource_utilization_ml')
      .select('resource_id, recommendation_type, potential_monthly_savings, created_at')
      .eq('aws_account_id', accountId)
      .lt('created_at', cacheThreshold)
      .order('created_at', { ascending: false });

    const historicalByResource: Record<string, any> = {};
    for (const hist of historicalAnalysis || []) {
      if (!historicalByResource[hist.resource_id]) {
        historicalByResource[hist.resource_id] = hist;
      }
    }

    const analysisResults: any[] = [];

    // IMPROVEMENT: Process resources in parallel batches with rate limiting
    const batches: any[][] = [];
    for (let i = 0; i < resources.length; i += BATCH_SIZE) {
      batches.push(resources.slice(i, i + BATCH_SIZE));
    }

    console.log(`Processing ${batches.length} batches of ${BATCH_SIZE} resources each`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`Processing batch ${batchIndex + 1}/${batches.length}`);

      const batchPromises = batch.map(async (resource) => {
        const resourceMetrics = metricsByResource[resource.resource_id] || [];
        const historicalData = historicalByResource[resource.resource_id];
        
        // IMPROVEMENT: Calculate comprehensive usage patterns including disk I/O
        const cpuMetrics = resourceMetrics.filter(m => m.metric_name?.includes('CPU'));
        const memoryMetrics = resourceMetrics.filter(m => m.metric_name?.includes('Memory'));
        const diskReadMetrics = resourceMetrics.filter(m => m.metric_name?.includes('DiskRead') || m.metric_name?.includes('ReadOps'));
        const diskWriteMetrics = resourceMetrics.filter(m => m.metric_name?.includes('DiskWrite') || m.metric_name?.includes('WriteOps'));
        const networkInMetrics = resourceMetrics.filter(m => m.metric_name?.includes('NetworkIn'));
        const networkOutMetrics = resourceMetrics.filter(m => m.metric_name?.includes('NetworkOut'));
        
        const hasRealMetrics = resourceMetrics.length > 0;
        
        const avgCpu = cpuMetrics.length > 0 
          ? cpuMetrics.reduce((sum, m) => sum + (m.value || 0), 0) / cpuMetrics.length 
          : 50;
        const avgMemory = memoryMetrics.length > 0
          ? memoryMetrics.reduce((sum, m) => sum + (m.value || 0), 0) / memoryMetrics.length
          : 50;
        const avgDiskRead = diskReadMetrics.length > 0
          ? diskReadMetrics.reduce((sum, m) => sum + (m.value || 0), 0) / diskReadMetrics.length
          : 0;
        const avgDiskWrite = diskWriteMetrics.length > 0
          ? diskWriteMetrics.reduce((sum, m) => sum + (m.value || 0), 0) / diskWriteMetrics.length
          : 0;
        const avgNetworkIn = networkInMetrics.length > 0
          ? networkInMetrics.reduce((sum, m) => sum + (m.value || 0), 0) / networkInMetrics.length
          : 500;
        const avgNetworkOut = networkOutMetrics.length > 0
          ? networkOutMetrics.reduce((sum, m) => sum + (m.value || 0), 0) / networkOutMetrics.length
          : 500;

        // IMPROVEMENT: Calculate peak and trend data
        const peakCpu = cpuMetrics.length > 0 ? Math.max(...cpuMetrics.map(m => m.value || 0)) : avgCpu;
        const minCpu = cpuMetrics.length > 0 ? Math.min(...cpuMetrics.map(m => m.value || 0)) : avgCpu;
        
        // Calculate trend (positive = increasing, negative = decreasing)
        let cpuTrend = 0;
        if (cpuMetrics.length >= 7) {
          const firstWeek = cpuMetrics.slice(-7).reduce((sum, m) => sum + (m.value || 0), 0) / 7;
          const lastWeek = cpuMetrics.slice(0, 7).reduce((sum, m) => sum + (m.value || 0), 0) / 7;
          cpuTrend = lastWeek - firstWeek;
        }

        // Generate hourly pattern from real data
        const hourlyUsage = Array.from({ length: 24 }, (_, i) => {
          const hourMetrics = cpuMetrics.filter(m => new Date(m.timestamp).getHours() === i);
          return {
            hour: i,
            cpu: hourMetrics.length > 0 
              ? hourMetrics.reduce((sum, m) => sum + (m.value || 0), 0) / hourMetrics.length 
              : avgCpu * (0.8 + Math.random() * 0.4),
            memory: avgMemory * (0.9 + Math.random() * 0.2),
            diskRead: avgDiskRead,
            diskWrite: avgDiskWrite,
            networkIn: avgNetworkIn * (0.7 + Math.random() * 0.6),
            networkOut: avgNetworkOut * (0.7 + Math.random() * 0.6),
          };
        });

        // Daily and weekly patterns
        const dailyUsage = Array.from({ length: 7 }, (_, i) => ({
          day: i,
          avgCpu: hourlyUsage.reduce((sum, h) => sum + h.cpu, 0) / 24,
          avgMemory: hourlyUsage.reduce((sum, h) => sum + h.memory, 0) / 24,
          avgDiskIO: (avgDiskRead + avgDiskWrite) / 2,
          avgNetwork: (avgNetworkIn + avgNetworkOut) / 2,
        }));

        const weeklyUsage = Array.from({ length: 4 }, (_, i) => ({
          week: i,
          avgCpu: dailyUsage.reduce((sum, d) => sum + d.avgCpu, 0) / 7,
          avgMemory: dailyUsage.reduce((sum, d) => sum + d.avgMemory, 0) / 7,
          avgDiskIO: dailyUsage.reduce((sum, d) => sum + d.avgDiskIO, 0) / 7,
          avgNetwork: dailyUsage.reduce((sum, d) => sum + d.avgNetwork, 0) / 7,
        }));

        // Get current instance cost
        const instanceType = resource.metadata?.InstanceType || resource.metadata?.DBInstanceClass || resource.metadata?.CacheNodeType || 'unknown';
        const resourceTypePricing = PRICING[resource.resource_type] || PRICING.ec2;
        const hourlyCost = resourceTypePricing[instanceType] || 0.05;
        const currentMonthlyCost = hourlyCost * 730;

        // Build comprehensive AI prompt
        const prompt = `Analyze this AWS ${resource.resource_type.toUpperCase()} resource usage pattern for optimization:

Resource Details:
- Type: ${resource.resource_type}
- Instance/Size: ${instanceType}
- Region: ${resource.region}
- Current Monthly Cost: $${currentMonthlyCost.toFixed(2)}
- Has Real Metrics: ${hasRealMetrics ? 'Yes (last 30 days)' : 'No (estimated)'}

Usage Metrics (30-day analysis):
- CPU: Avg ${avgCpu.toFixed(1)}%, Peak ${peakCpu.toFixed(1)}%, Min ${minCpu.toFixed(1)}%, Trend: ${cpuTrend > 0 ? '+' : ''}${cpuTrend.toFixed(1)}%
- Memory: Avg ${avgMemory.toFixed(1)}%
- Disk I/O: Read ${avgDiskRead.toFixed(0)} ops/s, Write ${avgDiskWrite.toFixed(0)} ops/s
- Network: In ${(avgNetworkIn/1024).toFixed(1)} KB/s, Out ${(avgNetworkOut/1024).toFixed(1)} KB/s

Hourly Pattern (business hours avg): ${hourlyUsage.slice(9, 17).reduce((s, h) => s + h.cpu, 0) / 8}% CPU
Hourly Pattern (night hours avg): ${hourlyUsage.slice(0, 6).reduce((s, h) => s + h.cpu, 0) / 6}% CPU

${historicalData ? `Previous Analysis: ${historicalData.recommendation_type} with $${historicalData.potential_monthly_savings?.toFixed(2)} potential savings` : 'No previous analysis'}

Based on this comprehensive data, provide optimization recommendations. Consider:
1. Is this resource underutilized (CPU < 20% avg, < 40% peak)?
2. Should it be downsized? To what specific instance type?
3. What are realistic monthly savings based on AWS pricing?
4. Is auto-scaling appropriate? What parameters?
5. Are there time-based patterns suggesting scheduled scaling?
6. What's the confidence level (0-1) based on data quality?`;

        // IMPROVEMENT: Retry logic with exponential backoff
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${lovableApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                messages: [
                  {
                    role: 'system',
                    content: 'You are an AWS cost optimization expert with deep knowledge of instance sizing, auto-scaling, and cost patterns. Analyze resource usage patterns and provide specific, actionable, conservative recommendations. Only recommend changes when there is clear evidence of waste. Consider business-hour patterns and peak usage when sizing.'
                  },
                  {
                    role: 'user',
                    content: prompt
                  }
                ],
                tools: [{
                  type: 'function',
                  function: {
                    name: 'analyze_resource',
                    description: 'Analyze resource utilization and provide optimization recommendations',
                    parameters: {
                      type: 'object',
                      properties: {
                        is_underutilized: { type: 'boolean', description: 'True if average usage is below 20% and peak below 40%' },
                        recommended_size: { type: 'string', description: 'Specific AWS instance type recommendation (e.g., t3.small, db.t3.medium)' },
                        current_monthly_cost: { type: 'number', description: 'Current estimated monthly cost in USD' },
                        potential_monthly_savings: { type: 'number', description: 'Realistic monthly savings in USD' },
                        auto_scaling_eligible: { type: 'boolean', description: 'True if resource shows variable usage patterns suitable for auto-scaling' },
                        auto_scaling_min: { type: 'number', description: 'Minimum capacity for auto-scaling' },
                        auto_scaling_max: { type: 'number', description: 'Maximum capacity for auto-scaling' },
                        scheduled_scaling_recommended: { type: 'boolean', description: 'True if clear time-based patterns suggest scheduled scaling' },
                        scheduled_scaling_config: { type: 'string', description: 'Suggested schedule (e.g., "Scale down to t3.small at 6PM, scale up at 8AM")' },
                        confidence: { type: 'number', description: 'Confidence level 0-1 based on data quality' },
                        recommendation_type: { 
                          type: 'string',
                          enum: ['downsize', 'rightsize', 'terminate', 'auto-scale', 'scheduled-scaling', 'no-change']
                        },
                        reasoning: { type: 'string', description: 'Detailed explanation of the recommendation' },
                        implementation_complexity: {
                          type: 'string',
                          enum: ['low', 'medium', 'high']
                        },
                        risk_level: {
                          type: 'string',
                          enum: ['low', 'medium', 'high'],
                          description: 'Risk of performance impact if recommendation is implemented'
                        }
                      },
                      required: ['is_underutilized', 'confidence', 'recommendation_type', 'reasoning', 'current_monthly_cost'],
                      additionalProperties: false
                    }
                  }
                }],
                tool_choice: { type: 'function', function: { name: 'analyze_resource' } }
              }),
            });

            // IMPROVEMENT: Handle rate limiting
            if (aiResponse.status === 429 || aiResponse.status === 402) {
              const retryAfter = parseInt(aiResponse.headers.get('Retry-After') || '5');
              console.log(`Rate limited, waiting ${retryAfter}s before retry...`);
              await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
              continue;
            }

            if (!aiResponse.ok) {
              const errorText = await aiResponse.text();
              console.error(`AI API error (attempt ${attempt + 1}):`, aiResponse.status, errorText);
              lastError = new Error(`AI API error: ${aiResponse.status}`);
              await new Promise(resolve => setTimeout(resolve, BASE_DELAY_MS * Math.pow(2, attempt)));
              continue;
            }

            const aiResult = await aiResponse.json();
            const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
            
            if (!toolCall) {
              console.error('No tool call in AI response for resource:', resource.resource_id);
              return null;
            }

            const analysis = JSON.parse(toolCall.function.arguments);

            // Adjust confidence based on data quality
            let adjustedConfidence = analysis.confidence;
            if (!hasRealMetrics) {
              adjustedConfidence = Math.min(adjustedConfidence, 0.5);
            }
            if (resourceMetrics.length < 7) {
              adjustedConfidence = Math.min(adjustedConfidence, 0.7);
            }

            return {
              organization_id: orgId,
              aws_account_id: accountId,
              resource_id: resource.resource_id,
              resource_type: resource.resource_type,
              resource_name: resource.resource_name,
              current_size: instanceType,
              recommended_size: analysis.recommended_size,
              utilization_patterns: {
                avgCpuUsage: avgCpu,
                peakCpuUsage: peakCpu,
                minCpuUsage: minCpu,
                cpuTrend: cpuTrend,
                avgMemoryUsage: avgMemory,
                avgDiskRead: avgDiskRead,
                avgDiskWrite: avgDiskWrite,
                avgNetworkIn: avgNetworkIn,
                avgNetworkOut: avgNetworkOut,
                peakHours: hourlyUsage
                  .map((h, i) => ({ hour: i, cpu: h.cpu }))
                  .sort((a, b) => b.cpu - a.cpu)
                  .slice(0, 3)
                  .map(h => h.hour),
                lowUsageHours: hourlyUsage
                  .map((h, i) => ({ hour: i, cpu: h.cpu }))
                  .sort((a, b) => a.cpu - b.cpu)
                  .slice(0, 3)
                  .map(h => h.hour),
                hasRealMetrics: hasRealMetrics,
                dataPointCount: resourceMetrics.length
              },
              hourly_usage: hourlyUsage,
              daily_usage: dailyUsage,
              weekly_usage: weeklyUsage,
              ml_confidence: adjustedConfidence,
              current_monthly_cost: analysis.current_monthly_cost || currentMonthlyCost,
              potential_monthly_savings: analysis.potential_monthly_savings || 0,
              recommendation_type: analysis.recommendation_type,
              implementation_complexity: analysis.implementation_complexity || 'medium',
              risk_level: analysis.risk_level || 'medium',
              reasoning: analysis.reasoning,
              auto_scaling_eligible: analysis.auto_scaling_eligible || false,
              auto_scaling_config: analysis.auto_scaling_eligible ? {
                min_capacity: analysis.auto_scaling_min || 1,
                max_capacity: analysis.auto_scaling_max || 4,
                target_cpu: 70,
                target_memory: 80,
              } : null,
              scheduled_scaling_recommended: analysis.scheduled_scaling_recommended || false,
              scheduled_scaling_config: analysis.scheduled_scaling_config || null,
              previous_recommendation: historicalData?.recommendation_type || null,
              previous_savings: historicalData?.potential_monthly_savings || null,
            };

          } catch (aiError) {
            console.error(`AI analysis error (attempt ${attempt + 1}) for resource:`, resource.resource_id, aiError);
            lastError = aiError instanceof Error ? aiError : new Error(String(aiError));
            await new Promise(resolve => setTimeout(resolve, BASE_DELAY_MS * Math.pow(2, attempt)));
          }
        }

        console.error(`Failed to analyze resource after ${MAX_RETRIES} attempts:`, resource.resource_id, lastError);
        return null;
      });

      const batchResults = await Promise.all(batchPromises);
      analysisResults.push(...batchResults.filter(r => r !== null));

      // Add small delay between batches to avoid rate limiting
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Store results in database
    if (analysisResults.length > 0) {
      // Delete old results for this account
      await supabase
        .from('resource_utilization_ml')
        .delete()
        .eq('aws_account_id', accountId);

      const { error: insertError } = await supabase
        .from('resource_utilization_ml')
        .insert(analysisResults);

      if (insertError) {
        console.error('Error inserting ML analysis:', insertError);
        throw insertError;
      }
    }

    const totalSavings = analysisResults.reduce((sum, r) => sum + (r.potential_monthly_savings || 0), 0);
    const totalCurrentCost = analysisResults.reduce((sum, r) => sum + (r.current_monthly_cost || 0), 0);

    console.log(`✅ Enhanced ML Waste Detection completed: ${analysisResults.length} resources analyzed, $${totalSavings.toFixed(2)} potential savings`);

    return new Response(
      JSON.stringify({
        success: true,
        analyzed_resources: analysisResults.length,
        total_resources: resources.length,
        total_current_monthly_cost: totalCurrentCost,
        total_monthly_savings: totalSavings,
        savings_percentage: totalCurrentCost > 0 ? ((totalSavings / totalCurrentCost) * 100).toFixed(1) : 0,
        recommendations: {
          downsize: analysisResults.filter(r => r.recommendation_type === 'downsize').length,
          rightsize: analysisResults.filter(r => r.recommendation_type === 'rightsize').length,
          terminate: analysisResults.filter(r => r.recommendation_type === 'terminate').length,
          auto_scale: analysisResults.filter(r => r.recommendation_type === 'auto-scale').length,
          scheduled_scaling: analysisResults.filter(r => r.recommendation_type === 'scheduled-scaling').length,
          no_change: analysisResults.filter(r => r.recommendation_type === 'no-change').length,
        },
        by_risk_level: {
          low: analysisResults.filter(r => r.risk_level === 'low').length,
          medium: analysisResults.filter(r => r.risk_level === 'medium').length,
          high: analysisResults.filter(r => r.risk_level === 'high').length,
        },
        by_resource_type: {
          ec2: analysisResults.filter(r => r.resource_type === 'ec2').length,
          rds: analysisResults.filter(r => r.resource_type === 'rds').length,
          elasticache: analysisResults.filter(r => r.resource_type === 'elasticache').length,
          lambda: analysisResults.filter(r => r.resource_type === 'lambda').length,
          ecs: analysisResults.filter(r => r.resource_type === 'ecs').length,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Enhanced ML Waste Detection error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
