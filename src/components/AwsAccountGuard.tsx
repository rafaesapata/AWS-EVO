import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { useLicenseValidation } from '@/hooks/useLicenseValidation';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { Loader2 } from 'lucide-react';

interface AwsAccountGuardProps {
  children: React.ReactNode;
}

/**
 * Componente que verifica se o usuário tem contas cloud conectadas (AWS/Azure)
 * APÓS verificar se tem licença válida.
 * 
 * NOTA: Este componente é SEMPRE renderizado dentro de ProtectedRoute,
 * que já verificou autenticação. Portanto, não precisamos de useAuthSafe() aqui.
 * Usar useAuthSafe() criava uma instância SEPARADA de estado de auth que
 * começava com user=null, causando shouldCheck=false e permitindo render
 * prematuro dos children antes da verificação de demo mode.
 * 
 * Lógica:
 * 1. Se não tem licença válida -> ProtectedRoute já redireciona
 * 2. Se está em DEMO MODE -> Permite navegação livre (dados fictícios do backend)
 * 3. Se tem licença válida mas não tem conta cloud -> Redireciona para /cloud-credentials
 * 4. Se tem licença válida e tem conta cloud -> Sistema normal
 */
export function AwsAccountGuard({ children }: AwsAccountGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { accounts, isLoading: accountsLoading, error } = useCloudAccount();
  const { data: licenseStatus, isLoading: licenseLoading } = useLicenseValidation();
  const { isDemoMode, isLoading: demoLoading, isVerified: demoVerified } = useDemoMode();
  
  // Safety timeout: if demo verification takes too long (10s), 
  // force demoVerified to true to unblock the UI (non-demo path)
  const [demoTimeout, setDemoTimeout] = useState(false);
  const demoVerifiedRef = useRef(demoVerified);
  demoVerifiedRef.current = demoVerified;
  
  useEffect(() => {
    if (demoVerified) {
      setDemoTimeout(false);
      return;
    }
    const timer = setTimeout(() => {
      if (!demoVerifiedRef.current) {
        console.warn('[AwsAccountGuard] Demo verification timeout after 10s, proceeding as non-demo');
        setDemoTimeout(true);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [demoVerified]);
  
  const effectiveDemoVerified = demoVerified || demoTimeout;

  // Páginas que não precisam de verificação de conta cloud
  const exemptPaths = [
    '/aws-settings',
    '/cloud-credentials',
    '/auth',
    '/login',
    '/change-password',
    '/terms-of-service',
    '/license-management'
  ];

  // We're always inside ProtectedRoute (user is authenticated),
  // so we only skip checking for exempt paths
  const isExemptPath = exemptPaths.some(path => location.pathname.startsWith(path));

  useEffect(() => {
    // Skip check for exempt paths
    if (isExemptPath) return;
    
    // Wait for all async checks to complete
    if (licenseLoading || accountsLoading || demoLoading || error) return;

    // Se não tem licença válida, o ProtectedRoute já cuida disso
    if (!licenseStatus?.isValid) return;

    // IMPORTANTE: Se está em modo DEMO, permite navegação livre
    if (isDemoMode && effectiveDemoVerified) {
      return;
    }

    // Se demo mode ainda não foi verificado, aguardar
    if (!effectiveDemoVerified) {
      return;
    }

    // Se tem licença válida e NÃO está em demo, verificar se tem contas cloud
    const hasActiveAccounts = Array.isArray(accounts) && accounts.length > 0;

    if (!hasActiveAccounts) {
      navigate('/cloud-credentials', { 
        replace: true,
        state: { 
          from: location.pathname,
          reason: 'no_cloud_accounts',
          message: 'Licença válida! Agora você precisa conectar pelo menos uma conta cloud (AWS ou Azure) para usar o sistema.'
        }
      });
    }
  }, [
    isExemptPath, 
    licenseLoading, 
    accountsLoading, 
    demoLoading,
    error, 
    licenseStatus?.isValid, 
    accounts, 
    isDemoMode,
    effectiveDemoVerified,
    navigate, 
    location.pathname
  ]);

  // Exempt paths: render children immediately
  if (isExemptPath) {
    return <>{children}</>;
  }

  // Show loading while verifying license, accounts and demo mode
  if (licenseLoading || accountsLoading || demoLoading || !effectiveDemoVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-slate-300">
            {licenseLoading ? 'Verificando licença...' : 
             demoLoading || !effectiveDemoVerified ? 'Verificando modo de demonstração...' :
             'Verificando contas cloud...'}
          </p>
        </div>
      </div>
    );
  }

  // License invalid: ProtectedRoute handles this
  if (!licenseStatus?.isValid) {
    return <>{children}</>;
  }

  // Demo mode active: allow free navigation
  if (isDemoMode && effectiveDemoVerified) {
    return <>{children}</>;
  }

  // Has cloud accounts: proceed normally
  if (Array.isArray(accounts) && accounts.length > 0) {
    return <>{children}</>;
  }

  // No accounts, redirecting...
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-slate-300">Redirecionando para configuração de contas...</p>
      </div>
    </div>
  );
}