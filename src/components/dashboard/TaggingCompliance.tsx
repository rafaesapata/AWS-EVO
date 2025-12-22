import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Tag, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import { useAwsAccount } from "@/contexts/AwsAccountContext";

const REQUIRED_TAGS = ['Environment', 'Owner', 'CostCenter', 'Project', 'Application'];

interface TaggingComplianceItem {
  id: string;
  resource_type: string;
  resource_id: string;
  resource_arn: string;
  compliance_status: string;
  missing_tags: string[];
  required_tags: string[];
  tags: any;
  scan_id: string;
  created_at: string;
}

export function TaggingCompliance() {
  const { data: organizationId } = useOrganization();
  const { selectedAccountId } = useAwsAccount();

  const { data: taggingData, isLoading } = useQuery<TaggingComplianceItem[]>({
    queryKey: ['tagging-compliance', organizationId, selectedAccountId],
    queryFn: async () => {
      if (!organizationId) throw new Error('Organization not found');

      // First get security scans
      const scansResult = await apiClient.select('security_scans', {
        select: 'id',
        eq: { 
          organization_id: organizationId,
          scan_type: 'tagging_compliance',
          ...(selectedAccountId && { aws_account_id: selectedAccountId })
        }
      });
      
      if (scansResult.error) throw new Error(scansResult.error);
      
      const scanIds = scansResult.data?.map((s: any) => s.id) || [];
      if (scanIds.length === 0) return [];

      // Then get tagging compliance data
      const result = await apiClient.select('tagging_compliance', {
        select: '*',
        in: { scan_id: scanIds },
        order: { created_at: 'desc' },
        limit: 100
      });
      
      if (result.error) throw new Error(result.error);
      return result.data || [];
    },
    enabled: !!organizationId,
  });

  const compliantCount = taggingData?.filter(t => t.compliance_status === 'compliant').length || 0;
  const nonCompliantCount = taggingData?.filter(t => t.compliance_status === 'non_compliant').length || 0;
  const partialCount = taggingData?.filter(t => t.compliance_status === 'partial').length || 0;
  const totalResources = taggingData?.length || 0;
  const compliancePercentage = totalResources > 0 ? (compliantCount / totalResources) * 100 : 0;

  const byResourceType = (taggingData || []).reduce((acc: Record<string, TaggingComplianceItem[]>, item) => {
    if (!acc[item.resource_type]) {
      acc[item.resource_type] = [];
    }
    acc[item.resource_type].push(item);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tagging Compliance</CardTitle>
          <CardDescription>Carregando dados de compliance de tags...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="w-5 h-5" />
          Tagging Compliance
        </CardTitle>
        <CardDescription>
          Verificação de tags obrigatórias em recursos AWS
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className={`text-3xl font-bold ${
                  compliancePercentage >= 80 ? 'text-green-600' :
                  compliancePercentage >= 60 ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {compliancePercentage.toFixed(0)}%
                </div>
                <div className="text-sm text-muted-foreground">Compliance Geral</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{compliantCount}</div>
                <div className="text-sm text-muted-foreground">Compliant</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">{partialCount}</div>
                <div className="text-sm text-muted-foreground">Parcial</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">{nonCompliantCount}</div>
                <div className="text-sm text-muted-foreground">Não Compliant</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Progress value={compliancePercentage} className="h-3" />

        <div>
          <h3 className="text-lg font-semibold mb-3">Tags Obrigatórias</h3>
          <div className="flex flex-wrap gap-2">
            {REQUIRED_TAGS.map(tag => (
              <Badge key={tag} variant="outline" className="px-3 py-1">
                <Tag className="w-3 h-3 mr-1" />
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3">Compliance por Tipo de Recurso</h3>
          <div className="space-y-3">
            {Object.entries(byResourceType).map(([type, resources]) => {
              const typeCompliant = resources.filter(r => r.compliance_status === 'compliant').length;
              const typeTotal = resources.length;
              const typePercentage = (typeCompliant / typeTotal) * 100;

              return (
                <div key={type} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{type}</span>
                    <span className="text-sm text-muted-foreground">
                      {typeCompliant}/{typeTotal} ({typePercentage.toFixed(0)}%)
                    </span>
                  </div>
                  <Progress value={typePercentage} className="h-2" />
                </div>
              );
            })}
          </div>
        </div>

        {nonCompliantCount > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Recursos Não Compliant ({nonCompliantCount})
            </h3>
            <div className="space-y-2">
              {(taggingData || [])
                .filter(item => item.compliance_status === 'non_compliant')
                .slice(0, 10)
                .map(item => (
                  <Card key={item.resource_id} className="border-destructive/50">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="destructive">
                              <XCircle className="w-3 h-3 mr-1" />
                              Não Compliant
                            </Badge>
                            <span className="text-sm font-medium">{item.resource_type}</span>
                          </div>
                          <p className="text-sm text-muted-foreground font-mono">{item.resource_id}</p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <p className="text-sm text-muted-foreground mb-2">Tags Faltando:</p>
                        <div className="flex flex-wrap gap-1">
                          {item.missing_tags?.map(tag => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
