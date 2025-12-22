import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LicenseCheckResult {
  organization_id: string;
  organization_name: string;
  is_valid: boolean;
  reason?: string;
  message?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // Validate this is a system call (cron job)
    const isSystemCall = authHeader && authHeader.includes(serviceRoleKey!);

    if (!isSystemCall) {
      console.error('❌ Unauthorized: Only system calls allowed for daily-license-validation');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: System call required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('⚙️ System call validated for daily-license-validation');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey ?? ''
    );

    console.log('Starting daily license validation for all organizations');

    // Get all organizations with customer_id
    const { data: organizations, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name, customer_id')
      .not('customer_id', 'is', null);

    if (orgsError) {
      console.error('Error fetching organizations:', orgsError);
      throw orgsError;
    }

    console.log(`Found ${organizations?.length || 0} organizations with customer_id`);

    const results: LicenseCheckResult[] = [];

    // Check each organization's license
    for (const org of organizations || []) {
      try {
        console.log(`Validating license for organization: ${org.name} (${org.id})`);

        // Get active users count for this organization
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id')
          .eq('organization_id', org.id)
          .eq('is_active', true);

        if (profilesError) {
          console.error(`Error counting profiles for org ${org.id}:`, profilesError);
          continue;
        }

        const totalActiveUsers = profiles?.length || 0;
        console.log(`Organization ${org.name} has ${totalActiveUsers} active users`);

        // Call validate-license function to check license status
        const { data: licenseData, error: licenseError } = await supabase.functions.invoke('validate-license', {
          body: { customer_id: org.customer_id }
        });

        if (licenseError || !licenseData?.valid) {
          console.log(`License invalid for ${org.name}: ${licenseError?.message || 'License not valid'}`);
          results.push({
            organization_id: org.id,
            organization_name: org.name,
            is_valid: false,
            reason: 'no_license',
            message: 'Licença inválida ou expirada'
          });
          continue;
        }

        // Check each license
        let hasValidLicense = true;
        let invalidReason: string | undefined;
        let invalidMessage: string | undefined;

        for (const license of licenseData.licenses || []) {
          if (license.is_expired) {
            hasValidLicense = false;
            invalidReason = 'expired';
            invalidMessage = 'Sua licença expirou';
            console.log(`License expired for ${org.name}`);
            break;
          }

          if (totalActiveUsers > license.total_seats) {
            hasValidLicense = false;
            invalidReason = 'no_seats';
            invalidMessage = `${totalActiveUsers} usuários ativos, mas apenas ${license.total_seats} assentos disponíveis`;
            console.log(`Insufficient seats for ${org.name}: ${invalidMessage}`);
            break;
          }
        }

        results.push({
          organization_id: org.id,
          organization_name: org.name,
          is_valid: hasValidLicense,
          reason: invalidReason,
          message: invalidMessage
        });

        console.log(`License validation complete for ${org.name}: ${hasValidLicense ? 'VALID' : 'INVALID'}`);

      } catch (error) {
        console.error(`Error validating license for org ${org.id}:`, error);
        results.push({
          organization_id: org.id,
          organization_name: org.name,
          is_valid: false,
          reason: 'error',
          message: 'Erro ao validar licença'
        });
      }
    }

    // Log summary
    const validCount = results.filter(r => r.is_valid).length;
    const invalidCount = results.filter(r => !r.is_valid).length;
    console.log(`License validation complete: ${validCount} valid, ${invalidCount} invalid`);

    return new Response(
      JSON.stringify({
        success: true,
        total_organizations: results.length,
        valid_licenses: validCount,
        invalid_licenses: invalidCount,
        results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in daily license validation:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
