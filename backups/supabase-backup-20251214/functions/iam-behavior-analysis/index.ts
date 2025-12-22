import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    // Create authenticated client
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Get user's organization using service client
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: organizationId, error: orgError } = await supabase.rpc(
      'get_user_organization',
      { _user_id: user.id }
    );

    if (orgError || !organizationId) {
      throw new Error('Organization not found');
    }

    console.log(`✅ User authenticated: ${user.id}, Organization: ${organizationId}`);

    const { accountId } = await req.json();
    console.log('Running IAM Behavior Analysis for account:', accountId);

    // Get credentials (validated for organization ownership)
    const { data: credentials, error: credError } = await supabase
      .from('aws_credentials')
      .select('*')
      .eq('id', accountId)
      .eq('organization_id', organizationId)
      .single();

    if (credError || !credentials) {
      throw new Error('AWS credentials not found or access denied');
    }

    // Get CloudTrail events (last 30 days)
    const { data: events } = await supabase
      .from('findings')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('event_time', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('event_time', { ascending: false })
      .limit(1000);

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No CloudTrail events found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analyzing ${events.length} CloudTrail events`);

    // Group events by user identity
    const userActions = new Map<string, any[]>();
    
    events.forEach(event => {
      const userIdentity = typeof event.user_identity === 'string' 
        ? JSON.parse(event.user_identity) 
        : event.user_identity;
      
      const userId = userIdentity?.principalId || userIdentity?.userName || 'unknown';
      
      if (!userActions.has(userId)) {
        userActions.set(userId, []);
      }
      
      userActions.get(userId)!.push({
        eventName: event.event_name,
        eventTime: event.event_time,
        sourceIP: event.details?.sourceIPAddress,
        userAgent: event.details?.userAgent,
        errorCode: event.details?.errorCode,
      });
    });

    console.log(`Analyzing ${userActions.size} unique users`);

    const analysisResults = [];

    for (const [userId, actions] of userActions.entries()) {
      // Build baseline of normal actions
      const actionCounts = new Map<string, number>();
      const ipAddresses = new Set<string>();
      const userAgents = new Set<string>();
      const timeDistribution: number[] = new Array(24).fill(0);

      actions.forEach(action => {
        actionCounts.set(action.eventName, (actionCounts.get(action.eventName) || 0) + 1);
        if (action.sourceIP) ipAddresses.add(action.sourceIP);
        if (action.userAgent) userAgents.add(action.userAgent);
        
        const hour = new Date(action.eventTime).getHours();
        timeDistribution[hour]++;
      });

      const baselineActions = Array.from(actionCounts.entries())
        .map(([action, count]) => ({ action, count, frequency: count / actions.length }))
        .sort((a, b) => b.count - a.count);

      // Use AI to detect anomalies
      const prompt = `Analyze this IAM user behavior for security anomalies:

User: ${userId}
Total Actions: ${actions.length}
Unique IP Addresses: ${ipAddresses.size}
Unique User Agents: ${userAgents.size}

Top Actions:
${baselineActions.slice(0, 10).map(a => `- ${a.action}: ${a.count} times (${(a.frequency * 100).toFixed(1)}%)`).join('\n')}

Time Distribution (hourly):
${timeDistribution.map((count, hour) => `${hour}:00 - ${count} actions`).join('\n')}

Recent Activities (last 10):
${actions.slice(0, 10).map(a => `- ${a.eventName} from ${a.sourceIP || 'unknown'} at ${a.eventTime}`).join('\n')}

Detect anomalies such as:
- Unusual access times
- Multiple failed login attempts
- Privilege escalation attempts
- Data exfiltration patterns
- Lateral movement indicators
- Suspicious IP addresses
- Abnormal API call patterns`;

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
                content: 'You are a cybersecurity expert specializing in IAM behavior analysis and threat detection.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            tools: [{
              type: 'function',
              function: {
                name: 'analyze_iam_behavior',
                description: 'Analyze IAM user behavior and detect security anomalies',
                parameters: {
                  type: 'object',
                  properties: {
                    risk_score: { 
                      type: 'number',
                      description: 'Risk score from 0-100'
                    },
                    has_anomalies: { type: 'boolean' },
                    anomalous_actions: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          action: { type: 'string' },
                          reason: { type: 'string' },
                          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
                        }
                      }
                    },
                    indicators: {
                      type: 'array',
                      items: { type: 'string' }
                    },
                    recommendations: {
                      type: 'array',
                      items: { type: 'string' }
                    }
                  },
                  required: ['risk_score', 'has_anomalies'],
                  additionalProperties: false
                }
              }
            }],
            tool_choice: { type: 'function', function: { name: 'analyze_iam_behavior' } }
          }),
        });

        if (!aiResponse.ok) {
          console.error('AI API error:', await aiResponse.text());
          continue;
        }

        const aiResult = await aiResponse.json();
        const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
        
        if (!toolCall) {
          continue;
        }

        const analysis = JSON.parse(toolCall.function.arguments);

        analysisResults.push({
          organization_id: organizationId,
          aws_account_id: accountId,
          user_identity: userId,
          user_type: userId.includes('assumed-role') ? 'assumed-role' : 'iam-user',
          baseline_actions: baselineActions.slice(0, 20),
          anomalous_actions: analysis.anomalous_actions || [],
          risk_score: Math.round(analysis.risk_score),
          anomaly_details: {
            has_anomalies: analysis.has_anomalies,
            indicators: analysis.indicators || [],
            recommendations: analysis.recommendations || [],
            unique_ips: ipAddresses.size,
            unique_user_agents: userAgents.size,
            time_distribution: timeDistribution,
          },
          analysis_period: {
            start: actions[actions.length - 1]?.eventTime,
            end: actions[0]?.eventTime,
            total_events: actions.length,
          },
        });

      } catch (aiError) {
        console.error('AI analysis error for user:', userId, aiError);
        continue;
      }
    }

    // Store results
    if (analysisResults.length > 0) {
      const { error: insertError } = await supabase
        .from('iam_behavior_analysis')
        .upsert(analysisResults, {
          onConflict: 'organization_id,aws_account_id,user_identity',
        });

      if (insertError) {
        console.error('Error inserting IAM analysis:', insertError);
        throw insertError;
      }
    }

    const highRiskUsers = analysisResults.filter(r => r.risk_score >= 70);
    const mediumRiskUsers = analysisResults.filter(r => r.risk_score >= 40 && r.risk_score < 70);

    return new Response(
      JSON.stringify({
        success: true,
        analyzed_users: analysisResults.length,
        high_risk_users: highRiskUsers.length,
        medium_risk_users: mediumRiskUsers.length,
        anomalies_detected: analysisResults.filter(r => r.anomaly_details.has_anomalies).length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('IAM Behavior Analysis error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});