/**
 * Azure Subscription Selector
 * 
 * Displays a list of Azure subscriptions for the user to select.
 * Supports multi-select with checkboxes.
 */

import { useState } from 'react';
import { Check, Cloud, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTranslation } from 'react-i18next';

interface AzureSubscription {
  subscriptionId: string;
  subscriptionName: string;
  tenantId: string;
  state: string;
}

interface AzureSubscriptionSelectorProps {
  subscriptions: AzureSubscription[];
  onSelect: (selected: AzureSubscription[]) => void;
  onCancel: () => void;
  maxSelections?: number;
}

export function AzureSubscriptionSelector({
  subscriptions,
  onSelect,
  onCancel,
  maxSelections = 10,
}: AzureSubscriptionSelectorProps) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleToggle = (subscriptionId: string) => {
    const newSelected = new Set(selectedIds);
    
    if (newSelected.has(subscriptionId)) {
      newSelected.delete(subscriptionId);
    } else {
      if (newSelected.size >= maxSelections) {
        return; // Don't allow more than max selections
      }
      newSelected.add(subscriptionId);
    }
    
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === subscriptions.length) {
      setSelectedIds(new Set());
    } else {
      const enabledSubs = subscriptions
        .filter(s => s.state === 'Enabled')
        .slice(0, maxSelections)
        .map(s => s.subscriptionId);
      setSelectedIds(new Set(enabledSubs));
    }
  };

  const handleConfirm = () => {
    const selected = subscriptions.filter(s => selectedIds.has(s.subscriptionId));
    onSelect(selected);
  };

  const enabledCount = subscriptions.filter(s => s.state === 'Enabled').length;
  const allEnabledSelected = enabledCount > 0 && 
    subscriptions.filter(s => s.state === 'Enabled').every(s => selectedIds.has(s.subscriptionId));

  const getStateBadge = (state: string) => {
    switch (state) {
      case 'Enabled':
        return <Badge variant="default" className="bg-green-600">{t('azure.subscriptionEnabled', 'Enabled')}</Badge>;
      case 'Disabled':
        return <Badge variant="secondary">{t('azure.subscriptionDisabled', 'Disabled')}</Badge>;
      case 'Warned':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600">{t('azure.subscriptionWarned', 'Warned')}</Badge>;
      case 'PastDue':
        return <Badge variant="destructive">{t('azure.subscriptionPastDue', 'Past Due')}</Badge>;
      default:
        return <Badge variant="outline">{state}</Badge>;
    }
  };

  const maskId = (id: string) => {
    if (!id || id.length < 8) return id;
    return `${id.substring(0, 8)}...${id.substring(id.length - 4)}`;
  };

  return (
    <div className="space-y-4">
      {/* Header with select all */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {t('azure.subscriptionsFound', '{{count}} subscriptions found', { count: subscriptions.length })}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSelectAll}
          disabled={enabledCount === 0}
        >
          {allEnabledSelected 
            ? t('azure.deselectAll', 'Deselect All')
            : t('azure.selectAllEnabled', 'Select All Enabled')
          }
        </Button>
      </div>

      {/* Subscription list */}
      <ScrollArea className="h-[300px] rounded-md border p-2">
        <div className="space-y-2">
          {subscriptions.map((subscription) => {
            const isEnabled = subscription.state === 'Enabled';
            const isSelected = selectedIds.has(subscription.subscriptionId);
            
            return (
              <div
                key={subscription.subscriptionId}
                className={`
                  flex items-start gap-3 p-3 rounded-lg border transition-colors
                  ${isSelected ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50'}
                  ${!isEnabled ? 'opacity-60' : 'cursor-pointer'}
                `}
                onClick={() => isEnabled && handleToggle(subscription.subscriptionId)}
              >
                <Checkbox
                  checked={isSelected}
                  disabled={!isEnabled}
                  onCheckedChange={() => handleToggle(subscription.subscriptionId)}
                  className="mt-1"
                />
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <span className="font-medium truncate">
                      {subscription.subscriptionName}
                    </span>
                    {getStateBadge(subscription.state)}
                  </div>
                  
                  <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span>{t('azure.subscriptionId', 'Subscription ID')}:</span>
                      <code className="font-mono">{maskId(subscription.subscriptionId)}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>{t('azure.tenantId', 'Tenant ID')}:</span>
                      <code className="font-mono">{maskId(subscription.tenantId)}</code>
                    </div>
                  </div>
                </div>

                {isSelected && (
                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Warning for disabled subscriptions */}
      {subscriptions.some(s => s.state !== 'Enabled') && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            {t('azure.disabledSubscriptionsNote', 'Disabled or warned subscriptions cannot be selected. Please enable them in Azure Portal first.')}
          </span>
        </div>
      )}

      {/* Selection count */}
      <div className="text-sm text-center text-muted-foreground">
        {t('azure.selectedCount', '{{count}} of {{max}} subscriptions selected', {
          count: selectedIds.size,
          max: maxSelections,
        })}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button 
          onClick={handleConfirm}
          disabled={selectedIds.size === 0}
        >
          <Check className="h-4 w-4 mr-2" />
          {t('azure.connectSelected', 'Connect Selected')}
        </Button>
      </div>
    </div>
  );
}
