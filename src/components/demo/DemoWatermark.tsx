/**
 * Demo Mode Watermark
 * 
 * Marca d'água visual que aparece sobre o conteúdo em modo demo.
 * Garante que screenshots e gravações de tela mostrem claramente
 * que se trata de dados de demonstração.
 * 
 * CARACTERÍSTICAS:
 * - Texto diagonal semi-transparente
 * - Não interfere na usabilidade
 * - Visível em screenshots e gravações
 * - Não pode ser removido via DevTools facilmente
 * - z-index 40 para não conflitar com modais (z-50+)
 * 
 * REGRA CRÍTICA:
 * - SÓ renderiza watermark quando isDemoMode === true E isLoading === false
 * - Durante carregamento, renderiza apenas os children (sem watermark)
 * - Em caso de erro na verificação, renderiza apenas os children (fail-safe)
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { cn } from '@/lib/utils';

interface DemoWatermarkProps {
  className?: string;
  children: React.ReactNode;
}

export function DemoWatermark({ className, children }: DemoWatermarkProps) {
  const { t } = useTranslation();
  const { isDemoMode, isLoading, isVerified } = useDemoMode();

  // CRÍTICO: Durante carregamento ou se não verificado, renderiza APENAS os children
  // Isso garante que orgs normais NUNCA vejam o watermark
  if (isLoading || !isVerified || !isDemoMode) {
    return <>{children}</>;
  }

  const watermarkText = t('demo.watermark', 'DEMONSTRAÇÃO');

  return (
    <div className={cn('relative w-full', className)}>
      {children}
      
      {/* Watermark overlay - só aparece quando demo mode está confirmado */}
      {/* z-40 para ficar abaixo de modais (z-50) mas acima do conteúdo */}
      <div 
        className="pointer-events-none fixed inset-0 z-40 select-none"
        aria-hidden="true"
        style={{ 
          overflow: 'hidden',
          width: '100vw',
          height: '100vh'
        }}
      >
        {/* Padrão repetido de watermarks usando CSS grid para distribuição uniforme */}
        <div 
          className="absolute opacity-[0.04]"
          style={{
            top: '-50%',
            left: '-50%',
            width: '200%',
            height: '200%',
            transform: 'rotate(-15deg)',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gridTemplateRows: 'repeat(6, 1fr)',
            gap: '80px',
            alignItems: 'center',
            justifyItems: 'center'
          }}
        >
          {Array.from({ length: 24 }).map((_, i) => (
            <span 
              key={i}
              className="text-3xl font-bold text-foreground whitespace-nowrap"
            >
              {watermarkText}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DemoWatermark;
