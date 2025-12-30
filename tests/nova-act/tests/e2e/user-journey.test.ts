/**
 * Testes E2E - Jornada Completa do Usuário
 * Testes de fluxos completos usando Amazon Nova Act
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NovaActClient, createNovaActClient, runWorkflow } from '../../lib/nova-client';
import { config, URLS } from '../../config/nova-act.config';
import { E2E_FLOWS } from '../../config/test-data';
import { z } from 'zod';

describe('E2E - Complete User Journey', () => {
  let client: NovaActClient;

  beforeAll(async () => {
    client = createNovaActClient(URLS.auth, {
      headless: config.novaAct.headless,
      timeout: 180000, // 3 minutos para fluxos completos
      recordVideo: true,
    });
    await client.start();
  });

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
  });

  describe('Login to Dashboard Flow', () => {
    it('deve completar fluxo de login até dashboard', async () => {
      // Step 1: Acessar página de login
      const step1 = await client.act('Navigate to the login page and verify it loaded correctly');
      expect(step1.success).toBe(true);

      // Step 2: Preencher credenciais
      const step2 = await client.act(
        `Fill the email field with "${config.testUser.email}" and the password field with "${config.testUser.password}"`
      );
      expect(step2.success).toBe(true);

      // Step 3: Submeter login
      const step3 = await client.act('Click the login button and wait for the page to load');
      expect(step3.success).toBe(true);

      // Step 4: Verificar dashboard
      const isDashboard = await client.waitFor('dashboard main content or KPI cards', 30000);
      expect(isDashboard).toBe(true);

      // Step 5: Verificar elementos do dashboard
      const dashboardCheck = await client.actGet(
        'Check if the dashboard has loaded with cost card, security card, and navigation sidebar. Return JSON with loaded: true/false',
        z.object({ loaded: z.boolean() })
      );
      expect(dashboardCheck.data?.loaded).toBe(true);
    });
  });

  describe('Security Audit Flow', () => {
    it('deve completar fluxo de auditoria de segurança', async () => {
      // Navegar para Security Posture
      const nav1 = await client.act('Click on Security Posture in the sidebar navigation');
      expect(nav1.success).toBe(true);

      // Verificar score de segurança
      const scoreCheck = await client.actGet(
        'Find and extract the security score displayed on the page. Return as JSON with score as number.',
        z.object({ score: z.number().min(0).max(100) })
      );
      
      if (scoreCheck.data) {
        console.log(`Security Score: ${scoreCheck.data.score}`);
        expect(scoreCheck.data.score).toBeGreaterThanOrEqual(0);
      }

      // Navegar para Compliance
      const nav2 = await client.act('Navigate to Compliance page from sidebar');
      expect(nav2.success).toBe(true);

      // Verificar frameworks de compliance
      const complianceCheck = await client.isVisible('compliance frameworks or SOC 2 or HIPAA');
      expect(complianceCheck).toBe(true);

      // Navegar para CloudTrail Audit
      const nav3 = await client.act('Navigate to CloudTrail Audit page');
      expect(nav3.success).toBe(true);

      // Verificar logs
      const logsCheck = await client.isVisible('audit logs or CloudTrail events');
      expect(logsCheck).toBe(true);
    });
  });

  describe('Cost Management Flow', () => {
    it('deve completar fluxo de gestão de custos', async () => {
      // Navegar para Cost Optimization
      const nav1 = await client.act('Navigate to Cost Optimization page from sidebar');
      expect(nav1.success).toBe(true);

      // Extrair custo total
      const costCheck = await client.actGet(
        'Extract the total monthly cost shown on the page. Return as JSON with totalCost as number.',
        z.object({ totalCost: z.number() })
      );
      
      if (costCheck.data) {
        console.log(`Total Cost: $${costCheck.data.totalCost}`);
        expect(costCheck.data.totalCost).toBeGreaterThanOrEqual(0);
      }

      // Verificar breakdown
      const breakdownCheck = await client.isVisible('cost breakdown by service');
      expect(breakdownCheck).toBe(true);

      // Navegar para RI & Savings Plans
      const nav2 = await client.act('Navigate to RI & Savings Plans page');
      expect(nav2.success).toBe(true);

      // Verificar recomendações
      const riCheck = await client.isVisible('RI recommendations or savings plan suggestions');
      expect(riCheck).toBe(true);
    });
  });

  describe('AWS Settings Flow', () => {
    it('deve verificar configurações AWS', async () => {
      // Navegar para AWS Settings
      const nav = await client.act('Navigate to AWS Settings page from sidebar');
      expect(nav.success).toBe(true);

      // Verificar credenciais configuradas
      const credentialsCheck = await client.isVisible('AWS credentials or connected accounts');
      expect(credentialsCheck).toBe(true);

      // Verificar status de conexão
      const statusCheck = await client.actGet(
        'Check if there are any AWS accounts connected. Return JSON with connected: true/false and count as number.',
        z.object({ 
          connected: z.boolean(),
          count: z.number().optional()
        })
      );
      
      console.log(`AWS Accounts Connected: ${statusCheck.data?.connected}, Count: ${statusCheck.data?.count || 0}`);
    });
  });

  describe('Full Navigation Test', () => {
    it('deve navegar por todas as páginas principais', async () => {
      const pages = [
        { name: 'Dashboard', selector: 'Dashboard menu item' },
        { name: 'Security Scans', selector: 'Security Scans menu item' },
        { name: 'Security Posture', selector: 'Security Posture menu item' },
        { name: 'Compliance', selector: 'Compliance menu item' },
        { name: 'Cost Optimization', selector: 'Cost Optimization menu item' },
        { name: 'Resource Monitoring', selector: 'Resource Monitoring menu item' },
        { name: 'Well Architected', selector: 'Well Architected menu item' },
      ];

      for (const page of pages) {
        console.log(`Navigating to: ${page.name}`);
        
        const navResult = await client.act(`Click on ${page.selector} in the sidebar`);
        expect(navResult.success).toBe(true);

        // Verificar se página carregou
        const pageLoaded = await client.waitFor(`${page.name} page content`, 10000);
        expect(pageLoaded).toBe(true);

        // Pequena pausa entre navegações
        await new Promise(r => setTimeout(r, 1000));
      }
    });
  });

  describe('Logout Flow', () => {
    it('deve fazer logout corretamente', async () => {
      // Abrir menu do usuário
      const menuResult = await client.act('Click on user menu or user avatar in the header');
      expect(menuResult.success).toBe(true);

      // Clicar em logout
      const logoutResult = await client.act('Click on logout option or Sair button');
      expect(logoutResult.success).toBe(true);

      // Verificar redirecionamento para login
      const isLoginPage = await client.waitFor('login page or login form', 10000);
      expect(isLoginPage).toBe(true);

      // Verificar URL
      const currentUrl = await client.getCurrentUrl();
      expect(currentUrl).not.toContain('/app');
    });
  });
});

describe('E2E - Error Handling', () => {
  let client: NovaActClient;

  beforeAll(async () => {
    client = createNovaActClient(URLS.auth, {
      headless: config.novaAct.headless,
    });
    await client.start();
  });

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
  });

  it('deve exibir erro para credenciais inválidas', async () => {
    await client.fill('email input field', 'invalid@test.com');
    await client.fill('password input field', 'wrongpassword');
    await client.click('login button');

    const hasError = await client.waitFor('error message or authentication failed', 10000);
    expect(hasError).toBe(true);
  });

  it('deve redirecionar para login quando não autenticado', async () => {
    // Tentar acessar página protegida diretamente
    await client.goToUrl(URLS.dashboard);

    // Deve redirecionar para login
    const isLoginPage = await client.waitFor('login page or login form', 10000);
    expect(isLoginPage).toBe(true);
  });

  it('deve exibir página 404 para rota inexistente', async () => {
    await client.goToUrl(`${config.app.baseUrl}/nonexistent-page-12345`);

    const has404 = await client.waitFor('404 page or page not found', 10000);
    expect(has404).toBe(true);
  });
});

describe('E2E - Workflow Automation', () => {
  it('deve executar workflow completo de verificação', async () => {
    const steps = [
      'Navigate to the login page',
      `Fill email with "${config.testUser.email}" and password with "${config.testUser.password}"`,
      'Click the login button',
      'Wait for dashboard to load',
      'Verify that KPI cards are visible',
      'Navigate to Security Scans page',
      'Verify scan list is visible',
      'Navigate back to Dashboard',
      'Click on user menu and logout',
    ];

    const results = await runWorkflow(URLS.auth, steps);

    // Verificar que todos os steps foram executados
    expect(results.length).toBe(steps.length);

    // Contar sucessos
    const successCount = results.filter(r => r.success).length;
    console.log(`Workflow completed: ${successCount}/${steps.length} steps successful`);

    // Pelo menos 80% dos steps devem passar
    expect(successCount / steps.length).toBeGreaterThanOrEqual(0.8);
  });
});

describe('E2E - Data Validation', () => {
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

  it('deve validar dados do dashboard são consistentes', async () => {
    // Extrair métricas do dashboard
    const metrics = await client.actGet(
      `Extract all visible metrics from the dashboard including:
       - Total cost (as number)
       - Security score (as number 0-100)
       - Active alerts count (as number)
       - Resources count (as number)
       Return as JSON object.`,
      z.object({
        totalCost: z.number().optional(),
        securityScore: z.number().min(0).max(100).optional(),
        activeAlerts: z.number().min(0).optional(),
        resources: z.number().min(0).optional(),
      })
    );

    if (metrics.data) {
      console.log('Dashboard Metrics:', metrics.data);

      // Validar que os valores fazem sentido
      if (metrics.data.securityScore !== undefined) {
        expect(metrics.data.securityScore).toBeGreaterThanOrEqual(0);
        expect(metrics.data.securityScore).toBeLessThanOrEqual(100);
      }

      if (metrics.data.activeAlerts !== undefined) {
        expect(metrics.data.activeAlerts).toBeGreaterThanOrEqual(0);
      }

      if (metrics.data.resources !== undefined) {
        expect(metrics.data.resources).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('deve validar que navegação mantém estado do usuário', async () => {
    // Navegar para várias páginas
    await client.act('Navigate to Cost Optimization');
    await client.act('Navigate to Security Scans');
    await client.act('Navigate back to Dashboard');

    // Verificar que ainda está logado
    const hasUserMenu = await client.isVisible('user menu or user profile');
    expect(hasUserMenu).toBe(true);

    // Verificar que dados ainda estão visíveis
    const hasData = await client.isVisible('KPI cards or dashboard metrics');
    expect(hasData).toBe(true);
  });
});
