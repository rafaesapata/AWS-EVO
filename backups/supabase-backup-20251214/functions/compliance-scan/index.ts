import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ComplianceControl {
  control_id: string;
  control_name: string;
  status: 'passed' | 'failed';
  severity: 'critical' | 'high' | 'medium' | 'low';
  evidence: any;
  remediation_steps?: string;
}

serve(async (req) => {
  console.log('=== COMPLIANCE-SCAN FUNCTION CALLED ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', JSON.stringify(Object.fromEntries(req.headers.entries())));
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    console.log('Received request body:', JSON.stringify(requestBody));
    
    const { frameworkId, scanId } = requestBody;
    console.log('Extracted frameworkId:', frameworkId, 'scanId:', scanId);
    
    // Validate required parameters
    if (!frameworkId) {
      console.error('frameworkId is missing from request body');
      console.error('Available keys in request:', Object.keys(requestBody));
      return new Response(
        JSON.stringify({ success: false, error: 'frameworkId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    console.log(`Starting compliance scan for framework: ${frameworkId}`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Get authorization token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    // Create Supabase client with service role key for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth token - Decode JWT directly (JWT already verified by verify_jwt = true)
    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userId = payload.sub;
    
    if (!userId) {
      throw new Error('Invalid authentication token');
    }

    // Get user's organization ID
    const { data: orgId, error: orgError } = await supabase.rpc('get_user_organization', { 
      _user_id: userId 
    });

    if (orgError || !orgId) {
      throw new Error('Organization ID not found');
    }

    const organizationId = orgId;

    // Get AWS credentials
    const { data: credentials, error: credError } = await supabase
      .from('aws_credentials')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credError || !credentials) {
      throw new Error('AWS credentials not found');
    }

    // Get existing findings for context
    const { data: findings } = await supabase
      .from('findings')
      .select('*')
      .eq('source', 'security_scan')
      .limit(50);

    // Get security posture for context
    const { data: posture } = await supabase
      .from('security_posture')
      .select('*')
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Framework-specific control sets
    const frameworkControls = getFrameworkControls(frameworkId);

    console.log(`Running ${frameworkControls.length} controls for ${frameworkId}`);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_tokens: 4000, // Increase token limit to avoid truncation
        messages: [
          {
            role: 'system',
            content: `Você é um auditor de compliance especializado em ${getFrameworkName(frameworkId)}.
Analise a infraestrutura AWS e determine se os controles de compliance estão sendo atendidos.

IMPORTANTE - CRITÉRIOS DE AVALIAÇÃO:
- Seja RIGOROSO e REALISTA na avaliação
- Use "passed" APENAS quando houver evidência CLARA e COMPLETA de conformidade
- Use "failed" quando:
  * Não houver evidência suficiente de conformidade
  * A implementação estiver incompleta ou parcial
  * Houver qualquer desvio dos requisitos do controle
- Baseie-se nas melhores práticas do CIS Benchmark v3.0.0
- Priorize segurança e conformidade sobre otimismo

Para CIS AWS, considere especialmente:
- IAM: Políticas devem ser restritivas, MFA obrigatório, rotação de credenciais
- Logging: CloudTrail e logs devem estar ativos em TODAS as regiões
- Monitoring: Alarmes CloudWatch devem existir para eventos críticos
- Network: Security Groups devem ser restritivos, sem 0.0.0.0/0 em portas críticas
- Storage: S3 buckets devem ser privados e encriptados

Responda em português brasileiro com análises práticas e acionáveis.`
          },
          {
            role: 'user',
            content: `Analise os seguintes dados da AWS para verificar compliance com ${getFrameworkName(frameworkId)}:

ACHADOS DE SEGURANÇA:
${JSON.stringify(findings?.slice(0, 20) || [], null, 2)}

POSTURA DE SEGURANÇA ATUAL:
${JSON.stringify(posture || {}, null, 2)}

CONTROLES A VERIFICAR:
${frameworkControls.map(c => `- ${c.control_id}: ${c.control_name}`).join('\n')}

Para cada controle, retorne um objeto JSON:
{
  "control_id": "ID do controle",
  "control_name": "Nome do controle",
  "status": "passed" ou "failed",
  "severity": "critical|high|medium|low",
  "evidence": { 
    "found": "descreva a evidência encontrada ou falta dela",
    "resources_checked": "quais recursos foram analisados",
    "compliance_gap": "se failed, descreva o gap de conformidade"
  },
  "remediation_steps": "passos DETALHADOS e ESPECÍFICOS para remediar (obrigatório se failed)"
}

CRITÉRIOS DE SEVERIDADE para CIS AWS:
- critical: Controles de IAM root, MFA, CloudTrail, acesso público irrestrito
- high: Logging desabilitado, encriptação ausente, credenciais expostas
- medium: Alarmes faltando, configurações subótimas
- low: Melhorias incrementais, hardening adicional

Retorne APENAS um array JSON válido com os resultados, sem texto adicional.
Seja RIGOROSO: marque como "failed" se não houver evidência COMPLETA de conformidade.`
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0].message.content;

    let controls: ComplianceControl[];
    try {
      // Remove markdown code blocks if present
      let cleanContent = aiContent.trim();
      
      // Try to extract JSON from markdown code block
      const markdownMatch = cleanContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (markdownMatch) {
        cleanContent = markdownMatch[1].trim();
      }
      
      // Try to extract just the JSON array if there's extra text
      const jsonMatch = cleanContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        cleanContent = jsonMatch[0];
      }
      
      // Fix common JSON issues
      // 1. Remove trailing commas before closing brackets
      cleanContent = cleanContent.replace(/,(\s*[}\]])/g, '$1');
      
      // 2. Fix unterminated strings - more robust approach
      try {
        // First attempt: parse as-is
        controls = JSON.parse(cleanContent);
      } catch (firstParseError) {
        console.log('First parse failed, attempting to fix truncated JSON...');
        
        // Try to find the last complete object
        const objects = [];
        let depth = 0;
        let inString = false;
        let currentObject = '';
        let startIndex = -1;
        
        for (let i = 0; i < cleanContent.length; i++) {
          const char = cleanContent[i];
          const prevChar = i > 0 ? cleanContent[i - 1] : '';
          
          if (char === '"' && prevChar !== '\\') {
            inString = !inString;
          }
          
          if (!inString) {
            if (char === '{') {
              if (depth === 0) startIndex = i;
              depth++;
            } else if (char === '}') {
              depth--;
              if (depth === 0 && startIndex >= 0) {
                objects.push(cleanContent.substring(startIndex, i + 1));
              }
            }
          }
        }
        
        if (objects.length > 0) {
          cleanContent = '[' + objects.join(',') + ']';
          console.log(`Recovered ${objects.length} complete objects from truncated response`);
        } else {
          throw firstParseError;
        }
        
        controls = JSON.parse(cleanContent);
      }
      
      console.log('Successfully parsed', controls.length, 'compliance controls');
      
      if (!Array.isArray(controls)) {
        throw new Error('Response is not an array');
      }
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      console.error('Original content:', aiContent.substring(0, 500));
      throw new Error('Failed to parse compliance results from AI');
    }

    if (!Array.isArray(controls)) {
      controls = [controls];
    }

    console.log(`AI returned ${controls.length} control results`);

    // Insert compliance checks into database
    let insertedCount = 0;
    for (const control of controls) {
      const { error: insertError } = await supabase
        .from('compliance_checks')
        .insert({
          scan_id: scanId,
          framework: frameworkId,
          control_id: control.control_id,
          control_name: control.control_name,
          status: control.status,
          severity: control.severity || 'medium',
          evidence: control.evidence,
          remediation_steps: control.remediation_steps
        });

      if (insertError) {
        console.error('Failed to insert compliance check:', insertError);
      } else {
        insertedCount++;
      }
    }

    console.log(`Compliance scan completed. ${insertedCount} checks inserted.`);

    return new Response(
      JSON.stringify({
        success: true,
        framework: frameworkId,
        checksCount: insertedCount,
        passed: controls.filter(c => c.status === 'passed').length,
        failed: controls.filter(c => c.status === 'failed').length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Compliance scan error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function getFrameworkName(frameworkId: string): string {
  const names: Record<string, string> = {
    'lgpd': 'LGPD (Lei Geral de Proteção de Dados)',
    'gdpr': 'GDPR (General Data Protection Regulation)',
    'hipaa': 'HIPAA (Health Insurance Portability and Accountability Act)',
    'pci-dss': 'PCI-DSS (Payment Card Industry Data Security Standard)',
    'cis': 'CIS Amazon Web Services Foundations Benchmark',
  };
  return names[frameworkId] || frameworkId;
}

function getFrameworkControls(frameworkId: string): { control_id: string; control_name: string }[] {
  const controls: Record<string, { control_id: string; control_name: string }[]> = {
    'lgpd': [
      { control_id: 'LGPD-1.1', control_name: 'Dados pessoais criptografados em repouso' },
      { control_id: 'LGPD-1.2', control_name: 'Dados pessoais criptografados em trânsito' },
      { control_id: 'LGPD-2.1', control_name: 'Controles de acesso baseados em funções (RBAC)' },
      { control_id: 'LGPD-2.2', control_name: 'Logs de auditoria de acesso a dados pessoais' },
      { control_id: 'LGPD-3.1', control_name: 'Política de retenção de dados implementada' },
      { control_id: 'LGPD-3.2', control_name: 'Mecanismo de exclusão de dados pessoais' },
      { control_id: 'LGPD-4.1', control_name: 'Backups criptografados' },
      { control_id: 'LGPD-5.1', control_name: 'Monitoramento de vazamento de dados' },
      { control_id: 'LGPD-6.1', control_name: 'Portabilidade de dados habilitada' },
      { control_id: 'LGPD-7.1', control_name: 'Armazenamento de dados em região brasileira (compliance territorial)' },
    ],
    'gdpr': [
      { control_id: 'GDPR-Art5.1', control_name: 'Dados processados de forma lícita, leal e transparente' },
      { control_id: 'GDPR-Art6.1', control_name: 'Base legal para processamento documentada' },
      { control_id: 'GDPR-Art25', control_name: 'Privacy by Design implementado' },
      { control_id: 'GDPR-Art32.1', control_name: 'Criptografia de dados pessoais' },
      { control_id: 'GDPR-Art32.2', control_name: 'Pseudonimização de dados onde aplicável' },
      { control_id: 'GDPR-Art30', control_name: 'Registro de atividades de processamento mantido' },
      { control_id: 'GDPR-Art33', control_name: 'Procedimento de notificação de violação (72h)' },
      { control_id: 'GDPR-Art15', control_name: 'Direito de acesso do titular implementado' },
      { control_id: 'GDPR-Art17', control_name: 'Direito ao esquecimento implementado' },
      { control_id: 'GDPR-Art20', control_name: 'Portabilidade de dados habilitada' },
    ],
    'hipaa': [
      { control_id: 'HIPAA-164.312(a)(1)', control_name: 'Controle de acesso a PHI' },
      { control_id: 'HIPAA-164.312(a)(2)', control_name: 'Identificação única de usuários' },
      { control_id: 'HIPAA-164.312(b)', control_name: 'Logs de auditoria de acesso a PHI' },
      { control_id: 'HIPAA-164.312(c)(1)', control_name: 'Proteção de integridade de PHI' },
      { control_id: 'HIPAA-164.312(d)', control_name: 'Autenticação de usuários' },
      { control_id: 'HIPAA-164.312(e)(1)', control_name: 'Criptografia de PHI em trânsito' },
      { control_id: 'HIPAA-164.312(e)(2)', control_name: 'Criptografia de PHI em repouso' },
      { control_id: 'HIPAA-164.308(a)(1)', control_name: 'Análise de risco de segurança' },
      { control_id: 'HIPAA-164.308(a)(3)', control_name: 'Políticas de senha e acesso' },
      { control_id: 'HIPAA-164.308(a)(6)', control_name: 'Resposta a incidentes de segurança' },
    ],
    'pci-dss': [
      { control_id: 'PCI-1.1', control_name: 'Firewall configurado para proteger dados de cartões' },
      { control_id: 'PCI-2.1', control_name: 'Senhas padrão alteradas' },
      { control_id: 'PCI-2.2', control_name: 'Hardening de sistemas' },
      { control_id: 'PCI-3.4', control_name: 'PAN renderizado ilegível' },
      { control_id: 'PCI-3.5', control_name: 'Chaves criptográficas protegidas' },
      { control_id: 'PCI-4.1', control_name: 'Criptografia forte em redes públicas' },
      { control_id: 'PCI-6.2', control_name: 'Patches de segurança aplicados' },
      { control_id: 'PCI-8.2', control_name: 'Autenticação multi-fator para acessos remotos' },
      { control_id: 'PCI-10.1', control_name: 'Trilhas de auditoria de acesso a dados de cartão' },
      { control_id: 'PCI-11.2', control_name: 'Scans de vulnerabilidade trimestrais' },
    ],
    'cis': [
      // Identity and Access Management
      { control_id: 'CIS-1.1', control_name: 'Evitar uso da conta root' },
      { control_id: 'CIS-1.2', control_name: 'MFA habilitado na conta root' },
      { control_id: 'CIS-1.3', control_name: 'Credenciais não utilizadas há mais de 90 dias removidas' },
      { control_id: 'CIS-1.4', control_name: 'Rotação de access keys a cada 90 dias' },
      { control_id: 'CIS-1.5', control_name: 'Política de senha forte (mínimo 14 caracteres)' },
      { control_id: 'CIS-1.6', control_name: 'Reutilização de senhas prevenida (últimas 24 senhas)' },
      { control_id: 'CIS-1.7', control_name: 'Expiração de senha configurada (90 dias)' },
      { control_id: 'CIS-1.8', control_name: 'MFA habilitado para todos usuários IAM' },
      { control_id: 'CIS-1.9', control_name: 'Access keys não criadas durante setup inicial de usuário root' },
      { control_id: 'CIS-1.10', control_name: 'Políticas IAM não anexadas diretamente a usuários' },
      { control_id: 'CIS-1.11', control_name: 'Credenciais IAM não utilizadas desabilitadas' },
      { control_id: 'CIS-1.12', control_name: 'Apenas uma access key ativa por usuário IAM' },
      
      // Logging
      { control_id: 'CIS-2.1', control_name: 'CloudTrail habilitado em todas regiões' },
      { control_id: 'CIS-2.2', control_name: 'CloudTrail log file validation habilitada' },
      { control_id: 'CIS-2.3', control_name: 'S3 bucket de CloudTrail não público' },
      { control_id: 'CIS-2.4', control_name: 'CloudTrail integrado com CloudWatch Logs' },
      { control_id: 'CIS-2.5', control_name: 'AWS Config habilitado em todas regiões' },
      { control_id: 'CIS-2.6', control_name: 'S3 bucket logging habilitado para buckets CloudTrail' },
      { control_id: 'CIS-2.7', control_name: 'CloudTrail logs encriptados em repouso usando KMS' },
      { control_id: 'CIS-2.8', control_name: 'Rotação de chaves KMS habilitada' },
      { control_id: 'CIS-2.9', control_name: 'VPC Flow Logs habilitado em todas VPCs' },
      
      // Monitoring
      { control_id: 'CIS-3.1', control_name: 'Alarme CloudWatch para uso não autorizado de API' },
      { control_id: 'CIS-3.2', control_name: 'Alarme para login no console sem MFA' },
      { control_id: 'CIS-3.3', control_name: 'Alarme para uso da conta root' },
      { control_id: 'CIS-3.4', control_name: 'Alarme para mudanças em políticas IAM' },
      { control_id: 'CIS-3.5', control_name: 'Alarme para mudanças em CloudTrail' },
      { control_id: 'CIS-3.6', control_name: 'Alarme para falhas de autenticação no console' },
      { control_id: 'CIS-3.7', control_name: 'Alarme para desabilitação de chaves KMS' },
      { control_id: 'CIS-3.8', control_name: 'Alarme para mudanças em S3 bucket policies' },
      { control_id: 'CIS-3.9', control_name: 'Alarme para mudanças em AWS Config' },
      { control_id: 'CIS-3.10', control_name: 'Alarme para mudanças em Security Groups' },
      { control_id: 'CIS-3.11', control_name: 'Alarme para mudanças em NACLs' },
      { control_id: 'CIS-3.12', control_name: 'Alarme para mudanças em Network Gateways' },
      { control_id: 'CIS-3.13', control_name: 'Alarme para mudanças em Route Tables' },
      { control_id: 'CIS-3.14', control_name: 'Alarme para mudanças em VPCs' },
      
      // Networking
      { control_id: 'CIS-4.1', control_name: 'Security Groups não permitem 0.0.0.0/0 em porta 22 (SSH)' },
      { control_id: 'CIS-4.2', control_name: 'Security Groups não permitem 0.0.0.0/0 em porta 3389 (RDP)' },
      { control_id: 'CIS-4.3', control_name: 'VPC default não existe ou está vazia' },
      { control_id: 'CIS-4.4', control_name: 'Security Groups não permitem acesso irrestrito a portas críticas' },
      { control_id: 'CIS-4.5', control_name: 'Network ACLs restringem tráfego não autorizado' },
      
      // Storage
      { control_id: 'CIS-5.1', control_name: 'S3 buckets não são públicos' },
      { control_id: 'CIS-5.2', control_name: 'S3 bucket-level Public Access Block habilitado' },
      { control_id: 'CIS-5.3', control_name: 'S3 buckets com encriptação server-side habilitada' },
      { control_id: 'CIS-5.4', control_name: 'EBS encryption by default habilitado' },
    ],
  };

  return controls[frameworkId] || [
    { 
      control_id: `${(frameworkId || 'UNKNOWN').toUpperCase()}-1`, 
      control_name: 'Controle de compliance genérico' 
    }
  ];
}
