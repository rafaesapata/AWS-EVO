import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { useAuthSafe } from '@/hooks/useAuthSafe';
import { useLicenseValidation } from '@/hooks/useLicenseValidation';
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
 * 2. Se tem licença válida mas não tem conta cloud -> Redireciona para /cloud-credentials
 * 3. Se tem licença válida e tem conta cloud -> Sistema normal
 */
export function AwsAccountGuard({ children }: AwsAccountGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthSafe();
  const { accounts, isLoading: accountsLoading, error } = useCloudAccount();
  const { data: licenseStatus, isLoading: licenseLoading } = useLicenseValidation();

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
    // Aguardar verificação de licença e contas
    if (!shouldCheck || licenseLoading || accountsLoading || error) return;

    // Se não tem licença válida, o AuthGuard já cuida disso
    if (!licenseStatus?.isValid) return;

    // Se tem licença válida, verificar se tem contas AWS
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
    error, 
    licenseStatus?.isValid, 
    accounts, 
    navigate, 
    location.pathname
  ]);

  // Mostrar loading enquanto verifica licença e contas
  if (shouldCheck && (licenseLoading || accountsLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-slate-300">
            {licenseLoading ? 'Verificando licença...' : 'Verificando contas cloud...'}
          </p>
        </div>
      </div>
    );
  }

  // Se não deve verificar, tem licença inválida (AuthGuard cuida), ou tem contas, renderizar children
  if (!shouldCheck || 
      !licenseStatus?.isValid || 
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