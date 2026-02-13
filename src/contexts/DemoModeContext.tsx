/**
 * Demo Mode Context
 * 
 * ARQUITETURA DE SEGURANÇA:
 * 1. A flag demo_mode vem EXCLUSIVAMENTE do backend (tabela organizations)
 * 2. Frontend NUNCA gera dados fictícios - apenas exibe dados que vêm do backend
 * 3. Backend retorna dados demo APENAS quando organization.demo_mode = true
 * 4. Indicador visual persistente e inconfundível quando em modo demo
 * 
 * REGRA CRÍTICA DE SEGURANÇA:
 * - isDemoMode SEMPRE inicia como FALSE e só muda para TRUE após confirmação do backend
 * - Durante carregamento (isLoading=true), isDemoMode permanece FALSE
 * - Isso garante que NUNCA exibimos indicadores de demo para orgs normais
 * - Componentes de demo SÓ renderizam quando isDemoMode === true E isLoading === false E isVerified === true
 * 
 * FLUXO:
 * 1. Login → Backend verifica organization.demo_mode
 * 2. Se demo_mode = true, todas as APIs retornam dados demo do backend
 * 3. Frontend exibe banner/watermark de demonstração
 * 4. Logs de auditoria registram acesso em modo demo
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import { apiClient } from '@/integrations/aws/api-client';
import { cognitoAuth } from '@/integrations/aws/cognito-client-simple';

interface DemoModeState {
  /**
   * CRÍTICO: isDemoMode só é TRUE quando:
   * 1. Backend confirmou que organization.demo_mode = true
   * 2. isLoading = false (carregamento completo)
   * 3. isVerified = true (verificação bem-sucedida)
   * 4. Demo não expirou (verificação local adicional)
   * 
   * Durante carregamento ou em caso de erro, SEMPRE é FALSE
   */
  isDemoMode: boolean;
  
  /**
   * Indica se estamos carregando o status do demo mode
   * Componentes NÃO devem exibir nada de demo enquanto isLoading = true
   */
  isLoading: boolean;
  
  /**
   * Indica se o status foi verificado com sucesso
   * Se false após isLoading=false, significa que houve erro na verificação
   */
  isVerified: boolean;
  
  /** Data/hora em que o demo foi ativado */
  demoActivatedAt: string | null;
  
  /** Data/hora em que o demo expira */
  demoExpiresAt: string | null;
  
  /** Nome da organização */
  organizationName: string | null;
  
  /** Dias restantes até expiração (null se não há expiração) */
  daysRemaining: number | null;
  
  /** Se o demo está próximo de expirar (7 dias ou menos) */
  isExpiringSoon: boolean;
}

interface DemoModeContextType extends DemoModeState {
  /** Força uma nova verificação do status do demo mode */
  refreshDemoStatus: () => Promise<void>;
}

const DemoModeContext = createContext<DemoModeContextType | undefined>(undefined);

// Descrições das funcionalidades por página para exibir no modo demo
export const DEMO_PAGE_DESCRIPTIONS: Record<string, { title: string; description: string; features: string[] }> = {
  '/app': {
    title: 'Dashboard Executivo',
    description: 'Visão consolidada de custos, segurança e compliance de todas as suas contas cloud.',
    features: [
      'Resumo de gastos por serviço e região',
      'Score de segurança em tempo real',
      'Alertas críticos e recomendações',
      'Tendências de custos e previsões'
    ]
  },
  '/dashboard': {
    title: 'Dashboard Executivo',
    description: 'Visão consolidada de custos, segurança e compliance de todas as suas contas cloud.',
    features: [
      'Resumo de gastos por serviço e região',
      'Score de segurança em tempo real',
      'Alertas críticos e recomendações',
      'Tendências de custos e previsões'
    ]
  },
  '/security-posture': {
    title: 'Security Engine V3',
    description: 'Análise de segurança com 170+ verificações em 23 categorias.',
    features: [
      'Scan de vulnerabilidades IAM, S3, EC2, RDS',
      'Detecção de credenciais expostas',
      'Análise de compliance (CIS, LGPD, PCI-DSS)',
      'Recomendações de remediação com scripts'
    ]
  },
  '/security-scans': {
    title: 'Security Scans',
    description: 'Histórico e execução de scans de segurança.',
    features: [
      'Execução de scans sob demanda',
      'Histórico completo de scans',
      'Comparação entre scans',
      'Exportação de relatórios'
    ]
  },
  '/compliance': {
    title: 'Compliance Multi-Framework',
    description: 'Verificação de conformidade com 7 frameworks de segurança.',
    features: [
      'CIS AWS Foundations Benchmark',
      'LGPD, GDPR, HIPAA, PCI-DSS',
      'SOC 2, NIST 800-53',
      'Relatórios de auditoria exportáveis'
    ]
  },
  '/cost-analysis': {
    title: 'Análise de Custos',
    description: 'Monitoramento e otimização de custos cloud em tempo real.',
    features: [
      'Breakdown por serviço, região e tag',
      'Detecção de desperdício com ML',
      'Análise de Reserved Instances e Savings Plans',
      'Previsão de gastos com IA'
    ]
  },
  '/cost-optimization': {
    title: 'Otimização de Custos',
    description: 'Recomendações inteligentes para redução de custos.',
    features: [
      'Identificação de recursos ociosos',
      'Rightsizing de instâncias',
      'Recomendações de Savings Plans',
      'Análise de custos por tag'
    ]
  },
  '/ri-savings-plans': {
    title: 'Reserved Instances & Savings Plans',
    description: 'Análise e recomendações de RI e SP.',
    features: [
      'Cobertura atual de RI/SP',
      'Recomendações de compra',
      'Análise de utilização',
      'Projeção de economia'
    ]
  },
  '/attack-detection': {
    title: 'Attack Detection',
    description: 'Detecção de ataques em tempo real com análise de ameaças WAF.',
    features: [
      'Dashboard de eventos em tempo real',
      'Análise de ataques com IA',
      'Bloqueio/desbloqueio de IPs',
      'Métricas de regras e rate limiting'
    ]
  },
  '/cloudtrail-audit': {
    title: 'Audit Logs Analysis',
    description: 'Análise de eventos de auditoria com detecção de anomalias.',
    features: [
      'Timeline de eventos por usuário',
      'Detecção de comportamento suspeito',
      'Análise de movimentação lateral',
      'Alertas de atividades de risco'
    ]
  },
  '/copilot-ai': {
    title: 'FinOps Copilot',
    description: 'Assistente de IA para otimização financeira cloud.',
    features: [
      'Chat com IA sobre seus custos',
      'Recomendações personalizadas',
      'Análise de tendências',
      'Sugestões de rightsizing'
    ]
  },
  '/aws-settings': {
    title: 'Configurações AWS',
    description: 'Gerenciamento de contas AWS e integrações.',
    features: [
      'Quick Connect para AWS',
      'Gerenciamento de credenciais',
      'Configuração de regiões',
      'Validação de permissões'
    ]
  },
  '/cloud-credentials': {
    title: 'Credenciais Cloud',
    description: 'Gerenciamento de credenciais multi-cloud.',
    features: [
      'Conexão com AWS e Azure',
      'OAuth para Azure',
      'Validação de permissões',
      'Rotação de credenciais'
    ]
  }
};

/**
 * Calcula dias restantes até uma data
 */
function calculateDaysRemaining(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const expDate = new Date(expiresAt);
  const now = new Date();
  const diffMs = expDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Verifica se o demo expirou localmente (verificação adicional de segurança)
 */
function isDemoExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

export function DemoModeProvider({ children }: { children: ReactNode }) {
  // CRITICAL: Use cognitoAuth directly instead of useAuthSafe() to avoid
  // creating a separate auth state instance that may be out of sync.
  const hasQueriedBackendRef = useRef(false);
  
  // CRÍTICO: Estado inicial SEMPRE com isDemoMode = false
  // isVerified starts FALSE and ONLY becomes TRUE after we successfully query the backend
  // This prevents AwsAccountGuard from redirecting before we know the demo status
  const [state, setState] = useState<Omit<DemoModeState, 'daysRemaining' | 'isExpiringSoon'>>({
    isDemoMode: false,
    isLoading: true,
    isVerified: false,
    demoActivatedAt: null,
    demoExpiresAt: null,
    organizationName: null
  });

  const fetchDemoStatus = useCallback(async () => {
    // Check session directly from cognitoAuth (single source of truth)
    let session;
    try {
      session = await cognitoAuth.getCurrentSession();
    } catch {
      session = null;
    }
    
    // No session = not logged in
    // CRITICAL FIX: Do NOT set isVerified=true here. If there's no session,
    // it means auth hasn't completed yet. We keep isVerified=false so that
    // AwsAccountGuard shows a loading state instead of redirecting.
    // The auth-state-changed event will trigger a re-fetch once login completes.
    if (!session?.accessToken) {
      // Only mark as verified (not demo) if we previously had a session
      // and it was lost (logout scenario), OR if we're on a public page
      if (hasQueriedBackendRef.current) {
        console.log('[DemoMode] Session lost after previous successful query, marking not-demo');
        setState({
          isDemoMode: false,
          isLoading: false,
          isVerified: true,
          demoActivatedAt: null,
          demoExpiresAt: null,
          organizationName: null
        });
      } else {
        console.log('[DemoMode] No session yet, staying in loading state');
        // Keep isVerified=false - AwsAccountGuard will show loading
        setState(prev => ({ ...prev, isLoading: false }));
      }
      return;
    }

    try {
      const response = await apiClient.post('/api/functions/get-user-organization', {
        _t: Date.now()
      });
      
      hasQueriedBackendRef.current = true;
      
      if (response && typeof response === 'object' && 'data' in response && response.data) {
        const responseData = response.data as {
          organization?: {
            demo_mode?: boolean;
            demo_activated_at?: string;
            demo_expires_at?: string;
            name?: string;
          };
        };
        
        const org = responseData.organization;
        const isDemoFromBackend = org?.demo_mode === true;
        const hasExpired = isDemoExpired(org?.demo_expires_at || null);
        const isActiveDemo = isDemoFromBackend && !hasExpired;
        
        console.log('[DemoMode] Status fetched:', {
          isDemoFromBackend,
          hasExpired,
          isActiveDemo,
          orgName: org?.name
        });
        
        setState({
          isDemoMode: isActiveDemo,
          isLoading: false,
          isVerified: true,
          demoActivatedAt: isActiveDemo ? (org?.demo_activated_at || null) : null,
          demoExpiresAt: isActiveDemo ? (org?.demo_expires_at || null) : null,
          organizationName: org?.name || null
        });
      } else {
        console.warn('[DemoMode] Invalid response from backend');
        setState({
          isDemoMode: false,
          isLoading: false,
          isVerified: true,
          demoActivatedAt: null,
          demoExpiresAt: null,
          organizationName: null
        });
      }
    } catch (error) {
      console.error('[DemoMode] Failed to fetch demo mode status:', error);
      // On error, mark as verified=false so guard keeps waiting
      // The auth-state-changed or focus event will retry
      setState({
        isDemoMode: false,
        isLoading: false,
        isVerified: false,
        demoActivatedAt: null,
        demoExpiresAt: null,
        organizationName: null
      });
    }
  }, []);

  useEffect(() => {
    fetchDemoStatus();
    
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && (e.key.includes('idToken') || e.key.includes('accessToken'))) {
        console.log('[DemoMode] Auth storage changed, refreshing demo status');
        fetchDemoStatus();
      }
    };
    
    const handleFocus = () => {
      // Only refetch on focus if we've already queried successfully before
      if (hasQueriedBackendRef.current) {
        fetchDemoStatus();
      }
    };
    
    // CRITICAL: This event fires after successful login in useAuthSafe
    const handleAuthChange = () => {
      console.log('[DemoMode] Auth change event received, refreshing demo status');
      fetchDemoStatus();
    };
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('auth-state-changed', handleAuthChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('auth-state-changed', handleAuthChange);
    };
  }, [fetchDemoStatus]);

  const refreshDemoStatus = useCallback(async () => {
    // Durante refresh, mantém isDemoMode atual para evitar flicker
    // mas marca como loading
    setState(prev => ({ ...prev, isLoading: true }));
    await fetchDemoStatus();
  }, [fetchDemoStatus]);

  // Calcular valores derivados
  const contextValue = useMemo<DemoModeContextType>(() => {
    const daysRemaining = calculateDaysRemaining(state.demoExpiresAt);
    const isExpiringSoon = daysRemaining !== null && daysRemaining <= 7;
    
    return {
      ...state,
      daysRemaining,
      isExpiringSoon,
      refreshDemoStatus
    };
  }, [state, refreshDemoStatus]);

  return (
    <DemoModeContext.Provider value={contextValue}>
      {children}
    </DemoModeContext.Provider>
  );
}

/**
 * Hook para usar o contexto de demo mode
 * @throws Error se usado fora do DemoModeProvider
 */
export function useDemoMode(): DemoModeContextType {
  const context = useContext(DemoModeContext);
  if (context === undefined) {
    throw new Error('useDemoMode must be used within a DemoModeProvider');
  }
  return context;
}

/**
 * Hook opcional para usar o contexto de demo mode
 * Retorna valores padrão seguros se usado fora do provider
 * Útil para componentes que podem estar dentro ou fora do provider
 */
export function useDemoModeOptional(): DemoModeContextType {
  const context = useContext(DemoModeContext);
  
  // Se não há contexto, retorna valores padrão seguros (não é demo)
  if (context === undefined) {
    return {
      isDemoMode: false,
      isLoading: false,
      isVerified: true,
      demoActivatedAt: null,
      demoExpiresAt: null,
      organizationName: null,
      daysRemaining: null,
      isExpiringSoon: false,
      refreshDemoStatus: async () => {}
    };
  }
  
  return context;
}

export default DemoModeContext;
