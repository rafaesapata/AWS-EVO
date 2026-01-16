import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  XCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  Server,
  Database,
  Globe,
  Shield,
  DollarSign,
  Zap,
  Cloud,
  HardDrive,
  Network,
  Users,
  FileText,
  Bell,
  Eye,
  Lock,
  BarChart3
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ServiceStatus {
  id: string;
  name: string;
  category: 'compute' | 'storage' | 'database' | 'networking' | 'security' | 'analytics';
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  icon: any;
  region: string;
  lastCheck: string;
  uptime: number;
  responseTime?: number;
  errorRate?: number;
  cost?: number;
  trend: 'up' | 'down' | 'stable';
  metrics: {
    name: string;
    value: string;
    change: string;
    trend: 'up' | 'down' | 'stable';
  }[];
  alerts: number;
  consoleUrl: string;
}

const AWS_SERVICES: ServiceStatus[] = [
  // Compute Services
  {
    id: 'ec2',
    name: 'Amazon EC2',
    category: 'compute',
    status: 'healthy',
    icon: Server,
    region: 'us-east-1',
    lastCheck: '2 min ago',
    uptime: 99.9,
    responseTime: 45,
    errorRate: 0.1,
    cost: 1250.50,
    trend: 'up',
    alerts: 0,
    consoleUrl: 'https://console.aws.amazon.com/ec2/',
    metrics: [
      { name: 'Instâncias Ativas', value: '24', change: '+2', trend: 'up' },
      { name: 'CPU Utilização', value: '65%', change: '+5%', trend: 'up' },
      { name: 'Network In', value: '2.4 GB', change: '+0.3 GB', trend: 'up' },
      { name: 'Network Out', value: '1.8 GB', change: '-0.1 GB', trend: 'down' }
    ]
  },
  {
    id: 'lambda',
    name: 'AWS Lambda',
    category: 'compute',
    status: 'healthy',
    icon: Zap,
    region: 'us-east-1',
    lastCheck: '1 min ago',
    uptime: 99.95,
    responseTime: 120,
    errorRate: 0.05,
    cost: 45.20,
    trend: 'stable',
    alerts: 0,
    consoleUrl: 'https://console.aws.amazon.com/lambda/',
    metrics: [
      { name: 'Invocações', value: '1.2M', change: '+150K', trend: 'up' },
      { name: 'Duração Média', value: '245ms', change: '-15ms', trend: 'down' },
      { name: 'Taxa de Erro', value: '0.05%', change: '0%', trend: 'stable' },
      { name: 'Throttles', value: '0', change: '0', trend: 'stable' }
    ]
  },

  // Storage Services
  {
    id: 's3',
    name: 'Amazon S3',
    category: 'storage',
    status: 'healthy',
    icon: HardDrive,
    region: 'us-east-1',
    lastCheck: '3 min ago',
    uptime: 99.99,
    cost: 89.75,
    trend: 'up',
    alerts: 0,
    consoleUrl: 'https://console.aws.amazon.com/s3/',
    metrics: [
      { name: 'Total de Objetos', value: '2.4M', change: '+50K', trend: 'up' },
      { name: 'Tamanho Total', value: '1.2 TB', change: '+45 GB', trend: 'up' },
      { name: 'Requests GET', value: '450K', change: '+25K', trend: 'up' },
      { name: 'Requests PUT', value: '12K', change: '+2K', trend: 'up' }
    ]
  },

  // Database Services
  {
    id: 'rds',
    name: 'Amazon RDS',
    category: 'database',
    status: 'warning',
    icon: Database,
    region: 'us-east-1',
    lastCheck: '1 min ago',
    uptime: 99.8,
    responseTime: 25,
    cost: 340.80,
    trend: 'up',
    alerts: 2,
    consoleUrl: 'https://console.aws.amazon.com/rds/',
    metrics: [
      { name: 'Conexões Ativas', value: '85', change: '+15', trend: 'up' },
      { name: 'CPU Utilização', value: '78%', change: '+12%', trend: 'up' },
      { name: 'Read IOPS', value: '1.2K', change: '+200', trend: 'up' },
      { name: 'Write IOPS', value: '800', change: '+100', trend: 'up' }
    ]
  },

  // Networking Services
  {
    id: 'cloudfront',
    name: 'Amazon CloudFront',
    category: 'networking',
    status: 'healthy',
    icon: Globe,
    region: 'Global',
    lastCheck: '2 min ago',
    uptime: 99.95,
    responseTime: 85,
    cost: 125.30,
    trend: 'stable',
    alerts: 0,
    consoleUrl: 'https://console.aws.amazon.com/cloudfront/',
    metrics: [
      { name: 'Requests', value: '2.8M', change: '+200K', trend: 'up' },
      { name: 'Data Transfer', value: '450 GB', change: '+25 GB', trend: 'up' },
      { name: 'Cache Hit Rate', value: '92%', change: '+2%', trend: 'up' },
      { name: 'Origin Latency', value: '45ms', change: '-5ms', trend: 'down' }
    ]
  },
  {
    id: 'vpc',
    name: 'Amazon VPC',
    category: 'networking',
    status: 'healthy',
    icon: Network,
    region: 'us-east-1',
    lastCheck: '5 min ago',
    uptime: 100,
    cost: 15.60,
    trend: 'stable',
    alerts: 0,
    consoleUrl: 'https://console.aws.amazon.com/vpc/',
    metrics: [
      { name: 'VPCs Ativas', value: '3', change: '0', trend: 'stable' },
      { name: 'Subnets', value: '12', change: '0', trend: 'stable' },
      { name: 'NAT Gateways', value: '2', change: '0', trend: 'stable' },
      { name: 'VPC Endpoints', value: '5', change: '+1', trend: 'up' }
    ]
  },

  // Security Services
  {
    id: 'iam',
    name: 'AWS IAM',
    category: 'security',
    status: 'healthy',
    icon: Users,
    region: 'Global',
    lastCheck: '10 min ago',
    uptime: 100,
    cost: 0,
    trend: 'stable',
    alerts: 0,
    consoleUrl: 'https://console.aws.amazon.com/iam/',
    metrics: [
      { name: 'Usuários Ativos', value: '45', change: '+2', trend: 'up' },
      { name: 'Roles', value: '128', change: '+5', trend: 'up' },
      { name: 'Policies', value: '89', change: '+3', trend: 'up' },
      { name: 'Access Keys', value: '67', change: '-2', trend: 'down' }
    ]
  },
  {
    id: 'guardduty',
    name: 'Amazon GuardDuty',
    category: 'security',
    status: 'healthy',
    icon: Shield,
    region: 'us-east-1',
    lastCheck: '5 min ago',
    uptime: 99.9,
    cost: 28.40,
    trend: 'stable',
    alerts: 1,
    consoleUrl: 'https://console.aws.amazon.com/guardduty/',
    metrics: [
      { name: 'Findings Ativos', value: '3', change: '+1', trend: 'up' },
      { name: 'Eventos Analisados', value: '2.4M', change: '+150K', trend: 'up' },
      { name: 'Ameaças Detectadas', value: '0', change: '0', trend: 'stable' },
      { name: 'Trusted IPs', value: '12', change: '0', trend: 'stable' }
    ]
  },

  // Analytics Services
  {
    id: 'cloudwatch',
    name: 'Amazon CloudWatch',
    category: 'analytics',
    status: 'healthy',
    icon: BarChart3,
    region: 'us-east-1',
    lastCheck: '1 min ago',
    uptime: 99.95,
    cost: 67.80,
    trend: 'up',
    alerts: 0,
    consoleUrl: 'https://console.aws.amazon.com/cloudwatch/',
    metrics: [
      { name: 'Métricas Ativas', value: '1.2K', change: '+50', trend: 'up' },
      { name: 'Alarmes', value: '45', change: '+3', trend: 'up' },
      { name: 'Log Groups', value: '28', change: '+2', trend: 'up' },
      { name: 'Dashboards', value: '8', change: '+1', trend: 'up' }
    ]
  }
];

const CATEGORIES = [
  { id: 'all', name: 'Todos', icon: Activity },
  { id: 'compute', name: 'Compute', icon: Server },
  { id: 'storage', name: 'Storage', icon: HardDrive },
  { id: 'database', name: 'Database', icon: Database },
  { id: 'networking', name: 'Networking', icon: Network },
  { id: 'security', name: 'Security', icon: Shield },
  { id: 'analytics', name: 'Analytics', icon: BarChart3 }
];

export function AWSServicesMonitoring() {
  const { toast } = useToast();
  const [services, setServices] = useState<ServiceStatus[]>(AWS_SERVICES);
  const [activeCategory, setActiveCategory] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const filteredServices = activeCategory === 'all' 
    ? services 
    : services.filter(service => service.category === activeCategory);

  const healthyServices = services.filter(s => s.status === 'healthy').length;
  const warningServices = services.filter(s => s.status === 'warning').length;
  const criticalServices = services.filter(s => s.status === 'critical').length;
  const totalAlerts = services.reduce((sum, s) => sum + s.alerts, 0);
  const totalCost = services.reduce((sum, s) => sum + (s.cost || 0), 0);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    
    try {
      // Simular refresh dos dados
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Atualizar timestamps
      setServices(prev => prev.map(service => ({
        ...service,
        lastCheck: 'Agora mesmo'
      })));
      
      setLastRefresh(new Date());
      
      toast({
        title: "Dados atualizados",
        description: "Status dos serviços AWS foi atualizado com sucesso",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar o status dos serviços",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'critical':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-500 text-white">Saudável</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-500 text-white">Atenção</Badge>;
      case 'critical':
        return <Badge className="bg-red-500 text-white">Crítico</Badge>;
      default:
        return <Badge variant="secondary">Desconhecido</Badge>;
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-3 w-3 text-green-500" />;
      case 'down':
        return <TrendingDown className="h-3 w-3 text-red-500" />;
      default:
        return <Minus className="h-3 w-3 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Saudáveis</p>
                <p className="text-2xl font-semibold text-green-600">{healthyServices}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-sm font-medium">Atenção</p>
                <p className="text-2xl font-semibold text-yellow-600">{warningServices}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-sm font-medium">Críticos</p>
                <p className="text-2xl font-semibold text-red-600">{criticalServices}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm font-medium">Alertas</p>
                <p className="text-2xl font-semibold text-orange-600">{totalAlerts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Custo Total</p>
                <p className="text-2xl font-semibold text-blue-600">${totalCost.toFixed(0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-2"
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Atualizar
          </Button>
          
          <span className="text-sm text-muted-foreground">
            Última atualização: {lastRefresh.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Category Tabs */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="grid w-full grid-cols-7">
          {CATEGORIES.map((category) => {
            const Icon = category.icon;
            const count = category.id === 'all' 
              ? services.length 
              : services.filter(s => s.category === category.id).length;
            
            return (
              <TabsTrigger key={category.id} value={category.id} className="gap-2">
                <Icon className="h-4 w-4" />
                {category.name}
                <Badge variant="secondary" className="ml-1">
                  {count}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {CATEGORIES.map((category) => (
          <TabsContent key={category.id} value={category.id} className="space-y-4">
            <div className="grid gap-4">
              {filteredServices.map((service) => {
                const Icon = service.icon;
                return (
                  <Card key={service.id} className="transition-all hover:shadow-md">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg ${
                            service.status === 'healthy' ? 'bg-green-500/10' :
                            service.status === 'warning' ? 'bg-yellow-500/10' :
                            service.status === 'critical' ? 'bg-red-500/10' : 'bg-muted'
                          }`}>
                            <Icon className={`h-5 w-5 ${
                              service.status === 'healthy' ? 'text-green-500' :
                              service.status === 'warning' ? 'text-yellow-500' :
                              service.status === 'critical' ? 'text-red-500' : 'text-muted-foreground'
                            }`} />
                          </div>
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              {service.name}
                              {getStatusBadge(service.status)}
                              {service.alerts > 0 && (
                                <Badge variant="destructive" className="text-xs">
                                  {service.alerts} alerta{service.alerts > 1 ? 's' : ''}
                                </Badge>
                              )}
                            </CardTitle>
                            <CardDescription className="flex items-center gap-4 mt-1">
                              <span>Região: {service.region}</span>
                              <span>Última verificação: {service.lastCheck}</span>
                              <span>Uptime: {service.uptime}%</span>
                            </CardDescription>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {getStatusIcon(service.status)}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(service.consoleUrl, '_blank')}
                            className="gap-2"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Console
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {/* Uptime Progress */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Uptime</span>
                          <span className="text-sm text-muted-foreground">{service.uptime}%</span>
                        </div>
                        <Progress value={service.uptime} className="h-2" />
                      </div>

                      {/* Key Metrics */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {service.metrics.map((metric, index) => (
                          <div key={index} className="text-center p-3 bg-muted/50 rounded-lg">
                            <p className="text-xs text-muted-foreground mb-1">{metric.name}</p>
                            <p className="text-lg font-semibold">{metric.value}</p>
                            <div className="flex items-center justify-center gap-1 mt-1">
                              {getTrendIcon(metric.trend)}
                              <span className={`text-xs ${
                                metric.trend === 'up' ? 'text-green-600' :
                                metric.trend === 'down' ? 'text-red-600' : 'text-muted-foreground'
                              }`}>
                                {metric.change}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Additional Info */}
                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {service.responseTime && (
                            <span>Latência: {service.responseTime}ms</span>
                          )}
                          {service.errorRate !== undefined && (
                            <span>Taxa de Erro: {service.errorRate}%</span>
                          )}
                          {service.cost !== undefined && (
                            <span>Custo: ${service.cost.toFixed(2)}/mês</span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1">
                          {getTrendIcon(service.trend)}
                          <span className="text-sm text-muted-foreground">
                            {service.trend === 'up' ? 'Crescendo' :
                             service.trend === 'down' ? 'Diminuindo' : 'Estável'}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Health Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Resumo de Saúde dos Serviços
          </CardTitle>
          <CardDescription>
            Status geral da infraestrutura AWS
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-500/10 rounded-lg">
              <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-2xl font-semibold text-green-600">{((healthyServices / services.length) * 100).toFixed(1)}%</p>
              <p className="text-sm text-muted-foreground">Serviços Saudáveis</p>
            </div>
            
            <div className="text-center p-4 bg-blue-500/10 rounded-lg">
              <DollarSign className="h-8 w-8 text-blue-500 mx-auto mb-2" />
              <p className="text-2xl font-semibold text-blue-600">${totalCost.toFixed(0)}</p>
              <p className="text-sm text-muted-foreground">Custo Total Mensal</p>
            </div>
            
            <div className="text-center p-4 bg-orange-500/10 rounded-lg">
              <Bell className="h-8 w-8 text-orange-500 mx-auto mb-2" />
              <p className="text-2xl font-semibold text-orange-600">{totalAlerts}</p>
              <p className="text-sm text-muted-foreground">Alertas Ativos</p>
            </div>
          </div>

          {totalAlerts > 0 && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Atenção:</strong> Existem {totalAlerts} alerta{totalAlerts > 1 ? 's' : ''} ativo{totalAlerts > 1 ? 's' : ''} 
                que requer{totalAlerts === 1 ? '' : 'em'} sua atenção. Verifique os serviços marcados para mais detalhes.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}