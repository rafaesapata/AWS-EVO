/**
 * Release Seat Confirmation Dialog
 */
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import type { SeatAssignment } from "../types";

interface ReleaseSeatDialogProps {
  seat: SeatAssignment | null;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function ReleaseSeatDialog({ seat, onClose, onConfirm, isPending }: ReleaseSeatDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={!!seat} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-500" />
            {t('organizations.releaseSeatTitle', 'Liberar Assento')}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <p>
              {t('organizations.confirmReleaseSeat', 'Tem certeza que deseja liberar este assento? O usuário perderá acesso à licença.')}
            </p>
            {seat && (
              <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                <p className="font-medium">{seat.user_name || t('organizations.noName', 'Sem nome')}</p>
                <p className="text-sm text-muted-foreground">{seat.user_email || t('organizations.noEmail', 'Email não disponível')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('organizations.licensePlan', 'Licença')}: {seat.license_plan}
                </p>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel', 'Cancelar')}</AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            disabled={isPending}
            className="bg-red-500 hover:bg-red-600"
          >
            {isPending 
              ? t('common.processing', 'Processando...')
              : t('organizations.releaseSeat', 'Liberar Assento')
            }
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
