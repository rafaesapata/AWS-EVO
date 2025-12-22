import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AWSDataContext {
  costAnomalies: any[];
  securityFindings: any[];
  wasteDetection: any[];
  complianceIssues: any[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting intelligent alerts analysis...');

    // Get all organizations
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name');

    if (orgsError) throw orgsError;

    let totalAlertsCreated = 0;

    for (const org of orgs || []) {
      console.log(`Analyzing data for organization: ${org.name}`);

      // Gather real AWS data for the last 7 days (increased from 24h for better coverage)
      const since = new Date(Date.now() - 7 * 24 * 3600000).toISOString();

      // Get AWS credentials for this organization
      const { data: credentials } = await supabase
        .from('aws_credentials')
        .select('id')
        .eq('organization_id', org.id)
        .eq('is_active', true);

      if (!credentials || credentials.length === 0) {
        console.log(`No active AWS credentials for ${org.name}`);
        continue;
      }

      const accountIds = credentials.map(c => c.id);

      // Cost Anomalies (join through aws_credentials)
      const { data: costAnomalies } = await supabase
        .from('cost_anomalies')
        .select('*')
        .in('aws_account_id', accountIds)
        .gte('detected_at', since)
        .in('status', ['active', 'investigating'])
        .order('severity', { ascending: false })
        .limit(10);

      // Security Issues from latest scans
      const { data: securityScans } = await supabase
        .from('security_scans_history')
        .select('*')
        .eq('organization_id', org.id)
        .gte('scan_date', since)
        .order('scan_date', { ascending: false })
        .limit(5);

      // Extract security findings from scans
      const securityFindings = securityScans?.filter(s => 
        (s.critical_count > 0 || s.high_count > 0)
      ) || [];

      // Waste Detection (join through aws_credentials)
      const { data: wasteDetection } = await supabase
        .from('waste_detection')
        .select('*')
        .in('aws_account_id', accountIds)
        .gte('detected_at', since)
        .order('monthly_waste_cost', { ascending: false })
        .limit(10);

      // Compliance Issues (join through security_scans)
      const { data: complianceIssues } = await supabase
        .from('compliance_checks')
        .select('*, security_scans!inner(organization_id)')
        .eq('security_scans.organization_id', org.id)
        .eq('status', 'failed')
        .gte('created_at', since)
        .in('severity', ['critical', 'high'])
        .limit(10);

      const awsData: AWSDataContext = {
        costAnomalies: costAnomalies || [],
        securityFindings: securityFindings || [],
        wasteDetection: wasteDetection || [],
        complianceIssues: complianceIssues || [],
      };

      // Skip if no significant data to analyze
      const totalIssues = 
        awsData.costAnomalies.length + 
        awsData.securityFindings.length + 
        awsData.wasteDetection.length + 
        awsData.complianceIssues.length;

      if (totalIssues === 0) {
        console.log(`No critical issues found for ${org.name} in the last 7 days`);
        continue;
      }

      console.log(`Found ${totalIssues} issues for ${org.name}, analyzing with AI...`);

      // Use AI to analyze and correlate events
      const aiAnalysis = await analyzeWithAI(awsData, lovableApiKey);

      if (aiAnalysis && aiAnalysis.alerts) {
        // Create intelligent alerts
        for (const alert of aiAnalysis.alerts) {
          // Check for duplicate recent alerts
          const { data: recentAlerts } = await supabase
            .from('dashboard_alerts')
            .select('id')
            .eq('organization_id', org.id)
            .eq('title', alert.title)
            .gte('created_at', new Date(Date.now() - 3600000).toISOString()) // Last hour
            .limit(1);

          if (recentAlerts && recentAlerts.length > 0) {
            console.log(`Skipping duplicate alert: ${alert.title}`);
            continue;
          }

          const { error: insertError } = await supabase
            .from('dashboard_alerts')
            .insert({
              organization_id: org.id,
              alert_type: alert.type,
              title: alert.title,
              message: alert.message,
              severity: alert.severity,
              metadata: {
                affected_resources: alert.affectedResources,
                financial_impact: alert.financialImpact,
                recommended_actions: alert.recommendedActions,
                correlated_events: alert.correlatedEvents,
                ai_insights: alert.aiInsights,
              },
              is_read: false,
            });

          if (!insertError) {
            totalAlertsCreated++;
            console.log(`Created intelligent alert: ${alert.title}`);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        organizations_analyzed: orgs?.length || 0,
        alerts_created: totalAlertsCreated,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Intelligent alerts analyzer error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function analyzeWithAI(awsData: AWSDataContext, apiKey: string) {
  try {
    const prompt = `Analyze the following real AWS infrastructure data and generate intelligent alerts for critical issues that require immediate attention.

DATA CONTEXT:
- Cost Anomalies: ${JSON.stringify(awsData.costAnomalies.slice(0, 5))}
- Security Findings: ${JSON.stringify(awsData.securityFindings.slice(0, 5))}
- Waste Detection: ${JSON.stringify(awsData.wasteDetection.slice(0, 5))}
- Compliance Issues: ${JSON.stringify(awsData.complianceIssues.slice(0, 5))}

REQUIREMENTS:
1. Identify the most critical issues that require immediate action
2. Correlate related events (e.g., security vulnerability + cost anomaly on same resource)
3. Calculate real financial impact from the data
4. Generate specific, actionable recommendations
5. Prioritize by severity: critical > high > medium

Return a JSON array of alerts with this structure:
{
  "alerts": [
    {
      "type": "cost_spike|security_critical|waste_detected|compliance_violation|correlated_incident",
      "title": "Brief, clear title describing the issue",
      "message": "Detailed explanation with context and impact",
      "severity": "critical|high|medium",
      "affectedResources": ["resource-id-1", "resource-id-2"],
      "financialImpact": "$X,XXX/month" or null,
      "recommendedActions": ["Action 1", "Action 2", "Action 3"],
      "correlatedEvents": ["Event 1", "Event 2"],
      "aiInsights": "Brief AI analysis connecting the dots"
    }
  ]
}

Focus on real business impact and actionable insights. Maximum 5 most critical alerts.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_tokens: 4000,
        messages: [
          {
            role: 'system',
            content: 'You are an expert AWS infrastructure analyst. Analyze real data and generate actionable intelligence alerts. Return ONLY valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('AI API error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('No content in AI response');
      return null;
    }

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*"alerts"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No valid JSON found in AI response');
      return null;
    }

    const analysis = JSON.parse(jsonMatch[0]);
    console.log(`AI generated ${analysis.alerts?.length || 0} alerts`);
    return analysis;

  } catch (error) {
    console.error('AI analysis error:', error);
    return null;
  }
}
