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
    const { userId, action } = await req.json();

    if (!userId || !action) {
      throw new Error('userId and action are required');
    }

    if (!['ban', 'unban'].includes(action)) {
      throw new Error('Invalid action. Must be "ban" or "unban"');
    }

    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Extract JWT token
    const jwt = authHeader.replace('Bearer ', '');

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify requesting user is authenticated and get their info
    const { data: { user }, error: userError } = await adminClient.auth.getUser(jwt);
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user has org_admin or super_admin role
    const { data: roles, error: roleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (roleError) throw roleError;

    const hasAdminRole = roles?.some(r => 
      r.role === 'org_admin' || r.role === 'super_admin'
    );

    if (!hasAdminRole) {
      throw new Error('Insufficient permissions. Admin role required.');
    }

    // Perform the ban/unban action
    const { data: updateData, error: updateError } = await adminClient.auth.admin.updateUserById(
      userId,
      { 
        ban_duration: action === 'ban' ? '876000h' : 'none' // ~100 years or none
      }
    );

    if (updateError) throw updateError;

    // Log the action in audit_log
    await adminClient.from('audit_log').insert({
      user_id: user.id,
      action: action === 'ban' ? 'user_blocked' : 'user_unblocked',
      resource_type: 'user',
      resource_id: userId,
      details: {
        target_user_id: userId,
        action: action
      }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `User ${action === 'ban' ? 'blocked' : 'unblocked'} successfully`,
        data: updateData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error managing user:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
