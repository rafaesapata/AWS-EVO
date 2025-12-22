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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    // CRITICAL: Get authorization header to identify user
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Not authenticated' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Create authenticated supabase client
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // CRITICAL: Get user's organization to ensure data isolation
    const { data: organizationId, error: orgError } = await supabaseClient
      .rpc('get_user_organization', { _user_id: user.id });

    if (orgError || !organizationId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Organization not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    console.log('Starting AI prioritization analysis...');

    // CRITICAL: Fetch pending recommendations filtered by organization
    const { data: costRecs, error: costError } = await supabaseClient
      .from('cost_recommendations')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'pending');

    if (costError) throw costError;

    const { data: iamFindings, error: iamError } = await supabaseClient
      .from('iam_findings')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'open');

    if (iamError) throw iamError;

    const { data: findings, error: findingsError } = await supabaseClient
      .from('findings')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'pending');

    if (findingsError) throw findingsError;

    console.log(`Analyzing ${costRecs?.length || 0} cost recommendations, ${iamFindings?.length || 0} IAM findings, ${findings?.length || 0} security findings`);

    // Use Lovable AI to prioritize
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const analysisPrompt = `Você é um especialista em AWS Well-Architected Framework e FinOps. Analise os seguintes achados e recomendações e priorize-os por:
1. Impacto (economia potencial ou risco de segurança)
2. Esforço de implementação
3. Urgência (criticidade)

Retorne uma análise JSON com:
- priority_score (0-100)
- effort_level (low/medium/high)
- business_impact (descrição do impacto nos negócios)
- implementation_order (ordem sugerida)
- quick_wins (boolean - se é vitória rápida)

Dados:
Cost Recommendations: ${JSON.stringify(costRecs?.slice(0, 10) || [])}
IAM Findings: ${JSON.stringify(iamFindings?.slice(0, 10) || [])}
Security Findings: ${JSON.stringify(findings?.slice(0, 10) || [])}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Você é um especialista em AWS Well-Architected Framework e FinOps. Sempre retorne análises detalhadas e acionáveis.' },
          { role: 'user', content: analysisPrompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API Error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const analysis = aiData.choices[0].message.content;

    console.log('AI Analysis completed:', analysis.substring(0, 200));

    // Update recommendations with AI insights
    let updatedCount = 0;
    
    if (costRecs && costRecs.length > 0) {
      for (const rec of costRecs.slice(0, 5)) {
        const { error: updateError } = await supabaseClient
          .from('cost_recommendations')
          .update({
            ai_analysis: analysis,
            priority: 'high', // AI-determined priority
            updated_at: new Date().toISOString(),
          })
          .eq('id', rec.id);

        if (!updateError) updatedCount++;
      }
    }

    console.log(`Updated ${updatedCount} recommendations with AI insights`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        analysis,
        updated_count: updatedCount,
        total_analyzed: (costRecs?.length || 0) + (iamFindings?.length || 0) + (findings?.length || 0)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-prioritization:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
