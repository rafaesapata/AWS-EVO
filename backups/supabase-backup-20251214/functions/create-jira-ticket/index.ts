import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const { ticketId, jiraConfig } = await req.json();

    // CRITICAL: Authenticate user securely
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Authenticate user via Supabase
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('❌ Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Authenticated user:', user.id);

    // Get user's organization ID
    const { data: organizationId, error: orgError } = await supabaseAdmin.rpc('get_user_organization', { _user_id: user.id });
    if (orgError || !organizationId) {
      console.error('❌ Organization error:', orgError);
      return new Response(
        JSON.stringify({ error: 'Organization not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🏢 User organization:', organizationId);

    console.log(`Creating Jira issue for ticket ${ticketId}`);

    // Get ticket details with organization isolation
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('remediation_tickets')
      .select('*')
      .eq('id', ticketId)
      .eq('organization_id', organizationId)
      .single();

    if (ticketError || !ticket) {
      return new Response(
        JSON.stringify({ error: 'Ticket not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build Jira issue payload
    const jiraPayload = {
      fields: {
        project: {
          key: jiraConfig.projectKey
        },
        summary: ticket.title,
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: ticket.description || 'No description provided'
                }
              ]
            },
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: `Priority: ${ticket.priority}`
                }
              ]
            },
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: `Estimated Savings: $${ticket.estimated_savings || 0}`
                }
              ]
            },
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: `Source: EVO Platform`
                }
              ]
            }
          ]
        },
        issuetype: {
          name: jiraConfig.issueType || "Task"
        },
        priority: {
          name: ticket.priority === 'high' ? 'High' : 
                ticket.priority === 'critical' ? 'Highest' : 'Medium'
        }
      }
    };

    // Create Jira issue
    const jiraResponse = await fetch(`${jiraConfig.jiraUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${jiraConfig.email}:${jiraConfig.apiToken}`)}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(jiraPayload)
    });

    if (!jiraResponse.ok) {
      const errorText = await jiraResponse.text();
      console.error('Jira API Error:', jiraResponse.status, errorText);
      throw new Error(`Jira API error: ${jiraResponse.status}`);
    }

    const jiraData = await jiraResponse.json();
    const issueKey = jiraData.key;
    const issueUrl = `${jiraConfig.jiraUrl}/browse/${issueKey}`;

    // Save integration record with organization isolation
    const { error: integrationError } = await supabaseAdmin
      .from('jira_integration')
      .insert({
        ticket_id: ticketId,
        jira_issue_key: issueKey,
        jira_issue_url: issueUrl,
        status: 'synced'
      });

    if (integrationError) {
      console.error('Error saving integration:', integrationError);
    }

    console.log(`Jira issue created: ${issueKey}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        jira_issue_key: issueKey,
        jira_issue_url: issueUrl
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-jira-ticket:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});