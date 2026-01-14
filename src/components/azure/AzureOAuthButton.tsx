/**
 * Azure OAuth Button
 * 
 * "Connect with Azure" button that initiates the OAuth flow.
 * Uses PKCE for security and stores code_verifier in sessionStorage.
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Cloud, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/integrations/aws/api-client';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface AzureOAuthButtonProps {
  onError?: (error: string) => void;
  variant?: 'default' | 'outline' | 'secondary';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

interface InitiateResponse {
  authorizationUrl: string;
  state: string;
  codeVerifier: string;
}

export function AzureOAuthButton({ 
  onError, 
  variant = 'default',
  size = 'default',
  className = ''
}: AzureOAuthButtonProps) {
  const { t } = useTranslation();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const initiateMutation = useMutation({
    mutationFn: async () => {
      const result = await apiClient.invoke<InitiateResponse>('azure-oauth-initiate', {});
      
      if (result.error) {
        throw new Error(result.error.message || 'Failed to initiate OAuth flow');
      }
      
      return result.data;
    },
    onSuccess: (data) => {
      if (!data?.authorizationUrl || !data?.codeVerifier || !data?.state) {
        toast.error(t('azure.oauth.invalidResponse', 'Invalid response from server'));
        return;
      }

      // Store code_verifier and state in sessionStorage for callback
      sessionStorage.setItem('azure_oauth_code_verifier', data.codeVerifier);
      sessionStorage.setItem('azure_oauth_state', data.state);
      sessionStorage.setItem('azure_oauth_timestamp', Date.now().toString());

      // Debug logging
      console.log('🔐 Azure OAuth Initiate - Stored in sessionStorage:', {
        state: data.state.substring(0, 10) + '...',
        hasCodeVerifier: !!data.codeVerifier,
        timestamp: Date.now(),
        authUrl: data.authorizationUrl.substring(0, 50) + '...',
      });

      // Verify storage worked
      const verifyState = sessionStorage.getItem('azure_oauth_state');
      console.log('🔐 Azure OAuth Initiate - Verification:', {
        stored: verifyState?.substring(0, 10) + '...',
        matches: verifyState === data.state,
      });

      setIsRedirecting(true);
      
      // Redirect to Azure AD authorization page
      window.location.href = data.authorizationUrl;
    },
    onError: (err: Error) => {
      const errorMessage = err.message || t('azure.oauth.initiateFailed', 'Failed to start Azure connection');
      toast.error(errorMessage);
      onError?.(errorMessage);
    },
  });

  const handleClick = () => {
    // Clear any previous OAuth data
    sessionStorage.removeItem('azure_oauth_code_verifier');
    sessionStorage.removeItem('azure_oauth_state');
    sessionStorage.removeItem('azure_oauth_timestamp');
    
    initiateMutation.mutate();
  };

  const isLoading = initiateMutation.isPending || isRedirecting;

  return (
    <Button
      onClick={handleClick}
      disabled={isLoading}
      variant={variant}
      size={size}
      className={`gap-2 ${className}`}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Cloud className="h-4 w-4" />
      )}
      {isRedirecting 
        ? t('azure.oauth.redirecting', 'Redirecting to Azure...')
        : t('azure.oauth.connectWithAzure', 'Connect with Azure')
      }
    </Button>
  );
}
