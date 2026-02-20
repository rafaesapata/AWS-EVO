import { useState, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ExecutiveDashboardV2 from '@/components/dashboard/ExecutiveDashboard';
import { TagFilterBar } from '@/components/tags/TagFilterBar';

export default function Dashboard() {
  const { t } = useTranslation();
  const [tagFilterIds, setTagFilterIds] = useState<string[]>([]);
  const handleTagFilterChange = useCallback((ids: string[]) => setTagFilterIds(ids), []);
  
  return (
    <Layout
      title={t('executiveDashboard.title', 'Dashboard Executivo')}
      description={t('executiveDashboard.description', 'Visão consolidada de segurança, custos e compliance')}
      icon={<BarChart3 className="h-4 w-4" />}
    >
      <div className="space-y-6">
        <TagFilterBar onFilterChange={handleTagFilterChange} />
        <ExecutiveDashboardV2 />
      </div>
    </Layout>
  );
}
