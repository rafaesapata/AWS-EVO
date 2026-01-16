import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { UserX, Users, AlertTriangle } from "lucide-react";

interface Profile {
  id: string;
  full_name: string;
  email: string;
  deleted_at: string | null;
}

interface UserOverageManagerProps {
  organizationId: string;
  totalSeats: number;
  activeUsersCount: number;
}

export function UserOverageManager({ organizationId, totalSeats, activeUsersCount }: UserOverageManagerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all active users
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['organization-users', organizationId],
    queryFn: async () => {
      const data = await apiClient.get('/profiles', {
        organization_id: organizationId,
        deleted_at: null,
        order: 'full_name'
      });
      
      return data as Profile[];
    }
  });

  // Soft delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await apiClient.post('/rpc/soft_delete_user', {
        _user_id: userId
      });

      
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-users'] });
      queryClient.invalidateQueries({ queryKey: ['license-status'] });
      toast({
        title: t('userOverage.userRemoved'),
        description: t('userOverage.userRemovedDesc'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('userOverage.removeError'),
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const excessUsers = activeUsersCount - totalSeats;
  const canDelete = excessUsers > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t('userOverage.title')}
            </CardTitle>
            <CardDescription>
              {t('userOverage.removeUsers')}
            </CardDescription>
          </div>
          {canDelete && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {t('userOverage.exceededBy', { count: excessUsers })}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Statistics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-muted">
            <div className="text-2xl font-semibold">{totalSeats}</div>
            <div className="text-sm text-muted-foreground">{t('userOverage.licenseLimit')}</div>
          </div>
          <div className={`p-4 rounded-lg ${canDelete ? 'bg-destructive/10' : 'bg-primary/10'}`}>
            <div className={`text-2xl font-semibold ${canDelete ? 'text-destructive' : 'text-primary'}`}>
              {activeUsersCount}
            </div>
            <div className="text-sm text-muted-foreground">{t('userOverage.activeUsers')}</div>
          </div>
          <div className={`p-4 rounded-lg ${canDelete ? 'bg-destructive/10' : 'bg-green-500/10'}`}>
            <div className={`text-2xl font-semibold ${canDelete ? 'text-destructive' : 'text-green-600'}`}>
              {canDelete ? excessUsers : totalSeats - activeUsersCount}
            </div>
            <div className="text-sm text-muted-foreground">
              {canDelete ? t('common.excess') : t('common.available')}
            </div>
          </div>
        </div>

        {canDelete && (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-destructive mb-1">
                  {t('common.actionRequired')}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {t('userOverage.description')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Users Table */}
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('auth.email')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8">
                    {t('common.loading')}
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    {t('common.noResults')}
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.full_name || t('common.notAvailable')}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                          >
                            <UserX className="h-4 w-4 mr-1" />
                            {t('userOverage.remove')}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('userOverage.confirmRemoval')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('userOverage.confirmRemovalDesc', { name: user.full_name })}
                              <br />
                              {t('userOverage.removedUserReactivate')}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteUserMutation.mutate(user.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {t('userOverage.remove')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
