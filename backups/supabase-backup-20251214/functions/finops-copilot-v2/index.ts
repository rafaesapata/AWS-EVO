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
    const { messages, conversationId } = await req.json();

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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('FinOps Copilot v2 - Agentic AI with tool calling');

    // Define available tools for the agent
    const tools = [
      {
        type: "function",
        function: {
          name: "optimize_costs",
          description: "Analyze AWS resources and create a cost optimization plan with automatic execution capability",
          parameters: {
            type: "object",
            properties: {
              target_savings_percentage: { type: "number", description: "Target cost reduction percentage (e.g., 20 for 20%)" },
              focus_areas: { 
                type: "array", 
                items: { type: "string" },
                description: "Areas to focus on: EC2, RDS, S3, Lambda, etc." 
              },
              auto_execute: { type: "boolean", description: "Whether to automatically execute approved optimizations" }
            },
            required: ["target_savings_percentage"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "fix_security_issues",
          description: "Analyze security findings and create remediation plan with optional auto-execution",
          parameters: {
            type: "object",
            properties: {
              severity_threshold: { type: "string", enum: ["critical", "high", "medium", "low"] },
              auto_fix: { type: "boolean", description: "Automatically fix issues when possible" },
              resource_types: { type: "array", items: { type: "string" } }
            },
            required: ["severity_threshold"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "cleanup_resources",
          description: "Identify and remove idle, orphaned or unused AWS resources",
          parameters: {
            type: "object",
            properties: {
              resource_types: { 
                type: "array", 
                items: { type: "string" },
                description: "Types of resources to cleanup: volumes, snapshots, EIPs, etc." 
              },
              min_age_days: { type: "number", description: "Minimum age in days for resources to be considered for cleanup" },
              dry_run: { type: "boolean", description: "Simulate cleanup without actual deletion" }
            },
            required: ["resource_types"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "generate_terraform",
          description: "Generate Terraform code for implementing recommendations",
          parameters: {
            type: "object",
            properties: {
              recommendation_ids: { type: "array", items: { type: "string" } },
              include_rollback: { type: "boolean", description: "Include rollback plan" }
            },
            required: ["recommendation_ids"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "analyze_commitment_opportunities",
          description: "Analyze Savings Plans and Reserved Instances opportunities",
          parameters: {
            type: "object",
            properties: {
              commitment_term: { type: "string", enum: ["1_year", "3_year"] },
              payment_option: { type: "string", enum: ["all_upfront", "partial_upfront", "no_upfront"] }
            },
            additionalProperties: false
          }
        }
      }
    ];

    const systemPrompt = `You are FinOps Copilot v2, an autonomous AI agent for AWS cost optimization and security.

You have the ability to EXECUTE actions, not just recommend them. You can:
- Optimize costs automatically (rightsizing, cleanup, commitment analysis)
- Fix security issues (IAM policies, security groups, encryption)
- Clean up unused resources (EBS volumes, snapshots, elastic IPs)
- Generate and deploy Terraform code
- Analyze and implement commitment savings (SP/RI)

When users request actions:
1. Propose a plan using available tools
2. If approved, execute automatically
3. Provide rollback capability
4. Report results and savings

Be proactive and autonomous. Ask for approval only for critical changes.
Always calculate ROI and impact before suggesting actions.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        tools: tools,
        tool_choice: 'auto'
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API Error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const assistantMessage = aiData.choices[0].message;

    // Check if AI wants to use tools
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolCall = assistantMessage.tool_calls[0];
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);

      console.log(`Agent executing tool: ${functionName}`, functionArgs);

      // Create agent action record with organization isolation
      const { data: actionRecord, error: actionError } = await supabaseAdmin
        .from('agent_actions')
        .insert({
          user_id: user.id,
          conversation_id: conversationId,
          action_type: functionName,
          action_description: `Agent-initiated: ${functionName}`,
          target_resources: functionArgs,
          approval_status: 'pending',
          estimated_impact: {
            tool: functionName,
            parameters: functionArgs,
            organization_id: organizationId
          }
        })
        .select()
        .single();

      if (actionError) {
        console.error('Error creating action record:', actionError);
      }

      // Execute tool based on function name
      let toolResult: any = { success: true, message: 'Action queued for execution', action_id: actionRecord?.id };

      // Return response with tool execution info
      return new Response(
        JSON.stringify({
          message: assistantMessage.content || `Iniciando ação: ${functionName}`,
          tool_call: {
            function: functionName,
            arguments: functionArgs,
            action_id: actionRecord?.id
          },
          requires_approval: !functionArgs.auto_execute && !functionArgs.auto_fix,
          estimated_impact: toolResult
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Regular response without tool calls
    return new Response(
      JSON.stringify({
        message: assistantMessage.content,
        conversation_id: conversationId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in finops-copilot-v2:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});