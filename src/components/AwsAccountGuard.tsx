import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { useAuthSafe } from '@/hooks/useAuthSafe';
import { useLicenseValidation } from '@/hooks/useLicenseValidation';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { Loader2 } from 'lucide-react';

interface AwsAccountGuardProps {
  children: React.ReactNode;
}

/**
 * Componente que verifica se o usuário tem contas cloud conectadas (AWS/Azure)
 * APÓS verificar se tem licença válida
 * 
 * Lógica:
 * 1. Se não tem licença válida -> AuthGuard já redireciona para /license-management
 * 2. Se está em DEMO MODE -> Permite navegação livre (dados fictícios do backend)
 * 3. Se tem licença válida mas não tem conta cloud -> Redireciona para /cloud-credentials
 * 4. Se tem licença válida e tem conta cloud -> Sistema normal
 * 
 * IMPORTANTE: Em modo DEMO, o usuário pode explorar o sistema livremente.
 * Quando sair do modo DEMO, o bloqueio volta a funcionar normalmente.
 */
export function AwsAccountGuard({ children }: AwsAccountGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthSafe();
  const { accounts, isLoading: accountsLoading, error } = useCloudAccount();
  const { data: licenseStatus, isLoading: licenseLoading } = useLicenseValidation();
  const { isDemoMode, isLoading: demoLoading, isVerified: demoVerified } = useDemoMode();

  // Páginas que não precisam de verificação de conta cloud
  const exemptPaths = [
    '/aws-settings',
    '/cloud-credentials',
    '/auth',
    '/login',
    '/change-password',
    '/terms-of-service',
    '/license-management' // Licenças sempre acessível
  ];

  const shouldCheck = user && 
                     !exemptPaths.some(path => location.pathname.startsWith(path));

  useEffect(() => {
    // Aguardar verificação de licença, contas e demo mode
    if (!shouldCheck || licenseLoading || accountsLoading || demoLoading || error) return;

    // Se não tem licença válida, o AuthGuard já cuida disso
    if (!licenseStatus?.isValid) return;

    // IMPORTANTE: Se está em modo DEMO, permite navegação livre
    // O backend retorna dados fictícios, então não precisa de conta cloud real
    if (isDemoMode && demoVerified) {
      console.log('🎭 Modo DEMO ativo - navegação livre permitida');
      return;
    }

    // Se tem licença válida e NÃO está em demo, verificar se tem contas cloud
    const hasActiveAccounts = Array.isArray(accounts) && accounts.length > 0;

    if (!hasActiveAccounts) {
      console.log('✅ Licença válida, mas sem contas cloud. Redirecionando para configuração...');
      navigate('/cloud-credentials', { 
        replace: true,
        state: { 
          from: location.pathname,
          reason: 'no_cloud_accounts',
          message: 'Licença válida! Agora você precisa conectar pelo menos uma conta cloud (AWS ou Azure) para usar o sistema.'
        }
      });
      return; // Prevent further execution
    }
  }, [
    shouldCheck, 
    licenseLoading, 
    accountsLoading, 
    demoLoading,
    error, 
    licenseStatus?.isValid, 
    accounts, 
    isDemoMode,
    demoVerified,
    navigate, 
    location.pathname
  ]);

  // Mostrar loading enquanto verifica licença, contas e demo mode
  if (shouldCheck && (licenseLoading || accountsLoading || demoLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-slate-300">
            {licenseLoading ? 'Verificando licença...' : 
             demoLoading ? 'Verificando modo de demonstração...' :
             'Verificando contas cloud...'}
          </p>
        </div>
      </div>
    );
  }

  // Se não deve verificar, tem licença inválida (AuthGuard cuida), 
  // está em modo DEMO, ou tem contas, renderizar children
  if (!shouldCheck || 
      !licenseStatus?.isValid || 
      (isDemoMode && demoVerified) ||
      (Array.isArray(accounts) && accounts.length > 0)) {
    return <>{children}</>;
  }

  // Se chegou aqui, está redirecionando
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-slate-300">Redirecionando para configuração de contas...</p>
      </div>
    </div>
  );
}