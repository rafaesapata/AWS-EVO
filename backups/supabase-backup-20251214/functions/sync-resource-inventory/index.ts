import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Verificar autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Obter organização do usuário
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      throw new Error('Organization not found');
    }

    const organizationId = profile.organization_id;

    // Buscar recursos de monitored_resources
    const { data: monitoredResources, error: fetchError } = await supabaseClient
      .from('monitored_resources')
      .select('*')
      .eq('organization_id', organizationId);

    if (fetchError) {
      console.error('Error fetching monitored resources:', fetchError);
      throw fetchError;
    }

    if (!monitoredResources || monitoredResources.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No monitored resources found',
          synced: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deletar recursos antigos dessa organização
    const { error: deleteError } = await supabaseClient
      .from('resource_inventory')
      .delete()
      .eq('organization_id', organizationId);

    if (deleteError) {
      console.error('Error deleting old resources:', deleteError);
    }

    // Transformar e inserir recursos em resource_inventory
    const inventoryRecords = monitoredResources.map(resource => ({
      aws_account_id: resource.aws_account_id,
      organization_id: resource.organization_id,
      resource_type: resource.resource_type,
      resource_id: resource.resource_id,
      resource_name: resource.resource_name || resource.resource_id,
      resource_arn: null,
      region: resource.region,
      service: resource.service || resource.resource_type,
      status: resource.status || 'active',
      tags: resource.tags || {},
      monthly_cost: null,
      last_modified: null,
      creation_date: null,
      metadata: resource.metadata || {},
      compliance_status: null,
      security_findings: 0,
      cost_optimization_opportunities: 0,
      last_scanned_at: new Date().toISOString(),
    }));

    const { error: insertError } = await supabaseClient
      .from('resource_inventory')
      .insert(inventoryRecords);

    if (insertError) {
      console.error('Error inserting resources:', insertError);
      throw insertError;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Resources synchronized successfully',
        synced: inventoryRecords.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in sync-resource-inventory:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
