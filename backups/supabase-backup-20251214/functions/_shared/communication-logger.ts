/**
 * Centralized Communication Logger
 * All system communications should be logged through this service
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export type CommunicationChannel = 
  | 'email' 
  | 'push' 
  | 'sms' 
  | 'whatsapp' 
  | 'webhook' 
  | 'slack' 
  | 'in_app' 
  | 'datadog' 
  | 'graylog' 
  | 'zabbix';

export type CommunicationStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced';

export interface CommunicationLogEntry {
  organization_id: string;
  aws_account_id?: string;
  user_id?: string;
  channel: CommunicationChannel;
  subject?: string;
  message: string;
  recipient: string;
  cc?: string[];
  bcc?: string[];
  status: CommunicationStatus;
  error_message?: string;
  metadata?: Record<string, unknown>;
  source_type?: string;
  source_id?: string;
  sent_at?: string;
  delivered_at?: string;
}

/**
 * Log a communication to the centralized communication_logs table
 */
export async function logCommunication(
  entry: CommunicationLogEntry
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // CRITICAL: Validate organization_id is provided
    if (!entry.organization_id) {
      console.error('❌ Communication log rejected: missing organization_id');
      return { success: false, error: 'organization_id is required' };
    }

    const { data, error } = await supabase
      .from('communication_logs')
      .insert({
        organization_id: entry.organization_id,
        aws_account_id: entry.aws_account_id || null,
        user_id: entry.user_id || null,
        channel: entry.channel,
        subject: entry.subject || null,
        message: entry.message,
        recipient: entry.recipient,
        cc: entry.cc || null,
        bcc: entry.bcc || null,
        status: entry.status,
        error_message: entry.error_message || null,
        metadata: entry.metadata || {},
        source_type: entry.source_type || null,
        source_id: entry.source_id || null,
        sent_at: entry.sent_at || (entry.status === 'sent' ? new Date().toISOString() : null),
        delivered_at: entry.delivered_at || null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('❌ Failed to log communication:', error);
      return { success: false, error: error.message };
    }

    console.log(`✅ Communication logged: ${entry.channel} to ${entry.recipient} [${entry.status}]`);
    return { success: true, id: data.id };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('❌ Exception logging communication:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Update communication status (e.g., when delivery confirmation is received)
 */
export async function updateCommunicationStatus(
  logId: string,
  status: CommunicationStatus,
  errorMessage?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const updateData: Record<string, unknown> = { status };
    
    if (status === 'sent') {
      updateData.sent_at = new Date().toISOString();
    } else if (status === 'delivered') {
      updateData.delivered_at = new Date().toISOString();
    } else if (status === 'failed' || status === 'bounced') {
      updateData.error_message = errorMessage;
    }

    const { error } = await supabase
      .from('communication_logs')
      .update(updateData)
      .eq('id', logId);

    if (error) {
      console.error('❌ Failed to update communication status:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: errorMsg };
  }
}

/**
 * Helper to get organization_id from user_id
 */
export async function getOrganizationFromUser(userId: string): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase.rpc('get_user_organization', { _user_id: userId });
    
    if (error || !data) {
      console.error('Failed to get organization from user:', error);
      return null;
    }

    return data;
  } catch {
    return null;
  }
}
