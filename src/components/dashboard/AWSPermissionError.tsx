import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PermissionError {
  resourceType?: string;
  service?: string;
  region?: string;
  error: string;
  missingPermissions: string[];
}

interface AWSPermissionErrorProps {
  errors: PermissionError[];
  title?: string;
  description?: string;
  showNavigateButton?: boolean;
}

export function AWSPermissionError({ 
  errors, 
  title,
  description,
  showNavigateButton = true
}: AWSPermissionErrorProps) {
  const navigate = useNavigate();

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

  // Ajustar título e descrição se forem erros de permissão
  const displayTitle = title || "⚠️ Permissões AWS Faltantes";
  const displayDescription = description || "Alguns recursos não puderam ser acessados devido a permissões faltantes. Configure as permissões no IAM da AWS.";

  return (
    <Alert variant="destructive" className="border-orange-500 bg-orange-50 dark:bg-orange-950/20">
      <AlertTriangle className="h-5 w-5 text-orange-600" />
      <div className="ml-3 flex-1">
        <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">
          {displayTitle}
        </h3>
        <p className="text-sm text-orange-800 dark:text-orange-200 mb-3">
          {displayDescription}
        </p>
        <div className="space-y-2">
          {uniqueErrors.filter(error => error.missingPermissions && error.missingPermissions.length > 0).map((error, idx) => (
            <div key={idx} className="bg-white dark:bg-gray-900 rounded p-3 border border-orange-200 dark:border-orange-800">
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
              </div>
              {error.missingPermissions?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-orange-900 dark:text-orange-100 mb-1">
                    Permissões necessárias:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {error.missingPermissions.map((perm, i) => (
                      <code 
                        key={i} 
                        className="text-xs bg-orange-100 dark:bg-orange-900/30 px-2 py-1 rounded cursor-pointer hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"
                        onClick={() => {
                          navigator.clipboard.writeText(perm);
                        }}
                        title="Clique para copiar"
                      >
                        {perm}
                      </code>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    💡 Clique em qualquer permissão para copiá-la
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
              onClick={() => navigate('/aws-settings')}
            >
              Ir para Configurações AWS
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open('https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html', '_blank')}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Guia de Permissões AWS
          </Button>
        </div>
      </div>
    </Alert>
  );
}
