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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { accountId, step } = await req.json();

    console.log(`Starting initial data load - Step: ${step}, Account: ${accountId}`);

    // Get AWS credentials
    const { data: credentials } = await supabase
      .from('aws_credentials')
      .select('*')
      .eq('id', accountId)
      .single();

    if (!credentials) {
      throw new Error('AWS credentials not found');
    }

    let result;

    switch (step) {
      case 'resources':
        result = await loadResourceInventory(supabase, credentials);
        break;
      case 'security':
        result = await loadSecurityData(supabase, credentials);
        break;
      case 'optimization':
        result = await loadOptimizationData(supabase, credentials);
        break;
      default:
        throw new Error(`Unknown step: ${step}`);
    }

    console.log(`Completed step ${step}:`, result);

    return new Response(
      JSON.stringify({
        success: true,
        step,
        data: result
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in initial data load:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to load data';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function loadResourceInventory(supabase: any, credentials: any) {
  // Invoke fetch-cloudwatch-metrics edge function for real AWS resource collection
  const { data, error } = await supabase.functions.invoke('fetch-cloudwatch-metrics', {
    body: { accountId: credentials.id }
  });

  if (error) throw new Error(`Falha na coleta de recursos: ${error.message}`);
  if (!data?.success) throw new Error('Coleta de recursos não retornou sucesso');

  return {
    message: `${data.resourcesFound || 0} recursos encontrados e ${data.metricsCollected || 0} métricas coletadas`,
    resourcesFound: data.resourcesFound || 0,
    metricsCollected: data.metricsCollected || 0
  };
}

async function loadSecurityData(supabase: any, credentials: any) {
  // Invoke security-scan edge function for real AWS analysis
  const { data, error } = await supabase.functions.invoke('security-scan', {
    body: { accountId: credentials.id }
  });

  if (error) throw new Error(`Falha no scan de segurança: ${error.message}`);
  if (!data?.success) throw new Error('Security scan não retornou sucesso');

  return {
    message: `Scan de segurança concluído: ${data.findingsCount || 0} achados identificados`,
    findingsCount: data.findingsCount || 0,
    averageWAScore: data.averageWAScore || 0
  };
}

async function loadOptimizationData(supabase: any, credentials: any) {
  // Invoke cost-optimization edge function for real AWS analysis
  const { data, error } = await supabase.functions.invoke('cost-optimization', {
    body: { accountId: credentials.id }
  });

  if (error) throw new Error(`Falha na análise de otimização: ${error.message}`);
  if (!data?.success) throw new Error('Cost optimization não retornou sucesso');

  return {
    message: `${data.recommendationsCount || 0} oportunidades de otimização identificadas`,
    recommendationsCount: data.recommendationsCount || 0,
    potentialYearlySavings: data.totalYearlySavings || 0
  };
}
