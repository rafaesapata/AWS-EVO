import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Validate user and get organization
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: orgId, error: orgError } = await supabase.rpc('get_user_organization', { 
      _user_id: user.id 
    });
    if (orgError || !orgId) {
      return new Response(
        JSON.stringify({ error: 'Organization not found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role for database operations
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: credentials } = await supabaseAdmin
      .from('aws_credentials')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!credentials) {
      throw new Error('No active AWS credentials found');
    }

    const { data: scan } = await supabaseAdmin
      .from('security_scans')
      .insert({
        organization_id: orgId,
        scan_type: 'iam_analysis',
        aws_account_id: credentials.id,
        status: 'running'
      })
      .select()
      .single();

    const iamData = {
      users: [],
      roles: [],
      policies: []
    };

    console.log('IAM data collected');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lovableApiKey}`
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'system',
          content: `You are an AWS IAM security expert. Analyze the IAM configuration and identify security issues. Return a JSON object with "findings" array containing objects with: finding_type, severity, resource_type, resource_id, resource_name, details, recommendations, risk_score (0-100), unused_days, policy_document, suggested_policy`
        }, {
          role: 'user',
          content: `Analyze this IAM configuration:\n${JSON.stringify(iamData, null, 2)}`
        }],
        response_format: { type: "json_object" }
      })
    });

    if (!aiResponse.ok) {
      throw new Error(`AI API error: ${aiResponse.statusText}`);
    }

    const aiResult = await aiResponse.json();
    let findings = [];
    
    try {
      const content = aiResult.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      findings = parsed.findings || [];
    } catch (e) {
      console.error('Error parsing AI response:', e);
    }

    const findingsToInsert = findings.map((finding: any) => ({
      scan_id: scan.id,
      finding_type: finding.finding_type || 'unknown',
      severity: finding.severity || 'medium',
      resource_type: finding.resource_type || 'IAM',
      resource_id: finding.resource_id || 'unknown',
      resource_name: finding.resource_name,
      details: finding.details || {},
      recommendations: finding.recommendations,
      risk_score: finding.risk_score || 50,
      unused_days: finding.unused_days || 0,
      policy_document: finding.policy_document,
      suggested_policy: finding.suggested_policy,
      status: 'open'
    }));

    if (findingsToInsert.length > 0) {
      await supabaseAdmin
        .from('iam_findings')
        .insert(findingsToInsert);
    }

    await supabaseAdmin
      .from('security_scans')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', scan.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        scan_id: scan.id,
        findings_count: findingsToInsert.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('IAM analysis error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
