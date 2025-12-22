import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function UserList() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>⚠️ Component Temporarily Disabled</CardTitle>
      </CardHeader>
      <CardContent>
        <p>This component will be implemented with AWS Cognito User Pools.</p>
        <p>Coming soon with full user listing and management capabilities.</p>
      </CardContent>
    </Card>
  );
}