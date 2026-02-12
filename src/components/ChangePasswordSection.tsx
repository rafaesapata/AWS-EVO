import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Lock, Eye, EyeOff, Loader2 } from "lucide-react";

export default function ChangePasswordSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];
    if (password.length < 8) errors.push(t("changePassword.rules.minLength"));
    if (!/[A-Z]/.test(password)) errors.push(t("changePassword.rules.uppercase"));
    if (!/[a-z]/.test(password)) errors.push(t("changePassword.rules.lowercase"));
    if (!/[0-9]/.test(password)) errors.push(t("changePassword.rules.number"));
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push(t("changePassword.rules.special"));
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.currentPassword) {
        throw new Error(t("changePassword.errors.currentRequired"));
      }

      const validationErrors = validatePassword(formData.newPassword);
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join("\n"));
      }

      if (formData.newPassword !== formData.confirmPassword) {
        throw new Error(t("changePassword.errors.mismatch"));
      }

      if (formData.newPassword === formData.currentPassword) {
        throw new Error(t("changePassword.errors.samePassword"));
      }

      await cognitoAuth.changePassword(formData.currentPassword, formData.newPassword);

      toast({
        title: t("common.success"),
        description: t("changePassword.success"),
      });

      setFormData({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="glass border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-4 w-4" />
          {t("changePassword.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cp-current">{t("changePassword.currentPassword")}</Label>
            <div className="relative">
              <Input
                id="cp-current"
                type={showCurrentPassword ? "text" : "password"}
                placeholder={t("changePassword.currentPlaceholder")}
                value={formData.currentPassword}
                onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                required
                className="pr-10"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showCurrentPassword ? t("changePassword.hidePassword") : t("changePassword.showPassword")}
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cp-new">{t("changePassword.newPassword")}</Label>
            <div className="relative">
              <Input
                id="cp-new"
                type={showNewPassword ? "text" : "password"}
                placeholder={t("changePassword.newPlaceholder")}
                value={formData.newPassword}
                onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                required
                className="pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showNewPassword ? t("changePassword.hidePassword") : t("changePassword.showPassword")}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{t("changePassword.rules.hint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cp-confirm">{t("changePassword.confirmPassword")}</Label>
            <div className="relative">
              <Input
                id="cp-confirm"
                type={showConfirmPassword ? "text" : "password"}
                placeholder={t("changePassword.confirmPlaceholder")}
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
                className="pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showConfirmPassword ? t("changePassword.hidePassword") : t("changePassword.showPassword")}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="glass hover-glow w-full">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t("changePassword.changing")}
              </>
            ) : (
              t("changePassword.submit")
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
