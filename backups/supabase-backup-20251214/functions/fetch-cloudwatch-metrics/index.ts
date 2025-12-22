import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { getResolvedAWSCredentials } from '../_shared/aws-credentials-helper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Type for resolved credentials
interface ResolvedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

// SHA256 hash function
async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(key: string | ArrayBuffer, data: string, hex = false): Promise<string | ArrayBuffer> {
  const keyData = typeof key === 'string' ? new TextEncoder().encode(key) : new Uint8Array(key);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData.buffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  
  if (hex) {
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return signature;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // CRITICAL SECURITY: Authenticate user first
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('❌ No Authorization header in request');
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    
    if (userError || !user) {
      console.error('❌ Authentication failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CRITICAL: Get user's organization ID
    const { data: userOrgId, error: orgError } = await supabaseClient
      .rpc('get_user_organization', { _user_id: user.id });
    
    if (orgError || !userOrgId) {
      console.error('❌ Failed to get user organization:', orgError);
      return new Response(
        JSON.stringify({ error: 'User organization not found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body for optional accountId
    let accountIdFromBody: string | null = null;
    try {
      const body = await req.json();
      accountIdFromBody = body?.accountId || null;
    } catch (_) {
      // no body provided
    }

    console.log(`Fetching CloudWatch metrics for organization ${userOrgId}`);

    // CRITICAL SECURITY: Get account from user's organization
    let credQuery = supabaseClient
      .from('aws_credentials')
      .select('*')
      .eq('organization_id', userOrgId)
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
      console.error('Error fetching credentials:', credError);
      throw new Error(`Failed to fetch AWS credentials: ${credError.message}`);
    }

    if (!credentials) {
      console.error('❌ AWS account not found or does not belong to user organization');
      return new Response(
        JSON.stringify({ error: 'AWS account not found or access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found credentials for account: ${credentials.account_name}`);

    const organizationId = credentials.organization_id;
    const accountId = credentials.id;

    // CRITICAL: Resolve credentials via AssumeRole before making AWS calls
    let resolvedCreds: ResolvedCredentials;
    try {
      const defaultRegion = credentials.regions?.[0] || 'us-east-1';
      resolvedCreds = await getResolvedAWSCredentials(credentials, defaultRegion);
      console.log('✅ Credentials resolved via AssumeRole');
    } catch (e) {
      console.error('❌ Failed to assume role:', e);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to assume AWS Role: ${e instanceof Error ? e.message : 'Unknown error'}`,
          permissionErrors: [{
            resourceType: 'credentials',
            region: 'global',
            error: e instanceof Error ? e.message : 'Unknown error',
            missingPermissions: ['sts:AssumeRole']
          }]
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Recursos suportados e suas métricas
    const resourceConfigs: Array<{
      type: string;
      namespace: string;
      metrics: string[];
      dimensionName: string;
      region?: string;
      requiresStage?: boolean;
    }> = [
      {
        type: 'ec2',
        namespace: 'AWS/EC2',
        metrics: ['CPUUtilization', 'NetworkIn', 'NetworkOut', 'DiskReadBytes', 'DiskWriteBytes'],
        dimensionName: 'InstanceId'
      },
      {
        type: 'rds',
        namespace: 'AWS/RDS',
        metrics: ['CPUUtilization', 'DatabaseConnections', 'FreeableMemory', 'ReadIOPS', 'WriteIOPS'],
        dimensionName: 'DBInstanceIdentifier'
      },
      {
        type: 'elasticache',
        namespace: 'AWS/ElastiCache',
        metrics: ['CPUUtilization', 'NetworkBytesIn', 'NetworkBytesOut', 'CurrConnections'],
        dimensionName: 'CacheClusterId'
      },
      {
        type: 'lambda',
        namespace: 'AWS/Lambda',
        metrics: ['Invocations', 'Duration', 'Errors', 'Throttles', 'ConcurrentExecutions'],
        dimensionName: 'FunctionName'
      },
      {
        type: 'ecs',
        namespace: 'AWS/ECS',
        metrics: ['CPUUtilization', 'MemoryUtilization'],
        dimensionName: 'ServiceName'
      },
      {
        type: 'elb',
        namespace: 'AWS/ELB',
        metrics: ['RequestCount', 'HealthyHostCount', 'UnHealthyHostCount', 'Latency', 'HTTPCode_Backend_2XX', 'HTTPCode_Backend_4XX', 'HTTPCode_Backend_5XX'],
        dimensionName: 'LoadBalancerName'
      },
      {
        type: 'alb',
        namespace: 'AWS/ApplicationELB',
        metrics: ['RequestCount', 'TargetResponseTime', 'HTTPCode_Target_2XX_Count', 'HTTPCode_Target_4XX_Count', 'HTTPCode_Target_5XX_Count', 'ActiveConnectionCount', 'ProcessedBytes'],
        dimensionName: 'LoadBalancer'
      },
      {
        type: 'nlb',
        namespace: 'AWS/NetworkELB',
        metrics: ['ActiveFlowCount', 'NewFlowCount', 'ProcessedBytes', 'ProcessedPackets', 'TCP_Target_Reset_Count', 'HealthyHostCount', 'UnHealthyHostCount'],
        dimensionName: 'LoadBalancer'
      },
      {
        type: 'apigateway',
        namespace: 'AWS/ApiGateway',
        // Count, errors use Sum; Latency uses Average - all need ApiName+Stage dimensions
        metrics: ['Count', 'Latency', '4XXError', '5XXError', 'IntegrationLatency', 'CacheHitCount', 'CacheMissCount'],
        dimensionName: 'ApiName',
        requiresStage: true // Flag to indicate Stage dimension is required
      },
      {
        type: 'cloudfront',
        namespace: 'AWS/CloudFront',
        metrics: ['Requests', 'BytesDownloaded', 'BytesUploaded', '4xxErrorRate', '5xxErrorRate', 'TotalErrorRate'],
        dimensionName: 'DistributionId',
        region: 'us-east-1' // CloudFront metrics are global in us-east-1
      },
      {
        type: 'waf',
        namespace: 'AWS/WAFV2',
        metrics: ['AllowedRequests', 'BlockedRequests', 'CountedRequests', 'PassedRequests'],
        dimensionName: 'WebACL',
        region: 'us-east-1' // WAF metrics are global in us-east-1
      }
    ];

    let totalResources = 0;
    let totalMetrics = 0;
    const permissionErrors: Array<{
      resourceType: string;
      region: string;
      error: string;
      missingPermissions: string[];
    }> = [];

    // 🚀 PERFORMANCE: Helper function to save resources in optimized batches
    async function saveResources(resources: any[]) {
      if (resources.length === 0) return;
      const batchSize = 500;
      
      // Process batches in parallel (max 3 concurrent)
      for (let i = 0; i < resources.length; i += batchSize * 3) {
        const batchPromises = [];
        for (let j = 0; j < 3 && i + j * batchSize < resources.length; j++) {
          const start = i + j * batchSize;
          const batch = resources.slice(start, start + batchSize);
          batchPromises.push(
            supabaseClient
              .from('monitored_resources')
              .upsert(batch, {
                onConflict: 'aws_account_id,resource_type,resource_id,region',
                ignoreDuplicates: false
              })
              .then(({ error }) => {
                if (error) console.error('Error saving resources:', error.message);
              })
          );
        }
        await Promise.all(batchPromises);
      }
    }

    // 🚀 PERFORMANCE: Helper function to save metrics using UPSERT to avoid duplicates
    async function saveMetrics(metrics: any[]) {
      if (metrics.length === 0) return;
      const batchSize = 500; // Smaller batches for upsert operations
      
      // Process batches in parallel (max 3 concurrent for upsert)
      for (let i = 0; i < metrics.length; i += batchSize * 3) {
        const batchPromises = [];
        for (let j = 0; j < 3 && i + j * batchSize < metrics.length; j++) {
          const start = i + j * batchSize;
          const batch = metrics.slice(start, start + batchSize);
          batchPromises.push(
            supabaseClient
              .from('resource_metrics')
              .upsert(batch, {
                onConflict: 'aws_account_id,resource_id,metric_name,timestamp',
                ignoreDuplicates: false
              })
              .then(({ error }) => {
                if (error) console.error('Error saving metrics batch:', error.message);
              })
          );
        }
        await Promise.all(batchPromises);
      }
    }

    // CRITICAL: Limit datapoints to reduce memory usage
    const MAX_DATAPOINTS = 48; // 8 hours of 10-min data

    // 🧹 CRITICAL: Clean up old metrics to prevent accumulation (older than 8 days)
    const cleanupDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    console.log(`🧹 Cleaning up metrics older than ${cleanupDate} for account ${accountId}...`);
    const { error: cleanupError } = await supabaseClient
      .from('resource_metrics')
      .delete()
      .eq('aws_account_id', accountId)
      .lt('timestamp', cleanupDate);
    
    if (cleanupError) {
      console.error('⚠️ Error cleaning up old metrics:', cleanupError.message);
    } else {
      console.log('✅ Old metrics cleanup complete');
    }

    // Separar recursos por tipo de processamento
    const criticalResources = ['ec2', 'rds'];
    const globalResources = ['cloudfront', 'waf']; // Global services - process ONCE in us-east-1
    
    const criticalConfigs = resourceConfigs.filter(c => criticalResources.includes(c.type));
    const globalConfigs = resourceConfigs.filter(c => globalResources.includes(c.type));
    const regionalConfigs = resourceConfigs.filter(c => !criticalResources.includes(c.type) && !globalResources.includes(c.type));

    // Processar EC2 e RDS PRIMEIRO (sequencialmente por região)
    console.log('🚨 Processing CRITICAL resources first (EC2, RDS)...');
    for (const region of (credentials.regions || ['us-east-1'])) {
      console.log(`🚨 Processing critical resources in ${region}...`);
      
      for (const resourceConfig of criticalConfigs) {
        try {
          const targetRegion = resourceConfig.region || region;
          
          const resources = await listResources(
            resolvedCreds.accessKeyId,
            resolvedCreds.secretAccessKey,
            targetRegion,
            resourceConfig.type,
            resolvedCreds.sessionToken
          );

          console.log(`🚨 Found ${resources.length} ${resourceConfig.type} resources in ${region}`);
          
          const batchResources: any[] = [];
          const batchMetrics: any[] = [];

          for (const resource of resources) {
            batchResources.push({
              aws_account_id: accountId,
              organization_id: organizationId,
              resource_type: resourceConfig.type,
              resource_id: resource.id,
              resource_name: resource.name,
              region: region,
              status: resource.status || 'active',
              metadata: resource.metadata || {},
              last_seen_at: new Date().toISOString()
            });

            // 🚀 PERFORMANCE: Fetch metrics in parallel for this resource (max 3 concurrent)
            const metricPromises = resourceConfig.metrics.slice(0, 3).map(metricName =>
              getCloudWatchMetric(
                resolvedCreds.accessKeyId,
                resolvedCreds.secretAccessKey,
                region,
                resourceConfig.namespace,
                metricName,
                resourceConfig.dimensionName,
                resource.id,
                resolvedCreds.sessionToken
              ).then(metricData => ({ metricName, metricData })).catch(() => null)
            );
            
            const metricResults = await Promise.all(metricPromises);
            
            for (const result of metricResults) {
              if (result && result.metricData && result.metricData.datapoints && result.metricData.datapoints.length > 0) {
                const limitedDatapoints = result.metricData.datapoints.slice(-MAX_DATAPOINTS);
                for (const dp of limitedDatapoints) {
                  batchMetrics.push({
                    aws_account_id: accountId,
                    organization_id: organizationId,
                    resource_type: resourceConfig.type,
                    resource_id: resource.id,
                    resource_name: resource.name,
                    region: region,
                    metric_name: result.metricName,
                    metric_value: dp.value,
                    metric_unit: dp.unit,
                    timestamp: dp.timestamp,
                    additional_metrics: {}
                  });
                }
              }
            }
          }

          // Save batch immediately to free memory
          await saveResources(batchResources);
          await saveMetrics(batchMetrics);
          totalResources += batchResources.length;
          totalMetrics += batchMetrics.length;
          
        } catch (resourceError: any) {
          console.error(`🚨 Error listing ${resourceConfig.type} in ${region}:`, resourceError?.message || resourceError);
          permissionErrors.push({
            resourceType: resourceConfig.type,
            region: region,
            error: resourceError?.message || String(resourceError),
            missingPermissions: []
          });
        }
      }
    }

    console.log(`🚨 Critical resources complete. Total: ${totalResources} resources, ${totalMetrics} metrics`);

    // 🌍 PROCESSAR RECURSOS GLOBAIS SEQUENCIALMENTE (CloudFront, WAF)
    console.log('🌍 Processing GLOBAL resources (CloudFront, WAF)...');
    for (const resourceConfig of globalConfigs) {
      try {
        const targetRegion = 'us-east-1'; // Global services always use us-east-1
        
        const resources = await listResources(
          resolvedCreds.accessKeyId,
          resolvedCreds.secretAccessKey,
          targetRegion,
          resourceConfig.type,
          resolvedCreds.sessionToken
        );

        console.log(`🌍 Found ${resources.length} ${resourceConfig.type} (global) resources`);

        const batchResources: any[] = [];
        const batchMetrics: any[] = [];

        for (const resource of resources) {
          batchResources.push({
            aws_account_id: accountId,
            organization_id: organizationId,
            resource_type: resourceConfig.type,
            resource_id: resource.id,
            resource_name: resource.name,
            region: 'global',
            status: resource.status || 'active',
            metadata: resource.metadata || {},
            last_seen_at: new Date().toISOString()
          });

          // 🚀 PERFORMANCE: Fetch metrics in parallel for global resources
          const metricPromises = resourceConfig.metrics.slice(0, 2).map(metricName =>
            getCloudWatchMetric(
              resolvedCreds.accessKeyId,
              resolvedCreds.secretAccessKey,
              targetRegion,
              resourceConfig.namespace,
              metricName,
              resourceConfig.dimensionName,
              resource.id,
              resolvedCreds.sessionToken
            ).then(metricData => ({ metricName, metricData })).catch(() => null)
          );
          
          const metricResults = await Promise.all(metricPromises);
          
          for (const result of metricResults) {
            if (result && result.metricData && result.metricData.datapoints && result.metricData.datapoints.length > 0) {
              const limitedDatapoints = result.metricData.datapoints.slice(-MAX_DATAPOINTS);
              for (const dp of limitedDatapoints) {
                batchMetrics.push({
                  aws_account_id: accountId,
                  organization_id: organizationId,
                  resource_type: resourceConfig.type,
                  resource_id: resource.id,
                  resource_name: resource.name,
                  region: 'global',
                  metric_name: result.metricName,
                  metric_value: dp.value,
                  metric_unit: dp.unit,
                  timestamp: dp.timestamp,
                  additional_metrics: {}
                });
              }
            }
          }
        }

        // Save immediately
        await saveResources(batchResources);
        await saveMetrics(batchMetrics);
        totalResources += batchResources.length;
        totalMetrics += batchMetrics.length;
        
      } catch (resourceError: any) {
        console.error(`🌍 Error listing global ${resourceConfig.type}:`, resourceError?.message || resourceError);
        permissionErrors.push({
          resourceType: resourceConfig.type,
          region: 'global',
          error: resourceError?.message || String(resourceError),
          missingPermissions: []
        });
      }
    }

    console.log(`🌍 Global resources complete. Total: ${totalResources} resources, ${totalMetrics} metrics`);

    // 🚀 PROCESSAR RECURSOS REGIONAIS SEQUENCIALMENTE (not in parallel to save memory)
    console.log('🚀 Processing REGIONAL resources sequentially...');
    for (const region of (credentials.regions || ['us-east-1'])) {
      console.log(`Processing region: ${region}`);
      
      for (const resourceConfig of regionalConfigs) {
        try {
          const targetRegion = resourceConfig.region || region;
          
          const resources = await listResources(
            resolvedCreds.accessKeyId,
            resolvedCreds.secretAccessKey,
            targetRegion,
            resourceConfig.type,
            resolvedCreds.sessionToken
          );

          console.log(`Found ${resources.length} ${resourceConfig.type} resources in ${region}`);

          const batchResources: any[] = [];
          const batchMetrics: any[] = [];

          for (const resource of resources) {
            batchResources.push({
              aws_account_id: accountId,
              organization_id: organizationId,
              resource_type: resourceConfig.type,
              resource_id: resource.id,
              resource_name: resource.name,
              region: region,
              status: resource.status || 'active',
              metadata: resource.metadata || {},
              last_seen_at: new Date().toISOString()
            });

            // 🚀 PERFORMANCE: Build metric queries with proper dimensions, then fetch in parallel
            const metricsToFetch = resourceConfig.requiresStage 
              ? resourceConfig.metrics.slice(0, 5)
              : resourceConfig.metrics.slice(0, 3);
            
            const metricPromises = metricsToFetch.map(metricName => {
              let additionalDimensions: Array<{Name: string, Value: string}> | undefined;
              
              // ECS needs ClusterName dimension
              if (resourceConfig.type === 'ecs' && resource.metadata?.cluster) {
                additionalDimensions = [{ Name: 'ClusterName', Value: resource.metadata.cluster }];
              }
              
              let cloudWatchDimensionValue = resource.id;
              
              // API Gateway ALWAYS needs Stage dimension
              if (resourceConfig.requiresStage) {
                const stageName = resource.metadata?.stage || 'prod';
                cloudWatchDimensionValue = resource.metadata?.apiName || resource.id.split('::')[0];
                additionalDimensions = [{ Name: 'Stage', Value: stageName }];
              }
              
              return getCloudWatchMetric(
                resolvedCreds.accessKeyId,
                resolvedCreds.secretAccessKey,
                region,
                resourceConfig.namespace,
                metricName,
                resourceConfig.dimensionName,
                cloudWatchDimensionValue,
                resolvedCreds.sessionToken,
                additionalDimensions
              ).then(metricData => ({ 
                metricName, 
                metricData,
                stageInfo: resource.metadata?.stage 
              })).catch(() => null);
            });
            
            const metricResults = await Promise.all(metricPromises);
            
            for (const result of metricResults) {
              if (result && result.metricData && result.metricData.datapoints && result.metricData.datapoints.length > 0) {
                const limitedDatapoints = result.metricData.datapoints.slice(-MAX_DATAPOINTS);
                for (const dp of limitedDatapoints) {
                  batchMetrics.push({
                    aws_account_id: accountId,
                    organization_id: organizationId,
                    resource_type: resourceConfig.type,
                    resource_id: resource.id,
                    resource_name: resource.name,
                    region: region,
                    metric_name: result.metricName,
                    metric_value: dp.value,
                    metric_unit: dp.unit,
                    timestamp: dp.timestamp,
                    additional_metrics: result.stageInfo ? { stage: result.stageInfo } : {}
                  });
                }
              }
            }
          }

          // Save batch immediately
          await saveResources(batchResources);
          await saveMetrics(batchMetrics);
          totalResources += batchResources.length;
          totalMetrics += batchMetrics.length;
          
        } catch (resourceError: any) {
          console.error(`Error listing ${resourceConfig.type} in ${region}:`, resourceError?.message || resourceError);
          
          const errorMessage = resourceError?.message || String(resourceError);
          const missingPerms: string[] = [];
          
          if (errorMessage.includes('not authorized to perform:')) {
            const match = errorMessage.match(/perform: ([a-zA-Z0-9:]+)/);
            if (match) {
              missingPerms.push(match[1]);
            }
          } else if (errorMessage.includes('AccessDenied') || errorMessage.includes('403')) {
            const permissionMap: Record<string, string[]> = {
              'ec2': ['ec2:DescribeInstances'],
              'rds': ['rds:DescribeDBInstances'],
              'lambda': ['lambda:ListFunctions', 'lambda:GetFunction'],
              'ecs': ['ecs:ListClusters', 'ecs:ListServices'],
              'elb': ['elasticloadbalancing:DescribeLoadBalancers'],
              'alb': ['elasticloadbalancing:DescribeLoadBalancers'],
              'elasticache': ['elasticache:DescribeCacheClusters']
            };
            missingPerms.push(...(permissionMap[resourceConfig.type] || []));
          }
          
          permissionErrors.push({
            resourceType: resourceConfig.type,
            region: resourceConfig.region || region,
            error: errorMessage,
            missingPermissions: missingPerms
          });
        }
      }
    }

    console.log(`✅ Processing complete. Total: ${totalResources} resources, ${totalMetrics} metrics`);

    return new Response(
      JSON.stringify({
        success: true,
        resourcesFound: totalResources,
        metricsCollected: totalMetrics,
        permissionErrors: permissionErrors.length > 0 ? permissionErrors : undefined,
        message: permissionErrors.length > 0 
          ? `Coletadas ${totalMetrics} métricas de ${totalResources} recursos. ${permissionErrors.length} tipos de recursos com erro de permissão.`
          : `Coletadas ${totalMetrics} métricas de ${totalResources} recursos`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-cloudwatch-metrics:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        resourcesFound: 0,
        metricsCollected: 0
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Função auxiliar para listar recursos
async function listResources(accessKeyId: string, secretAccessKey: string, region: string, resourceType: string, sessionToken?: string) {
  const resources: any[] = [];

  switch (resourceType) {
    case 'ec2':
      // Lista instâncias EC2
      console.log(`🖥️ [EC2] Starting DescribeInstances in ${region}...`);
      try {
        const ec2Response = await callAWS(accessKeyId, secretAccessKey, region, 'ec2', 'DescribeInstances', {}, sessionToken);
        console.log(`🖥️ [EC2] Got response in ${region}:`, JSON.stringify(ec2Response).substring(0, 500));
        if (ec2Response.Reservations) {
          console.log(`🖥️ [EC2] Found ${ec2Response.Reservations.length} reservations in ${region}`);
          for (const reservation of ec2Response.Reservations) {
            for (const instance of reservation.Instances || []) {
              const nameTag = instance.Tags?.find((t: any) => t.Key === 'Name');
              resources.push({
                id: instance.InstanceId,
                name: nameTag?.Value || instance.InstanceId,
                status: instance.State?.Name || 'unknown',
                metadata: {
                  instanceType: instance.InstanceType,
                  platform: instance.Platform,
                  availabilityZone: instance.Placement?.AvailabilityZone
                }
              });
              console.log(`🖥️ [EC2] Added instance: ${instance.InstanceId}`);
            }
          }
        } else {
          console.log(`🖥️ [EC2] No Reservations in response for ${region}`);
        }
      } catch (ec2Error) {
        console.error(`🖥️ [EC2] ERROR in ${region}:`, ec2Error);
        throw ec2Error;
      }
      break;

    case 'rds':
      const rdsResponse = await callAWS(accessKeyId, secretAccessKey, region, 'rds', 'DescribeDBInstances', {}, sessionToken);
      if (rdsResponse.DBInstances) {
        for (const db of rdsResponse.DBInstances) {
          resources.push({
            id: db.DBInstanceIdentifier,
            name: db.DBInstanceIdentifier,
            status: db.DBInstanceStatus,
            metadata: {
              engine: db.Engine,
              engineVersion: db.EngineVersion,
              instanceClass: db.DBInstanceClass,
              availabilityZone: db.AvailabilityZone
            }
          });
        }
      }
      break;

    case 'elasticache':
      const cacheResponse = await callAWS(accessKeyId, secretAccessKey, region, 'elasticache', 'DescribeCacheClusters', {}, sessionToken);
      if (cacheResponse.CacheClusters) {
        for (const cluster of cacheResponse.CacheClusters) {
          resources.push({
            id: cluster.CacheClusterId,
            name: cluster.CacheClusterId,
            status: cluster.CacheClusterStatus,
            metadata: {
              engine: cluster.Engine,
              cacheNodeType: cluster.CacheNodeType,
              numCacheNodes: cluster.NumCacheNodes
            }
          });
        }
      }
      break;

    case 'lambda':
      try {
        // Lambda usa REST API ao invés de Query API
        const lambdaResponse = await callLambdaAPI(accessKeyId, secretAccessKey, region, '/2015-03-31/functions/', sessionToken);
        if (lambdaResponse && lambdaResponse.Functions && Array.isArray(lambdaResponse.Functions)) {
          for (const func of lambdaResponse.Functions) {
            resources.push({
              id: func.FunctionName,
              name: func.FunctionName,
              status: func.State || 'Active',
              metadata: {
                runtime: func.Runtime,
                memorySize: func.MemorySize,
                timeout: func.Timeout
              }
            });
          }
        }
      } catch (lambdaError) {
        console.error(`Error listing Lambda functions in ${region}:`, lambdaError);
      }
      break;

    case 'ecs':
      try {
        // First list all clusters
        console.log(`Listing ECS clusters in ${region}...`);
        console.log('AWS API Call: ecs.ListClusters in', region);
        
        const clustersResponse = await callAWS(accessKeyId, secretAccessKey, region, 'ecs', 'ListClusters', {}, sessionToken);
        console.log('🔍 ECS Clusters Response:', JSON.stringify(clustersResponse, null, 2));
        
        const clusterArns = clustersResponse.clusterArns || [];
        
        console.log(`Parsed ${clusterArns.length} ECS clusters in ${region}:`, clusterArns);
        
        // Only proceed if there are clusters (don't try 'default' if none exist)
        if (clusterArns.length === 0) {
          console.log(`No ECS clusters found in ${region}`);
          break;
        }
        
        for (const clusterArn of clusterArns) {
          try {
            // Use the full ARN for the cluster parameter (AWS accepts both ARN and name)
            const clusterIdentifier = clusterArn;
            console.log(`Listing services for ECS cluster: ${clusterIdentifier}`);
            
            const servicesResponse = await callAWS(accessKeyId, secretAccessKey, region, 'ecs', 'ListServices', {
              cluster: clusterIdentifier
            }, sessionToken);
            
            const serviceArns = servicesResponse.serviceArns || [];
            console.log(`Found ${serviceArns.length} services in cluster ${clusterIdentifier}`);
            
            if (serviceArns && Array.isArray(serviceArns)) {
              for (const serviceArn of serviceArns) {
                const serviceName = serviceArn.split('/').pop();
                const clusterName = clusterArn.split('/').pop();
                
                console.log(`Adding ECS service: ${serviceName} in cluster ${clusterName}`);
                
                resources.push({
                  id: serviceName,
                  name: serviceName,
                  status: 'active',
                  metadata: {
                    cluster: clusterName,
                    clusterArn: clusterArn,
                    serviceArn: serviceArn
                  }
                });
              }
            }
          } catch (clusterError) {
            console.error(`Error listing services for ECS cluster ${clusterArn}:`, clusterError);
            // Continue to next cluster
          }
        }
      } catch (ecsError) {
        console.error(`Error listing ECS clusters in ${region}:`, ecsError);
      }
      break;

    case 'apigateway':
      try {
        console.log(`🔍 Listing API Gateways in ${region}...`);
        
        // Call API Gateway REST API to list APIs
        const apiResponse = await callAPIGateway(accessKeyId, secretAccessKey, region, sessionToken);
        
        if (apiResponse && Array.isArray(apiResponse)) {
          console.log(`✅ Found ${apiResponse.length} API Gateways in ${region}`);
          
          for (const api of apiResponse) {
            if (api && api.id) {
              // Fetch stages for this API to get proper CloudWatch metrics
              const stages = await getAPIGatewayStages(accessKeyId, secretAccessKey, region, api.id, sessionToken);
              console.log(`📊 API ${api.name} has ${stages.length} stages: ${stages.join(', ')}`);
              
              // Create a resource for each API+Stage combination (CloudWatch requires Stage dimension)
              // CRITICAL FIX: Use unique resource_id per stage to prevent upsert from overwriting
              if (stages.length > 0) {
                for (const stage of stages) {
                  const apiName = api.name || api.id;
                  // Resource ID includes stage to make it unique per API+Stage
                  const resourceId = `${apiName}::${stage}`;
                  const resource = {
                    id: resourceId, // Unique ID per stage
                    name: `${apiName} (${stage})`, // Display name shows stage
                    status: 'active',
                    metadata: {
                      apiId: api.id,
                      apiName: apiName, // Original API name for CloudWatch dimension
                      stage: stage, // Stage for CloudWatch dimension
                      description: api.description || '',
                      createdDate: api.createdDate,
                      endpointConfiguration: api.endpointConfiguration || {},
                      apiKeySource: api.apiKeySource || 'HEADER'
                    }
                  };
                  resources.push(resource);
                  console.log(`✅ Added API Gateway: ${resource.name} (ID: ${resourceId})`);
                }
              } else {
                // Fallback: create resource with default 'prod' stage
                const apiName = api.name || api.id;
                const resourceId = `${apiName}::prod`;
                const resource = {
                  id: resourceId,
                  name: `${apiName} (prod)`,
                  status: 'active',
                  metadata: {
                    apiId: api.id,
                    apiName: apiName,
                    stage: 'prod', // Default stage
                    description: api.description || '',
                    createdDate: api.createdDate,
                    endpointConfiguration: api.endpointConfiguration || {},
                    apiKeySource: api.apiKeySource || 'HEADER'
                  }
                };
                resources.push(resource);
                console.log(`✅ Added API Gateway (default stage): ${resource.name}`);
              }
            }
          }
        } else {
          console.log(`⚠️ No API Gateways found in ${region}`);
        }
      } catch (apiError) {
        const errorMsg = apiError instanceof Error ? apiError.message : String(apiError);
        console.error(`❌ Error listing API Gateways in ${region}:`, errorMsg);
      }
      break;

    case 'elb':
      try {
        console.log(`🔍 Listing Classic Load Balancers (ELB) in ${region}...`);
        const elbResponse = await callAWS(accessKeyId, secretAccessKey, region, 'elasticloadbalancing', 'DescribeLoadBalancers', {}, sessionToken);
        console.log('🔍 ELB Response:', JSON.stringify(elbResponse, null, 2));
        
        if (elbResponse && elbResponse.LoadBalancerDescriptions && Array.isArray(elbResponse.LoadBalancerDescriptions)) {
          console.log(`✅ Found ${elbResponse.LoadBalancerDescriptions.length} Classic Load Balancers`);
          for (const lb of elbResponse.LoadBalancerDescriptions) {
            if (lb && lb.LoadBalancerName) {
              const resource = {
                id: lb.LoadBalancerName,
                name: lb.LoadBalancerName,
                status: 'active',
                metadata: {
                  scheme: lb.Scheme || 'unknown',
                  availabilityZones: lb.AvailabilityZones || []
                }
              };
              resources.push(resource);
              console.log(`✅ Added ELB resource:`, resource);
            }
          }
        } else {
          console.log(`⚠️ No ELB LoadBalancerDescriptions found in response`);
        }
      } catch (elbError) {
        console.error(`❌ Error listing ELB in ${region}:`, elbError);
      }
      break;

    case 'alb':
      try {
        console.log(`🔍 Listing Application Load Balancers (ALB) in ${region}...`);
        
        const albResponse = await callAWSv2(
          accessKeyId, 
          secretAccessKey, 
          region, 
          'elasticloadbalancing', 
          'DescribeLoadBalancers', 
          {}, 
          '2015-12-01',
          sessionToken
        );
        
        console.log('🔍 ALB/NLB Parsed Response:', JSON.stringify(albResponse, null, 2));
        
        if (!albResponse) {
          console.error('❌ ALB Response is null or undefined - possible permission or parsing issue');
          break;
        }
        
        if (albResponse.LoadBalancers && Array.isArray(albResponse.LoadBalancers)) {
          // Filter only Application Load Balancers
          const applicationLBs = albResponse.LoadBalancers.filter((lb: any) => lb.Type === 'application');
          console.log(`✅ Found ${applicationLBs.length} Application Load Balancers (ALB)`);
          
          for (const lb of applicationLBs) {
            if (lb && lb.LoadBalancerArn && lb.LoadBalancerName) {
              const lbId = lb.LoadBalancerArn.split(':loadbalancer/').pop() || lb.LoadBalancerName;
              
              const resource = {
                id: lbId,
                name: lb.LoadBalancerName,
                status: lb.State?.Code || 'active',
                metadata: {
                  type: 'application',
                  scheme: lb.Scheme || 'internet-facing',
                  arn: lb.LoadBalancerArn,
                  dnsName: lb.DNSName,
                  vpcId: lb.VpcId,
                  availabilityZones: lb.AvailabilityZones
                }
              };
              resources.push(resource);
              console.log(`✅ Added ALB resource:`, JSON.stringify(resource, null, 2));
            }
          }
        } else {
          console.log(`⚠️ No Load Balancers found in ${region}`);
        }
      } catch (albError) {
        const errorMsg = albError instanceof Error ? albError.message : String(albError);
        if (errorMsg.includes('dns error') || errorMsg.includes('Name or service not known')) {
          console.error(`🌐 Network/DNS error accessing ALB service in ${region}:`, errorMsg);
        } else {
          console.error(`❌ Error listing ALB in ${region}:`, albError);
        }
      }
      break;

    case 'nlb':
      try {
        console.log(`🔍 Listing Network Load Balancers (NLB) in ${region}...`);
        
        const nlbResponse = await callAWSv2(
          accessKeyId, 
          secretAccessKey, 
          region, 
          'elasticloadbalancing', 
          'DescribeLoadBalancers', 
          {}, 
          '2015-12-01',
          sessionToken
        );
        
        if (!nlbResponse) {
          console.error('❌ NLB Response is null or undefined');
          break;
        }
        
        if (nlbResponse.LoadBalancers && Array.isArray(nlbResponse.LoadBalancers)) {
          // Filter only Network Load Balancers
          const networkLBs = nlbResponse.LoadBalancers.filter((lb: any) => lb.Type === 'network');
          console.log(`✅ Found ${networkLBs.length} Network Load Balancers (NLB)`);
          
          for (const lb of networkLBs) {
            if (lb && lb.LoadBalancerArn && lb.LoadBalancerName) {
              const lbId = lb.LoadBalancerArn.split(':loadbalancer/').pop() || lb.LoadBalancerName;
              
              const resource = {
                id: lbId,
                name: lb.LoadBalancerName,
                status: lb.State?.Code || 'active',
                metadata: {
                  type: 'network',
                  scheme: lb.Scheme || 'internet-facing',
                  arn: lb.LoadBalancerArn,
                  dnsName: lb.DNSName,
                  vpcId: lb.VpcId,
                  availabilityZones: lb.AvailabilityZones
                }
              };
              resources.push(resource);
              console.log(`✅ Added NLB resource:`, JSON.stringify(resource, null, 2));
            }
          }
        } else {
          console.log(`⚠️ No Load Balancers found in ${region}`);
        }
      } catch (nlbError) {
        const errorMsg = nlbError instanceof Error ? nlbError.message : String(nlbError);
        console.error(`❌ Error listing NLB in ${region}:`, nlbError);
      }
      break;

    case 'cloudfront':
      try {
        console.log('🔍 Listing CloudFront distributions...');
        
        // CloudFront is global - use special endpoint without region
        const cfHost = 'cloudfront.amazonaws.com';
        const cfEndpoint = `https://${cfHost}/2020-05-31/distribution`;
        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = amzDate.substring(0, 8);
        
        const payloadHash = await sha256('');
        
        // CRITICAL: Include x-amz-security-token for temporary credentials
        const canonicalHeaders = sessionToken 
          ? `host:${cfHost}\nx-amz-date:${amzDate}\nx-amz-security-token:${sessionToken}\n`
          : `host:${cfHost}\nx-amz-date:${amzDate}\n`;
        const signedHeaders = sessionToken ? 'host;x-amz-date;x-amz-security-token' : 'host;x-amz-date';
        const canonicalRequest = `GET\n/2020-05-31/distribution\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
        
        const algorithm = 'AWS4-HMAC-SHA256';
        const credentialScope = `${dateStamp}/us-east-1/cloudfront/aws4_request`;
        const canonicalRequestHash = await sha256(canonicalRequest);
        const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;
        
        const kDate = await hmac(`AWS4${secretAccessKey}`, dateStamp);
        const kRegion = await hmac(kDate, 'us-east-1');
        const kService = await hmac(kRegion, 'cloudfront');
        const kSigning = await hmac(kService, 'aws4_request');
        const signature = await hmac(kSigning, stringToSign, true);
        
        const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
        
        // Build headers with optional security token
        const cfHeaders: Record<string, string> = {
          'Host': cfHost,
          'X-Amz-Date': amzDate,
          'Authorization': authorizationHeader
        };
        if (sessionToken) {
          cfHeaders['X-Amz-Security-Token'] = sessionToken;
        }
        
        const cfResponse = await fetch(cfEndpoint, {
          method: 'GET',
          headers: cfHeaders
        });
        
        if (!cfResponse.ok) {
          const errorText = await cfResponse.text();
          console.error(`CloudFront API Error:`, errorText);
          throw new Error(`CloudFront API failed: ${cfResponse.status}`);
        }
        
        const xmlText = await cfResponse.text();
        console.log('📄 CloudFront Raw XML Response (first 1000 chars):', xmlText.substring(0, 1000));
        
        const cfData = parseAWSResponse(xmlText, 'ListDistributions');
        
        console.log('🔍 CloudFront Parsed Response:', JSON.stringify(cfData, null, 2));
        
        // Check multiple possible response structures
        const distributions = cfData.DistributionList?.Items 
          || cfData.DistributionSummary 
          || cfData.DistributionList?.DistributionSummary
          || [];
        
        // Handle both array and single item
        const distArray = Array.isArray(distributions) ? distributions : [distributions];
        
        if (distArray.length > 0 && distArray[0]) {
          console.log(`✅ Found ${distArray.length} CloudFront distribution(s)`);
          for (const dist of distArray) {
            if (dist && dist.Id) {
              const resource = {
                id: dist.Id,
                name: dist.DomainName || dist.Id,
                status: dist.Status || 'Deployed',
                metadata: {
                  enabled: dist.Enabled !== false,
                  priceClass: dist.PriceClass,
                  origins: dist.Origins?.Quantity || 0,
                  domainName: dist.DomainName,
                  arn: dist.ARN
                }
              };
              console.log('📦 Adding CloudFront distribution:', resource);
              resources.push(resource);
            }
          }
        } else {
          console.log('⚠️ No CloudFront distributions found');
          console.log('📊 Response structure:', Object.keys(cfData));
        }
      } catch (cfError) {
        const errorMsg = cfError instanceof Error ? cfError.message : String(cfError);
        if (errorMsg.includes('AccessDenied') || errorMsg.includes('not authorized')) {
          console.error(`❌ Permission error listing CloudFront: Missing cloudfront:ListDistributions permission`);
          throw new Error('Missing permission: cloudfront:ListDistributions');
        } else {
          console.error(`❌ Error listing CloudFront:`, cfError);
        }
      }
      break;

    case 'waf':
      try {
        console.log('🔍 Listing WAF Web ACLs using JSON API...');
        
        // WAF v2 uses JSON API, not Query API
        // List CloudFront WAF ACLs (global - us-east-1)
        const wafHost = 'wafv2.us-east-1.amazonaws.com';
        const wafPath = '/';
        const wafBody = JSON.stringify({ Scope: 'CLOUDFRONT' });
        
        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = amzDate.substring(0, 8);
        
        const payloadHash = await sha256(wafBody);
        
        // CRITICAL: Include x-amz-security-token for temporary credentials
        const canonicalHeaders = sessionToken
          ? `content-type:application/x-amz-json-1.1\nhost:${wafHost}\nx-amz-date:${amzDate}\nx-amz-security-token:${sessionToken}\nx-amz-target:AWSWAF_20190729.ListWebACLs\n`
          : `content-type:application/x-amz-json-1.1\nhost:${wafHost}\nx-amz-date:${amzDate}\nx-amz-target:AWSWAF_20190729.ListWebACLs\n`;
        const signedHeaders = sessionToken 
          ? 'content-type;host;x-amz-date;x-amz-security-token;x-amz-target' 
          : 'content-type;host;x-amz-date;x-amz-target';
        const canonicalRequest = `POST\n${wafPath}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
        
        const algorithm = 'AWS4-HMAC-SHA256';
        const credentialScope = `${dateStamp}/us-east-1/wafv2/aws4_request`;
        const canonicalRequestHash = await sha256(canonicalRequest);
        const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;
        
        const kDate = await hmac(`AWS4${secretAccessKey}`, dateStamp);
        const kRegion = await hmac(kDate, 'us-east-1');
        const kService = await hmac(kRegion, 'wafv2');
        const kSigning = await hmac(kService, 'aws4_request');
        const signature = await hmac(kSigning, stringToSign, true);
        
        const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
        
        // Build headers with optional security token
        const wafHeaders: Record<string, string> = {
          'Content-Type': 'application/x-amz-json-1.1',
          'Host': wafHost,
          'X-Amz-Date': amzDate,
          'X-Amz-Target': 'AWSWAF_20190729.ListWebACLs',
          'Authorization': authorizationHeader
        };
        if (sessionToken) {
          wafHeaders['X-Amz-Security-Token'] = sessionToken;
        }
        
        const wafResponse = await fetch(`https://${wafHost}${wafPath}`, {
          method: 'POST',
          headers: wafHeaders,
          body: wafBody
        });
        
        if (!wafResponse.ok) {
          const errorText = await wafResponse.text();
          console.error(`WAF API Error:`, errorText);
          throw new Error(`WAF API failed: ${wafResponse.status}`);
        }
        
        const wafData = await wafResponse.json();
        console.log('WAF CloudFront Response:', JSON.stringify(wafData, null, 2));
        
        if (wafData.WebACLs && Array.isArray(wafData.WebACLs)) {
          console.log(`✅ Found ${wafData.WebACLs.length} CloudFront WAF Web ACLs`);
          for (const acl of wafData.WebACLs) {
            resources.push({
              id: acl.Name,
              name: acl.Name,
              status: 'active',
              metadata: {
                id: acl.Id,
                arn: acl.ARN,
                capacity: acl.Capacity,
                scope: 'CLOUDFRONT'
              }
            });
          }
        }
        
        // Also list Regional WAF ACLs for ALB/API Gateway
        try {
          console.log(`🔍 Listing WAF Web ACLs (REGIONAL scope) in ${region}...`);
          
          const wafRegionalHost = `wafv2.${region}.amazonaws.com`;
          const wafRegionalBody = JSON.stringify({ Scope: 'REGIONAL' });
          
          const now2 = new Date();
          const amzDate2 = now2.toISOString().replace(/[:-]|\.\d{3}/g, '');
          const dateStamp2 = amzDate2.substring(0, 8);
          
          const payloadHash2 = await sha256(wafRegionalBody);
          
          // CRITICAL: Include x-amz-security-token for temporary credentials
          const canonicalHeaders2 = sessionToken
            ? `content-type:application/x-amz-json-1.1\nhost:${wafRegionalHost}\nx-amz-date:${amzDate2}\nx-amz-security-token:${sessionToken}\nx-amz-target:AWSWAF_20190729.ListWebACLs\n`
            : `content-type:application/x-amz-json-1.1\nhost:${wafRegionalHost}\nx-amz-date:${amzDate2}\nx-amz-target:AWSWAF_20190729.ListWebACLs\n`;
          const signedHeaders2 = sessionToken 
            ? 'content-type;host;x-amz-date;x-amz-security-token;x-amz-target' 
            : 'content-type;host;x-amz-date;x-amz-target';
          const canonicalRequest2 = `POST\n${wafPath}\n\n${canonicalHeaders2}\n${signedHeaders2}\n${payloadHash2}`;
          
          const credentialScope2 = `${dateStamp2}/${region}/wafv2/aws4_request`;
          const canonicalRequestHash2 = await sha256(canonicalRequest2);
          const stringToSign2 = `${algorithm}\n${amzDate2}\n${credentialScope2}\n${canonicalRequestHash2}`;
          
          const kDate2 = await hmac(`AWS4${secretAccessKey}`, dateStamp2);
          const kRegion2 = await hmac(kDate2, region);
          const kService2 = await hmac(kRegion2, 'wafv2');
          const kSigning2 = await hmac(kService2, 'aws4_request');
          const signature2 = await hmac(kSigning2, stringToSign2, true);
          
          const authorizationHeader2 = `${algorithm} Credential=${accessKeyId}/${credentialScope2}, SignedHeaders=${signedHeaders2}, Signature=${signature2}`;
          
          // Build headers with optional security token
          const wafRegionalHeaders: Record<string, string> = {
            'Content-Type': 'application/x-amz-json-1.1',
            'Host': wafRegionalHost,
            'X-Amz-Date': amzDate2,
            'X-Amz-Target': 'AWSWAF_20190729.ListWebACLs',
            'Authorization': authorizationHeader2
          };
          if (sessionToken) {
            wafRegionalHeaders['X-Amz-Security-Token'] = sessionToken;
          }
          
          const wafRegionalResponse = await fetch(`https://${wafRegionalHost}${wafPath}`, {
            method: 'POST',
            headers: wafRegionalHeaders,
            body: wafRegionalBody
          });
          
          if (wafRegionalResponse.ok) {
            const wafRegionalData = await wafRegionalResponse.json();
            console.log('WAF Regional Response:', JSON.stringify(wafRegionalData, null, 2));
            
            if (wafRegionalData.WebACLs && Array.isArray(wafRegionalData.WebACLs)) {
              console.log(`✅ Found ${wafRegionalData.WebACLs.length} Regional WAF Web ACLs`);
              for (const acl of wafRegionalData.WebACLs) {
                resources.push({
                  id: acl.Name,
                  name: acl.Name,
                  status: 'active',
                  metadata: {
                    id: acl.Id,
                    arn: acl.ARN,
                    capacity: acl.Capacity,
                    scope: 'REGIONAL',
                    region: region
                  }
                });
              }
            }
          }
        } catch (regionalError) {
          console.error(`⚠️ Error listing regional WAF ACLs in ${region}:`, regionalError);
          // Don't throw, continue with CloudFront WAFs
        }
        
      } catch (wafError) {
        const errorMsg = wafError instanceof Error ? wafError.message : String(wafError);
        if (errorMsg.includes('AccessDenied') || errorMsg.includes('not authorized')) {
          console.error(`❌ Permission error listing WAF ACLs: Missing wafv2:ListWebACLs permission`);
          throw new Error('Missing permission: wafv2:ListWebACLs');
        } else {
          console.error(`❌ Error listing WAF ACLs:`, wafError);
        }
      }
      break;
  }

  return resources;
}

// Métricas que devem usar Sum em vez de Average (contadores)
const SUM_METRICS = new Set([
  // API Gateway
  'Count', '4XXError', '5XXError',
  // ALB/ELB
  'RequestCount', 'HTTPCode_Target_2XX_Count', 'HTTPCode_Target_3XX_Count', 
  'HTTPCode_Target_4XX_Count', 'HTTPCode_Target_5XX_Count',
  'HTTPCode_ELB_2XX_Count', 'HTTPCode_ELB_3XX_Count',
  'HTTPCode_ELB_4XX_Count', 'HTTPCode_ELB_5XX_Count',
  // CloudFront
  'Requests', 'BytesDownloaded', 'BytesUploaded',
  // WAF
  'AllowedRequests', 'BlockedRequests', 'CountedRequests', 'PassedRequests',
  // NLB
  'NewFlowCount', 'ProcessedBytes', 'ProcessedPackets',
  // Lambda
  'Invocations', 'Errors', 'Throttles'
]);

// Interface para retorno de múltiplos datapoints
interface MetricDatapoint {
  value: number;
  unit: string;
  timestamp: string;
}

// Função auxiliar para buscar métrica do CloudWatch com TODOS os datapoints
async function getCloudWatchMetric(
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  namespace: string,
  metricName: string,
  dimensionName: string,
  dimensionValue: string,
  sessionToken?: string,
  additionalDimensions?: Array<{Name: string, Value: string}>
): Promise<{ datapoints: MetricDatapoint[], unit: string } | null> {
  const endTime = new Date();
  // Últimas 7 dias para ter dados suficientes para todos os períodos (3h, 24h, 7d)
  const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);

  const dimensions = [
    {
      Name: dimensionName,
      Value: dimensionValue
    }
  ];
  
  // Add additional dimensions if provided (e.g., ClusterName for ECS)
  if (additionalDimensions && additionalDimensions.length > 0) {
    dimensions.push(...additionalDimensions);
  }

  // Determinar qual estatística usar baseado no tipo de métrica
  const useSum = SUM_METRICS.has(metricName);
  const statistics = useSum ? ['Sum'] : ['Average', 'Maximum', 'Minimum'];

  // CRITICAL FIX: CloudWatch tem limite de 1440 datapoints por chamada
  // Com Period=300 (5 min) para 7 dias = 2016 datapoints (excede limite!)
  // Usando Period=600 (10 min) para 7 dias = 1008 datapoints (dentro do limite)
  const params = {
    Namespace: namespace,
    MetricName: metricName,
    Dimensions: dimensions,
    StartTime: startTime.toISOString(),
    EndTime: endTime.toISOString(),
    Period: 600, // 10 minutos - garante que ficamos abaixo do limite de 1440 datapoints
    Statistics: statistics
  };

  try {
    // Log dimensions for debugging API Gateway metrics
    if (namespace === 'AWS/ApiGateway') {
      console.log(`🔍 API Gateway metric request: ${metricName}, ApiName=${dimensionValue}, Stage=${additionalDimensions?.find(d => d.Name === 'Stage')?.Value || 'N/A'}`);
    }
    
    const response = await callAWS(accessKeyId, secretAccessKey, region, 'monitoring', 'GetMetricStatistics', params, sessionToken);
    
    const datapointCount = response.Datapoints?.length || 0;
    console.log(`📊 CloudWatch ${metricName} for ${dimensionValue}: ${datapointCount} datapoints`);
    
    // Log empty responses for important metrics (helps debug)
    if (datapointCount === 0 && ['Count', '4XXError', '5XXError'].includes(metricName)) {
      console.log(`⚠️ No datapoints for ${metricName} - API may have no traffic or errors in the last 7 days`);
    }
    
    if (response.Datapoints && response.Datapoints.length > 0) {
      // Ordenar por timestamp
      const sortedDatapoints = response.Datapoints.sort((a: any, b: any) => 
        new Date(a.Timestamp).getTime() - new Date(b.Timestamp).getTime()
      );
      
      // Retornar TODOS os datapoints para série temporal
      const datapoints: MetricDatapoint[] = sortedDatapoints.map((dp: any) => ({
        value: useSum ? (dp.Sum || 0) : (dp.Average || 0),
        unit: dp.Unit || 'None',
        timestamp: dp.Timestamp
      }));
      
      return {
        datapoints,
        unit: sortedDatapoints[0]?.Unit || 'None'
      };
    }
    
    return null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ CloudWatch error for ${metricName}/${dimensionValue}: ${errorMsg}`);
    return null;
  }
}

// Função legada para compatibilidade - retorna apenas o valor mais recente
async function getCloudWatchMetricLegacy(
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  namespace: string,
  metricName: string,
  dimensionName: string,
  dimensionValue: string,
  sessionToken?: string,
  additionalDimensions?: Array<{Name: string, Value: string}>
) {
  const result = await getCloudWatchMetric(
    accessKeyId, secretAccessKey, region, namespace, metricName,
    dimensionName, dimensionValue, sessionToken, additionalDimensions
  );
  
  if (!result || result.datapoints.length === 0) return null;
  
  const useSum = SUM_METRICS.has(metricName);
  
  if (useSum) {
    // Para Sum, retornar soma total das últimas 24h
    const now = Date.now();
    const last24h = result.datapoints.filter(dp => 
      new Date(dp.timestamp).getTime() > now - 24 * 60 * 60 * 1000
    );
    const totalSum = last24h.reduce((acc, dp) => acc + dp.value, 0);
    return {
      value: totalSum,
      unit: result.unit,
      timestamp: result.datapoints[result.datapoints.length - 1].timestamp,
      additionalData: {
        datapoints: last24h.length,
        rawValues: last24h.map(dp => dp.value)
      }
    };
  } else {
    // Para Average, retornar o mais recente
    const latest = result.datapoints[result.datapoints.length - 1];
    return {
      value: latest.value,
      unit: result.unit,
      timestamp: latest.timestamp,
      additionalData: {}
    };
  }
}

// Função genérica para chamar APIs da AWS com versão customizada
async function callAWSv2(accessKeyId: string, secretAccessKey: string, region: string, service: string, action: string, params: any, apiVersion: string, sessionToken?: string): Promise<any> {
  console.log(`AWS API Call: ${service}.${action} in ${region} (version: ${apiVersion})`);
  
  try {
    const host = `${service}.${region}.amazonaws.com`;
    const endpoint = `https://${host}/`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);
    
    // Build form-encoded body
    const bodyParams = new URLSearchParams({
      Action: action,
      Version: apiVersion,
      ...flattenParams(params)
    });
    const body = bodyParams.toString();
    
    // Create canonical request - CRITICAL: Include x-amz-security-token for temporary credentials
    const payloadHash = await sha256(body);
    const canonicalHeaders = sessionToken
      ? `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-security-token:${sessionToken}\n`
      : `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = sessionToken 
      ? 'content-type;host;x-amz-date;x-amz-security-token' 
      : 'content-type;host;x-amz-date';
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    
    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const canonicalRequestHash = await sha256(canonicalRequest);
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;
    
    // Calculate signature
    const kDate = await hmac(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, service);
    const kSigning = await hmac(kService, 'aws4_request');
    const signature = await hmac(kSigning, stringToSign, true);
    
    // Build authorization header
    const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Host': host,
      'X-Amz-Date': amzDate,
      'Authorization': authorizationHeader
    };
    if (sessionToken) {
      headers['X-Amz-Security-Token'] = sessionToken;
    }
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AWS API Error for ${service}.${action}:`, errorText);
      throw new Error(`AWS API ${service}.${action} failed: ${response.status} ${response.statusText}`);
    }
    
    const xmlText = await response.text();
    
    // Log first 1000 chars of XML response for debugging
    if (action === 'DescribeLoadBalancers') {
      console.log('📄 Raw XML Response (first 1000 chars):', xmlText.substring(0, 1000));
    }
    
    return parseAWSResponse(xmlText, action);
    
  } catch (error) {
    console.error(`Error calling AWS ${service}.${action}:`, error);
    throw error;
  }
}

// Função genérica para chamar APIs da AWS
async function callAWS(accessKeyId: string, secretAccessKey: string, region: string, service: string, action: string, params: any, sessionToken?: string): Promise<any> {
  console.log(`AWS API Call: ${service}.${action} in ${region}`);
  
  try {
    const host = `${service}.${region}.amazonaws.com`;
    const endpoint = `https://${host}/`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);
    
    // Build form-encoded body
    const bodyParams = new URLSearchParams({
      Action: action,
      Version: getAPIVersion(service),
      ...flattenParams(params)
    });
    const body = bodyParams.toString();
    
    // Create canonical request - include security token if present
    const payloadHash = await sha256(body);
    let canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${amzDate}\n`;
    let signedHeaders = 'content-type;host;x-amz-date';
    
    if (sessionToken) {
      canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-security-token:${sessionToken}\n`;
      signedHeaders = 'content-type;host;x-amz-date;x-amz-security-token';
    }
    
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    
    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const canonicalRequestHash = await sha256(canonicalRequest);
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;
    
    // Calculate signature
    const kDate = await hmac(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, service);
    const kSigning = await hmac(kService, 'aws4_request');
    const signature = await hmac(kSigning, stringToSign, true);
    
    // Build authorization header
    const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Host': host,
      'X-Amz-Date': amzDate,
      'Authorization': authorizationHeader
    };
    
    if (sessionToken) {
      headers['X-Amz-Security-Token'] = sessionToken;
    }
    
    console.log(`🔄 ${service}.${action} - Sending request to ${host}...`);
    
    // Add timeout for fetch to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error(`⏱️ ${service}.${action} - TIMEOUT after 30 seconds!`);
      controller.abort();
    }, 30000);
    
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error(`❌ ${service}.${action} - Fetch failed:`, fetchError);
      throw fetchError;
    }
    
    console.log(`📡 ${service}.${action} - Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ AWS API Error for ${service}.${action}:`, errorText);
      throw new Error(`AWS API ${service}.${action} failed: ${response.status} ${response.statusText}`);
    }
    
    let xmlText: string;
    try {
      xmlText = await response.text();
      console.log(`📥 ${service}.${action} - XML received: ${xmlText.length} chars`);
    } catch (textError) {
      console.error(`❌ ${service}.${action} - Failed to read response body:`, textError);
      throw textError;
    }
    
    // Log XML for EC2 - CRITICAL DEBUG
    if (service === 'ec2' && action === 'DescribeInstances') {
      console.log(`🖥️ === EC2 DescribeInstances Response in ${region} ===`);
      console.log(`📄 XML length: ${xmlText.length}`);
      console.log(`📄 XML content (first 3000):`, xmlText.substring(0, 3000));
      console.log(`📄 Has reservationSet: ${xmlText.includes('<reservationSet>')}`);
      console.log(`📄 Has instancesSet: ${xmlText.includes('<instancesSet>')}`);
      console.log(`🖥️ === END EC2 Response ===`);
    }
    
    // Log XML for RDS
    if (service === 'rds' && action === 'DescribeDBInstances') {
      console.log(`📄 Raw ${action} XML Response (first 3000 chars):`, xmlText.substring(0, 3000));
    }
    
    // Log XML for Load Balancers  
    if (action === 'DescribeLoadBalancers') {
      console.log(`📄 Raw ${action} XML Response (first 3000 chars):`, xmlText.substring(0, 3000));
    }
    
    const parsed = parseAWSResponse(xmlText, action);
    
    // Log parsed EC2 result
    if (service === 'ec2' && action === 'DescribeInstances') {
      console.log(`🖥️ EC2 Parsed - Reservations found: ${parsed.Reservations?.length || 0}`);
    }
    
    return parsed;
    
  } catch (error) {
    console.error(`❌ Error calling AWS ${service}.${action} in ${region}:`, error);
    throw error;
  }
}

function getAPIVersion(service: string): string {
  const versions: Record<string, string> = {
    'ec2': '2016-11-15',
    'rds': '2014-10-31',
    'elasticache': '2015-02-02',
    'lambda': '2015-03-31',
    'ecs': '2014-11-13',
    'elasticloadbalancing': '2012-06-01',
    'elasticloadbalancingv2': '2015-12-01',
    'cloudfront': '2020-05-31',
    'wafv2': '2019-07-29',
    'monitoring': '2010-08-01'
  };
  return versions[service] || '2016-11-15';
}

// Lambda usa REST API ao invés de Query API
async function callLambdaAPI(accessKeyId: string, secretAccessKey: string, region: string, path: string, sessionToken?: string): Promise<any> {
  const host = `lambda.${region}.amazonaws.com`;
  const endpoint = `https://${host}${path}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);
  
  const payloadHash = await sha256('');
  let canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  let signedHeaders = 'host;x-amz-date';
  
  if (sessionToken) {
    canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\nx-amz-security-token:${sessionToken}\n`;
    signedHeaders = 'host;x-amz-date;x-amz-security-token';
  }
  
  const canonicalRequest = `GET\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/lambda/aws4_request`;
  const canonicalRequestHash = await sha256(canonicalRequest);
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;
  
  const kDate = await hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, 'lambda');
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = await hmac(kSigning, stringToSign, true);
  
  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  const headers: Record<string, string> = {
    'Host': host,
    'X-Amz-Date': amzDate,
    'Authorization': authorizationHeader
  };
  
  if (sessionToken) {
    headers['X-Amz-Security-Token'] = sessionToken;
  }
  const response = await fetch(endpoint, {
    method: 'GET',
    headers
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Lambda API Error:`, errorText);
    throw new Error(`Lambda API failed: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

// API Gateway uses REST API (similar to Lambda)
async function callAPIGateway(accessKeyId: string, secretAccessKey: string, region: string, sessionToken?: string): Promise<any[]> {
  const host = `apigateway.${region}.amazonaws.com`;
  const path = '/restapis';
  const endpoint = `https://${host}${path}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);
  
  const payloadHash = await sha256('');
  let canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  let signedHeaders = 'host;x-amz-date';
  
  if (sessionToken) {
    canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\nx-amz-security-token:${sessionToken}\n`;
    signedHeaders = 'host;x-amz-date;x-amz-security-token';
  }
  
  const canonicalRequest = `GET\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/apigateway/aws4_request`;
  const canonicalRequestHash = await sha256(canonicalRequest);
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;
  
  const kDate = await hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, 'apigateway');
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = await hmac(kSigning, stringToSign, true);
  
  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  const headers: Record<string, string> = {
    'Host': host,
    'X-Amz-Date': amzDate,
    'Authorization': authorizationHeader
  };
  
  if (sessionToken) {
    headers['X-Amz-Security-Token'] = sessionToken;
  }
  
  const response = await fetch(endpoint, {
    method: 'GET',
    headers
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`API Gateway API Error:`, errorText);
    throw new Error(`API Gateway API failed: ${response.status}`);
  }
  
  const data = await response.json();
  // API Gateway returns { _embedded: { item: [...] } } or { item: [...] }
  return data?._embedded?.item || data?.item || [];
}

// Get API Gateway stages for a specific API
async function getAPIGatewayStages(accessKeyId: string, secretAccessKey: string, region: string, apiId: string, sessionToken?: string): Promise<string[]> {
  try {
    const host = `apigateway.${region}.amazonaws.com`;
    const path = `/restapis/${apiId}/stages`;
    const endpoint = `https://${host}${path}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);
    
    const payloadHash = await sha256('');
    let canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
    let signedHeaders = 'host;x-amz-date';
    
    if (sessionToken) {
      canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\nx-amz-security-token:${sessionToken}\n`;
      signedHeaders = 'host;x-amz-date;x-amz-security-token';
    }
    
    const canonicalRequest = `GET\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/apigateway/aws4_request`;
    const canonicalRequestHash = await sha256(canonicalRequest);
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;
    
    const kDate = await hmac(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, 'apigateway');
    const kSigning = await hmac(kService, 'aws4_request');
    const signature = await hmac(kSigning, stringToSign, true);
    
    const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    const headers: Record<string, string> = {
      'Host': host,
      'X-Amz-Date': amzDate,
      'Authorization': authorizationHeader
    };
    
    if (sessionToken) {
      headers['X-Amz-Security-Token'] = sessionToken;
    }
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Gateway Stages API Error for ${apiId}: ${response.status} - ${errorText.substring(0, 200)}`);
      // Return common stage names as fallback
      return ['prod'];
    }
    
    const data = await response.json();
    console.log(`🔍 API Gateway Stages response for ${apiId}:`, JSON.stringify(data).substring(0, 300));
    
    // AWS API Gateway returns stages in different formats:
    // Direct array: [{ stageName: "prod" }, ...]
    // Wrapped: { item: [{ stageName: "prod" }, ...] }
    // HAL: { _embedded: { item: [...] } }
    let stagesArray = [];
    
    if (Array.isArray(data)) {
      stagesArray = data;
    } else if (data?.item && Array.isArray(data.item)) {
      stagesArray = data.item;
    } else if (data?._embedded?.item && Array.isArray(data._embedded.item)) {
      stagesArray = data._embedded.item;
    }
    
    const stageNames = stagesArray
      .map((s: any) => s.stageName)
      .filter((name: string) => name && name.length > 0);
    
    console.log(`✅ Found ${stageNames.length} stages for API ${apiId}: ${stageNames.join(', ')}`);
    
    // Return found stages or fallback to common stage names
    return stageNames.length > 0 ? stageNames : ['prod'];
  } catch (error) {
    console.error(`❌ Error fetching stages for API ${apiId}:`, error);
    // Return common stage as fallback to ensure metrics work
    return ['prod'];
  }
}

function flattenParams(params: any, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(params)) {
    const paramKey = prefix ? `${prefix}.${key}` : key;
    
    if (value === undefined || value === null) {
      continue;
    }
    
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const arrayKey = `${paramKey}.member.${index + 1}`;
        if (typeof item === 'object' && item !== null) {
          Object.assign(result, flattenParams(item, arrayKey));
        } else {
          result[arrayKey] = String(item);
        }
      });
    } else if (value instanceof Date) {
      result[paramKey] = value.toISOString();
    } else if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenParams(value, paramKey));
    } else {
      result[paramKey] = String(value);
    }
  }
  
  return result;
}

function parseAWSResponse(xmlText: string, action: string): any {
  // Parse XML response to extract data
  try {
    // Basic extraction for common response patterns
    const result: any = {};
    
    // Debug: Check if XML contains DistributionList
    const hasDistributionList = xmlText.includes('<DistributionList>') || xmlText.includes('<DistributionList ');
    console.log('🔍 parseAWSResponse - DistributionList check:', hasDistributionList);
    console.log('🔍 parseAWSResponse - XML length:', xmlText.length, 'chars');
    
    // Extract EC2 Instances - check for DescribeInstancesResponse
    if (xmlText.includes('<reservationSet>') || xmlText.includes('DescribeInstancesResponse')) {
      console.log('🔍 Detected EC2 DescribeInstances response');
      result.Reservations = extractReservations(xmlText);
      console.log('🔍 EC2 Reservations extracted:', result.Reservations?.length || 0);
    }
    
    // Extract RDS Instances - check for DescribeDBInstancesResult
    if (xmlText.includes('<DBInstance>') || xmlText.includes('DescribeDBInstancesResult')) {
      console.log('🔍 Detected RDS DescribeDBInstances response');
      result.DBInstances = extractDBInstances(xmlText);
      console.log('🔍 RDS Instances extracted:', result.DBInstances?.length || 0);
    }
    
    // Extract Cache Clusters
    if (xmlText.includes('<CacheClusters>')) {
      result.CacheClusters = extractCacheClusters(xmlText);
    }
    
    // Extract Lambda Functions
    if (xmlText.includes('<Functions>')) {
      result.Functions = extractFunctions(xmlText);
    }
    
    // Extract Load Balancers (Classic ELB)
    if (xmlText.includes('<LoadBalancerDescriptions>')) {
      result.LoadBalancerDescriptions = extractLoadBalancers(xmlText);
    }
    
    // Extract Load Balancers (ALB/NLB) - check multiple patterns
    if (xmlText.includes('<LoadBalancers>') || xmlText.includes('<LoadBalancers/>') || xmlText.includes('DescribeLoadBalancersResult')) {
      console.log('🔍 parseAWSResponse - Detected ALB/NLB response, calling extractALBs...');
      result.LoadBalancers = extractALBs(xmlText);
      console.log('🔍 parseAWSResponse - extractALBs returned:', result.LoadBalancers?.length || 0, 'items');
    }
    
    // Extract CloudWatch Metrics
    if (xmlText.includes('<Datapoints>')) {
      result.Datapoints = extractDatapoints(xmlText);
    }
    
    // Extract CloudFront Distributions - check for both opening tag formats
    if (xmlText.includes('<DistributionList>') || xmlText.includes('<DistributionList ')) {
      console.log('✅ Calling extractDistributions...');
      const distributions = extractDistributions(xmlText);
      console.log('✅ extractDistributions returned:', distributions.length, 'items');
      result.DistributionList = { Items: distributions };
    } else {
      console.log('⚠️ No DistributionList tag found in XML');
    }
    
    // Extract WAF WebACLs
    if (xmlText.includes('<WebACLs>')) {
      result.WebACLs = extractWebACLs(xmlText);
    }
    
    // Extract ECS Clusters
    if (xmlText.includes('<clusterArns>')) {
      result.clusterArns = extractECSClusters(xmlText);
    }
    
    // Extract ECS Services
    if (xmlText.includes('<serviceArns>')) {
      result.serviceArns = extractECSServices(xmlText);
    }
    
    return result;
  } catch (error) {
    console.error('Error parsing AWS response:', error);
    return {};
  }
}

function extractTextBetween(xml: string, startTag: string, endTag: string): string[] {
  const results: string[] = [];
  const regex = new RegExp(`<${startTag}>(.*?)</${endTag}>`, 'gs');
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1]);
  }
  return results;
}

function extractReservations(xml: string): any[] {
  console.log('🔍 Extracting EC2 instances from XML...');
  console.log('📄 XML sample for EC2 (first 2000 chars):', xml.substring(0, 2000));
  
  const reservations: any[] = [];
  
  // AWS EC2 DescribeInstances returns: <reservationSet><item><instancesSet><item><instanceId>...
  // First find the reservationSet
  const reservationSetMatch = xml.match(/<reservationSet>([\s\S]*)<\/reservationSet>/);
  if (!reservationSetMatch) {
    console.log('⚠️ No reservationSet found in XML');
    return [];
  }
  
  const reservationSetContent = reservationSetMatch[1];
  console.log('📦 Found reservationSet, length:', reservationSetContent.length);
  
  // Split by reservationId to find each reservation block
  // Each reservation starts with <item> and contains a <reservationId>
  const reservationBlocks: string[] = [];
  let currentPos = 0;
  
  // Find all <reservationId> positions to identify reservation boundaries
  const reservationIdRegex = /<reservationId>([^<]+)<\/reservationId>/g;
  let idMatch;
  const reservationIdPositions: number[] = [];
  
  while ((idMatch = reservationIdRegex.exec(reservationSetContent)) !== null) {
    reservationIdPositions.push(idMatch.index);
  }
  
  console.log(`📊 Found ${reservationIdPositions.length} reservation IDs in XML`);
  
  // Extract each reservation block by finding the content between reservation IDs
  for (let i = 0; i < reservationIdPositions.length; i++) {
    const startPos = reservationIdPositions[i];
    const endPos = i < reservationIdPositions.length - 1 
      ? reservationIdPositions[i + 1] 
      : reservationSetContent.length;
    
    // Go back to find the opening <item> tag
    const beforeStart = reservationSetContent.lastIndexOf('<item>', startPos);
    const blockContent = reservationSetContent.substring(beforeStart, endPos);
    
    // Check if this block contains instancesSet
    if (!blockContent.includes('<instancesSet>')) continue;
    
    // Extract instancesSet content
    const instancesSetMatch = blockContent.match(/<instancesSet>([\s\S]*?)<\/instancesSet>/);
    if (!instancesSetMatch) continue;
    
    const instancesSetContent = instancesSetMatch[1];
    const instances: any[] = [];
    
    // Extract individual instances by finding instanceId markers
    const instanceIdRegex = /<instanceId>([^<]+)<\/instanceId>/g;
    let instanceIdMatch;
    const instanceIdPositions: {pos: number, id: string}[] = [];
    
    while ((instanceIdMatch = instanceIdRegex.exec(instancesSetContent)) !== null) {
      instanceIdPositions.push({ pos: instanceIdMatch.index, id: instanceIdMatch[1] });
    }
    
    // For each instance ID found, extract the instance data
    for (let j = 0; j < instanceIdPositions.length; j++) {
      const instanceStart = instanceIdPositions[j].pos;
      const instanceEnd = j < instanceIdPositions.length - 1 
        ? instanceIdPositions[j + 1].pos 
        : instancesSetContent.length;
      
      // Go back to find opening <item>
      const itemStart = instancesSetContent.lastIndexOf('<item>', instanceStart);
      const instanceContent = instancesSetContent.substring(itemStart, instanceEnd);
      
      // Extract instance details
      const instanceId = instanceIdPositions[j].id;
      const instanceTypeMatch = instanceContent.match(/<instanceType>([^<]+)<\/instanceType>/);
      const platformMatch = instanceContent.match(/<platform>([^<]+)<\/platform>/);
      const azMatch = instanceContent.match(/<availabilityZone>([^<]+)<\/availabilityZone>/);
      
      // State is nested: <instanceState><name>running</name></instanceState>
      const stateMatch = instanceContent.match(/<instanceState>[\s\S]*?<name>([^<]+)<\/name>/);
      
      // Extract Name tag
      let nameTag = '';
      const tagsMatch = instanceContent.match(/<tagSet>([\s\S]*?)<\/tagSet>/);
      if (tagsMatch) {
        const nameTagMatch = tagsMatch[1].match(/<item>[\s\S]*?<key>Name<\/key>[\s\S]*?<value>([^<]*)<\/value>/);
        if (nameTagMatch) {
          nameTag = nameTagMatch[1];
        }
      }
      
      const instance = {
        InstanceId: instanceId,
        InstanceType: instanceTypeMatch ? instanceTypeMatch[1] : 'unknown',
        State: { Name: stateMatch ? stateMatch[1] : 'unknown' },
        Platform: platformMatch ? platformMatch[1] : undefined,
        Placement: { AvailabilityZone: azMatch ? azMatch[1] : undefined },
        Tags: nameTag ? [{ Key: 'Name', Value: nameTag }] : []
      };
      instances.push(instance);
      console.log('✅ Extracted EC2 instance:', instance.InstanceId, '-', nameTag || instance.InstanceId, '-', instance.State.Name);
    }
    
    if (instances.length > 0) {
      reservations.push({ Instances: instances });
    }
  }
  
  console.log(`🎯 Total EC2 reservations: ${reservations.length}, instances: ${reservations.reduce((sum, r) => sum + r.Instances.length, 0)}`);
  return reservations;
}

function extractDBInstances(xml: string): any[] {
  console.log('🔍 Extracting RDS instances from XML...');
  console.log('📄 XML sample for RDS (first 2000 chars):', xml.substring(0, 2000));
  
  const instances: any[] = [];
  
  // Find DBInstances section - AWS returns <DBInstances> or may be nested in <DescribeDBInstancesResult>
  let dbInstancesSection = xml;
  const dbInstancesMatch = xml.match(/<DBInstances>([\s\S]*?)<\/DBInstances>/);
  if (dbInstancesMatch) {
    dbInstancesSection = dbInstancesMatch[1];
    console.log('📦 Found DBInstances section, length:', dbInstancesSection.length);
  } else {
    console.log('⚠️ No <DBInstances> tag found, searching for DBInstance directly');
  }
  
  // Extract each DBInstance - AWS uses <DBInstance> wrapper
  const dbInstanceRegex = /<DBInstance>([\s\S]*?)<\/DBInstance>/g;
  let match;
  
  while ((match = dbInstanceRegex.exec(dbInstancesSection)) !== null) {
    const block = match[1];
    
    const identifierMatch = block.match(/<DBInstanceIdentifier>([^<]+)<\/DBInstanceIdentifier>/);
    const statusMatch = block.match(/<DBInstanceStatus>([^<]+)<\/DBInstanceStatus>/);
    const engineMatch = block.match(/<Engine>([^<]+)<\/Engine>/);
    const engineVersionMatch = block.match(/<EngineVersion>([^<]+)<\/EngineVersion>/);
    const classMatch = block.match(/<DBInstanceClass>([^<]+)<\/DBInstanceClass>/);
    const azMatch = block.match(/<AvailabilityZone>([^<]+)<\/AvailabilityZone>/);
    
    if (identifierMatch) {
      const instance = {
        DBInstanceIdentifier: identifierMatch[1],
        DBInstanceStatus: statusMatch ? statusMatch[1] : 'unknown',
        Engine: engineMatch ? engineMatch[1] : 'unknown',
        EngineVersion: engineVersionMatch ? engineVersionMatch[1] : '',
        DBInstanceClass: classMatch ? classMatch[1] : 'unknown',
        AvailabilityZone: azMatch ? azMatch[1] : ''
      };
      instances.push(instance);
      console.log('✅ Extracted RDS instance:', instance.DBInstanceIdentifier, '-', instance.Engine, '-', instance.DBInstanceStatus);
    }
  }
  
  console.log(`🎯 Total RDS instances extracted: ${instances.length}`);
  return instances;
}

function extractCacheClusters(xml: string): any[] {
  const clusters: any[] = [];
  const blocks = extractTextBetween(xml, 'CacheCluster', 'CacheCluster');
  
  for (const block of blocks) {
    if (block.includes('<CacheClusterId>')) {
      clusters.push({
        CacheClusterId: extractTextBetween(block, 'CacheClusterId', 'CacheClusterId')[0],
        CacheClusterStatus: extractTextBetween(block, 'CacheClusterStatus', 'CacheClusterStatus')[0],
        Engine: extractTextBetween(block, 'Engine', 'Engine')[0]
      });
    }
  }
  
  return clusters;
}

function extractFunctions(xml: string): any[] {
  const functions: any[] = [];
  const blocks = extractTextBetween(xml, 'Function', 'Function');
  
  for (const block of blocks) {
    if (block.includes('<FunctionName>')) {
      functions.push({
        FunctionName: extractTextBetween(block, 'FunctionName', 'FunctionName')[0],
        Runtime: extractTextBetween(block, 'Runtime', 'Runtime')[0],
        State: extractTextBetween(block, 'State', 'State')[0] || 'Active'
      });
    }
  }
  
  return functions;
}

function extractLoadBalancers(xml: string): any[] {
  const lbs: any[] = [];
  const blocks = extractTextBetween(xml, 'LoadBalancerDescription', 'LoadBalancerDescription');
  
  for (const block of blocks) {
    if (block.includes('<LoadBalancerName>')) {
      lbs.push({
        LoadBalancerName: extractTextBetween(block, 'LoadBalancerName', 'LoadBalancerName')[0],
        Scheme: extractTextBetween(block, 'Scheme', 'Scheme')[0]
      });
    }
  }
  
  return lbs;
}

function extractALBs(xml: string): any[] {
  console.log('🔍 Extracting ALBs from XML...');
  console.log('📄 Full XML for ALB extraction (first 2000 chars):', xml.substring(0, 2000));
  const albs: any[] = [];
  
  // Try multiple patterns to find LoadBalancers section
  // Pattern 1: Standard <LoadBalancers>...</LoadBalancers>
  let loadBalancersSection = xml.match(/<LoadBalancers>([\s\S]*?)<\/LoadBalancers>/);
  
  // Pattern 2: Self-closing empty tag
  if (!loadBalancersSection) {
    const emptyTag = xml.match(/<LoadBalancers\s*\/>/);
    if (emptyTag) {
      console.log('⚠️ LoadBalancers tag is self-closing (no ALBs exist)');
      return [];
    }
  }
  
  // Pattern 3: Check for DescribeLoadBalancersResult wrapper
  if (!loadBalancersSection) {
    const resultSection = xml.match(/<DescribeLoadBalancersResult>([\s\S]*?)<\/DescribeLoadBalancersResult>/);
    if (resultSection) {
      console.log('📦 Found DescribeLoadBalancersResult wrapper');
      loadBalancersSection = resultSection[1].match(/<LoadBalancers>([\s\S]*?)<\/LoadBalancers>/);
    }
  }
  
  if (loadBalancersSection) {
    console.log('📄 LoadBalancers section found, length:', loadBalancersSection[1]?.length || 0);
    console.log('📄 LoadBalancers section content (first 1000 chars):', loadBalancersSection[1]?.substring(0, 1000));
  } else {
    console.log('⚠️ No <LoadBalancers> section found in XML');
    console.log('📋 Available XML tags:', xml.match(/<[a-zA-Z]+[^>]*>/g)?.slice(0, 30).join(', '));
    return [];
  }
  
  const sectionContent = loadBalancersSection[1] || '';
  
  // CRITICAL FIX: Extract all <member> blocks that contain LoadBalancerArn
  // Use regex to find all member blocks
  const memberRegex = /<member>([\s\S]*?)<\/member>/g;
  let memberMatch;
  let memberCount = 0;
  
  while ((memberMatch = memberRegex.exec(sectionContent)) !== null) {
    memberCount++;
    const block = memberMatch[1];
    
    // Only process blocks that contain LoadBalancerArn
    if (block.includes('<LoadBalancerArn>')) {
      // Extract fields using direct regex
      const arnMatch = block.match(/<LoadBalancerArn>([^<]+)<\/LoadBalancerArn>/);
      const nameMatch = block.match(/<LoadBalancerName>([^<]+)<\/LoadBalancerName>/);
      const typeMatch = block.match(/<Type>([^<]+)<\/Type>/);
      const schemeMatch = block.match(/<Scheme>([^<]+)<\/Scheme>/);
      const dnsMatch = block.match(/<DNSName>([^<]+)<\/DNSName>/);
      const vpcMatch = block.match(/<VpcId>([^<]+)<\/VpcId>/);
      const stateMatch = block.match(/<Code>([^<]+)<\/Code>/);
      
      const arn = arnMatch ? arnMatch[1] : null;
      let name = nameMatch ? nameMatch[1] : null;
      let type = typeMatch ? typeMatch[1] : 'application';
      
      // If name not in XML, extract from ARN
      if (!name && arn) {
        const arnParts = arn.split('/');
        if (arnParts.length >= 3) {
          name = arnParts[2];
          if (!type && arnParts[1]) {
            type = arnParts[1];
          }
        }
      }
      
      const alb = {
        LoadBalancerArn: arn,
        LoadBalancerName: name || 'Unknown',
        Type: type,
        Scheme: schemeMatch ? schemeMatch[1] : 'internet-facing',
        DNSName: dnsMatch ? dnsMatch[1] : '',
        VpcId: vpcMatch ? vpcMatch[1] : '',
        State: { Code: stateMatch ? stateMatch[1] : 'active' },
        AvailabilityZones: []
      };
      
      console.log('✅ Extracted ALB:', JSON.stringify(alb));
      albs.push(alb);
    }
  }
  
  console.log(`📊 Processed ${memberCount} member blocks, extracted ${albs.length} ALBs`);
  return albs;
}

function extractDatapoints(xml: string): any[] {
  const datapoints: any[] = [];
  const datapointBlocks = extractTextBetween(xml, 'member', 'member');
  
  for (const block of datapointBlocks) {
    if (block.includes('<Average>')) {
      const average = parseFloat(extractTextBetween(block, 'Average', 'Average')[0] || '0');
      const timestamp = extractTextBetween(block, 'Timestamp', 'Timestamp')[0];
      const unit = extractTextBetween(block, 'Unit', 'Unit')[0];
      
      datapoints.push({
        Average: average,
        Timestamp: timestamp,
        Unit: unit
      });
    }
  }
  
  return datapoints;
}

function extractDistributions(xml: string): any[] {
  console.log('🔍 Extracting CloudFront distributions...');
  const distributions: any[] = [];
  
  // Match all DistributionSummary blocks including nested content
  const distributionRegex = /<DistributionSummary>([\s\S]*?)<\/DistributionSummary>/g;
  let match;
  let blockCount = 0;
  
  while ((match = distributionRegex.exec(xml)) !== null) {
    blockCount++;
    const block = match[1];
    
    if (blockCount === 1) {
      console.log('📋 First DistributionSummary block (first 500 chars):', block.substring(0, 500));
    }
    
    // Extract fields using simple regex
    const idMatch = block.match(/<Id>(.*?)<\/Id>/);
    const domainMatch = block.match(/<DomainName>(.*?)<\/DomainName>/);
    const statusMatch = block.match(/<Status>(.*?)<\/Status>/);
    const enabledMatch = block.match(/<Enabled>(.*?)<\/Enabled>/);
    const arnMatch = block.match(/<ARN>(.*?)<\/ARN>/);
    const priceClassMatch = block.match(/<PriceClass>(.*?)<\/PriceClass>/);
    
    if (idMatch) {
      const distribution = {
        Id: idMatch[1],
        DomainName: domainMatch ? domainMatch[1] : '',
        Status: statusMatch ? statusMatch[1] : 'Unknown',
        Enabled: enabledMatch ? enabledMatch[1] !== 'false' : true,
        ARN: arnMatch ? arnMatch[1] : '',
        PriceClass: priceClassMatch ? priceClassMatch[1] : ''
      };
      console.log('✅ Extracted CloudFront distribution:', distribution);
      distributions.push(distribution);
    }
  }
  
  console.log(`📦 Found ${blockCount} DistributionSummary blocks`);
  console.log(`🎯 Total CloudFront distributions extracted: ${distributions.length}`);
  return distributions;
}

function extractWebACLs(xml: string): any[] {
  const acls: any[] = [];
  const blocks = extractTextBetween(xml, 'WebACL', 'WebACL');
  
  for (const block of blocks) {
    if (block.includes('<Name>')) {
      acls.push({
        Name: extractTextBetween(block, 'Name', 'Name')[0],
        Id: extractTextBetween(block, 'Id', 'Id')[0],
        ARN: extractTextBetween(block, 'ARN', 'ARN')[0]
      });
    }
  }
  
  return acls;
}

function extractECSClusters(xml: string): string[] {
  console.log('🔍 Extracting ECS clusters from XML...');
  console.log('📄 XML sample (first 1000 chars):', xml.substring(0, 1000));
  
  // AWS returns cluster ARNs inside <member> tags within <clusterArns>
  const clusterArns: string[] = [];
  
  // Extract content between <clusterArns> tags first
  const clusterArnsSection = extractTextBetween(xml, 'clusterArns', 'clusterArns')[0] || xml;
  console.log('📦 ClusterArns section found:', clusterArnsSection ? 'YES' : 'NO');
  if (clusterArnsSection) {
    console.log('📦 ClusterArns section (first 500 chars):', clusterArnsSection.substring(0, 500));
  }
  
  // Now extract all member values (which contain the ARNs)
  const members = extractTextBetween(clusterArnsSection, 'member', 'member');
  console.log(`👥 Found ${members.length} members in clusterArns section`);
  members.forEach((m, i) => console.log(`   Member ${i}:`, m));
  
  for (const member of members) {
    // ARNs follow pattern: arn:aws:ecs:region:account-id:cluster/name
    const arnMatch = member.match(/arn:aws:ecs:[^<\s]+/);
    if (arnMatch) {
      clusterArns.push(arnMatch[0]);
      console.log('✅ Extracted ARN:', arnMatch[0]);
    } else if (member.trim() && member.includes('arn:')) {
      // Fallback: if member contains 'arn:' take the whole trimmed content
      clusterArns.push(member.trim());
      console.log('✅ Extracted ARN (fallback):', member.trim());
    } else {
      console.log('❌ Could not extract ARN from member:', member);
    }
  }
  
  console.log(`🎯 Total extracted cluster ARNs: ${clusterArns.length}`);
  return clusterArns;
}

function extractECSServices(xml: string): string[] {
  // AWS returns service ARNs inside <member> tags within <serviceArns>
  const serviceArns: string[] = [];
  
  // Extract content between <serviceArns> tags first
  const serviceArnsSection = extractTextBetween(xml, 'serviceArns', 'serviceArns')[0] || xml;
  
  // Now extract all member values (which contain the ARNs)
  const members = extractTextBetween(serviceArnsSection, 'member', 'member');
  
  for (const member of members) {
    // ARNs follow pattern: arn:aws:ecs:region:account-id:service/cluster-name/service-name
    const arnMatch = member.match(/arn:aws:ecs:[^<\s]+/);
    if (arnMatch) {
      serviceArns.push(arnMatch[0]);
    } else if (member.trim() && member.includes('arn:')) {
      // Fallback: if member contains 'arn:' take the whole trimmed content
      serviceArns.push(member.trim());
    }
  }
  
  return serviceArns;
}
