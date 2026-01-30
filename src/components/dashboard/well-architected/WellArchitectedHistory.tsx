import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/aws/api-client";
import { History, TrendingDown, TrendingUp, Shield, Eye, FileCheck, Calendar, CheckCircle2, XCircle, AlertTriangle, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";

interface WellArchitectedHistoryProps {
  organizationId: string;
  onViewScan?: (scanId: string) => void;
}

export const WellArchitectedHistory = ({ organizationId, onViewScan }: WellArchitectedHistoryProps) => {
  const { t } = useTranslation();
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  const { data: scanHistory, isLoading } = useQuery({
    queryKey: ['well-architected-history', organizationId, selectedPeriod],
    queryFn: async () => {
      const scansResponse = await apiClient.select('security_scans', {
        select: 'id, organization_id, status, created_at, completed_at, scan_type',
        eq: { organization_id: organizationId, scan_type: 'well_architected', status: 'completed' },
        order: { created_at: 'desc' },
        limit: 50
      });
      
      if (scansResponse.error) throw scansResponse.error;
      if (!scansResponse.data || scansResponse.data.length === 0) return [];

      const enrichedScans = await Promise.all(
        scansResponse.data.map(async (scan) => {
          const scoresResponse = await apiClient.select('well_architected_scores', {
            select: 'pillar, score, checks_passed, checks_failed, critical_issues, recommendations',
            eq: { scan_id: scan.id }
          });

          const scores = scoresResponse.data || [];
          const totalChecks = scores.reduce((sum, s) => sum + (s.checks_passed || 0) + (s.checks_failed || 0), 0);
          const checksPassed = scores.reduce((sum, s) => sum + (s.checks_passed || 0), 0);
          const checksFailed = scores.reduce((sum, s) => sum + (s.checks_failed || 0), 0);
          const criticalIssues = scores.reduce((sum, s) => sum + (s.critical_issues || 0), 0);
          
          let highIssues = 0, mediumIssues = 0, lowIssues = 0;
          scores.forEach(s => {
            if (Array.isArray(s.recommendations)) {
              s.recommendations.forEach((rec: any) => {
                if (rec.severity === 'high') highIssues++;
                else if (rec.severity === 'medium') mediumIssues++;
                else if (rec.severity === 'low') lowIssues++;
              });
            }
          });

          const overallScore = scores.length > 0 
            ? Math.round(scores.reduce((sum, s) => sum + (s.score || 0), 0) / scores.length)
            : 0;

          return {
            ...scan,
            scores,
            overallScore,
            totalChecks,
            checksPassed,
            checksFailed,
            criticalIssues,
            highIssues,
            mediumIssues,
            lowIssues
          };
        })
      );

      return enrichedScans;
    },
    enabled: !!organizationId
  });

  const chartData = scanHistory?.slice().reverse().map((scan, index) => ({
    name: format(new Date(scan.created_at), 'dd/MM', { locale: ptBR }),
    score: scan.overallScore,
    passed: scan.checksPassed,
    failed: scan.checksFailed,
    index
  })) || [];

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-[#10B981]';
    if (score >= 60) return 'text-[#F59E0B]';
    return 'text-[#EF4444]';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-[#10B981]/10';
    if (score >= 60) return 'bg-[#F59E0B]/10';
    return 'bg-[#EF4444]/10';
  };

  const getTrend = () => {
    if (!scanHistory || scanHistory.length < 2) return null;
    const latest = scanHistory[0].overallScore;
    const previous = scanHistory[1].overallScore;
    const diff = latest - previous;
    return { diff, isPositive: diff >= 0 };
  };

  const trend = getTrend();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-[300px] w-full" />
        </div>
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
          <Skeleton className="h-8 w-48 mb-4" />
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!scanHistory || scanHistory.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-12 text-center">
        <div className="w-16 h-16 bg-[#003C7D]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <History className="h-8 w-8 text-[#003C7D]" />
        </div>
        <h3 className="text-xl font-light text-[#1F2937] mb-2">
          {t('wellArchitected.history.noData', 'Nenhum histórico disponível')}
        </h3>
        <p className="text-gray-500">
          {t('wellArchitected.history.noDataDescription', 'Execute uma análise Well-Architected para começar a acompanhar o histórico.')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Filter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-[#003C7D]/10 rounded-xl flex items-center justify-center">
            <Calendar className="h-5 w-5 text-[#003C7D]" />
          </div>
          <div>
            <h3 className="text-lg font-light text-[#1F2937]">
              {t('wellArchitected.history.period', 'Período de Análise')}
            </h3>
            <p className="text-sm text-gray-500">
              {scanHistory.length} {t('wellArchitected.history.scansFound', 'análises encontradas')}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {(['7d', '30d', '90d', 'all'] as const).map((period) => (
            <Button
              key={period}
              variant={selectedPeriod === period ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedPeriod(period)}
              className={selectedPeriod === period 
                ? 'bg-[#003C7D] hover:bg-[#003C7D]/90 text-white' 
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'}
            >
              {period === '7d' && '7 dias'}
              {period === '30d' && '30 dias'}
              {period === '90d' && '90 dias'}
              {period === 'all' && 'Todos'}
            </Button>
          ))}
        </div>
      </div>

      {/* Score Evolution Chart */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#003C7D]/10 rounded-xl flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-[#003C7D]" />
            </div>
            <div>
              <h3 className="text-lg font-light text-[#1F2937]">
                {t('wellArchitected.history.scoreEvolution', 'Evolução do Score')}
              </h3>
              <p className="text-sm text-gray-500">
                {t('wellArchitected.history.scoreEvolutionDesc', 'Acompanhe a evolução da pontuação ao longo do tempo')}
              </p>
            </div>
          </div>
          {trend && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${trend.isPositive ? 'bg-[#10B981]/10' : 'bg-[#EF4444]/10'}`}>
              {trend.isPositive ? (
                <TrendingUp className="h-4 w-4 text-[#10B981]" />
              ) : (
                <TrendingDown className="h-4 w-4 text-[#EF4444]" />
              )}
              <span className={`text-sm font-medium ${trend.isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                {trend.isPositive ? '+' : ''}{trend.diff}%
              </span>
            </div>
          )}
        </div>
        
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#003C7D" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#003C7D" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
              <YAxis domain={[0, 100]} stroke="#9CA3AF" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
                formatter={(value) => [`${value}%`, 'Score']}
              />
              <Area 
                type="monotone" 
                dataKey="score" 
                stroke="#003C7D" 
                strokeWidth={2}
                fill="url(#scoreGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Checks Evolution Chart */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-[#10B981]/10 rounded-xl flex items-center justify-center">
            <FileCheck className="h-5 w-5 text-[#10B981]" />
          </div>
          <div>
            <h3 className="text-lg font-light text-[#1F2937]">
              {t('wellArchitected.history.checksEvolution', 'Evolução das Verificações')}
            </h3>
            <p className="text-sm text-gray-500">
              {t('wellArchitected.history.checksEvolutionDesc', 'Verificações aprovadas vs reprovadas')}
            </p>
          </div>
        </div>
        
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
              <YAxis stroke="#9CA3AF" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="passed" 
                name={t('wellArchitected.history.passed', 'Aprovadas')}
                stroke="#10B981" 
                strokeWidth={2}
                dot={{ fill: '#10B981', strokeWidth: 2 }}
              />
              <Line 
                type="monotone" 
                dataKey="failed" 
                name={t('wellArchitected.history.failed', 'Reprovadas')}
                stroke="#EF4444" 
                strokeWidth={2}
                dot={{ fill: '#EF4444', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Scan History List */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-[#003C7D]/10 rounded-xl flex items-center justify-center">
            <History className="h-5 w-5 text-[#003C7D]" />
          </div>
          <div>
            <h3 className="text-lg font-light text-[#1F2937]">
              {t('wellArchitected.history.scanList', 'Histórico de Análises')}
            </h3>
            <p className="text-sm text-gray-500">
              {t('wellArchitected.history.scanListDesc', 'Todas as análises realizadas')}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {scanHistory.map((scan, index) => (
            <div 
              key={scan.id}
              className="flex items-center justify-between p-4 bg-[#F9FAFB] rounded-xl hover:bg-[#F1F3F7] transition-colors cursor-pointer group"
              onClick={() => onViewScan?.(scan.id)}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getScoreBgColor(scan.overallScore)}`}>
                  <span className={`text-lg font-semibold ${getScoreColor(scan.overallScore)}`}>
                    {scan.overallScore}%
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[#1F2937]">
                      {format(new Date(scan.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </span>
                    {index === 0 && (
                      <Badge className="bg-[#003C7D] text-white text-xs">
                        {t('wellArchitected.history.latest', 'Mais recente')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981]" />
                      {scan.checksPassed} {t('wellArchitected.history.passed', 'aprovadas')}
                    </span>
                    <span className="flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5 text-[#EF4444]" />
                      {scan.checksFailed} {t('wellArchitected.history.failed', 'reprovadas')}
                    </span>
                    {scan.criticalIssues > 0 && (
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 text-[#F59E0B]" />
                        {scan.criticalIssues} {t('wellArchitected.history.critical', 'críticos')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {scan.highIssues > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {scan.highIssues} High
                    </Badge>
                  )}
                  {scan.mediumIssues > 0 && (
                    <Badge className="bg-[#F59E0B] text-white text-xs">
                      {scan.mediumIssues} Medium
                    </Badge>
                  )}
                  {scan.lowIssues > 0 && (
                    <Badge className="bg-gray-400 text-white text-xs">
                      {scan.lowIssues} Low
                    </Badge>
                  )}
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[#003C7D]"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  {t('wellArchitected.history.view', 'Ver')}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
