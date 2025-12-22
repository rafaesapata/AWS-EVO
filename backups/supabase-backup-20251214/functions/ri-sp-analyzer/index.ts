import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getResolvedAWSCredentials, signAWSFormRequest } from '../_shared/aws-credentials-helper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 Starting RI/SP Analysis...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get organization from authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('❌ Missing Authorization header');
      throw new Error('Missing authorization header');
    }

    console.log('✅ Authorization header present');

    // Extract token from Bearer header
    const token = authHeader.replace('Bearer ', '');

    // Use service role client to verify the JWT token
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      console.error('❌ Auth error:', userError?.message || 'No user returned');
      throw new Error('User not authenticated');
    }

    console.log('👤 User authenticated:', user.id);

    const { data: orgId, error: orgError } = await supabase.rpc('get_user_organization', { _user_id: user.id });
    if (orgError || !orgId) {
      console.error('❌ Organization error:', orgError?.message || 'No organization returned');
      throw new Error('Organization not found for user');
    }

    console.log('🏢 Organization:', orgId);

    // Get AWS credentials for this organization
    const { data: credentials, error: credError } = await supabase
      .from('aws_credentials')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credError || !credentials) {
      console.error('❌ Credentials error:', credError);
      throw new Error('AWS credentials not found for organization');
    }

    console.log('✅ Credentials found for account:', credentials.account_name);

    // CRITICAL: Resolve credentials via AssumeRole
    let resolvedCreds;
    try {
      resolvedCreds = await getResolvedAWSCredentials(credentials, credentials.regions?.[0] || 'us-east-1');
      console.log('✅ Credentials resolved via AssumeRole');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('❌ Failed to resolve AWS credentials:', msg);
      throw new Error(`Failed to assume AWS role: ${msg}`);
    }

    const recommendations: any[] = [];
    const regions = credentials.regions || ['us-east-1'];

    console.log('Analyzing RI/SP opportunities for regions:', regions);

    for (const region of regions) {
      console.log(`Scanning region: ${region}`);
      
      // Get EC2 instances for RI recommendations
      const ec2Instances = await getEC2Instances(resolvedCreds, region);
      console.log(`Found ${ec2Instances.length} EC2 instances in ${region}`);
      
      // Analyze EC2 for RI recommendations
      for (const instance of ec2Instances) {
        const onDemandCost = estimateEC2Cost(instance.InstanceType, region);
        const riCost = onDemandCost * 0.65; // ~35% savings with 1-year RI
        const savings = onDemandCost - riCost;

        console.log(`EC2 ${instance.InstanceId} (${instance.InstanceType}): $${onDemandCost}/mo -> $${riCost}/mo (save $${savings})`);

        if (savings > 5) { // Lower threshold to $5/month
          recommendations.push({
            aws_account_id: credentials.id,
            recommendation_type: 'reserved_instance',
            service: 'EC2',
            instance_family: instance.InstanceType?.split('.')[0],
            region: region,
            term_length: '1year',
            payment_option: 'no_upfront',
            current_on_demand_cost: onDemandCost,
            recommended_commitment_cost: riCost,
            monthly_savings: savings,
            yearly_savings: savings * 12,
            break_even_months: 0,
            confidence_level: 85,
            recommendation_reason: `Instance ${instance.InstanceId} is running consistently. RI can save ~35% compared to On-Demand.`,
            resource_details: {
              instanceId: instance.InstanceId,
              instanceType: instance.InstanceType,
              currentState: instance.State?.Name
            }
          });
        }
      }

      // Get RDS instances for RI recommendations
      const rdsInstances = await getRDSInstances(resolvedCreds, region);
      console.log(`Found ${rdsInstances.length} RDS instances in ${region}`);
      
      for (const db of rdsInstances) {
        const onDemandCost = estimateRDSCost(db.DBInstanceClass, region);
        const riCost = onDemandCost * 0.60; // ~40% savings with 1-year RI
        const savings = onDemandCost - riCost;

        if (savings > 10) {
          recommendations.push({
            aws_account_id: credentials.id,
            recommendation_type: 'reserved_instance',
            service: 'RDS',
            instance_family: db.DBInstanceClass?.replace('db.', '').split('.')[0],
            region: region,
            term_length: '1year',
            payment_option: 'no_upfront',
            current_on_demand_cost: onDemandCost,
            recommended_commitment_cost: riCost,
            monthly_savings: savings,
            yearly_savings: savings * 12,
            break_even_months: 0,
            confidence_level: 80,
            recommendation_reason: `RDS instance ${db.DBInstanceIdentifier} is running. RI can save ~40% compared to On-Demand.`,
            resource_details: {
              dbInstanceIdentifier: db.DBInstanceIdentifier,
              dbInstanceClass: db.DBInstanceClass
            }
          });
        }
      }

      // Get ECS services for Compute Savings Plans recommendations
      const ecsServices = await getECSServices(resolvedCreds, region);
      console.log(`Found ${ecsServices.length} ECS services in ${region}`);

      for (const service of ecsServices) {
        const onDemandCost = estimateECSCost(service.TaskDefinition, service.RunningCount);
        const spCost = onDemandCost * 0.70; // ~30% savings with Compute SP
        const savings = onDemandCost - spCost;

        if (savings > 5 && service.RunningCount > 0) {
          recommendations.push({
            aws_account_id: credentials.id,
            recommendation_type: 'savings_plan',
            service: 'ECS',
            instance_family: 'fargate',
            region: region,
            term_length: '1year',
            payment_option: 'no_upfront',
            current_on_demand_cost: onDemandCost,
            recommended_commitment_cost: spCost,
            monthly_savings: savings,
            yearly_savings: savings * 12,
            break_even_months: 0,
            confidence_level: 75,
            recommendation_reason: `ECS service ${service.ServiceName} with ${service.RunningCount} running tasks. Compute Savings Plan can save ~30%.`,
            resource_details: {
              clusterArn: service.ClusterArn,
              serviceName: service.ServiceName,
              runningCount: service.RunningCount
            }
          });
        }
      }
    }

    // Save recommendations
    if (recommendations.length > 0) {
      const { error: insertError } = await supabase
        .from('ri_sp_recommendations')
        .upsert(recommendations, {
          onConflict: 'aws_account_id,service,region,recommendation_type',
          ignoreDuplicates: false
        });

      if (insertError) {
        console.error('Error saving recommendations:', insertError);
      } else {
        console.log(`Saved ${recommendations.length} recommendations`);
      }
    }

    const totalMonthlySavings = recommendations.reduce((sum, r) => sum + r.monthly_savings, 0);
    const totalYearlySavings = recommendations.reduce((sum, r) => sum + r.yearly_savings, 0);

    return new Response(
      JSON.stringify({
        success: true,
        recommendations_count: recommendations.length,
        total_monthly_savings: totalMonthlySavings.toFixed(2),
        total_yearly_savings: totalYearlySavings.toFixed(2),
        recommendations: recommendations.map(r => ({
          service: r.service,
          type: r.recommendation_type,
          monthly_savings: r.monthly_savings,
          reason: r.recommendation_reason
        }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in RI/SP analysis:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getEC2Instances(
  resolvedCreds: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  region: string
) {
  try {
    const response = await makeAWSRequest(resolvedCreds, region, 'ec2', 'DescribeInstances', {});
    
    const instances: any[] = [];
    if (response.Reservations) {
      for (const reservation of response.Reservations) {
        if (reservation.Instances) {
          for (const inst of reservation.Instances) {
            if (inst.State?.Name === 'running') {
              instances.push(inst);
            }
          }
        }
      }
    }
    return instances;
  } catch (error) {
    console.error(`Error fetching EC2 instances in ${region}:`, error);
    return [];
  }
}

async function getRDSInstances(
  resolvedCreds: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  region: string
) {
  try {
    const response = await makeAWSRequest(resolvedCreds, region, 'rds', 'DescribeDBInstances', {});
    return response.DBInstances || [];
  } catch (error) {
    console.error(`Error fetching RDS instances in ${region}:`, error);
    return [];
  }
}

async function getECSServices(
  resolvedCreds: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  region: string
) {
  try {
    // First, list all clusters
    const clustersResponse = await makeAWSRequest(resolvedCreds, region, 'ecs', 'ListClusters', {});
    const clusterArns = clustersResponse.ClusterArns || [];

    const services: any[] = [];

    for (const clusterArn of clusterArns) {
      try {
        const clusterIdentifier = clusterArn.split('/').pop() || clusterArn;
        
        const servicesResponse = await makeAWSRequest(resolvedCreds, region, 'ecs', 'ListServices', {
          cluster: clusterIdentifier
        });

        const serviceArns = servicesResponse.ServiceArns || [];
        
        if (serviceArns.length > 0) {
          const describeResponse = await makeAWSRequest(resolvedCreds, region, 'ecs', 'DescribeServices', { 
            cluster: clusterIdentifier,
            services: serviceArns
          });

          if (describeResponse.Services) {
            const servicesWithCluster = describeResponse.Services.map((s: any) => ({
              ...s,
              ClusterArn: clusterArn,
              ServiceName: s.serviceName || 'Unknown',
              RunningCount: s.runningCount || 0,
              TaskDefinition: s.taskDefinition || 'unknown'
            }));
            services.push(...servicesWithCluster);
          }
        }
      } catch (error) {
        console.error(`❌ Error fetching services for cluster ${clusterArn}:`, error);
      }
    }

    return services;
  } catch (error) {
    console.error(`❌ Error fetching ECS services in ${region}:`, error);
    return [];
  }
}

async function makeAWSRequest(
  resolvedCreds: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  region: string,
  service: string,
  action: string,
  params: any
) {
  const host = `${service}.${region}.amazonaws.com`;
  const endpoint = `https://${host}/`;
  
  const payload = new URLSearchParams({
    Action: action,
    Version: getAPIVersion(service),
    ...params
  }).toString();

  const headers = await signAWSFormRequest(
    resolvedCreds,
    service,
    region,
    host,
    '/',
    payload
  );

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: payload,
  });

  const text = await response.text();
  
  if (!response.ok) {
    throw new Error(`AWS API error: ${text}`);
  }

  return parseXMLResponse(text);
}

function parseXMLResponse(xml: string): any {
  const result: any = {};
  const reservationMatch = xml.match(/<reservationSet>([\s\S]*?)<\/reservationSet>/);
  const dbInstancesMatch = xml.match(/<DBInstances>([\s\S]*?)<\/DBInstances>/);
  const clusterArnsMatch = xml.match(/<clusterArns>([\s\S]*?)<\/clusterArns>/);
  const serviceArnsMatch = xml.match(/<serviceArns>([\s\S]*?)<\/serviceArns>/);

  if (reservationMatch) {
    result.Reservations = [];
    const reservations = reservationMatch[1].match(/<item>([\s\S]*?)<\/item>/g) || [];
    
    for (const res of reservations) {
      const reservation: any = { Instances: [] };
      const instancesMatch = res.match(/<instancesSet>([\s\S]*?)<\/instancesSet>/);
      
      if (instancesMatch) {
        const instances = instancesMatch[1].match(/<item>([\s\S]*?)<\/item>/g) || [];
        
        for (const inst of instances) {
          const typeMatch = inst.match(/<instanceType>(.*?)<\/instanceType>/);
          const stateMatch = inst.match(/<name>(.*?)<\/name>/);
          const idMatch = inst.match(/<instanceId>(.*?)<\/instanceId>/);
          
          reservation.Instances.push({
            InstanceId: idMatch?.[1],
            InstanceType: typeMatch?.[1],
            State: { Name: stateMatch?.[1] }
          });
        }
      }
      
      result.Reservations.push(reservation);
    }
  }

  if (dbInstancesMatch) {
    result.DBInstances = [];
    const instances = dbInstancesMatch[1].match(/<DBInstance>([\s\S]*?)<\/DBInstance>/g) || [];
    
    for (const inst of instances) {
      const classMatch = inst.match(/<DBInstanceClass>(.*?)<\/DBInstanceClass>/);
      const idMatch = inst.match(/<DBInstanceIdentifier>(.*?)<\/DBInstanceIdentifier>/);
      
      result.DBInstances.push({
        DBInstanceIdentifier: idMatch?.[1],
        DBInstanceClass: classMatch?.[1]
      });
    }
  }

  if (clusterArnsMatch) {
    result.ClusterArns = [];
    const arns = clusterArnsMatch[1].match(/<member>(.*?)<\/member>/g) || [];
    for (const arn of arns) {
      result.ClusterArns.push(arn.replace(/<\/?member>/g, ''));
    }
  }

  if (serviceArnsMatch) {
    result.ServiceArns = [];
    const arns = serviceArnsMatch[1].match(/<member>(.*?)<\/member>/g) || [];
    for (const arn of arns) {
      result.ServiceArns.push(arn.replace(/<\/?member>/g, ''));
    }
  }

  return result;
}

function estimateEC2Cost(instanceType: string, region: string): number {
  const pricing: Record<string, number> = {
    't3.micro': 10, 't3.small': 20, 't3.medium': 40, 't3.large': 80,
    't4g.micro': 8, 't4g.small': 16, 't4g.medium': 32, 't4g.large': 64,
    'm5.large': 96, 'm5.xlarge': 192, 'm5.2xlarge': 384,
    'm6i.large': 100, 'm6i.xlarge': 200, 'm6i.2xlarge': 400,
    'c5.large': 85, 'c5.xlarge': 170, 'c5.2xlarge': 340,
    'r5.large': 125, 'r5.xlarge': 250, 'r5.2xlarge': 500,
  };

  return pricing[instanceType] || 100;
}

function estimateRDSCost(instanceClass: string, region: string): number {
  const pricing: Record<string, number> = {
    'db.t3.micro': 15, 'db.t3.small': 30, 'db.t3.medium': 60, 'db.t3.large': 120,
    'db.t4g.micro': 12, 'db.t4g.small': 24, 'db.t4g.medium': 48,
    'db.m5.large': 150, 'db.m5.xlarge': 300, 'db.m5.2xlarge': 600,
    'db.r5.large': 200, 'db.r5.xlarge': 400, 'db.r5.2xlarge': 800,
  };

  return pricing[instanceClass] || 120;
}

function estimateECSCost(taskDefinition: string, runningCount: number): number {
  const costPerTask = 18;
  return costPerTask * (runningCount || 1);
}

function getAPIVersion(service: string): string {
  const versions: Record<string, string> = {
    ec2: '2016-11-15',
    rds: '2014-10-31',
    ecs: '2014-11-13',
  };
  return versions[service] || '2016-11-15';
}
