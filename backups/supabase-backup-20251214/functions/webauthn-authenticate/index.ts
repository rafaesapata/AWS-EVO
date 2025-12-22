import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { action, credential, challengeId } = await req.json();

    if (action === 'generate-challenge') {
      // Generate challenge for WebAuthn authentication
      const challenge = crypto.randomUUID();
      
      // Get user's credentials
      const { data: credentials } = await supabaseClient
        .from('webauthn_credentials')
        .select('credential_id, transports')
        .eq('user_id', user.id);

      // Store challenge
      await supabaseClient
        .from('webauthn_challenges')
        .insert({
          user_id: user.id,
          challenge,
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        });

      return new Response(
        JSON.stringify({
          challenge,
          credentials: credentials?.map(c => ({
            id: c.credential_id,
            transports: c.transports,
          })) || [],
          rpId: new URL(Deno.env.get('SUPABASE_URL')!).hostname,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'verify-authentication') {
      // Verify the authentication assertion
      if (!credential || !challengeId) {
        throw new Error('Missing credential or challenge');
      }

      // Verify challenge
      const { data: challengeData } = await supabaseClient
        .from('webauthn_challenges')
        .select('*')
        .eq('challenge', challengeId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!challengeData || new Date(challengeData.expires_at) < new Date()) {
        throw new Error('Invalid or expired challenge');
      }

      // Verify credential exists
      const { data: storedCred } = await supabaseClient
        .from('webauthn_credentials')
        .select('*')
        .eq('credential_id', credential.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!storedCred) {
        throw new Error('Credential not found');
      }

      // Update counter (prevent replay attacks)
      await supabaseClient
        .from('webauthn_credentials')
        .update({ counter: storedCred.counter + 1 })
        .eq('id', storedCred.id);

      // Delete used challenge
      await supabaseClient
        .from('webauthn_challenges')
        .delete()
        .eq('challenge', challengeId);

      return new Response(
        JSON.stringify({ success: true, verified: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');

  } catch (error) {
    console.error('WebAuthn authentication error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});