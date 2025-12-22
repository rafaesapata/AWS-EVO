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
    const { events, accountId } = await req.json();
    console.info('Analyzing CloudTrail events:', events?.length || 0);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.info('✅ Authenticated user:', user.id);

    const { data: organizationId, error: orgError } = await supabaseAdmin.rpc('get_user_organization', { _user_id: user.id });
    if (orgError || !organizationId) {
      return new Response(
        JSON.stringify({ error: 'Organization not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.info('🏢 User organization:', organizationId);

    // Delete existing cloudtrail findings to avoid accumulation
    let deleteQuery = supabaseAdmin
      .from('findings')
      .delete()
      .eq('organization_id', organizationId)
      .eq('source', 'cloudtrail');
    
    // Filter by account if provided
    if (accountId) {
      deleteQuery = deleteQuery.contains('details', { aws_account_id: accountId });
    }
    
    const { error: deleteError } = await deleteQuery;
    
    if (!deleteError) {
      console.info('🗑️ Cleared existing CloudTrail findings');
    }

    // Limit events per batch to avoid timeout - process in parallel batches
    const MAX_EVENTS_PER_BATCH = 20;
    const eventsToAnalyze = (events || []).slice(0, MAX_EVENTS_PER_BATCH);
    console.info(`📊 Will analyze ${eventsToAnalyze.length} of ${events?.length || 0} events`);

    const analyzeEvent = async (event: any) => {
      try {
        const eventId = event.EventId || event.eventID || crypto.randomUUID();
        const eventName = event.EventName || event.eventName || 'unknown';
        const userIdentity = event.UserIdentity || event.userIdentity || {};
        
        let eventTime: string;
        const rawEventTime = event.EventTime || event.eventTime;
        if (!rawEventTime) {
          eventTime = new Date().toISOString();
        } else if (typeof rawEventTime === 'string') {
          const parsed = new Date(rawEventTime);
          eventTime = isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
        } else if (typeof rawEventTime === 'number') {
          const ts = rawEventTime > 1e12 ? rawEventTime : rawEventTime * 1000;
          eventTime = new Date(ts).toISOString();
        } else {
          eventTime = new Date().toISOString();
        }
        
        console.info('Analyzing event:', eventName, 'at', eventTime);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'system',
                content: 'Analise eventos CloudTrail e identifique riscos. Responda em JSON.'
              },
              {
                role: 'user',
                content: `Analise: ${eventName} por ${userIdentity?.userName || userIdentity?.type || 'unknown'}. Responda JSON: {"severity":"critical|high|medium|low","description":"descrição","analysis":"análise"}`
              }
            ],
          }),
        });
        
        clearTimeout(timeoutId);

        if (!aiResponse.ok) {
          return null;
        }

        const aiData = await aiResponse.json();
        const aiContent = aiData.choices?.[0]?.message?.content || '{}';
        
        let aiResult;
        try {
          const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/) || aiContent.match(/\{[\s\S]*\}/);
          const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiContent;
          aiResult = JSON.parse(jsonStr);
        } catch {
          aiResult = { severity: 'medium', description: 'Evento requer análise', analysis: aiContent };
        }

        const { data: finding, error } = await supabaseAdmin
          .from('findings')
          .insert({
            organization_id: organizationId,
            event_id: eventId,
            event_name: eventName,
            event_time: eventTime,
            user_identity: userIdentity,
            severity: aiResult.severity || 'medium',
            description: aiResult.description || eventName,
            details: { ...event, aws_account_id: accountId },
            ai_analysis: aiResult.analysis || '',
            status: 'pending',
            source: 'cloudtrail'
          })
          .select()
          .single();

        if (error) {
          return null;
        }
        
        return finding;
      } catch {
        return null;
      }
    };

    const startTime = Date.now();
    const results = await Promise.all(eventsToAnalyze.map(analyzeEvent));
    const analyzedFindings = results.filter(Boolean);
    const executionTime = Math.round((Date.now() - startTime) / 1000);

    // Count severity levels
    const criticalCount = analyzedFindings.filter((f: any) => f?.severity === 'critical').length;
    const highCount = analyzedFindings.filter((f: any) => f?.severity === 'high').length;
    const mediumCount = analyzedFindings.filter((f: any) => f?.severity === 'medium').length;
    const lowCount = analyzedFindings.filter((f: any) => f?.severity === 'low').length;

    // Save scan history
    await supabaseAdmin
      .from('cloudtrail_scans_history')
      .insert({
        organization_id: organizationId,
        aws_account_id: accountId || null,
        status: 'completed',
        total_events: events?.length || 0,
        analyzed_events: analyzedFindings.length,
        critical_count: criticalCount,
        high_count: highCount,
        medium_count: mediumCount,
        low_count: lowCount,
        execution_time_seconds: executionTime,
        message: `Analisados ${analyzedFindings.length} de ${events?.length || 0} eventos`,
        findings_summary: { events: analyzedFindings.map((f: any) => ({ id: f?.id, severity: f?.severity, event_name: f?.event_name })) }
      });

    console.info(`✅ Successfully analyzed ${analyzedFindings.length} events in ${executionTime}s`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        findings: analyzedFindings,
        analyzed: analyzedFindings.length,
        total: events?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
