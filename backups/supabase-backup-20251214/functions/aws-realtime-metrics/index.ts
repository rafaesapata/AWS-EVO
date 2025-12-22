import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { getResolvedAWSCredentials, signAWSPostRequest } from '../_shared/aws-credentials-helper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function fetchCE(resolvedCreds: { accessKeyId: string; secretAccessKey: string; sessionToken?: string }, startDate: string, endDate: string) {
  const region = 'us-east-1';
  const host = `ce.${region}.amazonaws.com`;
  const path = '/';

  const payload = JSON.stringify({
    TimePeriod: { Start: startDate, End: endDate },
    Granularity: 'DAILY',
    Metrics: ['UnblendedCost'],
    GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }]
  });

  const signedHeaders = await signAWSPostRequest(
    resolvedCreds,
    'ce',
    region,
    host,
    path,
    payload,
    {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSInsightsIndexService.GetCostAndUsage'
    }
  );

  const res = await fetch(`https://${host}${path}`, { 
    method: 'POST', 
    headers: signedHeaders, 
    body: payload 
  });
  
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AWS CE error ${res.status}: ${txt}`);
  }
  return await res.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { accountId, region } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (!accountId) throw new Error('accountId é obrigatório');

    // Buscar credenciais AWS
    const { data: credentials, error: credError } = await supabase
      .from('aws_credentials')
      .select('*')
      .eq('id', accountId)
      .eq('is_active', true)
      .single();

    if (credError || !credentials) throw new Error('Credenciais AWS não encontradas ou inativas');

    // Período: últimos 7 dias (End exclusivo)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);

    const endStr = end.toISOString().split('T')[0];
    const startStr = start.toISOString().split('T')[0];

    // CRITICAL: Resolve credentials via AssumeRole
    let resolvedCreds;
    try {
      resolvedCreds = await getResolvedAWSCredentials(credentials, 'us-east-1');
      console.log('✅ Credentials resolved via AssumeRole');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from('aws_api_logs').insert({
        organization_id: credentials.organization_id,
        aws_account_id: accountId,
        service: 'sts',
        operation: 'AssumeRole',
        status_code: 500,
        error_message: msg,
        request_payload: { accountId }
      });
      throw new Error(`Falha ao assumir Role AWS: ${msg}`);
    }

    let ceData;
    try {
      ceData = await fetchCE(resolvedCreds, startStr, endStr);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Log em tabela de logs
      await supabase.from('aws_api_logs').insert({
        organization_id: credentials.organization_id,
        aws_account_id: accountId,
        service: 'ce',
        operation: 'GetCostAndUsage',
        status_code: 500,
        error_message: msg,
        request_payload: { startDate: startStr, endDate: endStr }
      });
      throw new Error(`Falha ao consultar Cost Explorer: ${msg}`);
    }

    const results = ceData?.ResultsByTime ?? [];
    if (results.length === 0) {
      throw new Error('Cost Explorer retornou zero resultados no período');
    }

    // Tendência diária dos últimos dias
    const cost_trends: { date: string; total: number }[] = results.map((r: any) => {
      const dateStr = r.TimePeriod.Start;
      let total = 0;
      for (const g of r.Groups || []) {
        total += parseFloat(g.Metrics.UnblendedCost.Amount);
      }
      return { date: dateStr, total: Number(total.toFixed(2)) };
    });

    // Último dia (o mais recente da lista)
    const last = results[results.length - 1];
    let lastDayTotal = 0;
    const top_services = (last?.Groups || [])
      .map((g: any) => ({ service: g.Keys[0], cost: parseFloat(g.Metrics.UnblendedCost.Amount) }))
      .sort((a: any, b: any) => b.cost - a.cost)
      .map((x: any) => ({ service: x.service, cost: Number(x.cost.toFixed(2)) }));

    for (const g of last?.Groups || []) {
      lastDayTotal += parseFloat(g.Metrics.UnblendedCost.Amount);
    }

    const last_7_days_total = Number(cost_trends.reduce((s, x) => s + x.total, 0).toFixed(2));
    const daily_cost = Number(lastDayTotal.toFixed(2));

    // Log sucesso
    await supabase.from('aws_api_logs').insert({
      organization_id: credentials.organization_id,
      aws_account_id: accountId,
      service: 'ce',
      operation: 'GetCostAndUsage',
      status_code: 200,
      request_payload: { startDate: startStr, endDate: endStr, regionUsed: 'us-east-1' }
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          account_id: accountId,
          region,
          timestamp: new Date().toISOString(),
          metrics: {
            daily_cost,
            last_7_days_total,
            top_services,
            cost_trends,
          }
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in aws-realtime-metrics:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
