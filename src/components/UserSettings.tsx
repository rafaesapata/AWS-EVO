import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
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

      // Try to load user profile settings
      try {
        const profile = await apiClient.select('profiles', {
          select: 'language, timezone',
          eq: { id: user.username },
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
        // Don't show error for missing profile - use defaults
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
      }, { eq: { id: user.username } });

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
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Carregando configurações...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error}
          </AlertDescription>
        </Alert>
        <Button onClick={loadUserSettings} variant="outline">
          Tentar Novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('settings.language')}</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{t('settings.english')}</SelectItem>
                <SelectItem value="pt">{t('settings.portuguese')}</SelectItem>
                <SelectItem value="es">{t('settings.spanish')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('settings.timezone')}</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map(tz => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleSave} disabled={loading}>
            {loading ? t('common.loading') : t('settings.save')}
          </Button>
        </CardContent>
      </Card>

      <ErrorBoundary level="component" context="MFASettings">
        <MFASettings />
      </ErrorBoundary>
    </div>
  );
}
