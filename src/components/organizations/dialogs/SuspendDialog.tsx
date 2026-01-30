/**
 * Dialog for suspending/unsuspending an organization
 */
import { useTranslation } from "react-i18next";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Ban, CheckCircle } from "lucide-react";
import type { Organization } from "../types";

interface SuspendDialogProps {
  organization: Organization | null;
  action: 'suspend' | 'unsuspend' | null;
  reason: string;
  onReasonChange: (reason: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function SuspendDialog({
  organization,
  action,
  reason,
  onReasonChange,
  onClose,
  onConfirm,
  isPending,
}: SuspendDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={!!organization && !!action} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {action === 'suspend' ? (
              <>
                <Ban className="h-5 w-5 text-red-500" />
                {t('organizations.suspendTitle', 'Suspender Organização')}
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5 text-green-500" />
                {t('organizations.unsuspendTitle', 'Reativar Organização')}
              </>
            )}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <p>
              {action === 'suspend'
                ? t('organizations.confirmSuspend', 'Tem certeza que deseja suspender esta organização? Todas as licenças serão desativadas e os usuários não poderão acessar o sistema.')
                : t('organizations.confirmUnsuspend', 'Tem certeza que deseja reativar esta organização? As licenças válidas serão reativadas.')
              }
            </p>
            {organization && (
              <p className="font-medium">
                {t('common.organization', 'Organização')}: {organization.name}
              </p>
            )}
            
            <div className="space-y-2 pt-2">
              <Label htmlFor="suspend-reason">{t('organizations.suspendReason', 'Motivo')} ({t('common.optional', 'opcional')})</Label>
              <Textarea
                id="suspend-reason"
                value={reason}
                onChange={(e) => onReasonChange(e.target.value)}
                placeholder={action === 'suspend' 
                  ? t('organizations.suspendReasonPlaceholder', 'Motivo da suspensão...')
                  : t('organizations.unsuspendReasonPlaceholder', 'Motivo da reativação...')
                }
                rows={2}
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel', 'Cancelar')}</AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            disabled={isPending}
            className={action === 'suspend' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}
          >
            {isPending 
              ? t('common.processing', 'Processando...')
              : action === 'suspend' 
                ? t('organizations.suspend', 'Suspender')
                : t('organizations.unsuspend', 'Reativar')
            }
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
