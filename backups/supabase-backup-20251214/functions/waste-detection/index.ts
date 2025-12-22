import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getResolvedAWSCredentials, signAWSGetRequest } from '../_shared/aws-credentials-helper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Comprehensive AWS pricing table (USD per hour)
const INSTANCE_PRICING: Record<string, number> = {
  // T3 family
  't3.nano': 0.0052, 't3.micro': 0.0104, 't3.small': 0.0208, 't3.medium': 0.0416,
  't3.large': 0.0832, 't3.xlarge': 0.1664, 't3.2xlarge': 0.3328,
  // T3a family
  't3a.nano': 0.0047, 't3a.micro': 0.0094, 't3a.small': 0.0188, 't3a.medium': 0.0376,
  't3a.large': 0.0752, 't3a.xlarge': 0.1504, 't3a.2xlarge': 0.3008,
  // T2 family
  't2.nano': 0.0058, 't2.micro': 0.0116, 't2.small': 0.023, 't2.medium': 0.0464,
  't2.large': 0.0928, 't2.xlarge': 0.1856, 't2.2xlarge': 0.3712,
  // M5 family
  'm5.large': 0.096, 'm5.xlarge': 0.192, 'm5.2xlarge': 0.384, 'm5.4xlarge': 0.768,
  'm5.8xlarge': 1.536, 'm5.12xlarge': 2.304, 'm5.16xlarge': 3.072, 'm5.24xlarge': 4.608,
  // M6i family
  'm6i.large': 0.096, 'm6i.xlarge': 0.192, 'm6i.2xlarge': 0.384, 'm6i.4xlarge': 0.768,
  'm6i.8xlarge': 1.536, 'm6i.12xlarge': 2.304, 'm6i.16xlarge': 3.072,
  // C5 family
  'c5.large': 0.085, 'c5.xlarge': 0.17, 'c5.2xlarge': 0.34, 'c5.4xlarge': 0.68,
  'c5.9xlarge': 1.53, 'c5.12xlarge': 2.04, 'c5.18xlarge': 3.06, 'c5.24xlarge': 4.08,
  // C6i family
  'c6i.large': 0.085, 'c6i.xlarge': 0.17, 'c6i.2xlarge': 0.34, 'c6i.4xlarge': 0.68,
  // R5 family
  'r5.large': 0.126, 'r5.xlarge': 0.252, 'r5.2xlarge': 0.504, 'r5.4xlarge': 1.008,
  'r5.8xlarge': 2.016, 'r5.12xlarge': 3.024, 'r5.16xlarge': 4.032, 'r5.24xlarge': 6.048,
  // R6i family
  'r6i.large': 0.126, 'r6i.xlarge': 0.252, 'r6i.2xlarge': 0.504, 'r6i.4xlarge': 1.008,
  // I3 family
  'i3.large': 0.156, 'i3.xlarge': 0.312, 'i3.2xlarge': 0.624, 'i3.4xlarge': 1.248,
  // G4 family (GPU)
  'g4dn.xlarge': 0.526, 'g4dn.2xlarge': 0.752, 'g4dn.4xlarge': 1.204, 'g4dn.8xlarge': 2.176,
  // P3 family (GPU)
  'p3.2xlarge': 3.06, 'p3.8xlarge': 12.24, 'p3.16xlarge': 24.48,
};

// RDS pricing (USD per hour)
const RDS_PRICING: Record<string, number> = {
  'db.t3.micro': 0.017, 'db.t3.small': 0.034, 'db.t3.medium': 0.068, 'db.t3.large': 0.136,
  'db.t3.xlarge': 0.272, 'db.t3.2xlarge': 0.544,
  'db.m5.large': 0.171, 'db.m5.xlarge': 0.342, 'db.m5.2xlarge': 0.684, 'db.m5.4xlarge': 1.368,
  'db.r5.large': 0.24, 'db.r5.xlarge': 0.48, 'db.r5.2xlarge': 0.96, 'db.r5.4xlarge': 1.92,
  'db.r6g.large': 0.216, 'db.r6g.xlarge': 0.432, 'db.r6g.2xlarge': 0.864,
};

// NAT Gateway pricing
const NAT_GATEWAY_HOURLY = 0.045; // per hour
const NAT_GATEWAY_PER_GB = 0.045; // per GB processed

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting Enhanced AWS Waste Detection...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // CRITICAL: Authenticate user and get organization from session
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authentication required');
    }

    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userId = payload.sub;
    
    if (!userId) {
      throw new Error('Authentication required');
    }

    console.log('✅ User authenticated:', userId);

    const { data: orgId, error: orgError } = await supabase.rpc('get_user_organization', { _user_id: userId });
    if (orgError || !orgId) {
      throw new Error('Organization not found for user');
    }

    console.log('✅ Organization:', orgId);

    let accountIdFromBody: string | null = null;
    try {
      const body = await req.json();
      accountIdFromBody = body?.accountId || null;
    } catch (_) {}

    let credQuery = supabase
      .from('aws_credentials')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    if (accountIdFromBody) {
      credQuery = credQuery.eq('id', accountIdFromBody);
    }

    const { data: credentialsList, error: credError } = await credQuery.limit(1);
    const credentials = credentialsList?.[0] || null;

    if (credError || !credentials) {
      throw new Error('AWS credentials not found for this organization');
    }

    console.log('✅ AWS credentials loaded for account:', credentials.id);

    let resolvedCreds: { accessKeyId: string; secretAccessKey: string; sessionToken?: string; region: string };
    try {
      resolvedCreds = await getResolvedAWSCredentials(credentials, credentials.regions?.[0] || 'us-east-1');
      console.log('✅ Credentials resolved via AssumeRole');
    } catch (e) {
      throw new Error(`Falha ao assumir Role AWS: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    const wasteDetections: any[] = [];
    const startTime = Date.now();

    // IMPROVEMENT: Parallel region processing
    console.log(`Processing ${credentials.regions.length} regions in parallel...`);
    
    const regionPromises = credentials.regions.map(async (region: string) => {
      const regionWaste: any[] = [];
      console.log(`Scanning region: ${region}`);

      try {
        // 1. Detect unattached EBS volumes
        const volumes = await listEBSVolumes(resolvedCreds, region);
        console.log(`Found ${volumes.length} EBS volumes in ${region}`);
        
        for (const volume of volumes) {
          if (volume.state === 'available') {
            const sizeGb = parseInt(volume.size) || 10;
            const pricePerGb = volume.volumeType === 'gp3' ? 0.08 : volume.volumeType === 'io1' ? 0.125 : 0.10;
            const monthlyCost = sizeGb * pricePerGb;
            regionWaste.push({
              aws_account_id: credentials.id,
              resource_type: 'EBS',
              resource_id: volume.volumeId,
              resource_name: volume.name || volume.volumeId,
              waste_type: 'unattached_volume',
              region: region,
              monthly_waste_cost: monthlyCost,
              yearly_waste_cost: monthlyCost * 12,
              severity: monthlyCost > 50 ? 'high' : monthlyCost > 20 ? 'medium' : 'low',
              recommendations: `Volume ${volume.volumeId} (${sizeGb}GB, ${volume.volumeType}) está não anexado. Considere deletar ou criar snapshot se não for mais necessário.`,
              confidence_score: 95,
              auto_remediation_available: true,
              status: 'active',
              utilization_metrics: { size_gb: sizeGb, state: volume.state, volume_type: volume.volumeType }
            });
          }
        }

        // 2. Detect old snapshots (older than 90 days)
        const snapshots = await listSnapshots(resolvedCreds, region);
        console.log(`Found ${snapshots.length} snapshots in ${region}`);
        
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        
        for (const snapshot of snapshots) {
          const startTime = new Date(snapshot.startTime);
          if (startTime < ninetyDaysAgo) {
            const sizeGb = parseInt(snapshot.volumeSize) || 10;
            const monthlyCost = sizeGb * 0.05;
            const ageDays = Math.floor((Date.now() - startTime.getTime()) / (1000 * 60 * 60 * 24));
            
            regionWaste.push({
              aws_account_id: credentials.id,
              resource_type: 'EBS Snapshot',
              resource_id: snapshot.snapshotId,
              resource_name: snapshot.name || snapshot.snapshotId,
              waste_type: 'old_snapshot',
              region: region,
              monthly_waste_cost: monthlyCost,
              yearly_waste_cost: monthlyCost * 12,
              severity: ageDays > 365 ? 'high' : ageDays > 180 ? 'medium' : 'low',
              recommendations: `Snapshot ${snapshot.snapshotId} tem ${ageDays} dias (${sizeGb}GB). Avalie se ainda é necessário.`,
              confidence_score: 90,
              auto_remediation_available: true,
              status: 'active',
              utilization_metrics: { size_gb: sizeGb, age_days: ageDays }
            });
          }
        }

        // 3. Detect unattached Elastic IPs
        const eips = await listElasticIPs(resolvedCreds, region);
        console.log(`Found ${eips.length} Elastic IPs in ${region}`);
        
        for (const eip of eips) {
          if (!eip.instanceId && !eip.networkInterfaceId) {
            const monthlyCost = 3.60;
            regionWaste.push({
              aws_account_id: credentials.id,
              resource_type: 'Elastic IP',
              resource_id: eip.allocationId || eip.publicIp,
              resource_name: eip.name || eip.publicIp,
              waste_type: 'unattached_eip',
              region: region,
              monthly_waste_cost: monthlyCost,
              yearly_waste_cost: monthlyCost * 12,
              severity: 'medium',
              recommendations: `Elastic IP ${eip.publicIp} não está anexado. Libere para evitar cobrança.`,
              confidence_score: 98,
              auto_remediation_available: true,
              status: 'active',
              utilization_metrics: { public_ip: eip.publicIp }
            });
          }
        }

        // 4. Detect EC2 instances with CloudWatch metrics validation
        const instances = await listEC2Instances(resolvedCreds, region);
        console.log(`Found ${instances.length} EC2 instances in ${region}`);
        
        // Get CloudWatch metrics for running instances
        const runningInstances = instances.filter(i => i.state === 'running');
        const instanceMetrics = await getEC2CloudWatchMetrics(resolvedCreds, region, runningInstances.map(i => i.instanceId));
        
        for (const instance of runningInstances) {
          const instanceType = instance.instanceType || 't3.medium';
          const hourlyCost = INSTANCE_PRICING[instanceType] || 0.05;
          const monthlyCost = hourlyCost * 730;
          const instanceName = instance.name || instance.instanceId;
          
          const metrics = instanceMetrics[instance.instanceId];
          const avgCpu = metrics?.avgCpu ?? null;
          const maxCpu = metrics?.maxCpu ?? null;
          
          // Only flag as waste if we have metrics showing low utilization
          let confidence = 60;
          let isWaste = true;
          let wasteType = 'potential_idle';
          
          if (avgCpu !== null) {
            if (avgCpu < 5 && maxCpu !== null && maxCpu < 10) {
              confidence = 95;
              wasteType = 'idle_resource';
            } else if (avgCpu < 15) {
              confidence = 80;
              wasteType = 'underutilized';
            } else if (avgCpu < 30) {
              confidence = 65;
              wasteType = 'low_utilization';
            } else {
              isWaste = false;
            }
          }
          
          if (isWaste) {
            regionWaste.push({
              aws_account_id: credentials.id,
              resource_type: 'EC2',
              resource_id: instance.instanceId,
              resource_name: instanceName,
              waste_type: wasteType,
              region: region,
              monthly_waste_cost: monthlyCost,
              yearly_waste_cost: monthlyCost * 12,
              severity: monthlyCost > 200 ? 'high' : monthlyCost > 50 ? 'medium' : 'low',
              recommendations: avgCpu !== null
                ? `Instância ${instanceName} (${instanceType}) com CPU média ${avgCpu.toFixed(1)}%. ${wasteType === 'idle_resource' ? 'Considere terminar.' : 'Considere redimensionar.'}`
                : `Instância ${instanceName} (${instanceType}) em execução. Verifique métricas CloudWatch.`,
              confidence_score: confidence,
              auto_remediation_available: false,
              status: 'active',
              utilization_metrics: { 
                instance_type: instanceType,
                avg_cpu: avgCpu,
                max_cpu: maxCpu,
                launch_time: instance.launchTime
              }
            });
          }
        }

        // 5. NEW: Detect idle RDS instances
        const rdsInstances = await listRDSInstances(resolvedCreds, region);
        console.log(`Found ${rdsInstances.length} RDS instances in ${region}`);
        
        const rdsMetrics = await getRDSCloudWatchMetrics(resolvedCreds, region, rdsInstances.map(r => r.dbInstanceIdentifier));
        
        for (const rds of rdsInstances) {
          if (rds.status !== 'available') continue;
          
          const instanceClass = rds.dbInstanceClass || 'db.t3.medium';
          const hourlyCost = RDS_PRICING[instanceClass] || 0.10;
          const monthlyCost = hourlyCost * 730;
          
          const metrics = rdsMetrics[rds.dbInstanceIdentifier];
          const avgConnections = metrics?.avgConnections ?? null;
          const avgCpu = metrics?.avgCpu ?? null;
          
          let confidence = 55;
          let wasteType = 'potential_idle_rds';
          
          if (avgConnections !== null && avgCpu !== null) {
            if (avgConnections < 1 && avgCpu < 5) {
              confidence = 95;
              wasteType = 'idle_rds';
            } else if (avgConnections < 5 && avgCpu < 15) {
              confidence = 75;
              wasteType = 'underutilized_rds';
            }
          }
          
          regionWaste.push({
            aws_account_id: credentials.id,
            resource_type: 'RDS',
            resource_id: rds.dbInstanceIdentifier,
            resource_name: rds.dbInstanceIdentifier,
            waste_type: wasteType,
            region: region,
            monthly_waste_cost: monthlyCost,
            yearly_waste_cost: monthlyCost * 12,
            severity: monthlyCost > 300 ? 'high' : monthlyCost > 100 ? 'medium' : 'low',
            recommendations: avgConnections !== null
              ? `RDS ${rds.dbInstanceIdentifier} (${instanceClass}) com ${avgConnections.toFixed(0)} conexões médias e CPU ${avgCpu?.toFixed(1)}%. ${wasteType === 'idle_rds' ? 'Considere parar ou deletar.' : 'Considere redimensionar.'}`
              : `RDS ${rds.dbInstanceIdentifier} (${instanceClass}) em execução. Verifique conexões e CPU.`,
            confidence_score: confidence,
            auto_remediation_available: false,
            status: 'active',
            utilization_metrics: {
              instance_class: instanceClass,
              engine: rds.engine,
              multi_az: rds.multiAZ,
              avg_connections: avgConnections,
              avg_cpu: avgCpu
            }
          });
        }

        // 6. NEW: Detect NAT Gateways with low traffic
        const natGateways = await listNATGateways(resolvedCreds, region);
        console.log(`Found ${natGateways.length} NAT Gateways in ${region}`);
        
        const natMetrics = await getNATGatewayMetrics(resolvedCreds, region, natGateways.map(n => n.natGatewayId));
        
        for (const nat of natGateways) {
          if (nat.state !== 'available') continue;
          
          const metrics = natMetrics[nat.natGatewayId];
          const bytesOut = metrics?.bytesOutToDestination ?? null;
          const bytesIn = metrics?.bytesInFromDestination ?? null;
          
          const baseMonthlyCost = NAT_GATEWAY_HOURLY * 730;
          const dataProcessedGB = ((bytesOut || 0) + (bytesIn || 0)) / (1024 * 1024 * 1024) * 30; // Estimate monthly
          const dataCost = dataProcessedGB * NAT_GATEWAY_PER_GB;
          const totalMonthlyCost = baseMonthlyCost + dataCost;
          
          let confidence = 50;
          let wasteType = 'nat_gateway';
          
          if (bytesOut !== null) {
            if (bytesOut < 1000000) { // Less than 1MB/day
              confidence = 90;
              wasteType = 'idle_nat_gateway';
            } else if (dataProcessedGB < 10) {
              confidence = 70;
              wasteType = 'low_traffic_nat_gateway';
            }
          }
          
          regionWaste.push({
            aws_account_id: credentials.id,
            resource_type: 'NAT Gateway',
            resource_id: nat.natGatewayId,
            resource_name: nat.name || nat.natGatewayId,
            waste_type: wasteType,
            region: region,
            monthly_waste_cost: totalMonthlyCost,
            yearly_waste_cost: totalMonthlyCost * 12,
            severity: totalMonthlyCost > 100 ? 'high' : 'medium',
            recommendations: bytesOut !== null
              ? `NAT Gateway ${nat.natGatewayId} processando ~${dataProcessedGB.toFixed(1)}GB/mês. ${wasteType === 'idle_nat_gateway' ? 'Considere usar NAT Instance ou VPC endpoints.' : 'Avalie alternativas de custo.'}`
              : `NAT Gateway ${nat.natGatewayId} custa ~$${baseMonthlyCost.toFixed(2)}/mês + dados. Avalie se é necessário.`,
            confidence_score: confidence,
            auto_remediation_available: false,
            status: 'active',
            utilization_metrics: {
              bytes_out: bytesOut,
              bytes_in: bytesIn,
              estimated_gb_monthly: dataProcessedGB
            }
          });
        }

        // 7. NEW: Detect old AMIs
        const amis = await listOwnedAMIs(resolvedCreds, region);
        console.log(`Found ${amis.length} owned AMIs in ${region}`);
        
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        
        for (const ami of amis) {
          const creationDate = new Date(ami.creationDate);
          const ageDays = Math.floor((Date.now() - creationDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (creationDate < oneYearAgo) {
            // AMI storage cost estimate (~$0.05/GB/month for snapshots backing AMI)
            const estimatedMonthlyCost = 5; // Conservative estimate
            
            regionWaste.push({
              aws_account_id: credentials.id,
              resource_type: 'AMI',
              resource_id: ami.imageId,
              resource_name: ami.name || ami.imageId,
              waste_type: 'old_ami',
              region: region,
              monthly_waste_cost: estimatedMonthlyCost,
              yearly_waste_cost: estimatedMonthlyCost * 12,
              severity: ageDays > 730 ? 'medium' : 'low',
              recommendations: `AMI ${ami.name || ami.imageId} tem ${ageDays} dias. AMIs antigas ocupam espaço e geram custos de snapshot. Considere deregistrar se não for mais necessária.`,
              confidence_score: 80,
              auto_remediation_available: true,
              status: 'active',
              utilization_metrics: {
                age_days: ageDays,
                creation_date: ami.creationDate,
                architecture: ami.architecture
              }
            });
          }
        }

        // 8. NEW: Detect idle ECS clusters
        const ecsClusters = await listECSClusters(resolvedCreds, region);
        console.log(`Found ${ecsClusters.length} ECS clusters in ${region}`);
        
        for (const cluster of ecsClusters) {
          if (cluster.runningTasksCount === 0 && cluster.activeServicesCount === 0 && cluster.registeredContainerInstancesCount === 0) {
            regionWaste.push({
              aws_account_id: credentials.id,
              resource_type: 'ECS Cluster',
              resource_id: cluster.clusterArn,
              resource_name: cluster.clusterName,
              waste_type: 'idle_ecs_cluster',
              region: region,
              monthly_waste_cost: 0, // Clusters are free but indicate unused infrastructure
              yearly_waste_cost: 0,
              severity: 'low',
              recommendations: `ECS Cluster ${cluster.clusterName} está vazio (0 tasks, 0 services, 0 instances). Considere deletar se não for mais necessário.`,
              confidence_score: 95,
              auto_remediation_available: true,
              status: 'active',
              utilization_metrics: {
                running_tasks: cluster.runningTasksCount,
                active_services: cluster.activeServicesCount,
                container_instances: cluster.registeredContainerInstancesCount
              }
            });
          }
        }

        // 9. NEW: Detect low-invocation Lambda functions
        const lambdaFunctions = await listLambdaFunctions(resolvedCreds, region);
        console.log(`Found ${lambdaFunctions.length} Lambda functions in ${region}`);
        
        const lambdaMetrics = await getLambdaMetrics(resolvedCreds, region, lambdaFunctions.map(l => l.functionName));
        
        for (const lambda of lambdaFunctions) {
          const metrics = lambdaMetrics[lambda.functionName];
          const invocations = metrics?.invocations ?? null;
          const errors = metrics?.errors ?? 0;
          
          // Lambda with 0 invocations in last 30 days
          if (invocations !== null && invocations === 0) {
            const memoryMB = lambda.memorySize || 128;
            // Estimate cost of keeping code stored (~$0.0000002/GB-second storage)
            const estimatedMonthlyCost = 0.50; // Minimal but not zero
            
            regionWaste.push({
              aws_account_id: credentials.id,
              resource_type: 'Lambda',
              resource_id: lambda.functionArn,
              resource_name: lambda.functionName,
              waste_type: 'unused_lambda',
              region: region,
              monthly_waste_cost: estimatedMonthlyCost,
              yearly_waste_cost: estimatedMonthlyCost * 12,
              severity: 'low',
              recommendations: `Lambda ${lambda.functionName} não foi invocada nos últimos 30 dias. Considere deletar se não for mais necessária.`,
              confidence_score: 95,
              auto_remediation_available: true,
              status: 'active',
              utilization_metrics: {
                memory_mb: memoryMB,
                runtime: lambda.runtime,
                invocations_30d: invocations,
                errors_30d: errors,
                last_modified: lambda.lastModified
              }
            });
          }
        }

        // 10. Load Balancers
        const loadBalancers = await listLoadBalancers(resolvedCreds, region);
        console.log(`Found ${loadBalancers.length} Load Balancers in ${region}`);
        
        const lbMetrics = await getLoadBalancerMetrics(resolvedCreds, region, loadBalancers);
        
        for (const lb of loadBalancers) {
          const isNetwork = lb.type === 'network';
          const baseMonthlyCost = isNetwork ? 23.0 : 22.0;
          const lbName = lb.name || lb.loadBalancerName;
          
          const metrics = lbMetrics[lb.loadBalancerArn];
          const requestCount = metrics?.requestCount ?? null;
          
          let confidence = 55;
          let wasteType = 'load_balancer';
          
          if (requestCount !== null) {
            if (requestCount < 100) { // Less than 100 requests per day
              confidence = 90;
              wasteType = 'idle_load_balancer';
            } else if (requestCount < 1000) {
              confidence = 70;
              wasteType = 'low_traffic_load_balancer';
            }
          }
          
          regionWaste.push({
            aws_account_id: credentials.id,
            resource_type: isNetwork ? 'Network Load Balancer' : 'Application Load Balancer',
            resource_id: lb.loadBalancerArn,
            resource_name: lbName,
            waste_type: wasteType,
            region: region,
            monthly_waste_cost: baseMonthlyCost,
            yearly_waste_cost: baseMonthlyCost * 12,
            severity: 'medium',
            recommendations: requestCount !== null
              ? `${lbName} com ~${requestCount} requests/dia. ${wasteType === 'idle_load_balancer' ? 'Considere remover.' : 'Avalie necessidade.'}`
              : `${lbName} custa ~$${baseMonthlyCost.toFixed(2)}/mês. Verifique tráfego.`,
            confidence_score: confidence,
            auto_remediation_available: false,
            status: 'active',
            utilization_metrics: { 
              type: lb.type,
              dns_name: lb.dnsName,
              request_count: requestCount
            }
          });
        }

      } catch (regionError) {
        console.error(`Error scanning region ${region}:`, regionError);
      }

      return regionWaste;
    });

    // Wait for all regions to complete
    const regionResults = await Promise.all(regionPromises);
    for (const regionWaste of regionResults) {
      wasteDetections.push(...regionWaste);
    }

    console.log(`Found ${wasteDetections.length} total waste items`);

    const totalMonthlyWaste = wasteDetections.reduce((sum, w) => sum + w.monthly_waste_cost, 0);
    const totalYearlyWaste = wasteDetections.reduce((sum, w) => sum + w.yearly_waste_cost, 0);

    // Delete previous active waste detections
    await supabase
      .from('waste_detection')
      .delete()
      .eq('aws_account_id', credentials.id)
      .eq('status', 'active');

    // Insert new waste detections
    if (wasteDetections.length > 0) {
      const { error: insertError } = await supabase
        .from('waste_detection')
        .insert(wasteDetections);

      if (insertError) {
        console.error('Error inserting waste detections:', insertError);
        throw insertError;
      }
    }

    // Record scan in history
    const scanDuration = Math.floor((Date.now() - startTime) / 1000);
    const today = new Date().toISOString().split('T')[0];
    
    await supabase
      .from('waste_detection_history')
      .insert({
        organization_id: orgId,
        aws_account_id: credentials.id,
        scan_date: today,
        total_waste_count: wasteDetections.length,
        total_monthly_cost: totalMonthlyWaste,
        total_yearly_cost: totalYearlyWaste,
        scan_duration_seconds: scanDuration,
        status: 'completed',
        waste_by_type: {
          ebs: wasteDetections.filter(w => w.resource_type === 'EBS').length,
          snapshots: wasteDetections.filter(w => w.resource_type === 'EBS Snapshot').length,
          eip: wasteDetections.filter(w => w.resource_type === 'Elastic IP').length,
          ec2: wasteDetections.filter(w => w.resource_type === 'EC2').length,
          rds: wasteDetections.filter(w => w.resource_type === 'RDS').length,
          nat: wasteDetections.filter(w => w.resource_type === 'NAT Gateway').length,
          ami: wasteDetections.filter(w => w.resource_type === 'AMI').length,
          ecs: wasteDetections.filter(w => w.resource_type === 'ECS Cluster').length,
          lambda: wasteDetections.filter(w => w.resource_type === 'Lambda').length,
          lb: wasteDetections.filter(w => w.resource_type.includes('Load Balancer')).length,
        }
      });

    console.log(`✅ Enhanced Waste Detection completed in ${scanDuration}s`);

    return new Response(
      JSON.stringify({
        success: true,
        waste_count: wasteDetections.length,
        total_monthly_waste: totalMonthlyWaste,
        total_yearly_waste: totalYearlyWaste,
        regions_scanned: credentials.regions.length,
        scan_duration_seconds: scanDuration
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in waste detection:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// AWS API Helper Functions
async function makeAWSRequest(
  resolvedCreds: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  service: string, 
  region: string, 
  action: string, 
  params: Record<string, string> = {}
) {
  const queryParams = new URLSearchParams({
    Action: action,
    Version: getAPIVersion(service),
    ...params
  });

  const host = `${service}.${region}.amazonaws.com`;
  const path = '/';
  const queryString = queryParams.toString();

  const signedHeaders = await signAWSGetRequest(
    resolvedCreds,
    service,
    region,
    host,
    path,
    queryString
  );

  const url = `https://${host}${path}?${queryString}`;
  const response = await fetch(url, { headers: signedHeaders });
  const text = await response.text();
  
  if (!response.ok) {
    console.error(`AWS API error for ${action}:`, text.substring(0, 300));
    throw new Error(`AWS API error: ${response.status}`);
  }
  
  return text;
}

function getAPIVersion(service: string): string {
  const versions: Record<string, string> = {
    'ec2': '2016-11-15',
    'rds': '2014-10-31',
    'elasticloadbalancing': '2015-12-01',
    'ecs': '2014-11-13',
    'lambda': '2015-03-31',
    'monitoring': '2010-08-01',
  };
  return versions[service] || '2016-11-15';
}

// Parsing functions
function parseVolumesXML(xml: string): any[] {
  const volumes: any[] = [];
  const volumeRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = volumeRegex.exec(xml)) !== null) {
    const item = match[1];
    const volumeId = item.match(/<volumeId>([^<]+)<\/volumeId>/)?.[1];
    const state = item.match(/<status>([^<]+)<\/status>/)?.[1];
    const size = item.match(/<size>([^<]+)<\/size>/)?.[1];
    const volumeType = item.match(/<volumeType>([^<]+)<\/volumeType>/)?.[1];
    const nameTag = item.match(/<key>Name<\/key>\s*<value>([^<]*)<\/value>/)?.[1];
    
    if (volumeId) {
      volumes.push({ volumeId, state: state || 'unknown', size: size || '0', volumeType: volumeType || 'gp2', name: nameTag || null });
    }
  }
  return volumes;
}

function parseSnapshotsXML(xml: string): any[] {
  const snapshots: any[] = [];
  const snapshotRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = snapshotRegex.exec(xml)) !== null) {
    const item = match[1];
    const snapshotId = item.match(/<snapshotId>([^<]+)<\/snapshotId>/)?.[1];
    const volumeSize = item.match(/<volumeSize>([^<]+)<\/volumeSize>/)?.[1];
    const startTime = item.match(/<startTime>([^<]+)<\/startTime>/)?.[1];
    const state = item.match(/<status>([^<]+)<\/status>/)?.[1];
    const nameTag = item.match(/<key>Name<\/key>\s*<value>([^<]*)<\/value>/)?.[1];
    
    if (snapshotId && state === 'completed') {
      snapshots.push({ snapshotId, volumeSize: volumeSize || '0', startTime: startTime || new Date().toISOString(), name: nameTag || null });
    }
  }
  return snapshots;
}

function parseAddressesXML(xml: string): any[] {
  const addresses: any[] = [];
  const addressRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = addressRegex.exec(xml)) !== null) {
    const item = match[1];
    const publicIp = item.match(/<publicIp>([^<]+)<\/publicIp>/)?.[1];
    const allocationId = item.match(/<allocationId>([^<]+)<\/allocationId>/)?.[1];
    const instanceId = item.match(/<instanceId>([^<]+)<\/instanceId>/)?.[1];
    const networkInterfaceId = item.match(/<networkInterfaceId>([^<]+)<\/networkInterfaceId>/)?.[1];
    const nameTag = item.match(/<key>Name<\/key>\s*<value>([^<]*)<\/value>/)?.[1];
    
    if (publicIp || allocationId) {
      addresses.push({ publicIp, allocationId, instanceId: instanceId || null, networkInterfaceId: networkInterfaceId || null, name: nameTag || null });
    }
  }
  return addresses;
}

function parseInstancesXML(xml: string): any[] {
  const instances: any[] = [];
  const instanceRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = instanceRegex.exec(xml)) !== null) {
    const item = match[1];
    const instanceId = item.match(/<instanceId>([^<]+)<\/instanceId>/)?.[1];
    const instanceType = item.match(/<instanceType>([^<]+)<\/instanceType>/)?.[1];
    // Fixed: Extract state from <instanceState><code>...</code><name>...</name></instanceState>
    const stateBlock = item.match(/<instanceState>([\s\S]*?)<\/instanceState>/)?.[1];
    const stateName = stateBlock?.match(/<name>([^<]+)<\/name>/)?.[1] || item.match(/<stateName>([^<]+)<\/stateName>/)?.[1];
    const launchTime = item.match(/<launchTime>([^<]+)<\/launchTime>/)?.[1];
    const nameTag = item.match(/<key>Name<\/key>\s*<value>([^<]*)<\/value>/)?.[1];
    
    if (instanceId && stateName) {
      instances.push({ instanceId, instanceType: instanceType || 't3.medium', state: stateName, launchTime: launchTime || '', name: nameTag || null });
    }
  }
  return instances;
}

function parseLoadBalancersXML(xml: string): any[] {
  const loadBalancers: any[] = [];
  const lbRegex = /<member>([\s\S]*?)<\/member>/g;
  let match;
  
  while ((match = lbRegex.exec(xml)) !== null) {
    const item = match[1];
    const loadBalancerArn = item.match(/<LoadBalancerArn>([^<]+)<\/LoadBalancerArn>/)?.[1];
    const loadBalancerName = item.match(/<LoadBalancerName>([^<]+)<\/LoadBalancerName>/)?.[1];
    const dnsName = item.match(/<DNSName>([^<]+)<\/DNSName>/)?.[1];
    const type = item.match(/<Type>([^<]+)<\/Type>/)?.[1];
    const scheme = item.match(/<Scheme>([^<]+)<\/Scheme>/)?.[1];
    
    if (loadBalancerArn) {
      loadBalancers.push({ loadBalancerArn, loadBalancerName, name: loadBalancerName, dnsName, type: type || 'application', scheme });
    }
  }
  return loadBalancers;
}

// Resource listing functions
async function listEBSVolumes(creds: any, region: string): Promise<any[]> {
  try {
    const xml = await makeAWSRequest(creds, 'ec2', region, 'DescribeVolumes');
    return parseVolumesXML(xml);
  } catch (e) {
    console.error(`Error listing EBS volumes in ${region}:`, e);
    return [];
  }
}

async function listSnapshots(creds: any, region: string): Promise<any[]> {
  try {
    const xml = await makeAWSRequest(creds, 'ec2', region, 'DescribeSnapshots', { 'Owner.1': 'self' });
    return parseSnapshotsXML(xml);
  } catch (e) {
    console.error(`Error listing snapshots in ${region}:`, e);
    return [];
  }
}

async function listElasticIPs(creds: any, region: string): Promise<any[]> {
  try {
    const xml = await makeAWSRequest(creds, 'ec2', region, 'DescribeAddresses');
    return parseAddressesXML(xml);
  } catch (e) {
    console.error(`Error listing Elastic IPs in ${region}:`, e);
    return [];
  }
}

async function listEC2Instances(creds: any, region: string): Promise<any[]> {
  try {
    const xml = await makeAWSRequest(creds, 'ec2', region, 'DescribeInstances');
    return parseInstancesXML(xml);
  } catch (e) {
    console.error(`Error listing EC2 instances in ${region}:`, e);
    return [];
  }
}

async function listLoadBalancers(creds: any, region: string): Promise<any[]> {
  try {
    const xml = await makeAWSRequest(creds, 'elasticloadbalancing', region, 'DescribeLoadBalancers');
    return parseLoadBalancersXML(xml);
  } catch (e) {
    console.error(`Error listing Load Balancers in ${region}:`, e);
    return [];
  }
}

async function listRDSInstances(creds: any, region: string): Promise<any[]> {
  try {
    const xml = await makeAWSRequest(creds, 'rds', region, 'DescribeDBInstances');
    const instances: any[] = [];
    const instanceRegex = /<DBInstance>([\s\S]*?)<\/DBInstance>/g;
    let match;
    
    while ((match = instanceRegex.exec(xml)) !== null) {
      const item = match[1];
      const dbInstanceIdentifier = item.match(/<DBInstanceIdentifier>([^<]+)<\/DBInstanceIdentifier>/)?.[1];
      const dbInstanceClass = item.match(/<DBInstanceClass>([^<]+)<\/DBInstanceClass>/)?.[1];
      const engine = item.match(/<Engine>([^<]+)<\/Engine>/)?.[1];
      const status = item.match(/<DBInstanceStatus>([^<]+)<\/DBInstanceStatus>/)?.[1];
      const multiAZ = item.match(/<MultiAZ>([^<]+)<\/MultiAZ>/)?.[1] === 'true';
      
      if (dbInstanceIdentifier) {
        instances.push({ dbInstanceIdentifier, dbInstanceClass, engine, status, multiAZ });
      }
    }
    return instances;
  } catch (e) {
    console.error(`Error listing RDS instances in ${region}:`, e);
    return [];
  }
}

async function listNATGateways(creds: any, region: string): Promise<any[]> {
  try {
    const xml = await makeAWSRequest(creds, 'ec2', region, 'DescribeNatGateways');
    const gateways: any[] = [];
    const natRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = natRegex.exec(xml)) !== null) {
      const item = match[1];
      const natGatewayId = item.match(/<natGatewayId>([^<]+)<\/natGatewayId>/)?.[1];
      const state = item.match(/<state>([^<]+)<\/state>/)?.[1];
      const nameTag = item.match(/<key>Name<\/key>\s*<value>([^<]*)<\/value>/)?.[1];
      
      if (natGatewayId) {
        gateways.push({ natGatewayId, state, name: nameTag || null });
      }
    }
    return gateways;
  } catch (e) {
    console.error(`Error listing NAT Gateways in ${region}:`, e);
    return [];
  }
}

async function listOwnedAMIs(creds: any, region: string): Promise<any[]> {
  try {
    const xml = await makeAWSRequest(creds, 'ec2', region, 'DescribeImages', { 'Owner.1': 'self' });
    const amis: any[] = [];
    const amiRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = amiRegex.exec(xml)) !== null) {
      const item = match[1];
      const imageId = item.match(/<imageId>([^<]+)<\/imageId>/)?.[1];
      const name = item.match(/<name>([^<]+)<\/name>/)?.[1];
      const creationDate = item.match(/<creationDate>([^<]+)<\/creationDate>/)?.[1];
      const architecture = item.match(/<architecture>([^<]+)<\/architecture>/)?.[1];
      
      if (imageId && creationDate) {
        amis.push({ imageId, name, creationDate, architecture });
      }
    }
    return amis;
  } catch (e) {
    console.error(`Error listing AMIs in ${region}:`, e);
    return [];
  }
}

async function listECSClusters(creds: any, region: string): Promise<any[]> {
  try {
    // First list cluster ARNs
    const listXml = await makeAWSRequest(creds, 'ecs', region, 'ListClusters');
    const arnMatches = listXml.match(/<member>([^<]+)<\/member>/g) || [];
    const clusterArns = arnMatches.map(m => m.replace(/<\/?member>/g, '')).filter(a => a.includes('arn:aws:ecs'));
    
    if (clusterArns.length === 0) return [];
    
    // Then describe clusters
    const params: Record<string, string> = {};
    clusterArns.forEach((arn, i) => {
      params[`clusters.member.${i + 1}`] = arn;
    });
    
    const describeXml = await makeAWSRequest(creds, 'ecs', region, 'DescribeClusters', params);
    const clusters: any[] = [];
    const clusterRegex = /<member>([\s\S]*?)<\/member>/g;
    let match;
    
    while ((match = clusterRegex.exec(describeXml)) !== null) {
      const item = match[1];
      const clusterArn = item.match(/<clusterArn>([^<]+)<\/clusterArn>/)?.[1];
      const clusterName = item.match(/<clusterName>([^<]+)<\/clusterName>/)?.[1];
      const runningTasksCount = parseInt(item.match(/<runningTasksCount>([^<]+)<\/runningTasksCount>/)?.[1] || '0');
      const activeServicesCount = parseInt(item.match(/<activeServicesCount>([^<]+)<\/activeServicesCount>/)?.[1] || '0');
      const registeredContainerInstancesCount = parseInt(item.match(/<registeredContainerInstancesCount>([^<]+)<\/registeredContainerInstancesCount>/)?.[1] || '0');
      
      if (clusterArn) {
        clusters.push({ clusterArn, clusterName, runningTasksCount, activeServicesCount, registeredContainerInstancesCount });
      }
    }
    return clusters;
  } catch (e) {
    console.error(`Error listing ECS clusters in ${region}:`, e);
    return [];
  }
}

async function listLambdaFunctions(creds: any, region: string): Promise<any[]> {
  try {
    const host = `lambda.${region}.amazonaws.com`;
    const path = '/2015-03-31/functions';
    
    const signedHeaders = await signAWSGetRequest(creds, 'lambda', region, host, path, '');
    const url = `https://${host}${path}`;
    const response = await fetch(url, { headers: signedHeaders });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return (data.Functions || []).map((f: any) => ({
      functionName: f.FunctionName,
      functionArn: f.FunctionArn,
      runtime: f.Runtime,
      memorySize: f.MemorySize,
      lastModified: f.LastModified
    }));
  } catch (e) {
    console.error(`Error listing Lambda functions in ${region}:`, e);
    return [];
  }
}

// CloudWatch metrics functions
async function getEC2CloudWatchMetrics(creds: any, region: string, instanceIds: string[]): Promise<Record<string, any>> {
  const metrics: Record<string, any> = {};
  if (instanceIds.length === 0) return metrics;
  
  try {
    for (const instanceId of instanceIds.slice(0, 20)) { // Limit to avoid timeout
      const params = {
        'Namespace': 'AWS/EC2',
        'MetricName': 'CPUUtilization',
        'Dimensions.member.1.Name': 'InstanceId',
        'Dimensions.member.1.Value': instanceId,
        'StartTime': new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        'EndTime': new Date().toISOString(),
        'Period': '86400',
        'Statistics.member.1': 'Average',
        'Statistics.member.2': 'Maximum'
      };
      
      const xml = await makeAWSRequest(creds, 'monitoring', region, 'GetMetricStatistics', params);
      const avgMatch = xml.match(/<Average>([^<]+)<\/Average>/);
      const maxMatch = xml.match(/<Maximum>([^<]+)<\/Maximum>/);
      
      metrics[instanceId] = {
        avgCpu: avgMatch ? parseFloat(avgMatch[1]) : null,
        maxCpu: maxMatch ? parseFloat(maxMatch[1]) : null
      };
    }
  } catch (e) {
    console.error(`Error getting EC2 CloudWatch metrics in ${region}:`, e);
  }
  
  return metrics;
}

async function getRDSCloudWatchMetrics(creds: any, region: string, dbIdentifiers: string[]): Promise<Record<string, any>> {
  const metrics: Record<string, any> = {};
  if (dbIdentifiers.length === 0) return metrics;
  
  try {
    for (const dbId of dbIdentifiers.slice(0, 10)) {
      // Get CPU
      const cpuParams = {
        'Namespace': 'AWS/RDS',
        'MetricName': 'CPUUtilization',
        'Dimensions.member.1.Name': 'DBInstanceIdentifier',
        'Dimensions.member.1.Value': dbId,
        'StartTime': new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        'EndTime': new Date().toISOString(),
        'Period': '86400',
        'Statistics.member.1': 'Average'
      };
      
      const cpuXml = await makeAWSRequest(creds, 'monitoring', region, 'GetMetricStatistics', cpuParams);
      const avgCpu = cpuXml.match(/<Average>([^<]+)<\/Average>/)?.[1];
      
      // Get connections
      const connParams = {
        'Namespace': 'AWS/RDS',
        'MetricName': 'DatabaseConnections',
        'Dimensions.member.1.Name': 'DBInstanceIdentifier',
        'Dimensions.member.1.Value': dbId,
        'StartTime': new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        'EndTime': new Date().toISOString(),
        'Period': '86400',
        'Statistics.member.1': 'Average'
      };
      
      const connXml = await makeAWSRequest(creds, 'monitoring', region, 'GetMetricStatistics', connParams);
      const avgConnections = connXml.match(/<Average>([^<]+)<\/Average>/)?.[1];
      
      metrics[dbId] = {
        avgCpu: avgCpu ? parseFloat(avgCpu) : null,
        avgConnections: avgConnections ? parseFloat(avgConnections) : null
      };
    }
  } catch (e) {
    console.error(`Error getting RDS CloudWatch metrics in ${region}:`, e);
  }
  
  return metrics;
}

async function getNATGatewayMetrics(creds: any, region: string, natGatewayIds: string[]): Promise<Record<string, any>> {
  const metrics: Record<string, any> = {};
  if (natGatewayIds.length === 0) return metrics;
  
  try {
    for (const natId of natGatewayIds.slice(0, 10)) {
      // Get BytesOutToDestination
      const outParams = {
        'Namespace': 'AWS/NATGateway',
        'MetricName': 'BytesOutToDestination',
        'Dimensions.member.1.Name': 'NatGatewayId',
        'Dimensions.member.1.Value': natId,
        'StartTime': new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        'EndTime': new Date().toISOString(),
        'Period': '86400',
        'Statistics.member.1': 'Sum'
      };
      
      const outXml = await makeAWSRequest(creds, 'monitoring', region, 'GetMetricStatistics', outParams);
      const outSum = outXml.match(/<Sum>([^<]+)<\/Sum>/)?.[1];
      
      // Get BytesInFromDestination
      const inParams = {
        'Namespace': 'AWS/NATGateway',
        'MetricName': 'BytesInFromDestination',
        'Dimensions.member.1.Name': 'NatGatewayId',
        'Dimensions.member.1.Value': natId,
        'StartTime': new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        'EndTime': new Date().toISOString(),
        'Period': '86400',
        'Statistics.member.1': 'Sum'
      };
      
      const inXml = await makeAWSRequest(creds, 'monitoring', region, 'GetMetricStatistics', inParams);
      const inSum = inXml.match(/<Sum>([^<]+)<\/Sum>/)?.[1];
      
      metrics[natId] = {
        bytesOutToDestination: outSum ? parseFloat(outSum) : null,
        bytesInFromDestination: inSum ? parseFloat(inSum) : null
      };
    }
  } catch (e) {
    console.error(`Error getting NAT Gateway metrics in ${region}:`, e);
  }
  
  return metrics;
}

async function getLambdaMetrics(creds: any, region: string, functionNames: string[]): Promise<Record<string, any>> {
  const metrics: Record<string, any> = {};
  if (functionNames.length === 0) return metrics;
  
  try {
    for (const funcName of functionNames.slice(0, 20)) {
      const params = {
        'Namespace': 'AWS/Lambda',
        'MetricName': 'Invocations',
        'Dimensions.member.1.Name': 'FunctionName',
        'Dimensions.member.1.Value': funcName,
        'StartTime': new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        'EndTime': new Date().toISOString(),
        'Period': '2592000', // 30 days
        'Statistics.member.1': 'Sum'
      };
      
      const xml = await makeAWSRequest(creds, 'monitoring', region, 'GetMetricStatistics', params);
      const sum = xml.match(/<Sum>([^<]+)<\/Sum>/)?.[1];
      
      metrics[funcName] = {
        invocations: sum ? parseFloat(sum) : 0,
        errors: 0
      };
    }
  } catch (e) {
    console.error(`Error getting Lambda metrics in ${region}:`, e);
  }
  
  return metrics;
}

async function getLoadBalancerMetrics(creds: any, region: string, loadBalancers: any[]): Promise<Record<string, any>> {
  const metrics: Record<string, any> = {};
  if (loadBalancers.length === 0) return metrics;
  
  try {
    for (const lb of loadBalancers.slice(0, 10)) {
      // Extract the part after loadbalancer/ for the dimension
      const arnParts = lb.loadBalancerArn?.split('loadbalancer/');
      if (!arnParts || arnParts.length < 2) continue;
      
      const metricName = lb.type === 'network' ? 'ActiveFlowCount' : 'RequestCount';
      const params = {
        'Namespace': lb.type === 'network' ? 'AWS/NetworkELB' : 'AWS/ApplicationELB',
        'MetricName': metricName,
        'Dimensions.member.1.Name': 'LoadBalancer',
        'Dimensions.member.1.Value': arnParts[1],
        'StartTime': new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        'EndTime': new Date().toISOString(),
        'Period': '86400',
        'Statistics.member.1': 'Sum'
      };
      
      const xml = await makeAWSRequest(creds, 'monitoring', region, 'GetMetricStatistics', params);
      const sum = xml.match(/<Sum>([^<]+)<\/Sum>/)?.[1];
      
      metrics[lb.loadBalancerArn] = {
        requestCount: sum ? parseFloat(sum) : null
      };
    }
  } catch (e) {
    console.error(`Error getting Load Balancer metrics in ${region}:`, e);
  }
  
  return metrics;
}
