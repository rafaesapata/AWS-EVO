import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Network, RefreshCw, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useOrganization } from "@/hooks/useOrganization";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";

interface TopologyNode {
  id: string;
  resource_id: string;
  resource_type: string;
  resource_name: string | null;
  region: string | null;
  connections: any;
  attack_surface_score: number;
  publicly_accessible: boolean;
  position: { x: number; y: number };
  metadata?: any;
  security_groups?: any;
  vpc_id?: string;
  subnet_id?: string;
  layer: number; // Network layer (0=internet, 1=IGW/ALB, 2=NAT/Public, 3=Private, 4=Resources)
}

interface NetworkLayer {
  name: string;
  y: number;
  color: string;
}

const LAYERS: NetworkLayer[] = [
  { name: 'Internet', y: 50, color: 'rgba(147, 51, 234, 0.1)' },
  { name: 'Edge (IGW/ALB)', y: 150, color: 'rgba(59, 130, 246, 0.1)' },
  { name: 'NAT/Public Subnet', y: 280, color: 'rgba(16, 185, 129, 0.1)' },
  { name: 'Private Subnet', y: 410, color: 'rgba(245, 158, 11, 0.1)' },
  { name: 'Resources', y: 540, color: 'rgba(239, 68, 68, 0.1)' }
];

export default function InfrastructureTopology() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: organizationId } = useOrganization();
  const { selectedAccountId } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<TopologyNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPosition, setLastPanPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    loadTopology();
  }, [organizationId, selectedAccountId]);

  const assignNodeToLayer = (node: any): number => {
    const type = node.resource_type.toLowerCase();
    const metadata = node.metadata || {};
    
    // Layer 0: Internet (virtual node)
    
    // Layer 1: Internet Gateway, Application Load Balancer, Network Load Balancer
    if (type.includes('internetgateway') || 
        type.includes('loadbalancer') || 
        type === 'elb' ||
        type.includes('alb') ||
        type.includes('nlb')) {
      return 1;
    }
    
    // Layer 2: NAT Gateway, Public Subnet resources
    if (type.includes('natgateway') || 
        metadata.PublicIp || 
        node.publicly_accessible) {
      return 2;
    }
    
    // Layer 3: Private Subnet resources without direct compute
    if (type.includes('subnet') || type.includes('securitygroup')) {
      return 3;
    }
    
    // Layer 4: Compute resources (EC2, RDS, Lambda, ECS, etc.)
    return 4;
  };

  const calculateLayerPosition = (nodes: TopologyNode[], layer: number): void => {
    const layerNodes = nodes.filter(n => n.layer === layer);
    const layerY = LAYERS[layer].y;
    const spacing = 140;
    const totalWidth = (layerNodes.length - 1) * spacing;
    const startX = -totalWidth / 2;

    layerNodes.forEach((node, index) => {
      node.position = {
        x: startX + index * spacing,
        y: layerY
      };
    });
  };

  const detectConnections = (nodes: TopologyNode[]): void => {
    nodes.forEach(node => {
      const connections: string[] = [];
      
      // Connect load balancers to their target instances
      if (node.resource_type.toLowerCase().includes('loadbalancer')) {
        nodes.forEach(target => {
          if (target.layer > node.layer && target.layer <= 4) {
            // ALB connects to EC2/ECS in same VPC
            if (node.vpc_id === target.vpc_id) {
              connections.push(target.resource_id);
            }
          }
        });
      }
      
      // Connect NAT Gateway to private resources
      if (node.resource_type.toLowerCase().includes('natgateway')) {
        nodes.forEach(target => {
          if (target.layer > node.layer && target.vpc_id === node.vpc_id) {
            connections.push(target.resource_id);
          }
        });
      }
      
      // Connect public resources to IGW/ALB
      if (node.layer === 2) {
        nodes.forEach(gateway => {
          if (gateway.layer === 1 && gateway.vpc_id === node.vpc_id) {
            if (!gateway.connections) gateway.connections = [];
            gateway.connections.push(node.resource_id);
          }
        });
      }
      
      // Connect private resources to NAT
      if (node.layer === 4 && !node.publicly_accessible) {
        nodes.forEach(nat => {
          if (nat.resource_type.toLowerCase().includes('natgateway') && nat.vpc_id === node.vpc_id) {
            if (!nat.connections) nat.connections = [];
            nat.connections.push(node.resource_id);
          }
        });
      }
      
      // RDS connections to EC2 in same subnet
      if (node.resource_type === 'rds') {
        nodes.forEach(ec2 => {
          if (ec2.resource_type === 'ec2' && ec2.subnet_id === node.subnet_id) {
            connections.push(ec2.resource_id);
          }
        });
      }
      
      node.connections = connections;
    });
  };

  const loadTopology = async () => {
    if (!organizationId) return;
    
    setLoading(true);
    try {
      const syncResponse = await apiClient.lambda('sync-resource-inventory');
      // Ignore sync warnings silently

      const filters: any = { 
        organization_id: organizationId,
        ...getAccountFilter() // Multi-cloud compatible
      };

      const { data: resources, error } = await apiClient.select('resource_inventory', {
        select: '*',
        eq: filters,
        order: { column: 'created_at', ascending: false },
        limit: 1000
      });

      

      if (!resources || resources.length === 0) {
        setNodes([]);
        return;
      }

      // Add virtual Internet node
      const internetNode: TopologyNode = {
        id: 'internet-gateway',
        resource_id: 'internet',
        resource_type: 'Internet',
        resource_name: 'Internet',
        region: null,
        connections: [],
        attack_surface_score: 0,
        publicly_accessible: true,
        position: { x: 0, y: 50 },
        layer: 0
      };

      // Transform resources to topology nodes
      const topologyNodes: TopologyNode[] = resources.map(resource => {
        const metadata = resource.metadata as any || {};
        return {
          id: resource.id,
          resource_id: resource.resource_id,
          resource_type: resource.resource_type,
          resource_name: resource.resource_name,
          region: resource.region,
          connections: [],
          security_groups: metadata.SecurityGroups || [],
          attack_surface_score: 0,
          publicly_accessible: !!metadata.PublicIp || !!metadata.PubliclyAccessible,
          vpc_id: metadata.VpcId,
          subnet_id: metadata.SubnetId || metadata.SubnetIds?.[0],
          position: { x: 0, y: 0 },
          metadata: metadata,
          layer: 0
        };
      });

      // Assign layers
      topologyNodes.forEach(node => {
        node.layer = assignNodeToLayer(node);
      });

      // Calculate positions per layer
      [0, 1, 2, 3, 4].forEach(layer => {
        calculateLayerPosition([internetNode, ...topologyNodes], layer);
      });

      // Detect and create connections
      detectConnections([internetNode, ...topologyNodes]);

      // Connect Internet to IGW/ALB
      const edgeNodes = topologyNodes.filter(n => n.layer === 1);
      internetNode.connections = edgeNodes.map(n => n.resource_id);

      setNodes([internetNode, ...topologyNodes]);
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
      setNodes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canvasRef.current || nodes.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = 650;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2 + panOffset.x;
    const centerY = 50 + panOffset.y;

    // Draw network layers backgrounds
    LAYERS.forEach((layer, index) => {
      if (index === 0) return; // Skip internet layer background
      
      ctx.fillStyle = layer.color;
      ctx.fillRect(0, centerY + layer.y - 50, canvas.width, 100);
      
      // Layer label
      ctx.fillStyle = 'hsl(var(--foreground))';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(layer.name, 10, centerY + layer.y - 35);
    });

    // Group by VPC for visual grouping
    const vpcGroups = new Map<string, TopologyNode[]>();
    nodes.forEach(node => {
      if (node.vpc_id) {
        if (!vpcGroups.has(node.vpc_id)) vpcGroups.set(node.vpc_id, []);
        vpcGroups.get(node.vpc_id)?.push(node);
      }
    });

    // Draw VPC boundaries
    vpcGroups.forEach((vpcNodes, vpcId) => {
      const positions = vpcNodes.map(n => ({
        x: centerX + n.position.x * zoom,
        y: centerY + n.position.y * zoom
      }));

      if (positions.length === 0) return;

      const minX = Math.min(...positions.map(p => p.x)) - 80;
      const maxX = Math.max(...positions.map(p => p.x)) + 80;
      const minY = Math.min(...positions.map(p => p.y)) - 40;
      const maxY = Math.max(...positions.map(p => p.y)) + 40;

      ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(59, 130, 246, 0.8)';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(`VPC: ${vpcId.substring(0, 15)}`, minX + 8, minY - 8);
    });

    // Draw connections (network flow lines)
    nodes.forEach(node => {
      if (!node.connections || !Array.isArray(node.connections)) return;
      
      const nodeX = centerX + node.position.x * zoom;
      const nodeY = centerY + node.position.y * zoom;
      
      node.connections.forEach((connectedId: string) => {
        const connectedNode = nodes.find(n => n.resource_id === connectedId);
        if (connectedNode) {
          const connX = centerX + connectedNode.position.x * zoom;
          const connY = centerY + connectedNode.position.y * zoom;
          
          // Draw connection line with gradient
          const gradient = ctx.createLinearGradient(nodeX, nodeY, connX, connY);
          gradient.addColorStop(0, 'rgba(59, 130, 246, 0.6)');
          gradient.addColorStop(1, 'rgba(16, 185, 129, 0.6)');
          
          ctx.beginPath();
          ctx.moveTo(nodeX, nodeY);
          ctx.lineTo(connX, connY);
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
          
          // Draw arrow at connection end
          const angle = Math.atan2(connY - nodeY, connX - nodeX);
          const arrowSize = 8;
          ctx.fillStyle = 'rgba(16, 185, 129, 0.8)';
          ctx.beginPath();
          ctx.moveTo(connX, connY);
          ctx.lineTo(
            connX - arrowSize * Math.cos(angle - Math.PI / 6),
            connY - arrowSize * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            connX - arrowSize * Math.cos(angle + Math.PI / 6),
            connY - arrowSize * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fill();
        }
      });
    });

    // Draw nodes
    nodes.forEach(node => {
      const x = centerX + node.position.x * zoom;
      const y = centerY + node.position.y * zoom;
      
      // Node color based on type and layer
      let color = '#10b981'; // green default
      if (node.layer === 0) color = '#9333ea'; // purple for internet
      else if (node.layer === 1) color = '#3b82f6'; // blue for edge
      else if (node.layer === 2) color = '#10b981'; // green for public
      else if (node.layer === 3) color = '#f59e0b'; // orange for private
      else if (node.attack_surface_score > 70) color = '#ef4444'; // red for high risk
      else if (node.attack_surface_score > 40) color = '#f59e0b'; // orange for medium risk

      const nodeRadius = node.layer === 0 ? 40 : 28;

      // Draw node shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      // Draw node circle
      ctx.beginPath();
      ctx.arc(x, y, nodeRadius * zoom, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      
      // Draw node border
      ctx.strokeStyle = node.publicly_accessible ? '#dc2626' : '#ffffff';
      ctx.lineWidth = node.publicly_accessible ? 3 : 2;
      ctx.stroke();

      // Highlight selected node
      if (selectedNode?.id === node.id) {
        ctx.beginPath();
        ctx.arc(x, y, nodeRadius * zoom + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#0ea5e9';
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      // Draw resource type icon/text
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${node.layer === 0 ? 14 : 11}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const typeLabel = node.resource_type.substring(0, node.layer === 0 ? 10 : 3).toUpperCase();
      ctx.fillText(typeLabel, x, y);

      // Draw resource name
      ctx.fillStyle = 'hsl(var(--foreground))';
      ctx.font = `${10}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const name = node.resource_name || node.resource_id.substring(0, 12);
      ctx.fillText(name, x, y + nodeRadius * zoom + 5);

      // Draw resource type
      ctx.fillStyle = 'hsl(var(--muted-foreground))';
      ctx.font = `${8}px sans-serif`;
      ctx.fillText(node.resource_type, x, y + nodeRadius * zoom + 18);
    });

  }, [nodes, selectedNode, panOffset, zoom]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const centerX = canvas.width / 2 + panOffset.x;
    const centerY = 50 + panOffset.y;
    const x = (e.clientX - rect.left - centerX) / zoom;
    const y = (e.clientY - rect.top - centerY) / zoom;

    const clickedNode = nodes.find(node => {
      const dx = x - node.position.x;
      const dy = y - node.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const radius = node.layer === 0 ? 40 : 28;
      return distance < radius;
    });

    if (clickedNode) {
      setSelectedNode(clickedNode);
    } else {
      setIsPanning(true);
      setLastPanPosition({ x: e.clientX, y: e.clientY });
    }
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const centerX = canvas.width / 2 + panOffset.x;
    const centerY = 50 + panOffset.y;
    const x = (e.clientX - rect.left - centerX) / zoom;
    const y = (e.clientY - rect.top - centerY) / zoom;

    const clickedNode = nodes.find(node => {
      const dx = x - node.position.x;
      const dy = y - node.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const radius = node.layer === 0 ? 40 : 28;
      return distance < radius;
    });

    if (clickedNode) {
      setPanOffset({
        x: -clickedNode.position.x * zoom,
        y: -clickedNode.position.y * zoom
      });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPanning) return;

    const deltaX = e.clientX - lastPanPosition.x;
    const deltaY = e.clientY - lastPanPosition.y;

    setPanOffset(prev => ({
      x: prev.x + deltaX,
      y: prev.y + deltaY
    }));

    setLastPanPosition({ x: e.clientX, y: e.clientY });
  };

  const handleCanvasMouseUp = () => {
    setIsPanning(false);
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.5));
  const handleResetView = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const filteredNodes = filter === "all" 
    ? nodes 
    : filter === "public"
    ? nodes.filter(n => n.publicly_accessible)
    : nodes.filter(n => n.attack_surface_score > 70);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              {t('infrastructureTopology.title')}
            </CardTitle>
            <CardDescription>
              {t('infrastructureTopology.description')}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('infrastructureTopology.allResources')}</SelectItem>
                <SelectItem value="public">{t('infrastructureTopology.publicOnly')}</SelectItem>
                <SelectItem value="highrisk">{t('infrastructureTopology.highRisk')}</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleZoomIn} disabled={loading} size="sm" variant="outline">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button onClick={handleZoomOut} disabled={loading} size="sm" variant="outline">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button onClick={handleResetView} disabled={loading} size="sm" variant="outline">
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button onClick={loadTopology} disabled={loading} size="sm">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[650px] space-y-4">
            <RefreshCw className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">{t('infrastructureTopology.loading')}</p>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[650px] space-y-4">
            <Network className="h-24 w-24 text-muted-foreground opacity-20" />
            <div className="text-center space-y-2">
              <p className="text-lg font-semibold">{t('infrastructureTopology.noResourcesFound')}</p>
              <p className="text-sm text-muted-foreground max-w-md">
                {t('infrastructureTopology.goToResourceMonitor')}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">
                <div className="w-3 h-3 rounded-full bg-purple-500 mr-2" />
                Internet
              </Badge>
              <Badge variant="secondary">
                <div className="w-3 h-3 rounded-full bg-blue-500 mr-2" />
                Edge (IGW/ALB)
              </Badge>
              <Badge variant="secondary">
                <div className="w-3 h-3 rounded-full bg-green-500 mr-2" />
                Public
              </Badge>
              <Badge variant="secondary">
                <div className="w-3 h-3 rounded-full bg-orange-500 mr-2" />
                {t('infrastructureTopology.private')}
              </Badge>
              <Badge variant="destructive">
                <div className="w-3 h-3 rounded-full bg-red-500 mr-2" />
                {t('infrastructureTopology.highRisk')}
              </Badge>
            </div>

            <div className="border rounded-lg overflow-hidden bg-muted/30">
              <canvas
                ref={canvasRef}
                className="w-full cursor-move"
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                onDoubleClick={handleCanvasDoubleClick}
              />
            </div>

            {selectedNode && (
              <Card className="border-primary">
                <CardHeader>
                  <CardTitle className="text-base">{t('infrastructureTopology.selectedResource')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="font-semibold">{t('infrastructureTopology.name')}:</div>
                    <div>{selectedNode.resource_name || selectedNode.resource_id}</div>
                    
                    <div className="font-semibold">{t('infrastructureTopology.type')}:</div>
                    <div>{selectedNode.resource_type}</div>
                    
                    <div className="font-semibold">{t('common.region')}:</div>
                    <div>{selectedNode.region || 'N/A'}</div>
                    
                    <div className="font-semibold">{t('infrastructureTopology.layer')}:</div>
                    <div>{LAYERS[selectedNode.layer]?.name || 'Unknown'}</div>
                    
                    <div className="font-semibold">{t('infrastructureTopology.isPublic')}:</div>
                    <div>
                      <Badge variant={selectedNode.publicly_accessible ? "destructive" : "secondary"}>
                        {selectedNode.publicly_accessible ? t('infrastructureTopology.yes') : t('infrastructureTopology.no')}
                      </Badge>
                    </div>
                    
                    {selectedNode.vpc_id && (
                      <>
                        <div className="font-semibold">VPC:</div>
                        <div className="text-xs">{selectedNode.vpc_id}</div>
                      </>
                    )}
                    
                    {selectedNode.subnet_id && (
                      <>
                        <div className="font-semibold">Subnet:</div>
                        <div className="text-xs">{selectedNode.subnet_id}</div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="text-xs text-muted-foreground space-y-1">
              <p>💡 <strong>{t('infrastructureTopology.tipDrag').split(':')[0]}:</strong> {t('infrastructureTopology.tipDrag').split(':').slice(1).join(':')}</p>
              <p>🔗 {t('infrastructureTopology.tipConnections')}</p>
              <p>🎯 {t('infrastructureTopology.tipArrows')}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
