import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { useLicenseValidation } from "@/hooks/useLicenseValidation";
import { AwsAccountGuard } from "@/components/AwsAccountGuard";
import { Loader2, AlertTriangle, ShieldX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();
  
  // License validation hook
  const { data: licenseStatus, isLoading: isLicenseLoading, error: licenseError } = useLicenseValidation();

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

  // Loading state - authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-slate-300">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  // Não autenticado
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Loading state - license validation
  if (isLicenseLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-slate-300">Validando licença...</p>
        </div>
      </div>
    );
  }

  // License validation error - allow access for admins to configure license
  if (licenseError) {
    console.error("License validation error:", licenseError);
    // Allow access anyway - the system will show appropriate messages
  }

  // Check license status
  if (licenseStatus && !licenseStatus.isValid) {
    // Allow admins to access license management page
    const isLicensePage = location.pathname === '/app/license-management' || 
                          location.pathname === '/app/settings/license';
    
    if (licenseStatus.canAccessLicensePage && isLicensePage) {
      return <>{children}</>;
    }

    // Show appropriate error based on reason
    const getErrorContent = () => {
      switch (licenseStatus.reason) {
        case 'expired':
          return {
            icon: <AlertTriangle className="h-16 w-16 text-yellow-500" />,
            title: "Licença Expirada",
            message: "Sua licença expirou. Entre em contato com o administrador para renovar.",
            showLicenseButton: licenseStatus.isAdmin
          };
        case 'no_seats':
          return {
            icon: <Users className="h-16 w-16 text-orange-500" />,
            title: "Sem Assento Disponível",
            message: "Você não possui um assento de licença atribuído. Entre em contato com o administrador da organização.",
            showLicenseButton: licenseStatus.isAdmin
          };
        case 'seats_exceeded':
          return {
            icon: <Users className="h-16 w-16 text-red-500" />,
            title: "Limite de Usuários Excedido",
            message: `A organização excedeu o limite de usuários da licença. ${licenseStatus.excessUsers} usuário(s) em excesso.`,
            showLicenseButton: licenseStatus.isAdmin
          };
        case 'no_license':
        default:
          return {
            icon: <ShieldX className="h-16 w-16 text-red-500" />,
            title: "Licença Não Configurada",
            message: licenseStatus.message || "Nenhuma licença válida encontrada. Entre em contato com o administrador.",
            showLicenseButton: licenseStatus.isAdmin
          };
      }
    };

    const errorContent = getErrorContent();

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-8 max-w-md w-full text-center space-y-6">
          {errorContent.icon}
          <h1 className="text-2xl font-bold text-white">{errorContent.title}</h1>
          <p className="text-slate-300">{errorContent.message}</p>
          
          <div className="flex flex-col gap-3">
            {errorContent.showLicenseButton && (
              <Button 
                onClick={() => window.location.href = '/app/license-management'}
                className="w-full"
              >
                Gerenciar Licenças
              </Button>
            )}
            <Button 
              variant="outline" 
              onClick={() => {
                cognitoAuth.signOut();
                window.location.href = '/';
              }}
              className="w-full"
            >
              Sair
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated and licensed - now check AWS accounts
  return (
    <AwsAccountGuard>
      {children}
    </AwsAccountGuard>
  );
}
