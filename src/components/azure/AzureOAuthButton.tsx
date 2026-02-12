/**
 * Azure OAuth Button
 * 
 * "Connect with Azure" button that initiates the OAuth flow.
 * Uses PKCE for security and stores code_verifier in sessionStorage.
 */

import { Cloud, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useAzureOAuthInitiate } from './useAzureOAuthInitiate';

interface AzureOAuthButtonProps {
  onError?: (error: string) => void;
  variant?: 'default' | 'outline' | 'secondary';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

export function AzureOAuthButton({ 
  onError, 
  variant = 'default',
  size = 'default',
  className = ''
}: AzureOAuthButtonProps) {
  const { t } = useTranslation();
  const { initiate, isPending } = useAzureOAuthInitiate({ onError });

  return (
    <Button
      onClick={initiate}
      disabled={isPending}
      variant={variant}
      size={size}
      className={`gap-2 ${className}`}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Cloud className="h-4 w-4" />
      )}
      {isPending 
        ? t('azure.oauth.redirecting', 'Redirecting to Azure...')
        : t('azure.oauth.connectWithAzure', 'Connect with Azure')
      }
    </Button>
  );
}
