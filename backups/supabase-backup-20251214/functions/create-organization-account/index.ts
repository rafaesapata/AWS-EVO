import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

interface CreateAccountRequest {
  customer_id: string;
  organization_name: string;
  admin_email: string;
  admin_name: string;
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

    const body = await req.json() as CreateAccountRequest;
    const { customer_id, organization_name, admin_email, admin_name } = body;

    console.log('Creating account for customer:', customer_id);

    // Validate required fields
    if (!customer_id || !organization_name || !admin_email || !admin_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if organization with this customer_id already exists
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('customer_id', customer_id)
      .single();

    if (existingOrg) {
      return new Response(
        JSON.stringify({ error: 'Organization already exists for this customer_id', organization_id: existingOrg.id }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create organization
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: organization_name,
        customer_id: customer_id
      })
      .select()
      .single();

    if (orgError) {
      console.error('Error creating organization:', orgError);
      return new Response(
        JSON.stringify({ error: 'Failed to create organization', details: orgError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin user
    const temporaryPassword = crypto.randomUUID();
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: admin_email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: admin_name
      }
    });

    if (authError) {
      console.error('Error creating user:', authError);
      // Rollback organization creation
      await supabase.from('organizations').delete().eq('id', organization.id);
      return new Response(
        JSON.stringify({ error: 'Failed to create admin user', details: authError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update profile
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: admin_name,
        force_password_change: true
      })
      .eq('id', authUser.user.id);

    if (profileError) {
      console.error('Error updating profile:', profileError);
    }

    // Assign admin role
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: authUser.user.id,
        organization_id: organization.id,
        role: 'admin'
      });

    if (roleError) {
      console.error('Error assigning role:', roleError);
      // Continue anyway, user exists
    }

    // Log audit
    await supabase
      .from('audit_log')
      .insert({
        user_id: authUser.user.id,
        action: 'ORGANIZATION_CREATED_VIA_API',
        resource_type: 'organization',
        resource_id: organization.id,
        organization_id: organization.id,
        details: { customer_id, created_via: 'license_platform' }
      });

    console.log('Account created successfully:', organization.id);

    return new Response(
      JSON.stringify({
        success: true,
        organization_id: organization.id,
        customer_id: customer_id,
        admin_email: admin_email,
        temporary_password: temporaryPassword,
        message: 'Account created successfully. Admin should change password on first login.'
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
