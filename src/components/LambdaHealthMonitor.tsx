import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { 
 Activity, 
 AlertTriangle, 
 CheckCircle2, 
 XCircle, 
 RefreshCw,
 TrendingUp,
 TrendingDown,
 Minus,
 Server,
 Shield,
 Lock,
 Zap
} from 'lucide-react';
import { apiClient } from '@/integrations/aws/api-client';
import { useTranslation } from 'react-i18next';

interface LambdaHealth {
 name: string;
 displayName: string;
 category: 'onboarding' | 'security' | 'auth' | 'core' | 'admin' | 'dashboard' | 'ai' | 'license' | 'kb' | 'reports' | 'organizations' | 'notifications' | 'storage' | 'jobs' | 'integrations' | 'tags';
 status: 'healthy' | 'degraded' | 'critical' | 'unknown';
 health: number;
 metrics: {
 errorRate: number;
 recentErrors: number;
 lastCheck: string;
 };
 configuration: {
 handler: string;
 runtime: string;
 memorySize: number;
 timeout: number;
 };
 issues: string[];
}

interface LambdaHealthResponse {
 summary: {
 total: number;
 healthy: number;
 degraded: number;
 critical: number;
 unknown: number;
 overallHealth: number;
 lastUpdate: string;
 };
 lambdas: LambdaHealth[];
 byCategory: Record<string, LambdaHealth[]>;
}

const categoryIcons: Record<string, any> = {
 onboarding: Server,
 security: Shield,
 auth: Lock,
 core: Zap,
 admin: Shield,
 dashboard: Activity,
 ai: Zap,
 license: Lock,
 kb: Server,
 reports: Server,
 organizations: Server,
 notifications: Server,
 storage: Server,
 jobs: Zap,
 integrations: Server,
 tags: Server,
};

const categoryLabels: Record<string, string> = {
 onboarding: 'Onboarding',
 security: 'Segurança',
 auth: 'Autenticação',
 core: 'Core',
 admin: 'Admin',
 dashboard: 'Dashboard',
 ai: 'AI/ML',
 license: 'Licenças',
 kb: 'Knowledge Base',
 reports: 'Relatórios',
 organizations: 'Organizações',
 notifications: 'Notificações',
 storage: 'Storage',
 jobs: 'Jobs',
 integrations: 'Integrações',
 tags: 'Tags',
};

const statusConfig = {
 healthy: {
 icon: CheckCircle2,
 color: 'text-green-500',
 bgColor: 'bg-green-500/10',
 borderColor: 'border-green-500/20',
 label: 'Saudável',
 },
 degraded: {
 icon: AlertTriangle,
 color: 'text-yellow-500',
 bgColor: 'bg-yellow-500/10',
 borderColor: 'border-yellow-500/20',
 label: 'Degradado',
 },
 critical: {
 icon: XCircle,
 color: 'text-red-500',
 bgColor: 'bg-red-500/10',
 borderColor: 'border-red-500/20',
 label: 'Crítico',
 },
 unknown: {
 icon: Minus,
 color: 'text-gray-500',
 bgColor: 'bg-gray-500/10',
 borderColor: 'border-gray-500/20',
 label: 'Desconhecido',
 },
};

export function LambdaHealthMonitor() {
 const { t } = useTranslation();
 const [activeCategory, setActiveCategory] = useState<string>('all');
 const [statusFilter, setStatusFilter] = useState<string>('all');

 const { data, isLoading, error, refetch } = useQuery<LambdaHealthResponse>({
 queryKey: ['lambda-health'],
 queryFn: async () => {
 const result = await apiClient.invoke('get-lambda-health');
 
 if (result.error) {
 throw new Error(result.error.message);
 }
 
 return result.data;
 },
 refetchInterval: 60000, // Atualizar a cada 1 minuto
 });

 if (isLoading) {
 return (
 <div className="space-y-6">
 {/* Summary Cards Skeleton */}
 <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
 {[...Array(5)].map((_, index) => (
 <Card key={index} className="">
 <CardHeader className="pb-3">
 <Skeleton className="h-4 w-24" />
 </CardHeader>
 <CardContent>
 <div className="flex items-center justify-between">
 <Skeleton className="h-10 w-16" />
 <Skeleton className="h-8 w-8 rounded-full" />
 </div>
 <Skeleton className="h-3 w-32 mt-2" />
 </CardContent>
 </Card>
 ))}
 </div>

 {/* Lambda List Skeleton */}
 <Card className="">
 <CardHeader>
 <div className="flex items-center justify-between">
 <div>
 <Skeleton className="h-6 w-48 mb-2" />
 <Skeleton className="h-4 w-64" />
 </div>
 <Skeleton className="h-9 w-28" />
 </div>
 </CardHeader>
 <CardContent>
 {/* Tabs Skeleton */}
 <div className="flex gap-2 mb-4">
 {[...Array(5)].map((_, index) => (
 <Skeleton key={index} className="h-9 w-24" />
 ))}
 </div>

 {/* Lambda Cards Skeleton */}
 <div className="space-y-3">
 {[...Array(4)].map((_, index) => (
 <Card key={index} className="">
 <CardContent className="p-4">
 <div className="flex items-start justify-between">
 <div className="flex items-start gap-3 flex-1">
 <Skeleton className="h-10 w-10 rounded-lg" />
 <div className="flex-1 space-y-2">
 <div className="flex items-center gap-2">
 <Skeleton className="h-5 w-48" />
 <Skeleton className="h-5 w-20" />
 </div>
 <Skeleton className="h-3 w-64" />
 <div className="flex items-center gap-4">
 <Skeleton className="h-3 w-24" />
 <Skeleton className="h-3 w-24" />
 <Skeleton className="h-3 w-24" />
 </div>
 <Skeleton className="h-4 w-full mt-2" />
 </div>
 </div>
 <Skeleton className="h-6 w-24" />
 </div>
 </CardContent>
 </Card>
 ))}
 </div>

 {/* Last Update Skeleton */}
 <Skeleton className="h-3 w-48 mx-auto mt-4" />
 </CardContent>
 </Card>
 </div>
 );
 }

 if (error || !data) {
 return (
 <Card className=" border-red-500/20">
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-red-500">
 <XCircle className="h-5 w-5" />
 Erro ao Carregar Saúde das Lambdas
 </CardTitle>
 </CardHeader>
 <CardContent>
 <p className="text-sm text-muted-foreground">
 {error instanceof Error ? error.message : 'Erro desconhecido'}
 </p>
 <Button onClick={() => refetch()} className="mt-4" variant="outline">
 <RefreshCw className="h-4 w-4 mr-2" />
 Tentar Novamente
 </Button>
 </CardContent>
 </Card>
 );
 }

 const { summary, lambdas, byCategory } = data;

 // Filtrar lambdas por categoria e status
 let filteredLambdas = activeCategory === 'all' 
 ? lambdas 
 : (byCategory[activeCategory] || []);
 
 // Aplicar filtro de status
 if (statusFilter !== 'all') {
 filteredLambdas = filteredLambdas.filter(l => l.status === statusFilter);
 }

 // Handler para clicar nos cards de status
 const handleStatusClick = (status: string) => {
 if (statusFilter === status) {
 setStatusFilter('all'); // Toggle off se já está selecionado
 } else {
 setStatusFilter(status);
 setActiveCategory('all'); // Reset categoria ao filtrar por status
 }
 };

 return (
 <div className="space-y-6">
 {/* Summary Cards */}
 <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
 {/* Overall Health */}
 <Card className="">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm font-medium">Saúde Geral</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="flex items-center justify-between">
 <div className="text-3xl font-semibold">
 {summary.overallHealth}%
 </div>
 {summary.overallHealth >= 90 ? (
 <TrendingUp className="h-8 w-8 text-green-500" />
 ) : summary.overallHealth >= 70 ? (
 <Minus className="h-8 w-8 text-yellow-500" />
 ) : (
 <TrendingDown className="h-8 w-8 text-red-500" />
 )}
 </div>
 <p className="text-xs text-muted-foreground mt-2">
 {summary.total} Lambdas monitoradas
 </p>
 </CardContent>
 </Card>

 {/* Healthy */}
 <Card 
 className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'healthy' ? 'ring-2 ring-green-500 border-green-500' : 'border-green-500/20'}`}
 onClick={() => handleStatusClick('healthy')}
 >
 <CardHeader className="pb-3">
 <CardTitle className="text-sm font-medium flex items-center gap-2">
 <CheckCircle2 className="h-4 w-4 text-green-500" />
 Saudáveis
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="text-3xl font-semibold text-green-500">
 {summary.healthy}
 </div>
 <p className="text-xs text-muted-foreground mt-2">
 {statusFilter === 'healthy' ? 'Clique para limpar filtro' : 'Clique para filtrar'}
 </p>
 </CardContent>
 </Card>

 {/* Degraded */}
 <Card 
 className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'degraded' ? 'ring-2 ring-yellow-500 border-yellow-500' : 'border-yellow-500/20'}`}
 onClick={() => handleStatusClick('degraded')}
 >
 <CardHeader className="pb-3">
 <CardTitle className="text-sm font-medium flex items-center gap-2">
 <AlertTriangle className="h-4 w-4 text-yellow-500" />
 Degradadas
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="text-3xl font-semibold text-yellow-500">
 {summary.degraded}
 </div>
 <p className="text-xs text-muted-foreground mt-2">
 {statusFilter === 'degraded' ? 'Clique para limpar filtro' : 'Clique para filtrar'}
 </p>
 </CardContent>
 </Card>

 {/* Critical */}
 <Card 
 className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'critical' ? 'ring-2 ring-red-500 border-red-500' : 'border-red-500/20'}`}
 onClick={() => handleStatusClick('critical')}
 >
 <CardHeader className="pb-3">
 <CardTitle className="text-sm font-medium flex items-center gap-2">
 <XCircle className="h-4 w-4 text-red-500" />
 Críticas
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="text-3xl font-semibold text-red-500">
 {summary.critical}
 </div>
 <p className="text-xs text-muted-foreground mt-2">
 {statusFilter === 'critical' ? 'Clique para limpar filtro' : 'Clique para filtrar'}
 </p>
 </CardContent>
 </Card>

 {/* Unknown */}
 <Card 
 className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'unknown' ? 'ring-2 ring-gray-500 border-gray-500' : 'border-gray-500/20'}`}
 onClick={() => handleStatusClick('unknown')}
 >
 <CardHeader className="pb-3">
 <CardTitle className="text-sm font-medium flex items-center gap-2">
 <Minus className="h-4 w-4 text-gray-500" />
 Desconhecidas
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="text-3xl font-semibold text-gray-500">
 {summary.unknown}
 </div>
 <p className="text-xs text-muted-foreground mt-2">
 {statusFilter === 'unknown' ? 'Clique para limpar filtro' : 'Clique para filtrar'}
 </p>
 </CardContent>
 </Card>
 </div>

 {/* Lambda List */}
 <Card className="">
 <CardHeader>
 <div className="flex items-center justify-between">
 <div>
 <CardTitle className="flex items-center gap-2">
 <Activity className="h-5 w-5" />
 {statusFilter !== 'all' ? (
 <>
 Lambdas {statusConfig[statusFilter as keyof typeof statusConfig].label}s ({filteredLambdas.length})
 </>
 ) : (
 <>Todas as Lambdas ({summary.total})</>
 )}
 </CardTitle>
 <CardDescription>
 {statusFilter !== 'all' ? (
 <>Mostrando apenas Lambdas com status "{statusConfig[statusFilter as keyof typeof statusConfig].label}"</>
 ) : (
 <>Monitoramento em tempo real de todas as {summary.total} Lambdas do sistema</>
 )}
 </CardDescription>
 </div>
 <div className="flex items-center gap-2">
 {statusFilter !== 'all' && (
 <Button 
 onClick={() => setStatusFilter('all')} 
 variant="outline" 
 size="sm"
 className="text-muted-foreground"
 >
 <XCircle className="h-4 w-4 mr-2" />
 Limpar Filtro
 </Button>
 )}
 <Button 
 onClick={() => refetch()} 
 variant="outline" 
 size="sm"
 className=" "
 >
 <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
 Atualizar
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 <Tabs value={activeCategory} onValueChange={setActiveCategory}>
 <TabsList className=" mb-4 flex-wrap h-auto gap-1 p-1">
 <TabsTrigger value="all">Todas ({summary.total})</TabsTrigger>
 {Object.entries(byCategory).map(([cat, lambdas]) => (
 <TabsTrigger key={cat} value={cat}>
 {categoryLabels[cat] || cat} ({lambdas.length})
 </TabsTrigger>
 ))}
 </TabsList>

 <div className="space-y-3">
 {filteredLambdas.map((lambda) => {
 const StatusIcon = statusConfig[lambda.status].icon;
 const CategoryIcon = categoryIcons[lambda.category];

 return (
 <Card 
 key={lambda.name}
 className={` ${statusConfig[lambda.status].borderColor}`}
 >
 <CardContent className="p-4">
 <div className="flex items-start justify-between">
 <div className="flex items-start gap-3 flex-1">
 {/* Category Icon */}
 <div className={`p-2 rounded-lg ${statusConfig[lambda.status].bgColor}`}>
 <CategoryIcon className={`h-5 w-5 ${statusConfig[lambda.status].color}`} />
 </div>

 {/* Lambda Info */}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <h4 className="font-semibold text-sm">
 {lambda.displayName}
 </h4>
 <Badge variant="outline" className="text-xs">
 {categoryLabels[lambda.category]}
 </Badge>
 </div>
 
 <p className="text-xs text-muted-foreground mb-2">
 {lambda.name}
 </p>

 {/* Metrics */}
 <div className="flex items-center gap-4 text-xs">
 <div className="flex items-center gap-1">
 <span className="text-muted-foreground">Saúde:</span>
 <span className={`font-medium ${statusConfig[lambda.status].color}`}>
 {Math.round(lambda.health * 100)}%
 </span>
 </div>
 
 {lambda.metrics.recentErrors > 0 && (
 <div className="flex items-center gap-1">
 <span className="text-muted-foreground">Erros:</span>
 <span className="font-medium text-red-500">
 {lambda.metrics.recentErrors}
 </span>
 </div>
 )}

 {lambda.metrics.errorRate > 0 && (
 <div className="flex items-center gap-1">
 <span className="text-muted-foreground">Taxa:</span>
 <span className="font-medium text-yellow-500">
 {lambda.metrics.errorRate.toFixed(1)}%
 </span>
 </div>
 )}
 </div>

 {/* Issues */}
 {lambda.issues.length > 0 && (
 <div className="mt-2 space-y-1">
 {lambda.issues.map((issue, idx) => (
 <div 
 key={idx}
 className="flex items-start gap-2 text-xs text-red-500"
 >
 <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
 <span>{issue}</span>
 </div>
 ))}
 </div>
 )}

 {/* Configuration */}
 <div className="mt-2 text-xs text-muted-foreground">
 <span>Handler: </span>
 <code className="text-xs bg-muted px-1 py-0.5 rounded">
 {lambda.configuration.handler || 'N/A'}
 </code>
 </div>
 </div>
 </div>

 {/* Status Badge */}
 <div className="flex items-center gap-2">
 <Badge 
 variant="outline"
 className={`${statusConfig[lambda.status].color} ${statusConfig[lambda.status].borderColor}`}
 >
 <StatusIcon className="h-3 w-3 mr-1" />
 {statusConfig[lambda.status].label}
 </Badge>
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 </Tabs>

 {/* Last Update */}
 <div className="mt-4 text-xs text-muted-foreground text-center">
 Última atualização: {new Date(summary.lastUpdate).toLocaleString('pt-BR')}
 </div>
 </CardContent>
 </Card>
 </div>
 );
}
