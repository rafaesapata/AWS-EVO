import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Helper function to wrap text
  const wrapText = (text: string, maxLength: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    words.forEach(word => {
      if ((currentLine + word).length <= maxLength) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    });
    
    if (currentLine) lines.push(currentLine);
    return lines;
  };

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Dynamic import of createClient
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.76.1');

    // Create authenticated client
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Get user's organization using service client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: organizationId, error: orgError } = await supabaseAdmin.rpc(
      'get_user_organization',
      { _user_id: user.id }
    );

    if (orgError || !organizationId) {
      throw new Error('Organization not found');
    }

    console.log(`✅ User authenticated: ${user.id}, Organization: ${organizationId}`);

    const { findings, posture, latestScan, categoryBreakdown, userEmail } = await req.json();

    console.log('📄 Generating comprehensive security PDF report with full details...');
    console.log(`Processing ${findings?.length || 0} findings`);

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Embed fonts
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // Count findings by severity
    const criticalCount = findings.filter((f: any) => f.severity === 'critical').length;
    const highCount = findings.filter((f: any) => f.severity === 'high').length;
    const mediumCount = findings.filter((f: any) => f.severity === 'medium').length;
    const lowCount = findings.filter((f: any) => f.severity === 'low').length;

    const date = new Date().toLocaleDateString('pt-BR', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Helper function to add EVO header with logo to each page
    const addEVOHeader = (page: any, yPos: number, isFirstPage = false) => {
      if (isFirstPage) {
        // Large EVO branding on cover page
        page.drawText('EVO', {
          x: 50,
          y: yPos,
          size: 48,
          font: boldFont,
          color: rgb(0.145, 0.388, 0.922),
        });
        
      page.drawText('Plataforma NuevaCore', {
        x: 50,
        y: yPos - 25,
        size: 14,
        font: regularFont,
        color: rgb(0.4, 0.47, 0.55),
      });
      } else {
        // Small EVO header on internal pages
        page.drawText('EVO', {
          x: 50,
          y: yPos,
          size: 20,
          font: boldFont,
          color: rgb(0.145, 0.388, 0.922),
        });
        
        page.drawRectangle({
          x: 0,
          y: yPos + 20,
          width: 595,
          height: 2,
          color: rgb(0.145, 0.388, 0.922),
        });
      }
    };

    // Helper function to add EVO footer to each page
    const addEVOFooter = (page: any) => {
      // Footer background
      page.drawRectangle({
        x: 0,
        y: 0,
        width: 595,
        height: 60,
        color: rgb(0.97, 0.98, 0.99),
      });
      
      // EVO branding
      page.drawText('EVO', {
        x: 50,
        y: 40,
        size: 16,
        font: boldFont,
        color: rgb(0.145, 0.388, 0.922),
      });
      
      page.drawText('Plataforma NuevaCore', {
        x: 50,
        y: 22,
        size: 9,
        font: regularFont,
        color: rgb(0.4, 0.47, 0.55),
      });
      
      // Platform info
      page.drawText('FinOps & Security Intelligence  •  evo.nuevacore.com', {
        x: 250,
        y: 40,
        size: 8,
        font: regularFont,
        color: rgb(0.4, 0.47, 0.55),
      });
      
      // Confidential notice
      page.drawText('DOCUMENTO CONFIDENCIAL - Distribuicao Restrita', {
        x: 250,
        y: 25,
        size: 7,
        font: boldFont,
        color: rgb(0.6, 0.15, 0.15),
      });
    };

    // COVER PAGE
    let page = pdfDoc.addPage([595, 842]); // A4 size
    let yPos = 750;
    
    // EVO Logo and branding
    addEVOHeader(page, yPos, true);

    // Red confidential banner
    page.drawRectangle({
      x: 0,
      y: yPos - 80,
      width: 595,
      height: 40,
      color: rgb(0.863, 0.149, 0.149), // #dc2626
    });
    
    page.drawText('DOCUMENTO CONFIDENCIAL - ACESSO RESTRITO', {
      x: 80,
      y: yPos - 65,
      size: 14,
      font: boldFont,
      color: rgb(1, 1, 1),
    });

    // Title
    yPos = 550;
    page.drawText('Relatorio de Seguranca AWS', {
      x: 50,
      y: yPos,
      size: 36,
      font: boldFont,
      color: rgb(0.118, 0.161, 0.235),
    });
    
    page.drawText('Analise Abrangente de Postura de Seguranca', {
      x: 50,
      y: yPos - 40,
      size: 16,
      font: regularFont,
      color: rgb(0.4, 0.47, 0.55),
    });

    // Security Score Box
    yPos = 400;
    page.drawRectangle({
      x: 150,
      y: yPos - 120,
      width: 295,
      height: 150,
      color: rgb(0.4, 0.49, 0.918), // Purple gradient approximation
      borderColor: rgb(0.145, 0.388, 0.922),
      borderWidth: 3,
    });
    
    page.drawText('Security Posture Score', {
      x: 200,
      y: yPos - 40,
      size: 18,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
    
    const scoreText = `${posture?.overall_score?.toFixed(0) || 0}/100`;
    page.drawText(scoreText, {
      x: 250,
      y: yPos - 90,
      size: 48,
      font: boldFont,
      color: rgb(1, 1, 1),
    });

    // Document metadata
    yPos = 200;
    page.drawText(`Gerado em: ${date}`, {
      x: 50,
      y: yPos,
      size: 12,
      font: regularFont,
      color: rgb(0.4, 0.47, 0.55),
    });
    
    page.drawText(`Gerado por: ${userEmail || 'Sistema'}`, {
      x: 50,
      y: yPos - 20,
      size: 12,
      font: regularFont,
      color: rgb(0.4, 0.47, 0.55),
    });

    // Add footer to cover page
    addEVOFooter(page);

    // PAGE 2 - EXECUTIVE SUMMARY
    page = pdfDoc.addPage([595, 842]);
    yPos = 750;
    
    // EVO Header
    addEVOHeader(page, yPos);

    yPos = 680;
    page.drawText('Sumario Executivo', {
      x: 50,
      y: yPos,
      size: 28,
      font: boldFont,
      color: rgb(0.118, 0.161, 0.235),
    });

    // Metrics in grid
    yPos = 620;
    const metrics = [
      { label: 'Achados Criticos', value: criticalCount, color: rgb(0.863, 0.149, 0.149) },
      { label: 'Achados Altos', value: highCount, color: rgb(0.918, 0.345, 0.078) },
      { label: 'Achados Medios', value: mediumCount, color: rgb(0.918, 0.702, 0.031) },
      { label: 'Achados Baixos', value: lowCount, color: rgb(0.231, 0.510, 0.965) }
    ];

    metrics.forEach((metric, index) => {
      const xOffset = (index % 2) * 270 + 50;
      const yOffset = Math.floor(index / 2) * 120;
      
      page.drawRectangle({
        x: xOffset,
        y: yPos - yOffset - 80,
        width: 230,
        height: 90,
        color: rgb(0.97, 0.97, 0.98),
        borderColor: metric.color,
        borderWidth: 3,
      });
      
      page.drawText(metric.label.toUpperCase(), {
        x: xOffset + 15,
        y: yPos - yOffset - 30,
        size: 10,
        font: boldFont,
        color: rgb(0.4, 0.47, 0.55),
      });
      
      page.drawText(String(metric.value), {
        x: xOffset + 15,
        y: yPos - yOffset - 65,
        size: 40,
        font: boldFont,
        color: metric.color,
      });
    });

    // Add footer to page 2
    addEVOFooter(page);

    // PAGE 3 - CATEGORY BREAKDOWN
    page = pdfDoc.addPage([595, 842]);
    yPos = 750;
    
    // EVO Header
    addEVOHeader(page, yPos);

    yPos = 680;
    page.drawText('Breakdown por Categoria', {
      x: 50,
      y: yPos,
      size: 28,
      font: boldFont,
      color: rgb(0.118, 0.161, 0.235),
    });

    const categories = [
      { name: 'Identity & Access', score: categoryBreakdown.identity },
      { name: 'Network Security', score: categoryBreakdown.network },
      { name: 'Data Protection', score: categoryBreakdown.data },
      { name: 'Compute Security', score: categoryBreakdown.compute },
      { name: 'Monitoring & Logging', score: categoryBreakdown.monitoring }
    ];

    yPos = 620;
    categories.forEach((cat, index) => {
      const scoreNum = Number(cat.score);
      const scoreColor = scoreNum >= 80 ? rgb(0.063, 0.725, 0.506) : 
                        scoreNum >= 60 ? rgb(0.231, 0.510, 0.965) : 
                        scoreNum >= 40 ? rgb(0.918, 0.702, 0.031) : 
                        rgb(0.863, 0.149, 0.149);
      
      const label = scoreNum >= 80 ? 'Excelente' : 
                   scoreNum >= 60 ? 'Bom' : 
                   scoreNum >= 40 ? 'Regular' : 
                   'Critico';
      
      page.drawText(cat.name, {
        x: 50,
        y: yPos - (index * 80),
        size: 14,
        font: boldFont,
        color: rgb(0.118, 0.161, 0.235),
      });
      
      page.drawText(`${scoreNum.toFixed(0)}/100 - ${label}`, {
        x: 380,
        y: yPos - (index * 80),
        size: 16,
        font: boldFont,
        color: scoreColor,
      });
      
      // Progress bar
      const barWidth = 450;
      const fillWidth = (scoreNum / 100) * barWidth;
      
      page.drawRectangle({
        x: 50,
        y: yPos - (index * 80) - 30,
        width: barWidth,
        height: 8,
        color: rgb(0.9, 0.9, 0.92),
      });
      
      page.drawRectangle({
        x: 50,
        y: yPos - (index * 80) - 30,
        width: fillWidth,
        height: 8,
        color: scoreColor,
      });
    });

    // Add footer to page 3
    addEVOFooter(page);

    // FINDINGS PAGES - DETAILED WITH ARN, REGION, ANALYSIS
    const findingsPerPage = 3; // Less per page to fit more details
    const totalFindingsPages = Math.ceil(Math.min(findings.length, 50) / findingsPerPage);
    
    console.log(`Rendering ${totalFindingsPages} pages of detailed findings`);
    
    for (let pageIndex = 0; pageIndex < totalFindingsPages; pageIndex++) {
      page = pdfDoc.addPage([595, 842]);
      yPos = 750;
      
      // EVO Header
      addEVOHeader(page, yPos);

      if (pageIndex === 0) {
        page.drawText(`Achados Detalhados (${findings.length} total)`, {
          x: 50,
          y: 680,
          size: 28,
          font: boldFont,
          color: rgb(0.118, 0.161, 0.235),
        });
        yPos = 630;
      } else {
        yPos = 700;
      }

      const startIdx = pageIndex * findingsPerPage;
      const endIdx = Math.min(startIdx + findingsPerPage, findings.length, 50);
      const pageFindings = findings.slice(startIdx, endIdx);

      console.log(`Page ${pageIndex + 1}: Rendering findings ${startIdx} to ${endIdx - 1}`);
      console.log(`Findings on this page:`, pageFindings.map((f: any) => ({ 
        id: f.id, 
        severity: f.severity, 
        title: (f.description || f.event_name || 'no title').substring(0, 50) 
      })));

      for (const finding of pageFindings) {
        if (yPos < 150) break; // Need new page
        
        const severityColor = finding.severity === 'critical' ? rgb(0.863, 0.149, 0.149) :
                               finding.severity === 'high' ? rgb(0.918, 0.345, 0.078) :
                               finding.severity === 'medium' ? rgb(0.918, 0.702, 0.031) :
                               rgb(0.231, 0.510, 0.965);
        
        // Finding box background
        page.drawRectangle({
          x: 50,
          y: yPos - 180,
          width: 495,
          height: 190,
          color: rgb(0.97, 0.97, 0.98),
          borderColor: severityColor,
          borderWidth: 2,
        });
        
        // Severity badge
        page.drawRectangle({
          x: 60,
          y: yPos - 30,
          width: 80,
          height: 20,
          color: severityColor,
        });
        
        page.drawText((finding.severity || 'unknown').toUpperCase(), {
          x: 70,
          y: yPos - 24,
          size: 10,
          font: boldFont,
          color: rgb(1, 1, 1),
        });
        
        // Finding title
        const title = finding.description || finding.event_name || 'Sem título';
        const titleLines = wrapText(title, 60);
        let titleY = yPos - 30;
        titleLines.slice(0, 2).forEach((line: string) => {
          page.drawText(line, {
            x: 150,
            y: titleY,
            size: 11,
            font: boldFont,
            color: rgb(0.118, 0.161, 0.235),
          });
          titleY -= 14;
        });
        
        // Service & Region
        let detailY = yPos - 60;
        const service = finding.details?.service || finding.user_identity?.service || 'N/A';
        page.drawText(`Servico: ${service}`, {
          x: 60,
          y: detailY,
          size: 9,
          font: boldFont,
          color: rgb(0.4, 0.47, 0.55),
        });
        
        if (finding.details?.region) {
          page.drawText(`Regiao: ${finding.details.region}`, {
            x: 250,
            y: detailY,
            size: 9,
            font: boldFont,
            color: rgb(0.4, 0.47, 0.55),
          });
        }
        
        // Resource ID/ARN
        detailY -= 18;
        if (finding.details?.resourceId) {
          const resourceText = `ID: ${finding.details.resourceId}`;
          const resourceLines = wrapText(resourceText, 65);
          resourceLines.slice(0, 1).forEach((line: string) => {
            page.drawText(line, {
              x: 60,
              y: detailY,
              size: 8,
              font: regularFont,
              color: rgb(0.3, 0.35, 0.4),
            });
            detailY -= 12;
          });
        }
        
        if (finding.details?.resourceArn) {
          const arnText = `ARN: ${finding.details.resourceArn}`;
          const arnLines = wrapText(arnText, 65);
          arnLines.slice(0, 1).forEach((line: string) => {
            page.drawText(line, {
              x: 60,
              y: detailY,
              size: 8,
              font: regularFont,
              color: rgb(0.3, 0.35, 0.4),
            });
            detailY -= 12;
          });
        }
        
        // Full Description
        detailY -= 6;
        page.drawText('Descricao:', {
          x: 60,
          y: detailY,
          size: 9,
          font: boldFont,
          color: rgb(0.4, 0.47, 0.55),
        });
        
        detailY -= 14;
        const fullDesc = finding.details?.full_description || finding.ai_analysis || 'Sem descricao disponivel';
        const descLines = wrapText(fullDesc, 70);
        descLines.slice(0, 3).forEach((line: string) => {
          page.drawText(line, {
            x: 60,
            y: detailY,
            size: 8,
            font: regularFont,
            color: rgb(0.3, 0.35, 0.4),
          });
          detailY -= 11;
        });
        
        // AI Analysis / Recommendation
        if (finding.ai_analysis && detailY > yPos - 165) {
          detailY -= 6;
          page.drawText('Analise:', {
            x: 60,
            y: detailY,
            size: 9,
            font: boldFont,
            color: rgb(0.4, 0.47, 0.55),
          });
          
          detailY -= 14;
          const analysisLines = wrapText(finding.ai_analysis, 70);
          analysisLines.slice(0, 2).forEach((line: string) => {
            if (detailY > yPos - 175) {
              page.drawText(line, {
                x: 60,
                y: detailY,
                size: 8,
                font: regularFont,
                color: rgb(0.145, 0.388, 0.922),
              });
              detailY -= 11;
            }
          });
        }
        
        yPos -= 200;
      }
      
      // Add footer to findings page
      addEVOFooter(page);
    }

    // FINAL PAGE - Confidentiality Notice
    page = pdfDoc.addPage([595, 842]);
    yPos = 750;
    
    // EVO Header
    addEVOHeader(page, yPos);

    yPos = 400;
    
    // Confidential notice box
    page.drawRectangle({
      x: 50,
      y: yPos - 200,
      width: 495,
      height: 220,
      color: rgb(0.996, 0.949, 0.949),
      borderColor: rgb(0.863, 0.149, 0.149),
      borderWidth: 3,
    });
    
    page.drawText('DOCUMENTO CONFIDENCIAL', {
      x: 180,
      y: yPos - 40,
      size: 18,
      font: boldFont,
      color: rgb(0.6, 0.15, 0.15),
    });
    
    const footerLines = [
      'Este relatorio contem informacoes sensiveis de seguranca',
      'da sua infraestrutura AWS.',
      '',
      'Distribuicao Restrita',
      'Nao Compartilhar Sem Autorizacao',
      'Armazenar com Seguranca Maxima'
    ];
    
    footerLines.forEach((line, idx) => {
      page.drawText(line, {
        x: 140,
        y: yPos - 80 - (idx * 18),
        size: 11,
        font: idx >= 3 ? boldFont : regularFont,
        color: rgb(0.6, 0.15, 0.15),
      });
    });

    // Add footer to final page
    addEVOFooter(page);

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    const base64 = btoa(String.fromCharCode(...pdfBytes));

    console.log('✅ PDF generated successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        pdf: base64,
        filename: `evo-security-report-${new Date().toISOString().split('T')[0]}.pdf`
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  } catch (error) {
    console.error('PDF Generation Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate PDF' 
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});