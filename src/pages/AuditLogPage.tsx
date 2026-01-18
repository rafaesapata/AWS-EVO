import { Layout } from '@/components/Layout';
import { FileCheck } from 'lucide-react';
import AuditLog from '@/components/admin/AuditLog';
import { useTranslation } from 'react-i18next';

export default function AuditLogPage() {
  const { t } = useTranslation();
  
  return (
    <Layout
      title={t('sidebar.auditLog', 'Log de Auditoria')}
      description={t('auditLog.description', 'Histórico de ações e eventos do sistema')}
      icon={<FileCheck className="h-4 w-4" />}
    >
      <AuditLog />
    </Layout>
  );
}
