import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Building2, Check } from "lucide-react";

interface UserOrganization {
  id: string;
  organization_id: string;
  is_primary: boolean;
  organization: {
    id: string;
    name: string;
    domain: string;
  };
}

export default function OrganizationSwitcher() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    const user = await cognitoAuth.getCurrentUser();
    if (!user) return;

    // Get current organization
    const profile = await apiClient.select('profiles', {
      select: 'current_organization_id',
      eq: { id: user.username },
      single: true
    });

    setCurrentOrgId(profile.data?.current_organization_id || null);

    // Get all organizations user belongs to
    const result = await apiClient.select('user_organizations', {
      select: `
        id,
        organization_id,
        is_primary,
        organization:organizations(id, name, domain)
      `,
      eq: { user_id: user.username },
      order: { is_primary: 'desc' }
    });

    if (result.error) {
      console.error('Error loading organizations:', result.error);
      return;
    }

    setOrganizations(result.data || []);
  };

  const switchOrganization = async (orgId: string) => {
    setIsLoading(true);

    const result = await apiClient.rpc('switch_organization', {
      _organization_id: orgId
    });

    if (result.error) {
      toast({
        variant: "destructive",
        title: t('common.error'),
        description: result.error,
      });
    } else {
      toast({
        title: t('common.success'),
        description: t('organization.switched'),
      });
      setCurrentOrgId(orgId);
      // Reload page to refresh all data
      window.location.reload();
    }

    setIsLoading(false);
  };

  // Don't show if user only has one organization
  if (organizations.length <= 1) {
    return null;
  }

  const currentOrg = organizations.find(o => o.organization_id === currentOrgId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Building2 className="h-4 w-4" />
          {currentOrg?.organization.name || t('organization.selectOrganization')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t('organization.switchOrganization')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => switchOrganization(org.organization_id)}
            disabled={isLoading || org.organization_id === currentOrgId}
            className="flex items-center justify-between"
          >
            <div className="flex flex-col">
              <span className="font-medium">{org.organization.name}</span>
              <span className="text-xs text-muted-foreground">{org.organization.domain}</span>
            </div>
            {org.organization_id === currentOrgId && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
