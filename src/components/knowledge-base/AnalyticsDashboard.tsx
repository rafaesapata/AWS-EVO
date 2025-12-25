import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOrganizationQuery } from "@/hooks/useOrganizationQuery";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Eye, ThumbsUp, TrendingUp, Users, BookOpen, Clock, Download, Share2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsDashboard() {
  const [authorsPage, setAuthorsPage] = useState(0);
  const AUTHORS_PER_PAGE = 5;

  const { data: analytics, isLoading, error } = useOrganizationQuery(
    ['kb-analytics-dashboard'],
    async (orgId) => {
      const result = await apiClient.invoke('kb-analytics-dashboard', {
        body: { organizationId: orgId }
      });
      const { data, error } = { data: result.data, error: result.error };

      
      return data;
    }
  );

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))', 'hsl(var(--destructive))'];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6">
          <p className="text-destructive">Erro ao carregar analytics. Tente novamente.</p>
        </CardContent>
      </Card>
    );
  }

  const paginatedAuthors = analytics?.topAuthors?.slice(
    authorsPage * AUTHORS_PER_PAGE,
    (authorsPage + 1) * AUTHORS_PER_PAGE
  ) || [];
  const totalAuthorsPages = Math.ceil((analytics?.topAuthors?.length || 0) / AUTHORS_PER_PAGE);

  const stats = [
    {
      title: "Total de Visualizações",
      value: analytics?.mostViewed?.reduce((sum: number, a: any) => sum + (a.view_count || 0), 0) || 0,
      icon: Eye,
      color: "text-primary"
    },
    {
      title: "Artigos Completos",
      value: analytics?.completionRate?.completed_reads || 0,
      icon: BookOpen,
      color: "text-success"
    },
    {
      title: "Avaliações Positivas",
      value: analytics?.totalEngagements?.helpful || 0,
      icon: ThumbsUp,
      color: "text-warning"
    },
    {
      title: "Compartilhamentos",
      value: analytics?.totalEngagements?.shares || 0,
      icon: Share2,
      color: "text-secondary"
    }
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                    <p className="text-2xl font-bold mt-2">{stat.value.toLocaleString()}</p>
                  </div>
                  <Icon className={`h-8 w-8 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Most Viewed Articles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Artigos Mais Visualizados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics?.mostViewed || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="title" tick={{ fill: 'hsl(var(--foreground))' }} />
                <YAxis tick={{ fill: 'hsl(var(--foreground))' }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.5rem'
                  }} 
                />
                <Bar dataKey="view_count" fill="hsl(var(--primary))" name="Visualizações" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analytics?.categoryDistribution || []}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ category, count }) => `${category}: ${count}`}
                  outerRadius={80}
                  fill="hsl(var(--primary))"
                  dataKey="count"
                >
                  {analytics?.categoryDistribution?.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.5rem'
                  }} 
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Authors */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Autores Mais Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {paginatedAuthors.map((author: any, index: number) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{authorsPage * AUTHORS_PER_PAGE + index + 1}</Badge>
                    <span className="text-sm">{author.email}</span>
                  </div>
                  <span className="text-sm font-medium">{author.article_count} artigos</span>
                </div>
              ))}
              {totalAuthorsPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAuthorsPage(p => Math.max(0, p - 1))}
                    disabled={authorsPage === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Página {authorsPage + 1} de {totalAuthorsPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAuthorsPage(p => Math.min(totalAuthorsPages - 1, p + 1))}
                    disabled={authorsPage >= totalAuthorsPages - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Engagement Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Métricas de Engajamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 border border-border rounded-lg">
              <span className="text-sm text-muted-foreground">Tempo Médio de Leitura</span>
              <span className="text-lg font-bold">
                {Math.round(analytics?.avgReadingTime?.avg_reading_time || 0)}s
              </span>
            </div>
            <div className="flex items-center justify-between p-3 border border-border rounded-lg">
              <span className="text-sm text-muted-foreground">Taxa de Scroll Médio</span>
              <span className="text-lg font-bold">
                {Math.round(analytics?.avgScrollDepth?.avg_scroll_depth || 0)}%
              </span>
            </div>
            <div className="flex items-center justify-between p-3 border border-border rounded-lg">
              <span className="text-sm text-muted-foreground">Taxa de Conclusão</span>
              <span className="text-lg font-bold">
                {analytics?.completionRate ? 
                  Math.round((analytics.completionRate.completed_reads / Math.max(analytics.completionRate.total_views, 1)) * 100) 
                  : 0}%
              </span>
            </div>
            <div className="flex items-center justify-between p-3 border border-border rounded-lg">
              <span className="text-sm text-muted-foreground">Total de Exportações</span>
              <span className="text-lg font-bold flex items-center gap-1">
                <Download className="h-4 w-4" />
                {analytics?.totalEngagements?.exports || 0}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Growth Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Crescimento da Base de Conhecimento</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analytics?.articleGrowth || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fill: 'hsl(var(--foreground))' }} />
              <YAxis tick={{ fill: 'hsl(var(--foreground))' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '0.5rem'
                }} 
              />
              <Legend />
              <Bar dataKey="count" fill="hsl(var(--primary))" name="Novos Artigos" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
