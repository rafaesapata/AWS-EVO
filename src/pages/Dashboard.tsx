import { Layout } from '@/components/Layout';
import { BarChart3 } from 'lucide-react';
import ExecutiveDashboardV2 from '@/components/dashboard/ExecutiveDashboard';

export default function Dashboard() {
  return (
    <Layout
      title="Dashboard Executivo"
      description="Visão consolidada de segurança, custos e compliance"
      icon={<BarChart3 className="h-4 w-4 text-white" />}
    >
      <ExecutiveDashboardV2 />
    </Layout>
  );
}
