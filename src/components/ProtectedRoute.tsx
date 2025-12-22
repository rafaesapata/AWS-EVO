import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Verificar sessão local primeiro (fallback)
        const localAuth = localStorage.getItem('evo-auth');
        if (localAuth) {
          const authData = JSON.parse(localAuth);
          // Verificar se não expirou (24 horas)
          if (Date.now() - authData.timestamp < 24 * 60 * 60 * 1000) {
            console.log("✅ Local auth valid");
            setIsAuthenticated(true);
            setIsLoading(false);
            return;
          }
        }

        // Tentar AWS Cognito
        const user = await cognitoAuth.getCurrentUser();
        setIsAuthenticated(!!user);
      } catch (error) {
        console.log("Authentication check failed:", error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}