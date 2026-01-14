import { AnomalyDashboard } from "@/components/dashboard/AnomalyDashboard";
import { Layout } from "@/components/Layout";
import { Activity } from "lucide-react";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { useTranslation } from "react-i18next";

const AnomalyDetection = () => {
  const { selectedProvider } = useCloudAccount();
  const { t } = useTranslation();
  
  const providerName = selectedProvider === 'AZURE' ? 'Azure' : 'AWS';
  
  return (
    <Layout 
      title={t('anomalyDetection.title', 'Detecção de Anomalias')}
      description={t('anomalyDetection.description', `Identifique comportamentos anômalos em sua infraestrutura ${providerName}`)}
      icon={<Activity className="h-7 w-7 text-white" />}
    >
      <AnomalyDashboard />
    </Layout>
  );
};

export default AnomalyDetection;
