import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Loader2 } from "lucide-react";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { toast } from "sonner";
import { AWSPermissionError } from "./AWSPermissionError";
import { SecurityScanHistory } from "./SecurityScanHistory";
import { useOrganization } from "@/hooks/useOrganization";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SecurityScanProps {
  onScanComplete: () => void;
}

export const SecurityScan = ({ onScanComplete }: SecurityScanProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const [permissionErrors, setPermissionErrors] = useState<Array<{
    service?: string;
    error: string;
    missingPermissions: string[];
  }>>([]);
  const { data: organizationId, isLoading: orgLoading } = useOrganization();
  
  // Use global account context for multi-account isolation
  const { selectedAccountId, selectedAccount } = useAwsAccount();
  
  console.log('SecurityScan: State', { organizationId, orgLoading, selectedAccountId });

  const handleSecurityScan = async () => {
    setIsScanning(true);
    setPermissionErrors([]);
    
    try {
      const session = await cognitoAuth.getCurrentSession(); const sessionError = null;
      
      if (sessionError || !session?.access_token) {
        throw new Error('Sessão não autenticada. Por favor, faça login novamente.');
      }

      toast.info("Iniciando análise de segurança AWS...", {
        description: "Este processo pode levar alguns minutos."
      });

      // SECURITY: Pass accountId for proper data isolation
      const response = await apiClient.invoke<{
        scan_id: string;
        findings_count: number;
        critical: number;
        high: number;
        medium: number;
        low: number;
        permissionErrors?: Array<{ service?: string; error: string; missingPermissions: string[] }>;
      }>('security-scan', {
        body: { accountId: selectedAccountId }
      });

      // Check for API errors
      if (response.error) {
        throw new Error(response.error.message || 'Erro ao executar scan');
      }

      const data = response.data;
      if (!data) {
        throw new Error('Nenhum dado retornado do scan');
      }

      // Capturar erros de permissão se houver
      if (data.permissionErrors && data.permissionErrors.length > 0) {
        setPermissionErrors(data.permissionErrors);
      }

      toast.success("Análise de segurança concluída!", {
        description: data.permissionErrors && data.permissionErrors.length > 0
          ? `${data.findings_count || 0} vulnerabilidades encontradas. Algumas verificações falharam por falta de permissões.`
          : `${data.findings_count} vulnerabilidades encontradas`
      });

      onScanComplete();
    } catch (error: any) {
      console.error('Erro na análise de segurança:', error);
      
      // Verificar se há informações de permissão no erro
      if (error.message && typeof error.message === 'string') {
        try {
          const errorData = JSON.parse(error.message);
          if (errorData.permissionErrors) {
            setPermissionErrors(errorData.permissionErrors);
          }
        } catch {}
      }
      
      toast.error("Erro ao executar análise de segurança", {
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <Tabs defaultValue="scan" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="scan">Nova Análise</TabsTrigger>
        <TabsTrigger value="history">Histórico</TabsTrigger>
      </TabsList>

      <TabsContent value="scan" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Análise de Segurança AWS
            </CardTitle>
            <CardDescription>
              Análise abrangente de segurança usando IA para identificar vulnerabilidades em toda a sua conta AWS
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Alertas de Permissões Faltantes */}
              <AWSPermissionError 
                errors={permissionErrors}
                title="⚠️ Análise Parcial - Permissões AWS Faltantes"
                description="A análise de segurança foi executada, mas algumas verificações falharam por falta de permissões. Configure as permissões no IAM para análise completa."
              />

              <div className="rounded-lg bg-muted p-4 space-y-2">
                <p className="text-sm font-medium">Serviços Analisados:</p>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• S3 Buckets - Permissões e criptografia</li>
                  <li>• IAM Users - Políticas e credenciais</li>
                  <li>• EC2 Security Groups - Regras de firewall</li>
                  <li>• RDS Instances - Configurações de banco de dados</li>
                  <li>• EC2 Instances - Estado e configuração</li>
                  <li>• CloudTrail - Trilhas de auditoria</li>
                  <li>• KMS Keys - Gerenciamento de chaves</li>
                </ul>
              </div>

              <Button
                onClick={handleSecurityScan}
                disabled={isScanning}
                className="w-full"
                size="lg"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analisando segurança...
                  </>
                ) : (
                  <>
                    <Shield className="mr-2 h-4 w-4" />
                    Iniciar Análise de Segurança
                  </>
                )}
              </Button>

              {isScanning && (
                <div className="text-center text-sm text-muted-foreground">
                  <p>Vasculhando recursos AWS...</p>
                  <p className="mt-1">Aplicando algoritmos de análise com IA...</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="history" className="mt-6">
        {organizationId && (
          <SecurityScanHistory 
            organizationId={organizationId}
            accountId={selectedAccountId}
            onViewScan={(scanId) => {
              toast.info("Visualização de scan específico em desenvolvimento");
            }}
          />
        )}
      </TabsContent>
    </Tabs>
  );
};
