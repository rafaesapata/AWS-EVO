/**
 * Dialog for activating/deactivating demo mode
 */
import { useTranslation } from "react-i18next";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import type { Organization } from "../types";

interface DemoModeDialogProps {
  organization: Organization | null;
  action: 'activate' | 'deactivate' | null;
  demoDays: string;
  demoReason: string;
  onDemoDaysChange: (days: string) => void;
  onDemoReasonChange: (reason: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function DemoModeDialog({
  organization,
  action,
  demoDays,
  demoReason,
  onDemoDaysChange,
  onDemoReasonChange,
  onClose,
  onConfirm,
  isPending,
}: DemoModeDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={!!organization && !!action} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {action === 'activate' 
              ? t('demo.admin.activate', 'Ativar Demo')
              : t('demo.admin.deactivate', 'Desativar Demo')
            }
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <p>
              {action === 'activate'
                ? t('demo.admin.confirmActivate', 'Tem certeza que deseja ativar o modo demo? Todos os dados exibidos serão fictícios.')
                : t('demo.admin.confirmDeactivate', 'Tem certeza que deseja desativar o modo demo? Os dados reais serão exibidos.')
              }
            </p>
            {organization && (
              <p className="font-medium">
                {t('common.organization', 'Organização')}: {organization.name}
              </p>
            )}
            
            {action === 'activate' && (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="demo-days">{t('demo.admin.daysToExtend', 'Dias para estender')}</Label>
                  <Select value={demoDays} onValueChange={onDemoDaysChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 {t('common.days', 'dias')}</SelectItem>
                      <SelectItem value="14">14 {t('common.days', 'dias')}</SelectItem>
                      <SelectItem value="30">30 {t('common.days', 'dias')}</SelectItem>
                      <SelectItem value="60">60 {t('common.days', 'dias')}</SelectItem>
                      <SelectItem value="90">90 {t('common.days', 'dias')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="demo-reason">{t('demo.admin.reason', 'Motivo')} ({t('common.optional', 'opcional')})</Label>
                  <Textarea
                    id="demo-reason"
                    value={demoReason}
                    onChange={(e) => onDemoReasonChange(e.target.value)}
                    placeholder={t('demo.admin.reasonPlaceholder', 'Motivo da ativação/desativação...')}
                    rows={2}
                  />
                </div>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel', 'Cancelar')}</AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            disabled={isPending}
            className={action === 'activate' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-500 hover:bg-red-600'}
          >
            {isPending 
              ? t('common.processing', 'Processando...')
              : action === 'activate' 
                ? t('demo.admin.activate', 'Ativar Demo')
                : t('demo.admin.deactivate', 'Desativar Demo')
            }
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
