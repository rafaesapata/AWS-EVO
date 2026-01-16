import { Layout } from '@/components/Layout';
import { FileCheck } from 'lucide-react';
import AuditLog from '@/components/admin/AuditLog';

export default function AuditLogPage() {
  return (
    <Layout
      title="Log de Auditoria"
      description="Histórico de ações e eventos do sistema"
      icon={<FileCheck className="h-4 w-4 text-white" />}
    >
      <AuditLog />
    </Layout>
  );
}
