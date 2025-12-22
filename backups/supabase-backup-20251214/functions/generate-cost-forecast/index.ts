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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Get user's organization
    const { data: organizationId, error: orgError } = await supabaseClient.rpc(
      'get_user_organization',
      { _user_id: user.id }
    );

    if (orgError || !organizationId) {
      throw new Error('Organization not found');
    }

    const { accountId, days = 30 } = await req.json();

    console.log(`Generating cost forecast for account ${accountId}, ${days} days`);

    // Buscar histórico de custos (últimos 60 dias)
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const { data: historicalCosts, error: histError } = await supabaseClient
      .from('daily_costs')
      .select('cost_date, total_cost')
      .eq('aws_account_id', accountId)
      .eq('organization_id', organizationId)
      .gte('cost_date', sixtyDaysAgo.toISOString().split('T')[0])
      .order('cost_date', { ascending: true });

    if (histError) throw histError;

    if (!historicalCosts || historicalCosts.length < 7) {
      return new Response(
        JSON.stringify({ 
          error: 'Insufficient historical data. Need at least 7 days.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calcular tendência linear simples
    const n = historicalCosts.length;
    const costs = historicalCosts.map(c => c.total_cost);
    const avgCost = costs.reduce((a, b) => a + b, 0) / n;
    
    // Calcular slope (taxa de crescimento)
    let sumXY = 0, sumX = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumXY += i * costs[i];
      sumX += i;
      sumX2 += i * i;
    }
    const slope = (n * sumXY - sumX * costs.reduce((a, b) => a + b, 0)) / (n * sumX2 - sumX * sumX);

    // Calcular desvio padrão para intervalo de confiança
    const variance = costs.reduce((sum, cost) => {
      const diff = cost - avgCost;
      return sum + diff * diff;
    }, 0) / n;
    const stdDev = Math.sqrt(variance);

    // Gerar previsões
    const forecasts = [];
    const today = new Date();
    
    for (let i = 1; i <= days; i++) {
      const forecastDate = new Date(today);
      forecastDate.setDate(forecastDate.getDate() + i);
      
      const predictedCost = avgCost + slope * (n + i);
      const confidence = 1.96 * stdDev; // 95% confidence interval
      
      forecasts.push({
        aws_account_id: accountId,
        forecast_date: forecastDate.toISOString().split('T')[0],
        forecast_type: 'linear',
        predicted_cost: Math.max(0, predictedCost),
        confidence_interval_low: Math.max(0, predictedCost - confidence),
        confidence_interval_high: predictedCost + confidence,
        model_metadata: {
          slope,
          avgCost,
          stdDev,
          historicalDays: n
        }
      });
    }

    // Salvar previsões no banco
    const { error: insertError } = await supabaseClient
      .from('cost_forecasts')
      .upsert(forecasts, { 
        onConflict: 'aws_account_id,forecast_date',
        ignoreDuplicates: false 
      });

    if (insertError) throw insertError;

    console.log(`Generated ${forecasts.length} forecast entries`);

    return new Response(
      JSON.stringify({ 
        success: true,
        forecasts: forecasts.length,
        avgDailyCost: avgCost.toFixed(2),
        trend: slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable',
        growthRate: ((slope / avgCost) * 100).toFixed(2)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-cost-forecast:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
