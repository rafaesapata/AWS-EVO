import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DeadLetterQueueMonitor() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>⚠️ Component Temporarily Disabled</CardTitle>
      </CardHeader>
      <CardContent>
        <p>This component will be implemented with AWS SQS Dead Letter Queues.</p>
        <p>Coming soon with full DLQ monitoring capabilities.</p>
      </CardContent>
    </Card>
  );
}