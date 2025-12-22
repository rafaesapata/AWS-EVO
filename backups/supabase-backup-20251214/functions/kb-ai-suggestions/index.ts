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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { data: orgId, error: orgError } = await supabase
      .rpc('get_user_organization', { _user_id: user.id });

    if (orgError || !orgId) {
      throw new Error('No organization found');
    }

    const { content, action } = await req.json();

    let result;
    switch (action) {
      case 'suggest_tags':
        result = await suggestTags(content);
        break;
      case 'generate_summary':
        result = await generateSummary(content);
        break;
      case 'improve_writing':
        result = await improveWriting(content);
        break;
      case 'translate':
        const { targetLanguage } = await req.json();
        result = await translateContent(content, targetLanguage);
        break;
      default:
        throw new Error('Invalid action');
    }

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function suggestTags(content: string): Promise<string[]> {
  const response = await fetch('https://api.siliconflow.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('LOVABLE_AI_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-lite',
      messages: [{
        role: 'user',
        content: `Analyze this knowledge base article and suggest 5-8 relevant tags. Return ONLY a JSON array of strings, no explanation:\n\n${content.substring(0, 2000)}`
      }],
      temperature: 0.7,
    }),
  });

  const data = await response.json();
  const tags = JSON.parse(data.choices[0].message.content);
  return tags;
}

async function generateSummary(content: string): Promise<string> {
  const response = await fetch('https://api.siliconflow.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('LOVABLE_AI_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{
        role: 'user',
        content: `Summarize this knowledge base article in 2-3 sentences. Be concise and informative:\n\n${content}`
      }],
      temperature: 0.5,
    }),
  });

  const data = await response.json();
  return data.choices[0].message.content;
}

async function improveWriting(content: string): Promise<string> {
  const response = await fetch('https://api.siliconflow.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('LOVABLE_AI_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{
        role: 'user',
        content: `Improve the writing of this knowledge base article. Make it clearer, more professional, and better structured. Keep the same tone and technical level:\n\n${content}`
      }],
      temperature: 0.7,
    }),
  });

  const data = await response.json();
  return data.choices[0].message.content;
}

async function translateContent(content: string, targetLanguage: string): Promise<string> {
  const response = await fetch('https://api.siliconflow.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('LOVABLE_AI_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{
        role: 'user',
        content: `Translate this knowledge base article to ${targetLanguage}. Maintain technical accuracy and formatting:\n\n${content}`
      }],
      temperature: 0.3,
    }),
  });

  const data = await response.json();
  return data.choices[0].message.content;
}
