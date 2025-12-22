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

  const startTime = Date.now();

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Get organization_id from authenticated user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseClient.auth.getUser(token);
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data: orgData } = await supabaseClient.rpc('get_user_organization', {
      _user_id: user.id
    });
    
    const organizationId = orgData;
    if (!organizationId) {
      throw new Error('Organization not found for user');
    }

    console.log('Running predictive incident detection with ML for org:', organizationId);

    // 🚀 OPTIMIZED: Fetch ALL data in parallel for maximum speed
    const [
      findingsResult,
      costAnomaliesResult,
      metricsResult,
      resourcesResult,
      costsResult,
      securityHistoryResult,
      anomalyHistoryResult
    ] = await Promise.all([
      supabaseClient.from('findings').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(100),
      supabaseClient.from('cost_anomalies').select('*').eq('organization_id', organizationId).eq('status', 'active').order('detected_at', { ascending: false }).limit(50),
      supabaseClient.from('scan_history_metrics').select('*').eq('organization_id', organizationId).order('metric_date', { ascending: false }).limit(30),
      supabaseClient.from('aws_resources').select('*').eq('organization_id', organizationId).limit(100),
      supabaseClient.from('daily_costs').select('*').eq('organization_id', organizationId).order('cost_date', { ascending: false }).limit(30),
      supabaseClient.from('security_scans_history').select('*').eq('organization_id', organizationId).order('scan_date', { ascending: false }).limit(10),
      supabaseClient.from('anomaly_detections_history').select('*').eq('organization_id', organizationId).order('scan_date', { ascending: false }).limit(10)
    ]);

    const findings = findingsResult.data;
    const costAnomalies = costAnomaliesResult.data;
    const metrics = metricsResult.data;
    const resources = resourcesResult.data;
    const costs = costsResult.data;
    const securityHistory = securityHistoryResult.data;
    const anomalyHistory = anomalyHistoryResult.data;

    console.log(`Data loaded in parallel: ${findings?.length || 0} findings, ${costAnomalies?.length || 0} anomalies, ${resources?.length || 0} resources`);

    // Calculate temporal trends
    const calculateTrends = (data: any[], dateField: string, valueField: string) => {
      if (!data || data.length < 2) return null;
      const sorted = [...data].sort((a, b) => new Date(a[dateField]).getTime() - new Date(b[dateField]).getTime());
      const recent = sorted.slice(-7);
      const older = sorted.slice(-14, -7);
      const recentAvg = recent.reduce((sum, item) => sum + (item[valueField] || 0), 0) / recent.length;
      const olderAvg = older.reduce((sum, item) => sum + (item[valueField] || 0), 0) / (older.length || 1);
      const trend = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
      return { recentAvg, olderAvg, trend, direction: trend > 5 ? 'increasing' : trend < -5 ? 'decreasing' : 'stable' };
    };

    const costTrend = calculateTrends(costs || [], 'cost_date', 'total_cost');
    const securityTrend = securityHistory && securityHistory.length >= 2 ? {
      latestScore: securityHistory[0]?.security_score || 0,
      previousScore: securityHistory[1]?.security_score || 0,
      criticalTrend: ((securityHistory[0]?.critical_count || 0) - (securityHistory[1]?.critical_count || 0)),
      highTrend: ((securityHistory[0]?.high_count || 0) - (securityHistory[1]?.high_count || 0))
    } : null;

    const anomalyTrend = anomalyHistory && anomalyHistory.length >= 2 ? {
      latestCount: anomalyHistory[0]?.total_anomalies || 0,
      previousCount: anomalyHistory[1]?.total_anomalies || 0,
      trend: ((anomalyHistory[0]?.total_anomalies || 0) - (anomalyHistory[1]?.total_anomalies || 0))
    } : null;

    // Extrair recursos dos findings se aws_resources estiver vazio
    let resourcesForAnalysis = resources || [];
    
    if ((!resources || resources.length === 0) && findings && findings.length > 0) {
      console.log('No aws_resources found, extracting resources from findings...');
      
      // Extrair recursos únicos dos findings
      const resourceMap = new Map();
      findings.forEach((finding: any) => {
        if (finding.details?.resourceId || finding.details?.resourceArn) {
          const resourceKey = finding.details.resourceId || finding.details.resourceArn;
          if (!resourceMap.has(resourceKey)) {
            resourceMap.set(resourceKey, {
              resource_id: finding.details.resourceId || finding.details.resourceArn,
              resource_type: finding.details.service || 'Unknown',
              region: finding.details.region || 'global',
              arn: finding.details.resourceArn,
              name: finding.details.evidence?.name || finding.details.resourceId,
              severity: finding.severity,
              tags: {},
              source: 'security_finding'
            });
          }
        }
      });
      
      resourcesForAnalysis = Array.from(resourceMap.values());
      console.log(`Extracted ${resourcesForAnalysis.length} unique resources from findings`);
    }

    // Prepare comprehensive data for ML analysis
    const analysisData = {
      recent_findings: findings || [],
      cost_anomalies: costAnomalies || [],
      historical_metrics: metrics || [],
      aws_resources: resourcesForAnalysis,
      recent_costs: costs || [],
      security_history: securityHistory || [],
      anomaly_history: anomalyHistory || [],
      trends: {
        cost: costTrend,
        security: securityTrend,
        anomaly: anomalyTrend
      },
      analysis_timestamp: new Date().toISOString()
    };

    // Calculate risk correlations
    const criticalFindings = findings?.filter(f => f.severity === 'critical').length || 0;
    const highFindings = findings?.filter(f => f.severity === 'high').length || 0;
    const activeCostAnomalies = costAnomalies?.length || 0;
    const totalResources = resourcesForAnalysis.length;
    
    const riskIndicators = {
      highRiskResourceRatio: totalResources > 0 ? ((criticalFindings + highFindings) / totalResources * 100).toFixed(1) : 0,
      costVolatility: costTrend?.direction === 'increasing' && Math.abs(costTrend.trend) > 20,
      securityDegradation: securityTrend && securityTrend.criticalTrend > 0,
      anomalyAcceleration: anomalyTrend && anomalyTrend.trend > 5
    };

    // Se não houver dados reais suficientes (nem resources nem findings), retornar array vazio
    if (resourcesForAnalysis.length === 0) {
      console.log('No real AWS resources or findings found - cannot generate predictions without real data');
      
      const executionTime = (Date.now() - startTime) / 1000;
      
      await supabaseClient
        .from('predictive_incidents_history')
        .insert({
          organization_id: organizationId,
          total_predictions: 0,
          high_risk_count: 0,
          critical_count: 0,
          execution_time_seconds: executionTime,
          message: 'Nenhum recurso AWS encontrado. Conecte suas credenciais AWS e execute scans para obter predições baseadas em dados reais.'
        });
      
      return new Response(
        JSON.stringify({
          success: true,
          predictions_count: 0,
          high_risk_count: 0,
          predictions: [],
          message: 'Nenhum recurso AWS encontrado. Conecte suas credenciais AWS e execute scans para obter predições baseadas em dados reais.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Listar TODOS os recursos reais disponíveis (incluindo os extraídos de findings)
    const resourcesList = resourcesForAnalysis.map((r: any) => 
      `- Type: ${r.resource_type}, ID: ${r.resource_id || r.arn || 'N/A'}, Name: ${r.name || 'N/A'}, Region: ${r.region || 'N/A'}, Severity: ${r.severity || 'N/A'}`
    ).join('\n');

    const mlPrompt = `You are an advanced AWS incident prediction ML system with temporal pattern recognition. Analyze REAL infrastructure data, historical trends, and correlations to predict high-probability incidents.

CRITICAL RULES:
1. Use ONLY actual resource IDs, ARNs, and names from the resources list below
2. NEVER generate fictional identifiers - every prediction must reference real resources
3. Incorporate temporal trends and pattern analysis in predictions
4. If insufficient real data exists, return an empty array []
5. Prioritize resources with CRITICAL/HIGH severity findings AND negative trends

═══════════════════════════════════════════════════════
REAL AWS RESOURCES AVAILABLE (${totalResources} total):
${resourcesList}
═══════════════════════════════════════════════════════

INFRASTRUCTURE STATE ANALYSIS:
• Security: ${criticalFindings} critical + ${highFindings} high severity findings
• Cost Anomalies: ${activeCostAnomalies} active anomalies
• Resources Monitored: ${totalResources} across ${new Set(resourcesForAnalysis.map((r: any) => r.region)).size} regions
• Historical Data: ${costs?.length || 0} days costs, ${metrics?.length || 0} metrics, ${securityHistory?.length || 0} security scans

TEMPORAL TRENDS & RISK INDICATORS:
${costTrend ? `• Cost Trend: ${costTrend.direction.toUpperCase()} (${costTrend.trend > 0 ? '+' : ''}${costTrend.trend.toFixed(1)}% change, $${costTrend.recentAvg.toFixed(2)}/day avg)` : '• Cost Trend: Insufficient data'}
${securityTrend ? `• Security Posture: Score ${securityTrend.latestScore.toFixed(1)} (previous: ${securityTrend.previousScore.toFixed(1)}), Critical findings ${securityTrend.criticalTrend > 0 ? 'INCREASING +' : ''}${securityTrend.criticalTrend}` : '• Security Posture: Insufficient historical data'}
${anomalyTrend ? `• Anomaly Detection: ${anomalyTrend.latestCount} current (${anomalyTrend.trend > 0 ? '+' : ''}${anomalyTrend.trend} vs previous scan)` : '• Anomaly Detection: Insufficient data'}
• High-Risk Resource Ratio: ${riskIndicators.highRiskResourceRatio}% of resources have critical/high findings
${riskIndicators.costVolatility ? '⚠️ ALERT: High cost volatility detected' : ''}
${riskIndicators.securityDegradation ? '⚠️ ALERT: Security posture degrading over time' : ''}
${riskIndicators.anomalyAcceleration ? '⚠️ ALERT: Anomaly rate accelerating' : ''}

CRITICAL SECURITY ISSUES (Top 15 by severity + recency):
${findings && findings.length > 0 ? findings.slice(0, 15).map((f: any) => 
  `• [${f.severity.toUpperCase()}] ${f.description}
   Resource: ${f.details?.resourceId || f.details?.resourceArn || 'N/A'} | Region: ${f.details?.region || 'N/A'}
   Category: ${f.category || 'N/A'} | Created: ${new Date(f.created_at).toLocaleDateString()}`
).join('\n') : '• No critical security findings'}

ACTIVE COST ANOMALIES (Top 8 by impact):
${costAnomalies && costAnomalies.length > 0 ? costAnomalies.slice(0, 8).map((a: any) => 
  `• ${a.service}: ${a.deviation_percentage > 0 ? '+' : ''}${a.deviation_percentage}% deviation ($${a.current_cost} vs baseline $${a.baseline_cost})
   Type: ${a.anomaly_type} | Severity: ${a.severity} | Resource: ${a.resource_id || 'Service-wide'}`
).join('\n') : '• No active cost anomalies'}

═══════════════════════════════════════════════════════
PREDICTION TASK:
Generate 4-8 high-probability incident predictions using REAL resources and incorporating:
1. Current security vulnerabilities + historical security trend
2. Cost anomalies + cost trend direction
3. Resource-specific risk factors (missing protections, misconfigurations)
4. Temporal patterns (degrading metrics, accelerating issues)

INCIDENT CATEGORIES:
• security_incident: Critical vulnerabilities (no WAF/MFA, exposed DBs, weak IAM, unencrypted data, public access)
• performance_degradation: Saturation risks (high CPU/memory, no auto-scaling, undersized instances, no caching)
• capacity_saturation: Resource limits (storage full, connection limits, throttling, no scaling policies)
• cost_spike: Financial risks (runaway costs, unused resources, oversized instances, expensive regions)
• availability_risk: Downtime risks (no backups, no multi-AZ, single points of failure, no monitoring)

PREDICTION QUALITY REQUIREMENTS:
• probability: 70-98 (based on severity + trend + historical evidence)
• confidence_score: 75-98 (higher when multiple data sources correlate)
• time_to_incident_hours: 24-336 (shorter for critical + degrading trends)
• contributing_factors: 2-4 factors with weights summing to 1.0, each citing specific evidence
• recommended_actions: 3-5 specific, actionable remediation steps with priority order

OUTPUT FORMAT (valid JSON array):
[{
  "resource_id": "<actual resource_id or ARN from resources list>",
  "resource_type": "<actual resource_type from list>",
  "resource_name": "<actual name from list>",
  "region": "<actual region from list>",
  "incident_type": "security_incident|performance_degradation|capacity_saturation|cost_spike|availability_risk",
  "severity": "critical|high|medium",
  "probability": 70-98,
  "time_to_incident_hours": 24-336,
  "confidence_score": 75-98,
  "contributing_factors": [
    {"factor": "Current vulnerability", "weight": 0.4, "value": "Specific finding with evidence"},
    {"factor": "Temporal trend", "weight": 0.3, "value": "Historical pattern from data"},
    {"factor": "Correlation", "weight": 0.2, "value": "Related issues from other sources"},
    {"factor": "Impact assessment", "weight": 0.1, "value": "Business/operational risk"}
  ],
  "recommended_actions": "Prioritized remediation: 1) [Immediate] Critical action, 2) [Short-term] Secondary action, 3) [Medium-term] Preventive measure"
}]

**CRITICAL: Prioritize resources with CRITICAL/HIGH findings AND negative trends. Return ONLY valid JSON array. Use REAL resource identifiers only.**`;

    // 🚀 OPTIMIZED: Use faster model (gemini-2.5-flash instead of gemini-2.5-pro)
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'system', 
            content: 'You are an AWS incident prediction ML system. Use ONLY real resource IDs from data. Return valid JSON array []. Never generate fictional IDs.' 
          },
          { role: 'user', content: mlPrompt }
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log('AI Response received');
    
    let predictions = [];

    try {
      const content = aiData.choices[0].message.content;
      console.log('AI Content:', content.substring(0, 200));
      
      // Tentar extrair JSON do conteúdo
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        predictions = JSON.parse(jsonMatch[0]);
        console.log(`Parsed ${predictions.length} predictions from AI response`);
      } else {
        console.log('No JSON array found in response, content:', content);
      }
    } catch (parseError) {
      console.error('Error parsing predictions:', parseError);
      console.log('Full AI response:', JSON.stringify(aiData));
      predictions = [];
    }

    // Se não houver predições da IA, não gerar dados mockados
    if (predictions.length === 0) {
      console.log('No predictions generated - insufficient data');
      
      const executionTime = (Date.now() - startTime) / 1000;
      
      // Salvar no histórico mesmo sem predições
      await supabaseClient
        .from('predictive_incidents_history')
        .insert({
          organization_id: organizationId,
          total_predictions: 0,
          high_risk_count: 0,
          critical_count: 0,
          execution_time_seconds: executionTime,
          message: 'Dados insuficientes para gerar predições. Execute scans de segurança, coleta de métricas e monitore recursos AWS para obter predições precisas.'
        });
      
      return new Response(
        JSON.stringify({
          success: true,
          predictions_count: 0,
          high_risk_count: 0,
          predictions: [],
          message: 'Dados insuficientes para gerar predições. Execute scans de segurança, coleta de métricas e monitore recursos AWS para obter predições precisas.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limpar predições anteriores desta organização
    console.log('Removing old predictions for organization:', organizationId);
    await supabaseClient
      .from('predictive_incidents')
      .delete()
      .eq('organization_id', organizationId);

    // Store predictions in database
    let insertedCount = 0;
    const highRiskCount = predictions.filter((p: any) => p.probability > 80).length;
    const criticalCount = predictions.filter((p: any) => p.severity === 'critical').length;

    for (const prediction of predictions) {
      try {
        const { error } = await supabaseClient
          .from('predictive_incidents')
          .insert({
            organization_id: organizationId,
            resource_type: prediction.resource_type,
            resource_id: prediction.resource_id,
            resource_name: prediction.resource_name,
            region: prediction.region || 'us-east-1',
            incident_type: prediction.incident_type,
            severity: prediction.severity,
            probability: prediction.probability,
            time_to_incident_hours: prediction.time_to_incident_hours,
            confidence_score: prediction.confidence_score,
            contributing_factors: prediction.contributing_factors,
            recommended_actions: prediction.recommended_actions,
            status: 'predicted'
          });

        if (error) {
          console.error('Error inserting prediction:', error);
        } else {
          insertedCount++;
        }
      } catch (insertError) {
        console.error('Exception inserting prediction:', insertError);
      }
    }

    console.log(`Predicted ${predictions.length} potential incidents, inserted ${insertedCount}`);

    const executionTime = (Date.now() - startTime) / 1000;

    // Salvar no histórico
    await supabaseClient
      .from('predictive_incidents_history')
      .insert({
        organization_id: organizationId,
        total_predictions: predictions.length,
        high_risk_count: highRiskCount,
        critical_count: criticalCount,
        execution_time_seconds: executionTime
      });

    return new Response(
      JSON.stringify({
        success: true,
        predictions_count: predictions.length,
        high_risk_count: highRiskCount,
        predictions: predictions
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in predict-incidents:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
