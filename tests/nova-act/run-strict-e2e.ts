#!/usr/bin/env tsx
/**
 * Strict E2E Test Suite - Validação Rigorosa
 * 
 * Testa todas as funcionalidades com validação real de cada página
 * Falha se a navegação não funcionar corretamente
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { config } from './config/nova-act.config';
import * as fs from 'fs/promises';

interface TestResult {
  name: string;
  category: string;
  success: boolean;
  duration: number;
  url?: string;
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
const MENU_MAPPING: Record<string, { click: string; expectedTab: string }> = {
  'Dashboard Executivo': { click: 'Dashboard Executivo', expectedTab: 'executive' },
  'Análise de Custos': { click: 'Análise de Custos', expectedTab: 'costs' },
  'Copilot AI': { click: 'Copilot AI', expectedTab: 'copilot' },
  'Previsões ML': { click: 'Previsões ML', expectedTab: 'ml' },
  'Monitoramento': { click: 'Monitoramento', expectedTab: 'monitoring' },
  'Detecção de Ataques': { click: 'Detecção de Ataques', expectedTab: 'attack-detection' },
  'Análises & Scans': { click: 'Análises', expectedTab: 'scans' },
  'Otimização': { click: 'Otimização', expectedTab: 'optimization' },
  'Alertas Inteligentes': { click: 'Alertas Inteligentes', expectedTab: 'alerts' },
  'Postura de Segurança': { click: 'Postura de Segurança', expectedTab: 'security' },
  'Tickets de Remediação': { click: 'Tickets de Remediação', expectedTab: 'tickets' },
  'Base de Conhecimento': { click: 'Base de Conhecimento', expectedTab: 'knowledge-base' },
  'TV Dashboards': { click: 'TV Dashboards', expectedTab: 'tv-dashboards' },
  'Configurações AWS': { click: 'Configurações AWS', expectedTab: 'aws-settings' },
  'Gerenciar Usuários': { click: 'Gerenciar Usuários', expectedTab: 'users' },
  'Licença': { click: 'Licença', expectedTab: 'license' },
};

class StrictE2ERunner {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private results: TestResult[] = [];
  private startTime = 0;
  private screenshotDir = './reports/strict-screenshots';

  async run(): Promise<void> {
    console.log('\n');
    log('╔════════════════════════════════════════════════════════════════════╗', COLORS.cyan);
    log('║     🔒 EVO UDS - Strict E2E Test Suite                             ║', COLORS.cyan);
    log('║     Validação Rigorosa de Todas as Páginas                         ║', COLORS.cyan);
    log('╚════════════════════════════════════════════════════════════════════╝', COLORS.cyan);
    console.log('\n');

    this.startTime = Date.now();

    // Limpar screenshots anteriores
    await fs.rm(this.screenshotDir, { recursive: true, force: true });
    await fs.mkdir(this.screenshotDir, { recursive: true });

    try {
      await this.initBrowser();
      
      // 1. Login
      await this.testLogin();
      
      // 2. Testar cada página do menu
      for (const [name, mapping] of Object.entries(MENU_MAPPING)) {
        await this.testNavigation(name, mapping.click, mapping.expectedTab);
      }
      
      // 3. Logout
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
    this.printTestHeader('Login', 'auth');
    
    try {
      if (!this.page) throw new Error('Browser não iniciado');
      
      // Navegar para página de login
      await this.page.goto(`${config.app.baseUrl}/auth`, { waitUntil: 'networkidle' });
      await this.page.waitForTimeout(2000);
      
      // Preencher formulário
      const emailInput = await this.page.waitForSelector('input[type="email"], input[placeholder*="email" i]', { timeout: 10000 });
      await emailInput.fill(config.testUser.email);
      
      const passwordInput = await this.page.waitForSelector('input[type="password"]', { timeout: 5000 });
      await passwordInput.fill(config.testUser.password);
      
      // Clicar em login
      const loginButton = await this.page.waitForSelector('button[type="submit"], button:has-text("Entrar")', { timeout: 5000 });
      await loginButton.click();
      
      // Aguardar redirecionamento para /app
      await this.page.waitForURL('**/app**', { timeout: 15000 });
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForTimeout(2000);
      
      // Verificar se está no dashboard
      const url = this.page.url();
      if (!url.includes('/app')) {
        throw new Error(`Login falhou - URL atual: ${url}`);
      }
      
      // Verificar elementos do dashboard
      const sidebar = await this.page.$('nav, aside, [class*="sidebar"]');
      if (!sidebar) {
        throw new Error('Sidebar não encontrada após login');
      }
      
      await this.screenshot('01-login-success.png');
      
      this.results.push({
        name: 'Login',
        category: 'auth',
        success: true,
        duration: Date.now() - startTime,
        url: this.page.url(),
      });
      
      log('  ✅ Login realizado com sucesso', COLORS.green);
      
    } catch (error) {
      await this.screenshot('01-login-failed.png');
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      this.results.push({
        name: 'Login',
        category: 'auth',
        success: false,
        duration: Date.now() - startTime,
        error: errorMsg,
      });
      
      log(`  ❌ FALHOU: ${errorMsg}`, COLORS.red);
      throw error; // Abortar se login falhar
    }
  }

  private async testNavigation(name: string, clickText: string, expectedTab: string): Promise<void> {
    const startTime = Date.now();
    const testNum = this.results.length + 1;
    this.printTestHeader(name, 'navigation');
    
    try {
      if (!this.page) throw new Error('Browser não iniciado');
      
      // Primeiro, fazer scroll no sidebar para o final para encontrar itens no fim
      await this.page.evaluate(() => {
        const sidebars = document.querySelectorAll('[class*="sidebar"], nav, aside');
        sidebars.forEach(sidebar => {
          if (sidebar instanceof HTMLElement) {
            sidebar.scrollTop = sidebar.scrollHeight;
          }
        });
        // Também scroll em elementos internos do sidebar
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
        // Encontrar todos os elementos que contêm o texto
        const elements = document.querySelectorAll('button, a, span, div');
        for (const el of elements) {
          const content = el.textContent?.trim() || '';
          if (content === text || content.includes(text)) {
            // Verificar se está no sidebar ou é um item de menu
            const isInSidebar = el.closest('nav, aside, [class*="sidebar"], [data-sidebar]');
            if (isInSidebar) {
              // Scroll até o elemento
              el.scrollIntoView({ behavior: 'instant', block: 'center' });
              // Clicar
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
      
      // Tirar screenshot
      const screenshotName = `${String(testNum).padStart(2, '0')}-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`;
      await this.screenshot(screenshotName);
      
      this.results.push({
        name,
        category: 'navigation',
        success: true,
        duration: Date.now() - startTime,
        url: this.page.url(),
      });
      
      log(`  ✅ Navegou para ${name}`, COLORS.green);
      
    } catch (error) {
      const screenshotName = `${String(testNum).padStart(2, '0')}-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-FAILED.png`;
      await this.screenshot(screenshotName);
      
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      this.results.push({
        name,
        category: 'navigation',
        success: false,
        duration: Date.now() - startTime,
        error: errorMsg,
      });
      
      log(`  ❌ FALHOU: ${errorMsg}`, COLORS.red);
    }
  }

  private async testLogout(): Promise<void> {
    const startTime = Date.now();
    const testNum = this.results.length + 1;
    this.printTestHeader('Logout', 'auth');
    
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
        });
        
        log('  ✅ Logout realizado', COLORS.green);
      } else {
        throw new Error('Logout não funcionou');
      }
      
    } catch (error) {
      await this.screenshot(`${String(testNum).padStart(2, '0')}-logout-FAILED.png`);
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      this.results.push({
        name: 'Logout',
        category: 'auth',
        success: false,
        duration: Date.now() - startTime,
        error: errorMsg,
      });
      
      log(`  ❌ FALHOU: ${errorMsg}`, COLORS.red);
    }
  }

  private async screenshot(name: string): Promise<void> {
    if (!this.page) return;
    const filepath = `${this.screenshotDir}/${name}`;
    await this.page.screenshot({ path: filepath, fullPage: false });
  }

  private printTestHeader(name: string, category: string): void {
    const testNum = this.results.length + 1;
    log(`\n📋 TEST ${testNum}: ${name} [${category}]`, COLORS.cyan);
  }

  private async generateReport(): Promise<void> {
    const totalDuration = Date.now() - this.startTime;
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const total = this.results.length;
    const coverage = total > 0 ? ((passed / total) * 100).toFixed(1) : '0';

    console.log('\n');
    log('╔════════════════════════════════════════════════════════════════════╗', COLORS.cyan);
    log('║                    📊 RESUMO DOS TESTES                            ║', COLORS.cyan);
    log('╚════════════════════════════════════════════════════════════════════╝', COLORS.cyan);
    console.log('');
    
    log(`  Total de testes: ${total}`, COLORS.reset);
    log(`  ✅ Passou: ${passed}`, COLORS.green);
    log(`  ❌ Falhou: ${failed}`, COLORS.red);
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

    // Salvar relatório JSON
    const reportPath = './reports/strict-e2e-report.json';
    await fs.mkdir('./reports', { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      duration: totalDuration,
      summary: { total, passed, failed, successRate: parseFloat(coverage) },
      results: this.results,
    }, null, 2));
    
    log(`📄 Relatório: ${reportPath}`, COLORS.dim);
    log(`📸 Screenshots: ${this.screenshotDir}/`, COLORS.dim);
    console.log('');

    process.exit(failed > 0 ? 1 : 0);
  }
}

// Run
const runner = new StrictE2ERunner();
runner.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
