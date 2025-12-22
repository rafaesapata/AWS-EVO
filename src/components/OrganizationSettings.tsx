import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useToast } from "@/hooks/use-toast";
import { Building2, Save } from "lucide-react";
import { Badge } from "./ui/badge";

interface Organization {
  id: string;
  name: string;
  domain: string;
  is_active: boolean;
  settings: any;
  default_language?: string;
  default_timezone?: string;
}

const TIMEZONES = [
  'UTC', 'America/Sao_Paulo', 'America/New_York', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Shanghai',
  'Australia/Sydney'
];

export default function OrganizationSettings() {
  const { t } = useTranslation();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [orgName, setOrgName] = useState("");
  const [defaultLanguage, setDefaultLanguage] = useState("en");
  const [defaultTimezone, setDefaultTimezone] = useState("UTC");
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadOrganization();
    checkOrgAdminStatus();
  }, []);

  const checkOrgAdminStatus = async () => {
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) return;

      // Check user roles via AWS API
      const roles = await apiClient.get('/user/roles');
      const hasAdminRole = roles?.some((role: any) => 
        ['org_admin', 'super_admin'].includes(role.role)
      );
      
      setIsOrgAdmin(hasAdminRole);
    } catch (error) {
      console.error('Error checking admin status:', error);
      setIsOrgAdmin(false);
    }
  };

  const loadOrganization = async () => {
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) return;

      // Get organization data via AWS API
      const orgData = await apiClient.get('/organization');
      
      if (orgData) {
        setOrganization(orgData);
        setOrgName(orgData.name);
        setDefaultLanguage(orgData.default_language || 'en');
        setDefaultTimezone(orgData.default_timezone || 'UTC');
      }
    } catch (error) {
      console.error('Error loading organization:', error);
      toast({
        variant: "destructive",
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Failed to load organization',
      });
    }
  };

  const handleSave = async () => {
    if (!organization) return;
    
    setIsLoading(true);

    try {
      await apiClient.put('/organization', {
        name: orgName,
        default_language: defaultLanguage,
        default_timezone: defaultTimezone
      });

      toast({
        title: t('common.success'),
        description: t('organization.saved'),
      });
      
      loadOrganization();
    } catch (error) {
      console.error('Error saving organization:', error);
      toast({
        variant: "destructive",
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Failed to save organization',
      });
    }

    setIsLoading(false);
  };

  if (!isOrgAdmin || !organization) {
    return null;
  }

  return (
    <Card className="glass-hover">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>{t('organization.title')}</CardTitle>
          </div>
          <Badge variant="outline" className="bg-primary/10">
            Org Admin
          </Badge>
        </div>
        <CardDescription>
          {t('organization.title')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="org-name">{t('organization.name')}</Label>
          <Input
            id="org-name"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder={t('organization.name')}
          />
        </div>

        <div className="space-y-2">
          <Label>{t('organization.domain')}</Label>
          <Input value={organization.domain} disabled />
          <p className="text-xs text-muted-foreground">
            Domain cannot be changed
          </p>
        </div>

        <div className="space-y-2">
          <Label>{t('organization.status')}</Label>
          <Badge variant={organization.is_active ? "default" : "secondary"}>
            {organization.is_active ? t('organization.active') : t('organization.inactive')}
          </Badge>
        </div>

        <div className="space-y-2">
          <Label>{t('organization.defaultLanguage')}</Label>
          <Select value={defaultLanguage} onValueChange={setDefaultLanguage}>
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
          <Label>{t('organization.defaultTimezone')}</Label>
          <Select value={defaultTimezone} onValueChange={setDefaultTimezone}>
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

        <Button
          onClick={handleSave}
          className="w-full bg-gradient-primary"
          disabled={isLoading}
        >
          <Save className="h-4 w-4 mr-2" />
          {isLoading ? t('common.loading') : t('organization.save')}
        </Button>
      </CardContent>
    </Card>
  );
}
