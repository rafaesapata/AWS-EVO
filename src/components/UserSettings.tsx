import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import MFASettings from "@/components/MFASettings";

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

  useEffect(() => {
    loadUserSettings();
  }, []);

  const loadUserSettings = async () => {
    const user = await cognitoAuth.getCurrentUser();
    if (!user) return;

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
  };

  const handleSave = async () => {
    setLoading(true);
    const user = await cognitoAuth.getCurrentUser();
    if (!user) return;

    const result = await apiClient.update('profiles', {
      language, timezone
    }, { eq: { id: user.username } });

    if (result.error) {
      toast({
        title: t('common.error'),
        description: result.error,
        variant: "destructive"
      });
    } else {
      i18n.changeLanguage(language);
      toast({
        title: t('common.success'),
        description: t('settings.saved')
      });
    }
    setLoading(false);
  };

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

      <MFASettings />
    </div>
  );
}
