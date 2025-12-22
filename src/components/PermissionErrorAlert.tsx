import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Copy, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

interface PermissionErrorProps {
  missingPermissions: string[];
  errorMessage?: string;
  accountName?: string;
}

export default function PermissionErrorAlert({ 
  missingPermissions, 
  errorMessage,
  accountName 
}: PermissionErrorProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyPermissions = () => {
    const permissionsText = missingPermissions.join('\n');
    navigator.clipboard.writeText(permissionsText);
    setCopied(true);
    toast.success('Permissões copiadas para a área de transferência');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyIAMPolicy = () => {
    const iamPolicy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: missingPermissions,
          Resource: "*"
        }
      ]
    };
    
    const policyText = JSON.stringify(iamPolicy, null, 2);
    navigator.clipboard.writeText(policyText);
    toast.success('Política IAM copiada para a área de transferência');
  };

  if (!missingPermissions || missingPermissions.length === 0) {
    return null;
  }

  return (
    <Card className="border-orange-500 bg-orange-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
          <AlertCircle className="h-5 w-5" />
          Permissões AWS Insuficientes
          {accountName && <span className="text-sm font-normal">({accountName})</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMessage && (
          <div className="bg-muted rounded-lg p-3">
            <div className="text-sm font-semibold mb-1">Mensagem de Erro:</div>
            <div className="text-sm text-muted-foreground font-mono">{errorMessage}</div>
          </div>
        )}
        
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">
              Permissões Necessárias ({missingPermissions.length})
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleCopyPermissions}
              >
                {copied ? (
                  <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4 mr-1" />
                )}
                Copiar Lista
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleCopyIAMPolicy}
              >
                <Copy className="h-4 w-4 mr-1" />
                Copiar Política IAM
              </Button>
            </div>
          </div>
          
          <div className="bg-muted rounded-lg p-4 max-h-60 overflow-y-auto">
            <div className="space-y-2">
              {missingPermissions.map((permission, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center gap-2 p-2 bg-background rounded border"
                >
                  <code className="text-sm font-mono flex-1">{permission}</code>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="font-semibold text-sm mb-2">📋 Como adicionar estas permissões:</div>
          <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
            <li>Acesse o AWS IAM Console</li>
            <li>Localize o usuário IAM configurado ({accountName || 'conta AWS'})</li>
            <li>Clique em "Add permissions" → "Attach policies directly"</li>
            <li>Ou clique em "Copiar Política IAM" acima e crie uma nova política inline</li>
            <li>Cole a política JSON e salve</li>
            <li>Retorne aqui e execute a validação novamente</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}