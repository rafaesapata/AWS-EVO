/**
 * Summary cards showing organization metrics
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface OrganizationSummaryCardsProps {
  totalOrgs: number;
  activeOrgs: number;
  totalUsers: number;
  totalMonthlyCost: number;
  isLoading: boolean;
}

export function OrganizationSummaryCards({
  totalOrgs,
  activeOrgs,
  totalUsers,
  totalMonthlyCost,
  isLoading
}: OrganizationSummaryCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total de Organizações
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-12" />
          ) : (
            <div className="text-2xl font-semibold">{totalOrgs}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Organizações Ativas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-12" />
          ) : (
            <div className="text-2xl font-semibold text-green-500">{activeOrgs}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total de Usuários
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <div className="text-2xl font-semibold">{totalUsers}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Custo Total Mensal
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className="text-2xl font-semibold text-blue-500">
              ${totalMonthlyCost.toFixed(2)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
