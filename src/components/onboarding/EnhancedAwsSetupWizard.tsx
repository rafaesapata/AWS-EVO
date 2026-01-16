import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  ShieldCheck, 
  CloudCog,
  Globe,
  Zap,
  CheckCircle2
} from "lucide-react";
import CloudFormationDeploy from "@/components/dashboard/CloudFormationDeploy";

interface EnhancedAwsSetupWizardProps {
  onComplete: () => void;
  onSkip?: () => void;
}

/**
 * Enhanced AWS Setup Wizard - CloudFormation Only
 * 
 * SECURITY: This wizard ONLY supports CloudFormation + IAM Role authentication.
 * Direct IAM Access Keys are NOT supported.
 */
const EnhancedAwsSetupWizard = ({ onComplete, onSkip }: EnhancedAwsSetupWizardProps) => {
  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6">
      {/* Welcome Section */}
      <div className="text-center mb-8">
        <div className="w-24 h-24 bg-gradient-to-br from-primary to-primary/60 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
          <Zap className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-3xl font-semibold mb-3">Bem-vindo ao EVO Platform</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Conecte sua infraestrutura AWS de forma segura e comece a otimizar seus custos e segurança em minutos
        </p>
      </div>

      {/* Benefits Section */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6 text-center">
            <ShieldCheck className="w-10 h-10 text-primary mb-3 mx-auto" />
            <h3 className="font-semibold mb-2">100% Seguro</h3>
            <p className="text-sm text-muted-foreground">
              IAM Role com credenciais temporárias via STS AssumeRole - sem chaves estáticas
            </p>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6 text-center">
            <CloudCog className="w-10 h-10 text-primary mb-3 mx-auto" />
            <h3 className="font-semibold mb-2">Configuração em 1-Click</h3>
            <p className="text-sm text-muted-foreground">
              CloudFormation configura automaticamente todas as 90+ permissões necessárias
            </p>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6 text-center">
            <Globe className="w-10 h-10 text-primary mb-3 mx-auto" />
            <h3 className="font-semibold mb-2">Multi-Região</h3>
            <p className="text-sm text-muted-foreground">
              Monitore todas as suas regiões AWS simultaneamente de um único painel
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Security Highlights */}
      <Card className="border-green-500/20 bg-green-500/5 mb-6">
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-green-600" />
            Por que usar CloudFormation?
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-sm">Credenciais temporárias (expiram em 1 hora)</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-sm">External ID previne ataques de confused deputy</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-sm">100% Read-Only - nunca modifica seus recursos</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-sm">Auditável via CloudTrail</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-sm">Fácil revogação - basta deletar a stack</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-sm">Sem chaves de acesso para gerenciar</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CloudFormation Setup */}
      <Card className="border-border shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CloudCog className="w-6 h-6 text-primary" />
            <CardTitle className="text-xl">Conectar Conta AWS</CardTitle>
          </div>
          <CardDescription>
            Siga os 3 passos abaixo para conectar sua conta AWS de forma segura
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CloudFormationDeploy />
          
          {/* Complete button */}
          <div className="mt-6 pt-6 border-t border-border">
            <Button onClick={onComplete} className="w-full" size="lg">
              Concluir Configuração
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Skip Option */}
      {onSkip && (
        <div className="text-center pt-4">
          <Button variant="ghost" onClick={onSkip} className="text-muted-foreground hover:text-foreground">
            Pular configuração por agora →
          </Button>
        </div>
      )}
    </div>
  );
};

export default EnhancedAwsSetupWizard;
