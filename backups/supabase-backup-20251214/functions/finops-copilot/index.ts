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
    const { message, sessionId } = await req.json();

    // Get user authentication
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // CRITICAL: Get organization from authenticated user
    const { data: organizationId, error: orgError } = await supabaseClient.rpc('get_user_organization', { _user_id: user.id });
    if (orgError || !organizationId) {
      throw new Error('Organization not found for user');
    }

    console.log('FinOps Copilot received message:', message, 'for org:', organizationId);

    // Save user message to history with user_id and organization_id
    await supabaseClient.from('chat_history').insert({
      user_id: user.id,
      session_id: sessionId,
      role: 'user',
      content: message
    });

    // Get recent chat history for context
    const { data: history } = await supabaseClient
      .from('chat_history')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(10);

    // Get current month date range
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    
    // Get relevant context from database - CRITICAL: Filter by organization_id
    const [costRecsResult, findingsResult, ticketsResult, dailyCostsResult, riSpResult, anomaliesResult] = await Promise.all([
      supabaseClient
        .from('cost_recommendations')
        .select('*')
        .eq('organization_id', organizationId)
        .order('projected_savings_yearly', { ascending: false })
        .limit(10),
      supabaseClient
        .from('findings')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10),
      supabaseClient
        .from('remediation_tickets')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabaseClient
        .from('daily_costs')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('cost_date', firstDayOfMonth)
        .order('cost_date', { ascending: false })
        .limit(100),
      supabaseClient
        .from('ri_sp_recommendations')
        .select('*')
        .eq('organization_id', organizationId)
        .order('yearly_savings', { ascending: false })
        .limit(5),
      supabaseClient
        .from('cost_anomalies')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .order('detected_at', { ascending: false })
        .limit(5)
    ]);

    const costRecs = costRecsResult.data || [];
    const findings = findingsResult.data || [];
    const tickets = ticketsResult.data || [];
    const dailyCosts = dailyCostsResult.data || [];
    const riSpRecs = riSpResult.data || [];
    const anomalies = anomaliesResult.data || [];

    // Calculate totals from actual data
    const totalPotentialSavings = costRecs.reduce((sum, rec) => sum + (rec.projected_savings_monthly || 0), 0);
    const totalRiSpSavings = riSpRecs.reduce((sum, rec) => sum + (rec.monthly_savings || 0), 0);
    const criticalFindings = findings.filter(f => f.severity === 'critical').length;
    const highFindings = findings.filter(f => f.severity === 'high').length;
    const pendingTickets = tickets.filter(t => t.status === 'pending').length;
    const currentMonthCost = dailyCosts.reduce((sum, d) => sum + (Number(d.total_cost) || 0), 0);
    
    // Calculate service breakdown for the month
    const serviceBreakdown: Record<string, number> = {};
    dailyCosts.forEach(d => {
      if (d.service_breakdown) {
        Object.entries(d.service_breakdown).forEach(([service, cost]) => {
          serviceBreakdown[service] = (serviceBreakdown[service] || 0) + (Number(cost) || 0);
        });
      }
    });
    
    // Get top 5 services by cost
    const topServices = Object.entries(serviceBreakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([service, cost]) => ({ service, cost }));

    // Build context for AI
    const contextData = {
      summary: {
        current_month_total_cost: currentMonthCost,
        total_potential_cost_savings_monthly: totalPotentialSavings,
        total_ri_sp_savings_monthly: totalRiSpSavings,
        total_combined_savings_opportunity: totalPotentialSavings + totalRiSpSavings,
        critical_security_findings: criticalFindings,
        high_security_findings: highFindings,
        pending_remediation_tickets: pendingTickets,
        active_anomalies: anomalies.length,
        days_in_month: dailyCosts.length,
        data_available: {
          cost_recommendations: costRecs.length,
          security_findings: findings.length,
          cost_data: dailyCosts.length,
          ri_sp_recommendations: riSpRecs.length,
          anomalies: anomalies.length
        }
      },
      current_month_breakdown: {
        total_cost: currentMonthCost,
        days_analyzed: dailyCosts.length,
        top_services: topServices,
        daily_costs: dailyCosts.slice(0, 7).map(d => ({
          date: d.cost_date,
          total: d.total_cost
        }))
      },
      top_cost_recommendations: costRecs.slice(0, 5).map(rec => ({
        title: rec.title,
        service: rec.service,
        recommendation_type: rec.recommendation_type,
        monthly_savings: rec.projected_savings_monthly,
        yearly_savings: rec.projected_savings_yearly,
        priority: rec.priority
      })),
      ri_sp_recommendations: riSpRecs.map(rec => ({
        type: rec.recommendation_type,
        service: rec.service,
        monthly_savings: rec.monthly_savings,
        yearly_savings: rec.yearly_savings,
        break_even_months: rec.break_even_months
      })),
      security_findings: findings.slice(0, 5).map(f => ({
        event: f.event_name,
        severity: f.severity,
        description: f.description,
        status: f.status
      })),
      cost_anomalies: anomalies.map(a => ({
        service: a.service,
        anomaly_type: a.anomaly_type,
        current_cost: a.current_cost,
        baseline_cost: a.baseline_cost,
        deviation_percentage: a.deviation_percentage,
        severity: a.severity
      })),
      pending_tickets: tickets.slice(0, 5).map(t => ({
        title: t.title,
        type: t.ticket_type,
        priority: t.priority,
        status: t.status
      }))
    };

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const systemPrompt = `Você é o FinOps Copilot da UDS Tecnologia, um assistente especializado em AWS FinOps, otimização de custos e segurança na nuvem.

Seu papel é responder perguntas sobre:
- Custos e otimização de recursos AWS (incluindo breakdown por serviço)
- Economia potencial e recomendações de otimização
- RI/Savings Plans e commitments
- Segurança, compliance e findings
- Status de remediações e tickets
- Tendências de gastos e anomalias
- Best practices AWS Well-Architected

IMPORTANTE: Você tem acesso a dados REAIS e COMPLETOS do ambiente AWS. Use os dados do contexto abaixo para responder com precisão.

Contexto COMPLETO do ambiente AWS (dados reais):
${JSON.stringify(contextData, null, 2)}

DIRETRIZES DE RESPOSTA:
- Sempre use os dados reais fornecidos no contexto
- Forneça números específicos e detalhados quando disponíveis
- Para perguntas sobre custos, mostre breakdown por serviço se relevante
- Mencione o número de dias analisados ao falar de custos mensais
- Se perguntarem sobre savings, mencione TANTO as otimizações de custo QUANTO RI/SP
- Seja conciso mas completo
- Use formatação markdown para melhor legibilidade (listas, tabelas quando apropriado)`;

    // Build messages array for AI
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(history?.map(h => ({ role: h.role, content: h.content })) || []),
      { role: 'user', content: message }
    ];

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: messages,
        stream: false,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API Error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const assistantMessage = aiData.choices[0].message.content;

    // Save assistant response to history
    await supabaseClient.from('chat_history').insert({
      session_id: sessionId,
      role: 'assistant',
      content: assistantMessage
    });

    console.log('FinOps Copilot response generated');

    return new Response(
      JSON.stringify({ 
        response: assistantMessage,
        session_id: sessionId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in finops-copilot:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
