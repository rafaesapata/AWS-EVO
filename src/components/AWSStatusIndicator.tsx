import { useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cloud, CheckCircle2, AlertCircle, XCircle, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function AWSStatusIndicator() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { data: organizationId } = useOrganization();
  
  const dateLocale = i18n.language === 'pt' ? 'pt-BR' : i18n.language === 'es' ? 'es-ES' : 'en-US';
  
  const { data: validationStatus, isLoading } = useQuery({
    queryKey: ['aws-validation-status', organizationId],
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) return [];
      
      // Use Lambda endpoint instead of REST to avoid CORS issues
      const result = await apiClient.invoke<any>('list-aws-credentials', {});
      
      if (result.error) {
        console.error('Error fetching accounts:', result.error);
        return [];
      }

      // Handle both formats: direct array or wrapped in { success, data }
      let accountsData: any[] = [];
      if (Array.isArray(result.data)) {
        accountsData = result.data;
      } else if (result.data?.success && Array.isArray(result.data.data)) {
        accountsData = result.data.data;
      } else {
        accountsData = result.data?.data || [];
      }

      if (accountsData.length === 0) return [];

      // Then get validation status for each account
      const accountsWithStatus = await Promise.all(
        accountsData.map(async (account: any) => {
          const validation = await apiClient.select('aws_validation_status', {
            select: '*',
            eq: { aws_account_id: account.id },
            order: { last_validated_at: 'desc' },
            limit: 1,
            single: true
          });
          
          return {
            ...account,
            aws_validation_status: validation.data ? [validation.data] : []
          };
        })
      );
      
      return accountsWithStatus;
    },
  });

  // Show loading state instead of "no accounts" while fetching
  if (isLoading || !organizationId) {
    return (
      <Badge variant="outline" className="bg-muted">
        <Cloud className="h-3 w-3 mr-1 animate-pulse" />
        {t('aws.checking')}
      </Badge>
    );
  }

  if (!validationStatus || validationStatus.length === 0) {
    return (
      <Badge variant="outline" className="bg-muted">
        <XCircle className="h-3 w-3 mr-1" />
        {t('aws.noAccounts')}
      </Badge>
    );
  }

  const allConnected = validationStatus.every(acc => 
    acc.aws_validation_status?.[0]?.is_connected
  );
  const allPermissions = validationStatus.every(acc => 
    acc.aws_validation_status?.[0]?.has_all_permissions
  );

  const getStatusIcon = () => {
    if (!allConnected) return <XCircle className="h-3 w-3 mr-1" />;
    if (!allPermissions) return <AlertCircle className="h-3 w-3 mr-1" />;
    return <CheckCircle2 className="h-3 w-3 mr-1" />;
  };

  const getStatusText = () => {
    if (!allConnected) return t('aws.disconnected');
    if (!allPermissions) return t('aws.incompletePermissions');
    return t('aws.connected');
  };

  const getStatusVariant = () => {
    if (!allConnected) return 'destructive';
    if (!allPermissions) return 'outline';
    return 'default';
  };

  const copyMissingPermissions = (permissions: string[]) => {
    const policy = {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": permissions,
          "Resource": "*"
        }
      ]
    };
    navigator.clipboard.writeText(JSON.stringify(policy, null, 2));
    toast({
      title: t('aws.permissionsCopied'),
      description: t('aws.iamPolicyCopied'),
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge 
          variant={getStatusVariant() as any}
          className={`cursor-pointer ${allConnected && allPermissions ? 'bg-green-500 hover:bg-green-600 text-white' : ''}`}
        >
          {getStatusIcon()}
          {getStatusText()}
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] max-h-[500px] overflow-y-auto">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            <h4 className="font-semibold">{t('aws.accountStatus')}</h4>
          </div>
          
          <div className="space-y-3">
            {validationStatus.map((account) => {
              const status = account.aws_validation_status?.[0];
              const isConnected = status?.is_connected;
              const hasPermissions = status?.has_all_permissions;
              const missingPerms = status?.missing_permissions as string[] || [];
              
              return (
                <div key={account.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{account.account_name}</span>
                      {account.account_id && (
                        <p className="text-xs text-muted-foreground">ID: {account.account_id}</p>
                      )}
                    </div>
                    {isConnected && hasPermissions ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : isConnected ? (
                      <AlertCircle className="h-5 w-5 text-orange-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive" />
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{t('aws.status')}:</span>
                      <Badge variant={isConnected ? "default" : "destructive"} className="text-xs">
                        {isConnected ? `✓ ${t('aws.connectedStatus')}` : `✗ ${t('aws.disconnectedStatus')}`}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{t('aws.permissions')}:</span>
                      <Badge variant={hasPermissions ? "default" : "outline"} className="text-xs">
                        {hasPermissions ? `✓ ${t('aws.completePermissions')}` : `⚠ ${t('aws.missingPermissions', { count: missingPerms.length })}`}
                      </Badge>
                    </div>
                  </div>
                  
                  {!isConnected && status?.validation_error && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                      <div className="font-semibold text-sm text-destructive mb-2">
                        ❌ {t('aws.connectionError')}
                      </div>
                      <div className="text-xs text-destructive/80 mb-3">
                        {status.validation_error}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        💡 {t('aws.checkCredentials')}
                      </div>
                    </div>
                  )}
                  
                  {isConnected && missingPerms.length > 0 && (
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold text-sm text-orange-700 dark:text-orange-400">
                          ⚠️ {t('aws.permissionsMissing', { count: missingPerms.length })}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyMissingPermissions(missingPerms)}
                          className="h-7 gap-1"
                        >
                          <Copy className="h-3 w-3" />
                          {t('aws.copyIamPolicy')}
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">
                        {t('aws.clickToCopyPolicy')}
                      </div>
                    </div>
                  )}
                  
                  {status?.last_validated_at && (
                    <div className="text-xs text-muted-foreground pt-2 border-t">
                      {t('aws.lastCheck')}: {new Date(status.last_validated_at).toLocaleString(dateLocale)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}