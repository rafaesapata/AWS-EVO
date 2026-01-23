/**
 * Demo Mode Components
 * 
 * Componentes para exibição do modo de demonstração.
 * Todos os componentes verificam o estado do demo mode via contexto.
 * 
 * REGRA CRÍTICA DE SEGURANÇA:
 * - Todos os componentes SÓ renderizam indicadores de demo quando:
 *   isDemoMode === true E isLoading === false E isVerified === true
 * - Durante carregamento ou erro, NUNCA exibem indicadores de demo
 */

export { DemoBanner } from './DemoBanner';
export { DemoWatermark } from './DemoWatermark';
export { DemoPageExplainer } from './DemoPageExplainer';
export { 
  DemoModeProvider, 
  useDemoMode, 
  useDemoModeOptional,
  DEMO_PAGE_DESCRIPTIONS 
} from '@/contexts/DemoModeContext';
