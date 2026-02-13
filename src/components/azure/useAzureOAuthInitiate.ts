/**
 * Shared hook for initiating Azure OAuth flow.
 * Used by AzureOAuthButton and AzureCredentialsManager (reconnect).
 */
import { useState } from 'react';
import { apiClient } from '@/integrations/aws/api-client';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface InitiateResponse {
  authorizationUrl: string;
  state: string;
  expiresAt: string;
}

export function useAzureOAuthInitiate(options?: { onError?: (error: string) => void }) {
  const { t } = useTranslation();
  const [isPending, setIsPending] = useState(false);

  const initiate = async () => {
    setIsPending(true);
    try {
      sessionStorage.removeItem('azure_oauth_state');
      sessionStorage.removeItem('azure_oauth_timestamp');

      const result = await apiClient.invoke<InitiateResponse>('azure-oauth-initiate', {});
      if (result.error) {
        throw new Error(result.error.message || t('azure.oauth.initiateFailed', 'Failed to start Azure connection'));
      }

      const data = result.data;
      if (!data?.authorizationUrl || !data?.state) {
        toast.error(t('azure.oauth.invalidResponse', 'Invalid response from server'));
        setIsPending(false);
        return;
      }

      // codeVerifier stays server-side only (PKCE security) — only store state for CSRF validation
      sessionStorage.setItem('azure_oauth_state', data.state);
      sessionStorage.setItem('azure_oauth_timestamp', Date.now().toString());

      window.location.href = data.authorizationUrl;
    } catch (err: any) {
      const msg = err.message || t('azure.oauth.initiateFailed', 'Failed to start Azure connection');
      toast.error(msg);
      options?.onError?.(msg);
      setIsPending(false);
    }
  };

  return { initiate, isPending };
}
