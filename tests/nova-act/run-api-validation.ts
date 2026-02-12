#!/usr/bin/env tsx
/**
 * API Validation Test Suite
 * 
 * Testa todas as páginas e captura erros de API (403, 502, etc.)
 * para identificar problemas de backend
 */

import { chromium, Browser, Page, BrowserContext, Request, Response } from 'playwright';
import { config } from './config/nova-act.config';
import * as fs from 'fs/promises';

interface ApiError {
  url: string;
  status: number;
  statusText: string;
  method: string;
  page: string;
  timestamp: string;
}

interface PageResult {
  name: string;
  url: string;
  success: boolean;
  apiErrors: ApiError[];
  consoleErrors: string[];
  duration: number;
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

// Páginas para testar (baseado no AppSidebar)
const PAGES_TO_TEST = [
  { name: 'Dashboard Executivo', menuText: 'Dashboard Executivo', expectedTab: 'executive' },
  { name: 'Análise de Custos', menuText: 'Análise de Custos', expectedTab: 'costs' },
  { name: 'Copilot AI', menuText: 'Copilot AI', expectedTab: 'copilot' },
  { name: 'Previsões ML', menuText: 'Previsões ML', expectedTab: 'ml' },
  { name: 'Monitoramento', menuText: 'Monitoramento', expectedTab: 'monitoring' },
  { name: 'Detecção de Ataques', menuText: 'Detecção de Ataques', expectedTab: 'attack-detection' },
  { name: 'Análises & Scans', menuText: 'Análises', expectedTab: 'scans' },
  { name: 'Otimização', menuText: 'Otimização', expectedTab: 'optimization' },
  { name: 'Alertas Inteligentes', menuText: 'Alertas Inteligentes', expectedTab: 'alerts' },
  { name: 'Postura de Segurança', menuText: 'Postura de Segurança', expectedTab: 'security' },
  { name: 'Tickets de Remediação', menuText: 'Tickets de Remediação', expectedTab: 'tickets' },
  { name: 'Base de Conhecimento', menuText: 'Base de Conhecimento', expectedTab: 'knowledge-base' },
  { name: 'TV Dashboards', menuText: 'TV Dashboards', expectedTab: 'tv-dashboards' },
  { name: 'Configurações AWS', menuText: 'Configurações AWS', expectedTab: 'aws-settings' },
  { name: 'Gerenciar Usuários', menuText: 'Gerenciar Usuários', expectedTab: 'users' },
  { name: 'Licença', menuText: 'Licença', expectedTab: 'license' },
];

class ApiValidationRunner {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private results: PageResult[] = [];
  private allApiErrors: ApiError[] = [];
  private currentPageErrors: ApiError[] = [];
  private currentConsoleErrors: string[] = [];
  private currentPageName = '';
  private startTime = 0;
  private screenshotDir = './reports/api-validation-screenshots';

  async run(): Promise<void> {
    console.log('\n');
    log('╔════════════════════════════════════════════════════════════════════╗', COLORS.cyan);
    log('║     🔍 EVO UDS - API Validation Test Suite                          ║', COLORS.cyan);
    log('║     Detecta erros de API em todas as páginas                       ║', COLORS.cyan);
    log('╚════════════════════════════════════════════════════════════════════╝', COLORS.cyan);
    console.log('\n');

    this.startTime = Date.now();

    await fs.rm(this.screenshotDir, { recursive: true, force: true });
    await fs.mkdir(this.screenshotDir, { recursive: true });

    try {
      await this.initBrowser();
      await this.testLogin();
      
      for (const pageConfig of PAGES_TO_TEST) {
        await this.testPage(pageConfig);
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
    log('🚀 Iniciando browser com interceptação de rede...', COLORS.cyan);
    
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
    
    // Interceptar respostas de API
    this.page.on('response', (response: Response) => {
      const url = response.url();
      const status = response.status();
      
      // Capturar erros de API (4xx e 5xx)
      if (url.includes('api-evo.ai.udstec.io') || url.includes('/api/')) {
        if (status >= 400) {
          const error: ApiError = {
            url: url,
            status: status,
            statusText: response.statusText(),
            method: response.request().method(),
            page: this.currentPageName,
            timestamp: new Date().toISOString(),
          };
          this.currentPageErrors.push(error);
          this.allApiErrors.push(error);
          
          // Log imediato do erro
          log(`  ⚠️  API Error: ${status} ${response.request().method()} ${url.split('?')[0]}`, COLORS.yellow);
        }
      }
    });
    
    // Capturar erros de console
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon') && !text.includes('net::ERR')) {
          this.currentConsoleErrors.push(text.substring(0, 200));
        }
      }
    });
    
    await this.page.goto(config.app.baseUrl, { waitUntil: 'domcontentloaded' });
    log('🌐 Browser iniciado com interceptação de rede\n', COLORS.green);
  }

  private async closeBrowser(): Promise<void> {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    log('\n🛑 Browser fechado', COLORS.dim);
  }

  private async testLogin(): Promise<void> {
    const startTime = Date.now();
    this.currentPageName = 'Login';
    this.currentPageErrors = [];
    this.currentConsoleErrors = [];
    
    log('📋 TEST: Login', COLORS.cyan);
    
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
      await this.page.waitForTimeout(3000); // Aguardar APIs carregarem
      
      await this.screenshot('00-login-success.png');
      
      this.results.push({
        name: 'Login',
        url: this.page.url(),
        success: true,
        apiErrors: [...this.currentPageErrors],
        consoleErrors: [...this.currentConsoleErrors],
        duration: Date.now() - startTime,
      });
      
      log(`  ✅ Login realizado (${this.currentPageErrors.length} erros de API)`, 
          this.currentPageErrors.length > 0 ? COLORS.yellow : COLORS.green);
      
    } catch (error) {
      await this.screenshot('00-login-failed.png');
      throw error;
    }
  }

  private async testPage(pageConfig: { name: string; menuText: string; expectedTab: string }): Promise<void> {
    const startTime = Date.now();
    const testNum = this.results.length + 1;
    this.currentPageName = pageConfig.name;
    this.currentPageErrors = [];
    this.currentConsoleErrors = [];
    
    log(`\n📋 TEST ${testNum}: ${pageConfig.name}`, COLORS.cyan);
    
    try {
      if (!this.page) throw new Error('Browser não iniciado');
      
      // Scroll no sidebar para encontrar o item
      await this.page.evaluate(() => {
        const sidebars = document.querySelectorAll('[class*="sidebar"], nav, aside');
        sidebars.forEach(sidebar => {
          if (sidebar instanceof HTMLElement) {
            sidebar.scrollTop = sidebar.scrollHeight;
          }
        });
      });
      await this.page.waitForTimeout(300);
      
      // Clicar no item do menu
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
      }, pageConfig.menuText);
      
      if (!clicked) {
        // Tentar scroll para cima
        await this.page.evaluate(() => {
          const sidebars = document.querySelectorAll('[class*="sidebar"], nav, aside');
          sidebars.forEach(sidebar => {
            if (sidebar instanceof HTMLElement) {
              sidebar.scrollTop = 0;
            }
          });
        });
        await this.page.waitForTimeout(300);
        
        await this.page.evaluate((text) => {
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
        }, pageConfig.menuText);
      }
      
      // Aguardar navegação e APIs
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForTimeout(3000); // Tempo extra para APIs carregarem
      
      const screenshotName = `${String(testNum).padStart(2, '0')}-${pageConfig.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`;
      await this.screenshot(screenshotName);
      
      this.results.push({
        name: pageConfig.name,
        url: this.page.url(),
        success: this.currentPageErrors.length === 0,
        apiErrors: [...this.currentPageErrors],
        consoleErrors: [...this.currentConsoleErrors],
        duration: Date.now() - startTime,
      });
      
      if (this.currentPageErrors.length > 0) {
        log(`  ⚠️  ${pageConfig.name}: ${this.currentPageErrors.length} erro(s) de API`, COLORS.yellow);
        this.currentPageErrors.forEach(err => {
          log(`      ${err.status} ${err.method} ${err.url.split('/').pop()?.split('?')[0]}`, COLORS.dim);
        });
      } else {
        log(`  ✅ ${pageConfig.name}: OK`, COLORS.green);
      }
      
    } catch (error) {
      const screenshotName = `${String(testNum).padStart(2, '0')}-${pageConfig.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-FAILED.png`;
      await this.screenshot(screenshotName);
      
      this.results.push({
        name: pageConfig.name,
        url: this.page?.url() || '',
        success: false,
        apiErrors: [...this.currentPageErrors],
        consoleErrors: [...this.currentConsoleErrors, String(error)],
        duration: Date.now() - startTime,
      });
      
      log(`  ❌ ${pageConfig.name}: FALHOU - ${error}`, COLORS.red);
    }
  }

  private async testLogout(): Promise<void> {
    const startTime = Date.now();
    const testNum = this.results.length + 1;
    this.currentPageName = 'Logout';
    this.currentPageErrors = [];
    this.currentConsoleErrors = [];
    
    log(`\n📋 TEST ${testNum}: Logout`, COLORS.cyan);
    
    try {
      if (!this.page) throw new Error('Browser não iniciado');
      
      const logoutButton = await this.page.$('button:has-text("Sair")');
      if (logoutButton) {
        await logoutButton.click();
        await this.page.waitForTimeout(2000);
      }
      
      await this.page.goto(`${config.app.baseUrl}/auth`, { waitUntil: 'networkidle' });
      
      await this.screenshot(`${String(testNum).padStart(2, '0')}-logout-success.png`);
      
      this.results.push({
        name: 'Logout',
        url: this.page.url(),
        success: true,
        apiErrors: [...this.currentPageErrors],
        consoleErrors: [...this.currentConsoleErrors],
        duration: Date.now() - startTime,
      });
      
      log('  ✅ Logout realizado', COLORS.green);
      
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
    const pagesWithErrors = this.results.filter(r => r.apiErrors.length > 0);
    const pagesWithoutErrors = this.results.filter(r => r.apiErrors.length === 0);
    const totalApiErrors = this.allApiErrors.length;
    
    // Agrupar erros por endpoint
    const errorsByEndpoint = new Map<string, ApiError[]>();
    this.allApiErrors.forEach(err => {
      const endpoint = err.url.split('?')[0].split('/').slice(-1)[0];
      if (!errorsByEndpoint.has(endpoint)) {
        errorsByEndpoint.set(endpoint, []);
      }
      errorsByEndpoint.get(endpoint)!.push(err);
    });

    console.log('\n');
    log('╔════════════════════════════════════════════════════════════════════╗', COLORS.cyan);
    log('║                    📊 RESUMO DA VALIDAÇÃO                          ║', COLORS.cyan);
    log('╚════════════════════════════════════════════════════════════════════╝', COLORS.cyan);
    console.log('');
    
    log(`  Total de páginas testadas: ${this.results.length}`, COLORS.reset);
    log(`  ✅ Páginas sem erros: ${pagesWithoutErrors.length}`, COLORS.green);
    log(`  ⚠️  Páginas com erros: ${pagesWithErrors.length}`, pagesWithErrors.length > 0 ? COLORS.yellow : COLORS.green);
    log(`  🔴 Total de erros de API: ${totalApiErrors}`, totalApiErrors > 0 ? COLORS.red : COLORS.green);
    log(`  ⏱️  Duração: ${(totalDuration / 1000).toFixed(2)}s`, COLORS.dim);
    
    if (totalApiErrors > 0) {
      console.log('');
      log('  📋 ERROS POR ENDPOINT:', COLORS.bold);
      
      const sortedEndpoints = [...errorsByEndpoint.entries()].sort((a, b) => b[1].length - a[1].length);
      
      for (const [endpoint, errors] of sortedEndpoints) {
        const statusCounts = new Map<number, number>();
        errors.forEach(e => {
          statusCounts.set(e.status, (statusCounts.get(e.status) || 0) + 1);
        });
        
        const statusStr = [...statusCounts.entries()]
          .map(([status, count]) => `${status}×${count}`)
          .join(', ');
        
        log(`     🔴 ${endpoint}: ${errors.length} erro(s) [${statusStr}]`, COLORS.red);
      }
      
      console.log('');
      log('  📋 PÁGINAS COM ERROS:', COLORS.bold);
      pagesWithErrors.forEach(page => {
        log(`     ⚠️  ${page.name}: ${page.apiErrors.length} erro(s)`, COLORS.yellow);
      });
    }

    console.log('');

    // Salvar relatório JSON detalhado
    const reportPath = './reports/api-validation-report.json';
    await fs.mkdir('./reports', { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      duration: totalDuration,
      summary: {
        totalPages: this.results.length,
        pagesWithErrors: pagesWithErrors.length,
        pagesWithoutErrors: pagesWithoutErrors.length,
        totalApiErrors: totalApiErrors,
      },
      errorsByEndpoint: Object.fromEntries(
        [...errorsByEndpoint.entries()].map(([k, v]) => [k, v.length])
      ),
      allApiErrors: this.allApiErrors,
      results: this.results,
    }, null, 2));
    
    log(`📄 Relatório: ${reportPath}`, COLORS.dim);
    log(`📸 Screenshots: ${this.screenshotDir}/`, COLORS.dim);
    console.log('');

    // Exit code baseado em erros críticos (502, 500)
    const criticalErrors = this.allApiErrors.filter(e => e.status >= 500);
    process.exit(criticalErrors.length > 0 ? 1 : 0);
  }
}

// Run
const runner = new ApiValidationRunner();
runner.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
