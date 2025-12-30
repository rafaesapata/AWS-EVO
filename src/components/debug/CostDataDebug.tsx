import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/aws/api-client";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function CostDataDebug() {
  const { selectedAccountId, accounts } = useAwsAccount();
  const { data: organizationId } = useOrganization();

  // Query para verificar TODOS os dados de custo no banco (sem filtros)
  const { data: allCostsInDb, isLoading: loadingAll } = useQuery({
    queryKey: ['debug-all-costs', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      console.log('🔍 DEBUG: Fetching ALL cost data from database');
      
      const response = await apiClient.select('daily_costs', {
        order: { column: 'date', ascending: false },
        limit: 50
      });
      
      console.log('🔍 DEBUG: All costs response:', response);
      return response;
    }
  });

  // Query para verificar dados da organização específica
  const { data: orgCosts, isLoading: loadingOrg } = useQuery({
    queryKey: ['debug-org-costs', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      console.log('🔍 DEBUG: Fetching costs for organization:', organizationId);
      
      const response = await apiClient.select('daily_costs', {
        eq: { organization_id: organizationId },
        order: { column: 'date', ascending: false },
        limit: 20
      });
      
      console.log('🔍 DEBUG: Org costs response:', response);
      return response;
    }
  });

  // Query para verificar dados da conta selecionada
  const { data: accountCosts, isLoading: loadingAccount } = useQuery({
    queryKey: ['debug-account-costs', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    queryFn: async () => {
      console.log('🔍 DEBUG: Fetching costs for account:', selectedAccountId);
      
      const response = await apiClient.select('daily_costs', {
        eq: { organization_id: organizationId, aws_account_id: selectedAccountId },
        order: { column: 'date', ascending: false },
        limit: 10
      });
      
      console.log('🔍 DEBUG: Account costs response:', response);
      return response;
    }
  });

  // Query para verificar se há dados com números de conta AWS
  const { data: accountNumberCosts } = useQuery({
    queryKey: ['debug-account-number-costs', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      console.log('🔍 DEBUG: Checking for costs with AWS account numbers');
      
      const results = {};
      const accountNumbers = ['103548788372', '563366818355'];
      
      for (const accountNumber of accountNumbers) {
        // Verificar com aws_account_id = número da conta
        const response1 = await apiClient.select('daily_costs', {
          eq: { aws_account_id: accountNumber },
          limit: 5
        });
        
        if (response1.data && response1.data.length > 0) {
          results[`aws_account_id_${accountNumber}`] = response1.data.length;
        }
        
        // Verificar com account_id = número da conta (campo antigo)
        const response2 = await apiClient.select('daily_costs', {
          eq: { account_id: accountNumber },
          limit: 5
        });
        
        if (response2.data && response2.data.length > 0) {
          results[`account_id_${accountNumber}`] = response2.data.length;
        }
      }
      
      console.log('🔍 DEBUG: Account number results:', results);
      return results;
    }
  });

  // Query para verificar contas AWS
  const { data: debugAccounts } = useQuery({
    queryKey: ['debug-aws-accounts', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const response = await apiClient.invoke('list-aws-credentials', {});
      console.log('🔍 DEBUG: AWS accounts response:', response);
      return response.data;
    }
  });

  if (isLoading) {
    return <div>Loading debug data...</div>;
  }

  return (
    <Card className="mb-4 border-yellow-200 bg-yellow-50">
      <CardHeader>
        <CardTitle className="text-yellow-800">🔍 Cost Data Debug</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-semibold">Context Info:</h4>
          <p>Organization ID: {organizationId}</p>
          <p>Selected Account ID: {selectedAccountId}</p>
          <p>Available Accounts: {accounts.length}</p>
        </div>
        
        <div>
          <h4 className="font-semibold">Raw Data Results:</h4>
          <p>All data records: {rawCosts?.allData?.length || 0}</p>
          <p>Filtered data records: {rawCosts?.filteredData?.length || 0}</p>
          {rawCosts?.allDataError && (
            <p className="text-red-600">All data error: {JSON.stringify(rawCosts.allDataError)}</p>
          )}
          {rawCosts?.filteredError && (
            <p className="text-red-600">Filtered error: {JSON.stringify(rawCosts.filteredError)}</p>
          )}
        </div>
        
        {rawCosts?.allData && rawCosts.allData.length > 0 && (
          <div>
            <h4 className="font-semibold">Sample Records:</h4>
            <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
              {JSON.stringify(rawCosts.allData.slice(0, 3), null, 2)}
            </pre>
          </div>
        )}
        
        <div>
          <h4 className="font-semibold">AWS Accounts Debug:</h4>
          <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
            {JSON.stringify(debugAccounts, null, 2)}
          </pre>
        </div>
        
        <Button onClick={() => refetch()} variant="outline" size="sm">
          Refresh Debug Data
        </Button>
      </CardContent>
    </Card>
  );
}