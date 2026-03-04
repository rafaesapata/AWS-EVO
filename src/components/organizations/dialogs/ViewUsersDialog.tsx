/**
 * Dialog for viewing organization users + creating new users
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, User, Mail, Calendar, UserPlus, ArrowLeft, Loader2 } from "lucide-react";
import type { Organization, OrganizationUser } from "../types";
import { useCreateOrganizationUser } from "../hooks/useOrganizations";

interface ViewUsersDialogProps {
  organization: Organization | null;
  users: OrganizationUser[] | undefined;
  isLoading: boolean;
  onClose: () => void;
}

const ROLE_OPTIONS = [
  { value: 'user', labelKey: 'organizations.roleUser', fallback: 'Usuário' },
  { value: 'admin', labelKey: 'organizations.roleAdmin', fallback: 'Admin' },
  { value: 'org_admin', labelKey: 'organizations.roleOrgAdmin', fallback: 'Org Admin' },
  { value: 'viewer', labelKey: 'organizations.roleViewer', fallback: 'Visualizador' },
  { value: 'auditor', labelKey: 'organizations.roleAuditor', fallback: 'Auditor' },
  { value: 'billing_admin', labelKey: 'organizations.roleBillingAdmin', fallback: 'Admin Financeiro' },
  { value: 'security_admin', labelKey: 'organizations.roleSecurityAdmin', fallback: 'Admin Segurança' },
];

export function ViewUsersDialog({
  organization,
  users,
  isLoading,
  onClose,
}: ViewUsersDialogProps) {
  const { t } = useTranslation();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', full_name: '', role: 'user', send_invite: true });

  const createUserMutation = useCreateOrganizationUser(organization?.id, () => {
    setShowCreateForm(false);
    setNewUser({ email: '', full_name: '', role: 'user', send_invite: true });
  });

  const handleCreate = () => {
    if (!newUser.email || !newUser.full_name || !newUser.role) return;
    createUserMutation.mutate(newUser);
  };

  const handleClose = () => {
    setShowCreateForm(false);
    setNewUser({ email: '', full_name: '', role: 'user', send_invite: true });
    onClose();
  };

  const getRoleBadge = (role: string) => {
    const variant = ['admin', 'org_admin', 'super_admin'].includes(role) ? 'default' as const : 'secondary' as const;
    const label = role === 'org_admin'
      ? t('organizations.roleAdmin', 'Admin')
      : role === 'super_admin'
        ? t('organizations.roleSuperAdmin', 'Super Admin')
        : role === 'admin'
          ? t('organizations.roleAdmin', 'Admin')
          : role === 'viewer'
            ? t('organizations.roleViewer', 'Visualizador')
            : role === 'auditor'
              ? t('organizations.roleAuditor', 'Auditor')
              : role === 'billing_admin'
                ? t('organizations.roleBillingAdmin', 'Admin Financeiro')
                : role === 'security_admin'
                  ? t('organizations.roleSecurityAdmin', 'Admin Segurança')
                  : t('organizations.roleUser', 'Usuário');
    return <Badge variant={variant}>{label}</Badge>;
  };

  return (
    <Dialog open={!!organization} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {showCreateForm ? (
              <>
                <UserPlus className="h-5 w-5" />
                {t('organizations.createUserTitle', 'Criar Usuário')} — {organization?.name}
              </>
            ) : (
              <>
                <Users className="h-5 w-5" />
                {t('organizations.usersOf', 'Usuários de')} {organization?.name}
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {showCreateForm
              ? t('organizations.createUserDescription', 'Preencha os dados para criar um novo usuário vinculado a esta organização')
              : t('organizations.usersDescription', 'Lista de usuários cadastrados nesta organização')
            }
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {showCreateForm ? (
            <div className="space-y-4 p-4">
              <div className="space-y-2">
                <Label htmlFor="create-user-name">{t('organizations.fullName', 'Nome completo')}</Label>
                <Input
                  id="create-user-name"
                  placeholder={t('organizations.fullNamePlaceholder', 'Nome completo do usuário')}
                  value={newUser.full_name}
                  onChange={(e) => setNewUser(prev => ({ ...prev, full_name: e.target.value }))}
                  disabled={createUserMutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-user-email">{t('organizations.emailLabel', 'Email')}</Label>
                <Input
                  id="create-user-email"
                  type="email"
                  placeholder={t('organizations.emailPlaceholder', 'email@exemplo.com')}
                  value={newUser.email}
                  onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                  disabled={createUserMutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-user-role">{t('organizations.userRole', 'Função')}</Label>
                <Select
                  value={newUser.role}
                  onValueChange={(value) => setNewUser(prev => ({ ...prev, role: value }))}
                  disabled={createUserMutation.isPending}
                >
                  <SelectTrigger id="create-user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {t(opt.labelKey, opt.fallback)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="send-invite">{t('organizations.sendInvite', 'Enviar convite por email')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('organizations.sendInviteDesc', 'O usuário receberá um email com senha temporária para primeiro acesso')}
                  </p>
                </div>
                <Switch
                  id="send-invite"
                  checked={newUser.send_invite}
                  onCheckedChange={(checked) => setNewUser(prev => ({ ...prev, send_invite: checked }))}
                  disabled={createUserMutation.isPending}
                />
              </div>
            </div>
          ) : isLoading ? (
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
                      {getRoleBadge(user.role)}
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
        
        <DialogFooter className="mt-4 flex justify-between">
          {showCreateForm ? (
            <div className="flex w-full justify-between">
              <Button
                variant="outline"
                onClick={() => setShowCreateForm(false)}
                disabled={createUserMutation.isPending}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('common.back', 'Voltar')}
              </Button>
              <Button
                className="glass hover-glow"
                onClick={handleCreate}
                disabled={createUserMutation.isPending || !newUser.email || !newUser.full_name}
              >
                {createUserMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                {createUserMutation.isPending
                  ? t('organizations.creatingUser', 'Criando...')
                  : t('organizations.createUser', 'Criar Usuário')
                }
              </Button>
            </div>
          ) : (
            <div className="flex w-full justify-between">
              <Button variant="outline" onClick={handleClose}>
                {t('common.close', 'Fechar')}
              </Button>
              <Button
                className="glass hover-glow"
                onClick={() => setShowCreateForm(true)}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                {t('organizations.addUser', 'Adicionar Usuário')}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
