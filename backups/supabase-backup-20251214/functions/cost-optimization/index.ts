import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getResolvedAWSCredentials, signAWSGetRequest } from '../_shared/aws-credentials-helper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting AWS Cost Optimization Analysis...');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // CRITICAL: Authenticate user and get organization from session
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authentication required');
    }

    // Decode JWT to extract user info (JWT already verified by verify_jwt = true)
    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userId = payload.sub;
    
    if (!userId) {
      console.error('❌ Failed to extract user ID from JWT');
      throw new Error('Authentication required');
    }

    console.log('✅ User authenticated:', userId);

    // Get organization from authenticated user - NEVER trust request body
    const { data: orgId, error: orgError } = await supabase.rpc('get_user_organization', { _user_id: userId });
    if (orgError || !orgId) {
      throw new Error('Organization not found for user');
    }

    console.log('✅ Organization:', orgId);

    // Parse accountId from body (optional)
    let accountIdFromBody: string | null = null;
    try {
      const body = await req.json();
      accountIdFromBody = body?.accountId || null;
    } catch (_) {
      // no body provided
    }

    // Get AWS credentials - CRITICAL: Validate organization ownership
    let credQuery = supabase
      .from('aws_credentials')
      .select('*')
      .eq('organization_id', orgId) // ENFORCE organization isolation
      .eq('is_active', true);

    // Apply accountId filter if specified
    if (accountIdFromBody) {
      credQuery = credQuery.eq('id', accountIdFromBody);
    }

    const { data: credentials, error: credError } = await credQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credError) {
      console.error('❌ Error fetching credentials:', credError);
      throw new Error('Error fetching AWS credentials');
    }

    if (!credentials) {
      console.error('❌ No credentials found');
      throw new Error('AWS credentials not found for this organization');
    }

    console.log('✅ AWS credentials loaded for account:', credentials.id);

    // CRITICAL: Resolve credentials via AssumeRole
    let resolvedCreds: { accessKeyId: string; secretAccessKey: string; sessionToken?: string; region: string };
    try {
      resolvedCreds = await getResolvedAWSCredentials(credentials, credentials.regions?.[0] || 'us-east-1');
      console.log('✅ Credentials resolved via AssumeRole');
    } catch (e) {
      console.error('❌ Failed to assume role:', e);
      throw new Error(`Falha ao assumir Role AWS: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    // Create scan record with organization_id
    const { data: scanRecord, error: scanError } = await supabase
      .from('security_scans')
      .insert({
        organization_id: credentials.organization_id,
        scan_type: 'cost_optimization',
        status: 'running',
        scan_config: { regions: credentials.regions }
      })
      .select()
      .single();

    if (scanError) {
      throw new Error(`Failed to create scan record: ${scanError.message}`);
    }

    console.log('Cost optimization scan created:', scanRecord.id);

    // Limpar recomendações anteriores desta organização
    console.log('Removing old recommendations for organization:', credentials.organization_id);
    const { error: deleteError } = await supabase
      .from('cost_recommendations')
      .delete()
      .eq('organization_id', credentials.organization_id);

    if (deleteError) {
      console.warn('Warning: Failed to delete old recommendations:', deleteError.message);
    } else {
      console.log('Old recommendations cleared successfully');
    }

    // Collect AWS resource data
    const resourceData = {
      ec2Instances: await listEC2Instances(resolvedCreds, credentials.regions),
      rdsInstances: await listRDSInstances(resolvedCreds, credentials.regions),
      s3Buckets: await listS3Buckets(resolvedCreds),
      volumes: await listEBSVolumes(resolvedCreds, credentials.regions),
      elasticIPs: await listElasticIPs(resolvedCreds, credentials.regions),
      loadBalancers: await listLoadBalancers(resolvedCreds, credentials.regions),
    };

    console.log('Resource data collected');

    let totalSavings = 0;
    let recommendationCount = 0;

    // Analyze each category with AI
    const categories = [
      {
        type: 'underutilized',
        title: 'Recursos Subutilizados',
        data: { ec2: resourceData.ec2Instances, rds: resourceData.rdsInstances, volumes: resourceData.volumes }
      },
      {
        type: 'rightsizing',
        title: 'Redimensionamento de Instâncias',
        data: { ec2: resourceData.ec2Instances, rds: resourceData.rdsInstances }
      },
      {
        type: 'savings_plan',
        title: 'Savings Plans e Reserved Instances',
        data: { ec2: resourceData.ec2Instances, rds: resourceData.rdsInstances }
      },
      {
        type: 'architecture',
        title: 'Otimizações Arquiteturais',
        data: { all: resourceData, currentRegions: credentials.regions }
      }
    ];

    // Analyze categories
    for (const category of categories) {
      console.log(`Analyzing ${category.type}...`);
      
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('AI request timeout')), 7000)
        );

        const aiResponse = await Promise.race([
          fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash-lite',
              messages: [
                {
                  role: 'system',
                  content: `Você é um especialista em FinOps e otimização de custos AWS com experiência em arquitetura cloud.
Analise os recursos AWS fornecidos e identifique oportunidades reais de economia de custos.
Seja específico com valores estimados de economia mensal e anual.
Responda em português brasileiro de forma profissional e acionável.`
                },
                {
                  role: 'user',
                  content: `Analise estes recursos AWS para ${category.title}:

${JSON.stringify(category.data, null, 2)}

Para cada oportunidade de otimização de custos identificada, retorne um objeto JSON com:
{
  "service": "nome do serviço AWS (EC2, RDS, S3, etc)",
  "resource_id": "ID do recurso afetado",
  "current_cost_monthly": 150.00,
  "projected_savings_monthly": 45.00,
  "projected_savings_yearly": 540.00,
  "savings_percentage": 30.0,
  "title": "título curto da recomendação",
  "description": "descrição clara (máximo 150 caracteres)",
  "implementation_steps": "passos detalhados de implementação em markdown",
  "ai_analysis": "análise completa incluindo impacto no negócio, riscos e benefícios",
  "priority": "critical|high|medium|low",
  "implementation_difficulty": "easy|medium|hard"
}

Retorne APENAS um array JSON válido com as recomendações. Se não houver oportunidades, retorne [].`
                }
              ],
            }),
          }),
          timeoutPromise
        ]) as Response;

        if (!aiResponse.ok) {
          console.error(`AI API error for ${category.type}:`, aiResponse.status);
          continue;
        }

        const aiData = await aiResponse.json();
        const aiContent = aiData.choices[0].message.content;

        let recommendations;
        try {
          const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/) || aiContent.match(/\[[\s\S]*\]/);
          const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiContent;
          recommendations = JSON.parse(jsonStr);
        } catch (e) {
          console.error(`Failed to parse AI response for ${category.type}`);
          continue;
        }

        if (!Array.isArray(recommendations)) {
          recommendations = [recommendations];
        }

        // Process recommendations
        for (const rec of recommendations) {
          const { error: recError } = await supabase
            .from('cost_recommendations')
            .insert({
              organization_id: credentials.organization_id,
              recommendation_type: category.type,
              service: rec.service,
              resource_id: rec.resource_id,
              current_cost_monthly: rec.current_cost_monthly,
              projected_savings_monthly: rec.projected_savings_monthly,
              projected_savings_yearly: rec.projected_savings_yearly,
              savings_percentage: rec.savings_percentage,
              title: rec.title,
              description: rec.description,
              implementation_steps: rec.implementation_steps,
              ai_analysis: rec.ai_analysis,
              priority: rec.priority,
              implementation_difficulty: rec.implementation_difficulty,
              status: 'pending',
              details: category.data,
              scan_id: scanRecord.id
            });

          if (recError) {
            console.error('Failed to insert recommendation:', recError);
          } else {
            totalSavings += rec.projected_savings_yearly || 0;
            recommendationCount++;
          }
        }
      } catch (error) {
        console.error(`Error analyzing ${category.type}:`, error);
      }
    }

    // Update scan record
    await supabase
      .from('security_scans')
      .update({
        status: 'completed',
        cost_recommendations_count: recommendationCount,
        total_projected_savings: totalSavings,
        completed_at: new Date().toISOString()
      })
      .eq('id', scanRecord.id);

    console.log(`Cost optimization completed. Recommendations: ${recommendationCount}, Total savings: $${totalSavings}/year`);

    return new Response(
      JSON.stringify({
        success: true,
        scan_id: scanRecord.id,
        recommendations_count: recommendationCount,
        total_yearly_savings: totalSavings
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Cost optimization error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

// AWS API Helper Functions using centralized credential helper
async function makeAWSRequest(
  resolvedCreds: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  service: string, 
  action: string, 
  region: string
) {
  try {
    // Normalize service name for endpoint
    const serviceForEndpoint = service === 'elbv2' ? 'elasticloadbalancing' : service;
    
    // Handle global services correctly
    let host: string;
    let signingRegion = region;
    
    if (service === 's3') {
      host = 's3.amazonaws.com';
      signingRegion = 'us-east-1';
    } else if (service === 'iam') {
      host = 'iam.amazonaws.com';
      signingRegion = 'us-east-1';
    } else if (service === 'cloudfront') {
      host = 'cloudfront.amazonaws.com';
      signingRegion = 'us-east-1';
    } else {
      host = `${serviceForEndpoint}.${region}.amazonaws.com`;
    }
    
    const queryParams = new URLSearchParams({ Action: action, Version: getAPIVersion(service) });
    const path = '/';
    const queryString = queryParams.toString();
    
    // Use appropriate service name for signing
    const serviceForSigning = service === 'elbv2' ? 'elasticloadbalancing' : service;
    
    const signedHeaders = await signAWSGetRequest(
      resolvedCreds,
      serviceForSigning,
      signingRegion,
      host,
      path,
      queryString
    );

    const response = await fetch(`https://${host}/?${queryString}`, {
      method: 'GET',
      headers: signedHeaders
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`AWS API ${service}/${action} failed (${response.status}):`, errorText.substring(0, 200));
      return [];
    }
    
    return parseXMLResponse(await response.text());
  } catch (error) {
    console.warn(`AWS API ${service}/${action} error:`, error instanceof Error ? error.message : error);
    return [];
  }
}

function getAPIVersion(service: string): string {
  const versions: Record<string, string> = {
    's3': '2006-03-01', 
    'ec2': '2016-11-15', 
    'rds': '2014-10-31',
    'elb': '2015-12-01', 
    'elbv2': '2015-12-01',
    'iam': '2010-05-08'
  };
  return versions[service] || '2014-11-01';
}

function parseXMLResponse(xml: string): any[] {
  const items: any[] = [];
  const matches = xml.match(/<(?:Bucket|member|item|Volume|Address|LoadBalancer)>([\s\S]*?)<\/(?:Bucket|member|item|Volume|Address|LoadBalancer)>/g);
  if (!matches) return items;
  for (const match of matches) {
    const item: any = {};
    const nameMatch = match.match(/<(?:Name|InstanceId|VolumeId|PublicIp|LoadBalancerName)>(.*?)<\//);
    if (nameMatch) item.name = nameMatch[1];
    items.push(item);
  }
  return items;
}

// MULTI-REGION: Helper to fetch resources from ALL configured regions
async function listFromAllRegions(creds: any, service: string, action: string, regions: string[]) {
  const allResults: any[] = [];
  
  for (const region of regions) {
    const result = await makeAWSRequest(creds, service, action, region);
    if (Array.isArray(result)) {
      allResults.push(...result.map(item => ({ ...item, region })));
    }
  }
  
  return allResults;
}

async function listEC2Instances(creds: any, regions: string[]) { 
  return listFromAllRegions(creds, 'ec2', 'DescribeInstances', regions);
}
async function listRDSInstances(creds: any, regions: string[]) { 
  return listFromAllRegions(creds, 'rds', 'DescribeDBInstances', regions);
}
async function listS3Buckets(creds: any) { 
  // S3 is global, only need to query once
  const result = await makeAWSRequest(creds, 's3', 'ListAllMyBuckets', 'us-east-1'); 
  return result || [];
}
async function listEBSVolumes(creds: any, regions: string[]) { 
  return listFromAllRegions(creds, 'ec2', 'DescribeVolumes', regions);
}
async function listElasticIPs(creds: any, regions: string[]) { 
  return listFromAllRegions(creds, 'ec2', 'DescribeAddresses', regions);
}
async function listLoadBalancers(creds: any, regions: string[]) { 
  return listFromAllRegions(creds, 'elbv2', 'DescribeLoadBalancers', regions);
}
