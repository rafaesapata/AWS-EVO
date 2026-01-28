/**
 * Trial License Banner
 * 
 * Banner informativo que indica que a organização está em período de trial.
 * Exibido no topo de TODAS as páginas quando is_trial = true.
 * 
 * CARACTERÍSTICAS:
 * - Cor azul/roxa para diferenciar do banner de Demo (amarelo/laranja)
 * - Mostra dias restantes do trial
 * - Botão para upgrade da licença
 * 
 * REGRA CRÍTICA:
 * - SÓ renderiza quando isTrialLicense === true E isLoading === false
 */

import React from 'react';
import { Clock, Sparkles, CreditCard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTrialLicense } from '@/contexts/TrialLicenseContext';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface TrialBannerProps {
  className?: string;
}

export function TrialBanner({ className }: TrialBannerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isTrialLicense, isLoading, isVerified, daysRemaining, isExpiringSoon, isExpired } = useTrialLicense();
  const { isDemoMode } = useDemoMode();

  // Não renderiza durante carregamento ou se não verificado
  if (isLoading || !isVerified) {
    return null;
  }

  // Não renderiza se não é trial
  if (!isTrialLicense) {
    return null;
  }

  // Não renderiza se está em modo demo (demo banner tem prioridade)
  if (isDemoMode) {
    return null;
  }

  // Não renderiza se trial expirou
  if (isExpired) {
    return null;
  }

  const handleUpgrade = () => {
    navigate('/license-management');
  };

  // Determinar cor baseado nos dias restantes
  const getBannerColors = () => {
    if (daysRemaining !== null && daysRemaining <= 3) {
      // Vermelho/Rosa para urgência (3 dias ou menos)
      return 'from-rose-500 via-pink-500 to-rose-500';
    }
    if (isExpiringSoon) {
      // Roxo para alerta (7 dias ou menos)
      return 'from-purple-500 via-violet-500 to-purple-500';
    }
    // Azul para normal
    return 'from-blue-500 via-indigo-500 to-blue-500';
  };

  return (
    <div 
      className={cn(
        'w-full bg-gradient-to-r',
        getBannerColors(),
        'text-white py-2 px-4',
        'flex items-center justify-between gap-3',
        'text-sm font-medium',
        'shadow-lg',
        'select-none',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Sparkles className="h-5 w-5 flex-shrink-0" />
        
        <span className="font-bold uppercase tracking-wide">
          {t('trial.banner.title', '✨ LICENÇA TRIAL')}
        </span>
        
        <span className="hidden sm:inline">—</span>
        
        {daysRemaining !== null && (
          <span className="flex items-center gap-1.5 text-blue-100">
            <Clock className="h-4 w-4" />
            {daysRemaining === 0 ? (
              t('trial.banner.expirestoday', 'Expira hoje!')
            ) : daysRemaining === 1 ? (
              t('trial.banner.expires1day', 'Expira amanhã!')
            ) : (
              t('trial.banner.expires', '{{days}} dias restantes', { days: daysRemaining })
            )}
          </span>
        )}

        {isExpiringSoon && (
          <>
            <span className="hidden lg:inline">|</span>
            <span className="hidden lg:inline text-blue-100">
              {t('trial.banner.upgradeHint', 'Faça upgrade para continuar usando')}
            </span>
          </>
        )}
      </div>

      <Button
        size="sm"
        variant="secondary"
        className="bg-white/20 hover:bg-white/30 text-white border-white/30 text-xs px-3 py-1 h-7"
        onClick={handleUpgrade}
      >
        <CreditCard className="h-3.5 w-3.5 mr-1.5" />
        {t('trial.banner.upgrade', 'Ver Licença')}
      </Button>
    </div>
  );
}

export default TrialBanner;
