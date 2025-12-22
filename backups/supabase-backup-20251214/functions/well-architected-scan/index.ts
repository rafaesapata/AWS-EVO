import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getResolvedAWSCredentials } from '../_shared/aws-credentials-helper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PillarScore {
  pillar: string;
  score: number;
  checks_passed: number;
  checks_failed: number;
  critical_issues: number;
  high_issues: number;
  medium_issues: number;
  low_issues: number;
  recommendations: any[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting Well-Architected Framework Scan...');

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

    // Get user from auth token
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Get user's organization
    const { data: orgId, error: orgError } = await supabase.rpc('get_user_organization', {
      _user_id: user.id
    });

    if (orgError || !orgId) {
      throw new Error('Organization not found for user');
    }

    console.log('Running scan for organization:', orgId);

    // Get AWS credentials for this organization
    const { data: credentials, error: credError } = await supabase
      .from('aws_credentials')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credError || !credentials) {
      throw new Error('AWS credentials not found for this organization');
    }

    // Create scan record
    const { data: scanRecord, error: scanError } = await supabase
      .from('security_scans')
      .insert({
        organization_id: orgId,
        scan_type: 'well_architected',
        status: 'running',
        scan_config: { regions: credentials.regions }
      })
      .select()
      .single();

    if (scanError) {
      throw new Error(`Failed to create scan record: ${scanError.message}`);
    }

    console.log('Well-Architected scan created:', scanRecord.id);

    // Collect AWS resource data (reuse from other scans)
    const resourceData = await collectAWSResources(credentials);

    const pillarScores: PillarScore[] = [];

    // Analyze each pillar
    const pillars = [
      {
        name: 'operational_excellence',
        title: 'Excelência Operacional',
        description: 'Monitoramento, automação, processos e mudanças'
      },
      {
        name: 'security',
        title: 'Segurança',
        description: 'IAM, encryption, network security, compliance'
      },
      {
        name: 'reliability',
        title: 'Confiabilidade',
        description: 'Multi-AZ, backup, disaster recovery, auto-scaling'
      },
      {
        name: 'performance_efficiency',
        title: 'Eficiência de Performance',
        description: 'Right-sizing, storage optimization, database performance'
      },
      {
        name: 'cost_optimization',
        title: 'Otimização de Custos',
        description: 'Savings Plans, Spot, regiões, serverless'
      },
      {
        name: 'sustainability',
        title: 'Sustentabilidade',
        description: 'Energia renovável, Graviton, shutdown schedules'
      }
    ];

    // 🚀 OPTIMIZED: Analyze ALL pillars in parallel (not in groups)
    console.log('Analyzing all 6 pillars in parallel...');
    
    const pillarPromises = pillars.map(async (pillar) => {
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('AI request timeout')), 12000)
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
                  content: `AWS Well-Architected Expert for "${pillar.title}". Analyze resources and identify gaps. Response in Portuguese.`
                },
                {
                  role: 'user',
                  content: `Analyze AWS resources for "${pillar.title}" (${pillar.description}):

${JSON.stringify(resourceData, null, 2)}

Return JSON array with issues found:
[{"check_id":"ID","check_name":"Name","severity":"critical|high|medium|low","status":"passed|failed","description":"problem","recommendation":"solution"}]

Checks: ${getPillarChecks(pillar.name)}

Return ONLY JSON array. Empty [] if all ok.`
                }
              ],
              max_tokens: 2000,
            }),
          }),
          timeoutPromise
        ]) as Response;

        if (!aiResponse.ok) {
          console.error(`AI error for ${pillar.name}: ${aiResponse.status}`);
          return null;
        }

        const aiData = await aiResponse.json();
        const aiContent = aiData.choices[0].message.content;

        let checks;
        try {
          const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/) || aiContent.match(/\[[\s\S]*\]/);
          const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiContent;
          checks = JSON.parse(jsonStr);
        } catch (e) {
          console.error(`Parse error for ${pillar.name}`);
          checks = [];
        }

        if (!Array.isArray(checks)) checks = [checks];

        const passed = checks.filter((c: any) => c.status === 'passed').length;
        const failed = checks.filter((c: any) => c.status === 'failed').length;
        const critical = checks.filter((c: any) => c.severity === 'critical' && c.status === 'failed').length;
        const high = checks.filter((c: any) => c.severity === 'high' && c.status === 'failed').length;
        const medium = checks.filter((c: any) => c.severity === 'medium' && c.status === 'failed').length;
        const low = checks.filter((c: any) => c.severity === 'low' && c.status === 'failed').length;
        const totalChecks = passed + failed;
        const score = totalChecks > 0 ? (passed / totalChecks) * 100 : 100;

        console.log(`✅ ${pillar.name}: score ${score.toFixed(1)}, ${failed} issues`);

        return {
          pillar: pillar.name,
          score: Math.round(score * 100) / 100,
          checks_passed: passed,
          checks_failed: failed,
          critical_issues: critical,
          high_issues: high,
          medium_issues: medium,
          low_issues: low,
          recommendations: checks.filter((c: any) => c.status === 'failed')
        };
      } catch (error) {
        console.error(`Error analyzing ${pillar.name}:`, error);
        return null;
      }
    });

    const results = await Promise.all(pillarPromises);
    
    // Filter valid results and save to DB
    for (const result of results) {
      if (result) {
        pillarScores.push(result);
        await supabase.from('well_architected_scores').insert({ scan_id: scanRecord.id, ...result });
      }
    }

    // Calculate overall score
    const overallScore = pillarScores.reduce((sum, p) => sum + p.score, 0) / pillarScores.length;

    // Calculate totals
    const totalChecks = pillarScores.reduce((sum, p) => sum + p.checks_passed + p.checks_failed, 0);
    const checksPassed = pillarScores.reduce((sum, p) => sum + p.checks_passed, 0);
    const checksFailed = pillarScores.reduce((sum, p) => sum + p.checks_failed, 0);
    const criticalIssues = pillarScores.reduce((sum, p) => sum + p.critical_issues, 0);
    const highIssues = pillarScores.reduce((sum, p) => sum + p.high_issues, 0);
    const mediumIssues = pillarScores.reduce((sum, p) => sum + p.medium_issues, 0);
    const lowIssues = pillarScores.reduce((sum, p) => sum + p.low_issues, 0);

    // Update scan record
    await supabase
      .from('security_scans')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', scanRecord.id);

    // Save to history
    const pillarScoreMap = pillarScores.reduce((acc, p) => {
      acc[p.pillar] = p.score;
      return acc;
    }, {} as Record<string, number>);

    await supabase
      .from('well_architected_scans_history')
      .insert({
        organization_id: orgId,
        scan_id: scanRecord.id,
        scan_date: new Date().toISOString(),
        overall_score: Math.round(overallScore * 100) / 100,
        operational_excellence_score: pillarScoreMap['operational_excellence'] || 0,
        security_score: pillarScoreMap['security'] || 0,
        reliability_score: pillarScoreMap['reliability'] || 0,
        performance_efficiency_score: pillarScoreMap['performance_efficiency'] || 0,
        cost_optimization_score: pillarScoreMap['cost_optimization'] || 0,
        sustainability_score: pillarScoreMap['sustainability'] || 0,
        total_checks: totalChecks,
        checks_passed: checksPassed,
        checks_failed: checksFailed,
        critical_issues: criticalIssues,
        high_issues: highIssues,
        medium_issues: mediumIssues,
        low_issues: lowIssues,
        pillar_details: pillarScores
      });

    console.log(`Well-Architected scan completed. Overall score: ${overallScore.toFixed(2)}/100`);

    return new Response(
      JSON.stringify({
        success: true,
        scan_id: scanRecord.id,
        overall_score: Math.round(overallScore * 100) / 100,
        pillar_scores: pillarScores
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Well-Architected scan error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function getPillarChecks(pillar: string): string {
  const checks: Record<string, string> = {
    operational_excellence: `
- CloudWatch Logs habilitado
- Alarmes configurados para métricas críticas
- Recursos criados via IaC (não manual)
- Backup automation
- Runbooks documentados
`,
    security: `
- Security Groups sem 0.0.0.0/0 em portas críticas
- S3 buckets privados (não public)
- RDS não público
- Encryption at rest (S3, RDS, EBS)
- MFA habilitado em usuários privilegiados
- Access keys rotacionadas (< 90 dias)
- VPC Flow Logs habilitados
- WAF em Load Balancers públicos
`,
    reliability: `
- RDS Multi-AZ habilitado
- Recursos distribuídos em múltiplas AZs
- Auto Scaling configurado
- Backups automatizados
- Snapshots testados
- Health checks configurados
`,
    performance_efficiency: `
- Instance types modernos (t3/t4g, m5/m6g)
- EBS gp3 (não gp2)
- Read replicas para bancos read-heavy
- Cache layer (ElastiCache)
- CloudFront para static assets
`,
    cost_optimization: `
- Savings Plans ou Reserved Instances
- Spot Instances onde aplicável
- Recursos ociosos (CPU < 10%)
- Volumes EBS não anexados
- Elastic IPs não utilizados
- Serverless onde aplicável (Lambda)
`,
    sustainability: `
- Uso de regiões com energia renovável
- Graviton instances (ARM)
- Shutdown schedules para dev/test
- Right-sizing (não over-provisioned)
`
  };

  return checks[pillar] || '';
}

async function collectAWSResources(credentials: any) {
  console.log('Collecting AWS resources from all regions...');
  
  const allResources = {
    ec2_instances: [] as any[],
    rds_instances: [] as any[],
    s3_buckets: [] as any[],
    elb_loadbalancers: [] as any[],
    lambda_functions: [] as any[],
    cloudwatch: { logs_enabled: false, alarms: [] as any[] },
    iam: {
      users: [] as any[],
      roles: [] as any[],
      policies: [] as any[],
      mfa_enabled: false,
      old_keys_count: 0
    },
    vpc: {
      vpcs: [] as any[],
      subnets: [] as any[],
      security_groups: [] as any[],
      flow_logs_enabled: false
    },
    kms: {
      keys: [] as any[]
    },
    regions: credentials.regions || ['us-east-1']
  };

  const AWS = await import('https://esm.sh/aws-sdk@2.1691.0');
  
  // Resolve credentials via AssumeRole if using CloudFormation roles
  let resolvedCreds: { accessKeyId: string; secretAccessKey: string; sessionToken?: string; region: string };
  try {
    resolvedCreds = await getResolvedAWSCredentials(credentials, credentials.regions?.[0] || 'us-east-1');
    console.log('✅ AWS Credentials resolved via AssumeRole for Well-Architected scan');
  } catch (e) {
    console.error('❌ Failed to resolve credentials:', e);
    throw new Error(`Failed to resolve AWS credentials: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }

  // Access AWS.default for ESM imports
  const AWSService = (AWS as any).default || AWS;
  
  AWSService.config.update({
    accessKeyId: resolvedCreds.accessKeyId,
    secretAccessKey: resolvedCreds.secretAccessKey,
    sessionToken: resolvedCreds.sessionToken,
    region: resolvedCreds.region
  });

  try {
    // IAM é global, coletar uma vez
    console.log('Collecting IAM data...');
    const iam = new AWSService.IAM();
    
    try {
      const users = await iam.listUsers().promise();
      allResources.iam.users = users.Users || [];
      
      // Verificar MFA e idade das keys
      for (const user of allResources.iam.users) {
        try {
          const mfaDevices = await iam.listMFADevices({ UserName: user.UserName }).promise();
          if (mfaDevices.MFADevices && mfaDevices.MFADevices.length > 0) {
            allResources.iam.mfa_enabled = true;
          }

          const accessKeys = await iam.listAccessKeys({ UserName: user.UserName }).promise();
          for (const key of accessKeys.AccessKeyMetadata || []) {
            if (key.CreateDate) {
              const ageInDays = (Date.now() - key.CreateDate.getTime()) / (1000 * 60 * 60 * 24);
              if (ageInDays > 90) {
                allResources.iam.old_keys_count++;
              }
            }
          }
        } catch (e) {
          console.warn(`Error checking user ${user.UserName}:`, e);
        }
      }
    } catch (e) {
      console.error('Error collecting IAM data:', e);
    }

    // KMS keys (global)
    console.log('Collecting KMS keys...');
    const kms = new AWSService.KMS({ region: credentials.regions?.[0] || 'us-east-1' });
    try {
      const keys = await kms.listKeys().promise();
      allResources.kms.keys = keys.Keys || [];
    } catch (e) {
      console.error('Error collecting KMS data:', e);
    }

    // S3 buckets (global)
    console.log('Collecting S3 buckets...');
    const s3 = new AWSService.S3();
    try {
      const buckets = await s3.listBuckets().promise();
      allResources.s3_buckets = buckets.Buckets || [];
      
      // Verificar configurações de cada bucket
      for (const bucket of allResources.s3_buckets) {
        try {
          const encryption = await s3.getBucketEncryption({ Bucket: bucket.Name }).promise();
          (bucket as any).encryption_enabled = !!encryption.ServerSideEncryptionConfiguration;
        } catch (e) {
          (bucket as any).encryption_enabled = false;
        }

        try {
          const publicBlock = await s3.getPublicAccessBlock({ Bucket: bucket.Name }).promise();
          (bucket as any).public_access_blocked = publicBlock.PublicAccessBlockConfiguration?.BlockPublicAcls;
        } catch (e) {
          (bucket as any).public_access_blocked = false;
        }
      }
    } catch (e) {
      console.error('Error collecting S3 data:', e);
    }

    // Coletar recursos por região
    for (const region of credentials.regions || ['us-east-1']) {
      console.log(`Collecting resources from region: ${region}`);
      
      AWSService.config.update({ region });

      // EC2 Instances
      try {
        const ec2 = new AWSService.EC2({ region });
        const instances = await ec2.describeInstances().promise();
        for (const reservation of instances.Reservations || []) {
          for (const instance of reservation.Instances || []) {
            allResources.ec2_instances.push({
              ...instance,
              Region: region
            });
          }
        }
      } catch (e) {
        console.error(`Error collecting EC2 from ${region}:`, e);
      }

      // RDS Instances
      try {
        const rds = new AWSService.RDS({ region });
        const dbInstances = await rds.describeDBInstances().promise();
        for (const db of dbInstances.DBInstances || []) {
          allResources.rds_instances.push({
            ...db,
            Region: region
          });
        }
      } catch (e) {
        console.error(`Error collecting RDS from ${region}:`, e);
      }

      // Load Balancers
      try {
        const elb = new AWSService.ELBv2({ region });
        const lbs = await elb.describeLoadBalancers().promise();
        for (const lb of lbs.LoadBalancers || []) {
          allResources.elb_loadbalancers.push({
            ...lb,
            Region: region
          });
        }
      } catch (e) {
        console.error(`Error collecting ELB from ${region}:`, e);
      }

      // Lambda Functions
      try {
        const lambda = new AWSService.Lambda({ region });
        const functions = await lambda.listFunctions().promise();
        for (const func of functions.Functions || []) {
          allResources.lambda_functions.push({
            ...func,
            Region: region
          });
        }
      } catch (e) {
        console.error(`Error collecting Lambda from ${region}:`, e);
      }

      // VPC & Security Groups
      try {
        const ec2 = new AWSService.EC2({ region });
        
        const vpcs = await ec2.describeVpcs().promise();
        for (const vpc of vpcs.Vpcs || []) {
          allResources.vpc.vpcs.push({
            ...vpc,
            Region: region
          });
        }

        const sgs = await ec2.describeSecurityGroups().promise();
        for (const sg of sgs.SecurityGroups || []) {
          allResources.vpc.security_groups.push({
            ...sg,
            Region: region
          });
        }

        const subnets = await ec2.describeSubnets().promise();
        for (const subnet of subnets.Subnets || []) {
          allResources.vpc.subnets.push({
            ...subnet,
            Region: region
          });
        }
      } catch (e) {
        console.error(`Error collecting VPC from ${region}:`, e);
      }

      // CloudWatch
      try {
        const cloudwatch = new AWSService.CloudWatch({ region });
        const alarms = await cloudwatch.describeAlarms().promise();
        allResources.cloudwatch.alarms.push(...(alarms.MetricAlarms || []));
        allResources.cloudwatch.logs_enabled = (alarms.MetricAlarms?.length || 0) > 0;
      } catch (e) {
        console.error(`Error collecting CloudWatch from ${region}:`, e);
      }
    }

    console.log('AWS resource collection complete:', {
      ec2: allResources.ec2_instances.length,
      rds: allResources.rds_instances.length,
      s3: allResources.s3_buckets.length,
      lambda: allResources.lambda_functions.length,
      elb: allResources.elb_loadbalancers.length,
      iam_users: allResources.iam.users.length,
      security_groups: allResources.vpc.security_groups.length
    });

    return allResources;
  } catch (error) {
    console.error('Error collecting AWS resources:', error);
    return allResources; // Retornar dados parciais
  }
}
