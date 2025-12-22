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
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: organizationId, error: orgError } = await supabaseAdmin.rpc(
      'get_user_organization',
      { _user_id: user.id }
    );

    if (orgError || !organizationId) {
      throw new Error('Organization not found');
    }

    console.log(`✅ User authenticated: ${user.id}, Organization: ${organizationId}`);

    const { recommendationId, scriptType } = await req.json();
    console.log(`Generating ${scriptType} remediation script for recommendation ${recommendationId}`);

    // Get recommendation details (filtered by organization)
    const { data: recommendation, error: recError } = await supabaseClient
      .from('cost_recommendations')
      .select('*')
      .eq('id', recommendationId)
      .eq('organization_id', organizationId)
      .single();

    if (recError || !recommendation) {
      throw new Error('Recommendation not found');
    }

    // Use Lovable AI to generate remediation script
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const scriptPrompt = `Gere um script ${scriptType === 'terraform' ? 'Terraform' : 'AWS CLI'} para implementar a seguinte recomendação de otimização AWS:

Tipo: ${recommendation.recommendation_type}
Título: ${recommendation.title}
Descrição: ${recommendation.description}
Serviço: ${recommendation.service}
Região: ${recommendation.current_region}
Recurso: ${recommendation.resource_id}

Detalhes: ${JSON.stringify(recommendation.details)}

O script deve:
1. Ser seguro e incluir validações
2. Ter rollback em caso de erro
3. Incluir comentários explicativos
4. Seguir best practices AWS
5. Ser idempotente (pode ser executado múltiplas vezes)

${scriptType === 'terraform' ? 'Use Terraform HCL com providers AWS atualizados.' : 'Use AWS CLI v2 com bash script.'}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Você é um especialista em Infrastructure as Code e AWS. Sempre gere scripts seguros, testados e com best practices.' },
          { role: 'user', content: scriptPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API Error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const script = aiData.choices[0].message.content;

    // Update recommendation with generated script
    const { error: updateError } = await supabaseClient
      .from('cost_recommendations')
      .update({
        remediation_script: script,
        updated_at: new Date().toISOString(),
      })
      .eq('id', recommendationId);

    if (updateError) {
      console.error('Error updating recommendation:', updateError);
    }

    console.log('Remediation script generated successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        script,
        script_type: scriptType,
        recommendation_id: recommendationId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-remediation-script:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
