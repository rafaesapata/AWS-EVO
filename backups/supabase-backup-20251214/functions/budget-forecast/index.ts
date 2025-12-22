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
    const { months = 3 } = await req.json();
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }
    
    // Create service client for database operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get authenticated user from JWT
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    
    if (userError || !user) {
      console.error('Authentication error:', userError);
      throw new Error('User not authenticated');
    }

    console.log(`Authenticated user: ${user.id}`);

    // Get user's organization
    const { data: organizationId, error: orgError } = await supabaseClient.rpc(
      'get_user_organization',
      { _user_id: user.id }
    );

    if (orgError || !organizationId) {
      console.error('Organization error:', orgError);
      throw new Error('Organization not found');
    }

    console.log(`User organization: ${organizationId}`);

    console.log(`Generating budget forecast for ${months} months...`);

    // Get historical cost data from daily_costs table (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    const { data: historicalData, error: historyError } = await supabaseClient
      .from('daily_costs')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('cost_date', ninetyDaysAgo.toISOString().split('T')[0])
      .order('cost_date', { ascending: true });

    if (historyError) {
      console.error('Error fetching historical data:', historyError);
      throw historyError;
    }

    // Require real historical data
    if (!historicalData || historicalData.length < 7) {
      throw new Error('Dados históricos insuficientes. Execute o carregamento de custos primeiro (mínimo 7 dias).');
    }

    // Get current recommendations for user's organization
    const { data: recommendations, error: recError } = await supabaseClient
      .from('cost_recommendations')
      .select('projected_savings_monthly, projected_savings_yearly, title, priority')
      .eq('organization_id', organizationId)
      .eq('status', 'pending');
    
    if (recError) {
      console.error('Error fetching recommendations:', recError);
      throw recError;
    }

    console.log(`Found ${recommendations?.length || 0} pending recommendations`);
    if (recommendations && recommendations.length > 0) {
      console.log('Recommendations data:', JSON.stringify(recommendations.slice(0, 3)));
    }

    // Prepare data for AI analysis from daily_costs
    const timeSeriesData = historicalData.map(d => ({
      date: d.cost_date,
      total_cost: d.total_cost || 0,
      service_breakdown: d.service_breakdown || {},
      cost_by_region: d.cost_by_region || {}
    }));

    // Calculate current average monthly cost
    const totalHistoricalCost = historicalData.reduce((sum, d) => sum + (d.total_cost || 0), 0);
    const avgMonthlyCost = totalHistoricalCost / (historicalData.length / 30); // Convert daily to monthly average
    
    console.log(`Average monthly cost: $${avgMonthlyCost.toFixed(2)}`);
    
    // Sum all potential savings from recommendations
    const rawPotentialSavings = (recommendations || [])
      .reduce((sum, rec) => {
        const monthly = Number(rec.projected_savings_monthly) || 0;
        return sum + monthly;
      }, 0);
    
    console.log(`Raw potential savings: $${rawPotentialSavings.toFixed(2)}/month`);
    
    // Apply realistic cap: maximum 40% savings of current costs
    // (It's unrealistic to save more than 40% of total infrastructure costs)
    const maxRealisticSavings = avgMonthlyCost * 0.40;
    const totalPotentialSavings = Math.min(rawPotentialSavings, maxRealisticSavings);
    
    if (rawPotentialSavings > maxRealisticSavings) {
      console.warn(`Capped potential savings from $${rawPotentialSavings.toFixed(2)} to $${totalPotentialSavings.toFixed(2)} (40% of avg monthly cost)`);
    }
    
    console.log(`Final potential savings: $${totalPotentialSavings.toFixed(2)}/month (${((totalPotentialSavings / avgMonthlyCost) * 100).toFixed(1)}% of current costs)`);
    
    if (totalPotentialSavings === 0 && recommendations && recommendations.length > 0) {
      console.warn('WARNING: Found recommendations but total savings is 0. Check projected_savings_monthly values.');
    }

    // Use Lovable AI for ML-based forecasting
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const forecastPrompt = `Você é um especialista em previsão financeira e análise de séries temporais para AWS FinOps.

Dados históricos dos últimos ${historicalData.length} dias:
${JSON.stringify(timeSeriesData.slice(0, 30), null, 2)}

Economia potencial identificada: $${totalPotentialSavings.toFixed(2)}/mês de ${recommendations?.length || 0} recomendações pendentes

Tarefa: Gere uma previsão de custos AWS para os próximos ${months} meses considerando:
1. Tendências históricas de gastos
2. Sazonalidade (se detectável)
3. Economia potencial das recomendações pendentes
4. Taxa de crescimento observada

Retorne um JSON com:
{
  "forecast": [
    {
      "month": "2025-01",
      "projected_cost": 15000,
      "confidence_level": "high",
      "lower_bound": 14000,
      "upper_bound": 16000
    }
  ],
  "insights": [
    "Tendência de crescimento de X% ao mês detectada",
    "Implementar recomendações pode reduzir custo em Y%"
  ],
  "recommendations": [
    "Implementar economia prioritária Z para reduzir projeção"
  ]
}

Seja preciso, baseie-se nos dados históricos e forneça intervalos de confiança realistas.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Você é um especialista em ML para previsão financeira de custos AWS. Sempre retorne JSONs válidos e bem formatados.' },
          { role: 'user', content: forecastPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API Error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    let forecastData;
    
    try {
      // Try to extract JSON from the response
      const content = aiData.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      forecastData = jsonMatch ? JSON.parse(jsonMatch[0]) : { forecast: [], insights: [], recommendations: [] };
    } catch (e) {
      console.error('Error parsing AI response:', e);
      forecastData = { forecast: [], insights: [], recommendations: [] };
    }

    console.log('AI forecast generated successfully');

    // Save forecast to database
    const forecastRecord = {
      organization_id: organizationId,
      forecast_months: months,
      historical_days: historicalData.length,
      potential_monthly_savings: Number(totalPotentialSavings.toFixed(2)),
      forecast_data: forecastData.forecast || [],
      insights: forecastData.insights || [],
      recommendations: forecastData.recommendations || []
    };
    
    console.log('Saving forecast with potential savings:', forecastRecord.potential_monthly_savings);

    const { data: savedForecast, error: saveError } = await supabaseClient
      .from('budget_forecasts')
      .insert(forecastRecord)
      .select()
      .single();

    if (saveError) {
      console.error('Error saving forecast:', saveError);
      // Continue even if save fails
    } else {
      console.log('Forecast saved successfully with ID:', savedForecast.id);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        historical_days: historicalData.length,
        forecast_months: months,
        potential_monthly_savings: Number(totalPotentialSavings.toFixed(2)),
        ...forecastData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in budget-forecast:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
