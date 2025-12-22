// Network Security Validator - Advanced Network Analysis
import { signAWSGetRequest } from '../aws-credentials-helper.ts';

export interface NetworkFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  analysis: string;
  resource_id: string;
  resource_arn?: string;
  scan_type: string;
  service: string;
  evidence: any;
}

interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

// Critical ports that should never be open to 0.0.0.0/0
const CRITICAL_PORTS: Record<number, string> = {
  22: 'SSH',
  3389: 'RDP',
  3306: 'MySQL',
  5432: 'PostgreSQL',
  1433: 'SQL Server',
  1521: 'Oracle',
  27017: 'MongoDB',
  6379: 'Redis',
  11211: 'Memcached',
  9200: 'Elasticsearch',
  5601: 'Kibana',
  9042: 'Cassandra',
  2181: 'Zookeeper',
  8080: 'HTTP Alt',
  8443: 'HTTPS Alt',
  23: 'Telnet',
  21: 'FTP',
  25: 'SMTP',
  445: 'SMB',
  135: 'RPC',
  139: 'NetBIOS',
  5900: 'VNC'
};

// Analyze Security Groups
export async function analyzeSecurityGroups(credentials: AWSCredentials, region: string): Promise<NetworkFinding[]> {
  const findings: NetworkFinding[] = [];
  
  try {
    const securityGroups = await describeSecurityGroups(credentials, region);
    
    for (const sg of securityGroups) {
      const sgId = sg.GroupId;
      const sgName = sg.GroupName;
      
      // Analyze inbound rules
      for (const rule of sg.IpPermissions || []) {
        const fromPort = rule.FromPort || 0;
        const toPort = rule.ToPort || 65535;
        
        // Check for 0.0.0.0/0 on critical ports
        for (const ipRange of rule.IpRanges || []) {
          if (ipRange.CidrIp === '0.0.0.0/0') {
            // Check if any critical port is in range
            for (const [port, serviceName] of Object.entries(CRITICAL_PORTS)) {
              const portNum = parseInt(port);
              if (fromPort <= portNum && toPort >= portNum) {
                findings.push({
                  severity: 'critical',
                  title: `Security Group com ${serviceName} (${port}) Exposto para Internet`,
                  description: `SG ${sgName} permite acesso público na porta ${port}`,
                  analysis: `RISCO CRÍTICO: O Security Group ${sgName} (${sgId}) permite conexões de 0.0.0.0/0 na porta ${port} (${serviceName}). Isso expõe o serviço a ataques de força bruta, exploits conhecidos, e acesso não autorizado de qualquer IP na internet. Mitigação: (1) Restringir para IPs específicos ou ranges corporativos, (2) Usar VPN ou bastion host, (3) Implementar VPC endpoints para serviços AWS, (4) Ativar VPC Flow Logs para monitoramento.`,
                  resource_id: sgId,
                  scan_type: 'sg_critical_port_open',
                  service: 'EC2',
                  evidence: { 
                    securityGroupId: sgId,
                    securityGroupName: sgName,
                    port: portNum,
                    protocol: rule.IpProtocol,
                    cidr: '0.0.0.0/0',
                    serviceName,
                    region
                  }
                });
              }
            }
            
            // Check for all ports open
            if (fromPort === 0 && toPort === 65535) {
              findings.push({
                severity: 'critical',
                title: `Security Group com TODAS as Portas Abertas para Internet`,
                description: `SG ${sgName} permite acesso público em todas as portas`,
                analysis: `RISCO CRÍTICO: O Security Group ${sgName} (${sgId}) permite conexões de 0.0.0.0/0 em TODAS as portas (0-65535). Isso é o equivalente a não ter firewall. Todos os serviços executando nas instâncias associadas estão expostos. Mitigação: URGENTE - Restringir imediatamente para apenas as portas necessárias.`,
                resource_id: sgId,
                scan_type: 'sg_all_ports_open',
                service: 'EC2',
                evidence: { 
                  securityGroupId: sgId,
                  securityGroupName: sgName,
                  portRange: '0-65535',
                  cidr: '0.0.0.0/0',
                  region
                }
              });
            }
          }
          
          // Check for ::/0 (IPv6 any)
          if (ipRange.CidrIpv6 === '::/0') {
            for (const [port, serviceName] of Object.entries(CRITICAL_PORTS)) {
              const portNum = parseInt(port);
              if (fromPort <= portNum && toPort >= portNum) {
                findings.push({
                  severity: 'critical',
                  title: `Security Group com ${serviceName} Exposto para IPv6 Global`,
                  description: `SG ${sgName} permite acesso IPv6 global na porta ${port}`,
                  analysis: `RISCO CRÍTICO: Mesmo risco do IPv4. A porta ${port} (${serviceName}) está exposta para ::/0 (qualquer IPv6). Mitigação: Restringir para ranges específicos.`,
                  resource_id: sgId,
                  scan_type: 'sg_critical_port_ipv6',
                  service: 'EC2',
                  evidence: { 
                    securityGroupId: sgId,
                    port: portNum,
                    cidr: '::/0',
                    region
                  }
                });
              }
            }
          }
        }
        
        // Check for protocol -1 (all traffic)
        if (rule.IpProtocol === '-1') {
          const hasPublicCidr = (rule.IpRanges || []).some((r: any) => r.CidrIp === '0.0.0.0/0');
          if (hasPublicCidr) {
            findings.push({
              severity: 'critical',
              title: `Security Group Permite TODO Tráfego de Qualquer Origem`,
              description: `SG ${sgName} com regra "-1" (all traffic) para 0.0.0.0/0`,
              analysis: `RISCO CRÍTICO: O Security Group ${sgName} permite TODO o tráfego (todos os protocolos, todas as portas) de 0.0.0.0/0. Isso efetivamente desabilita o firewall. Mitigação: Remover regra imediatamente e criar regras específicas.`,
              resource_id: sgId,
              scan_type: 'sg_all_traffic',
              service: 'EC2',
              evidence: { 
                securityGroupId: sgId,
                protocol: 'all',
                cidr: '0.0.0.0/0',
                region
              }
            });
          }
        }
      }
      
      // Analyze egress rules for overly permissive
      const hasUnrestrictedEgress = (sg.IpPermissionsEgress || []).some((rule: any) => 
        rule.IpProtocol === '-1' && 
        (rule.IpRanges || []).some((r: any) => r.CidrIp === '0.0.0.0/0')
      );
      
      if (hasUnrestrictedEgress) {
        findings.push({
          severity: 'medium',
          title: `Security Group com Egress Irrestrito`,
          description: `SG ${sgName} permite todo tráfego de saída`,
          analysis: `RISCO MÉDIO: O Security Group ${sgName} permite todo tráfego de saída para internet. Isso pode facilitar exfiltração de dados e comunicação com C2 (Command & Control). Mitigação: Para workloads sensíveis, restringir egress para apenas destinos necessários (DNS, HTTPS específicos, etc.).`,
          resource_id: sgId,
          scan_type: 'sg_unrestricted_egress',
          service: 'EC2',
          evidence: { 
            securityGroupId: sgId,
            egress: 'unrestricted',
            region
          }
        });
      }
    }
  } catch (error) {
    console.error('Error analyzing security groups:', error);
  }
  
  return findings;
}

// Analyze NACLs
export async function analyzeNACLs(credentials: AWSCredentials, region: string): Promise<NetworkFinding[]> {
  const findings: NetworkFinding[] = [];
  
  try {
    const nacls = await describeNetworkACLs(credentials, region);
    
    for (const nacl of nacls) {
      const naclId = nacl.NetworkAclId;
      
      // Check for overly permissive rules
      for (const entry of nacl.Entries || []) {
        if (entry.RuleAction !== 'allow') continue;
        if (entry.CidrBlock !== '0.0.0.0/0' && entry.Ipv6CidrBlock !== '::/0') continue;
        
        const portRange = entry.PortRange;
        
        // All traffic allowed from anywhere
        if (entry.Protocol === '-1') {
          findings.push({
            severity: 'high',
            title: `NACL com Regra Permissiva (Todo Tráfego)`,
            description: `NACL ${naclId} permite todo tráfego de/para 0.0.0.0/0`,
            analysis: `RISCO ALTO: A NACL ${naclId} possui regra permitindo todo tráfego (protocolo -1) de/para 0.0.0.0/0. NACLs são stateless e operam no nível de subnet. Uma regra aberta pode anular Security Groups. Mitigação: Implementar regras específicas por porta/protocolo.`,
            resource_id: naclId,
            scan_type: 'nacl_permissive',
            service: 'VPC',
            evidence: { 
              naclId,
              ruleNumber: entry.RuleNumber,
              egress: entry.Egress,
              cidr: entry.CidrBlock || entry.Ipv6CidrBlock,
              protocol: 'all',
              region
            }
          });
        }
        
        // Wide port ranges
        if (portRange && (portRange.To - portRange.From > 1000)) {
          findings.push({
            severity: 'medium',
            title: `NACL com Range de Portas Amplo`,
            description: `NACL ${naclId} permite portas ${portRange.From}-${portRange.To} de 0.0.0.0/0`,
            analysis: `RISCO MÉDIO: A NACL ${naclId} permite um range amplo de portas (${portRange.From}-${portRange.To}). Isso reduz a eficácia da NACL como camada de segurança. Mitigação: Restringir para portas específicas necessárias.`,
            resource_id: naclId,
            scan_type: 'nacl_wide_port_range',
            service: 'VPC',
            evidence: { 
              naclId,
              portRange: `${portRange.From}-${portRange.To}`,
              region
            }
          });
        }
      }
    }
  } catch (error) {
    console.error('Error analyzing NACLs:', error);
  }
  
  return findings;
}

// Analyze Subnets (public vs private workloads)
export async function analyzeSubnets(credentials: AWSCredentials, region: string): Promise<NetworkFinding[]> {
  const findings: NetworkFinding[] = [];
  
  try {
    const subnets = await describeSubnets(credentials, region);
    const routeTables = await describeRouteTables(credentials, region);
    
    // Identify public subnets (with IGW route)
    const publicSubnetIds = new Set<string>();
    
    for (const rt of routeTables) {
      const hasIGWRoute = (rt.Routes || []).some((route: any) => 
        route.GatewayId?.startsWith('igw-') && route.DestinationCidrBlock === '0.0.0.0/0'
      );
      
      if (hasIGWRoute) {
        for (const assoc of rt.Associations || []) {
          if (assoc.SubnetId) {
            publicSubnetIds.add(assoc.SubnetId);
          }
        }
      }
    }
    
    // Check instances in public subnets
    const instances = await describeInstances(credentials, region);
    
    for (const instance of instances) {
      if (!publicSubnetIds.has(instance.SubnetId)) continue;
      
      // Instance in public subnet with public IP
      if (instance.PublicIpAddress) {
        // Check if it looks like a database or backend service (by name/tags)
        const instanceName = (instance.Tags || []).find((t: any) => t.Key === 'Name')?.Value || '';
        const looksLikeBackend = /db|database|rds|mysql|postgres|mongo|redis|backend|api|worker/i.test(instanceName);
        
        if (looksLikeBackend) {
          findings.push({
            severity: 'high',
            title: `Workload Backend/Database em Subnet Pública`,
            description: `Instância "${instanceName}" (${instance.InstanceId}) em subnet pública`,
            analysis: `RISCO ALTO: A instância ${instance.InstanceId} (${instanceName}) parece ser um workload backend ou database e está em uma subnet pública com IP público (${instance.PublicIpAddress}). Workloads backend devem estar em subnets privadas. Mitigação: (1) Mover para subnet privada, (2) Usar NAT Gateway para acesso à internet, (3) Usar VPC endpoints para serviços AWS.`,
            resource_id: instance.InstanceId,
            scan_type: 'subnet_backend_public',
            service: 'EC2',
            evidence: { 
              instanceId: instance.InstanceId,
              instanceName,
              subnetId: instance.SubnetId,
              publicIp: instance.PublicIpAddress,
              region
            }
          });
        }
      }
    }
    
    // Check for subnets without NAT Gateway access
    const privateSubnetsWithoutNAT: string[] = [];
    
    for (const subnet of subnets) {
      if (publicSubnetIds.has(subnet.SubnetId)) continue;
      
      // Find route table for this subnet
      const subnetRT = routeTables.find((rt: any) => 
        (rt.Associations || []).some((a: any) => a.SubnetId === subnet.SubnetId)
      );
      
      if (subnetRT) {
        const hasNATRoute = (subnetRT.Routes || []).some((route: any) => 
          route.NatGatewayId?.startsWith('nat-') && route.DestinationCidrBlock === '0.0.0.0/0'
        );
        
        if (!hasNATRoute) {
          privateSubnetsWithoutNAT.push(subnet.SubnetId);
        }
      }
    }
    
    if (privateSubnetsWithoutNAT.length > 0) {
      findings.push({
        severity: 'low',
        title: `Subnets Privadas sem NAT Gateway`,
        description: `${privateSubnetsWithoutNAT.length} subnets sem acesso à internet`,
        analysis: `INFORMAÇÃO: Existem ${privateSubnetsWithoutNAT.length} subnets privadas sem rota para NAT Gateway. Instâncias nessas subnets não podem acessar a internet (mesmo para updates de pacotes). Isso pode ser intencional para workloads completamente isolados. Verifique se é o comportamento desejado.`,
        resource_id: 'multiple-subnets',
        scan_type: 'subnet_no_nat',
        service: 'VPC',
        evidence: { 
          subnets: privateSubnetsWithoutNAT,
          count: privateSubnetsWithoutNAT.length,
          region
        }
      });
    }
  } catch (error) {
    console.error('Error analyzing subnets:', error);
  }
  
  return findings;
}

// Analyze VPC Endpoints (missing for common services)
export async function analyzeVPCEndpoints(credentials: AWSCredentials, region: string): Promise<NetworkFinding[]> {
  const findings: NetworkFinding[] = [];
  
  try {
    const vpcs = await describeVPCs(credentials, region);
    const endpoints = await describeVPCEndpoints(credentials, region);
    
    const recommendedEndpoints = ['s3', 'dynamodb', 'secretsmanager', 'ssm', 'ssmmessages', 'ec2messages', 'logs', 'ecr.api', 'ecr.dkr'];
    
    for (const vpc of vpcs) {
      const vpcEndpoints = endpoints.filter((ep: any) => ep.VpcId === vpc.VpcId);
      const existingServices = vpcEndpoints.map((ep: any) => ep.ServiceName?.split('.').pop() || '');
      
      const missingEndpoints = recommendedEndpoints.filter(svc => !existingServices.includes(svc));
      
      if (missingEndpoints.length > 3) {
        findings.push({
          severity: 'medium',
          title: `VPC sem VPC Endpoints Recomendados`,
          description: `VPC ${vpc.VpcId} falta ${missingEndpoints.length} endpoints importantes`,
          analysis: `RISCO MÉDIO: A VPC ${vpc.VpcId} não possui VPC Endpoints para serviços comuns (${missingEndpoints.slice(0, 5).join(', ')}${missingEndpoints.length > 5 ? '...' : ''}). Tráfego para esses serviços passa pela internet (via NAT/IGW), aumentando custos e latência, e expondo dados em trânsito. Mitigação: Criar VPC Endpoints para serviços frequentemente acessados.`,
          resource_id: vpc.VpcId,
          scan_type: 'vpc_missing_endpoints',
          service: 'VPC',
          evidence: { 
            vpcId: vpc.VpcId,
            missingEndpoints,
            existingEndpoints: existingServices,
            region
          }
        });
      }
    }
  } catch (error) {
    console.error('Error analyzing VPC endpoints:', error);
  }
  
  return findings;
}

// Helper functions
async function describeSecurityGroups(credentials: AWSCredentials, region: string): Promise<any[]> {
  return await makeEC2Request(credentials, region, 'DescribeSecurityGroups') || [];
}

async function describeNetworkACLs(credentials: AWSCredentials, region: string): Promise<any[]> {
  return await makeEC2Request(credentials, region, 'DescribeNetworkAcls') || [];
}

async function describeSubnets(credentials: AWSCredentials, region: string): Promise<any[]> {
  return await makeEC2Request(credentials, region, 'DescribeSubnets') || [];
}

async function describeRouteTables(credentials: AWSCredentials, region: string): Promise<any[]> {
  return await makeEC2Request(credentials, region, 'DescribeRouteTables') || [];
}

async function describeInstances(credentials: AWSCredentials, region: string): Promise<any[]> {
  return await makeEC2Request(credentials, region, 'DescribeInstances') || [];
}

async function describeVPCs(credentials: AWSCredentials, region: string): Promise<any[]> {
  return await makeEC2Request(credentials, region, 'DescribeVpcs') || [];
}

async function describeVPCEndpoints(credentials: AWSCredentials, region: string): Promise<any[]> {
  return await makeEC2Request(credentials, region, 'DescribeVpcEndpoints') || [];
}

async function makeEC2Request(credentials: AWSCredentials, region: string, action: string, params: Record<string, string> = {}): Promise<any[]> {
  const endpoint = `https://ec2.${region}.amazonaws.com/`;
  const host = `ec2.${region}.amazonaws.com`;
  
  const queryParams = new URLSearchParams({
    Action: action,
    Version: '2016-11-15',
    ...params
  });

  try {
    const headers = await signAWSGetRequest(
      credentials,
      'ec2',
      region,
      host,
      '/',
      queryParams.toString()
    );

    const response = await fetch(`${endpoint}?${queryParams.toString()}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      console.error(`EC2 API Error (${action}):`, response.status);
      return [];
    }

    const text = await response.text();
    return parseEC2XMLResponse(text, action);
  } catch (error) {
    console.error(`Error in EC2 request (${action}):`, error);
    return [];
  }
}

function parseEC2XMLResponse(xml: string, action: string): any[] {
  const items: any[] = [];
  
  try {
    // Match item or member elements
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const matches = xml.match(itemRegex) || [];
    
    for (const match of matches) {
      const item: any = {};
      
      // Extract common fields
      const fields = [
        'GroupId', 'GroupName', 'VpcId', 'SubnetId', 'NetworkAclId',
        'RouteTableId', 'InstanceId', 'PublicIpAddress', 'PrivateIpAddress',
        'State', 'ServiceName', 'VpcEndpointId'
      ];
      
      for (const field of fields) {
        const regex = new RegExp(`<${field}>([\\s\\S]*?)<\\/${field}>`);
        const result = match.match(regex);
        if (result) {
          item[field] = result[1];
        }
      }
      
      // Parse nested structures for Security Groups
      const ipPermissionsMatch = match.match(/<ipPermissions>([\s\S]*?)<\/ipPermissions>/);
      if (ipPermissionsMatch) {
        item.IpPermissions = parseIPPermissions(ipPermissionsMatch[1]);
      }
      
      const ipPermissionsEgressMatch = match.match(/<ipPermissionsEgress>([\s\S]*?)<\/ipPermissionsEgress>/);
      if (ipPermissionsEgressMatch) {
        item.IpPermissionsEgress = parseIPPermissions(ipPermissionsEgressMatch[1]);
      }
      
      // Parse NACL entries
      const entriesMatch = match.match(/<entrySet>([\s\S]*?)<\/entrySet>/);
      if (entriesMatch) {
        item.Entries = parseNACLEntries(entriesMatch[1]);
      }
      
      // Parse routes
      const routesMatch = match.match(/<routeSet>([\s\S]*?)<\/routeSet>/);
      if (routesMatch) {
        item.Routes = parseRoutes(routesMatch[1]);
      }
      
      // Parse associations
      const assocMatch = match.match(/<associationSet>([\s\S]*?)<\/associationSet>/);
      if (assocMatch) {
        item.Associations = parseAssociations(assocMatch[1]);
      }
      
      // Parse tags
      const tagsMatch = match.match(/<tagSet>([\s\S]*?)<\/tagSet>/);
      if (tagsMatch) {
        item.Tags = parseTags(tagsMatch[1]);
      }
      
      if (Object.keys(item).length > 0) {
        items.push(item);
      }
    }
    
    // Special handling for DescribeInstances
    if (action === 'DescribeInstances') {
      const reservationMatches = xml.match(/<reservationSet>([\s\S]*?)<\/reservationSet>/);
      if (reservationMatches) {
        const instanceSetMatches = reservationMatches[1].match(/<instancesSet>([\s\S]*?)<\/instancesSet>/g);
        if (instanceSetMatches) {
          items.length = 0; // Clear and re-parse
          for (const instanceSet of instanceSetMatches) {
            const instanceItems = instanceSet.match(/<item>([\s\S]*?)<\/item>/g);
            if (instanceItems) {
              for (const instMatch of instanceItems) {
                const inst: any = {};
                const instFields = ['instanceId', 'publicIpAddress', 'privateIpAddress', 'subnetId', 'vpcId'];
                for (const field of instFields) {
                  const regex = new RegExp(`<${field}>([\\s\\S]*?)<\\/${field}>`);
                  const result = instMatch.match(regex);
                  if (result) {
                    inst[field.charAt(0).toUpperCase() + field.slice(1)] = result[1];
                  }
                }
                const tagsM = instMatch.match(/<tagSet>([\s\S]*?)<\/tagSet>/);
                if (tagsM) {
                  inst.Tags = parseTags(tagsM[1]);
                }
                if (Object.keys(inst).length > 0) {
                  items.push(inst);
                }
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('XML parsing error:', e);
  }
  
  return items;
}

function parseIPPermissions(xml: string): any[] {
  const permissions: any[] = [];
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  
  for (const item of items) {
    const perm: any = {};
    
    const fromPortMatch = item.match(/<fromPort>(\d+)<\/fromPort>/);
    const toPortMatch = item.match(/<toPort>(\d+)<\/toPort>/);
    const protocolMatch = item.match(/<ipProtocol>([^<]+)<\/ipProtocol>/);
    
    perm.FromPort = fromPortMatch ? parseInt(fromPortMatch[1]) : 0;
    perm.ToPort = toPortMatch ? parseInt(toPortMatch[1]) : 65535;
    perm.IpProtocol = protocolMatch?.[1] || '-1';
    
    // Parse IP ranges
    perm.IpRanges = [];
    const ipRangesMatch = item.match(/<ipRanges>([\s\S]*?)<\/ipRanges>/);
    if (ipRangesMatch) {
      const cidrMatches = ipRangesMatch[1].match(/<cidrIp>([^<]+)<\/cidrIp>/g) || [];
      for (const cidrMatch of cidrMatches) {
        const cidr = cidrMatch.replace(/<\/?cidrIp>/g, '');
        perm.IpRanges.push({ CidrIp: cidr });
      }
    }
    
    permissions.push(perm);
  }
  
  return permissions;
}

function parseNACLEntries(xml: string): any[] {
  const entries: any[] = [];
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  
  for (const item of items) {
    const entry: any = {};
    
    entry.RuleNumber = parseInt(item.match(/<ruleNumber>(\d+)<\/ruleNumber>/)?.[1] || '0');
    entry.Protocol = item.match(/<protocol>([^<]+)<\/protocol>/)?.[1] || '-1';
    entry.RuleAction = item.match(/<ruleAction>([^<]+)<\/ruleAction>/)?.[1] || 'deny';
    entry.Egress = item.match(/<egress>([^<]+)<\/egress>/)?.[1] === 'true';
    entry.CidrBlock = item.match(/<cidrBlock>([^<]+)<\/cidrBlock>/)?.[1];
    entry.Ipv6CidrBlock = item.match(/<ipv6CidrBlock>([^<]+)<\/ipv6CidrBlock>/)?.[1];
    
    const portRangeMatch = item.match(/<portRange>([\s\S]*?)<\/portRange>/);
    if (portRangeMatch) {
      entry.PortRange = {
        From: parseInt(portRangeMatch[1].match(/<from>(\d+)<\/from>/)?.[1] || '0'),
        To: parseInt(portRangeMatch[1].match(/<to>(\d+)<\/to>/)?.[1] || '65535')
      };
    }
    
    entries.push(entry);
  }
  
  return entries;
}

function parseRoutes(xml: string): any[] {
  const routes: any[] = [];
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  
  for (const item of items) {
    const route: any = {};
    route.DestinationCidrBlock = item.match(/<destinationCidrBlock>([^<]+)<\/destinationCidrBlock>/)?.[1];
    route.GatewayId = item.match(/<gatewayId>([^<]+)<\/gatewayId>/)?.[1];
    route.NatGatewayId = item.match(/<natGatewayId>([^<]+)<\/natGatewayId>/)?.[1];
    routes.push(route);
  }
  
  return routes;
}

function parseAssociations(xml: string): any[] {
  const associations: any[] = [];
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  
  for (const item of items) {
    const assoc: any = {};
    assoc.SubnetId = item.match(/<subnetId>([^<]+)<\/subnetId>/)?.[1];
    assoc.RouteTableId = item.match(/<routeTableId>([^<]+)<\/routeTableId>/)?.[1];
    associations.push(assoc);
  }
  
  return associations;
}

function parseTags(xml: string): any[] {
  const tags: any[] = [];
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  
  for (const item of items) {
    const tag: any = {};
    tag.Key = item.match(/<key>([^<]+)<\/key>/)?.[1];
    tag.Value = item.match(/<value>([^<]*)<\/value>/)?.[1];
    tags.push(tag);
  }
  
  return tags;
}
