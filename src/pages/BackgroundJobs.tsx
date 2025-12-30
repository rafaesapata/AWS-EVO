import BackgroundJobsMonitor from "@/components/admin/BackgroundJobsMonitor";
import DeadLetterQueueMonitor from "@/components/admin/DeadLetterQueueMonitor";
import { IntelligentAlerts } from "@/components/dashboard/IntelligentAlerts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layout } from "@/components/Layout";
import { Clock } from "lucide-react";

const BackgroundJobs = () => {
  return (
    <Layout 
      title="Background Jobs" 
      description="Monitore e gerencie jobs em segundo plano e filas de processamento"
      icon={<Clock className="h-7 w-7 text-white" />}
    >
      <Tabs defaultValue="jobs" className="w-full">
        <TabsList className="glass grid w-full grid-cols-3">
          <TabsTrigger value="jobs">Background Jobs</TabsTrigger>
          <TabsTrigger value="dlq">Dead Letter Queue</TabsTrigger>
          <TabsTrigger value="alerts">Alertas Automáticos</TabsTrigger>
        </TabsList>
        
        <TabsContent value="jobs" className="mt-6">
          <BackgroundJobsMonitor />
        </TabsContent>
        
        <TabsContent value="dlq" className="mt-6">
          <DeadLetterQueueMonitor />
        </TabsContent>
        
        <TabsContent value="alerts" className="mt-6">
          <IntelligentAlerts />
        </TabsContent>
      </Tabs>
    </Layout>
  );
};

export default BackgroundJobs;
