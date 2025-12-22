import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const SetupInstructions = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const awsPolicy = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "cloudtrail:LookupEvents",
          "cloudtrail:GetTrail",
          "cloudtrail:GetTrailStatus",
          "cloudtrail:ListTrails"
        ],
        Resource: "*"
      }
    ]
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(awsPolicy, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="shadow-card overflow-hidden">
        <CollapsibleTrigger className="w-full">
          <Alert className="mb-0 border-0 rounded-none hover:bg-muted/30 transition-colors cursor-pointer">
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription className="flex items-center justify-between">
              <span className="font-medium">
                {isOpen ? 'Ocultar' : 'Ver'} instruções de configuração AWS
              </span>
              <span className="text-xs text-muted-foreground">
                Clique para {isOpen ? 'ocultar' : 'expandir'}
              </span>
            </AlertDescription>
          </Alert>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-6 border-t border-border space-y-4">
            <div>
              <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
                Criar usuário IAM
              </h3>
              <p className="text-sm text-muted-foreground ml-8 mb-2">
                No console AWS, acesse IAM → Users → Create user
              </p>
              <p className="text-sm text-muted-foreground ml-8">
                Nome sugerido: 'evo-platform' (não selecione tipo de acesso nesta etapa)
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
                Anexar política de permissões
              </h3>
              <p className="text-sm text-muted-foreground ml-8 mb-2">
                Em 'Set permissions', selecione 'Attach policies directly' e crie/anexe a seguinte política JSON:
              </p>
              <div className="ml-8 relative">
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2 z-10"
                  onClick={copyToClipboard}
                >
                  {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                </Button>
                <pre className="bg-muted p-4 rounded text-xs overflow-x-auto border border-border">
                  {JSON.stringify(awsPolicy, null, 2)}
                </pre>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm">3</span>
                Gerar chaves de acesso
              </h3>
              <p className="text-sm text-muted-foreground ml-8 mb-2">
                Após criar o usuário, clique nele e vá em 'Security credentials'
              </p>
              <p className="text-sm text-muted-foreground ml-8 mb-2">
                Role até 'Access keys' → Create access key → Selecione 'Application running outside AWS'
              </p>
              <p className="text-sm text-muted-foreground ml-8 font-medium text-warning">
                ⚠️ Copie as credenciais imediatamente - a Secret Key só é exibida uma vez
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm">4</span>
                Exportar eventos CloudTrail
              </h3>
              <p className="text-sm text-muted-foreground ml-8">
                Use AWS CLI ou o console para exportar eventos em formato JSON:
              </p>
              <pre className="ml-8 mt-2 bg-muted p-3 rounded text-xs border border-border">
                aws cloudtrail lookup-events --max-results 50 {`>`} events.json
              </pre>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm">5</span>
                Upload para análise
              </h3>
              <p className="text-sm text-muted-foreground ml-8">
                Faça upload do arquivo JSON exportado usando o botão acima para análise automática com IA
              </p>
            </div>

            <Alert className="ml-8 bg-primary/5 border-primary/20">
              <Info className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm">
                <strong>Segurança:</strong> Esta ferramenta processa os eventos localmente. Nenhum dado é enviado 
                para servidores externos além da análise de IA que não armazena seus dados.
              </AlertDescription>
            </Alert>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export default SetupInstructions;