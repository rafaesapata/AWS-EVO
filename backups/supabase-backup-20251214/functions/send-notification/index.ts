import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logCommunication, getOrganizationFromUser } from "../_shared/communication-logger.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationPayload {
  user_id?: string;
  title: string;
  message: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  resource_id?: string;
  resource_type?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: NotificationPayload = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // CRITICAL: Verify user belongs to correct organization
    if (payload.user_id) {
      const { data: userOrg, error: orgError } = await supabase.rpc('get_user_organization', { _user_id: payload.user_id });
      
      if (orgError || !userOrg) {
        console.error('❌ Failed to get user organization:', orgError);
        return new Response(
          JSON.stringify({ error: 'Invalid user or organization' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('✅ Validated user organization:', userOrg);
    }

    // Create notification in database
    const { data: notification, error: notifError } = await supabase
      .from('notifications')
      .insert({
        user_id: payload.user_id,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        severity: payload.severity,
        related_resource_id: payload.resource_id,
        related_resource_type: payload.resource_type
      })
      .select()
      .single();

    if (notifError) {
      throw new Error(`Failed to create notification: ${notifError.message}`);
    }

    // Get notification settings
    const { data: settings, error: settingsError } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', payload.user_id || '')
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
    }

    const sentVia: string[] = [];

    // Send webhook notification
    if (settings?.webhook_enabled && settings.webhook_url) {
      try {
        const webhookResponse = await fetch(settings.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'notification',
            notification: {
              title: payload.title,
              message: payload.message,
              severity: payload.severity,
              type: payload.type,
              timestamp: new Date().toISOString()
            }
          })
        });

        if (webhookResponse.ok) {
          sentVia.push('webhook');
        }
      } catch (webhookError) {
        console.error('Webhook error:', webhookError);
      }
    }

    // Send Slack notification
    if (settings?.slack_enabled && settings.slack_webhook_url) {
      try {
        const slackColor = {
          critical: '#DC2626',
          high: '#F59E0B',
          medium: '#3B82F6',
          low: '#10B981'
        }[payload.severity || 'medium'];

        const slackResponse = await fetch(settings.slack_webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attachments: [{
              color: slackColor,
              title: payload.title,
              text: payload.message,
              fields: [
                {
                  title: 'Severidade',
                  value: payload.severity?.toUpperCase() || 'N/A',
                  short: true
                },
                {
                  title: 'Tipo',
                  value: payload.type,
                  short: true
                }
              ],
              footer: 'EVO Platform',
              ts: Math.floor(Date.now() / 1000)
            }]
          })
        });

        if (slackResponse.ok) {
          sentVia.push('slack');
        }
      } catch (slackError) {
        console.error('Slack error:', slackError);
      }
    }

    // Send Datadog event
    if (settings?.datadog_enabled && settings.datadog_api_key && settings.datadog_site) {
      try {
        const datadogPriority = {
          critical: 'normal',
          high: 'normal',
          medium: 'low',
          low: 'low'
        }[payload.severity || 'medium'];

        const datadogAlertType = {
          critical: 'error',
          high: 'warning',
          medium: 'info',
          low: 'info'
        }[payload.severity || 'medium'];

        const datadogResponse = await fetch(
          `https://api.${settings.datadog_site}/api/v1/events`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'DD-API-KEY': settings.datadog_api_key
            },
            body: JSON.stringify({
              title: payload.title,
              text: payload.message,
              priority: datadogPriority,
              alert_type: datadogAlertType,
              tags: [
                `severity:${payload.severity || 'medium'}`,
                `type:${payload.type}`,
                'source:evo-platform'
              ],
              source_type_name: 'evo-platform',
              aggregation_key: payload.resource_id || undefined
            })
          }
        );

        if (datadogResponse.ok) {
          sentVia.push('datadog');
        }
      } catch (datadogError) {
        console.error('Datadog error:', datadogError);
      }
    }

    // Send Graylog GELF message
    if (settings?.graylog_enabled && settings.graylog_url && settings.graylog_port) {
      try {
        const gelfMessage = {
          version: '1.1',
          host: 'evo-platform',
          short_message: payload.title,
          full_message: payload.message,
          timestamp: Math.floor(Date.now() / 1000),
          level: {
            critical: 2, // Critical
            high: 3,     // Error
            medium: 4,   // Warning
            low: 6       // Info
          }[payload.severity || 'medium'],
          _severity: payload.severity || 'medium',
          _type: payload.type,
          _resource_id: payload.resource_id || '',
          _resource_type: payload.resource_type || '',
          facility: 'evo-notifications'
        };

        const graylogResponse = await fetch(
          `${settings.graylog_url}:${settings.graylog_port}/gelf`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(gelfMessage)
          }
        );

        if (graylogResponse.ok) {
          sentVia.push('graylog');
        }
      } catch (graylogError) {
        console.error('Graylog error:', graylogError);
      }
    }

    // Send Zabbix event
    if (settings?.zabbix_enabled && settings.zabbix_url && settings.zabbix_auth_token) {
      try {
        const zabbixSeverity = {
          critical: 5,  // Disaster
          high: 4,      // High
          medium: 3,    // Average
          low: 2        // Warning
        }[payload.severity || 'medium'];

        const zabbixResponse = await fetch(settings.zabbix_url, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json-rpc',
            'Authorization': `Bearer ${settings.zabbix_auth_token}`
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'event.create',
            params: {
              source: 0, // Trigger event
              object: 0, // Trigger object
              objectid: 0,
              acknowledged: 0,
              severity: zabbixSeverity,
              name: payload.title,
              message: payload.message,
              tags: [
                { tag: 'severity', value: payload.severity || 'medium' },
                { tag: 'type', value: payload.type },
                { tag: 'source', value: 'evo-platform' }
              ]
            },
            id: Math.floor(Math.random() * 100000)
          })
        });

        if (zabbixResponse.ok) {
          sentVia.push('zabbix');
        }
      } catch (zabbixError) {
        console.error('Zabbix error:', zabbixError);
      }
    }

    // Update notification with sent channels
    if (sentVia.length > 0) {
      await supabase
        .from('notifications')
        .update({ sent_via: sentVia })
        .eq('id', notification.id);
    }

    // Log all sent communications to the central communication_logs table
    const organizationId = payload.user_id ? await getOrganizationFromUser(payload.user_id) : null;
    
    if (organizationId) {
      for (const channel of sentVia) {
        await logCommunication({
          organization_id: organizationId,
          user_id: payload.user_id,
          channel: channel as any,
          subject: payload.title,
          message: payload.message,
          recipient: payload.user_id || 'system',
          status: 'sent',
          source_type: 'notification',
          source_id: notification.id,
          metadata: {
            severity: payload.severity,
            type: payload.type,
            resource_id: payload.resource_id,
            resource_type: payload.resource_type
          }
        });
      }

      // Also log the in-app notification
      await logCommunication({
        organization_id: organizationId,
        user_id: payload.user_id,
        channel: 'in_app',
        subject: payload.title,
        message: payload.message,
        recipient: payload.user_id || 'system',
        status: 'delivered',
        source_type: 'notification',
        source_id: notification.id,
        metadata: {
          severity: payload.severity,
          type: payload.type
        }
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        notification_id: notification.id,
        sent_via: sentVia
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Notification error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});