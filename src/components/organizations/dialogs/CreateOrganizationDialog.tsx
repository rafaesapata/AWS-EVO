/**
 * Dialog for creating a new organization
 */
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { NewOrganization } from "../types";

interface CreateOrganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newOrg: NewOrganization;
  onNewOrgChange: (org: NewOrganization) => void;
  onSubmit: () => void;
  isPending: boolean;
}

export function CreateOrganizationDialog({
  open,
  onOpenChange,
  newOrg,
  onNewOrgChange,
  onSubmit,
  isPending,
}: CreateOrganizationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Criar Nova Organização</DialogTitle>
          <DialogDescription>
            Adicione uma nova organização ao sistema multi-tenant
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Organização</Label>
              <Input
                id="name"
                value={newOrg.name}
                onChange={(e) => onNewOrgChange({ ...newOrg, name: e.target.value })}
                placeholder="Acme Corporation"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="domain">Domínio</Label>
              <Input
                id="domain"
                value={newOrg.domain}
                onChange={(e) => onNewOrgChange({ ...newOrg, domain: e.target.value })}
                placeholder="acme.com"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={newOrg.description}
              onChange={(e) => onNewOrgChange({ ...newOrg, description: e.target.value })}
              placeholder="Descrição da organização"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="billing_email">Email de Cobrança</Label>
            <Input
              id="billing_email"
              type="email"
              value={newOrg.billing_email}
              onChange={(e) => onNewOrgChange({ ...newOrg, billing_email: e.target.value })}
              placeholder="billing@acme.com"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending ? 'Criando...' : 'Criar Organização'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
