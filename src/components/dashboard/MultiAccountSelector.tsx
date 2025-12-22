import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { awsDataService } from "@/integrations/aws/data-service";

interface MultiAccountSelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
}

export const MultiAccountSelector = ({ value, onValueChange }: MultiAccountSelectorProps) => {
  const { data: accounts, isLoading } = useQuery({
    queryKey: ['aws-accounts'],
    queryFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      
      const orgId = await awsDataService.getCurrentUserOrganization();
      if (!orgId) throw new Error('Organization not found');

      const { data, error } = await awsDataService
        .from('aws_credentials')
        .select('*');
      
      
      return data;
    },
  });

  if (isLoading || !accounts || accounts.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium">Conta AWS:</label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-[250px]">
          <SelectValue placeholder="Selecione uma conta" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.account_name} {account.account_id ? `(${account.account_id})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
