/**
 * Dialog for viewing organization users
 */
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, User, Mail, Calendar } from "lucide-react";
import type { Organization, OrganizationUser } from "../types";

interface ViewUsersDialogProps {
  organization: Organization | null;
  users: OrganizationUser[] | undefined;
  isLoading: boolean;
  onClose: () => void;
}

export function ViewUsersDialog({
  organization,
  users,
  isLoading,
  onClose,
}: ViewUsersDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={!!organization} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('organizations.usersOf', 'Usuários de')} {organization?.name}
          </DialogTitle>
          <DialogDescription>
            {t('organizations.usersDescription', 'Lista de usuários cadastrados nesta organização')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : users && users.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('organizations.userName', 'Nome')}</TableHead>
                  <TableHead>{t('organizations.userEmail', 'Email')}</TableHead>
                  <TableHead>{t('organizations.userRole', 'Função')}</TableHead>
                  <TableHead>{t('organizations.userCreatedAt', 'Cadastrado em')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {user.full_name || t('organizations.noName', 'Sem nome')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        {user.email || t('organizations.noEmail', 'Não disponível')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'org_admin' ? 'default' : 'secondary'}>
                        {user.role === 'org_admin' 
                          ? t('organizations.roleAdmin', 'Admin') 
                          : user.role === 'super_admin'
                            ? t('organizations.roleSuperAdmin', 'Super Admin')
                            : t('organizations.roleUser', 'Usuário')
                        }
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {new Date(user.created_at).toLocaleDateString('pt-BR')}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">
                {t('organizations.noUsers', 'Nenhum usuário encontrado nesta organização')}
              </p>
            </div>
          )}
        </div>
        
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            {t('common.close', 'Fechar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
