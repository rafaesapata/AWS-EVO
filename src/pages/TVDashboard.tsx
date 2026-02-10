import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Shield, AlertCircle, RefreshCw } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
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
  const { t } = useTranslation();
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
      // Direct fetch without authentication for public TV endpoint
      const response = await fetch(`${API_BASE_URL}/api/functions/verify-tv-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      const result = await response.json();

      // Handle nested response structure: { success, data: { success, dashboard } }
      const data = result.data || result;
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Invalid token');
      }

      setDashboard(data.dashboard);
    } catch (err: any) {
      console.error('TV Token verification error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderWidget = (widgetId: string, index: number) => {
    // In TV mode, only render ExecutiveDashboard which has public endpoint support
    const widgetMap: Record<string, JSX.Element> = {
      'executive': <ExecutiveDashboard key={`${widgetId}-${index}`} />,
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
          <h1 className="text-2xl font-semibold mb-2">Access Denied</h1>
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
        <div className="w-full px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-primary">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">{dashboard.name}</h1>
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
      <main className="w-full px-6 py-6">
        <ExecutiveDashboard />
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