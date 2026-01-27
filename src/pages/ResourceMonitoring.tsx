import { ResourceMonitoringDashboard } from "@/components/dashboard/ResourceMonitoringDashboard";
import { Layout } from "@/components/Layout";
import { Server } from "lucide-react";
import { useTranslation } from "react-i18next";

const ResourceMonitoring = () => {
  const { t } = useTranslation();
  
  return (
    <Layout 
      title={t('resourceMonitoring.title', 'Resource Monitoring')} 
      description={t('resourceMonitoring.description', 'Monitor and manage your resources in real time')}
      icon={<Server className="h-7 w-7" />}
    >
      <ResourceMonitoringDashboard />
    </Layout>
  );
};

export default ResourceMonitoring;
