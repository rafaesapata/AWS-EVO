/**
 * Demo Page Explainer
 * 
 * Card explicativo que aparece em cada página no modo demo,
 * descrevendo as funcionalidades disponíveis naquela seção.
 * 
 * OBJETIVO:
 * - Educar o prospect sobre o que cada funcionalidade faz
 * - Mostrar o valor do produto mesmo com dados fictícios
 * - Facilitar a apresentação comercial
 * 
 * REGRA CRÍTICA:
 * - SÓ renderiza quando isDemoMode === true E isLoading === false
 * - Durante carregamento, retorna null (não exibe nada)
 * - Em caso de erro na verificação, retorna null (fail-safe)
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Info, CheckCircle2, Sparkles, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDemoMode, DEMO_PAGE_DESCRIPTIONS } from '@/contexts/DemoModeContext';
import { cn } from '@/lib/utils';

interface DemoPageExplainerProps {
  className?: string;
  customTitle?: string;
  customDescription?: string;
  customFeatures?: string[];
  dismissible?: boolean;
}

export function DemoPageExplainer({ 
  className,
  customTitle,
  customDescription,
  customFeatures,
  dismissible = true
}: DemoPageExplainerProps) {
  const { t } = useTranslation();
  const { isDemoMode, isLoading, isVerified } = useDemoMode();
  const location = useLocation();
  const [isDismissed, setIsDismissed] = React.useState(false);

  // CRÍTICO: Não renderiza NADA durante carregamento ou se não verificado
  // Isso garante que orgs normais NUNCA vejam o explainer
  if (isLoading || !isVerified || !isDemoMode || isDismissed) {
    return null;
  }

  // Buscar descrição da página atual ou usar custom
  const pageKey = location.pathname;
  const pageInfo = DEMO_PAGE_DESCRIPTIONS[pageKey];
  
  const title = customTitle || pageInfo?.title || t('demo.explainer.defaultTitle', 'Funcionalidade');
  const description = customDescription || pageInfo?.description || t('demo.explainer.defaultDescription', 'Esta é uma demonstração das capacidades do sistema.');
  const features = customFeatures || pageInfo?.features || [];

  return (
    <Card className={cn(
      'glass border-amber-500/30 bg-amber-500/5',
      'relative overflow-hidden',
      className
    )}>
      {/* Indicador visual de demo */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500" />
      
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Sparkles className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">{title}</CardTitle>
                <Badge variant="outline" className="border-amber-500/50 text-amber-600 text-xs">
                  {t('demo.explainer.badge', 'DEMO')}
                </Badge>
              </div>
              <CardDescription className="mt-1">
                {description}
              </CardDescription>
            </div>
          </div>
          
          {dismissible && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setIsDismissed(true)}
              aria-label={t('demo.explainer.dismiss', 'Fechar explicação')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      {features.length > 0 && (
        <CardContent className="pt-0">
          <div className="flex items-start gap-2 mb-3">
            <Info className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              {t('demo.explainer.featuresIntro', 'Nesta seção você pode explorar:')}
            </p>
          </div>
          
          <ul className="grid gap-2 sm:grid-cols-2">
            {features.map((feature, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 pt-4 border-t border-amber-500/20">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              {t('demo.explainer.note', 'Os dados exibidos são fictícios. Entre em contato para ver seus dados reais.')}
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default DemoPageExplainer;
