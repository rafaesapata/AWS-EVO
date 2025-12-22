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
    console.log('🔍 check-license: Starting license validation');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('❌ check-license: Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      console.log('❌ check-license: Invalid token', userError);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ check-license: User authenticated:', user.email);

    // Get user's organization
    const { data: orgId } = await supabase.rpc('get_user_organization', {
      _user_id: user.id
    });

    if (!orgId) {
      console.log('❌ check-license: No organization found for user');
      return new Response(
        JSON.stringify({
          isValid: false,
          reason: 'no_license',
          message: 'Organização não encontrada',
          hasCustomerId: false
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('📋 check-license: Organization ID:', orgId);

    // Get organization details
    const { data: org } = await supabase
      .from('organizations')
      .select('customer_id')
      .eq('id', orgId)
      .single();

    if (!org?.customer_id) {
      console.log('❌ check-license: Organization has no customer_id linked');
      return new Response(
        JSON.stringify({
          isValid: false,
          reason: 'no_license',
          message: 'Sua organização ainda não possui uma licença vinculada.',
          hasCustomerId: false
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔑 check-license: Customer ID found:', org.customer_id);

    // Call validate-license function using direct HTTP
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const licenseResponse = await fetch(`${supabaseUrl}/functions/v1/validate-license`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        customer_id: org.customer_id,
        product_type: 'evo'
      })
    });

    if (!licenseResponse.ok) {
      console.error('❌ check-license: Failed to validate license:', await licenseResponse.text());
      return new Response(
        JSON.stringify({
          isValid: false,
          reason: 'no_license',
          message: 'Não foi possível validar a licença.',
          hasCustomerId: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const licenseData = await licenseResponse.json();
    console.log('📋 check-license: License data received:', { valid: licenseData?.valid, licenses: licenseData?.licenses?.length });

    if (!licenseData?.valid) {
      console.log('❌ check-license: License validation returned invalid');
      return new Response(
        JSON.stringify({
          isValid: false,
          reason: 'no_license',
          message: 'Não foi possível validar a licença.',
          hasCustomerId: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Count active (non-deleted) users
    const { data: activeUsersCount } = await supabase.rpc('count_active_users', {
      _organization_id: orgId
    });

    // Check if current user is admin (admins always have priority access)
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    
    const isAdmin = userRoles?.some(r => r.role === 'org_admin' || r.role === 'super_admin') || false;

    // Check if current user has an allocated seat
    const { data: userSeat } = await supabase
      .from('license_seats')
      .select('id, is_active')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single();

    // Check each license
    for (const license of licenseData.licenses || []) {
      if (license.is_expired) {
        return new Response(
          JSON.stringify({
            isValid: false,
            reason: 'expired',
            message: 'Sua licença expirou. Renove para continuar.',
            hasCustomerId: true
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // CRITICAL: Validate that license has total_seats defined
      const totalSeats = license.total_seats ?? 0;
      if (totalSeats <= 0) {
        console.warn('License has no seats defined, skipping:', license.license_key);
        continue;
      }

      // FIRST: Check if user has an active allocated seat, and auto-allocate if needed
      if (!userSeat || !userSeat.is_active) {
        // Count allocated seats
        const { count: allocatedSeats } = await supabase
          .from('license_seats')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('is_active', true);

        const seatsUsed = allocatedSeats ?? 0;
        const seatsAvailable = totalSeats - seatsUsed;

        // If there are available seats, auto-allocate one to this user
        if (seatsAvailable > 0) {
          const { error: allocateError } = await supabase
            .from('license_seats')
            .insert({
              organization_id: orgId,
              user_id: user.id,
              license_key: license.license_key,
              allocated_by: user.id, // Self-allocated
              is_active: true
            });

          if (allocateError) {
            console.error('Error auto-allocating seat:', allocateError);
            return new Response(
              JSON.stringify({
                isValid: false,
                reason: 'no_seats',
                message: `Erro ao alocar assento automaticamente. Contate o administrador.`,
                hasCustomerId: true,
                seatsAvailable
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Seat allocated successfully, allow access
          console.log(`Auto-allocated seat for user ${user.id} in org ${orgId}`);
        } else {
          // No seats available
          return new Response(
            JSON.stringify({
              isValid: false,
              reason: 'no_seats',
              message: `Você não possui um assento alocado. Todos os assentos estão em uso. Contate o administrador da organização.`,
              hasCustomerId: true,
              seatsAvailable: 0
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // SECOND: After auto-allocation, check if organization has more active users than total seats
      // Admins always have priority access
      if (activeUsersCount > totalSeats) {
        const excess = activeUsersCount - totalSeats;
        
        // If user is admin, allow access (admins have priority)
        if (isAdmin) {
          return new Response(
            JSON.stringify({
              isValid: true,
              hasCustomerId: true,
              isAdminPriorityAccess: true
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Non-admin users are blocked when there's excess
        return new Response(
          JSON.stringify({
            isValid: false,
            reason: 'seats_exceeded',
            message: `Sua organização possui ${activeUsersCount} usuários ativos, mas apenas ${totalSeats} assentos disponíveis. É necessário remover ${excess} usuário(s) ou adquirir mais assentos. Contate um administrador.`,
            hasCustomerId: true,
            activeUsersCount,
            totalSeats,
            excessUsers: excess
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // License is valid, break out of loop
      break;
    }

    return new Response(
      JSON.stringify({
        isValid: true,
        hasCustomerId: true
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error checking license:', error);
    return new Response(
      JSON.stringify({
        isValid: false,
        reason: 'no_license',
        message: 'Erro ao validar licença',
        hasCustomerId: false
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});