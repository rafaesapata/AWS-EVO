import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AwsAccountProvider } from "@/contexts/AwsAccountContext";
import { TVDashboardProvider } from "@/contexts/TVDashboardContext";
import AuthSimple from "./pages/Auth-simple";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import Features from "./pages/Features";
import TermsOfService from "./pages/TermsOfService";
import TVDashboard from "./pages/TVDashboard";
import AWSSettings from "./pages/AWSSettings";
import SystemMonitoring from "./pages/SystemMonitoring";
import ResourceMonitoring from "./pages/ResourceMonitoring";
import ThreatDetection from "./pages/ThreatDetection";
import AttackDetection from "./pages/AttackDetection";
import AnomalyDetection from "./pages/AnomalyDetection";
import MLWasteDetection from "./pages/MLWasteDetection";
import WellArchitected from "./pages/WellArchitected";
import LicenseManagement from "./pages/LicenseManagement";
import KnowledgeBase from "./pages/KnowledgeBase";
import CommunicationCenter from "./pages/CommunicationCenter";
import BackgroundJobs from "./pages/BackgroundJobs";
import PredictiveIncidents from "./pages/PredictiveIncidents";
import BedrockTestPage from "./pages/BedrockTestPage";
import ChangePassword from "./pages/ChangePassword";
import CopilotAI from "./pages/CopilotAI";
import SecurityPosture from "./pages/SecurityPosture";
import IntelligentAlerts from "./pages/IntelligentAlerts";
import RemediationTickets from "./pages/RemediationTickets";
import CostOptimization from "./pages/CostOptimization";
import RISavingsPlans from "./pages/RISavingsPlans";
import SecurityScans from "./pages/SecurityScans";
import CloudTrailAudit from "./pages/CloudTrailAudit";
import Compliance from "./pages/Compliance";
import EndpointMonitoring from "./pages/EndpointMonitoring";
import EdgeMonitoring from "./pages/EdgeMonitoring";
import ProtectedRoute from "./components/ProtectedRoute";
import "./i18n/config";
import "./index.css";

// Wrapper for non-TV mode (default context)
function DefaultTVProvider({ children }: { children: React.ReactNode }) {
  return (
    <TVDashboardProvider organizationId={null}>
      {children}
    </TVDashboardProvider>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <DefaultTVProvider>
      <AwsAccountProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/" element={<AuthSimple />} />
            <Route path="/auth" element={<AuthSimple />} />
            <Route 
              path="/app" 
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/aws-settings" 
              element={
                <ProtectedRoute>
                  <AWSSettings />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/system-monitoring" 
              element={
                <ProtectedRoute>
                  <SystemMonitoring />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/resource-monitoring" 
              element={
                <ProtectedRoute>
                  <ResourceMonitoring />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/threat-detection" 
              element={
                <ProtectedRoute>
                  <ThreatDetection />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/attack-detection" 
              element={
                <ProtectedRoute>
                  <AttackDetection />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/anomaly-detection" 
              element={
                <ProtectedRoute>
                  <AnomalyDetection />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/ml-waste-detection" 
              element={
                <ProtectedRoute>
                  <MLWasteDetection />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/well-architected" 
              element={
                <ProtectedRoute>
                  <WellArchitected />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/license-management" 
              element={
                <ProtectedRoute>
                  <LicenseManagement />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/knowledge-base" 
              element={
                <ProtectedRoute>
                  <KnowledgeBase />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/communication-center" 
              element={
                <ProtectedRoute>
                  <CommunicationCenter />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/background-jobs" 
              element={
                <ProtectedRoute>
                  <BackgroundJobs />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/predictive-incidents" 
              element={
                <ProtectedRoute>
                  <PredictiveIncidents />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/bedrock-test" 
              element={
                <ProtectedRoute>
                  <BedrockTestPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/change-password" 
              element={
                <ProtectedRoute>
                  <ChangePassword />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/copilot-ai" 
              element={
                <ProtectedRoute>
                  <CopilotAI />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/security-posture" 
              element={
                <ProtectedRoute>
                  <SecurityPosture />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/intelligent-alerts" 
              element={
                <ProtectedRoute>
                  <IntelligentAlerts />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/remediation-tickets" 
              element={
                <ProtectedRoute>
                  <RemediationTickets />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/cost-optimization" 
              element={
                <ProtectedRoute>
                  <CostOptimization />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/ri-savings-plans" 
              element={
                <ProtectedRoute>
                  <RISavingsPlans />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/security-scans" 
              element={
                <ProtectedRoute>
                  <SecurityScans />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/cloudtrail-audit" 
              element={
                <ProtectedRoute>
                  <CloudTrailAudit />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/compliance" 
              element={
                <ProtectedRoute>
                  <Compliance />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/endpoint-monitoring" 
              element={
                <ProtectedRoute>
                  <EndpointMonitoring />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/edge-monitoring" 
              element={
                <ProtectedRoute>
                  <EdgeMonitoring />
                </ProtectedRoute>
              } 
            />
            <Route path="/tv" element={<TVDashboard />} />
            <Route path="/features" element={<Features />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
          <Toaster />
        </BrowserRouter>
      </AwsAccountProvider>
    </DefaultTVProvider>
  </QueryClientProvider>
);