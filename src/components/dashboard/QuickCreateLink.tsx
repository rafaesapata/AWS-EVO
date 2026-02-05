import { useState, useCallback, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCloudFrontDomain } from "@/hooks/useCloudFrontDomain";
import { 
  Zap, 
  Copy, 
  CheckCircle2, 
  ExternalLink,
  Info,
  AlertTriangle
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ============================================================================
// CONSTANTS - Import from parent or use shared constants
// ============================================================================

// EVO Platform AWS Account ID - used to restrict IAM Role trust policy
// Uses environment variable to support both sandbox and production environments
const EVO_PLATFORM_ACCOUNT_ID = import.meta.env.VITE_AWS_ACCOUNT_ID || '971354623291';

// Template URL paths
const CLOUDFRONT_TEMPLATE_PATH = '/cloudformation/evo-platform-role.yaml';
const LOCAL_TEMPLATE_PATH = '/cloudformation/evo-platform-role.yaml';

// Get template URL based on environment
const getTemplateUrl = (cloudFrontDomain: string | null, isLocal: boolean): string => {
  if (isLocal || !cloudFrontDomain) {
    return `${window.location.origin}${LOCAL_TEMPLATE_PATH}`;
  }
  // Use CloudFront domain for production (template is served from frontend bucket)
  return `https://${cloudFrontDomain}${CLOUDFRONT_TEMPLATE_PATH}`;
};

// AWS Regions for Quick Create
const AWS_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-east-2', label: 'US East (Ohio)' },
  { value: 'us-west-1', label: 'US West (N. California)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
  { value: 'eu-west-2', label: 'Europe (London)' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { value: 'sa-east-1', label: 'South America (São Paulo)' },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generates CloudFormation Quick Create URL with maximum automation
 */
const generateQuickCreateUrl = (
  region: string,
  templateUrl: string,
  externalId: string,
  accountName: string,
  evoPlatformAccountId: string
): string => {
  const params = new URLSearchParams();
  
  // Template and stack configuration
  params.append('templateURL', templateUrl);
  params.append('stackName', `EVO-Platform-${Date.now().toString(36)}`);
  
  // Pre-fill all parameters to minimize user input
  params.append('param_ExternalId', externalId);
  params.append('param_AccountName', accountName || `AWS-Account-${region}`);
  params.append('param_EVOPlatformAccountId', evoPlatformAccountId);
  
  // Add capabilities and options for smoother experience
  params.append('capabilities', 'CAPABILITY_NAMED_IAM');
  
  return `https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/quickcreate?${params.toString()}`;
};

// ============================================================================
// COMPONENT
// ============================================================================

interface QuickCreateLinkProps {
  /** External ID from parent - REQUIRED to maintain consistency */
  externalId: string;
  /** Initial region selection */
  initialRegion?: string;
  /** Callback when user opens the Quick Create link */
  onLinkOpened?: () => void;
}

export const QuickCreateLink = ({ 
  externalId, 
  initialRegion = 'us-east-1',
  onLinkOpened
}: QuickCreateLinkProps) => {
  const { toast } = useToast();
  const { cloudFrontDomain, loading: domainLoading, isLocal } = useCloudFrontDomain();
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState(initialRegion);
  // Auto-generate account name based on region for better UX
  const [accountName, setAccountName] = useState(`AWS-Account-${initialRegion}`);
  const [copied, setCopied] = useState(false);
  
  // Auto-update account name when region changes (unless manually modified)
  const [isAccountNameManuallySet, setIsAccountNameManuallySet] = useState(false);
  
  useEffect(() => {
    if (!isAccountNameManuallySet) {
      setAccountName(`AWS-Account-${region}`);
    }
  }, [region, isAccountNameManuallySet]);
  
  // Generate the Quick Create URL - uses CloudFront for production
  const quickCreateUrl = useMemo(() => {
    // Use CloudFront URL for production, local for development
    const templateUrl = getTemplateUrl(cloudFrontDomain, isLocal);
    
    return generateQuickCreateUrl(
      region,
      templateUrl,
      externalId,
      accountName,
      EVO_PLATFORM_ACCOUNT_ID
    );
  }, [region, externalId, accountName, cloudFrontDomain]);
  
  /**
   * Copy Quick Create URL to clipboard
   */
  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(quickCreateUrl);
      setCopied(true);
      toast({
        title: "Link copiado!",
        description: "Cole no navegador para abrir o CloudFormation",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Erro ao copiar",
        description: "Clique no botão 'Abrir' para acessar diretamente",
        variant: "destructive",
      });
    }
  }, [quickCreateUrl, toast]);
  
  /**
   * Open Quick Create URL in new tab with automation instructions
   */
  const openQuickCreate = useCallback(() => {
    window.open(quickCreateUrl, '_blank', 'noopener,noreferrer');
    onLinkOpened?.();
    toast({
      title: "CloudFormation Aberto! 🚀",
      description: "Todos os parâmetros estão pré-preenchidos. Apenas clique em 'Create stack'",
    });
  }, [quickCreateUrl, toast, onLinkOpened]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Zap className="w-4 h-4" />
          Quick Create Link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            CloudFormation Quick Create
          </DialogTitle>
          <DialogDescription>
            Gere um link direto para criar a stack do CloudFormation com um clique.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Region Selection */}
          <div className="space-y-2">
            <Label htmlFor="qc-region">Região AWS</Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger id="qc-region">
                <SelectValue placeholder="Selecione a região" />
              </SelectTrigger>
              <SelectContent>
                {AWS_REGIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Account Name - Pre-filled for automation */}
          <div className="space-y-2">
            <Label htmlFor="qc-account-name">Nome da Conta (pré-preenchido)</Label>
            <Input
              id="qc-account-name"
              placeholder="AWS-Account-us-east-1"
              value={accountName}
              onChange={(e) => {
                setAccountName(e.target.value);
                setIsAccountNameManuallySet(true);
              }}
              maxLength={64}
            />
            <p className="text-xs text-muted-foreground">
              Nome gerado automaticamente. Pode ser alterado se necessário.
            </p>
          </div>
          
          {/* External ID Display */}
          <div className="space-y-2">
            <Label>External ID (gerado automaticamente)</Label>
            <div className="flex items-center gap-2 p-2 bg-muted rounded-md font-mono text-sm">
              <code className="flex-1 truncate">{externalId}</code>
            </div>
          </div>
          
          {/* Template Source Alert */}
          {isLocal ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Modo Desenvolvimento:</strong> O template será servido localmente. 
                Para produção, o template é acessado via S3 público.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>🚀 Processo Quase Automático:</strong>
                <br />1. Clique em "Conectar AWS" abaixo
                <br />2. No CloudFormation: apenas clique em "Create stack"
                <br />3. Aguarde 2-3 minutos para criação
                <br />4. Copie o Role ARN gerado
              </AlertDescription>
            </Alert>
          )}
          
          {/* Generated URL (truncated) */}
          <div className="space-y-2">
            <Label>URL Gerada</Label>
            <div className="p-2 bg-muted rounded-md text-xs font-mono break-all max-h-20 overflow-y-auto">
              {quickCreateUrl}
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            {/* Primary Action - Almost Automatic */}
            <Button
              className="w-full gap-2 bg-green-600 hover:bg-green-700"
              onClick={openQuickCreate}
              size="lg"
            >
              <Zap className="w-4 h-4" />
              Conectar AWS (Quase Automático)
            </Button>
            
            {/* Secondary Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={copyUrl}
              >
                {copied ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? "Copiado!" : "Copiar Link"}
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={openQuickCreate}
              >
                <ExternalLink className="w-4 h-4" />
                Abrir Manual
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuickCreateLink;
