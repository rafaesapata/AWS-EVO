import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2, Globe, Clock, Shield } from "lucide-react";
import MFASettings from "@/components/MFASettings";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const TIMEZONES = [
  'UTC', 'America/Sao_Paulo', 'America/New_York', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Shanghai',
  'Australia/Sydney'
];

export default function UserSettings() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [language, setLanguage] = useState(i18n.language);
  const [timezone, setTimezone] = useState('UTC');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUserSettings();
  }, []);

  const loadUserSettings = async () => {
    try {
      setInitialLoading(true);
      setError(null);
      
      const user = await cognitoAuth.getCurrentUser();
      if (!user) {
        setError('Usuário não autenticado');
        return;
      }

      try {
        const profile = await apiClient.select('profiles', {
          select: 'language, timezone',
          eq: { user_id: user.username },
          single: true
        });

        if (profile.data) {
          if (profile.data.language) {
            setLanguage(profile.data.language);
            i18n.changeLanguage(profile.data.language);
          }
          if (profile.data.timezone) {
            setTimezone(profile.data.timezone);
          }
        }
      } catch (profileError) {
        console.warn('Could not load user profile settings:', profileError);
      }
    } catch (error) {
      console.error('Error loading user settings:', error);
      setError(error instanceof Error ? error.message : 'Erro ao carregar configurações');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const user = await cognitoAuth.getCurrentUser();
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      const result = await apiClient.update('profiles', {
        language, 
        timezone
      }, { eq: { user_id: user.username } });

      if (result.error) {
        throw new Error(result.error.message || 'Erro ao salvar configurações');
      }

      i18n.changeLanguage(language);
      toast({
        title: t('common.success'),
        description: t('settings.saved')
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao salvar configurações';
      setError(errorMessage);
      toast({
        title: t('common.error'),
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="space-y-6">
        <div className="glass rounded-xl p-6 border border-primary/10">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            {t('settings.loading', 'Carregando configurações...')}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={loadUserSettings} variant="outline" className="glass">
          {t('settings.retry', 'Tentar Novamente')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Preferences Section */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="glass rounded-xl p-4 border border-primary/10 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-[#003C7D]/10 rounded-lg">
                <Globe className="h-3.5 w-3.5 text-[#003C7D]" />
              </div>
              <Label className="text-xs text-muted-foreground">{t('settings.language')}</Label>
            </div>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="glass border-primary/10 focus:border-[#003C7D]/30 focus:ring-[#003C7D]/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{t('settings.english')}</SelectItem>
                <SelectItem value="pt">{t('settings.portuguese')}</SelectItem>
                <SelectItem value="es">{t('settings.spanish')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="glass rounded-xl p-4 border border-primary/10 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-[#003C7D]/10 rounded-lg">
                <Clock className="h-3.5 w-3.5 text-[#003C7D]" />
              </div>
              <Label className="text-xs text-muted-foreground">{t('settings.timezone')}</Label>
            </div>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="glass border-primary/10 focus:border-[#003C7D]/30 focus:ring-[#003C7D]/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map(tz => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={loading}
          className="w-full bg-gradient-to-r from-[#003C7D] to-[#008CFF] hover:from-[#003C7D]/90 hover:to-[#008CFF]/90 text-white shadow-md hover:shadow-lg transition-all duration-200"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {t('common.loading')}
            </>
          ) : (
            t('settings.save')
          )}
        </Button>
      </div>

      <Separator className="bg-border/50" />

      {/* MFA Section Header */}
      <div className="flex items-center gap-2.5">
        <div className="p-2 bg-[#003C7D]/10 rounded-xl">
          <Shield className="h-4 w-4 text-[#003C7D]" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-foreground">{t('settings.securitySection', 'Segurança')}</h3>
          <p className="text-xs text-muted-foreground">{t('settings.securityDesc', 'Gerencie a autenticação multi-fator')}</p>
        </div>
      </div>

      <ErrorBoundary level="component" context="MFASettings">
        <MFASettings />
      </ErrorBoundary>
    </div>
  );
}
