import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/integrations/aws/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Lock, Eye, EyeOff, Loader2 } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;
const SPECIAL_CHARS_REGEX = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;

interface PasswordInputProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: string;
}

function PasswordInput({ id, label, placeholder, value, onChange, autoComplete, hint }: PasswordInputProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="pr-10"
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={visible ? t("changePassword.hidePassword") : t("changePassword.showPassword")}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const INITIAL_FORM = { currentPassword: "", newPassword: "", confirmPassword: "" };

export default function ChangePasswordSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);

  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];
    if (password.length < MIN_PASSWORD_LENGTH) errors.push(t("changePassword.rules.minLength"));
    if (!/[A-Z]/.test(password)) errors.push(t("changePassword.rules.uppercase"));
    if (!/[a-z]/.test(password)) errors.push(t("changePassword.rules.lowercase"));
    if (!/[0-9]/.test(password)) errors.push(t("changePassword.rules.number"));
    if (!SPECIAL_CHARS_REGEX.test(password)) errors.push(t("changePassword.rules.special"));
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

      const result = await apiClient.invoke('change-password', {
        body: {
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
        },
      });

      if ('error' in result && result.error) {
        throw new Error(result.error.message || t("changePassword.errors.generic"));
      }

      toast({
        title: t("common.success"),
        description: t("changePassword.success"),
      });

      setFormData(INITIAL_FORM);
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

  const updateField = (field: keyof typeof formData) => (value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
          <PasswordInput
            id="cp-current"
            label={t("changePassword.currentPassword")}
            placeholder={t("changePassword.currentPlaceholder")}
            value={formData.currentPassword}
            onChange={updateField("currentPassword")}
            autoComplete="current-password"
          />
          <PasswordInput
            id="cp-new"
            label={t("changePassword.newPassword")}
            placeholder={t("changePassword.newPlaceholder")}
            value={formData.newPassword}
            onChange={updateField("newPassword")}
            autoComplete="new-password"
            hint={t("changePassword.rules.hint")}
          />
          <PasswordInput
            id="cp-confirm"
            label={t("changePassword.confirmPassword")}
            placeholder={t("changePassword.confirmPlaceholder")}
            value={formData.confirmPassword}
            onChange={updateField("confirmPassword")}
            autoComplete="new-password"
          />
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
