import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
import { Building2, Check, UserCog, X } from "lucide-react";
import { Badge } from "./ui/badge";

interface Organization {
  id: string;
  name: string;
  domain?: string;
  status?: string;
}

interface ImpersonationState {
  isImpersonating: boolean;
  originalOrgId: string | null;
  originalOrgName: string | null;
  impersonatedOrgId: string | null;
  impersonatedOrgName: string | null;
}

const IMPERSONATION_KEY = 'evo-impersonation';

export function getImpersonationState(): ImpersonationState | null {
  try {
    const stored = localStorage.getItem(IMPERSONATION_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

export function getEffectiveOrganizationId(userOrgId: string | undefined): string | undefined {
  const impersonation = getImpersonationState();
  if (impersonation?.isImpersonating && impersonation.impersonatedOrgId) {
    return impersonation.impersonatedOrgId;
  }
  return userOrgId;
}

export function getEffectiveOrganizationName(userOrgName: string | undefined): string | undefined {
  const impersonation = getImpersonationState();
  if (impersonation?.isImpersonating && impersonation.impersonatedOrgName) {
    return impersonation.impersonatedOrgName;
  }
  return userOrgName;
}

interface SuperAdminOrganizationSwitcherProps {
  currentOrgId?: string;
  currentOrgName?: string;
}

export default function SuperAdminOrganizationSwitcher({ 
  currentOrgId, 
  currentOrgName 
}: SuperAdminOrganizationSwitcherProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [impersonation, setImpersonation] = useState<ImpersonationState | null>(null);

  useEffect(() => {
    loadOrganizations();
    // Load impersonation state from localStorage
    const stored = getImpersonationState();
    if (stored) {
      setImpersonation(stored);
    }
  }, []);

  const loadOrganizations = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.invoke<Organization[]>('manage-organizations', {
        body: { action: 'list' }
      });

      if (response.error) {
        console.error('Error loading organizations:', response.error);
        return;
      }

      // Filter only active organizations
      const activeOrgs = (response.data || []).filter(
        (org: Organization) => org.status === 'active'
      );
      setOrganizations(activeOrgs);
    } catch (error) {
      console.error('Error loading organizations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const startImpersonation = (org: Organization) => {
    const newState: ImpersonationState = {
      isImpersonating: true,
      originalOrgId: currentOrgId || null,
      originalOrgName: currentOrgName || null,
      impersonatedOrgId: org.id,
      impersonatedOrgName: org.name,
    };

    localStorage.setItem(IMPERSONATION_KEY, JSON.stringify(newState));
    setImpersonation(newState);

    toast({
      title: t('impersonation.activated', 'Impersonation Activated'),
      description: t('impersonation.updatingData', 'Updating data...'),
    });

    // Reload page to refresh all data with new organization context
    window.location.reload();
  };

  const stopImpersonation = () => {
    localStorage.removeItem(IMPERSONATION_KEY);
    setImpersonation(null);

    toast({
      title: t('impersonation.deactivated', 'Impersonation Stopped'),
      description: t('impersonation.backToMyOrg', 'Returned to your original organization'),
    });

    // Reload page to refresh all data
    window.location.reload();
  };

  const effectiveOrgId = impersonation?.isImpersonating 
    ? impersonation.impersonatedOrgId 
    : currentOrgId;
  
  const effectiveOrgName = impersonation?.isImpersonating 
    ? impersonation.impersonatedOrgName 
    : currentOrgName;

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className={`gap-2 !bg-white dark:!bg-gray-950 hover:!bg-gray-100 dark:hover:!bg-gray-800 !text-gray-900 dark:!text-gray-100 border-gray-200 dark:border-gray-700 ${impersonation?.isImpersonating ? '!border-orange-500 !bg-orange-500/10' : ''}`}
          >
            {impersonation?.isImpersonating ? (
              <UserCog className="h-4 w-4 text-orange-500" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
            <span className="max-w-[150px] truncate">
              {effectiveOrgName || t('organization.selectOrganization', 'Select Organization')}
            </span>
            {impersonation?.isImpersonating && (
              <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 border-orange-500 text-orange-500">
                {t('impersonate.badge', 'IMPERSONATING')}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 max-h-[400px] overflow-y-auto">
          <DropdownMenuLabel className="flex items-center gap-2">
            <UserCog className="h-4 w-4" />
            {t('impersonate.title', 'Impersonate Organization')}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {impersonation?.isImpersonating && (
            <>
              <DropdownMenuItem
                onClick={stopImpersonation}
                className="flex items-center gap-2 text-orange-600 focus:text-orange-600 hover:!bg-gray-100 dark:hover:!bg-gray-800 !text-gray-900 dark:!text-gray-100"
              >
                <X className="h-4 w-4" />
                <div className="flex flex-col">
                  <span className="font-medium text-orange-600">{t('impersonate.stop', 'Stop Impersonation')}</span>
                  <span className="text-xs text-muted-foreground">
                    {t('impersonate.returnTo', 'Return to')} {impersonation.originalOrgName}
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          {isLoading ? (
            <DropdownMenuItem disabled>
              {t('common.loading', 'Loading...')}
            </DropdownMenuItem>
          ) : organizations.length === 0 ? (
            <DropdownMenuItem disabled>
              {t('organization.noOrganizations', 'No organizations found')}
            </DropdownMenuItem>
          ) : (
            organizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => startImpersonation(org)}
                disabled={org.id === effectiveOrgId}
                className="flex items-center justify-between hover:!bg-gray-100 dark:hover:!bg-gray-800 !text-gray-900 dark:!text-gray-100 data-[disabled=true]:opacity-50"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{org.name}</span>
                  {org.domain && (
                    <span className="text-xs text-muted-foreground">{org.domain}</span>
                  )}
                </div>
                {org.id === effectiveOrgId && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
