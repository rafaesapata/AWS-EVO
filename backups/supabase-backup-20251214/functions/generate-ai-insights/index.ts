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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { organizationId } = await req.json();

    console.log('🔍 Generating insights for organization:', organizationId);

    // Buscar dados recentes com filtro correto
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [costsData, findingsData, recommendationsData, securityPosture] = await Promise.all([
      supabase.from('daily_costs')
        .select('cost_date, total_cost, service_breakdown, compared_to_yesterday')
        .eq('organization_id', organizationId)
        .gte('cost_date', thirtyDaysAgo)
        .order('cost_date', { ascending: false })
        .limit(30),
      
      supabase.from('findings')
        .select('severity, event_name, description, status')
        .eq('organization_id', organizationId)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false }),
      
      supabase.from('cost_recommendations')
        .select('recommendation_type, title, projected_savings_monthly, projected_savings_yearly, priority, service')
        .eq('organization_id', organizationId)
        .eq('status', 'pending')
        .order('projected_savings_yearly', { ascending: false })
        .limit(10),

      supabase.from('security_posture')
        .select('overall_score, critical_findings, high_findings, trend')
        .eq('organization_id', organizationId)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    console.log('📊 Data fetched:', {
      costs: costsData.data?.length,
      findings: findingsData.data?.length,
      recommendations: recommendationsData.data?.length,
      securityPosture: !!securityPosture.data
    });

    // Calcular métricas agregadas
    const totalCosts = costsData.data?.reduce((sum, c) => sum + Number(c.total_cost || 0), 0) || 0;
    const avgDailyCost = costsData.data?.length ? totalCosts / costsData.data.length : 0;
    const recentCosts = costsData.data?.slice(0, 7) || [];
    const olderCosts = costsData.data?.slice(7, 14) || [];
    const recentAvg = recentCosts.reduce((sum, c) => sum + Number(c.total_cost || 0), 0) / (recentCosts.length || 1);
    const olderAvg = olderCosts.reduce((sum, c) => sum + Number(c.total_cost || 0), 0) / (olderCosts.length || 1);
    const costTrend = ((recentAvg - olderAvg) / olderAvg * 100).toFixed(1);

    const criticalFindings = findingsData.data?.filter(f => f.severity === 'critical').length || 0;
    const highFindings = findingsData.data?.filter(f => f.severity === 'high').length || 0;
    const totalSavingsPotential = recommendationsData.data?.reduce((sum, r) => sum + Number(r.projected_savings_monthly || 0), 0) || 0;

    // Criar contexto rico para a IA
    const prompt = `Analise os seguintes dados REAIS de AWS e gere insights ACIONÁVEIS e ESPECÍFICOS:

📊 CUSTOS (últimos 30 dias):
- Total acumulado: $${totalCosts.toFixed(2)}
- Custo médio diário: $${avgDailyCost.toFixed(2)}
- Tendência: ${costTrend}% (últimos 7 dias vs 7 dias anteriores)
- Dias com dados: ${costsData.data?.length || 0}
${costsData.data?.slice(0, 5).map(c => `  • ${c.cost_date}: $${Number(c.total_cost).toFixed(2)} ${c.compared_to_yesterday ? `(${c.compared_to_yesterday > 0 ? '+' : ''}${c.compared_to_yesterday}% vs dia anterior)` : ''}`).join('\n')}

🛡️ SEGURANÇA (últimos 7 dias):
- Score geral: ${securityPosture.data?.overall_score || 'N/A'}/100
- Findings críticos: ${criticalFindings}
- Findings altos: ${highFindings}
- Total de findings: ${findingsData.data?.length || 0}
- Tendência: ${securityPosture.data?.trend || 'N/A'}
${findingsData.data?.slice(0, 3).map(f => `  • [${f.severity}] ${f.event_name}: ${f.description?.substring(0, 80)}...`).join('\n')}

💰 OPORTUNIDADES DE ECONOMIA:
- Potencial de economia mensal: $${totalSavingsPotential.toFixed(2)}
- Recomendações pendentes: ${recommendationsData.data?.length || 0}
${recommendationsData.data?.slice(0, 3).map(r => `  • ${r.title} (${r.service}): $${Number(r.projected_savings_monthly || 0).toFixed(2)}/mês`).join('\n')}

IMPORTANTE: 
- Se não houver dados suficientes, mencione isso explicitamente
- Seja específico com números e serviços reais dos dados
- Priorize insights com maior impacto financeiro ou de segurança
- Sugira ações concretas e imediatas`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Você é um especialista em FinOps e AWS. Gere insights acionáveis em JSON com campos: type, title, summary, actions (array), priority.' },
          { role: 'user', content: prompt }
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_insights",
            description: "Generate actionable insights",
            parameters: {
              type: "object",
              properties: {
                insights: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string" },
                      title: { type: "string" },
                      summary: { type: "string" },
                      actions: { type: "array", items: { type: "string" } },
                      priority: { type: "number" }
                    },
                    required: ["type", "title", "summary", "actions", "priority"]
                  }
                }
              },
              required: ["insights"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "generate_insights" } }
      }),
    });

    if (!aiResponse.ok) {
      console.error('AI Error:', await aiResponse.text());
      throw new Error('AI generation failed');
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices[0]?.message?.tool_calls?.[0];
    const insightsData = JSON.parse(toolCall?.function?.arguments || '{"insights":[]}');

    // Salvar insights no banco
    const insertPromises = insightsData.insights.map((insight: any) => 
      supabase.from('ai_insights').insert({
        organization_id: organizationId,
        insight_type: insight.type,
        title: insight.title,
        summary: insight.summary,
        details: insight.summary,
        priority: insight.priority,
        actions: insight.actions,
        confidence_score: 0.85,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
    );

    await Promise.all(insertPromises);

    return new Response(JSON.stringify({ 
      success: true, 
      insights: insightsData.insights 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});