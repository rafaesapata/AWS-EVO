import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, AlertTriangle, RefreshCw, Loader2, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useQueryClient } from "@tanstack/react-query";

export function AWSPermissionsGuide() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedAccountId, selectedAccount, isLoading: accountsLoading } = useAwsAccount();
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ 
    success: boolean; 
    message: string;
    missingPermissions?: string[];
    extraPermissions?: string[];
  } | null>(null);
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);

  // Política 1: Core Compute & Storage
  const permissionsPolicy1 = [
    // EC2 - Instâncias, volumes, snapshots
    "ec2:Describe*",
    "ec2:GetConsoleOutput",
    "ec2:GetConsoleScreenshot",
    "ec2:DescribeReservedInstances",
    "ec2:DescribeSnapshots",
    
    // RDS - Bancos de dados relacionais
    "rds:Describe*",
    "rds:ListTagsForResource",
    "rds:DescribeReservedDBInstances",
    
    // S3 - Object Storage
    "s3:ListAllMyBuckets",
    "s3:GetBucket*",
    "s3:ListBucket",
    
    // ElastiCache - Redis/Memcached
    "elasticache:Describe*",
    "elasticache:List*",
    "elasticache:DescribeReservedCacheNodes*",
    
    // DynamoDB - NoSQL
    "dynamodb:List*",
    "dynamodb:Describe*",
    "dynamodb:Scan",
    
    // Backup
    "backup:List*",
    "backup:Describe*",
    "backup:Get*",
    
    // Glacier - Archive storage
    "glacier:List*",
    "glacier:Describe*",
    
    // Redshift - Data warehouse
    "redshift:Describe*",
  ];

  // Política 2: Security & Monitoring
  const permissionsPolicy2 = [
    // IAM - Identidade e acesso
    "iam:List*",
    "iam:Get*",
    "iam:GenerateCredentialReport",
    "iam:GenerateServiceLastAccessedDetails",
    
    // CloudWatch - Monitoramento e logs
    "cloudwatch:Describe*",
    "cloudwatch:Get*",
    "cloudwatch:List*",
    "logs:Describe*",
    "logs:Get*",
    "logs:FilterLogEvents",
    
    // CloudTrail - Auditoria
    "cloudtrail:Describe*",
    "cloudtrail:Get*",
    "cloudtrail:List*",
    "cloudtrail:LookupEvents",
    
    // KMS - Gerenciamento de chaves
    "kms:List*",
    "kms:Describe*",
    "kms:Get*",
    "kms:GetKeyRotationStatus",
    
    // GuardDuty - Threat detection
    "guardduty:Get*",
    "guardduty:List*",
    
    // Security Hub
    "securityhub:Get*",
    "securityhub:List*",
    "securityhub:Describe*",
    
    // Inspector - Security assessments
    "inspector:Describe*",
    "inspector:List*",
    
    // Config - Compliance
    "config:Describe*",
    "config:Get*",
    "config:List*",
    
    // Secrets Manager
    "secretsmanager:List*",
    "secretsmanager:Describe*",
    
    // ACM - Certificate Manager
    "acm:List*",
    "acm:Describe*",
    "acm:Get*",
    
    // Trusted Advisor
    "trustedadvisor:Describe*",
    
    // Support
    "support:Describe*",
    
    // Health
    "health:Describe*",
  ];

  // Política 3: Networking, Containers & Costs
  const permissionsPolicy3 = [
    // ELB/ALB - Load Balancers
    "elasticloadbalancing:Describe*",
    "elasticloadbalancingv2:Describe*",
    
    // CloudFront - CDN
    "cloudfront:List*",
    "cloudfront:Get*",
    
    // WAF - Web Application Firewall
    "waf:Get*",
    "waf:List*",
    "wafv2:Get*",
    "wafv2:List*",
    "wafv2:Describe*",
    
    // Lambda - Serverless
    "lambda:List*",
    "lambda:Get*",
    
    // Auto Scaling
    "autoscaling:Describe*",
    
    // ECS - Containers
    "ecs:Describe*",
    "ecs:List*",
    
    // EKS - Kubernetes
    "eks:Describe*",
    "eks:List*",
    
    // Cost Explorer - Análise de custos
    "ce:Get*",
    "ce:Describe*",
    "ce:List*",
    
    // Cost and Usage Reports
    "cur:Describe*",
    
    // AWS Budgets
    "budgets:View*",
    "budgets:Describe*",
    
    // Savings Plans
    "savingsplans:Describe*",
    "savingsplans:List*",
    
    // SNS/SQS - Messaging
    "sns:List*",
    "sns:Get*",
    "sqs:List*",
    "sqs:Get*",
    
    // CloudFormation - IaC
    "cloudformation:Describe*",
    "cloudformation:List*",
    "cloudformation:Get*",
    
    // Systems Manager
    "ssm:Describe*",
    "ssm:Get*",
    "ssm:List*",
    
    // Route53 - DNS
    "route53:List*",
    "route53:Get*",
    
    // Organizations
    "organizations:Describe*",
    "organizations:List*",
    
    // Well-Architected Tool
    "wellarchitected:Get*",
    "wellarchitected:List*",
    
    // Resource Groups & Tags
    "resource-groups:List*",
    "resource-groups:Get*",
    "tag:Get*",
    "tag:Describe*",
    
    // Service Quotas
    "servicequotas:Get*",
    "servicequotas:List*",
    
    // API Gateway
    "apigateway:GET",
    
    // EventBridge
    "events:Describe*",
    "events:List*",
    
    // Step Functions
    "states:Describe*",
    "states:List*",
  ];

  // Todas as permissões combinadas
  const allPermissions = [...permissionsPolicy1, ...permissionsPolicy2, ...permissionsPolicy3];

  const iamPolicy1 = {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "EVOPlatformPart1",
        "Effect": "Allow",
        "Action": permissionsPolicy1,
        "Resource": "*"
      }
    ]
  };

  const iamPolicy2 = {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "EVOPlatformPart2",
        "Effect": "Allow",
        "Action": permissionsPolicy2,
        "Resource": "*"
      }
    ]
  };

  const iamPolicy3 = {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "EVOPlatformPart3",
        "Effect": "Allow",
        "Action": permissionsPolicy3,
        "Resource": "*"
      }
    ]
  };

  const copyPolicy1 = () => {
    navigator.clipboard.writeText(JSON.stringify(iamPolicy1, null, 2));
    toast({
      title: "Política 1 copiada!",
      description: "Core Compute & Storage - cole no AWS IAM"
    });
  };

  const copyPolicy2 = () => {
    navigator.clipboard.writeText(JSON.stringify(iamPolicy2, null, 2));
    toast({
      title: "Política 2 copiada!",
      description: "Security & Monitoring - cole no AWS IAM"
    });
  };

  const copyPolicy3 = () => {
    navigator.clipboard.writeText(JSON.stringify(iamPolicy3, null, 2));
    toast({
      title: "Política 3 copiada!",
      description: "Networking, Containers & Costs - cole no AWS IAM"
    });
  };

  const copyMissingPermissions = () => {
    if (!validationResult?.missingPermissions?.length) return;
    
    const missingPolicy = {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "MissingPermissions",
          "Effect": "Allow",
          "Action": validationResult.missingPermissions,
          "Resource": "*"
        }
      ]
    };
    
    navigator.clipboard.writeText(JSON.stringify(missingPolicy, null, 2));
    toast({
      title: "Permissões faltantes copiadas!",
      description: `${validationResult.missingPermissions.length} permissões copiadas para a área de transferência`
    });
  };

  const validatePermissions = async () => {
    setIsValidating(true);
    setValidationResult(null);

    try {
      // Usar a conta AWS selecionada do contexto global
      if (!selectedAccountId) {
        setValidationResult({
          success: false,
          message: "Nenhuma conta AWS selecionada. Selecione uma conta no seletor do cabeçalho."
        });
        toast({
          title: "Erro",
          description: "Selecione uma conta AWS primeiro",
          variant: "destructive"
        });
        return;
      }

      // Validar com edge function usando accountId do contexto global
      const result = await apiClient.invoke('validate-aws-credentials', {
        body: {
          accountId: selectedAccountId
        }
      });

      if (result.error) {
        console.error('Validation error:', result.error);
        throw new Error(result.error.message || 'Validation failed');
      }

      const data = result.data;

      if (data?.isValid) {
        // CRITICAL: Invalidate the banner cache to reflect new validation status
        queryClient.invalidateQueries({ queryKey: ['aws-validation-status-banner'] });
        
        if (data.has_all_permissions) {
          setValidationResult({
            success: true,
            message: `✅ ${data.required_permissions_count || 'Todas as'} permissões AWS validadas! Conta: ${data.accountId || 'N/A'}`
          });
          toast({
            title: "✅ Permissões perfeitas!",
            description: `${data.required_permissions_count} permissões exatas validadas`
          });
        } else {
          const missingPerms = data.missing_permissions || [];
          const extraPerms = data.extra_permissions || [];
          const issues = [];
          
          if (missingPerms.length > 0) issues.push(`${missingPerms.length} faltando`);
          if (extraPerms.length > 0) issues.push(`${extraPerms.length} extras`);
          
          setValidationResult({
            success: false,
            message: `⚠️ ${issues.join(' e ')} - Total esperado: ${data.required_permissions_count}`,
            missingPermissions: missingPerms,
            extraPermissions: extraPerms
          });
          toast({
            title: "⚠️ Permissões incorretas",
            description: issues.join(' e '),
            variant: "default"
          });
        }
      } else {
        setValidationResult({
          success: false,
          message: data?.error || "❌ Falha na validação das credenciais AWS."
        });
        toast({
          title: "❌ Validação falhou",
          description: data?.error || "Verifique suas credenciais",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Erro na validação:', error);
      
      let errorMessage = "Erro ao validar permissões. Verifique se as credenciais AWS estão configuradas corretamente.";
      
      // Parse specific error messages
      if (error instanceof Error) {
        if (error.message.includes('FunctionsRelayError') || error.message.includes('non-2xx')) {
          errorMessage = "Falha na conexão com AWS. Verifique se o stack CloudFormation foi criado corretamente.";
        } else {
          errorMessage = error.message;
        }
      }
      
      setValidationResult({
        success: false,
        message: `❌ ${errorMessage}`
      });
      toast({
        title: "Erro na validação",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-600" />
          {t("permissions.title")}
        </CardTitle>
        <CardDescription>
          {t("permissions.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!validationResult && (
          <Alert>
            <AlertDescription>
              Execute a validação abaixo para verificar se as permissões AWS estão configuradas corretamente.
            </AlertDescription>
          </Alert>
        )}

        {validationResult && (
          <Alert variant={validationResult.success ? "default" : "destructive"}>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                {validationResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 mt-0.5" />
                )}
                <AlertDescription>{validationResult.message}</AlertDescription>
              </div>
              
              {!validationResult.success && validationResult.missingPermissions && validationResult.missingPermissions.length > 0 && (
                <div className="ml-7 space-y-3">
                  <div className="text-sm font-semibold">❌ Permissões faltantes ({validationResult.missingPermissions.length}):</div>
                  <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-lg">
                    <ul className="text-xs space-y-1 font-mono">
                      {validationResult.missingPermissions.map((perm, idx) => (
                        <li key={idx} className="text-destructive">• {perm}</li>
                      ))}
                    </ul>
                  </div>
                  <Button 
                    onClick={copyMissingPermissions}
                    variant="outline" 
                    size="sm"
                    className="w-full"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copiar JSON das Permissões Faltantes
                  </Button>
                </div>
              )}
              
              {!validationResult.success && validationResult.extraPermissions && validationResult.extraPermissions.length > 0 && (
                <div className="ml-7 space-y-3 mt-3">
                  <div className="text-sm font-semibold">⚠️ Permissões extras desnecessárias ({validationResult.extraPermissions.length}):</div>
                  <div className="bg-orange-500/10 border border-orange-500/20 p-3 rounded-lg">
                    <ul className="text-xs space-y-1 font-mono">
                      {validationResult.extraPermissions.map((perm, idx) => (
                        <li key={idx} className="text-orange-600 dark:text-orange-400">• {perm}</li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Estas permissões não são necessárias para a plataforma funcionar. Você pode removê-las para seguir o princípio do menor privilégio.
                  </p>
                </div>
              )}
            </div>
          </Alert>
        )}

        <div className="space-y-2">
          <h3 className="font-semibold">{t("permissions.requiredPermissions")}</h3>
          
          <div className="grid gap-2 p-4 bg-muted/30 rounded-lg text-sm mb-4">
            <div>
              <strong className="text-primary">📊 Total: {allPermissions.length} permissões read-only (divididas em 3 políticas)</strong>
            </div>
            <div className="grid grid-cols-3 gap-y-1 gap-x-4 mt-2 text-xs">
              <div>✅ EC2, RDS, S3</div>
              <div>✅ IAM, CloudWatch</div>
              <div>✅ ELB, Lambda, ECS</div>
              <div>✅ ElastiCache, DynamoDB</div>
              <div>✅ CloudTrail, KMS</div>
              <div>✅ Cost Explorer</div>
              <div>✅ Backup, Glacier</div>
              <div>✅ GuardDuty, SecurityHub</div>
              <div>✅ WAF, CloudFront</div>
            </div>
          </div>

          <Alert className="bg-amber-500/10 border-amber-500/30 mb-4">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-sm">
              <strong>⚠️ AWS limita políticas a 2048 caracteres.</strong> Por isso, as permissões foram divididas em <strong>3 políticas</strong> que devem ser criadas separadamente e anexadas ao mesmo usuário IAM.
            </AlertDescription>
          </Alert>

          <Collapsible>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-sm">Lista Completa de Permissões</h4>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  <ChevronDown className="w-4 h-4 mr-1" />
                  Ver todas ({allPermissions.length})
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <div className="bg-muted/30 p-3 rounded-lg max-h-60 overflow-y-auto mb-3">
                <div className="text-xs font-mono space-y-1">
                  {allPermissions.map((perm, idx) => (
                    <div
                      key={idx}
                      className="text-muted-foreground hover:text-foreground hover:bg-muted/50 p-1 rounded cursor-pointer transition-colors"
                      onClick={() => {
                        navigator.clipboard.writeText(perm);
                        toast({ description: `✅ Copiado: ${perm}` });
                      }}
                      title="Clique para copiar"
                    >
                      {perm}
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                💡 Clique em qualquer permissão para copiá-la individualmente
              </p>
            </CollapsibleContent>
          </Collapsible>

          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            <li><strong>EC2:</strong> Describe* - Análise completa de instâncias, volumes, snapshots, VPCs, security groups</li>
            <li><strong>RDS:</strong> Describe*, ListTagsForResource - Configurações de bancos de dados, Multi-AZ, encryption</li>
            <li><strong>S3:</strong> List*, GetBucket* - Verificar encryption, public access, versioning, logging</li>
            <li><strong>IAM:</strong> List*, Get* - Usuários, MFA, rotação de keys, password policy, roles</li>
            <li><strong>CloudWatch:</strong> GetMetricStatistics, Describe*, List* - Alarmes, métricas, logs para monitoramento</li>
            <li><strong>CloudTrail:</strong> Describe*, LookupEvents - Auditoria e compliance</li>
            <li><strong>KMS:</strong> List*, Describe*, GetKeyRotationStatus - Encryption at rest</li>
            <li><strong>Lambda:</strong> List*, Get* - Funções serverless, configurações</li>
            <li><strong>ElastiCache:</strong> DescribeCacheClusters - Redis/Memcached clusters e métricas</li>
            <li><strong>ECS:</strong> ListClusters, ListServices - Containers e serviços ECS</li>
            <li><strong>ELB/ALB:</strong> DescribeLoadBalancers - Load balancers clássicos e application</li>
            <li><strong>CloudFront:</strong> ListDistributions - CDN e distribuições</li>
            <li><strong>WAF:</strong> ListWebACLs - Web Application Firewall</li>
            <li><strong>Cost Explorer:</strong> GetCost*, GetReservation*, GetSavingsPlans* - Análise de custos e RI/SP</li>
            <li><strong>Config:</strong> Describe*, GetCompliance* - Compliance e configurações</li>
            <li><strong>Systems Manager:</strong> Describe*, GetInventory - Inventário de recursos</li>
          </ul>
        </div>

        <Alert className="bg-primary/5 border-primary/20">
          <AlertDescription className="text-sm">
            <strong>✅ Permissões Read-Only:</strong> Todas as permissões são de leitura (Describe*, List*, Get*). 
            A aplicação <strong>NUNCA</strong> modifica seus recursos AWS, apenas os analisa para fornecer recomendações.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <h3 className="font-semibold">{t("permissions.howToApply")}</h3>
          <div className="bg-muted p-4 rounded-lg space-y-3">
            <p className="text-sm font-medium">{t("permissions.steps.title")}</p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>{t("permissions.steps.step1")}</li>
              <li>{t("permissions.steps.step2")}</li>
              <li>Cole a <strong>Política 1</strong> (Core Compute & Storage) e crie com nome "EVOPlatformPart1"</li>
              <li>Repita e cole a <strong>Política 2</strong> (Security & Monitoring) com nome "EVOPlatformPart2"</li>
              <li>Repita e cole a <strong>Política 3</strong> (Networking, Containers & Costs) com nome "EVOPlatformPart3"</li>
              <li>Anexe <strong>as 3 políticas</strong> ao usuário IAM</li>
            </ol>
          </div>
        </div>

        {/* Política 1 */}
        <div className="space-y-3 p-4 border border-primary/30 rounded-lg bg-primary/5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-primary">📦 Política 1: Core Compute & Storage</h3>
              <p className="text-xs text-muted-foreground">{permissionsPolicy1.length} permissões - Nome: EVOPlatformPart1</p>
            </div>
            <Button onClick={copyPolicy1} size="sm" className="gap-2">
              <Copy className="w-4 h-4" />
              Copiar Política 1
            </Button>
          </div>
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                <ChevronDown className="w-4 h-4 mr-2" />
                Ver JSON da Política 1
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="bg-slate-950 text-slate-50 p-4 rounded-lg mt-2">
                <pre className="text-xs overflow-x-auto">
                  {JSON.stringify(iamPolicy1, null, 2)}
                </pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Política 2 */}
        <div className="space-y-3 p-4 border border-amber-500/30 rounded-lg bg-amber-500/5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-amber-600 dark:text-amber-400">🔒 Política 2: Security & Monitoring</h3>
              <p className="text-xs text-muted-foreground">{permissionsPolicy2.length} permissões - Nome: EVOPlatformPart2</p>
            </div>
            <Button onClick={copyPolicy2} size="sm" variant="outline" className="gap-2 border-amber-500/50 hover:bg-amber-500/10">
              <Copy className="w-4 h-4" />
              Copiar Política 2
            </Button>
          </div>
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                <ChevronDown className="w-4 h-4 mr-2" />
                Ver JSON da Política 2
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="bg-slate-950 text-slate-50 p-4 rounded-lg mt-2">
                <pre className="text-xs overflow-x-auto">
                  {JSON.stringify(iamPolicy2, null, 2)}
                </pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Política 3 */}
        <div className="space-y-3 p-4 border border-secondary/30 rounded-lg bg-secondary/5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-secondary-foreground">🌐 Política 3: Networking, Containers & Costs</h3>
              <p className="text-xs text-muted-foreground">{permissionsPolicy3.length} permissões - Nome: EVOPlatformPart3</p>
            </div>
            <Button onClick={copyPolicy3} size="sm" variant="secondary" className="gap-2">
              <Copy className="w-4 h-4" />
              Copiar Política 3
            </Button>
          </div>
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                <ChevronDown className="w-4 h-4 mr-2" />
                Ver JSON da Política 3
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="bg-slate-950 text-slate-50 p-4 rounded-lg mt-2">
                <pre className="text-xs overflow-x-auto">
                  {JSON.stringify(iamPolicy3, null, 2)}
                </pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={validatePermissions}
            disabled={isValidating}
            variant="default"
          >
            {isValidating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Validando...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Verificar Permissões
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => window.open('https://console.aws.amazon.com/iam/home#/users', '_blank')}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            {t("permissions.openIAM")}
          </Button>
          <Button
            variant="outline"
            onClick={() => window.open('https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_create.html', '_blank')}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            {t("permissions.documentation")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
