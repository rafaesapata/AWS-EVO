import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Dynamic import
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.7.1');

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

    console.log('📄 Generating professional security PDF report with EVO branding...');

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
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
    let page = pdfDoc.addPage([595, 842]); // A4
    let yPos = 750;
    
    // EVO Logo and branding
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

    // Confidential banner
    page.drawRectangle({
      x: 0,
      y: yPos - 80,
      width: 595,
      height: 40,
      color: rgb(0.863, 0.149, 0.149),
    });
    
    page.drawText('DOCUMENTO CONFIDENCIAL', {
      x: 180,
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
    
    page.drawText('Analise Completa de Postura de Seguranca', {
      x: 50,
      y: yPos - 40,
      size: 16,
      font: regularFont,
      color: rgb(0.4, 0.47, 0.55),
    });

    // Score box
    yPos = 400;
    page.drawRectangle({
      x: 150,
      y: yPos - 120,
      width: 295,
      height: 150,
      color: rgb(0.4, 0.49, 0.918),
      borderColor: rgb(0.145, 0.388, 0.922),
      borderWidth: 3,
    });
    
    page.drawText('Security Score', {
      x: 230,
      y: yPos - 40,
      size: 18,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
    
    page.drawText(`${posture?.overall_score?.toFixed(0) || 0}/100`, {
      x: 240,
      y: yPos - 90,
      size: 48,
      font: boldFont,
      color: rgb(1, 1, 1),
    });

    page.drawText(`Gerado em: ${date}`, {
      x: 50,
      y: 180,
      size: 12,
      font: regularFont,
      color: rgb(0.4, 0.47, 0.55),
    });
    
    page.drawText(`Gerado por: ${userEmail || 'Sistema'}`, {
      x: 50,
      y: 160,
      size: 12,
      font: regularFont,
      color: rgb(0.4, 0.47, 0.55),
    });

    // Add footer to cover page
    addEVOFooter(page);

    // PAGE 2 - Summary
    page = pdfDoc.addPage([595, 842]);
    yPos = 750;
    
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

    yPos = 680;
    page.drawText('Sumario Executivo', {
      x: 50,
      y: yPos,
      size: 28,
      font: boldFont,
      color: rgb(0.118, 0.161, 0.235),
    });

    // Metrics cards - posicionamento manual para evitar repetição
    yPos = 620;
    
    // Card 1: Críticos (top left)
    page.drawRectangle({
      x: 50,
      y: yPos - 80,
      width: 230,
      height: 90,
      color: rgb(0.97, 0.97, 0.98),
      borderColor: rgb(0.863, 0.149, 0.149),
      borderWidth: 3,
    });
    page.drawText('CRÍTICOS', {
      x: 65,
      y: yPos - 30,
      size: 10,
      font: boldFont,
      color: rgb(0.4, 0.47, 0.55),
    });
    page.drawText(String(criticalCount), {
      x: 130,
      y: yPos - 65,
      size: 40,
      font: boldFont,
      color: rgb(0.863, 0.149, 0.149),
    });
    
    // Card 2: Altos (top right)
    page.drawRectangle({
      x: 320,
      y: yPos - 80,
      width: 230,
      height: 90,
      color: rgb(0.97, 0.97, 0.98),
      borderColor: rgb(0.918, 0.345, 0.078),
      borderWidth: 3,
    });
    page.drawText('ALTOS', {
      x: 335,
      y: yPos - 30,
      size: 10,
      font: boldFont,
      color: rgb(0.4, 0.47, 0.55),
    });
    page.drawText(String(highCount), {
      x: 400,
      y: yPos - 65,
      size: 40,
      font: boldFont,
      color: rgb(0.918, 0.345, 0.078),
    });
    
    // Card 3: Médios (bottom left)
    page.drawRectangle({
      x: 50,
      y: yPos - 200,
      width: 230,
      height: 90,
      color: rgb(0.97, 0.97, 0.98),
      borderColor: rgb(0.918, 0.702, 0.031),
      borderWidth: 3,
    });
    page.drawText('MÉDIOS', {
      x: 65,
      y: yPos - 150,
      size: 10,
      font: boldFont,
      color: rgb(0.4, 0.47, 0.55),
    });
    page.drawText(String(mediumCount), {
      x: 130,
      y: yPos - 185,
      size: 40,
      font: boldFont,
      color: rgb(0.918, 0.702, 0.031),
    });
    
    // Card 4: Baixos (bottom right)
    page.drawRectangle({
      x: 320,
      y: yPos - 200,
      width: 230,
      height: 90,
      color: rgb(0.97, 0.97, 0.98),
      borderColor: rgb(0.231, 0.510, 0.965),
      borderWidth: 3,
    });
    page.drawText('BAIXOS', {
      x: 335,
      y: yPos - 150,
      size: 10,
      font: boldFont,
      color: rgb(0.4, 0.47, 0.55),
    });
    page.drawText(String(lowCount), {
      x: 400,
      y: yPos - 185,
      size: 40,
      font: boldFont,
      color: rgb(0.231, 0.510, 0.965),
    });

    // Add footer to page 2
    addEVOFooter(page);

    // PAGE 3+ - Detailed Findings
    const findingsPerPage = 3;
    let currentFindingIndex = 0;
    
    while (currentFindingIndex < findings.length) {
      page = pdfDoc.addPage([595, 842]);
      yPos = 750;
      
      // Header
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

      yPos = 680;
      page.drawText('Detalhamento das Vulnerabilidades', {
        x: 50,
        y: yPos,
        size: 24,
        font: boldFont,
        color: rgb(0.118, 0.161, 0.235),
      });

      yPos = 640;
      
      // Display findings
      const endIndex = Math.min(currentFindingIndex + findingsPerPage, findings.length);
      
      for (let i = currentFindingIndex; i < endIndex; i++) {
        const finding = findings[i];
        const severityColor = finding.severity === 'critical' ? rgb(0.863, 0.149, 0.149) :
                               finding.severity === 'high' ? rgb(0.918, 0.345, 0.078) :
                               finding.severity === 'medium' ? rgb(0.918, 0.702, 0.031) :
                               rgb(0.231, 0.510, 0.965);
        
        // Finding box
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
        
        page.drawText(finding.severity.toUpperCase(), {
          x: 70,
          y: yPos - 24,
          size: 10,
          font: boldFont,
          color: rgb(1, 1, 1),
        });
        
        // Title
        const titleLines = wrapText(finding.title || 'Sem título', 60);
        let titleY = yPos - 30;
        titleLines.slice(0, 2).forEach((line) => {
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
        page.drawText(`Servico: ${finding.service || 'N/A'}`, {
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
          resourceLines.slice(0, 1).forEach((line) => {
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
          arnLines.slice(0, 1).forEach((line) => {
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
        
        // Description
        detailY -= 6;
        page.drawText('Descricao:', {
          x: 60,
          y: detailY,
          size: 9,
          font: boldFont,
          color: rgb(0.4, 0.47, 0.55),
        });
        
        detailY -= 14;
        const descLines = wrapText(finding.description || 'Sem descricao disponivel', 70);
        descLines.slice(0, 3).forEach((line) => {
          page.drawText(line, {
            x: 60,
            y: detailY,
            size: 8,
            font: regularFont,
            color: rgb(0.3, 0.35, 0.4),
          });
          detailY -= 11;
        });
        
        // Recommendation
        if (finding.recommendation && detailY > yPos - 165) {
          detailY -= 6;
          page.drawText('Recomendacao:', {
            x: 60,
            y: detailY,
            size: 9,
            font: boldFont,
            color: rgb(0.4, 0.47, 0.55),
          });
          
          detailY -= 14;
          const recLines = wrapText(finding.recommendation, 70);
          recLines.slice(0, 2).forEach((line) => {
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
      
      addEVOFooter(page);
      currentFindingIndex = endIndex;
    }

    // Save and return
    const pdfBytes = await pdfDoc.save();
    const base64 = btoa(String.fromCharCode(...pdfBytes));

    console.log('✅ Real PDF generated successfully with EVO branding');

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
    console.error('PDF Export Error:', error);
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