import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useAuthSafe } from '@/hooks/useAuthSafe';
import { FileCode } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function ApiDocs() {
  const { t } = useTranslation();
  const { user } = useAuthSafe();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is super admin
    const roles = user?.['custom:roles'] || user?.roles || '[]';
    const userRoles = typeof roles === 'string' ? JSON.parse(roles) : roles;
    
    if (!userRoles.includes('super_admin')) {
      navigate('/');
    }
  }, [user, navigate]);

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
