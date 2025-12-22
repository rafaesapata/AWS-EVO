import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from '../../lib/logging.js';
import { PrismaClient } from '@prisma/client';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { 
  EC2Client, 
  DescribeInstancesCommand,
  DescribeVolumesCommand,
  DescribeAddressesCommand,
  DescribeNatGatewaysCommand
} from '@aws-sdk/client-ec2';
import { 
  RDSClient, 
  DescribeDBInstancesCommand 
} from '@aws-sdk/client-rds';
// Removed ELBv2 import as it's causing module not found error
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';

const prisma = new PrismaClient();
const stsClient = new STSClient({});

interface WasteItem {
  resourceId: string;
  resourceType: string;
  resourceName: string;
  region: string;
  wasteType: string;
  estimatedMonthlyCost: number;
  recommendation: string;
  confidence: number;
  details: Record<string, unknown>;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { awsAccountId, regions = ['us-east-1'], analysisDepth = 'standard' } = body;

    if (!awsAccountId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'awsAccountId is required' }) };
    }

    // Buscar credenciais da conta
    const awsAccount = await prisma.awsAccount.findFirst({
      where: { id: awsAccountId },
      include: { organization: true }
    });

    if (!awsAccount) {
      return { statusCode: 404, body: JSON.stringify({ error: 'AWS Account not found' }) };
    }

    // Assume role na conta do cliente (usando campos corretos do schema)
    const assumeRoleResponse = await stsClient.send(new AssumeRoleCommand({
      RoleArn: `arn:aws:iam::${awsAccount.account_id}:role/EvoUdsRole`, // Usar account_id do schema
      RoleSessionName: 'WasteDetectionV2Session',
      DurationSeconds: 3600
    }));

    const credentials = {
      accessKeyId: assumeRoleResponse.Credentials!.AccessKeyId!,
      secretAccessKey: assumeRoleResponse.Credentials!.SecretAccessKey!,
      sessionToken: assumeRoleResponse.Credentials!.SessionToken!
    };

    const wasteItems: WasteItem[] = [];
    let totalWaste = 0;

    for (const region of regions) {
      const ec2Client = new EC2Client({ region, credentials });
      const rdsClient = new RDSClient({ region, credentials });
      // Removed ELBv2 client due to module not found error
      // const elbClient = new ElasticLoadBalancingV2Client({ region, credentials });
      const cwClient = new CloudWatchClient({ region, credentials });

      // 1. Detectar EC2 instances ociosas
      const ec2Waste = await detectIdleEC2Instances(ec2Client, cwClient, region);
      wasteItems.push(...ec2Waste);

      // 2. Detectar EBS volumes não utilizados
      const ebsWaste = await detectUnusedEBSVolumes(ec2Client, region);
      wasteItems.push(...ebsWaste);

      // 3. Detectar Elastic IPs não associados
      const eipWaste = await detectUnassociatedEIPs(ec2Client, region);
      wasteItems.push(...eipWaste);

      // 4. Detectar RDS instances ociosas
      const rdsWaste = await detectIdleRDSInstances(rdsClient, cwClient, region);
      wasteItems.push(...rdsWaste);

      // 5. Detectar Load Balancers sem targets (disabled due to module issue)
      // const elbWaste = await detectUnusedLoadBalancers(elbClient, region);
      // wasteItems.push(...elbWaste);

      // 6. Detectar NAT Gateways ociosos
      if (analysisDepth === 'deep') {
        const natWaste = await detectIdleNATGateways(ec2Client, cwClient, region);
        wasteItems.push(...natWaste);
      }
    }

    // Calcular total
    totalWaste = wasteItems.reduce((sum, item) => sum + item.estimatedMonthlyCost, 0);

    // Salvar análise no banco (removido pois modelo não existe no schema)
    // await prisma.costAnalysis.create({
    //   data: {
    //     awsAccountId,
    //     analysisType: 'WASTE_DETECTION_V2',
    //     totalWaste,
    //     wasteItems: wasteItems as unknown as Record<string, unknown>[],
    //     regions,
    //     analysisDepth,
    //     createdAt: new Date()
    //   }
    // });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        summary: {
          totalWasteItems: wasteItems.length,
          estimatedMonthlyWaste: totalWaste,
          byType: groupByType(wasteItems),
          byRegion: groupByRegion(wasteItems)
        },
        wasteItems: wasteItems.sort((a, b) => b.estimatedMonthlyCost - a.estimatedMonthlyCost),
        recommendations: generateRecommendations(wasteItems)
      })
    };
  } catch (error) {
    logger.error('Waste detection v2 error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', details: String(error) })
    };
  }
};

async function detectIdleEC2Instances(ec2Client: EC2Client, cwClient: CloudWatchClient, region: string): Promise<WasteItem[]> {
  const waste: WasteItem[] = [];
  const instances = await ec2Client.send(new DescribeInstancesCommand({ Filters: [{ Name: 'instance-state-name', Values: ['running'] }] }));
  
  for (const reservation of instances.Reservations || []) {
    for (const instance of reservation.Instances || []) {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const cpuMetrics = await cwClient.send(new GetMetricStatisticsCommand({
        Namespace: 'AWS/EC2',
        MetricName: 'CPUUtilization',
        Dimensions: [{ Name: 'InstanceId', Value: instance.InstanceId }],
        StartTime: startTime,
        EndTime: endTime,
        Period: 3600,
        Statistics: ['Average']
      }));

      const avgCpu = cpuMetrics.Datapoints ? 
        cpuMetrics.Datapoints.reduce((sum, dp) => sum + (dp.Average || 0), 0) / cpuMetrics.Datapoints.length : 0;
      
      if (avgCpu < 5) {
        const instanceName = instance.Tags?.find(t => t.Key === 'Name')?.Value || instance.InstanceId;
        const hourlyCost = getEC2HourlyCost(instance.InstanceType || 't3.micro');
        
        waste.push({
          resourceId: instance.InstanceId!,
          resourceType: 'EC2',
          resourceName: instanceName!,
          region,
          wasteType: 'IDLE_INSTANCE',
          estimatedMonthlyCost: hourlyCost * 730,
          recommendation: `Instance ${instanceName} has avg CPU < 5%. Consider stopping or rightsizing.`,
          confidence: avgCpu < 2 ? 0.95 : 0.8,
          details: { avgCpu, instanceType: instance.InstanceType }
        });
      }
    }
  }
  return waste;
}

async function detectUnusedEBSVolumes(ec2Client: EC2Client, region: string): Promise<WasteItem[]> {
  const waste: WasteItem[] = [];
  const volumes = await ec2Client.send(new DescribeVolumesCommand({ Filters: [{ Name: 'status', Values: ['available'] }] }));
  
  for (const volume of volumes.Volumes || []) {
    const gbCost = volume.VolumeType === 'gp3' ? 0.08 : volume.VolumeType === 'io1' ? 0.125 : 0.10;
    const monthlyCost = (volume.Size || 0) * gbCost;
    
    waste.push({
      resourceId: volume.VolumeId!,
      resourceType: 'EBS',
      resourceName: volume.Tags?.find(t => t.Key === 'Name')?.Value || volume.VolumeId!,
      region,
      wasteType: 'UNATTACHED_VOLUME',
      estimatedMonthlyCost: monthlyCost,
      recommendation: `Volume ${volume.VolumeId} is not attached. Consider deleting or creating a snapshot.`,
      confidence: 0.99,
      details: { size: volume.Size, volumeType: volume.VolumeType }
    });
  }
  return waste;
}

async function detectUnassociatedEIPs(ec2Client: EC2Client, region: string): Promise<WasteItem[]> {
  const waste: WasteItem[] = [];
  const addresses = await ec2Client.send(new DescribeAddressesCommand({}));
  
  for (const address of addresses.Addresses || []) {
    if (!address.AssociationId) {
      waste.push({
        resourceId: address.AllocationId!,
        resourceType: 'EIP',
        resourceName: address.PublicIp!,
        region,
        wasteType: 'UNASSOCIATED_EIP',
        estimatedMonthlyCost: 3.60,
        recommendation: `Elastic IP ${address.PublicIp} is not associated. Release if not needed.`,
        confidence: 0.99,
        details: { publicIp: address.PublicIp }
      });
    }
  }
  return waste;
}

async function detectIdleRDSInstances(rdsClient: RDSClient, cwClient: CloudWatchClient, region: string): Promise<WasteItem[]> {
  const waste: WasteItem[] = [];
  const instances = await rdsClient.send(new DescribeDBInstancesCommand({}));
  
  for (const instance of instances.DBInstances || []) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const connMetrics = await cwClient.send(new GetMetricStatisticsCommand({
      Namespace: 'AWS/RDS',
      MetricName: 'DatabaseConnections',
      Dimensions: [{ Name: 'DBInstanceIdentifier', Value: instance.DBInstanceIdentifier }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 3600,
      Statistics: ['Average']
    }));

    const avgConnections = connMetrics.Datapoints ? 
      connMetrics.Datapoints.reduce((sum, dp) => sum + (dp.Average || 0), 0) / connMetrics.Datapoints.length : 0;
    
    if (avgConnections < 1) {
      const hourlyCost = getRDSHourlyCost(instance.DBInstanceClass || 'db.t3.micro');
      
      waste.push({
        resourceId: instance.DBInstanceIdentifier!,
        resourceType: 'RDS',
        resourceName: instance.DBInstanceIdentifier!,
        region,
        wasteType: 'IDLE_DATABASE',
        estimatedMonthlyCost: hourlyCost * 730,
        recommendation: `RDS ${instance.DBInstanceIdentifier} has avg connections < 1. Consider stopping or deleting.`,
        confidence: avgConnections === 0 ? 0.95 : 0.75,
        details: { avgConnections, instanceClass: instance.DBInstanceClass, engine: instance.Engine }
      });
    }
  }
  return waste;
}

async function detectUnusedLoadBalancers(region: string): Promise<WasteItem[]> {
  // Função desabilitada devido a problemas com módulo ELBv2
  return [];
}

async function detectIdleNATGateways(ec2Client: EC2Client, cwClient: CloudWatchClient, region: string): Promise<WasteItem[]> {
  const waste: WasteItem[] = [];
  const natGateways = await ec2Client.send(new DescribeNatGatewaysCommand({ Filter: [{ Name: 'state', Values: ['available'] }] }));
  
  for (const nat of natGateways.NatGateways || []) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const bytesMetrics = await cwClient.send(new GetMetricStatisticsCommand({
      Namespace: 'AWS/NATGateway',
      MetricName: 'BytesOutToDestination',
      Dimensions: [{ Name: 'NatGatewayId', Value: nat.NatGatewayId }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 86400,
      Statistics: ['Sum']
    }));

    const totalBytes = bytesMetrics.Datapoints?.reduce((sum, dp) => sum + (dp.Sum || 0), 0) || 0;
    
    if (totalBytes < 1000000) { // Less than 1MB in 7 days
      waste.push({
        resourceId: nat.NatGatewayId!,
        resourceType: 'NAT_GATEWAY',
        resourceName: nat.Tags?.find(t => t.Key === 'Name')?.Value || nat.NatGatewayId!,
        region,
        wasteType: 'IDLE_NAT_GATEWAY',
        estimatedMonthlyCost: 32.85,
        recommendation: `NAT Gateway ${nat.NatGatewayId} has minimal traffic. Consider removing if not needed.`,
        confidence: 0.85,
        details: { totalBytesLast7Days: totalBytes }
      });
    }
  }
  return waste;
}

function getEC2HourlyCost(instanceType: string): number {
  const costs: Record<string, number> = {
    't3.micro': 0.0104, 't3.small': 0.0208, 't3.medium': 0.0416, 't3.large': 0.0832,
    'm5.large': 0.096, 'm5.xlarge': 0.192, 'm5.2xlarge': 0.384,
    'c5.large': 0.085, 'c5.xlarge': 0.17, 'r5.large': 0.126
  };
  return costs[instanceType] || 0.05;
}

function getRDSHourlyCost(instanceClass: string): number {
  const costs: Record<string, number> = {
    'db.t3.micro': 0.017, 'db.t3.small': 0.034, 'db.t3.medium': 0.068,
    'db.m5.large': 0.171, 'db.m5.xlarge': 0.342, 'db.r5.large': 0.24
  };
  return costs[instanceClass] || 0.05;
}

function groupByType(items: WasteItem[]): Record<string, { count: number; cost: number }> {
  return items.reduce((acc, item) => {
    if (!acc[item.resourceType]) acc[item.resourceType] = { count: 0, cost: 0 };
    acc[item.resourceType].count++;
    acc[item.resourceType].cost += item.estimatedMonthlyCost;
    return acc;
  }, {} as Record<string, { count: number; cost: number }>);
}

function groupByRegion(items: WasteItem[]): Record<string, { count: number; cost: number }> {
  return items.reduce((acc, item) => {
    if (!acc[item.region]) acc[item.region] = { count: 0, cost: 0 };
    acc[item.region].count++;
    acc[item.region].cost += item.estimatedMonthlyCost;
    return acc;
  }, {} as Record<string, { count: number; cost: number }>);
}

function generateRecommendations(items: WasteItem[]): string[] {
  const recommendations: string[] = [];
  const byType = groupByType(items);
  
  if (byType['EC2']?.count > 0) {
    recommendations.push(`Consider rightsizing or stopping ${byType['EC2'].count} idle EC2 instances to save $${byType['EC2'].cost.toFixed(2)}/month`);
  }
  if (byType['EBS']?.count > 0) {
    recommendations.push(`Delete or snapshot ${byType['EBS'].count} unattached EBS volumes to save $${byType['EBS'].cost.toFixed(2)}/month`);
  }
  if (byType['EIP']?.count > 0) {
    recommendations.push(`Release ${byType['EIP'].count} unassociated Elastic IPs to save $${byType['EIP'].cost.toFixed(2)}/month`);
  }
  if (byType['RDS']?.count > 0) {
    recommendations.push(`Review ${byType['RDS'].count} idle RDS instances to save $${byType['RDS'].cost.toFixed(2)}/month`);
  }
  
  return recommendations;
}
