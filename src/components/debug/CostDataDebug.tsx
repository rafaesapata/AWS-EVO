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
          limit: 10
        });
        
        if (response1.data && response1.data.length > 0) {
          results[`aws_account_id_${accountNumber}`] = {
            count: response1.data.length,
            sample: response1.data[0],
            orgId: response1.data[0].organization_id
          };
        }
        
        // Verificar com account_id = número da conta (campo antigo)
        const response2 = await apiClient.select('daily_costs', {
          eq: { account_id: accountNumber },
          limit: 10
        });
        
        if (response2.data && response2.data.length > 0) {
          results[`account_id_${accountNumber}`] = {
            count: response2.data.length,
            sample: response2.data[0],
            orgId: response2.data[0].organization_id
          };
        }

        // Verificar com organization_id correto + aws_account_id = número da conta
        const response3 = await apiClient.select('daily_costs', {
          eq: { 
            organization_id: organizationId,
            aws_account_id: accountNumber 
          },
          limit: 10
        });
        
        if (response3.data && response3.data.length > 0) {
          results[`org_aws_account_id_${accountNumber}`] = {
            count: response3.data.length,
            sample: response3.data[0]
          };
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

  if (loadingAll || loadingOrg || loadingAccount) {
    return <div>Loading debug data...</div>;
  }

  // Analisar dados para identificar problemas
  const allCostsData = allCostsInDb?.data || [];
  const orgCostsData = orgCosts?.data || [];
  const accountCostsData = accountCosts?.data || [];

  // Agrupar dados por aws_account_id
  const accountGroups = {};
  allCostsData.forEach(record => {
    const accountId = record.aws_account_id;
    if (!accountGroups[accountId]) {
      accountGroups[accountId] = { count: 0, totalCost: 0, orgId: record.organization_id };
    }
    accountGroups[accountId].count++;
    accountGroups[accountId].totalCost += record.cost || 0;
  });

  return (
    <Card className="mb-4 border-yellow-200 bg-yellow-50">
      <CardHeader>
        <CardTitle className="text-yellow-800">🔍 Cost Data Debug - Detailed Analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Context Info */}
          <div className="space-y-2">
            <h4 className="font-semibold">📋 Context Info:</h4>
            <p className="text-sm">Organization ID: <code className="bg-gray-200 px-1 rounded">{organizationId}</code></p>
            <p className="text-sm">Selected Account ID: <code className="bg-gray-200 px-1 rounded">{selectedAccountId}</code></p>
            <p className="text-sm">Available Accounts: {accounts.length}</p>
          </div>

          {/* Database Summary */}
          <div className="space-y-2">
            <h4 className="font-semibold">🗄️ Database Summary:</h4>
            <div className="space-y-1">
              <Badge variant={allCostsData.length > 0 ? "default" : "destructive"}>
                Total records: {allCostsData.length}
              </Badge>
              <Badge variant={orgCostsData.length > 0 ? "default" : "destructive"}>
                Org records: {orgCostsData.length}
              </Badge>
              <Badge variant={accountCostsData.length > 0 ? "default" : "destructive"}>
                Account records: {accountCostsData.length}
              </Badge>
            </div>
          </div>

          {/* Account Number Check */}
          <div className="space-y-2">
            <h4 className="font-semibold">🔢 Account Number Check:</h4>
            {accountNumberCosts && Object.keys(accountNumberCosts).length > 0 ? (
              <div className="space-y-1">
                {Object.entries(accountNumberCosts).map(([key, count]) => (
                  <Badge key={key} variant="secondary" className="text-xs">
                    {key}: {count} records
                  </Badge>
                ))}
              </div>
            ) : (
              <Badge variant="outline">No records with account numbers</Badge>
            )}
          </div>
        </div>

        {/* Detailed Analysis */}
        {allCostsData.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold">📊 Cost Data by AWS Account ID:</h4>
            <div className="grid grid-cols-1 gap-2">
              {Object.entries(accountGroups).map(([accountId, info]) => {
                const isSelected = accountId === selectedAccountId;
                const isCorrectOrg = info.orgId === organizationId;
                
                return (
                  <div key={accountId} className={`p-3 rounded border ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <code className="text-xs bg-gray-100 px-1 rounded">{accountId}</code>
                        {isSelected && <Badge className="ml-2" variant="default">SELECTED</Badge>}
                        {!isCorrectOrg && <Badge className="ml-2" variant="destructive">WRONG ORG</Badge>}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{info.count} records</div>
                        <div className="text-xs text-gray-600">${info.totalCost.toFixed(2)}</div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Org: <code>{info.orgId}</code>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sample Records */}
        {allCostsData.length > 0 && (
          <div>
            <h4 className="font-semibold">📋 Sample Records (Latest 5):</h4>
            <div className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-40">
              <pre>{JSON.stringify(allCostsData.slice(0, 5), null, 2)}</pre>
            </div>
          </div>
        )}

        {/* AWS Accounts Mapping */}
        <div>
          <h4 className="font-semibold">🔗 AWS Accounts Mapping:</h4>
          <div className="space-y-2">
            {debugAccounts && Array.isArray(debugAccounts) ? (
              debugAccounts.filter(acc => acc.is_active).map(acc => (
                <div key={acc.id} className="p-2 border rounded text-sm">
                  <div className="font-medium">{acc.account_name}</div>
                  <div className="text-xs space-y-1">
                    <div>UUID: <code className="bg-gray-200 px-1 rounded">{acc.id}</code></div>
                    <div>AWS Account: <code className="bg-gray-200 px-1 rounded">{acc.aws_account_number}</code></div>
                    <div>Has Data: {accountGroups[acc.id] ? 
                      <Badge variant="default">{accountGroups[acc.id].count} records</Badge> : 
                      <Badge variant="destructive">No data</Badge>
                    }</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">No AWS accounts data</div>
            )}
          </div>
        </div>

        {/* Errors */}
        {(allCostsInDb?.error || orgCosts?.error || accountCosts?.error) && (
          <div className="space-y-2">
            <h4 className="font-semibold text-red-600">❌ Errors:</h4>
            {allCostsInDb?.error && <div className="text-red-600 text-sm">All costs: {JSON.stringify(allCostsInDb.error)}</div>}
            {orgCosts?.error && <div className="text-red-600 text-sm">Org costs: {JSON.stringify(orgCosts.error)}</div>}
            {accountCosts?.error && <div className="text-red-600 text-sm">Account costs: {JSON.stringify(accountCosts.error)}</div>}
          </div>
        )}
        
        <Button onClick={() => window.location.reload()} variant="outline" size="sm">
          Refresh Page
        </Button>
      </CardContent>
    </Card>
  );
}