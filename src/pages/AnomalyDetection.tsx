import { AnomalyDashboard } from "@/components/dashboard/AnomalyDashboard";
import { Layout } from "@/components/Layout";
import { Activity } from "lucide-react";

const AnomalyDetection = () => {
  return (
    <Layout 
      title="Detecção de Anomalias" 
      description="Identifique comportamentos anômalos em sua infraestrutura AWS"
      icon={<Activity className="h-7 w-7 text-white" />}
    >
      <AnomalyDashboard />
    </Layout>
  );
};

export default AnomalyDetection;
