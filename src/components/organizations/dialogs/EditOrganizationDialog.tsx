/**
 * Dialog for editing an organization
 */
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { Organization } from "../types";

interface EditOrganizationDialogProps {
  organization: Organization | null;
  onClose: () => void;
  onOrganizationChange: (org: Organization | null) => void;
  onSubmit: () => void;
  isPending: boolean;
}

export function EditOrganizationDialog({
  organization,
  onClose,
  onOrganizationChange,
  onSubmit,
  isPending,
}: EditOrganizationDialogProps) {
  const { t } = useTranslation();

  if (!organization) return null;

  return (
    <Dialog open={!!organization} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('organizations.editOrg', 'Editar Organização')}</DialogTitle>
          <DialogDescription>
            {t('organizations.editOrgDescription', 'Atualize as informações da organização')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">{t('organizations.orgName', 'Nome da Organização')}</Label>
              <Input
                id="edit-name"
                value={organization.name}
                onChange={(e) => onOrganizationChange({ ...organization, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-domain">{t('organizations.domain', 'Domínio')}</Label>
              <Input
                id="edit-domain"
                value={organization.domain}
                onChange={(e) => onOrganizationChange({ ...organization, domain: e.target.value })}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="edit-description">{t('organizations.description', 'Descrição')}</Label>
            <Textarea
              id="edit-description"
              value={organization.description}
              onChange={(e) => onOrganizationChange({ ...organization, description: e.target.value })}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-billing-email">{t('organizations.billingEmail', 'Email de Cobrança')}</Label>
            <Input
              id="edit-billing-email"
              type="email"
              value={organization.billing_email}
              onChange={(e) => onOrganizationChange({ ...organization, billing_email: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancelar')}
          </Button>
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending ? t('common.saving', 'Salvando...') : t('common.saveChanges', 'Salvar Alterações')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
