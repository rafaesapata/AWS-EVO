/**
 * Demo Mode Banner
 * 
 * Banner persistente e inconfundível que indica que o sistema está em modo de demonstração.
 * Exibido no topo de TODAS as páginas quando demo_mode = true.
 * 
 * CARACTERÍSTICAS DE SEGURANÇA:
 * - Não pode ser fechado/escondido pelo usuário
 * - Cor vibrante e distintiva (amarelo/laranja)
 * - Texto claro indicando que são dados fictícios
 * - Ícone de alerta para chamar atenção
 * 
 * REGRA CRÍTICA:
 * - SÓ renderiza quando isDemoMode === true E isLoading === false
 * - Durante carregamento, retorna null (não exibe nada)
 * - Em caso de erro na verificação, retorna null (fail-safe)
 */

import React, { useState } from 'react';
import { AlertTriangle, Clock, Rocket, CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/integrations/aws/api-client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface DemoBannerProps {
  className?: string;
}

export function DemoBanner({ className }: DemoBannerProps) {
  const { t } = useTranslation();
  const { isDemoMode, isLoading, isVerified, demoExpiresAt, organizationName, refreshDemoStatus } = useDemoMode();
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  // CRÍTICO: Não renderiza NADA durante carregamento ou se não verificado
  // Isso garante que orgs normais NUNCA vejam o banner
  if (isLoading || !isVerified) {
    console.log('[DemoBanner] Not rendering - loading or not verified', { isLoading, isVerified });
    return null;
  }

  // Só renderiza se demo mode está EXPLICITAMENTE ativo
  if (!isDemoMode) {
    console.log('[DemoBanner] Not rendering - not in demo mode');
    return null;
  }
  
  console.log('[DemoBanner] Rendering demo banner', { isDemoMode, demoExpiresAt, organizationName });

  // Calcular dias restantes se houver data de expiração
  const daysRemaining = demoExpiresAt 
    ? Math.max(0, Math.ceil((new Date(demoExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  // Handler para ativar conta real (desativar demo mode)
  const handleActivateRealAccount = async () => {
    setIsActivating(true);
    try {
      const response = await apiClient.invoke<{ demo_mode: boolean; message: string }>('deactivate-demo-mode', {
        body: { confirm: true }
      });

      if (response && 'data' in response && response.data && !response.data.demo_mode) {
        toast.success(t('demo.activate.success', 'Conta ativada com sucesso!'));
        // Refresh demo status and reload page
        await refreshDemoStatus();
        setShowActivateModal(false);
        // Reload page to show real data
        window.location.reload();
      } else if (response && 'error' in response && response.error) {
        toast.error(response.error.message || t('demo.activate.error', 'Erro ao ativar conta'));
      } else {
        toast.error(t('demo.activate.error', 'Erro ao ativar conta'));
      }
    } catch (err) {
      console.error('Error activating account:', err);
      toast.error(t('demo.activate.error', 'Erro ao ativar conta. Tente novamente.'));
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <>
      <div 
        className={cn(
          'w-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500',
          'text-white py-2 px-4',
          'flex items-center justify-between gap-3',
          'text-sm font-medium',
          'shadow-lg',
          'select-none',
          className
        )}
        role="alert"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          
          <span className="font-bold uppercase tracking-wide">
            {t('demo.banner.title', '⚠️ MODO DEMONSTRAÇÃO')}
          </span>
          
          <span className="hidden sm:inline">—</span>
          
          <span className="text-amber-100 hidden md:inline">
            {t('demo.banner.description', 'Os dados exibidos são fictícios e apenas para apresentação')}
          </span>

          {daysRemaining !== null && daysRemaining <= 7 && (
            <>
              <span className="hidden lg:inline">|</span>
              <span className="hidden lg:flex items-center gap-1 text-amber-100">
                <Clock className="h-4 w-4" />
                {t('demo.banner.expires', 'Expira em {{days}} dias', { days: daysRemaining })}
              </span>
            </>
          )}
        </div>

        <Button
          size="sm"
          variant="secondary"
          className="bg-white/20 hover:bg-white/30 text-white border-white/30 text-xs px-3 py-1 h-7"
          onClick={() => setShowActivateModal(true)}
        >
          <Rocket className="h-3.5 w-3.5 mr-1.5" />
          {t('demo.banner.activateReal', 'Ativar Conta Real')}
        </Button>
      </div>

      {/* Modal de Confirmação para Ativar Conta Real */}
      <Dialog open={showActivateModal} onOpenChange={setShowActivateModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              {t('demo.activate.title', 'Ativar Sua Conta Real')}
            </DialogTitle>
            <DialogDescription>
              {t('demo.activate.description', 'Ao ativar sua conta, o modo de demonstração será desativado e você poderá conectar suas contas cloud reais para ver seus dados.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {organizationName && (
              <div className="text-sm text-muted-foreground">
                {t('demo.contact.organization', 'Organização')}: <span className="font-medium text-foreground">{organizationName}</span>
              </div>
            )}

            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  {t('demo.activate.benefit1', 'Conecte suas contas AWS e Azure reais')}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  {t('demo.activate.benefit2', 'Veja seus dados de custos e segurança reais')}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  {t('demo.activate.benefit3', 'Acesse todos os recursos da plataforma')}
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground text-center">
              {t('demo.activate.note', 'Após a ativação, você será redirecionado para conectar suas contas cloud.')}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowActivateModal(false)}
              disabled={isActivating}
            >
              {t('common.cancel', 'Cancelar')}
            </Button>
            <Button
              onClick={handleActivateRealAccount}
              disabled={isActivating}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
            >
              {isActivating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('demo.activate.activating', 'Ativando...')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {t('demo.activate.confirm', 'Ativar Minha Conta')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DemoBanner;
