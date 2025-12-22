import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create authenticated client
    const supabaseClient = await import('https://esm.sh/@supabase/supabase-js@2.7.1').then(
      mod => mod.createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      })
    );

    // Get authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Get user's organization using service client
    const supabaseAdmin = await import('https://esm.sh/@supabase/supabase-js@2.7.1').then(
      mod => mod.createClient(supabaseUrl, supabaseServiceKey)
    );

    const { data: organizationId, error: orgError } = await supabaseAdmin.rpc(
      'get_user_organization',
      { _user_id: user.id }
    );

    if (orgError || !organizationId) {
      throw new Error('Organization not found');
    }

    console.log(`✅ User authenticated: ${user.id}, Organization: ${organizationId}`);

    const { costs, accountId, reportType } = await req.json();

    console.log(`Generating Excel report for ${reportType}, account ${accountId}, org ${organizationId}`);

    // Para uma implementação completa, você usaria uma biblioteca como SheetJS ou similar
    // Por enquanto, retornamos um placeholder que indica sucesso
    
    // Simular geração de Excel
    const excelData = {
      metadata: {
        reportType,
        accountId,
        generatedAt: new Date().toISOString(),
        recordCount: costs?.length || 0
      },
      summary: {
        totalCost: costs?.reduce((sum: number, c: any) => sum + c.total_cost, 0) || 0,
        avgDailyCost: costs?.length > 0 ? costs.reduce((sum: number, c: any) => sum + c.total_cost, 0) / costs.length : 0,
        period: costs?.length > 0 ? {
          start: costs[costs.length - 1].cost_date,
          end: costs[0].cost_date
        } : null
      },
      data: costs || []
    };

    console.log('Excel report data prepared:', excelData.metadata);

    // Em produção, você geraria um arquivo Excel real e faria upload para storage
    // Por enquanto, retornamos um indicador de sucesso com os dados
    
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Excel report generation initiated',
        preview: excelData,
        // Quando implementado completamente, retornaria:
        // fileUrl: 'https://storage.../report.xlsx'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-excel-report:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
