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

    const { articleId, format } = await req.json();

    // Get article with organization validation
    const { data: article, error: articleError } = await supabase
      .from('knowledge_base_articles')
      .select('*, profiles:author_id(email)')
      .eq('id', articleId)
      .eq('organization_id', orgId)
      .single();

    if (articleError || !article) {
      throw new Error('Article not found or access denied');
    }

    let exportContent: string;
    let mimeType: string;
    let fileExtension: string;

    switch (format) {
      case 'pdf':
        // Generate HTML for PDF conversion
        exportContent = generateHTML(article);
        mimeType = 'application/pdf';
        fileExtension = 'pdf';
        
        // Use a PDF generation service or library here
        // For now, returning HTML that can be converted to PDF client-side
        break;
      
      case 'markdown':
        exportContent = article.content;
        mimeType = 'text/markdown';
        fileExtension = 'md';
        break;
      
      case 'html':
        exportContent = generateHTML(article);
        mimeType = 'text/html';
        fileExtension = 'html';
        break;
      
      case 'confluence':
        exportContent = convertToConfluence(article);
        mimeType = 'text/plain';
        fileExtension = 'txt';
        break;
      
      default:
        throw new Error('Invalid export format');
    }

    // Log export
    await supabase
      .from('knowledge_base_exports')
      .insert({
        article_id: articleId,
        organization_id: orgId,
        exported_by: user.id,
        export_format: format,
      });

    // Track analytics
    await supabase
      .from('knowledge_base_analytics')
      .insert({
        article_id: articleId,
        organization_id: orgId,
        user_id: user.id,
        event_type: 'export',
      });

    return new Response(JSON.stringify({
      success: true,
      content: exportContent,
      mimeType,
      filename: `${article.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${fileExtension}`
    }), {
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

function generateHTML(article: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${article.title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #333;
    }
    h1 { color: #1a1a1a; border-bottom: 3px solid #4f46e5; padding-bottom: 10px; }
    h2 { color: #333; margin-top: 30px; }
    h3 { color: #555; }
    code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    pre {
      background: #f4f4f4;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
    }
    .metadata {
      color: #666;
      font-size: 0.9em;
      margin-bottom: 30px;
      padding-bottom: 15px;
      border-bottom: 1px solid #e0e0e0;
    }
    .tags {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #e0e0e0;
    }
    .tag {
      display: inline-block;
      background: #e0e7ff;
      color: #4f46e5;
      padding: 3px 10px;
      border-radius: 12px;
      margin-right: 5px;
      font-size: 0.85em;
    }
  </style>
</head>
<body>
  <h1>${article.title}</h1>
  <div class="metadata">
    <p><strong>Category:</strong> ${article.category}</p>
    <p><strong>Author:</strong> ${article.profiles?.email || 'Unknown'}</p>
    <p><strong>Created:</strong> ${new Date(article.created_at).toLocaleDateString()}</p>
    <p><strong>Version:</strong> ${article.version || 1}</p>
  </div>
  
  <div class="content">
    ${convertMarkdownToHTML(article.content)}
  </div>
  
  ${article.tags && article.tags.length > 0 ? `
    <div class="tags">
      <strong>Tags:</strong>
      ${article.tags.map((tag: string) => `<span class="tag">${tag}</span>`).join('')}
    </div>
  ` : ''}
</body>
</html>
  `.trim();
}

function convertMarkdownToHTML(markdown: string): string {
  // Basic markdown to HTML conversion
  let html = markdown
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  
  return `<p>${html}</p>`;
}

function convertToConfluence(article: any): string {
  // Convert to Confluence Wiki Markup
  let content = article.content
    .replace(/^# (.*$)/gim, 'h1. $1')
    .replace(/^## (.*$)/gim, 'h2. $1')
    .replace(/^### (.*$)/gim, 'h3. $1')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/\*(.+?)\*/g, '_$1_')
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '{code:$1}\n$2\n{code}')
    .replace(/`([^`]+)`/g, '{{$1}}');

  return `{panel:title=${article.title}|borderStyle=solid|borderColor=#ccc|titleBGColor=#F7D6C4|bgColor=#FFFFCE}
Category: ${article.category}
Author: ${article.profiles?.email || 'Unknown'}
Created: ${new Date(article.created_at).toLocaleDateString()}
{panel}

${content}

${article.tags && article.tags.length > 0 ? `\n{info}Tags: ${article.tags.join(', ')}{info}` : ''}`;
}
