/**
 * Cloud Account Selector
 * 
 * Unified selector for AWS and Azure accounts with provider badges.
 */

import React from 'react';
import { Check, ChevronsUpDown, Cloud, Server } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useCloudAccount, CloudProvider, CloudAccount } from '@/contexts/CloudAccountContext';
import { useTranslation } from 'react-i18next';

// Provider icons and colors
const providerConfig: Record<CloudProvider, { icon: React.ReactNode; color: string; bgColor: string }> = {
  AWS: {
    icon: <Server className="h-3 w-3" />,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
  AZURE: {
    icon: <Cloud className="h-3 w-3" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
};

interface CloudAccountSelectorProps {
  className?: string;
  showProviderFilter?: boolean;
  compact?: boolean;
}

export function CloudAccountSelector({ 
  className, 
  showProviderFilter = true,
  compact = false 
}: CloudAccountSelectorProps) {
  const { t } = useTranslation();
  const {
    accounts,
    awsAccounts,
    azureAccounts,
    selectedAccount,
    setSelectedAccountId,
    providerFilter,
    setProviderFilter,
    filteredAccounts,
    isLoading,
    hasMultipleProviders,
  } = useCloudAccount();
  
  const [open, setOpen] = React.useState(false);

  if (isLoading) {
    return (
      <Button variant="outline" className={cn("w-[200px] justify-between", className)} disabled>
        <span className="text-muted-foreground">{t('common.loading', 'Loading...')}</span>
      </Button>
    );
  }

  if (accounts.length === 0) {
    return (
      <Button variant="outline" className={cn("w-[200px] justify-between", className)} disabled>
        <span className="text-muted-foreground">{t('cloud.noAccounts', 'No accounts')}</span>
      </Button>
    );
  }

  const renderProviderBadge = (provider: CloudProvider) => {
    const config = providerConfig[provider];
    return (
      <Badge variant="outline" className={cn("text-xs px-1.5 py-0", config.bgColor, config.color)}>
        {config.icon}
        <span className="ml-1">{provider}</span>
      </Badge>
    );
  };

  const renderAccountItem = (account: CloudAccount) => (
    <CommandItem
      key={account.id}
      value={account.id}
      onSelect={() => {
        setSelectedAccountId(account.id);
        setOpen(false);
      }}
      className={cn(
        "flex items-center justify-between",
        "!bg-transparent hover:!bg-gray-100 dark:hover:!bg-gray-800",
        "!text-gray-900 dark:!text-gray-100",
        "data-[selected=true]:!bg-gray-100 dark:data-[selected=true]:!bg-gray-800",
        "data-[selected=true]:!text-gray-900 dark:data-[selected=true]:!text-gray-100"
      )}
    >
      <div className="flex items-center gap-2">
        <Check
          className={cn(
            "h-4 w-4 !text-gray-900 dark:!text-gray-100",
            selectedAccount?.id === account.id ? "opacity-100" : "opacity-0"
          )}
        />
        <span className="truncate max-w-[150px] !text-gray-900 dark:!text-gray-100">{account.accountName}</span>
      </div>
      {renderProviderBadge(account.provider)}
    </CommandItem>
  );

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Provider filter buttons (only show if multiple providers) */}
      {showProviderFilter && hasMultipleProviders && (
        <div className="flex items-center gap-1">
          <Button
            variant={providerFilter === 'ALL' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setProviderFilter('ALL')}
            className="h-8 px-2 text-xs"
          >
            {t('cloud.all', 'All')}
          </Button>
          <Button
            variant={providerFilter === 'AWS' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setProviderFilter('AWS')}
            className={cn("h-8 px-2 text-xs", providerFilter === 'AWS' && providerConfig.AWS.bgColor)}
          >
            AWS
          </Button>
          <Button
            variant={providerFilter === 'AZURE' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setProviderFilter('AZURE')}
            className={cn("h-8 px-2 text-xs", providerFilter === 'AZURE' && providerConfig.AZURE.bgColor)}
          >
            Azure
          </Button>
        </div>
      )}

      {/* Account selector dropdown */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "justify-between",
              "!bg-white dark:!bg-gray-950",
              "hover:!bg-gray-100 dark:hover:!bg-gray-800",
              "!text-gray-900 dark:!text-gray-100",
              "border-gray-200 dark:border-gray-700",
              compact ? "w-[234px]" : "w-[325px]"
            )}
          >
            {selectedAccount ? (
              <div className="flex items-center gap-2 truncate">
                {renderProviderBadge(selectedAccount.provider)}
                <span className="truncate !text-gray-900 dark:!text-gray-100">{selectedAccount.accountName}</span>
              </div>
            ) : (
              <span className="text-muted-foreground">
                {t('cloud.selectAccount', 'Select account...')}
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder={t('cloud.searchAccounts', 'Search accounts...')} />
            <CommandList>
              <CommandEmpty>{t('cloud.noAccountsFound', 'No accounts found.')}</CommandEmpty>
              
              {/* Show grouped by provider if filter is ALL */}
              {providerFilter === 'ALL' ? (
                <>
                  {awsAccounts.length > 0 && (
                    <CommandGroup heading="AWS">
                      {awsAccounts.map(renderAccountItem)}
                    </CommandGroup>
                  )}
                  {awsAccounts.length > 0 && azureAccounts.length > 0 && (
                    <CommandSeparator />
                  )}
                  {azureAccounts.length > 0 && (
                    <CommandGroup heading="Azure">
                      {azureAccounts.map(renderAccountItem)}
                    </CommandGroup>
                  )}
                </>
              ) : (
                <CommandGroup>
                  {filteredAccounts.map(renderAccountItem)}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Compact version for headers
export function CloudAccountSelectorCompact({ className }: { className?: string }) {
  return <CloudAccountSelector className={className} showProviderFilter={false} compact />;
}
