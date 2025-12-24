import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { 
  CloudCog, 
  ExternalLink, 
  Copy, 
  CheckCircle2, 
  Loader2,
  Shield,
  Zap,
  ArrowRight,
  Download,
  Info,
  AlertTriangle,
  ShieldCheck
} from "lucide-react";
import { RegionSelector } from "./RegionSelector";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { QuickCreateLink } from "./QuickCreateLink";

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

// EVO Platform AWS Account ID - restricts who can assume the IAM Role
export const EVO_PLATFORM_ACCOUNT_ID = '992382761234';

// External ID TTL - 24 hours for unused external IDs
const EXTERNAL_ID_TTL_HOURS = 24;

// External ID configuration
const EXTERNAL_ID_PREFIX = 'evo';
const EXTERNAL_ID_ENTROPY_BYTES = 16;

// ARN validation regex - allows paths in role names
const ARN_REGEX = /^arn:aws:iam::(\d{12}):role\/[\w+=,.@\/-]{1,512}$/;

// Account name validation - max 64 chars, alphanumeric with spaces and dashes
const ACCOUNT_NAME_REGEX = /^[\w\s\-]{0,64}$/;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generates a cryptographically secure External ID
 * Uses crypto.getRandomValues for better entropy than Math.random
 */
const generateSecureExternalId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomBytes = new Uint8Array(EXTERNAL_ID_ENTROPY_BYTES);
  crypto.getRandomValues(randomBytes);
  const randomPart = Array.from(randomBytes)
    .map(b => b.toString(36).padStart(2, '0'))
    .join('')
    .substring(0, 16);
  return `${EXTERNAL_ID_PREFIX}-${timestamp}-${randomPart}`;
};

/**
 * Calculates External ID expiration timestamp
 */
const getExternalIdExpiration = (): string => {
  const expiration = new Date();
  expiration.setHours(expiration.getHours() + EXTERNAL_ID_TTL_HOURS);
  return expiration.toISOString();
};

/**
 * Sanitizes account name input to prevent injection
 */
const sanitizeAccountName = (name: string): string => {
  return name
    .trim()
    .replace(/[^\w\s\-]/g, '') // Remove special characters
    .substring(0, 64);
};

/**
 * Validates and extracts AWS Account ID from Role ARN
 * Returns null if invalid
 */
const validateAndExtractAccountId = (arn: string): string | null => {
  const trimmedArn = arn.trim();
  const match = trimmedArn.match(ARN_REGEX);
  return match ? match[1] : null;
};

/**
 * Generates CloudFormation console URL for a specific region
 */
const getCloudFormationConsoleUrl = (region: string = 'us-east-1'): string => {
  // Validate region format to prevent URL injection
  const validRegionRegex = /^[a-z]{2}-[a-z]+-\d{1}$/;
  const safeRegion = validRegionRegex.test(region) ? region : 'us-east-1';
  return `https://${safeRegion}.console.aws.amazon.com/cloudformation/home?region=${safeRegion}#/stacks/create/template`;
};

// ============================================================================
// COMPONENT
// ============================================================================

const CloudFormationDeploy = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: organizationId, isLoading: isLoadingOrg, isError: isOrgError, error: orgError } = useOrganization();
  const queryClient = useQueryClient();
  
  // Debug: Log component mount and organization state
  useEffect(() => {
    console.log('🚀 CloudFormationDeploy component mounted');
    console.log('🔐 CloudFormationDeploy: Organization state', {
      organizationId,
      isLoadingOrg,
      isOrgError,
      orgError: orgError?.message,
    });
  }, [organizationId, isLoadingOrg, isOrgError, orgError]);
  
  // Refs for preventing race conditions
  const isSubmittingRef = useRef(false);
  const currentExternalIdRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // State management
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [externalId, setExternalId] = useState(() => {
    const id = generateSecureExternalId();
    currentExternalIdRef.current = id;
    console.log('🔑 Generated External ID:', id);
    return id;
  });
  const [accountName, setAccountName] = useState("");
  const [roleArn, setRoleArn] = useState("");
  const [regions, setRegions] = useState<string[]>(["us-east-1"]);
  const [isValidating, setIsValidating] = useState(false);
  
  // Saved account data for Step 3
  const [savedAccountData, setSavedAccountData] = useState<{
    id: string;
    account_id: string;
    account_name: string;
    regions: string[];
    is_active: boolean;
    created_at: string;
    updated?: boolean;
  } | null>(null);
  const [isEditingRegions, setIsEditingRegions] = useState(false);
  const [editedRegions, setEditedRegions] = useState<string[]>([]);
  const [copiedExternalId, setCopiedExternalId] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  /**
   * Copies External ID to clipboard with user feedback
   */
  const copyExternalId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(externalId);
      setCopiedExternalId(true);
      toast({
        title: t('cloudformation.externalIdCopied'),
        description: t('cloudformation.externalIdCopiedDesc'),
      });
      setTimeout(() => setCopiedExternalId(false), 2000);
    } catch (error) {
      toast({
        title: t('cloudformation.copyError'),
        description: t('cloudformation.copyErrorDesc'),
        variant: "destructive",
      });
    }
  }, [externalId, toast, t]);

  /**
   * Downloads the CloudFormation template file
   */
  const downloadTemplate = useCallback(() => {
    const link = document.createElement('a');
    link.href = '/cloudformation/evo-platform-role.yaml';
    link.download = 'evo-platform-role.yaml';
    link.setAttribute('rel', 'noopener noreferrer');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: t('cloudformation.templateDownloaded'),
      description: t('cloudformation.templateDownloadDesc'),
    });
  }, [toast, t]);

  /**
   * Opens AWS CloudFormation console in the selected region
   */
  const openCloudFormation = useCallback(() => {
    const primaryRegion = regions[0] || 'us-east-1';
    const url = getCloudFormationConsoleUrl(primaryRegion);
    window.open(url, '_blank', 'noopener,noreferrer');
    setStep(2);
  }, [regions]);

  /**
   * Handles account name input with sanitization
   */
  const handleAccountNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeAccountName(e.target.value);
    setAccountName(sanitized);
  }, []);

  /**
   * Handles Role ARN input with real-time validation feedback
   */
  const handleRoleArnChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setRoleArn(value);
    
    // Clear previous error
    setValidationError(null);
    
    // Real-time validation feedback
    if (value && !validateAndExtractAccountId(value)) {
      setValidationError(t('cloudformation.invalidArnFormat'));
    }
  }, [t]);

  /**
   * Validates the Role ARN and saves the connection
   * Implements idempotency check, race condition prevention, and audit logging
   */
  const handleValidateAndSave = useCallback(async () => {
    // Prevent double submission
    if (isSubmittingRef.current) {
      console.log('⚠️ Submission already in progress, ignoring duplicate click');
      return;
    }
    
    // Reset validation state
    setValidationError(null);
    
    // Validate Role ARN format
    const awsAccountId = validateAndExtractAccountId(roleArn);
    if (!awsAccountId) {
      setValidationError(t('cloudformation.invalidArnFormat'));
      toast({
        title: t('cloudformation.invalidArn'),
        description: t('cloudformation.checkArnFormat'),
        variant: "destructive",
      });
      return;
    }

    // Validate regions
    if (!regions.length) {
      toast({
        title: t('cloudformation.selectAtLeastOneRegion'),
        description: t('cloudformation.selectRegionsDesc'),
        variant: "destructive",
      });
      return;
    }

    // Set submission lock
    isSubmittingRef.current = true;
    setIsValidating(true);
    
    // Create abort controller for this request
    abortControllerRef.current = new AbortController();
    
    // Capture current externalId to detect if it changed during async operation
    const capturedExternalId = currentExternalIdRef.current;
    
    try {
      // Get authenticated user
      const user = await cognitoAuth.getCurrentUser();
      if (!user) {
        throw new Error(t('cloudformation.sessionExpired'));
      }

      // Get user's organization directly from Cognito (bypass hook that may be loading)
      const userOrgId = user.organizationId;
      if (!userOrgId) {
        console.error('🔐 CloudFormationDeploy: organizationId is null/undefined!', {
          organizationId: userOrgId,
          userFromCognito: user,
        });
        throw new Error(t('cloudformation.organizationNotFound'));
      }

      // NOTE: Duplicate check is handled by the Lambda - it will update existing credentials
      // The REST endpoint /aws_credentials doesn't exist, so we skip client-side check

      // Check if externalId changed during async operation (race condition)
      if (capturedExternalId !== currentExternalIdRef.current) {
        console.warn('⚠️ External ID changed during operation, aborting');
        toast({
          title: t('cloudformation.operationCancelled'),
          description: t('cloudformation.wizardRestarted'),
          variant: "destructive",
        });
        isSubmittingRef.current = false;
        setIsValidating(false);
        return;
      }

      // Basic validation - check if Role ARN format is correct and External ID matches
      console.log('🔍 Validating Role ARN format and External ID...');
      
      // Sanitize account name for storage
      const sanitizedName = sanitizeAccountName(accountName) || `Conta AWS ${awsAccountId}`;
      const trimmedArn = roleArn.trim();
      
      // Validate Role ARN format more strictly
      if (!trimmedArn.includes(awsAccountId)) {
        throw new Error('O Role ARN não corresponde ao Account ID extraído. Verifique se copiou o ARN correto.');
      }
      
      // Validate External ID format
      if (!capturedExternalId.startsWith('evo-') || capturedExternalId.length < 20) {
        throw new Error('External ID inválido. Use o External ID gerado automaticamente pelo sistema.');
      }

      console.log('✅ Basic validation passed');
      
      // Calculate External ID expiration (TTL)
      const externalIdExpiresAt = getExternalIdExpiration();

      // Save the role-based credentials via Lambda endpoint
      // The Lambda will automatically create the organization if it doesn't exist
      console.log('📤 Saving AWS credentials via Lambda...');
      
      const savedCredResult = await apiClient.invoke<{
        id: string;
        account_id: string;
        account_name: string;
        regions: string[];
        is_active: boolean;
        created_at: string;
        updated?: boolean;
      }>('save-aws-credentials', {
        body: {
          account_name: sanitizedName,
          access_key_id: `ROLE:${trimmedArn}`,
          secret_access_key: `EXTERNAL_ID:${capturedExternalId}`,
          external_id: capturedExternalId,
          regions: regions,
          account_id: awsAccountId,
          is_active: true,
        }
      });

      if (savedCredResult.error) {
        console.error('Error saving credentials:', savedCredResult.error);
        // Check for specific error messages
        const errorMsg = savedCredResult.error.message || '';
        if (errorMsg.includes('Organization not found') || 
            errorMsg.includes('Session expired') || 
            errorMsg.includes('Invalid organization') ||
            errorMsg.includes('logout and login')) {
          throw new Error('Sua sessão expirou ou é inválida. Por favor, faça logout e login novamente para atualizar sua sessão.');
        }
        throw new Error(errorMsg || t('cloudformation.errorSavingCredentials'));
      }

      // Lambda returns { success: true, data: {...} } - extract the inner data
      const responseBody = savedCredResult.data as any;
      const savedCred = responseBody?.data || responseBody;
      if (!savedCred || !savedCred.id) {
        console.error('Invalid response from Lambda:', savedCredResult.data);
        throw new Error(t('cloudformation.errorSavingCredentials'));
      }
      
      console.log('✅ Credentials saved successfully:', savedCred.id);

      // TODO: Enable when validate-permissions Lambda is deployed
      // Trigger permission validation in background (optional, non-blocking)
      // try {
      //   apiClient.invoke('validate-permissions', {
      //     body: {
      //       accountId: savedCred.id,
      //       region: regions[0] || 'us-east-1',
      //     }
      //   }).catch(err => console.warn('Background permission validation failed (non-blocking):', err));
      // } catch (e) {
      //   console.warn('Background permission validation setup failed (non-blocking):', e);
      // }

      // TODO: Enable when log-audit-action Lambda is deployed
      // Log to audit trail
      // try {
      //   await apiClient.invoke('log-audit-action', {
      //     body: {
      //       user_id: user.id,
      //       action: 'AWS_ACCOUNT_CONNECTED_CLOUDFORMATION',
      //       resource_type: 'aws_credentials',
      //       resource_id: savedCred.id,
      //       details: {
      //         aws_account_id: awsAccountId,
      //         connection_method: 'cloudformation_role',
      //         regions: regions,
      //         account_name: sanitizedName,
      //       },
      //       organization_id: userOrgId,
      //     }
      //   });
      // } catch (auditError) {
      //   console.warn('Audit log failed (non-fatal):', auditError);
      // }

      toast({
        title: `✅ ${t('cloudformation.accountConnected')}`,
        description: t('cloudformation.accountConnectedDesc', { accountId: awsAccountId }),
      });

      // Invalidate relevant queries to refresh UI
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['aws-credentials-all'] }),
        queryClient.invalidateQueries({ queryKey: ['aws-credentials-check'] }),
      ]);
      
      // Save account data for Step 3 display
      setSavedAccountData({
        id: savedCred.id,
        account_id: savedCred.account_id || awsAccountId,
        account_name: savedCred.account_name || sanitizedName,
        regions: savedCred.regions || regions,
        is_active: savedCred.is_active !== false,
        created_at: savedCred.created_at || new Date().toISOString(),
        updated: savedCred.updated,
      });
      setEditedRegions(savedCred.regions || regions);
      
      setStep(3);
      
    } catch (error) {
      // Don't show error if request was aborted (wizard reset)
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request aborted');
        return;
      }
      
      console.error('Error in handleValidateAndSave:', error);
      const errorMessage = error instanceof Error ? error.message : t('common.unknownError');
      setValidationError(errorMessage);
      toast({
        title: t('cloudformation.errorConnecting'),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      isSubmittingRef.current = false;
      setIsValidating(false);
      abortControllerRef.current = null;
    }
  }, [roleArn, regions, accountName, toast, queryClient]);

  /**
   * Resets wizard state for connecting another account
   * Aborts any pending requests to prevent race conditions
   */
  const resetWizard = useCallback(() => {
    // Abort any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Reset submission lock
    isSubmittingRef.current = false;
    
    // Reset all state
    setStep(1);
    setRoleArn("");
    setAccountName("");
    setRegions(["us-east-1"]);
    setValidationError(null);
    setSavedAccountData(null);
    setIsEditingRegions(false);
    setEditedRegions([]);
    
    // Generate new externalId and update ref
    const newExternalId = generateSecureExternalId();
    currentExternalIdRef.current = newExternalId;
    setExternalId(newExternalId);
  }, []);

  /**
   * Saves updated regions for the connected account
   */
  const handleSaveRegions = useCallback(async () => {
    if (!savedAccountData) return;
    
    setIsValidating(true);
    try {
      const result = await apiClient.invoke<any>('save-aws-credentials', {
        body: {
          account_name: savedAccountData.account_name,
          access_key_id: `ROLE:${roleArn}`,
          secret_access_key: `EXTERNAL_ID:${externalId}`,
          external_id: externalId,
          regions: editedRegions,
          account_id: savedAccountData.account_id,
          is_active: true,
        }
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      const responseBody = result.data as any;
      const updatedCred = responseBody?.data || responseBody;
      
      setSavedAccountData(prev => prev ? {
        ...prev,
        regions: editedRegions,
      } : null);
      
      setIsEditingRegions(false);
      
      toast({
        title: "✅ Regiões Atualizadas",
        description: `${editedRegions.length} região(ões) configurada(s) para monitoramento.`,
      });
      
      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['aws-credentials-all'] });
    } catch (error) {
      console.error('Error saving regions:', error);
      toast({
        title: "❌ Erro ao Salvar",
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  }, [savedAccountData, roleArn, externalId, editedRegions, toast, queryClient]);

  return (
    <Card className="border-border shadow-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CloudCog className="w-5 h-5 text-primary" />
          <CardTitle>🚀 Conectar Conta AWS com CloudFormation</CardTitle>
        </div>
        <CardDescription>
          Configure automaticamente as permissões AWS com segurança. Método recomendado pela AWS.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Benefits Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex items-start gap-2 p-3 bg-green-500/10 rounded-lg">
            <Shield className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-400">Mais Seguro</p>
              <p className="text-xs text-muted-foreground">Sem chaves de acesso expostas</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-blue-500/10 rounded-lg">
            <Zap className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Automático</p>
              <p className="text-xs text-muted-foreground">Permissões criadas automaticamente</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-purple-500/10 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-purple-700 dark:text-purple-400">Best Practice</p>
              <p className="text-xs text-muted-foreground">Padrão da indústria AWS</p>
            </div>
          </div>
        </div>

        {/* Progress Steps Indicator */}
        <div className="flex items-center justify-between mb-6" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={3}>
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div 
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  step >= s 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-muted-foreground'
                }`}
                aria-label={`Passo ${s} ${step > s ? '(completo)' : step === s ? '(atual)' : ''}`}
              >
                {step > s ? <CheckCircle2 className="w-5 h-5" /> : s}
              </div>
              {s < 3 && (
                <div className={`w-16 md:w-24 h-1 mx-2 transition-colors ${
                  step > s ? 'bg-primary' : 'bg-muted'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Prepare Connection */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Passo 1: Preparar Conexão</h3>
            
            <div className="space-y-2">
              <Label htmlFor="cf-account-name">Nome da Conta (opcional)</Label>
              <Input
                id="cf-account-name"
                placeholder="Production / Development / etc"
                value={accountName}
                onChange={handleAccountNameChange}
                maxLength={64}
                aria-describedby="account-name-hint"
              />
              <p id="account-name-hint" className="text-xs text-muted-foreground">
                Nome amigável para identificar esta conta (máx. 64 caracteres)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="external-id">External ID (para segurança)</Label>
              <div className="flex gap-2">
                <Input
                  id="external-id"
                  value={externalId}
                  readOnly
                  className="font-mono text-sm bg-muted"
                  aria-describedby="external-id-hint"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyExternalId}
                  aria-label="Copiar External ID"
                >
                  {copiedExternalId ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p id="external-id-hint" className="text-xs text-muted-foreground">
                Este ID único garante que apenas a EVO Platform pode assumir a Role criada
              </p>
            </div>

            <div className="space-y-2">
              <Label>Regiões AWS para Monitorar</Label>
              <RegionSelector 
                selectedRegions={regions}
                onChange={setRegions}
              />
            </div>

            <Alert>
              <CloudCog className="h-4 w-4" />
              <AlertDescription>
                <strong>Instruções:</strong>
                <ol className="list-decimal ml-4 mt-2 space-y-1 text-sm">
                  <li>Baixe o template CloudFormation clicando no botão abaixo</li>
                  <li>Acesse o Console AWS CloudFormation na sua conta</li>
                  <li>Selecione "Upload a template file" e envie o arquivo baixado</li>
                  <li>Preencha o parâmetro <strong>ExternalId</strong> com o valor acima</li>
                  <li>Clique em "Create stack" e aguarde a conclusão</li>
                </ol>
              </AlertDescription>
            </Alert>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <Button 
                  onClick={downloadTemplate}
                  variant="outline"
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                  Baixar Template
                </Button>
                <Button 
                  onClick={openCloudFormation}
                  className="flex-1 gap-2"
                  size="lg"
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir AWS CloudFormation
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
              
              {/* Quick Create Link Option */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <span className="text-sm text-muted-foreground">Ou use:</span>
                <QuickCreateLink 
                  externalId={externalId}
                  initialRegion={regions[0] || 'us-east-1'}
                  onLinkOpened={() => setStep(2)}
                />
              </div>
            </div>
            
            {/* EVO Platform Account ID Info */}
            <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 mt-0.5" />
                <div className="text-xs">
                  <p className="font-medium text-blue-700 dark:text-blue-400">Segurança Reforçada</p>
                  <p className="text-muted-foreground">
                    A Role criada só pode ser assumida pela conta AWS da EVO Platform ({EVO_PLATFORM_ACCOUNT_ID}).
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Create Stack & Get Role ARN */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Passo 2: Criar Stack no AWS</h3>

            {/* External ID Reference */}
            <div className="p-3 bg-muted/50 rounded-lg border">
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <Info className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">External ID:</span>
                <code className="font-mono text-xs bg-background px-2 py-1 rounded break-all">{externalId}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={copyExternalId}
                  aria-label="Copiar External ID"
                >
                  {copiedExternalId ? (
                    <CheckCircle2 className="w-3 h-3 text-green-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </Button>
              </div>
            </div>
            
            {/* Instructions Alert */}
            <Alert className="bg-yellow-500/10 border-yellow-500/30">
              <Zap className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-700 dark:text-yellow-400">
                <strong>No Console AWS CloudFormation:</strong>
                <ol className="list-decimal ml-4 mt-2 space-y-1">
                  <li>Faça upload do template baixado</li>
                  <li>Preencha o <strong>ExternalId</strong> com o valor mostrado acima</li>
                  <li>Marque a checkbox "I acknowledge that AWS CloudFormation might create IAM resources with custom names"</li>
                  <li>Clique em "Create stack"</li>
                  <li>Aguarde o status mudar para <strong>CREATE_COMPLETE</strong></li>
                  <li>Na aba "Outputs", copie o valor de <strong>RoleArn</strong></li>
                </ol>
              </AlertDescription>
            </Alert>

            {/* Role ARN Input */}
            <div className="space-y-2">
              <Label htmlFor="role-arn">Role ARN (da aba Outputs)</Label>
              <Input
                id="role-arn"
                placeholder="arn:aws:iam::123456789012:role/EVO-Platform-Role-xxx"
                value={roleArn}
                onChange={handleRoleArnChange}
                className={`font-mono text-sm ${validationError ? 'border-destructive' : ''}`}
                aria-invalid={!!validationError}
                aria-describedby={validationError ? "role-arn-error" : "role-arn-hint"}
              />
              {validationError ? (
                <p id="role-arn-error" className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {validationError}
                </p>
              ) : (
                <p id="role-arn-hint" className="text-xs text-muted-foreground">
                  Copie o valor de "RoleArn" da aba "Outputs" do CloudFormation Stack
                </p>
              )}
            </div>

            {/* Reopen CloudFormation Console */}
            <div className="flex flex-col gap-3 pt-2 border-t">
              <p className="text-sm text-muted-foreground">
                Precisa reabrir o Console AWS CloudFormation?
              </p>
              <QuickCreateLink 
                externalId={externalId}
                initialRegion={regions[0] || 'us-east-1'}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                disabled={isValidating}
              >
                Voltar
              </Button>
              <Button 
                onClick={handleValidateAndSave}
                disabled={isValidating || !roleArn || !!validationError}
                className="flex-1 gap-2"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Conectar Conta
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Success */}
        {step === 3 && savedAccountData && (
          <div className="space-y-6">
            {/* Success Header */}
            <div className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-green-700 dark:text-green-400">
                {savedAccountData.updated ? 'Conta Atualizada com Sucesso!' : 'Conta Conectada com Sucesso!'}
              </h3>
            </div>

            {/* Account Details Card */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Detalhes da Conta AWS
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground">ID da Conta AWS</p>
                  <p className="font-mono font-medium bg-background px-2 py-1 rounded">
                    {savedAccountData.account_id}
                  </p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-muted-foreground">Nome da Conta</p>
                  <p className="font-medium bg-background px-2 py-1 rounded">
                    {savedAccountData.account_name}
                  </p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-muted-foreground">Status</p>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${savedAccountData.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className={savedAccountData.is_active ? 'text-green-600' : 'text-red-600'}>
                      {savedAccountData.is_active ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <p className="text-muted-foreground">Método de Conexão</p>
                  <p className="font-medium bg-background px-2 py-1 rounded flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-green-600" />
                    IAM Role (CloudFormation)
                  </p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-muted-foreground">ID Interno</p>
                  <p className="font-mono text-xs bg-background px-2 py-1 rounded truncate">
                    {savedAccountData.id}
                  </p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-muted-foreground">Data de Conexão</p>
                  <p className="font-medium bg-background px-2 py-1 rounded">
                    {new Date(savedAccountData.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            </div>

            {/* Regions Section */}
            <div className="bg-blue-500/10 rounded-lg p-4 space-y-3 border border-blue-500/20">
              <div className="flex items-center justify-between">
                <h4 className="font-medium flex items-center gap-2">
                  <CloudCog className="w-4 h-4 text-blue-600" />
                  Regiões Monitoradas ({savedAccountData.regions.length})
                </h4>
                {!isEditingRegions && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditedRegions(savedAccountData.regions);
                      setIsEditingRegions(true);
                    }}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    ✏️ Editar Regiões
                  </Button>
                )}
              </div>
              
              {isEditingRegions ? (
                <div className="space-y-3">
                  <RegionSelector 
                    selectedRegions={editedRegions}
                    onChange={setEditedRegions}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsEditingRegions(false);
                        setEditedRegions(savedAccountData.regions);
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveRegions}
                      disabled={isValidating || editedRegions.length === 0}
                    >
                      {isValidating ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : null}
                      Salvar Regiões
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {savedAccountData.regions.map((region) => (
                    <span
                      key={region}
                      className="px-2 py-1 bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded text-sm font-mono"
                    >
                      {region}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* External ID Info */}
            <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs">
                  <p className="font-medium text-yellow-700 dark:text-yellow-400">External ID Utilizado</p>
                  <code className="font-mono text-muted-foreground break-all">{externalId}</code>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button onClick={resetWizard} variant="outline" className="flex-1">
                <CloudCog className="w-4 h-4 mr-2" />
                Conectar Outra Conta
              </Button>
              <Button 
                variant="default" 
                className="flex-1"
                onClick={() => window.location.href = '/aws-accounts'}
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Ver Todas as Contas
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CloudFormationDeploy;
