import { Activity, History } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PredictiveIncidentsComponent from "@/components/dashboard/PredictiveIncidents";
import { PredictiveIncidentsHistory } from "@/components/dashboard/PredictiveIncidentsHistory";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/Layout";
import { useTranslation } from "react-i18next";

const PredictiveIncidents = () => {
  const { t } = useTranslation();
  const { data: organizationId } = useOrganization();
  const [activeTab, setActiveTab] = useState("prediction");
  const { toast } = useToast();

  const handleViewScan = (scanId: string) => {
    toast({
      title: t('predictiveIncidents.predictionDetails', 'Prediction Details'),
      description: t('predictiveIncidents.viewingPrediction', 'Viewing prediction details {{id}}...', { id: scanId.slice(0, 8) }),
    });
    // Switch to prediction tab to show details
    setActiveTab("prediction");
  };

  return (
    <Layout 
      title={t('sidebar.predictiveIncidents', 'Incidentes Preditivos')} 
      description={t('predictiveIncidents.description', 'Predict potential incidents using Machine Learning for predictive infrastructure analysis')}
      icon={<Activity className="h-7 w-7" />}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="glass-card-float">
          <TabsTrigger value="prediction" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            {t('predictiveIncidents.newPrediction', 'New Prediction')}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            {t('predictiveIncidents.history', 'History')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prediction">
          <PredictiveIncidentsComponent />
        </TabsContent>

        <TabsContent value="history">
          {organizationId && (
            <PredictiveIncidentsHistory 
              organizationId={organizationId} 
              onViewScan={handleViewScan}
            />
          )}
        </TabsContent>
      </Tabs>
    </Layout>
  );
};

export default PredictiveIncidents;