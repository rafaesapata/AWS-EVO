import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SystemMetrics } from "@/components/admin/SystemMetrics";
import { Layout } from "@/components/Layout";
import { 
  Activity, 
  Server, 
  Database, 
  Wifi, 
  HardDrive, 
  Cpu, 
  MemoryStick,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock
} from "lucide-react";

const SystemMonitoring = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("overview");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [metrics, setMetrics] = useState({
    cpu: 67,
    memory: 54,
    disk: 78,
    network: 23,
    uptime: "15d 7h 23m",
    activeConnections: 142,
    responseTime: 89,
    errorRate: 0.02
  });

  const [services, setServices] = useState([
    { name: "API Gateway", status: "healthy", uptime: "99.9%", responseTime: "45ms" },
    { name: "Lambda Functions", status: "healthy", uptime: "99.8%", responseTime: "120ms" },
    { name: "RDS Database", status: "healthy", uptime: "99.9%", responseTime: "15ms" },
    { name: "CloudFront CDN", status: "healthy", uptime: "100%", responseTime: "8ms" },
    { name: "S3 Storage", status: "healthy", uptime: "100%", responseTime: "12ms" },
    { name: "Cognito Auth", status: "warning", uptime: "99.5%", responseTime: "200ms" }
  ]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Update metrics with slight variations
    setMetrics(prev => ({
      ...prev,
      cpu: Math.max(20, Math.min(90, prev.cpu + (Math.random() - 0.5) * 10)),
      memory: Math.max(30, Math.min(85, prev.memory + (Math.random() - 0.5) * 8)),
      disk: Math.max(50, Math.min(95, prev.disk + (Math.random() - 0.5) * 5)),
      network: Math.max(5, Math.min(50, prev.network + (Math.random() - 0.5) * 15)),
      activeConnections: Math.max(50, Math.min(300, prev.activeConnections + Math.floor((Math.random() - 0.5) * 20))),
      responseTime: Math.max(50, Math.min(200, prev.responseTime + Math.floor((Math.random() - 0.5) * 20)))
    }));
    
    setIsRefreshing(false);
  };

  useEffect(() => {
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      handleRefresh();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Activity className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-semibold text-gray-900">System Monitoring</h1>
              <Badge variant="secondary">Real-time</Badge>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">CPU Usage</p>
                    <p className="text-2xl font-semibold text-gray-900">{metrics.cpu}%</p>
                    <Progress value={metrics.cpu} className="mt-2" />
                  </div>
                  <Cpu className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Memory</p>
                    <p className="text-2xl font-semibold text-gray-900">{metrics.memory}%</p>
                    <Progress value={metrics.memory} className="mt-2" />
                  </div>
                  <MemoryStick className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Disk Usage</p>
                    <p className="text-2xl font-semibold text-gray-900">{metrics.disk}%</p>
                    <Progress value={metrics.disk} className="mt-2" />
                  </div>
                  <HardDrive className="h-8 w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Network I/O</p>
                    <p className="text-2xl font-semibold text-gray-900">{metrics.network}%</p>
                    <Progress value={metrics.network} className="mt-2" />
                  </div>
                  <Wifi className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="glass-card-float grid w-full grid-cols-4">
              <TabsTrigger value="overview">Visão Geral</TabsTrigger>
              <TabsTrigger value="services">Serviços</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>System Health</CardTitle>
                    <CardDescription>Status geral do sistema</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Uptime</span>
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          {metrics.uptime}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Active Connections</span>
                        <span className="text-sm font-medium">{metrics.activeConnections}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Avg Response Time</span>
                        <span className="text-sm font-medium">{metrics.responseTime}ms</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Error Rate</span>
                        <span className="text-sm font-medium text-green-600">{metrics.errorRate}%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Resource Utilization</CardTitle>
                    <CardDescription>Uso atual dos recursos</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm">CPU</span>
                          <span className="text-sm font-medium">{metrics.cpu}%</span>
                        </div>
                        <Progress value={metrics.cpu} />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm">Memory</span>
                          <span className="text-sm font-medium">{metrics.memory}%</span>
                        </div>
                        <Progress value={metrics.memory} />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm">Disk</span>
                          <span className="text-sm font-medium">{metrics.disk}%</span>
                        </div>
                        <Progress value={metrics.disk} />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm">Network</span>
                          <span className="text-sm font-medium">{metrics.network}%</span>
                        </div>
                        <Progress value={metrics.network} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="services" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>AWS Services Status</CardTitle>
                  <CardDescription>Status dos serviços AWS monitorados</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {services.map((service, index) => (
                      <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          {service.status === 'healthy' ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : service.status === 'warning' ? (
                            <AlertTriangle className="h-5 w-5 text-orange-500" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                          )}
                          <div>
                            <p className="font-medium">{service.name}</p>
                            <p className="text-sm text-gray-500">Uptime: {service.uptime}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge 
                            variant={service.status === 'healthy' ? 'secondary' : 'destructive'}
                            className={service.status === 'healthy' ? 'bg-green-100 text-green-800' : ''}
                          >
                            {service.status}
                          </Badge>
                          <p className="text-sm text-gray-500 mt-1">{service.responseTime}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="performance" className="mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SystemMetrics />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Alertas de Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">High CPU usage detected</p>
                          <p className="text-xs text-gray-500">CPU usage above 80% for 5 minutes</p>
                          <p className="text-xs text-gray-500">Há 10 minutos</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Clock className="h-4 w-4 text-blue-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Slow response time</p>
                          <p className="text-xs text-gray-500">API response time above 200ms</p>
                          <p className="text-xs text-gray-500">Há 25 minutos</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">System recovery completed</p>
                          <p className="text-xs text-gray-500">All services back to normal</p>
                          <p className="text-xs text-gray-500">Há 1 hora</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="logs" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>System Logs</CardTitle>
                  <CardDescription>Logs recentes do sistema</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm space-y-1 max-h-96 overflow-y-auto">
                    <div>[2024-12-12 15:30:45] INFO: API Gateway request processed successfully</div>
                    <div>[2024-12-12 15:30:44] INFO: Lambda function executed in 120ms</div>
                    <div>[2024-12-12 15:30:43] INFO: Database query completed in 15ms</div>
                    <div>[2024-12-12 15:30:42] WARN: High CPU usage detected: 85%</div>
                    <div>[2024-12-12 15:30:41] INFO: CloudFront cache hit ratio: 95%</div>
                    <div>[2024-12-12 15:30:40] INFO: S3 object uploaded successfully</div>
                    <div>[2024-12-12 15:30:39] INFO: Cognito user authenticated</div>
                    <div>[2024-12-12 15:30:38] INFO: System health check passed</div>
                    <div>[2024-12-12 15:30:37] INFO: Auto-scaling event triggered</div>
                    <div>[2024-12-12 15:30:36] INFO: Backup process completed</div>
                    <div>[2024-12-12 15:30:35] ERROR: Connection timeout to external service</div>
                    <div>[2024-12-12 15:30:34] INFO: SSL certificate validation successful</div>
                    <div>[2024-12-12 15:30:33] INFO: Load balancer health check passed</div>
                    <div>[2024-12-12 15:30:32] INFO: Memory usage normalized: 54%</div>
                    <div>[2024-12-12 15:30:31] INFO: Network traffic within normal limits</div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default SystemMonitoring;
