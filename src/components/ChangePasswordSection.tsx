import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/integrations/aws/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_PASSWORD_LENGTH = 8;
const SPECIAL_CHARS_REGEX = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;

interface PasswordInputProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}

function PasswordInput({ id, label, placeholder, value, onChange, autoComplete }: PasswordInputProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="pr-10 glass border-primary/10 focus:border-[#003C7D]/30 focus:ring-[#003C7D]/20 transition-all"
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={visible ? t("changePassword.hidePassword") : t("changePassword.showPassword")}
        >
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

// Password strength indicator
function PasswordStrength({ password }: { password: string }) {
  const { t } = useTranslation();

  const rules = useMemo(() => [
    { key: 'minLength', label: t("changePassword.rules.minLength"), met: password.length >= MIN_PASSWORD_LENGTH },
    { key: 'uppercase', label: t("changePassword.rules.uppercase"), met: /[A-Z]/.test(password) },
    { key: 'lowercase', label: t("changePassword.rules.lowercase"), met: /[a-z]/.test(password) },
    { key: 'number', label: t("changePassword.rules.number"), met: /[0-9]/.test(password) },
    { key: 'special', label: t("changePassword.rules.special"), met: SPECIAL_CHARS_REGEX.test(password) },
  ], [password, t]);

  const metCount = rules.filter(r => r.met).length;
  const strength = metCount === 0 ? 0 : metCount <= 2 ? 1 : metCount <= 4 ? 2 : 3;
  const strengthColors = ['bg-gray-200 dark:bg-gray-700', 'bg-destructive', 'bg-warning', 'bg-success'];
  const strengthLabels = [
    '',
    t("changePassword.strength.weak", "Fraca"),
    t("changePassword.strength.medium", "Média"),
    t("changePassword.strength.strong", "Forte"),
  ];

  if (!password) return null;

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
      {/* Strength bar */}
      <div className="space-y-1.5">
        <div className="flex gap-1">
          {[1, 2, 3].map((level) => (
            <div
              key={level}
              className={cn(
                "h-1 flex-1 rounded-full transition-all duration-300",
                strength >= level ? strengthColors[strength] : "bg-gray-200 dark:bg-gray-700"
              )}
            />
          ))}
        </div>
        {strength > 0 && (
          <p className={cn(
            "text-[10px] font-medium",
            strength === 1 && "text-destructive",
            strength === 2 && "text-warning",
            strength === 3 && "text-success",
          )}>
            {strengthLabels[strength]}
          </p>
        )}
      </div>

      {/* Rules checklist */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {rules.map((rule) => (
          <div key={rule.key} className="flex items-center gap-1.5">
            {rule.met ? (
              <Check className="h-3 w-3 text-success shrink-0" />
            ) : (
              <X className="h-3 w-3 text-muted-foreground/40 shrink-0" />
            )}
            <span className={cn(
              "text-[10px] transition-colors",
              rule.met ? "text-success" : "text-muted-foreground/60"
            )}>
              {rule.label}
            </span>
          </div>
        ))}
      </div>
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <PasswordInput
        id="cp-current"
        label={t("changePassword.currentPassword")}
        placeholder={t("changePassword.currentPlaceholder")}
        value={formData.currentPassword}
        onChange={updateField("currentPassword")}
        autoComplete="current-password"
      />

      <div className="space-y-3">
        <PasswordInput
          id="cp-new"
          label={t("changePassword.newPassword")}
          placeholder={t("changePassword.newPlaceholder")}
          value={formData.newPassword}
          onChange={updateField("newPassword")}
          autoComplete="new-password"
        />
        <PasswordStrength password={formData.newPassword} />
      </div>

      <PasswordInput
        id="cp-confirm"
        label={t("changePassword.confirmPassword")}
        placeholder={t("changePassword.confirmPlaceholder")}
        value={formData.confirmPassword}
        onChange={updateField("confirmPassword")}
        autoComplete="new-password"
      />

      {/* Mismatch warning */}
      {formData.confirmPassword && formData.newPassword !== formData.confirmPassword && (
        <p className="text-[10px] text-destructive flex items-center gap-1 animate-in fade-in duration-200">
          <X className="h-3 w-3" />
          {t("changePassword.errors.mismatch")}
        </p>
      )}

      <Button
        type="submit"
        disabled={loading || !formData.currentPassword || !formData.newPassword || !formData.confirmPassword}
        className="w-full bg-gradient-to-r from-[#003C7D] to-[#008CFF] hover:from-[#003C7D]/90 hover:to-[#008CFF]/90 text-white shadow-md hover:shadow-lg transition-all duration-200"
      >
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
  );
}
