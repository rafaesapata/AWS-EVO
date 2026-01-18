import { Layout } from '@/components/Layout';
import { BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ExecutiveDashboardV2 from '@/components/dashboard/ExecutiveDashboard';

export default function Dashboard() {
  const { t } = useTranslation();
  
  return (
    <Layout
      title={t('executiveDashboard.title', 'Dashboard Executivo')}
      description={t('executiveDashboard.description', 'Visão consolidada de segurança, custos e compliance')}
      icon={<BarChart3 className="h-4 w-4" />}
    >
      <ExecutiveDashboardV2 />
    </Layout>
  );
}
