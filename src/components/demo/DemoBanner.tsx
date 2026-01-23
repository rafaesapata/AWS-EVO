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
import { AlertTriangle, Clock, Rocket, X, Mail, Phone, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DemoBannerProps {
  className?: string;
}

export function DemoBanner({ className }: DemoBannerProps) {
  const { t } = useTranslation();
  const { isDemoMode, isLoading, isVerified, demoExpiresAt, organizationName } = useDemoMode();
  const [showContactModal, setShowContactModal] = useState(false);

  // CRÍTICO: Não renderiza NADA durante carregamento ou se não verificado
  // Isso garante que orgs normais NUNCA vejam o banner
  if (isLoading || !isVerified) {
    return null;
  }

  // Só renderiza se demo mode está EXPLICITAMENTE ativo
  if (!isDemoMode) {
    return null;
  }

  // Calcular dias restantes se houver data de expiração
  const daysRemaining = demoExpiresAt 
    ? Math.max(0, Math.ceil((new Date(demoExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

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
          onClick={() => setShowContactModal(true)}
        >
          <Rocket className="h-3.5 w-3.5 mr-1.5" />
          {t('demo.banner.activateReal', 'Ativar Conta Real')}
        </Button>
      </div>

      {/* Modal de Contato para Ativar Conta Real */}
      <Dialog open={showContactModal} onOpenChange={setShowContactModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              {t('demo.contact.title', 'Ativar Sua Conta Real')}
            </DialogTitle>
            <DialogDescription>
              {t('demo.contact.description', 'Entre em contato com nossa equipe comercial para ativar sua conta com dados reais e aproveitar todos os recursos da plataforma.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {organizationName && (
              <div className="text-sm text-muted-foreground">
                {t('demo.contact.organization', 'Organização')}: <span className="font-medium text-foreground">{organizationName}</span>
              </div>
            )}

            <div className="space-y-3">
              <a
                href="mailto:comercial@udstec.io?subject=Ativar%20Conta%20Real%20-%20EVO%20Platform"
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <div className="p-2 rounded-full bg-primary/10">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">{t('demo.contact.email', 'Email')}</div>
                  <div className="text-sm text-muted-foreground">comercial@udstec.io</div>
                </div>
              </a>

              <a
                href="tel:+5511999999999"
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <div className="p-2 rounded-full bg-green-500/10">
                  <Phone className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <div className="font-medium">{t('demo.contact.phone', 'Telefone')}</div>
                  <div className="text-sm text-muted-foreground">+55 (11) 99999-9999</div>
                </div>
              </a>

              <a
                href="https://wa.me/5511999999999?text=Olá!%20Gostaria%20de%20ativar%20minha%20conta%20real%20na%20plataforma%20EVO."
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <div className="p-2 rounded-full bg-green-500/10">
                  <MessageSquare className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <div className="font-medium">{t('demo.contact.whatsapp', 'WhatsApp')}</div>
                  <div className="text-sm text-muted-foreground">{t('demo.contact.whatsappDesc', 'Fale conosco agora')}</div>
                </div>
              </a>
            </div>

            <div className="pt-2 text-xs text-muted-foreground text-center">
              {t('demo.contact.note', 'Nossa equipe responderá em até 24 horas úteis.')}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DemoBanner;
