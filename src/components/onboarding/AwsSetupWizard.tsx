import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  ShieldCheck, 
  CloudCog,
  Globe,
  Zap
} from "lucide-react";
import CloudFormationDeploy from "@/components/dashboard/CloudFormationDeploy";

interface AwsSetupWizardProps {
  onComplete: () => void;
  onSkip?: () => void;
}

/**
 * AWS Setup Wizard - CloudFormation Only
 * 
 * SECURITY: This wizard ONLY supports CloudFormation + IAM Role authentication.
 * Direct IAM Access Keys are NOT supported.
 */
const AwsSetupWizard = ({ onComplete, onSkip }: AwsSetupWizardProps) => {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Welcome Section */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary/60 rounded-full flex items-center justify-center mx-auto mb-4">
          <Zap className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Configure sua conta AWS</h2>
        <p className="text-muted-foreground">
          Conecte sua infraestrutura AWS de forma segura usando CloudFormation
        </p>
      </div>

      {/* Benefits Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card className="border-border">
          <CardContent className="pt-6">
            <ShieldCheck className="w-8 h-8 text-primary mb-2" />
            <h3 className="font-semibold mb-1">Seguro</h3>
            <p className="text-sm text-muted-foreground">
              IAM Role com credenciais temporárias - sem chaves de acesso estáticas
            </p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-6">
            <CloudCog className="w-8 h-8 text-primary mb-2" />
            <h3 className="font-semibold mb-1">Automático</h3>
            <p className="text-sm text-muted-foreground">
              CloudFormation configura todas as permissões necessárias automaticamente
            </p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-6">
            <Globe className="w-8 h-8 text-primary mb-2" />
            <h3 className="font-semibold mb-1">Multi-região</h3>
            <p className="text-sm text-muted-foreground">
              Monitore múltiplas regiões AWS simultaneamente
            </p>
          </CardContent>
        </Card>
      </div>

      {/* CloudFormation Setup */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CloudCog className="w-5 h-5 text-primary" />
            <CardTitle>Conectar via CloudFormation</CardTitle>
          </div>
          <CardDescription>
            Método recomendado: configuração automática e segura com IAM Role
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CloudFormationDeploy />
          
          {/* Complete button - user clicks after successful connection */}
          <div className="mt-6 pt-6 border-t border-border">
            <Button onClick={onComplete} className="w-full">
              Concluir Configuração
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Skip Option */}
      {onSkip && (
        <div className="text-center">
          <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
            Pular por agora
          </Button>
        </div>
      )}
    </div>
  );
};

export default AwsSetupWizard;
