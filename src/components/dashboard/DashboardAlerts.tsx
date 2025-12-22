import { useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTVDashboard } from "@/contexts/TVDashboardContext";

interface DashboardAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  is_read: boolean;
  action_url: string | null;
}

export default function DashboardAlerts({ organizationId }: { organizationId: string }) {
  const { isTVMode } = useTVDashboard();
  
  const { data: alerts, refetch } = useQuery({
    queryKey: ['dashboard-alerts', organizationId],
    queryFn: async () => {
      const response = await apiClient.select(tableName, { eq: filters });
      const data = response.data;
      const error = response.error;
      return data as DashboardAlert[];
    }
  });

  const markAsRead = async (alertId: string) => {
    // SECURITY: Add organization_id filter to prevent cross-org updates
    await apiClient.select(tableName, {
        select: '*',
        eq: filters,
        order: { column: 'created_at', ascending: false }
      });
    
    refetch();
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertCircle className="h-4 w-4" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getSeverityClass = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'border-destructive bg-destructive/10';
      case 'warning':
        return 'border-warning bg-warning/10';
      default:
        return 'border-primary bg-primary/10';
    }
  };

  if (!alerts || alerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {alerts.map(alert => (
        <Alert 
          key={alert.id} 
          className={cn(
            "relative animate-fade-in",
            getSeverityClass(alert.severity)
          )}
        >
          {!isTVMode && (
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-2 top-2 h-6 w-6"
              onClick={() => markAsRead(alert.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          
          <div className="flex items-start gap-3 pr-8">
            {getSeverityIcon(alert.severity)}
            <div className="flex-1">
              <AlertTitle className="flex items-center gap-2">
                {alert.title}
                <Badge variant="outline" className="text-xs">
                  {alert.alert_type}
                </Badge>
              </AlertTitle>
              <AlertDescription className="mt-1">
                {alert.message}
              </AlertDescription>
              {alert.action_url && (
                <Button 
                  size="sm" 
                  variant="link" 
                  className="mt-2 p-0 h-auto"
                  onClick={() => window.location.href = alert.action_url!}
                >
                  Tomar ação →
                </Button>
              )}
            </div>
          </div>
        </Alert>
      ))}
    </div>
  );
}