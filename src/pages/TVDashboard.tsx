import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Shield, AlertCircle, RefreshCw } from "lucide-react";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import { ExecutiveDashboard } from "@/components/dashboard/ExecutiveDashboard";
import SecurityPosture from "@/components/dashboard/SecurityPosture";
import { CostOptimization } from "@/components/dashboard/CostOptimization";
import { WellArchitectedScorecard } from "@/components/dashboard/WellArchitectedScorecard";
import AnomalyDetection from "@/components/dashboard/AnomalyDetection";
import WasteDetection from "@/components/dashboard/WasteDetection";
import PredictiveIncidents from "@/components/dashboard/PredictiveIncidents";
import { ComplianceFrameworks } from "@/components/dashboard/ComplianceFrameworks";
import { BudgetForecasting } from "@/components/dashboard/BudgetForecasting";
import { TVDashboardProvider } from "@/contexts/TVDashboardContext";

interface DashboardConfig {
  id: string;
  name: string;
  layout: Array<{ widgetId: string }>;
  refreshInterval: number;
  organizationId: string;
}

export default function TVDashboard() {
  const { token } = useParams<{ token: string }>();
  const [dashboard, setDashboard] = useState<DashboardConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    verifyToken();
  }, [token]);

  useEffect(() => {
    if (!dashboard) return;

    // Set up auto-refresh
    const interval = setInterval(() => {
      setLastUpdate(new Date());
    }, dashboard.refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [dashboard]);

  const verifyToken = async () => {
    setLoading(true);
    try {
      const result = await apiClient.invoke('verify-tv-token', {
        token
      });

      if (result.error || !result.data?.success) {
        throw new Error(result.data?.error || 'Invalid token');
      }

      setDashboard(result.data.dashboard);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderWidget = (widgetId: string, index: number) => {
    const widgetMap: Record<string, JSX.Element> = {
      'executive': <ExecutiveDashboard key={`${widgetId}-${index}`} />,
      'security-posture': <SecurityPosture key={`${widgetId}-${index}`} />,
      'cost-optimization': <CostOptimization key={`${widgetId}-${index}`} onAnalysisComplete={() => {}} />,
      'well-architected': <WellArchitectedScorecard key={`${widgetId}-${index}`} onScanComplete={() => {}} />,
      'anomalies': <AnomalyDetection key={`${widgetId}-${index}`} />,
      'waste': <WasteDetection key={`${widgetId}-${index}`} />,
      'predictive': <PredictiveIncidents key={`${widgetId}-${index}`} />,
      'compliance': <ComplianceFrameworks key={`${widgetId}-${index}`} />,
      'budget': <BudgetForecasting key={`${widgetId}-${index}`} />,
    };

    return widgetMap[widgetId] || null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="text-center max-w-md">
          <AlertCircle className="h-16 w-16 mx-auto mb-4 text-destructive" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground mb-4">{error}</p>
          <p className="text-sm text-muted-foreground">
            This TV Dashboard link may have expired or been deactivated.
          </p>
        </div>
      </div>
    );
  }

  if (!dashboard) return null;

  return (
    <TVDashboardProvider organizationId={dashboard.organizationId} isTVMode={true}>
      <div className="min-h-screen bg-background">
      {/* TV Header - Compact */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-primary">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">{dashboard.name}</h1>
                <p className="text-xs text-muted-foreground">EVO - AWS Platform</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" style={{ animationDuration: `${dashboard.refreshInterval}s` }} />
                <span>Auto-refresh: {dashboard.refreshInterval}s</span>
              </div>
              <div className="text-xs">
                Last update: {lastUpdate.toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard Content - Fullscreen optimized */}
      <main className="container mx-auto px-6 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {dashboard.layout.map((item, index) => (
            <div key={`widget-${index}`} className="tv-widget">
              {renderWidget(item.widgetId, index)}
            </div>
          ))}
        </div>
      </main>

      {/* TV-specific styles */}
      <style>{`
        .tv-widget {
          animation: fadeIn 0.5s ease-in-out;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Optimize for large screens */
        @media (min-width: 1920px) {
          .container {
            max-width: 1800px;
          }
        }

        /* Hide scrollbars for cleaner TV display */
        ::-webkit-scrollbar {
          width: 6px;
        }
        
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        
        ::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
      `}</style>
      </div>
    </TVDashboardProvider>
  );
}