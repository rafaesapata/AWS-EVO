import { useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { AlertTriangle, XCircle, CheckCircle2, X, ChevronRight } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface AWSAlertBannerProps {
  onViewDetails?: () => void;
}

export default function AWSAlertBanner({ onViewDetails }: AWSAlertBannerProps) {
  const { t } = useTranslation();
  const { data: organizationId } = useOrganization();
  const [dismissed, setDismissed] = useState(false);
  
  const { data: validationStatus, isLoading } = useQuery({
    queryKey: ['aws-validation-status-banner', organizationId],
    refetchInterval: 5 * 60 * 1000,
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) return [];
      
      const accounts = await apiClient.select('aws_credentials', {
        select: 'id, account_name, account_id',
        eq: { organization_id: organizationId, is_active: true }
      });
      
      if (accounts.error || !accounts.data || accounts.data.length === 0) return [];

      const accountsWithStatus = await Promise.all(
        accounts.data.map(async (account: any) => {
          const validation = await apiClient.select('aws_validation_status', {
            select: '*',
            eq: { aws_account_id: account.id },
            order: { last_validated_at: 'desc' },
            limit: 1,
            single: true
          });
          
          return {
            ...account,
            validation: validation.data
          };
        })
      );
      
      return accountsWithStatus;
    },
  });

  if (isLoading || !organizationId || dismissed) return null;
  if (!validationStatus || validationStatus.length === 0) return null;

  // Check for issues
  const disconnectedAccounts = validationStatus.filter(acc => !acc.validation?.is_connected);
  const permissionIssues = validationStatus.filter(acc => 
    acc.validation?.is_connected && !acc.validation?.has_all_permissions
  );
  
  const hasDisconnected = disconnectedAccounts.length > 0;
  const hasPermissionIssues = permissionIssues.length > 0;
  
  // All good - show success briefly or nothing
  if (!hasDisconnected && !hasPermissionIssues) {
    return (
      <div className="mx-4 mt-2 animate-fade-in">
        <div className="flex items-center justify-between gap-3 px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">
              {t('aws.allAccountsConnected', { count: validationStatus.length })}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Has issues - show alert banner
  const totalIssues = disconnectedAccounts.length + permissionIssues.length;
  const isCritical = hasDisconnected;

  return (
    <div className="mx-4 mt-2 animate-slide-up">
      <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border ${
        isCritical 
          ? 'bg-destructive/10 border-destructive/30 text-destructive' 
          : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
      }`}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`p-2 rounded-lg ${isCritical ? 'bg-destructive/20' : 'bg-amber-500/20'}`}>
            {isCritical ? (
              <XCircle className="h-5 w-5 animate-pulse" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">
              {isCritical 
                ? t('aws.criticalConnectionIssues', { count: totalIssues })
                : t('aws.permissionIssuesDetected', { count: permissionIssues.length })
              }
            </div>
            <div className="text-xs opacity-80 truncate">
              {hasDisconnected && (
                <span>{t('aws.accountsDisconnected', { accounts: disconnectedAccounts.map(a => a.account_name).join(', ') })}</span>
              )}
              {hasPermissionIssues && !hasDisconnected && (
                <span>{t('aws.accountsMissingPermissions', { accounts: permissionIssues.map(a => a.account_name).join(', ') })}</span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={isCritical ? "destructive" : "outline"}
            className="gap-1 h-8"
            onClick={onViewDetails}
          >
            {t('aws.viewDetails')}
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 opacity-60 hover:opacity-100"
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}