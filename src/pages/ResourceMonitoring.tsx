import { ResourceMonitoringDashboard } from "@/components/dashboard/ResourceMonitoringDashboard";
import { Layout } from "@/components/Layout";
import { Server } from "lucide-react";
import { useTranslation } from "react-i18next";

const ResourceMonitoring = () => {
  const { t } = useTranslation();
  
  return (
    <Layout 
      title={t('sidebar.resourceMonitoring', 'Monitoramento de Recursos')} 
      description={t('resourceMonitoring.description', 'Monitore e gerencie seus recursos em tempo real')}
      icon={<Server className="h-7 w-7" />}
    >
      <ResourceMonitoringDashboard />
    </Layout>
  );
};

export default ResourceMonitoring;
