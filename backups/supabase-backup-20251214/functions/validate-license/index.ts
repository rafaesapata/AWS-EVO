import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LICENSE_VALIDATION_URL = 'https://mhutjgpipiklepvjrboi.supabase.co/functions/v1/validate-license';

interface LicenseValidationRequest {
  customer_id?: string;
  organization_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json() as LicenseValidationRequest;
    let { customer_id, organization_id } = body;

    // Get user's organization
    const { data: orgData } = await supabase.rpc('get_user_organization', {
      _user_id: user.id
    });

    if (!orgData && !organization_id) {
      return new Response(
        JSON.stringify({ error: 'User has no organization' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userOrgId = organization_id || orgData;

    // Get customer_id from organization if not provided
    if (!customer_id) {
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('customer_id')
        .eq('id', userOrgId)
        .single();

      if (orgError || !org?.customer_id) {
        return new Response(
          JSON.stringify({ 
            error: 'No customer_id found. Please provide customer_id to link your license.',
            needs_customer_id: true
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      customer_id = org.customer_id;
    } else {
      // Update organization with provided customer_id using SERVICE ROLE KEY
      const { error: updateError } = await supabase
        .from('organizations')
        .update({ 
          customer_id,
          updated_at: new Date().toISOString()
        })
        .eq('id', userOrgId);

      if (updateError) {
        console.error('Error updating customer_id:', updateError);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to save customer_id',
            details: updateError.message
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Successfully saved customer_id to organization:', userOrgId);
    }

    console.log('Validating license for customer:', customer_id);

    // Call external license validation API
    // NOTE: LICENSE_PLATFORM_API_KEY must contain the service role key from the external license platform's Supabase project
    const platformServiceRoleKey = Deno.env.get('LICENSE_PLATFORM_API_KEY');
    if (!platformServiceRoleKey) {
      console.error('LICENSE_PLATFORM_API_KEY not configured');
      return new Response(
        JSON.stringify({ 
          error: 'License validation service not configured',
          details: 'LICENSE_PLATFORM_API_KEY secret is missing. Please configure it with the service role key from the license platform.'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Calling external license validation API...');
    console.log('Request URL:', LICENSE_VALIDATION_URL);
    console.log('Request body:', JSON.stringify({ customer_id, product_type: 'evo' }));
    console.log('Has API key:', !!platformServiceRoleKey);
    
    const requestHeaders = {
      'Content-Type': 'application/json',
      'X-API-Key': platformServiceRoleKey
    };
    console.log('Request headers:', JSON.stringify({
      'Content-Type': 'application/json',
      'X-API-Key': '[REDACTED]'
    }));

    const licenseResponse = await fetch(LICENSE_VALIDATION_URL, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ 
        customer_id,
        product_type: 'evo'
      })
    });

    console.log('Response status:', licenseResponse.status);
    console.log('Response headers:', JSON.stringify(Object.fromEntries(licenseResponse.headers.entries())));

    if (!licenseResponse.ok) {
      const errorText = await licenseResponse.text();
      console.error('License validation API returned error:', {
        status: licenseResponse.status,
        error: errorText
      });
      
      return new Response(
        JSON.stringify({ 
          error: 'License validation failed',
          details: errorText,
          valid: false,
          help: 'Verify that LICENSE_PLATFORM_API_KEY contains the correct service role key from the license platform Supabase project'
        }),
        { status: licenseResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const licenseData = await licenseResponse.json();

    // Log validation
    await supabase
      .from('audit_log')
      .insert({
        user_id: user.id,
        action: 'LICENSE_VALIDATED',
        resource_type: 'organization',
        resource_id: userOrgId,
        organization_id: userOrgId,
        details: { 
          customer_id,
          valid: licenseData.valid,
          total_licenses: licenseData.total_licenses
        }
      });

    console.log('License validation result:', { valid: licenseData.valid, customer_id });

    return new Response(
      JSON.stringify({
        ...licenseData,
        organization_id: userOrgId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
