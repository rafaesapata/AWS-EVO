import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, LogOut, Mail, UserCog } from "lucide-react";
import evoLogo from "@/assets/evo-logo.png";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { useTranslation } from "react-i18next";

interface LicenseBlockedScreenProps {
  reason: "expired" | "no_seats" | "no_license" | "seats_exceeded";
  message: string;
}

export default function LicenseBlockedScreen({ reason, message }: LicenseBlockedScreenProps) {
  const { t } = useTranslation();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await cognitoAuth.signOut();
      window.location.href = '/auth';
    } catch (error) {
      console.error('Logout error:', error);
      window.location.href = '/auth';
    }
  };

  const getTitle = () => {
    switch (reason) {
      case "expired":
        return t('license.blocked.expired');
      case "no_seats":
        return t('license.blocked.noSeats');
      case "seats_exceeded":
        return t('license.blocked.seatsExceeded');
      case "no_license":
        return t('license.blocked.noLicense');
      default:
        return t('license.blocked.accessBlocked');
    }
  };

  const getReasonExplanation = () => {
    switch (reason) {
      case "expired":
        return "A licença da sua organização expirou. Entre em contato com o administrador para renovação.";
      case "no_seats":
        return "Você não possui um assento de licença atribuído. Entre em contato com o administrador da sua organização para solicitar acesso.";
      case "seats_exceeded":
        return "O limite de assentos da licença foi excedido. Entre em contato com o administrador para liberar ou adquirir mais assentos.";
      case "no_license":
        return "Sua organização ainda não possui uma licença configurada. Entre em contato com o administrador para configurar a licença.";
      default:
        return "Acesso bloqueado. Entre em contato com o administrador da sua organização.";
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={evoLogo} alt="EVO Logo" className="h-16 w-auto" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 text-destructive">
              <AlertTriangle className="h-6 w-6" />
              <CardTitle className="text-2xl">{getTitle()}</CardTitle>
            </div>
            <CardDescription className="text-base">
              {message || getReasonExplanation()}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Main message for non-admin users */}
          <div className="bg-muted/50 p-4 rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <UserCog className="h-5 w-5" />
              <h3 className="font-semibold">O que fazer?</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Entre em contato com o administrador da sua organização para:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside ml-2">
              {reason === "no_seats" && (
                <li>Solicitar a atribuição de um assento de licença para você</li>
              )}
              {reason === "expired" && (
                <li>Renovar a licença da organização</li>
              )}
              {reason === "seats_exceeded" && (
                <>
                  <li>Liberar assentos de usuários inativos</li>
                  <li>Adquirir mais assentos de licença</li>
                </>
              )}
              {reason === "no_license" && (
                <>
                  <li>Configurar o Customer ID da licença</li>
                  <li>Vincular a licença à organização</li>
                </>
              )}
            </ul>
          </div>

          {/* Contact info */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>Dúvidas sobre licenciamento?</span>
            </div>
            <p className="text-sm">
              Entre em contato com{" "}
              <a 
                href="mailto:contato@nuevacore.com" 
                className="text-primary hover:underline font-medium"
              >
                contato@nuevacore.com
              </a>
            </p>
          </div>

          {/* Logout button */}
          <div className="pt-2">
            <Button 
              className="w-full" 
              variant="outline"
              size="lg"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? (
                <>
                  <LogOut className="h-4 w-4 mr-2 animate-spin" />
                  Saindo...
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sair e usar outra conta
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
