import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { Layout } from "@/components/Layout";
import { AdvancedRISPAnalyzerV2 } from "@/components/cost-analysis/AdvancedRISPAnalyzerV2";
import { useDemoAwareQuery } from "@/hooks/useDemoAwareQuery";
import { 
  DollarSign, 
  AlertTriangle,
  Shield
} from "lucide-react";

export default function RISavingsPlans() {
  const { t } = useTranslation();
  const { selectedAccountId, selectedAccount } = useCloudAccount();
  const { isInDemoMode } = useDemoAwareQuery();
  
  // Get regions from selected account (default to us-east-1 if not set)
  const accountRegions = selectedAccount?.regions?.length ? selectedAccount.regions : ['us-east-1'];
  
  // In demo mode, use 'demo' as accountId to trigger demo data from backend
  const effectiveAccountId = isInDemoMode ? 'demo' : selectedAccountId;
  const shouldShowAnalyzer = isInDemoMode || !!selectedAccountId;

  return (
    <Layout 
      title={t('sidebar.riSavingsPlans', 'Reserved Instances & Savings Plans')} 
      description={t('riSavingsPlans.description', 'Análise avançada e otimização de RI e Savings Plans para maximizar economia')}
      icon={<DollarSign className="h-5 w-5" />}
    >
      {shouldShowAnalyzer && effectiveAccountId ? (
        <AdvancedRISPAnalyzerV2 
          accountId={effectiveAccountId} 
          regions={accountRegions}
        />
      ) : (
        <Card >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Conta AWS Necessária
            </CardTitle>
            <CardDescription>
              Selecione uma conta AWS para realizar a análise avançada de Reserved Instances e Savings Plans
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                Para executar a análise avançada de otimização de custos, é necessário selecionar uma conta AWS no menu superior.
              </p>
              <div className="rounded-lg bg-muted/50 p-4 border space-y-2">
                <p className="text-sm font-medium">A análise avançada inclui:</p>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• Análise de padrões de uso detalhada</li>
                  <li>• Recomendações personalizadas de RI e SP</li>
                  <li>• Cálculos precisos de economia potencial</li>
                  <li>• Sugestões de right-sizing e Spot instances</li>
                  <li>• Otimização de agendamento automático</li>
                  <li>• Relatórios executivos completos</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </Layout>
  );
}