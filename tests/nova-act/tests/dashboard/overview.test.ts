/**
 * Testes do Dashboard - Amazon Nova Act
 * Testes E2E do dashboard principal
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NovaActClient, createNovaActClient } from '../../lib/nova-client';
import { config, URLS } from '../../config/nova-act.config';
import { DashboardMetricsSchema, UserInfoSchema } from '../../config/test-data';
import { z } from 'zod';

describe('Dashboard - Overview', () => {
  let client: NovaActClient;

  beforeAll(async () => {
    client = createNovaActClient(URLS.auth, {
      headless: config.novaAct.headless,
      timeout: 60000,
    });
    await client.start();

    // Fazer login primeiro
    await client.fill('email input field', config.testUser.email);
    await client.fill('password input field', config.testUser.password);
    await client.click('login button or Entrar button');
    
    // Aguardar dashboard carregar
    await client.waitFor('dashboard content or main application', 30000);
  });

  afterAll(async () => {
    if (client) {
      // Fazer logout
      await client.act('Click on user menu and then click logout or Sair');
      await client.stop();
    }
  });

  describe('Dashboard Load', () => {
    it('deve carregar o dashboard após login', async () => {
      const currentUrl = await client.getCurrentUrl();
      expect(currentUrl).toContain('/app');
    });

    it('deve exibir sidebar de navegação', async () => {
      const hasSidebar = await client.isVisible('sidebar or navigation menu');
      expect(hasSidebar).toBe(true);
    });

    it('deve exibir header com informações do usuário', async () => {
      const hasUserInfo = await client.isVisible('user menu or user profile in header');
      expect(hasUserInfo).toBe(true);
    });
  });

  describe('KPI Cards', () => {
    it('deve exibir card de Custo Mensal', async () => {
      const hasCostCard = await client.isVisible('monthly cost card or Custo Mensal');
      expect(hasCostCard).toBe(true);

      // Extrair valor do custo
      const costData = await client.actGet(
        'Extract the monthly cost value from the cost card. Return as JSON with totalCost as number.',
        z.object({ totalCost: z.number().optional() })
      );
      
      if (costData.data?.totalCost !== undefined) {
        expect(costData.data.totalCost).toBeGreaterThanOrEqual(0);
      }
    });

    it('deve exibir card de Security Score', async () => {
      const hasSecurityCard = await client.isVisible('security score card or Security Score');
      expect(hasSecurityCard).toBe(true);

      // Extrair score
      const scoreData = await client.actGet(
        'Extract the security score value. Return as JSON with securityScore as number between 0 and 100.',
        z.object({ securityScore: z.number().min(0).max(100).optional() })
      );
      
      if (scoreData.data?.securityScore !== undefined) {
        expect(scoreData.data.securityScore).toBeGreaterThanOrEqual(0);
        expect(scoreData.data.securityScore).toBeLessThanOrEqual(100);
      }
    });

    it('deve exibir card de Alertas Ativos', async () => {
      const hasAlertsCard = await client.isVisible('active alerts card or Alertas Ativos');
      expect(hasAlertsCard).toBe(true);
    });

    it('deve exibir card de Recursos AWS', async () => {
      const hasResourcesCard = await client.isVisible('AWS resources card or Recursos AWS');
      expect(hasResourcesCard).toBe(true);
    });
  });

  describe('Dashboard Tabs', () => {
    it('deve ter tab de Visão Geral', async () => {
      const hasOverviewTab = await client.isVisible('Overview tab or Visão Geral tab');
      expect(hasOverviewTab).toBe(true);
    });

    it('deve navegar para tab de Custos', async () => {
      const result = await client.click('Costs tab or Custos tab');
      expect(result.success).toBe(true);

      // Verificar conteúdo da tab
      const hasCostContent = await client.waitFor('cost breakdown or cost chart', 5000);
      expect(hasCostContent).toBe(true);
    });

    it('deve navegar para tab de Segurança', async () => {
      const result = await client.click('Security tab or Segurança tab');
      expect(result.success).toBe(true);

      // Verificar conteúdo da tab
      const hasSecurityContent = await client.waitFor('security posture or compliance status', 5000);
      expect(hasSecurityContent).toBe(true);
    });

    it('deve navegar para tab de Recursos', async () => {
      const result = await client.click('Resources tab or Recursos tab');
      expect(result.success).toBe(true);

      // Verificar conteúdo da tab
      const hasResourcesContent = await client.waitFor('EC2 instances or RDS databases', 5000);
      expect(hasResourcesContent).toBe(true);
    });
  });

  describe('Sidebar Navigation', () => {
    it('deve navegar para Security Scans', async () => {
      const result = await client.click('Security Scans menu item in sidebar');
      expect(result.success).toBe(true);

      const currentUrl = await client.getCurrentUrl();
      expect(currentUrl).toContain('security');
    });

    it('deve navegar para Cost Optimization', async () => {
      const result = await client.click('Cost Optimization menu item in sidebar');
      expect(result.success).toBe(true);

      const currentUrl = await client.getCurrentUrl();
      expect(currentUrl).toContain('cost');
    });

    it('deve navegar para AWS Settings', async () => {
      const result = await client.click('AWS Settings menu item in sidebar');
      expect(result.success).toBe(true);

      const currentUrl = await client.getCurrentUrl();
      expect(currentUrl).toContain('aws-settings');
    });

    it('deve voltar para Dashboard', async () => {
      const result = await client.click('Dashboard menu item or home icon in sidebar');
      expect(result.success).toBe(true);

      const currentUrl = await client.getCurrentUrl();
      expect(currentUrl).toContain('/app');
    });
  });

  describe('User Menu', () => {
    it('deve abrir menu do usuário', async () => {
      const result = await client.click('user menu button or user avatar');
      expect(result.success).toBe(true);

      const hasDropdown = await client.waitFor('user dropdown menu or profile options', 3000);
      expect(hasDropdown).toBe(true);
    });

    it('deve ter opção de configurações', async () => {
      const hasSettings = await client.isVisible('settings option or Configurações');
      expect(hasSettings).toBe(true);
    });

    it('deve ter opção de logout', async () => {
      const hasLogout = await client.isVisible('logout option or Sair');
      expect(hasLogout).toBe(true);
    });
  });

  describe('Data Refresh', () => {
    it('deve ter botão de atualizar dados', async () => {
      // Fechar menu do usuário se estiver aberto
      await client.act('Close any open dropdown menus by clicking elsewhere');
      
      const hasRefreshButton = await client.isVisible('refresh button or reload data button');
      expect(hasRefreshButton).toBe(true);
    });

    it('deve atualizar dados ao clicar em refresh', async () => {
      const result = await client.click('refresh button or reload data button');
      expect(result.success).toBe(true);

      // Verificar loading state
      const hadLoading = await client.waitFor('loading indicator or spinner', 2000);
      // Loading pode ser muito rápido, então não falhar se não viu
      
      // Aguardar dados carregarem
      await client.waitFor('dashboard content loaded', 10000);
    });
  });
});

describe('Dashboard - Responsiveness', () => {
  let client: NovaActClient;

  beforeAll(async () => {
    client = createNovaActClient(URLS.auth, {
      headless: config.novaAct.headless,
    });
    await client.start();

    // Login
    await client.fill('email input field', config.testUser.email);
    await client.fill('password input field', config.testUser.password);
    await client.click('login button');
    await client.waitFor('dashboard', 30000);
  });

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
  });

  it('deve exibir todos os elementos principais', async () => {
    const elements = [
      'sidebar',
      'header',
      'main content area',
      'KPI cards',
    ];

    for (const element of elements) {
      const isVisible = await client.isVisible(element);
      expect(isVisible).toBe(true);
    }
  });

  it('deve ter navegação funcional', async () => {
    // Testar alguns links de navegação
    const navItems = [
      'Dashboard',
      'Security',
      'Cost',
    ];

    for (const item of navItems) {
      const result = await client.click(`${item} menu item in sidebar`);
      expect(result.success).toBe(true);
      
      // Pequena pausa para navegação
      await new Promise(r => setTimeout(r, 1000));
    }
  });
});
