import BackgroundJobsMonitor from "@/components/admin/BackgroundJobsMonitor";
import DeadLetterQueueMonitor from "@/components/admin/DeadLetterQueueMonitor";
import { IntelligentAlerts } from "@/components/dashboard/IntelligentAlerts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const BackgroundJobs = () => {
  return (
    <div className="container mx-auto p-6">
      <Tabs defaultValue="jobs" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
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
    </div>
  );
};

export default BackgroundJobs;
