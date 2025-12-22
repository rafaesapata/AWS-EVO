import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ExternalLink, Key, RefreshCw } from "lucide-react";
import evoLogo from "@/assets/evo-logo.png";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface LicenseBlockedScreenProps {
  reason: "expired" | "no_seats" | "no_license" | "seats_exceeded";
  message: string;
}

export default function LicenseBlockedScreen({ reason, message }: LicenseBlockedScreenProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [customerId, setCustomerId] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  

  const handleLinkCustomerId = async () => {
    if (!customerId.trim()) {
      toast({
        title: t('license.blocked.customerIdRequired'),
        description: t('license.blocked.customerIdRequiredDesc'),
        variant: "destructive",
      });
      return;
    }

    setIsValidating(true);

    try {
      const session = await cognitoAuth.getCurrentSession();
      if (!session) throw new Error(t('licenseBlocked.notAuthenticated'));

      const result = await apiClient.invoke("validate-license", {
        customer_id: customerId
      });
      const { data, error } = { data: result.data, error: result.error };

      
      if (!data.valid) throw new Error(t('licenseBlocked.invalidOrExpired'));

      toast({
        title: t('licenseBlocked.validatedSuccess'),
        description: t('licenseBlocked.redirecting'),
      });

      // Wait a bit and reload to re-check license
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    } catch (error: any) {
      toast({
        title: t('licenseBlocked.validationError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-2xl w-full">
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
              {message}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <h3 className="font-semibold text-sm">{t('license.blocked.whySeeing')}</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              {reason === "expired" && (
                <>
                  <li>{t('license.blocked.expiredReason1')}</li>
                  <li>{t('license.blocked.expiredReason2')}</li>
                </>
              )}
              {reason === "no_seats" && (
                <>
                  <li>{t('license.blocked.noSeatsReason1')}</li>
                  <li>{t('license.blocked.noSeatsReason2')}</li>
                  <li>{t('license.blocked.noSeatsReason3')}</li>
                </>
              )}
              {reason === "seats_exceeded" && (
                <>
                  <li>{t('license.blocked.seatsExceededReason1')}</li>
                  <li>{t('license.blocked.seatsExceededReason2')}</li>
                  <li>{t('license.blocked.seatsExceededReason3')}</li>
                  <li>{t('license.blocked.seatsExceededReason4')}</li>
                </>
              )}
              {reason === "no_license" && (
                <>
                  <li>{t('license.blocked.noLicenseReason1')}</li>
                  <li>{t('license.blocked.noLicenseReason2')}</li>
                </>
              )}
            </ul>
          </div>

          {reason === "no_license" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer-id">{t('license.blocked.haveCustomerId')}</Label>
                <Input
                  id="customer-id"
                  placeholder={t('license.blocked.customerIdPlaceholder')}
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  disabled={isValidating}
                />
                <p className="text-xs text-muted-foreground">
                  {t('license.blocked.customerIdHelp')}
                </p>
              </div>
              <Button 
                className="w-full" 
                size="lg"
                onClick={handleLinkCustomerId}
                disabled={isValidating}
              >
                {isValidating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    {t('license.blocked.validating')}
                  </>
                ) : (
                  <>
                    <Key className="h-4 w-4 mr-2" />
                    {t('license.blocked.linkAndValidate')}
                  </>
                )}
              </Button>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">{t('license.blocked.or')}</span>
                </div>
              </div>

              <Button 
                className="w-full" 
                size="lg"
                variant="outline"
                onClick={() => window.open("https://www.nuevacore.com/products/evo", "_blank")}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                {t('license.blocked.purchaseNew')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                {t('license.blocked.contactTeam')}
              </p>
              <Button 
                className="w-full" 
                size="lg"
                onClick={() => window.open("https://www.nuevacore.com/products/evo", "_blank")}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                {t('license.blocked.purchaseOrRenew')}
              </Button>
            </div>
          )}

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              {t('license.blocked.questions')} <a href="mailto:contato@nuevacore.com" className="text-primary hover:underline">contato@nuevacore.com</a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}