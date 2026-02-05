import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useAuthSafe } from '@/hooks/useAuthSafe';
import { FileCode, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';

export default function ApiDocs() {
  const { t } = useTranslation();
  const { user } = useAuthSafe();
  const navigate = useNavigate();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check if user is super admin
    if (!user) {
      setIsChecking(true);
      return;
    }

    const roles = user?.['custom:roles'] || user?.roles || '[]';
    const userRoles = typeof roles === 'string' ? JSON.parse(roles) : roles;
    
    if (!userRoles.includes('super_admin')) {
      setIsAuthorized(false);
      setIsChecking(false);
      setTimeout(() => navigate('/dashboard'), 2000);
    } else {
      setIsAuthorized(true);
      setIsChecking(false);
    }
  }, [user, navigate]);

  if (isChecking) {
    return (
      <Layout
        title={t('apiDocs.title', 'API Documentation')}
        description={t('apiDocs.description', 'OpenAPI 3.0 specification with 140 endpoints')}
        icon={<FileCode className="h-4 w-4" />}
      >
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Verificando permissões...</p>
        </div>
      </Layout>
    );
  }

  if (!isAuthorized) {
    return (
      <Layout
        title={t('apiDocs.title', 'API Documentation')}
        description={t('apiDocs.description', 'OpenAPI 3.0 specification with 140 endpoints')}
        icon={<FileCode className="h-4 w-4" />}
      >
        <Card className="glass border-primary/20">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">
              Acesso Negado
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              Apenas super administradores podem acessar a documentação da API
            </p>
            <p className="text-xs text-gray-400">
              Redirecionando para o dashboard...
            </p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout
      title={t('apiDocs.title', 'API Documentation')}
      description={t('apiDocs.description', 'OpenAPI 3.0 specification with 140 endpoints')}
      icon={<FileCode className="h-4 w-4" />}
    >
      <div className="h-[calc(100vh-200px)]">
        <iframe
          src="/api-docs.html"
          className="w-full h-full border-0 rounded-lg"
          title="API Documentation"
        />
      </div>
    </Layout>
  );
}
