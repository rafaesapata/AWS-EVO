import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Copy, ExternalLink, Shield, RefreshCw, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

interface CloudRoleConfigErrorProps {
  errorMessage: string;
  accountName?: string;
  externalId?: string;
  cloudProvider?: 'AWS' | 'AZURE';
}

export default function CloudRoleConfigError({ 
  errorMessage,
  accountName,
  externalId,
  cloudProvider = 'AWS'
}: CloudRoleConfigErrorProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (cloudProvider === 'AZURE') {
    return <AzureRoleConfigError errorMessage={errorMessage} accountName={accountName} />;
  }

  return <AWSRoleConfigErrorContent errorMessage={errorMessage} accountName={accountName} externalId={externalId} />;
}

// AWS-specific error component
function AWSRoleConfigErrorContent({ 
  errorMessage,
  accountName,
  externalId
}: { errorMessage: string; accountName?: string; externalId?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  // Extract role ARN and user ARN from error message
  const roleArnMatch = errorMessage.match(/arn:aws:iam::(\d+):role\/([\w\-\/]+)/);
  const userArnMatch = errorMessage.match(/arn:aws:iam::(\d+):user\/([\w\-]+)/);
  
  const targetAccountId = roleArnMatch?.[1] || 'TARGET_ACCOUNT_ID';
  const roleName = roleArnMatch?.[2] || 'EVO-Platform-Role-EVO-ReadOnly';
  const platformAccountId = userArnMatch?.[1] || '971354623291';
  const platformUser = userArnMatch?.[2] || 'evo-platform-assumer';
  
  const displayExternalId = externalId || 'SEU_EXTERNAL_ID_AQUI';

  const trustPolicy = {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "AWS": `arn:aws:iam::${platformAccountId}:user/${platformUser}`
        },
        "Action": "sts:AssumeRole",
        "Condition": {
          "StringEquals": {
            "sts:ExternalId": displayExternalId
          }
        }
      }
    ]
  };

  const handleCopyTrustPolicy = () => {
    navigator.clipboard.writeText(JSON.stringify(trustPolicy, null, 2));
    toast.success(t('aws.trustPolicyCopied', 'Trust Policy copiada para a área de transferência'));
  };

  return (
    <Card className="border-destructive bg-destructive/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Shield className="h-5 w-5" />
          {t('aws.roleConfigError', 'Erro de Configuração da IAM Role')}
          {accountName && <span className="text-sm font-normal">({accountName})</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
            <div className="space-y-2">
              <p className="font-semibold text-destructive">
                {t('aws.trustRelationshipError', 'A IAM Role não confia no usuário da plataforma EVO')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('aws.trustRelationshipExplanation', 'O usuário')} <code className="bg-muted px-1 py-0.5 rounded text-xs">arn:aws:iam::{platformAccountId}:user/{platformUser}</code> {t('aws.cannotAssumeRole', 'não tem permissão para assumir a role')} <code className="bg-muted px-1 py-0.5 rounded text-xs">{roleName}</code> {t('aws.inAccount', 'na conta')} <code className="bg-muted px-1 py-0.5 rounded text-xs">{targetAccountId}</code>.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="font-semibold text-sm mb-3">
            🔧 {t('aws.howToFix', 'Como corrigir este problema')}:
          </div>
          <ol className="text-sm space-y-3 list-decimal list-inside text-muted-foreground">
            <li>{t('aws.step1AccessIAM', 'Acesse o AWS IAM Console na conta')} <strong>{targetAccountId}</strong></li>
            <li>{t('aws.step2FindRole', 'Localize a role')} <strong>{roleName}</strong></li>
            <li>{t('aws.step3ClickTrustRelationships', 'Clique na aba "Trust relationships" (Relações de confiança)')}</li>
            <li>{t('aws.step4EditTrustPolicy', 'Clique em "Edit trust policy" e substitua pelo JSON abaixo')}</li>
            <li>{t('aws.step5ReplaceExternalId', 'Substitua')} <code className="bg-muted px-1 py-0.5 rounded">SEU_EXTERNAL_ID_AQUI</code> {t('aws.step5ByExternalId', 'pelo External ID da sua conta')}</li>
            <li>{t('aws.step6Save', 'Salve a política e tente novamente')}</li>
          </ol>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">{t('aws.trustPolicyJson', 'Trust Policy JSON')}</div>
            <Button variant="outline" size="sm" onClick={handleCopyTrustPolicy}>
              <Copy className="h-4 w-4 mr-1" />
              {t('aws.copyTrustPolicy', 'Copiar Trust Policy')}
            </Button>
          </div>
          <div className="bg-muted rounded-lg p-4 overflow-x-auto">
            <pre className="text-xs font-mono whitespace-pre-wrap">{JSON.stringify(trustPolicy, null, 2)}</pre>
          </div>
        </div>

        <div className="flex justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/aws-settings')}>
            <RefreshCw className="h-4 w-4 mr-1" />
            {t('aws.viewSettings', 'Ver Configurações AWS')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open('https://console.aws.amazon.com/iam/', '_blank')}>
            <ExternalLink className="h-4 w-4 mr-1" />
            {t('aws.openIAMConsole', 'Abrir AWS IAM Console')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Azure-specific error component
function AzureRoleConfigError({ 
  errorMessage,
  accountName
}: { errorMessage: string; accountName?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Card className="border-blue-500 bg-blue-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-600">
          <Cloud className="h-5 w-5" />
          {t('azure.roleConfigError', 'Erro de Configuração Azure')}
          {accountName && <span className="text-sm font-normal">({accountName})</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-2">
              <p className="font-semibold text-blue-700 dark:text-blue-300">
                {t('azure.authenticationError', 'Erro de autenticação Azure')}
              </p>
              <p className="text-sm text-muted-foreground">
                {errorMessage}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="font-semibold text-sm mb-3">
            🔧 {t('azure.howToFix', 'Como corrigir este problema')}:
          </div>
          <ol className="text-sm space-y-3 list-decimal list-inside text-muted-foreground">
            <li>{t('azure.step1CheckCredentials', 'Verifique se as credenciais Azure estão corretas')}</li>
            <li>{t('azure.step2CheckPermissions', 'Verifique se o Service Principal tem as permissões necessárias')}</li>
            <li>{t('azure.step3CheckSubscription', 'Verifique se a subscription está ativa')}</li>
            <li>{t('azure.step4ReconnectOAuth', 'Se usando OAuth, tente reconectar sua conta Azure')}</li>
          </ol>
        </div>

        <div className="flex justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/azure-settings')}>
            <RefreshCw className="h-4 w-4 mr-1" />
            {t('azure.viewSettings', 'Ver Configurações Azure')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open('https://portal.azure.com/', '_blank')}>
            <ExternalLink className="h-4 w-4 mr-1" />
            {t('azure.openPortal', 'Abrir Azure Portal')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Re-export for backward compatibility
export { CloudRoleConfigError as AWSRoleConfigError };
