/**
 * Azure OAuth Callback Page
 * 
 * Handles the OAuth callback from Azure AD.
 * Validates state, exchanges code for tokens, and shows subscription selector.
 */

import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Cloud, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { apiClient } from '@/integrations/aws/api-client';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AzureSubscriptionSelector } from '@/components/azure';

interface AzureSubscription {
  subscriptionId: string;
  subscriptionName: string;
  tenantId: string;
  state: string;
}

interface CallbackResponse {
  success: boolean;
  subscriptions: AzureSubscription[];
  message?: string;
  oauthData?: {
    encryptedRefreshToken: string;
    tokenExpiresAt: string;
    tenantId?: string;
    userEmail?: string;
  };
}

interface OAuthData {
  encryptedRefreshToken: string;
  tokenExpiresAt: string;
  tenantId?: string;
  userEmail?: string;
}

type CallbackState = 'loading' | 'selecting' | 'saving' | 'success' | 'error';

export default function AzureOAuthCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  
  const [state, setState] = useState<CallbackState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [subscriptions, setSubscriptions] = useState<AzureSubscription[]>([]);
  const [oauthData, setOauthData] = useState<OAuthData | null>(null);
  
  // Ref to prevent duplicate API calls (React StrictMode, re-renders, etc.)
  const callbackProcessedRef = useRef(false);

  // Get OAuth parameters from URL
  const code = searchParams.get('code');
  const urlState = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Exchange code for tokens
  const callbackMutation = useMutation({
    mutationFn: async ({ code, state, codeVerifier }: { code: string; state: string; codeVerifier: string }) => {
      const result = await apiClient.invoke<CallbackResponse>('azure-oauth-callback', {
        body: { code, state, codeVerifier },
      });
      
      if (result.error) {
        throw new Error(result.error.message || 'Failed to complete OAuth flow');
      }
      
      return result.data;
    },
    onSuccess: (data) => {
      // Clear OAuth data from sessionStorage after successful callback
      sessionStorage.removeItem('azure_oauth_code_verifier');
      sessionStorage.removeItem('azure_oauth_state');
      sessionStorage.removeItem('azure_oauth_timestamp');

      if (!data?.success) {
        setErrorMessage(data?.message || t('azure.oauth.callbackFailed', 'Failed to connect to Azure'));
        setState('error');
        return;
      }

      if (data.subscriptions && data.subscriptions.length > 0) {
        setSubscriptions(data.subscriptions);
        if (data.oauthData) {
          setOauthData(data.oauthData);
        }
        setState('selecting');
      } else {
        setErrorMessage(t('azure.oauth.noSubscriptions', 'No Azure subscriptions found for your account'));
        setState('error');
      }
    },
    onError: (err: Error) => {
      // Clear OAuth data from sessionStorage on error too
      sessionStorage.removeItem('azure_oauth_code_verifier');
      sessionStorage.removeItem('azure_oauth_state');
      sessionStorage.removeItem('azure_oauth_timestamp');
      
      setErrorMessage(err.message);
      setState('error');
    },
  });

  // Save selected subscriptions
  const saveMutation = useMutation({
    mutationFn: async (selectedSubscriptions: AzureSubscription[]) => {
      if (!oauthData) {
        throw new Error('OAuth data not available');
      }

      // Save each subscription as a credential
      const results = await Promise.all(
        selectedSubscriptions.map(async (sub) => {
          const result = await apiClient.invoke<any>('save-azure-credentials', {
            body: {
              authType: 'oauth',
              subscriptionId: sub.subscriptionId,
              subscriptionName: sub.subscriptionName,
              encryptedRefreshToken: oauthData.encryptedRefreshToken,
              tokenExpiresAt: oauthData.tokenExpiresAt,
              oauthTenantId: sub.tenantId,
              oauthUserEmail: oauthData.userEmail,
            },
          });
          
          if (result.error) {
            throw new Error(`Failed to save ${sub.subscriptionName}: ${result.error.message}`);
          }
          
          return result.data;
        })
      );
      
      return results;
    },
    onSuccess: () => {
      setState('success');
      queryClient.invalidateQueries({ queryKey: ['azure-credentials'] });
      queryClient.invalidateQueries({ queryKey: ['cloud-accounts'] });
      toast.success(t('azure.oauth.connectionSuccess', 'Azure subscriptions connected successfully'));
      
      // Redirect after a short delay
      setTimeout(() => {
        navigate('/cloud-credentials');
      }, 2000);
    },
    onError: (err: Error) => {
      setErrorMessage(err.message);
      setState('error');
    },
  });

  // Process OAuth callback on mount
  useEffect(() => {
    // Prevent duplicate calls (React StrictMode, re-renders, etc.)
    if (callbackProcessedRef.current) {
      return;
    }

    // Handle OAuth error from Azure
    if (error) {
      callbackProcessedRef.current = true;
      let message = t('azure.oauth.authorizationFailed', 'Authorization failed');
      
      if (error === 'access_denied') {
        message = t('azure.oauth.accessDenied', 'You declined the authorization request');
      } else if (error === 'consent_required') {
        message = t('azure.oauth.consentRequired', 'Your Azure administrator needs to approve this app');
      } else if (errorDescription) {
        message = errorDescription;
      }
      
      setErrorMessage(message);
      setState('error');
      return;
    }

    // Validate required parameters
    if (!code || !urlState) {
      callbackProcessedRef.current = true;
      setErrorMessage(t('azure.oauth.missingParams', 'Missing authorization parameters'));
      setState('error');
      return;
    }

    // Get stored OAuth data
    const storedState = sessionStorage.getItem('azure_oauth_state');
    const codeVerifier = sessionStorage.getItem('azure_oauth_code_verifier');
    const timestamp = sessionStorage.getItem('azure_oauth_timestamp');

    // Validate state parameter (CSRF protection)
    if (!storedState || storedState !== urlState) {
      callbackProcessedRef.current = true;
      console.error('🔐 Azure OAuth State Mismatch:', {
        urlState,
        storedState,
        match: storedState === urlState,
      });
      setErrorMessage(t('azure.oauth.invalidState', 'Session expired or invalid. Please try again.'));
      setState('error');
      return;
    }

    // Check if OAuth flow is too old (10 minutes)
    if (timestamp) {
      const elapsed = Date.now() - parseInt(timestamp, 10);
      if (elapsed > 10 * 60 * 1000) {
        callbackProcessedRef.current = true;
        setErrorMessage(t('azure.oauth.sessionExpired', 'Session expired. Please try again.'));
        setState('error');
        return;
      }
    }

    // Validate code verifier
    if (!codeVerifier) {
      callbackProcessedRef.current = true;
      setErrorMessage(t('azure.oauth.missingVerifier', 'Missing security token. Please try again.'));
      setState('error');
      return;
    }

    // Mark as processed BEFORE making the API call to prevent duplicates
    callbackProcessedRef.current = true;
    
    // Store codeVerifier in a local variable before clearing sessionStorage
    // We'll clear sessionStorage only after successful API call
    const storedCodeVerifier = codeVerifier;

    // Exchange code for tokens
    callbackMutation.mutate({ code, state: urlState, codeVerifier: storedCodeVerifier });
  }, []); // Empty dependency array - run only once on mount

  const handleSubscriptionSelect = (selected: AzureSubscription[]) => {
    if (selected.length === 0) {
      toast.error(t('azure.oauth.selectAtLeastOne', 'Please select at least one subscription'));
      return;
    }
    
    setState('saving');
    saveMutation.mutate(selected);
  };

  const handleRetry = () => {
    // Clear OAuth data and redirect to credentials page to try again
    sessionStorage.removeItem('azure_oauth_code_verifier');
    sessionStorage.removeItem('azure_oauth_state');
    sessionStorage.removeItem('azure_oauth_timestamp');
    navigate('/cloud-credentials');
  };

  const handleCancel = () => {
    sessionStorage.removeItem('azure_oauth_code_verifier');
    sessionStorage.removeItem('azure_oauth_state');
    sessionStorage.removeItem('azure_oauth_timestamp');
    navigate('/cloud-credentials');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-lg ">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 rounded-full bg-blue-100 dark:bg-blue-900/30 w-fit">
            <Cloud className="h-8 w-8 text-blue-600" />
          </div>
          <CardTitle>{t('azure.oauth.connectingAzure', 'Connecting to Azure')}</CardTitle>
          <CardDescription>
            {state === 'loading' && t('azure.oauth.processingAuth', 'Processing authorization...')}
            {state === 'selecting' && t('azure.oauth.selectSubscriptions', 'Select the subscriptions you want to connect')}
            {state === 'saving' && t('azure.oauth.savingCredentials', 'Saving your Azure credentials...')}
            {state === 'success' && t('azure.oauth.connectionComplete', 'Connection complete!')}
            {state === 'error' && t('azure.oauth.connectionFailed', 'Connection failed')}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* Loading State */}
          {state === 'loading' && (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
              <p className="text-muted-foreground">
                {t('azure.oauth.exchangingTokens', 'Exchanging authorization code...')}
              </p>
            </div>
          )}

          {/* Subscription Selection State */}
          {state === 'selecting' && (
            <AzureSubscriptionSelector
              subscriptions={subscriptions}
              onSelect={handleSubscriptionSelect}
              onCancel={handleCancel}
            />
          )}

          {/* Saving State */}
          {state === 'saving' && (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
              <p className="text-muted-foreground">
                {t('azure.oauth.savingSubscriptions', 'Saving selected subscriptions...')}
              </p>
            </div>
          )}

          {/* Success State */}
          {state === 'success' && (
            <div className="flex flex-col items-center py-8">
              <CheckCircle className="h-12 w-12 text-green-600 mb-4" />
              <p className="text-center text-muted-foreground mb-4">
                {t('azure.oauth.redirectingToCredentials', 'Redirecting to credentials page...')}
              </p>
              <Button variant="outline" onClick={() => navigate('/cloud-credentials')}>
                {t('azure.oauth.goToCredentials', 'Go to Credentials')}
              </Button>
            </div>
          )}

          {/* Error State */}
          {state === 'error' && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{t('common.error', 'Error')}</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
              
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={handleCancel}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button onClick={handleRetry}>
                  {t('common.tryAgain', 'Try Again')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
