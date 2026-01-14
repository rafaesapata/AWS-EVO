import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ExternalLink, Cloud } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface PermissionError {
  resourceType?: string;
  service?: string;
  region?: string;
  error: string;
  missingPermissions: string[];
  cloudProvider?: 'AWS' | 'AZURE';
}

interface CloudPermissionErrorProps {
  errors: PermissionError[];
  title?: string;
  description?: string;
  showNavigateButton?: boolean;
  cloudProvider?: 'AWS' | 'AZURE';
}

export function CloudPermissionError({ 
  errors, 
  title,
  description,
  showNavigateButton = true,
  cloudProvider = 'AWS'
}: CloudPermissionErrorProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (!errors || errors.length === 0) return null;

  // Remove erros duplicados baseado em tipo+região
  const uniqueErrors = errors.reduce((acc: PermissionError[], current) => {
    const key = `${current.resourceType}-${current.region}`;
    if (!acc.find(e => `${e.resourceType}-${e.region}` === key)) {
      acc.push(current);
    }
    return acc;
  }, []);

  // Detectar se são erros de conectividade ao invés de permissões
  const hasConnectivityErrors = uniqueErrors.some(error => 
    error.error?.includes('dns error') || 
    error.error?.includes('failed to lookup') ||
    error.error?.includes('Name or service not known') ||
    error.error?.includes('client error (Connect)')
  );
  
  // Detectar se há permissões realmente faltantes
  const hasRealPermissionErrors = uniqueErrors.some(error => 
    error.missingPermissions && error.missingPermissions.length > 0
  );

  // Se só há erros de conectividade e nenhuma permissão faltante, não mostrar nada
  if (hasConnectivityErrors && !hasRealPermissionErrors) {
    return null;
  }

  // Configurações por provider
  const providerConfig = {
    AWS: {
      title: t('cloud.awsPermissionsMissing', '⚠️ Permissões AWS Faltantes'),
      description: t('cloud.awsPermissionsDescription', 'Alguns recursos não puderam ser acessados devido a permissões faltantes. Configure as permissões no IAM da AWS.'),
      settingsPath: '/aws-settings',
      settingsLabel: t('cloud.goToAwsSettings', 'Ir para Configurações AWS'),
      docsUrl: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html',
      docsLabel: t('cloud.awsPermissionsGuide', 'Guia de Permissões AWS'),
      color: 'orange',
    },
    AZURE: {
      title: t('cloud.azurePermissionsMissing', '⚠️ Permissões Azure Faltantes'),
      description: t('cloud.azurePermissionsDescription', 'Alguns recursos não puderam ser acessados devido a permissões faltantes. Configure as permissões no Azure RBAC.'),
      settingsPath: '/azure-settings',
      settingsLabel: t('cloud.goToAzureSettings', 'Ir para Configurações Azure'),
      docsUrl: 'https://docs.microsoft.com/azure/role-based-access-control/',
      docsLabel: t('cloud.azurePermissionsGuide', 'Guia de Permissões Azure'),
      color: 'blue',
    },
  };

  const config = providerConfig[cloudProvider];
  const displayTitle = title || config.title;
  const displayDescription = description || config.description;

  const colorClasses = cloudProvider === 'AZURE' 
    ? {
        alert: 'border-blue-500 bg-blue-50 dark:bg-blue-950/20',
        icon: 'text-blue-600',
        title: 'text-blue-900 dark:text-blue-100',
        text: 'text-blue-800 dark:text-blue-200',
        border: 'border-blue-200 dark:border-blue-800',
        badge: 'bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50',
      }
    : {
        alert: 'border-orange-500 bg-orange-50 dark:bg-orange-950/20',
        icon: 'text-orange-600',
        title: 'text-orange-900 dark:text-orange-100',
        text: 'text-orange-800 dark:text-orange-200',
        border: 'border-orange-200 dark:border-orange-800',
        badge: 'bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 dark:hover:bg-orange-900/50',
      };

  return (
    <Alert variant="destructive" className={colorClasses.alert}>
      <div className="flex items-start gap-3">
        <Cloud className={`h-5 w-5 ${colorClasses.icon} mt-0.5`} />
        <div className="flex-1">
          <h3 className={`font-semibold ${colorClasses.title} mb-2`}>
            {displayTitle}
          </h3>
          <p className={`text-sm ${colorClasses.text} mb-3`}>
            {displayDescription}
          </p>
          <div className="space-y-2">
            {uniqueErrors.filter(error => error.missingPermissions && error.missingPermissions.length > 0).map((error, idx) => (
              <div key={idx} className={`bg-white dark:bg-gray-900 rounded p-3 border ${colorClasses.border}`}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {error.resourceType && (
                    <Badge variant="outline" className="font-mono text-xs">
                      {error.resourceType.toUpperCase()}
                    </Badge>
                  )}
                  {error.service && (
                    <Badge variant="outline" className="font-mono text-xs">
                      {error.service}
                    </Badge>
                  )}
                  {error.region && (
                    <span className="text-xs text-muted-foreground">{error.region}</span>
                  )}
                  {error.cloudProvider && (
                    <Badge variant="secondary" className="text-xs">
                      {error.cloudProvider}
                    </Badge>
                  )}
                </div>
                {error.missingPermissions?.length > 0 && (
                  <div className="mt-2">
                    <p className={`text-xs font-semibold ${colorClasses.title} mb-1`}>
                      {t('cloud.requiredPermissions', 'Permissões necessárias:')}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {error.missingPermissions.map((perm, i) => (
                        <code 
                          key={i} 
                          className={`text-xs ${colorClasses.badge} px-2 py-1 rounded cursor-pointer transition-colors`}
                          onClick={() => {
                            navigator.clipboard.writeText(perm);
                          }}
                          title={t('cloud.clickToCopy', 'Clique para copiar')}
                        >
                          {perm}
                        </code>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      💡 {t('cloud.clickToCopyHint', 'Clique em qualquer permissão para copiá-la')}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            {showNavigateButton && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(config.settingsPath)}
              >
                {config.settingsLabel}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(config.docsUrl, '_blank')}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              {config.docsLabel}
            </Button>
          </div>
        </div>
      </div>
    </Alert>
  );
}

// Re-export for backward compatibility
export { CloudPermissionError as AWSPermissionError };
