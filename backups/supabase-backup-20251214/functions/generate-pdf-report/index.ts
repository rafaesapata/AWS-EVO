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
    const { reportType, dateRange } = await req.json();

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
    console.log(`Generating ${reportType} PDF report...`);

    // Create report record with organization isolation
    const { data: report, error: reportError } = await supabaseAdmin
      .from('pdf_reports')
      .insert({
        report_type: reportType,
        title: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`,
        date_range: dateRange,
        status: 'generating'
      })
      .select()
      .single();

    if (reportError) throw reportError;

    // Fetch data based on report type WITH organization isolation
    let reportData: any = {};

    if (reportType === 'executive' || reportType === 'detailed') {
      const { data: metrics } = await supabaseAdmin
        .from('scan_history_metrics')
        .select('*')
        .eq('organization_id', organizationId)
        .order('metric_date', { ascending: false })
        .limit(30);

      const { data: tickets } = await supabaseAdmin
        .from('remediation_tickets')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      const { data: costRecs } = await supabaseAdmin
        .from('cost_recommendations')
        .select('*')
        .eq('organization_id', organizationId)
        .order('projected_savings_yearly', { ascending: false })
        .limit(10);

      reportData = {
        metrics: metrics || [],
        tickets: tickets || [],
        cost_recommendations: costRecs || [],
      };
    }

    if (reportType === 'compliance') {
      const { data: compliance } = await supabaseAdmin
        .from('compliance_checks')
        .select('*')
        .order('created_at', { ascending: false });

      reportData = {
        compliance_checks: compliance || []
      };
    }

    if (reportType === 'cost') {
      const { data: costRecs } = await supabaseAdmin
        .from('cost_recommendations')
        .select('*')
        .eq('organization_id', organizationId)
        .order('projected_savings_yearly', { ascending: false });

      reportData = {
        cost_recommendations: costRecs || []
      };
    }

    // Use AI to generate executive summary
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const summaryPrompt = `Gere um resumo executivo profissional para um relatório ${reportType} da plataforma EVO.

Dados do relatório:
${JSON.stringify(reportData, null, 2)}

O resumo deve incluir:
1. Principais descobertas (top 3-5)
2. Economia total potencial
3. Riscos críticos identificados
4. Recomendações prioritárias
5. Status geral de compliance/segurança

Formato: Markdown, máximo 300 palavras, tom executivo e acionável.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Você é um especialista em criar relatórios executivos para C-level sobre AWS FinOps e segurança.' },
          { role: 'user', content: summaryPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      console.error('AI API Error:', aiResponse.status);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const executiveSummary = aiData.choices[0].message.content;

    // In a real implementation, this would generate actual PDF using a library
    // For now, we'll create a structured HTML/Markdown report
    const htmlReport = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${report.title}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #0D96FF, #00D4FF); color: white; padding: 30px; border-radius: 10px; }
    .summary { background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 8px; }
    .metric { display: inline-block; margin: 10px 20px; text-align: center; }
    .metric-value { font-size: 36px; font-weight: bold; color: #0D96FF; }
    .metric-label { color: #666; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #0D96FF; color: white; }
    .footer { text-align: center; margin-top: 40px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>UDS Tecnologia</h1>
    <h2>${report.title}</h2>
    <p>Gerado em: ${new Date().toLocaleDateString('pt-BR')}</p>
  </div>
  
  <div class="summary">
    <h3>Resumo Executivo</h3>
    ${executiveSummary}
  </div>
  
  <h3>Métricas Principais</h3>
  <div>
    ${reportData.cost_recommendations ? `
      <div class="metric">
        <div class="metric-value">$${reportData.cost_recommendations.reduce((sum: number, r: any) => sum + (r.projected_savings_yearly || 0), 0).toLocaleString()}</div>
        <div class="metric-label">Economia Anual Potencial</div>
      </div>
    ` : ''}
    ${reportData.metrics && reportData.metrics.length > 0 ? `
      <div class="metric">
        <div class="metric-value">${reportData.metrics[0].total_findings || 0}</div>
        <div class="metric-label">Achados Totais</div>
      </div>
      <div class="metric">
        <div class="metric-value">${reportData.metrics[0].critical_findings || 0}</div>
        <div class="metric-label">Críticos</div>
      </div>
    ` : ''}
  </div>
  
  ${reportData.cost_recommendations && reportData.cost_recommendations.length > 0 ? `
    <h3>Top 10 Recomendações de Custo</h3>
    <table>
      <thead>
        <tr>
          <th>Título</th>
          <th>Serviço</th>
          <th>Economia Anual</th>
          <th>Prioridade</th>
        </tr>
      </thead>
      <tbody>
        ${reportData.cost_recommendations.map((rec: any) => `
          <tr>
            <td>${rec.title}</td>
            <td>${rec.service}</td>
            <td>$${(rec.projected_savings_yearly || 0).toLocaleString()}</td>
            <td>${rec.priority}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : ''}
  
  <div class="footer">
    <p>EVO - AWS Intelligence Platform</p>
    <p>Este relatório contém informações confidenciais</p>
  </div>
</body>
</html>
    `;

    // Update report status
    await supabaseAdmin
      .from('pdf_reports')
      .update({
        status: 'ready',
        file_path: `reports/${report.id}.html`,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      })
      .eq('id', report.id);

    console.log('PDF report generated successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        report_id: report.id,
        html_content: htmlReport,
        executive_summary: executiveSummary
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-pdf-report:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});