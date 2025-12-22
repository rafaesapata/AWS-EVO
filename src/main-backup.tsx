import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import AuthSimple from "./pages/Auth-simple";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import Features from "./pages/Features";
import TermsOfService from "./pages/TermsOfService";
import ProtectedRoute from "./components/ProtectedRoute";
import "./i18n/config";
import "./index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<AuthSimple />} />
        <Route path="/auth" element={<AuthSimple />} />
        <Route 
          path="/app" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        <Route path="/features" element={<Features />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  </QueryClientProvider>
);