/**
 * Test Data - Dados de teste para Nova Act
 * Dados reais para validação (sem mocks)
 */

import { z } from 'zod';

// Schemas de validação para dados extraídos
export const DashboardMetricsSchema = z.object({
  totalCost: z.number().optional(),
  costTrend: z.number().optional(),
  securityScore: z.number().min(0).max(100).optional(),
  activeAlerts: z.number().min(0).optional(),
  resources: z.number().min(0).optional(),
  compliance: z.number().min(0).max(100).optional(),
});

export const SecurityScanResultSchema = z.object({
  scanId: z.string().optional(),
  status: z.enum(['running', 'completed', 'failed', 'pending']).optional(),
  findings: z.number().min(0).optional(),
  criticalFindings: z.number().min(0).optional(),
  highFindings: z.number().min(0).optional(),
  mediumFindings: z.number().min(0).optional(),
  lowFindings: z.number().min(0).optional(),
});

export const AWSResourceSchema = z.object({
  resourceType: z.string(),
  resourceId: z.string(),
  region: z.string(),
  status: z.string().optional(),
  tags: z.record(z.string()).optional(),
});

export const CostDataSchema = z.object({
  totalCost: z.number(),
  currency: z.string().default('USD'),
  period: z.string(),
  breakdown: z.array(z.object({
    service: z.string(),
    cost: z.number(),
    percentage: z.number().optional(),
  })).optional(),
});

export const UserInfoSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  organizationId: z.string().optional(),
  role: z.string().optional(),
});

// Tipos exportados
export type DashboardMetrics = z.infer<typeof DashboardMetricsSchema>;
export type SecurityScanResult = z.infer<typeof SecurityScanResultSchema>;
export type AWSResource = z.infer<typeof AWSResourceSchema>;
export type CostData = z.infer<typeof CostDataSchema>;
export type UserInfo = z.infer<typeof UserInfoSchema>;

// Seletores CSS/XPath comuns (para referência, Nova Act usa linguagem natural)
export const SELECTORS = {
  // Auth Page
  auth: {
    emailInput: 'input[type="email"]',
    passwordInput: 'input[type="password"]',
    loginButton: 'button[type="submit"]',
    signupTab: '[data-value="signup"]',
    mfaInput: 'input[id="mfa-code"]',
    forgotPasswordLink: 'Esqueceu sua senha?',
  },
  
  // Dashboard
  dashboard: {
    sidebar: '[data-testid="sidebar"]',
    userMenu: '[data-testid="user-menu"]',
    costCard: '[data-testid="cost-card"]',
    securityCard: '[data-testid="security-card"]',
    alertsCard: '[data-testid="alerts-card"]',
    resourcesCard: '[data-testid="resources-card"]',
  },
  
  // Navigation
  nav: {
    menuItem: (name: string) => `[data-menu="${name}"]`,
    breadcrumb: '[data-testid="breadcrumb"]',
  },
};

// Mensagens esperadas (para validação)
export const EXPECTED_MESSAGES = {
  loginSuccess: 'Login realizado com sucesso',
  loginError: 'Email ou senha incorretos',
  mfaRequired: 'MFA Obrigatório',
  signupSuccess: 'Conta criada com sucesso',
  passwordResetSent: 'Email enviado',
  sessionExpired: 'Sessão expirada',
};

// Timeouts específicos por operação
export const TIMEOUTS = {
  pageLoad: 30000,
  login: 15000,
  mfaVerification: 30000,
  apiCall: 10000,
  securityScan: 120000,
  dataLoad: 20000,
};

// Test scenarios data
export const TEST_SCENARIOS = {
  // Login scenarios
  login: {
    validCredentials: {
      description: 'Login com credenciais válidas',
      expectedResult: 'Redirecionamento para dashboard',
    },
    invalidEmail: {
      description: 'Login com email inválido',
      email: 'invalid-email',
      expectedResult: 'Mensagem de erro de validação',
    },
    invalidPassword: {
      description: 'Login com senha incorreta',
      expectedResult: 'Mensagem de erro de autenticação',
    },
    emptyFields: {
      description: 'Login com campos vazios',
      expectedResult: 'Validação de campos obrigatórios',
    },
  },
  
  // Dashboard scenarios
  dashboard: {
    loadMetrics: {
      description: 'Carregar métricas do dashboard',
      expectedElements: ['Custo Mensal', 'Security Score', 'Alertas Ativos', 'Recursos AWS'],
    },
    navigateTabs: {
      description: 'Navegar entre abas do dashboard',
      tabs: ['Visão Geral', 'Custos', 'Segurança', 'Recursos'],
    },
    refreshData: {
      description: 'Atualizar dados do dashboard',
      expectedResult: 'Dados atualizados',
    },
  },
  
  // Security scenarios
  security: {
    runScan: {
      description: 'Executar scan de segurança',
      expectedResult: 'Scan iniciado com sucesso',
    },
    viewFindings: {
      description: 'Visualizar findings de segurança',
      expectedElements: ['Critical', 'High', 'Medium', 'Low'],
    },
    exportReport: {
      description: 'Exportar relatório de segurança',
      expectedResult: 'Download iniciado',
    },
  },
  
  // Cost scenarios
  cost: {
    viewAnalysis: {
      description: 'Visualizar análise de custos',
      expectedElements: ['Total', 'Por Serviço', 'Tendência'],
    },
    viewRecommendations: {
      description: 'Visualizar recomendações de otimização',
      expectedResult: 'Lista de recomendações',
    },
  },
};

// Fluxos completos
export const USER_FLOWS = {
  completeUserJourney: {
    name: 'Jornada Completa do Usuário',
    steps: [
      'Fazer login',
      'Verificar dashboard carregou',
      'Navegar para Security Scans',
      'Verificar lista de scans',
      'Navegar para Cost Optimization',
      'Verificar recomendações',
      'Navegar para AWS Settings',
      'Verificar credenciais configuradas',
      'Fazer logout',
    ],
  },
  
  securityAuditFlow: {
    name: 'Fluxo de Auditoria de Segurança',
    steps: [
      'Fazer login',
      'Navegar para Security Posture',
      'Verificar score de segurança',
      'Navegar para Compliance',
      'Verificar status de compliance',
      'Navegar para CloudTrail Audit',
      'Verificar logs de auditoria',
      'Exportar relatório',
    ],
  },
  
  costManagementFlow: {
    name: 'Fluxo de Gestão de Custos',
    steps: [
      'Fazer login',
      'Navegar para Cost Optimization',
      'Verificar custos totais',
      'Verificar breakdown por serviço',
      'Navegar para RI & Savings Plans',
      'Verificar recomendações de RI',
      'Verificar economia potencial',
    ],
  },
};

export default {
  SELECTORS,
  EXPECTED_MESSAGES,
  TIMEOUTS,
  TEST_SCENARIOS,
  USER_FLOWS,
};
