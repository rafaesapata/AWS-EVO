/**
 * CloudFormation Stack Webhook Notification
 * 
 * Sends notifications when CloudFormation stacks are created/updated successfully
 * Can be triggered after successful stack operations
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { logCommunication } from '../_shared/communication-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookPayload {
  event: 'STACK_CREATED' | 'STACK_UPDATED' | 'STACK_DELETED' | 'STACK_FAILED';
  stackName?: string;
  accountId: string;
  awsAccountId?: string;
  region?: string;
  roleArn?: string;
  externalId?: string;
  status?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Authenticate user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: WebhookPayload = await req.json();
    const { event, accountId, stackName, region, roleArn, status, message, metadata } = payload;

    console.log(`📡 CloudFormation webhook received: ${event} for account ${accountId}`);

    // Get user's organization
    const { data: orgId } = await supabase.rpc('get_user_organization', { _user_id: user.id });
    
    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'Organization not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the account belongs to this organization
    const { data: awsAccount, error: accountError } = await supabase
      .from('aws_credentials')
      .select('id, account_name, account_id')
      .eq('id', accountId)
      .eq('organization_id', orgId)
      .single();

    if (accountError || !awsAccount) {
      return new Response(
        JSON.stringify({ error: 'AWS account not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create notification based on event type
    const notificationData = buildNotification(event, awsAccount, {
      stackName,
      region,
      roleArn,
      status,
      message,
      metadata
    });

    // Insert notification
    const { data: notification, error: notifError } = await supabase
      .from('notifications')
      .insert({
        user_id: user.id,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        severity: notificationData.severity,
        data: {
          event,
          accountId,
          awsAccountId: awsAccount.account_id,
          stackName,
          region,
          roleArn,
          ...metadata
        }
      })
      .select('id')
      .single();

    if (notifError) {
      console.error('Failed to create notification:', notifError);
    }

    // CRITICAL: Log to Communication Center
    await logCommunication({
      organization_id: orgId,
      aws_account_id: accountId,
      user_id: user.id,
      channel: 'in_app',
      subject: notificationData.title,
      message: notificationData.message,
      recipient: user.email || user.id,
      status: notifError ? 'failed' : 'delivered',
      error_message: notifError?.message,
      source_type: 'cloudformation_webhook',
      source_id: notification?.id || accountId,
      metadata: {
        event,
        severity: notificationData.severity,
        stackName,
        region,
        roleArn,
        awsAccountId: awsAccount.account_id
      }
    });

    // Log audit event
    await supabase.rpc('log_audit_action', {
      p_user_id: user.id,
      p_action: `CLOUDFORMATION_${event}`,
      p_resource_type: 'aws_credentials',
      p_resource_id: accountId,
      p_details: {
        event,
        stackName,
        region,
        status,
        message,
        ...metadata
      },
      p_organization_id: orgId
    });

    // If stack created successfully, trigger permission validation (fire and forget)
    if (event === 'STACK_CREATED') {
      console.log('🔐 Triggering permission validation for new stack...');
      
      // Fire and forget - don't await
      triggerPermissionValidation(accountId, region || 'us-east-1', token)
        .catch(err => console.error('Background permission validation failed:', err));
    }

    console.log(`✅ Webhook processed: ${event}`);

    return new Response(
      JSON.stringify({
        success: true,
        event,
        notificationCreated: !notifError,
        message: `Webhook for ${event} processed successfully`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Webhook processing failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function buildNotification(
  event: WebhookPayload['event'],
  account: { account_name: string; account_id: string },
  details: Partial<WebhookPayload>
): { type: string; title: string; message: string; severity: string } {
  const accountName = account.account_name || account.account_id || 'AWS Account';

  switch (event) {
    case 'STACK_CREATED':
      return {
        type: 'cloudformation_success',
        title: 'CloudFormation Stack Criado',
        message: `A stack ${details.stackName || 'EVO-Platform-Role'} foi criada com sucesso na conta ${accountName}. As permissões estão sendo validadas.`,
        severity: 'success'
      };

    case 'STACK_UPDATED':
      return {
        type: 'cloudformation_update',
        title: 'CloudFormation Stack Atualizado',
        message: `A stack ${details.stackName || 'EVO-Platform-Role'} foi atualizada na conta ${accountName}.`,
        severity: 'info'
      };

    case 'STACK_DELETED':
      return {
        type: 'cloudformation_delete',
        title: 'CloudFormation Stack Removido',
        message: `A stack ${details.stackName || 'EVO-Platform-Role'} foi removida da conta ${accountName}. O acesso à conta pode ter sido revogado.`,
        severity: 'warning'
      };

    case 'STACK_FAILED':
      return {
        type: 'cloudformation_error',
        title: 'Erro no CloudFormation',
        message: `Falha ao processar a stack ${details.stackName || 'EVO-Platform-Role'} na conta ${accountName}: ${details.message || details.status || 'Erro desconhecido'}`,
        severity: 'error'
      };

    default:
      return {
        type: 'cloudformation_event',
        title: 'Evento CloudFormation',
        message: `Evento ${event} processado para a conta ${accountName}.`,
        severity: 'info'
      };
  }
}

async function triggerPermissionValidation(
  accountId: string,
  region: string,
  token: string
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    
    // Call validate-permissions edge function
    const response = await fetch(`${supabaseUrl}/functions/v1/validate-permissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ accountId, region })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Permission validation trigger failed:', error);
    } else {
      console.log('✅ Permission validation triggered successfully');
    }
  } catch (error) {
    console.error('Error triggering permission validation:', error);
  }
}
