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

    const { action, credential, challengeId, factorId } = await req.json();

    if (action === 'generate-challenge') {
      // Generate challenge for WebAuthn registration
      const challenge = crypto.randomUUID();
      
      // Store challenge temporarily (you might want to use a dedicated table)
      await supabaseClient
        .from('webauthn_challenges')
        .insert({
          user_id: user.id,
          challenge,
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
        });

      return new Response(
        JSON.stringify({
          challenge,
          userId: user.id,
          rpId: new URL(Deno.env.get('SUPABASE_URL')!).hostname,
          rpName: 'EVO Platform',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'verify-registration') {
      // Verify the credential registration
      // In production, you should verify the attestation object
      // For now, we'll do basic validation

      if (!credential || !challengeId) {
        throw new Error('Missing credential or challenge');
      }

      // Verify challenge exists and is valid
      const { data: challengeData } = await supabaseClient
        .from('webauthn_challenges')
        .select('*')
        .eq('challenge', challengeId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!challengeData || new Date(challengeData.expires_at) < new Date()) {
        throw new Error('Invalid or expired challenge');
      }

      // Store the credential
      await supabaseClient
        .from('webauthn_credentials')
        .insert({
          user_id: user.id,
          credential_id: credential.id,
          public_key: credential.publicKey,
          counter: 0,
          transports: credential.transports || [],
        });

      // Delete used challenge
      await supabaseClient
        .from('webauthn_challenges')
        .delete()
        .eq('challenge', challengeId);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');

  } catch (error) {
    console.error('WebAuthn registration error:', error);
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