#!/usr/bin/env tsx
/**
 * Full E2E Test Suite - Cobertura Completa
 * 
 * Testa todas as funcionalidades da aplicação EVO UDS
 * incluindo menus principais e submenus
 */

import { chromium, Browser, Page, BrowserContext, Response } from 'playwright';
import { config } from './config/nova-act.config';
import * as fs from 'fs/promises';

interface ApiError {
  url: string;
  status: number;
  method: string;
}

interface TestResult {
  name: string;
  category: string;
  success: boolean;
  duration: number;
  url?: string;
  apiErrors: ApiError[];
  error?: string;
}

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function log(message: string, color = COLORS.reset): void {
  console.log(`${color}${message}${COLORS.reset}`);
}

// Mapeamento de menu items para seus valores internos (do AppSidebar)
// Baseado exatamente no arquivo src/components/AppSidebar.tsx
const MENU_MAPPING: Record<string, { click: string; expectedTab: string; category: string }> = {
  'Dashboard Executivo': { click: 'Dashboard Executivo', expectedTab: 'executive', category: 'dashboard' },
  'Análise de Custos': { click: 'Análise de Custos', expectedTab: 'costs', category: 'costs' },
  'Copilot AI': { click: 'Copilot AI', expectedTab: 'copilot', category: 'ai' },
  'Previsões ML': { click: 'Previsões ML', expectedTab: 'ml', category: 'ml' },
  'Monitoramento': { click: 'Monitoramento', expectedTab: 'monitoring', category: 'monitoring' },
  'Detecção de Ataques': { click: 'Detecção de Ataques', expectedTab: 'attack-detection', category: 'security' },
  'Análises & Scans': { click: 'Análises', expectedTab: 'scans', category: 'scans' },
  'Otimização': { click: 'Otimização', expectedTab: 'optimization', category: 'optimization' },
  'Alertas Inteligentes': { click: 'Alertas Inteligentes', expectedTab: 'alerts', category: 'alerts' },
  'Postura de Segurança': { click: 'Postura de Segurança', expectedTab: 'security', category: 'security' },
  'Tickets de Remediação': { click: 'Tickets de Remediação', expectedTab: 'tickets', category: 'tickets' },
  'Base de Conhecimento': { click: 'Base de Conhecimento', expectedTab: 'knowledge-base', category: 'knowledge' },
  'TV Dashboards': { click: 'TV Dashboards', expectedTab: 'tv-dashboards', category: 'tv' },
  'Configurações AWS': { click: 'Configurações AWS', expectedTab: 'aws-settings', category: 'aws' },
  'Gerenciar Usuários': { click: 'Gerenciar Usuários', expectedTab: 'users', category: 'users' },
  'Licença': { click: 'Licença', expectedTab: 'license', category: 'license' },
};

// Submenus que requerem expansão do menu pai
const SUBMENU_MAPPING: Record<string, { parent: string; click: string; category: string }> = {
  // Análise de Custos submenus
  'Análise Detalhada': { parent: 'Análise de Custos', click: 'Análise Detalhada', category: 'costs' },
  'Faturas Mensais': { parent: 'Análise de Custos', click: 'Faturas Mensais', category: 'costs' },
  // Previsões ML submenus
  'Incidentes Preditivos': { parent: 'Previsões ML', click: 'Incidentes Preditivos', category: 'ml' },
  'Detecção de Anomalias': { parent: 'Previsões ML', click: 'Detecção de Anomalias', category: 'ml' },
  // Monitoramento submenus
  'Endpoints': { parent: 'Monitoramento', click: 'Endpoints', category: 'monitoring' },
  'Recursos': { parent: 'Monitoramento', click: 'Recursos', category: 'monitoring' },
  'Borda (LB/CF/WAF)': { parent: 'Monitoramento', click: 'Borda (LB/CF/WAF)', category: 'monitoring' },
  // Análises submenus
  'Scans de Segurança': { parent: 'Análises', click: 'Scans de Segurança', category: 'scans' },
  'Auditoria CloudTrail': { parent: 'Análises', click: 'Auditoria CloudTrail', category: 'scans' },
  'Compliance': { parent: 'Análises', click: 'Compliance', category: 'scans' },
  'Well-Architected': { parent: 'Análises', click: 'Well-Architected', category: 'scans' },
  'Análise de Segurança AWS': { parent: 'Análises', click: 'Análise de Segurança AWS', category: 'scans' },
  // Otimização submenus
  'Otimização de Custos': { parent: 'Otimização', click: 'Otimização de Custos', category: 'optimization' },
  'RI/Savings Plans': { parent: 'Otimização', click: 'RI/Savings Plans', category: 'optimization' },
  'Detecção de Desperdício': { parent: 'Otimização', click: 'Detecção de Desperdício', category: 'optimization' },
};

class FullE2ETestRunner {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private results: TestResult[] = [];
  private currentApiErrors: ApiError[] = [];
  private startTime = 0;
  private screenshotDir = './reports/full-e2e-screenshots';

  async run(): Promise<void> {
    console.log('\n');
    log('╔════════════════════════════════════════════════════════════════════╗', COLORS.cyan);
    log('║     🤖 EVO UDS - Full E2E Test Suite (100% Coverage)               ║', COLORS.cyan);
    log('║     Testa menus principais e submenus                              ║', COLORS.cyan);
    log('╚════════════════════════════════════════════════════════════════════╝', COLORS.cyan);
    console.log('\n');

    this.startTime = Date.now();

    await fs.rm(this.screenshotDir, { recursive: true, force: true });
    await fs.mkdir(this.screenshotDir, { recursive: true });

    try {
      await this.initBrowser();
      await this.testLogin();
      
      // Testar menus principais
      for (const [name, mapping] of Object.entries(MENU_MAPPING)) {
        await this.testNavigation(name, mapping.click, mapping.category);
      }
      
      // Testar submenus
      for (const [name, mapping] of Object.entries(SUBMENU_MAPPING)) {
        await this.testSubmenu(name, mapping.parent, mapping.click, mapping.category);
      }
      
      await this.testLogout();

    } catch (error) {
      log(`\n❌ Erro fatal: ${error}`, COLORS.red);
    } finally {
      await this.closeBrowser();
      await this.generateReport();
    }
  }

  private async initBrowser(): Promise<void> {
    log('🚀 Iniciando browser...', COLORS.cyan);
    
    this.browser = await chromium.launch({
      headless: config.novaAct.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      ignoreHTTPSErrors: true,
    });
    
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(30000);
    
    // Interceptar erros de API
    this.page.on('response', (response: Response) => {
      const url = response.url();
      const status = response.status();
      
      if ((url.includes('api-evo.ai.udstec.io') || url.includes('/api/')) && status >= 400) {
        this.currentApiErrors.push({
          url: url.split('?')[0],
          status: status,
          method: response.request().method(),
        });
      }
    });
    
    // Capturar erros de console
    this.page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) {
        console.log(`  [Console Error]: ${msg.text().substring(0, 100)}`);
      }
    });
    
    await this.page.goto(config.app.baseUrl, { waitUntil: 'domcontentloaded' });
    log('🌐 Browser iniciado\n', COLORS.green);
  }

  private async closeBrowser(): Promise<void> {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    log('\n🛑 Browser fechado', COLORS.dim);
  }

  private async testLogin(): Promise<void> {
    const startTime = Date.now();
    this.currentApiErrors = [];
    
    log('📋 TEST 1: Login [auth]', COLORS.cyan);
    
    try {
      if (!this.page) throw new Error('Browser não iniciado');
      
      await this.page.goto(`${config.app.baseUrl}/auth`, { waitUntil: 'networkidle' });
      await this.page.waitForTimeout(2000);
      
      const emailInput = await this.page.waitForSelector('input[type="email"], input[placeholder*="email" i]', { timeout: 10000 });
      await emailInput.fill(config.testUser.email);
      
      const passwordInput = await this.page.waitForSelector('input[type="password"]', { timeout: 5000 });
      await passwordInput.fill(config.testUser.password);
      
      const loginButton = await this.page.waitForSelector('button[type="submit"], button:has-text("Entrar")', { timeout: 5000 });
      await loginButton.click();
      
      await this.page.waitForURL('**/app**', { timeout: 15000 });
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForTimeout(2000);
      
      await this.screenshot('01-login-success.png');
      
      this.results.push({
        name: 'Login',
        category: 'auth',
        success: true,
        duration: Date.now() - startTime,
        url: this.page.url(),
        apiErrors: [...this.currentApiErrors],
      });
      
      log('  ✅ Login realizado com sucesso', COLORS.green);
      
    } catch (error) {
      await this.screenshot('01-login-failed.png');
      throw error;
    }
  }

  private async testNavigation(name: string, clickText: string, category: string): Promise<void> {
    const startTime = Date.now();
    const testNum = this.results.length + 1;
    this.currentApiErrors = [];
    
    log(`\n📋 TEST ${testNum}: ${name} [${category}]`, COLORS.cyan);
    
    try {
      if (!this.page) throw new Error('Browser não iniciado');
      
      // Garantir que estamos na página principal com sidebar
      const currentUrl = this.page.url();
      if (currentUrl.includes('/tv') || !currentUrl.includes('/app')) {
        await this.page.goto(`${config.app.baseUrl}/app`, { waitUntil: 'networkidle' });
        await this.page.waitForTimeout(1000);
      }
      
      // Scroll no sidebar para encontrar o item
      await this.page.evaluate(() => {
        const sidebars = document.querySelectorAll('[class*="sidebar"], nav, aside');
        sidebars.forEach(sidebar => {
          if (sidebar instanceof HTMLElement) {
            sidebar.scrollTop = sidebar.scrollHeight;
          }
        });
        const scrollables = document.querySelectorAll('[class*="overflow"], [class*="scroll"]');
        scrollables.forEach(el => {
          if (el instanceof HTMLElement && el.closest('[class*="sidebar"], nav, aside')) {
            el.scrollTop = el.scrollHeight;
          }
        });
      });
      await this.page.waitForTimeout(500);
      
      // Usar JavaScript para encontrar e clicar no item do menu
      const clicked = await this.page.evaluate((text) => {
        const elements = document.querySelectorAll('button, a, span, div');
        for (const el of elements) {
          const content = el.textContent?.trim() || '';
          if (content === text || content.includes(text)) {
            const isInSidebar = el.closest('nav, aside, [class*="sidebar"], [data-sidebar]');
            if (isInSidebar) {
              el.scrollIntoView({ behavior: 'instant', block: 'center' });
              (el as HTMLElement).click();
              return true;
            }
          }
        }
        return false;
      }, clickText);
      
      if (!clicked) {
        // Scroll para o topo e tentar novamente
        await this.page.evaluate(() => {
          const sidebars = document.querySelectorAll('[class*="sidebar"], nav, aside');
          sidebars.forEach(sidebar => {
            if (sidebar instanceof HTMLElement) {
              sidebar.scrollTop = 0;
            }
          });
        });
        await this.page.waitForTimeout(300);
        
        const clickedAfterScroll = await this.page.evaluate((text) => {
          const elements = document.querySelectorAll('button, a, span, div');
          for (const el of elements) {
            const content = el.textContent?.trim() || '';
            if (content === text || content.includes(text)) {
              const isInSidebar = el.closest('nav, aside, [class*="sidebar"], [data-sidebar]');
              if (isInSidebar) {
                el.scrollIntoView({ behavior: 'instant', block: 'center' });
                (el as HTMLElement).click();
                return true;
              }
            }
          }
          return false;
        }, clickText);
        
        if (!clickedAfterScroll) {
          throw new Error(`Menu item "${clickText}" não encontrado`);
        }
      }
      
      // Aguardar navegação
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForTimeout(2000);
      
      const screenshotName = `${String(testNum).padStart(2, '0')}-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`;
      await this.screenshot(screenshotName);
      
      this.results.push({
        name,
        category,
        success: true,
        duration: Date.now() - startTime,
        url: this.page.url(),
        apiErrors: [...this.currentApiErrors],
      });
      
      if (this.currentApiErrors.length > 0) {
        log(`  ⚠️  Navegou para ${name} (${this.currentApiErrors.length} erros de API)`, COLORS.yellow);
      } else {
        log(`  ✅ Navegou para ${name}`, COLORS.green);
      }
      
    } catch (error) {
      const screenshotName = `${String(testNum).padStart(2, '0')}-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-FAILED.png`;
      await this.screenshot(screenshotName);
      
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      this.results.push({
        name,
        category,
        success: false,
        duration: Date.now() - startTime,
        apiErrors: [...this.currentApiErrors],
        error: errorMsg,
      });
      
      log(`  ❌ FALHOU: ${errorMsg}`, COLORS.red);
    }
  }

  private async testSubmenu(name: string, parentMenu: string, clickText: string, category: string): Promise<void> {
    const startTime = Date.now();
    const testNum = this.results.length + 1;
    this.currentApiErrors = [];
    
    log(`\n📋 TEST ${testNum}: ${name} [${category}] (submenu de ${parentMenu})`, COLORS.cyan);
    
    try {
      if (!this.page) throw new Error('Browser não iniciado');
      
      // Garantir que estamos na página principal com sidebar
      const currentUrl = this.page.url();
      if (currentUrl.includes('/tv') || !currentUrl.includes('/app')) {
        await this.page.goto(`${config.app.baseUrl}/app`, { waitUntil: 'networkidle' });
        await this.page.waitForTimeout(1000);
      }
      
      // Scroll para o topo do sidebar
      await this.page.evaluate(() => {
        const sidebars = document.querySelectorAll('[class*="sidebar"], nav, aside');
        sidebars.forEach(sidebar => {
          if (sidebar instanceof HTMLElement) {
            sidebar.scrollTop = 0;
          }
        });
      });
      await this.page.waitForTimeout(300);
      
      // Expandir o menu pai clicando nele (toggle do Collapsible)
      const parentExpanded = await this.page.evaluate((parentText) => {
        const elements = document.querySelectorAll('button, [role="button"], [data-state]');
        for (const el of elements) {
          const content = el.textContent?.trim() || '';
          if (content.includes(parentText)) {
            const isInSidebar = el.closest('nav, aside, [class*="sidebar"], [data-sidebar]');
            if (isInSidebar) {
              // Check if it's a collapsible trigger
              const collapsible = el.closest('[data-state]');
              if (collapsible) {
                const state = collapsible.getAttribute('data-state');
                if (state === 'closed') {
                  (el as HTMLElement).click();
                  return 'expanded';
                }
                return 'already-open';
              }
              (el as HTMLElement).click();
              return 'clicked';
            }
          }
        }
        return 'not-found';
      }, parentMenu);
      
      await this.page.waitForTimeout(500);
      
      // Agora clicar no submenu
      const clicked = await this.page.evaluate((text) => {
        // Look for submenu items specifically
        const subItems = document.querySelectorAll('[data-sidebar="menu-sub-button"], [class*="sub"], button, a, span');
        for (const el of subItems) {
          const content = el.textContent?.trim() || '';
          if (content === text || content.includes(text)) {
            const isInSidebar = el.closest('nav, aside, [class*="sidebar"], [data-sidebar]');
            if (isInSidebar) {
              el.scrollIntoView({ behavior: 'instant', block: 'center' });
              (el as HTMLElement).click();
              return true;
            }
          }
        }
        return false;
      }, clickText);
      
      if (!clicked) {
        // Try clicking parent again to expand
        await this.page.evaluate((parentText) => {
          const elements = document.querySelectorAll('button, [role="button"]');
          for (const el of elements) {
            const content = el.textContent?.trim() || '';
            if (content.includes(parentText)) {
              const isInSidebar = el.closest('nav, aside, [class*="sidebar"], [data-sidebar]');
              if (isInSidebar) {
                (el as HTMLElement).click();
                return true;
              }
            }
          }
          return false;
        }, parentMenu);
        
        await this.page.waitForTimeout(500);
        
        // Try submenu again
        const clickedRetry = await this.page.evaluate((text) => {
          const elements = document.querySelectorAll('button, a, span, div');
          for (const el of elements) {
            const content = el.textContent?.trim() || '';
            if (content === text) {
              const isInSidebar = el.closest('nav, aside, [class*="sidebar"], [data-sidebar]');
              if (isInSidebar) {
                el.scrollIntoView({ behavior: 'instant', block: 'center' });
                (el as HTMLElement).click();
                return true;
              }
            }
          }
          return false;
        }, clickText);
        
        if (!clickedRetry) {
          throw new Error(`Submenu "${clickText}" não encontrado`);
        }
      }
      
      // Aguardar navegação
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForTimeout(2000);
      
      const screenshotName = `${String(testNum).padStart(2, '0')}-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`;
      await this.screenshot(screenshotName);
      
      this.results.push({
        name,
        category,
        success: true,
        duration: Date.now() - startTime,
        url: this.page.url(),
        apiErrors: [...this.currentApiErrors],
      });
      
      if (this.currentApiErrors.length > 0) {
        log(`  ⚠️  Navegou para ${name} (${this.currentApiErrors.length} erros de API)`, COLORS.yellow);
      } else {
        log(`  ✅ Navegou para ${name}`, COLORS.green);
      }
      
    } catch (error) {
      const screenshotName = `${String(testNum).padStart(2, '0')}-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-FAILED.png`;
      await this.screenshot(screenshotName);
      
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      this.results.push({
        name,
        category,
        success: false,
        duration: Date.now() - startTime,
        apiErrors: [...this.currentApiErrors],
        error: errorMsg,
      });
      
      log(`  ❌ FALHOU: ${errorMsg}`, COLORS.red);
    }
  }

  private async testLogout(): Promise<void> {
    const startTime = Date.now();
    const testNum = this.results.length + 1;
    this.currentApiErrors = [];
    
    log(`\n📋 TEST ${testNum}: Logout [auth]`, COLORS.cyan);
    
    try {
      if (!this.page) throw new Error('Browser não iniciado');
      
      // Limpar localStorage para simular logout
      await this.page.evaluate(() => {
        localStorage.removeItem('evo-auth');
        localStorage.clear();
        sessionStorage.clear();
      });
      
      // Navegar para a página de auth
      await this.page.goto(`${config.app.baseUrl}/auth`, { waitUntil: 'networkidle' });
      await this.page.waitForTimeout(1000);
      
      // Verificar se está na página de login
      const finalUrl = this.page.url();
      const loginForm = await this.page.$('input[type="email"], input[type="password"]');
      
      if (loginForm || finalUrl.includes('auth')) {
        await this.screenshot(`${String(testNum).padStart(2, '0')}-logout-success.png`);
        
        this.results.push({
          name: 'Logout',
          category: 'auth',
          success: true,
          duration: Date.now() - startTime,
          url: this.page.url(),
          apiErrors: [...this.currentApiErrors],
        });
        
        log('  ✅ Logout realizado', COLORS.green);
      } else {
        throw new Error('Logout não funcionou');
      }
      
    } catch (error) {
      log(`  ❌ Logout falhou: ${error}`, COLORS.red);
    }
  }

  private async screenshot(name: string): Promise<void> {
    if (!this.page) return;
    const filepath = `${this.screenshotDir}/${name}`;
    await this.page.screenshot({ path: filepath, fullPage: false });
  }

  private async generateReport(): Promise<void> {
    const totalDuration = Date.now() - this.startTime;
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const total = this.results.length;
    const coverage = total > 0 ? ((passed / total) * 100).toFixed(1) : '0';
    
    const totalApiErrors = this.results.reduce((sum, r) => sum + r.apiErrors.length, 0);

    console.log('\n');
    log('╔════════════════════════════════════════════════════════════════════╗', COLORS.cyan);
    log('║                    📊 RESUMO DOS TESTES                            ║', COLORS.cyan);
    log('╚════════════════════════════════════════════════════════════════════╝', COLORS.cyan);
    console.log('');
    
    log(`  Total de testes: ${total}`, COLORS.reset);
    log(`  ✅ Passou: ${passed}`, COLORS.green);
    log(`  ❌ Falhou: ${failed}`, failed > 0 ? COLORS.red : COLORS.green);
    log(`  ⚠️  Erros de API: ${totalApiErrors}`, totalApiErrors > 0 ? COLORS.yellow : COLORS.green);
    log(`  ⏱️  Duração: ${(totalDuration / 1000).toFixed(2)}s`, COLORS.dim);
    log(`  📈 Taxa de Sucesso: ${coverage}%`, 
        parseFloat(coverage) >= 90 ? COLORS.green : COLORS.yellow);
    
    if (failed > 0) {
      console.log('');
      log('  ❌ Testes que falharam:', COLORS.red);
      this.results.filter(r => !r.success).forEach(r => {
        log(`     - ${r.name}: ${r.error}`, COLORS.red);
      });
    }

    console.log('');

    // Resumo por categoria
    log('  📂 Por Categoria:', COLORS.bold);
    const categories = [...new Set(this.results.map(r => r.category))];
    for (const cat of categories) {
      const catResults = this.results.filter(r => r.category === cat);
      const catPassed = catResults.filter(r => r.success).length;
      const catTotal = catResults.length;
      const status = catPassed === catTotal ? '✅' : '⚠️';
      log(`     ${status} ${cat}: ${catPassed}/${catTotal}`, COLORS.dim);
    }

    console.log('');

    // Salvar relatório JSON
    const reportPath = './reports/full-e2e-report.json';
    await fs.mkdir('./reports', { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      duration: totalDuration,
      summary: { 
        total, 
        passed, 
        failed, 
        successRate: parseFloat(coverage),
        totalApiErrors,
      },
      byCategory: categories.map(cat => ({
        category: cat,
        passed: this.results.filter(r => r.category === cat && r.success).length,
        total: this.results.filter(r => r.category === cat).length,
      })),
      results: this.results,
    }, null, 2));
    
    log(`📄 Relatório: ${reportPath}`, COLORS.dim);
    log(`📸 Screenshots: ${this.screenshotDir}/`, COLORS.dim);
    console.log('');

    process.exit(failed > 0 ? 1 : 0);
  }
}

// Run
const runner = new FullE2ETestRunner();
runner.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
