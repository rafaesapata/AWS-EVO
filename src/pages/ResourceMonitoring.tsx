import { ResourceMonitoringDashboard } from "@/components/dashboard/ResourceMonitoringDashboard";
import { Layout } from "@/components/Layout";
import { Server } from "lucide-react";

const ResourceMonitoring = () => {
  return (
    <Layout 
      title="Monitoramento de Recursos" 
      description="Monitore e gerencie seus recursos em tempo real"
      icon={<Server className="h-7 w-7" />}
    >
      <ResourceMonitoringDashboard />
    </Layout>
  );
};

export default ResourceMonitoring;
