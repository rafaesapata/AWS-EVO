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
    console.log('Detecting lateral movement for account:', accountId);

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

    // Get recent CloudTrail events
    const { data: events } = await supabase
      .from('findings')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('event_time', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('event_time', { ascending: true })
      .limit(5000);

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No events found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analyzing ${events.length} events for lateral movement`);

    // Group events by source identity and time windows
    const suspiciousPatterns: any[] = [];
    const eventsByIdentity = new Map<string, any[]>();

    events.forEach(event => {
      const userIdentity = typeof event.user_identity === 'string' 
        ? JSON.parse(event.user_identity) 
        : event.user_identity;
      
      const identity = userIdentity?.principalId || userIdentity?.userName || 'unknown';
      
      if (!eventsByIdentity.has(identity)) {
        eventsByIdentity.set(identity, []);
      }
      
      eventsByIdentity.get(identity)!.push(event);
    });

    // Detect lateral movement patterns
    for (const [identity, userEvents] of eventsByIdentity.entries()) {
      // Pattern 1: Rapid role assumption
      const roleAssumptions = userEvents.filter(e => 
        e.event_name === 'AssumeRole' || e.event_name === 'AssumeRoleWithSAML'
      );

      if (roleAssumptions.length >= 3) {
        const timeSpan = new Date(roleAssumptions[roleAssumptions.length - 1].event_time).getTime() -
                        new Date(roleAssumptions[0].event_time).getTime();
        
        if (timeSpan < 60 * 60 * 1000) { // Within 1 hour
          suspiciousPatterns.push({
            identity,
            pattern: 'rapid_role_assumption',
            events: roleAssumptions,
            timeSpan,
          });
        }
      }

      // Pattern 2: Cross-account access
      const crossAccountEvents = userEvents.filter(e => {
        const details = typeof e.details === 'string' ? JSON.parse(e.details) : e.details;
        return details?.recipientAccountId && details.recipientAccountId !== credentials.account_id;
      });

      if (crossAccountEvents.length > 0) {
        suspiciousPatterns.push({
          identity,
          pattern: 'cross_account_access',
          events: crossAccountEvents,
        });
      }

      // Pattern 3: Privilege escalation attempts
      const escalationEvents = userEvents.filter(e =>
        e.event_name.includes('AttachUserPolicy') ||
        e.event_name.includes('PutUserPolicy') ||
        e.event_name.includes('CreateAccessKey') ||
        e.event_name.includes('UpdateAssumeRolePolicy')
      );

      if (escalationEvents.length >= 2) {
        suspiciousPatterns.push({
          identity,
          pattern: 'privilege_escalation',
          events: escalationEvents,
        });
      }
    }

    console.log(`Found ${suspiciousPatterns.length} suspicious patterns`);

    // Analyze with AI
    const detections = [];

    for (const pattern of suspiciousPatterns) {
      const prompt = `Analyze this potential lateral movement pattern:

Source Identity: ${pattern.identity}
Pattern Type: ${pattern.pattern}
Number of Events: ${pattern.events.length}
${pattern.timeSpan ? `Time Span: ${Math.round(pattern.timeSpan / 60000)} minutes` : ''}

Events:
${pattern.events.map((e: any, i: number) => 
  `${i + 1}. ${e.event_name} at ${e.event_time} from ${e.details?.sourceIPAddress || 'unknown'}`
).join('\n')}

Determine:
1. Is this likely a lateral movement attack?
2. Severity level
3. Confidence score
4. Attack indicators
5. Recommended response`;

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
                content: 'You are a cybersecurity expert specializing in detecting lateral movement and advanced persistent threats in cloud environments.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            tools: [{
              type: 'function',
              function: {
                name: 'analyze_lateral_movement',
                description: 'Analyze potential lateral movement and determine threat level',
                parameters: {
                  type: 'object',
                  properties: {
                    is_lateral_movement: { type: 'boolean' },
                    severity: { 
                      type: 'string',
                      enum: ['low', 'medium', 'high', 'critical']
                    },
                    confidence: { 
                      type: 'number',
                      description: 'Confidence score 0-1'
                    },
                    target_resources: {
                      type: 'array',
                      items: { type: 'string' }
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
                  required: ['is_lateral_movement', 'severity', 'confidence'],
                  additionalProperties: false
                }
              }
            }],
            tool_choice: { type: 'function', function: { name: 'analyze_lateral_movement' } }
          }),
        });

        if (!aiResponse.ok) {
          console.error('AI API error:', await aiResponse.text());
          continue;
        }

        const aiResult = await aiResponse.json();
        const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
        
        if (!toolCall) continue;

        const analysis = JSON.parse(toolCall.function.arguments);

        if (analysis.is_lateral_movement && analysis.confidence > 0.5) {
          detections.push({
            organization_id: organizationId,
            aws_account_id: accountId,
            source_identity: pattern.identity,
            source_resource: pattern.events[0]?.details?.sourceIPAddress,
            target_resources: analysis.target_resources || [],
            movement_pattern: pattern.pattern,
            severity: analysis.severity,
            detection_confidence: analysis.confidence,
            timeline: pattern.events.map((e: any) => ({
              eventName: e.event_name,
              eventTime: e.event_time,
              sourceIP: e.details?.sourceIPAddress,
            })),
            indicators: analysis.indicators || [],
            status: 'active',
          });
        }

      } catch (aiError) {
        console.error('AI analysis error:', aiError);
        continue;
      }
    }

    // Store detections
    if (detections.length > 0) {
      const { error: insertError } = await supabase
        .from('lateral_movement_detections')
        .insert(detections);

      if (insertError) {
        console.error('Error inserting detections:', insertError);
        throw insertError;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        patterns_analyzed: suspiciousPatterns.length,
        lateral_movements_detected: detections.length,
        critical: detections.filter(d => d.severity === 'critical').length,
        high: detections.filter(d => d.severity === 'high').length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Lateral movement detection error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});