/**
 * Get Communication Logs Edge Function
 * Returns paginated communication logs with strict organization + account isolation
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QueryParams {
  page?: number;
  pageSize?: number;
  channel?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  recipient?: string;
  search?: string;
  accountId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CRITICAL: Get user's organization for isolation
    const { data: organizationId, error: orgError } = await supabase.rpc(
      'get_user_organization',
      { _user_id: user.id }
    );

    if (orgError || !organizationId) {
      return new Response(
        JSON.stringify({ error: 'User has no organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse query params
    const body: QueryParams = await req.json().catch(() => ({}));
    const {
      page = 1,
      pageSize = 25,
      channel,
      status,
      dateFrom,
      dateTo,
      recipient,
      search,
      accountId
    } = body;

    // Build query with MANDATORY organization filtering
    let query = supabase
      .from('communication_logs')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    // CRITICAL: Filter by account if provided (multi-account isolation)
    if (accountId) {
      query = query.eq('aws_account_id', accountId);
    }

    // Apply filters
    if (channel) {
      query = query.eq('channel', channel);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }

    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    if (recipient) {
      query = query.ilike('recipient', `%${recipient}%`);
    }

    if (search) {
      query = query.or(`subject.ilike.%${search}%,message.ilike.%${search}%`);
    }

    // Apply pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: logs, count, error: queryError } = await query;

    if (queryError) {
      console.error('Query error:', queryError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch communication logs' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get channel statistics for the organization
    const { data: channelStats } = await supabase
      .from('communication_logs')
      .select('channel, status')
      .eq('organization_id', organizationId);

    const stats = {
      total: count || 0,
      byChannel: {} as Record<string, number>,
      byStatus: {} as Record<string, number>
    };

    if (channelStats) {
      channelStats.forEach(log => {
        stats.byChannel[log.channel] = (stats.byChannel[log.channel] || 0) + 1;
        stats.byStatus[log.status] = (stats.byStatus[log.status] || 0) + 1;
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: logs || [],
        pagination: {
          page,
          pageSize,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize)
        },
        stats
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
