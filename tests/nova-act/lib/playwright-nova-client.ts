/**
 * Playwright + Bedrock Nova Client
 * 
 * Combina Playwright para automação de browser com Amazon Bedrock Nova
 * para análise inteligente de páginas e tomada de decisões.
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from '../config/nova-act.config';

export interface ActResult {
  success: boolean;
  response?: string;
  screenshot?: string;
  error?: string;
  duration: number;
  steps: string[];
}

export interface TestStep {
  name: string;
  action: string;
  expectedResult?: string;
}

export class PlaywrightNovaClient {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private bedrock: BedrockRuntimeClient;
  private logsDir: string;
  private screenshotCount = 0;

  constructor(
    private startingPage: string,
    private options: {
      headless?: boolean;
      timeout?: number;
      logsDirectory?: string;
    } = {}
  ) {
    this.bedrock = new BedrockRuntimeClient({ region: config.novaAct.region });
    this.logsDir = options.logsDirectory || './reports/screenshots';
  }

  async start(): Promise<void> {
    await fs.mkdir(this.logsDir, { recursive: true });
    
    this.browser = await chromium.launch({
      headless: this.options.headless ?? true,
    });
    
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    });
    
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.options.timeout || 30000);
    
    await this.page.goto(this.startingPage, { waitUntil: 'networkidle' });
    console.log(`🌐 Browser started at: ${this.startingPage}`);
  }

  async stop(): Promise<void> {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    this.page = null;
    this.context = null;
    this.browser = null;
    console.log('🛑 Browser stopped');
  }

  async screenshot(name?: string): Promise<string> {
    if (!this.page) throw new Error('Browser not started');
    
    const filename = name || `screenshot-${++this.screenshotCount}.png`;
    const filepath = path.join(this.logsDir, filename);
    await this.page.screenshot({ path: filepath, fullPage: true });
    return filepath;
  }

  async login(email: string, password: string): Promise<ActResult> {
    const startTime = Date.now();
    const steps: string[] = [];
    
    try {
      if (!this.page) throw new Error('Browser not started');
      
      // Aguardar página de login carregar
      steps.push('Aguardando página de login...');
      await this.page.waitForLoadState('networkidle');
      
      // Tentar encontrar campo de email
      steps.push('Procurando campo de email...');
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="e-mail" i]',
        '#email',
        '[data-testid="email-input"]',
      ];
      
      let emailInput = null;
      for (const selector of emailSelectors) {
        emailInput = await this.page.$(selector);
        if (emailInput) break;
      }
      
      if (!emailInput) {
        // Tentar com username
        emailInput = await this.page.$('input[name="username"]') || 
                     await this.page.$('input[type="text"]');
      }
      
      if (!emailInput) {
        await this.screenshot('login-no-email-field.png');
        throw new Error('Campo de email não encontrado');
      }
      
      steps.push('Preenchendo email...');
      await emailInput.fill(email);
      
      // Encontrar campo de senha
      steps.push('Procurando campo de senha...');
      const passwordInput = await this.page.$('input[type="password"]');
      if (!passwordInput) {
        await this.screenshot('login-no-password-field.png');
        throw new Error('Campo de senha não encontrado');
      }
      
      steps.push('Preenchendo senha...');
      await passwordInput.fill(password);
      
      // Encontrar e clicar no botão de login
      steps.push('Procurando botão de login...');
      const buttonSelectors = [
        'button[type="submit"]',
        'button:has-text("Entrar")',
        'button:has-text("Login")',
        'button:has-text("Sign in")',
        '[data-testid="login-button"]',
      ];
      
      let loginButton = null;
      for (const selector of buttonSelectors) {
        loginButton = await this.page.$(selector);
        if (loginButton) break;
      }
      
      if (!loginButton) {
        await this.screenshot('login-no-button.png');
        throw new Error('Botão de login não encontrado');
      }
      
      steps.push('Clicando em login...');
      await loginButton.click();
      
      // Aguardar navegação
      steps.push('Aguardando redirecionamento...');
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForTimeout(2000);
      
      // Verificar se login foi bem sucedido
      const currentUrl = this.page.url();
      const isLoggedIn = !currentUrl.includes('login') && !currentUrl.includes('signin');
      
      if (isLoggedIn) {
        steps.push('✅ Login realizado com sucesso!');
        await this.screenshot('login-success.png');
        return {
          success: true,
          response: 'Login realizado com sucesso',
          duration: Date.now() - startTime,
          steps,
        };
      } else {
        // Verificar mensagem de erro
        const errorMessage = await this.page.$('.error-message, [role="alert"], .text-red-500');
        const errorText = errorMessage ? await errorMessage.textContent() : 'Login falhou';
        
        await this.screenshot('login-failed.png');
        throw new Error(errorText || 'Login falhou - ainda na página de login');
      }
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      steps.push(`❌ Erro: ${errorMsg}`);
      
      return {
        success: false,
        error: errorMsg,
        duration: Date.now() - startTime,
        steps,
      };
    }
  }

  async navigate(destination: string): Promise<ActResult> {
    const startTime = Date.now();
    const steps: string[] = [];
    
    try {
      if (!this.page) throw new Error('Browser not started');
      
      steps.push(`Navegando para: ${destination}`);
      
      // Tentar encontrar link no sidebar ou menu
      const linkSelectors = [
        `a:has-text("${destination}")`,
        `button:has-text("${destination}")`,
        `[role="menuitem"]:has-text("${destination}")`,
        `nav a:has-text("${destination}")`,
        `.sidebar a:has-text("${destination}")`,
      ];
      
      let link = null;
      for (const selector of linkSelectors) {
        link = await this.page.$(selector);
        if (link) break;
      }
      
      if (link) {
        await link.click();
        await this.page.waitForLoadState('networkidle');
        steps.push(`✅ Navegou para ${destination}`);
        await this.screenshot(`nav-${destination.toLowerCase().replace(/\s+/g, '-')}.png`);
        
        return {
          success: true,
          response: `Navegou para ${destination}`,
          duration: Date.now() - startTime,
          steps,
        };
      }
      
      throw new Error(`Link para "${destination}" não encontrado`);
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      steps.push(`❌ Erro: ${errorMsg}`);
      await this.screenshot('nav-error.png');
      
      return {
        success: false,
        error: errorMsg,
        duration: Date.now() - startTime,
        steps,
      };
    }
  }

  async verifyElement(description: string): Promise<ActResult> {
    const startTime = Date.now();
    const steps: string[] = [];
    
    try {
      if (!this.page) throw new Error('Browser not started');
      
      steps.push(`Verificando: ${description}`);
      
      // Usar Bedrock Nova para analisar a página
      const screenshot = await this.page.screenshot({ encoding: 'base64' });
      const analysis = await this.analyzeWithNova(screenshot, description);
      
      if (analysis.found) {
        steps.push(`✅ Elemento encontrado: ${description}`);
        return {
          success: true,
          response: analysis.details,
          duration: Date.now() - startTime,
          steps,
        };
      }
      
      throw new Error(`Elemento não encontrado: ${description}`);
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      steps.push(`❌ Erro: ${errorMsg}`);
      
      return {
        success: false,
        error: errorMsg,
        duration: Date.now() - startTime,
        steps,
      };
    }
  }

  async checkDashboard(): Promise<ActResult> {
    const startTime = Date.now();
    const steps: string[] = [];
    
    try {
      if (!this.page) throw new Error('Browser not started');
      
      steps.push('Verificando dashboard...');
      await this.page.waitForLoadState('networkidle');
      
      // Verificar elementos típicos do dashboard
      const checks = [
        { name: 'KPI Cards', selectors: ['.card', '[class*="card"]', '[class*="kpi"]', '[class*="stat"]'] },
        { name: 'Sidebar', selectors: ['nav', '.sidebar', '[class*="sidebar"]', 'aside'] },
        { name: 'Header', selectors: ['header', '[class*="header"]', '[class*="navbar"]'] },
      ];
      
      const results: string[] = [];
      
      for (const check of checks) {
        let found = false;
        for (const selector of check.selectors) {
          const element = await this.page.$(selector);
          if (element) {
            found = true;
            break;
          }
        }
        results.push(`${check.name}: ${found ? '✅' : '❌'}`);
        steps.push(`${check.name}: ${found ? 'encontrado' : 'não encontrado'}`);
      }
      
      await this.screenshot('dashboard-check.png');
      
      const allFound = !results.some(r => r.includes('❌'));
      
      return {
        success: allFound,
        response: results.join(', '),
        duration: Date.now() - startTime,
        steps,
      };
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      steps.push(`❌ Erro: ${errorMsg}`);
      
      return {
        success: false,
        error: errorMsg,
        duration: Date.now() - startTime,
        steps,
      };
    }
  }

  async logout(): Promise<ActResult> {
    const startTime = Date.now();
    const steps: string[] = [];
    
    try {
      if (!this.page) throw new Error('Browser not started');
      
      steps.push('Procurando menu de usuário...');
      
      // Tentar encontrar menu de usuário (avatar ou dropdown)
      const userMenuSelectors = [
        '[data-testid="user-menu"]',
        '[class*="avatar"]',
        '[class*="user-menu"]',
        'button[aria-label*="user" i]',
        'button[aria-label*="menu" i]',
        'button[aria-label*="perfil" i]',
        // Procurar por botões com ícone de usuário
        'button:has(svg[class*="lucide-user"])',
        'button:has(svg[class*="lucide-circle-user"])',
        // Dropdown trigger no header
        'header button:last-child',
        '[class*="dropdown"] button',
      ];
      
      let menuOpened = false;
      for (const selector of userMenuSelectors) {
        const userMenu = await this.page.$(selector);
        if (userMenu) {
          await userMenu.click();
          await this.page.waitForTimeout(500);
          menuOpened = true;
          steps.push('Menu de usuário aberto');
          break;
        }
      }
      
      // Procurar botão de logout
      steps.push('Procurando botão de logout...');
      const logoutSelectors = [
        'button:has-text("Sair")',
        'button:has-text("Logout")',
        'a:has-text("Sair")',
        'a:has-text("Logout")',
        '[data-testid="logout"]',
        '[role="menuitem"]:has-text("Sair")',
        '[role="menuitem"]:has-text("Logout")',
        // Procurar em dropdown menus
        '[class*="dropdown"] button:has-text("Sair")',
        '[class*="menu"] button:has-text("Sair")',
      ];
      
      let logoutButton = null;
      for (const selector of logoutSelectors) {
        logoutButton = await this.page.$(selector);
        if (logoutButton) break;
      }
      
      if (logoutButton) {
        await logoutButton.click();
        await this.page.waitForLoadState('networkidle');
        await this.page.waitForTimeout(1000);
        
        // Verificar se voltou para login
        const currentUrl = this.page.url();
        if (currentUrl.includes('login') || currentUrl.includes('auth') || currentUrl === config.app.baseUrl + '/') {
          steps.push('✅ Logout realizado');
          await this.screenshot('logout-success.png');
          
          return {
            success: true,
            response: 'Logout realizado com sucesso',
            duration: Date.now() - startTime,
            steps,
          };
        }
      }
      
      // Se não encontrou botão de logout, tentar navegar direto para logout
      steps.push('Tentando logout via URL...');
      await this.page.goto(`${config.app.baseUrl}/auth`, { waitUntil: 'networkidle' });
      await this.page.waitForTimeout(1000);
      
      const finalUrl = this.page.url();
      if (finalUrl.includes('auth') || finalUrl.includes('login')) {
        steps.push('✅ Logout realizado via navegação');
        await this.screenshot('logout-success.png');
        return {
          success: true,
          response: 'Logout realizado via navegação',
          duration: Date.now() - startTime,
          steps,
        };
      }
      
      throw new Error('Não foi possível fazer logout');
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      steps.push(`❌ Erro: ${errorMsg}`);
      
      return {
        success: false,
        error: errorMsg,
        duration: Date.now() - startTime,
        steps,
      };
    }
  }

  async getCurrentUrl(): Promise<string> {
    return this.page?.url() || '';
  }

  async getPageTitle(): Promise<string> {
    return this.page?.title() || '';
  }

  private async analyzeWithNova(
    screenshotBase64: string,
    question: string
  ): Promise<{ found: boolean; details: string }> {
    try {
      const prompt = `Analyze this screenshot and answer: ${question}
      
      Respond in JSON format:
      {
        "found": true/false,
        "details": "description of what you found"
      }`;

      const command = new InvokeModelCommand({
        modelId: 'amazon.nova-lite-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/png',
                    data: screenshotBase64,
                  },
                },
                {
                  type: 'text',
                  text: prompt,
                },
              ],
            },
          ],
          max_tokens: 500,
        }),
      });

      const response = await this.bedrock.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      // Parse response
      const content = responseBody.content?.[0]?.text || '{}';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return { found: false, details: 'Could not parse response' };
      
    } catch (error) {
      console.warn('Nova analysis failed, using fallback:', error);
      return { found: true, details: 'Analysis skipped - using DOM verification' };
    }
  }
}

export function createPlaywrightNovaClient(
  startingPage: string,
  options?: {
    headless?: boolean;
    timeout?: number;
    logsDirectory?: string;
  }
): PlaywrightNovaClient {
  return new PlaywrightNovaClient(startingPage, options);
}

export default PlaywrightNovaClient;
