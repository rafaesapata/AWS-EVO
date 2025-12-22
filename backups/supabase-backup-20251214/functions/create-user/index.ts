import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { Resend } from 'https://esm.sh/resend@2.0.0';
import { logCommunication } from '../_shared/communication-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, fullName, role, organizationId } = await req.json();

    // Validate inputs
    if (!email || !fullName) {
      throw new Error('Email and full name are required');
    }

    // Verify that the requesting user is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract JWT token from Authorization header
    const jwt = authHeader.replace('Bearer ', '');

    // Use service role to create user and verify admin
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify the JWT and get user info
    const { data: { user: requestingUser }, error: userError } = await supabaseAdmin.auth.getUser(jwt);
    
    if (userError || !requestingUser) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if requesting user is admin
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id);

    if (rolesError) {
      console.error('Error fetching roles:', rolesError);
      return new Response(
        JSON.stringify({ error: 'Error verifying permissions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isAdmin = roles?.some(r => r.role === 'org_admin' || r.role === 'super_admin');
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Only administrators can create users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate temporary password
    const tempPassword = crypto.randomUUID();

    // Create the user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName
      }
    });

    if (createError) {
      // Handle specific error cases with appropriate status codes
      if (createError.status === 422 && createError.message.includes('already been registered')) {
        return new Response(
          JSON.stringify({ 
            error: 'Um usuário com este email já está registrado. Por favor, use outro email.' 
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw createError;
    }

    // Update profile with organization association and force password change
    // This is CRITICAL to ensure the user is properly linked to the organization
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        force_password_change: true,
        created_by: requestingUser.id,
        organization_id: organizationId,
        current_organization_id: organizationId
      })
      .eq('id', newUser.user.id);

    if (profileError) {
      console.error('Error updating profile:', profileError);
    }

    // CRITICAL: Create user_organizations entry to ensure proper organization association
    // This prevents the "license not found" issue for new users in existing organizations
    if (organizationId) {
      const { error: userOrgError } = await supabaseAdmin
        .from('user_organizations')
        .upsert({
          user_id: newUser.user.id,
          organization_id: organizationId,
          is_primary: true
        }, {
          onConflict: 'user_id,organization_id'
        });

      if (userOrgError) {
        console.error('Error creating user_organizations entry:', userOrgError);
      } else {
        console.log('User organization association created successfully');
      }
    }

    // Assign role if specified
    if (role && organizationId) {
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: newUser.user.id,
          organization_id: organizationId,
          role: role
        });

      if (roleError) {
        console.error('Error assigning role:', roleError);
      }
    }

    // Send email with temporary password using RESEND
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (RESEND_API_KEY) {
      try {
        const resend = new Resend(RESEND_API_KEY);
        
        const appUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.lovableproject.com') || 'https://app.example.com';
        
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #2563eb;">Bem-vindo à EVO Platform</h1>
            <p>Olá ${fullName},</p>
            <p>Sua conta foi criada com sucesso por um administrador.</p>
            
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h2 style="margin-top: 0;">Suas credenciais de acesso:</h2>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Senha temporária:</strong> <code style="background: white; padding: 4px 8px; border-radius: 4px;">${tempPassword}</code></p>
            </div>
            
            <div style="background-color: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0;">
              <p style="margin: 0;"><strong>⚠️ Importante:</strong> Você DEVE trocar sua senha no primeiro acesso por questões de segurança.</p>
            </div>
            
            <p>Para acessar a plataforma, clique no botão abaixo:</p>
            <a href="${appUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">Acessar EVO Platform</a>
            
            <p>Se você tiver qualquer dúvida, entre em contato com o administrador.</p>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 40px;">
              Este é um email automático, por favor não responda.
            </p>
          </div>
        `;

        const emailResponse = await resend.emails.send({
          from: 'EVO Platform <onboarding@resend.dev>',
          to: [email],
          subject: 'Bem-vindo à EVO Platform - Suas credenciais de acesso',
          html: emailHtml,
        });

        if (emailResponse.error) {
          console.error('Error sending email via Resend:', emailResponse.error);
          // Log failed email
          if (organizationId) {
            await logCommunication({
              organization_id: organizationId,
              user_id: newUser.user.id,
              channel: 'email',
              subject: 'Bem-vindo à EVO Platform - Suas credenciais de acesso',
              message: `E-mail de boas-vindas para ${fullName}`,
              recipient: email,
              status: 'failed',
              error_message: JSON.stringify(emailResponse.error),
              source_type: 'user_creation',
              source_id: newUser.user.id,
              metadata: { resend_error: emailResponse.error }
            });
          }
        } else {
          console.log('Welcome email sent successfully to:', email);
          // Log successful email
          if (organizationId) {
            await logCommunication({
              organization_id: organizationId,
              user_id: newUser.user.id,
              channel: 'email',
              subject: 'Bem-vindo à EVO Platform - Suas credenciais de acesso',
              message: `E-mail de boas-vindas enviado para ${fullName}`,
              recipient: email,
              status: 'sent',
              source_type: 'user_creation',
              source_id: newUser.user.id,
              metadata: { resend_id: emailResponse.data?.id }
            });
          }
        }
      } catch (emailError) {
        console.error('Error with Resend integration:', emailError);
      }
    } else {
      console.warn('RESEND_API_KEY not configured - skipping email sending');
    }

    // Log audit action
    await supabaseAdmin
      .from('audit_log')
      .insert({
        user_id: requestingUser.id,
        action: 'CREATE_USER',
        resource_type: 'user',
        resource_id: newUser.user.id,
        details: {
          created_user_email: email,
          created_user_name: fullName,
          role: role
        }
      });

    console.log('User created successfully:', newUser.user.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: newUser.user.id,
        tempPassword: tempPassword,
        message: 'User created successfully. Temporary password sent to email.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-user:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});