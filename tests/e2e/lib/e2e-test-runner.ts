/**
 * E2E Test Runner
 * Main orchestrator for browser-based end-to-end testing
 */

import { chromium, Browser, Page, BrowserContext } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { TestConfig, getConfig } from '../config/test-config';
import { ConsoleMonitor, ErrorCategory, CapturedError } from './console-monitor';
import { MenuNavigator, NavigationResult } from './menu-navigator';
import { ErrorReporter, TestIterationResult } from './error-reporter';
import { getAllMenuItems, MenuItem } from '../config/menu-items';

export class E2ETestRunner {
  private config: TestConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private monitor: ConsoleMonitor;
  private navigator: MenuNavigator | null = null;
  private reporter: ErrorReporter;
  private iterations: TestIterationResult[] = [];
  private screenshotCounter = 0;

  constructor(configOverrides?: Partial<TestConfig>) {
    this.config = getConfig(configOverrides);
    this.monitor = new ConsoleMonitor();
    this.reporter = new ErrorReporter(this.config.outputDir);
  }

  /**
   * Initialize browser and page
   */
  async initialize(): Promise<void> {
    this.log('Initializing browser...');
    
    this.browser = await chromium.launch({
      headless: this.config.browser.headless,
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.browser.timeout);
    
    // Start console monitoring
    this.monitor.start(this.page);
    
    // Initialize navigator
    this.navigator = new MenuNavigator(
      this.page,
      this.config.browser.actionTimeout,
      this.config.waitBetweenActions
    );

    this.log('Browser initialized');
  }

  /**
   * Authenticate with the application
   */
  async authenticate(): Promise<boolean> {
    if (!this.page) throw new Error('Browser not initialized');

    this.log(`Navigating to ${this.config.baseUrl}...`);
    
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        // Navigate to login page (root or /auth)
        await this.page.goto(`${this.config.baseUrl}/`, { waitUntil: 'domcontentloaded' });
        
        // Wait for page to be ready
        await this.page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
        
        // Debug: log current URL and page content
        this.log(`Current URL: ${this.page.url()}`);
        
        // Check if already logged in
        if (this.page.url().includes('/app')) {
          this.log('Already authenticated');
          return true;
        }

        // Wait a bit for React to render
        await this.wait(2000);
        
        // Debug: check what's on the page
        const pageContent = await this.page.content();
        const hasLoginForm = pageContent.includes('login-email') || pageContent.includes('Email');
        this.log(`Page has login form: ${hasLoginForm}`);

        this.log('Entering credentials...');
        
        // Find and fill email field - try multiple selectors
        let emailInput = this.page.locator('#login-email');
        if (await emailInput.count() === 0) {
          emailInput = this.page.locator('input[type="email"]').first();
        }
        if (await emailInput.count() === 0) {
          emailInput = this.page.getByPlaceholder(/email/i).first();
        }
        
        await emailInput.waitFor({ state: 'visible', timeout: 15000 });
        await emailInput.fill(this.config.credentials.email);

        // Find and fill password field
        let passwordInput = this.page.locator('#login-password');
        if (await passwordInput.count() === 0) {
          passwordInput = this.page.locator('input[type="password"]').first();
        }
        await passwordInput.fill(this.config.credentials.password);

        // Click login button
        const loginButton = this.page.locator('button[type="submit"]').first();
        await loginButton.click();

        // Wait for redirect to dashboard
        await this.page.waitForURL(/\/(app|dashboard)/, { timeout: 15000 });
        await this.page.waitForLoadState('networkidle');

        this.log('Authentication successful');
        return true;

      } catch (error) {
        retries++;
        this.log(`Authentication attempt ${retries} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        if (retries < maxRetries) {
          this.log(`Retrying in ${retries * 2} seconds...`);
          await this.wait(retries * 2000);
        }
      }
    }

    this.log('Authentication failed after all retries');
    await this.captureScreenshot('auth-failure');
    return false;
  }

  /**
   * Run a single test iteration
   */
  async runIteration(): Promise<TestIterationResult> {
    if (!this.page || !this.navigator) throw new Error('Browser not initialized');

    const startTime = Date.now();
    const iterationNumber = this.iterations.length + 1;
    
    this.log(`\n========== Starting Iteration ${iterationNumber} ==========\n`);
    
    // Clear previous errors
    this.monitor.clear();
    
    // Get menu items to test
    const menuItems = this.config.menus 
      ? getAllMenuItems(true).filter(m => this.config.menus!.includes(m.value))
      : getAllMenuItems(true);

    const navigationResults: NavigationResult[] = [];
    const screenshots: string[] = [];

    // Navigate through all menus
    for (const menuItem of menuItems) {
      this.log(`Testing: ${menuItem.name} (${menuItem.route})`);
      this.monitor.setCurrentMenuItem(menuItem.name);

      const result = await this.navigator.navigateToRoute(menuItem.route, menuItem.name);
      navigationResults.push(result);

      if (!result.success) {
        this.log(`  ❌ Navigation failed: ${result.errorMessage}`);
      } else {
        this.log(`  ✓ Loaded in ${result.loadTime}ms`);
        
        // Wait for dynamic content to load
        await this.wait(2000);
        
        // Test page functionality
        const funcResult = await this.navigator.testPageFunctionality();
        this.log(`    Tables: ${funcResult.tablesWithData}/${funcResult.tablesFound}, Inputs: ${funcResult.formsInteractive}/${funcResult.formsFound}, Buttons: ${funcResult.buttonsClickable}/${funcResult.buttonsFound}`);
        
        // Check for loading states or empty states
        const loadingIndicators = await this.page.locator('[class*="loading"], [class*="spinner"], [class*="skeleton"]').count();
        const emptyStates = await this.page.locator('[class*="empty"], :text("No data"), :text("Nenhum"), :text("vazio")').count();
        if (loadingIndicators > 0) {
          this.log(`    ⏳ Loading indicators found: ${loadingIndicators}`);
        }
        if (emptyStates > 0) {
          this.log(`    📭 Empty states found: ${emptyStates}`);
        }
        
        // Check for error messages or missing credentials warnings
        const errorMessages = await this.page.locator('[class*="error"], [class*="alert-destructive"], [role="alert"]').count();
        const warningMessages = await this.page.locator('[class*="warning"], [class*="alert-warning"]').count();
        const noCredentials = await this.page.locator(':text("credenciais"), :text("credentials"), :text("Configure"), :text("conectar")').count();
        
        if (errorMessages > 0) {
          this.log(`    ❌ Error messages on page: ${errorMessages}`);
        }
        if (warningMessages > 0) {
          this.log(`    ⚠️ Warning messages on page: ${warningMessages}`);
        }
        if (noCredentials > 0) {
          this.log(`    🔑 Credentials/config messages: ${noCredentials}`);
        }
      }

      // Capture screenshot if there are errors on this page
      const pageErrors = this.monitor.getErrors().filter(e => e.menuItem === menuItem.name);
      if (pageErrors.length > 0 && this.config.screenshotOnError) {
        const screenshotPath = await this.captureScreenshot(`error-${menuItem.value}`);
        if (screenshotPath) {
          screenshots.push(screenshotPath);
          this.monitor.setScreenshotForCurrentPage(screenshotPath);
        }
      }

      // Wait between actions
      await this.wait(this.config.waitBetweenActions);
    }

    // Collect results
    const errors = this.monitor.getErrors();
    const warnings = this.monitor.getWarnings();
    
    // Mark new errors
    this.reporter.markNewErrors(errors);

    // Calculate errors by category
    const errorsByCategory: Record<ErrorCategory, number> = {
      [ErrorCategory.API_ERROR]: 0,
      [ErrorCategory.JS_ERROR]: 0,
      [ErrorCategory.NETWORK_ERROR]: 0,
      [ErrorCategory.CORS_ERROR]: 0,
      [ErrorCategory.AUTH_ERROR]: 0,
      [ErrorCategory.WARNING]: 0,
      [ErrorCategory.UNKNOWN]: 0,
    };

    for (const error of errors) {
      errorsByCategory[error.category]++;
    }

    // Get previous iteration for comparison
    const previousIteration = this.iterations.length > 0 
      ? this.iterations[this.iterations.length - 1] 
      : undefined;

    const comparison = this.reporter.compareIterations(
      { errors, totalErrors: errors.length } as TestIterationResult,
      previousIteration
    );

    const result: TestIterationResult = {
      iteration: iterationNumber,
      timestamp: new Date(),
      duration: Date.now() - startTime,
      menusTestedCount: menuItems.length,
      totalErrors: errors.length,
      totalWarnings: warnings.length,
      errorsByCategory,
      errorsByPage: this.monitor.getErrorsByPage(),
      errors,
      warnings,
      newErrors: comparison.newErrors,
      fixedErrors: comparison.fixedErrors,
      screenshots,
    };

    // Update previous errors for next comparison
    this.reporter.updatePreviousErrors(errors);

    // Store iteration
    this.iterations.push(result);

    // Generate and save report
    const report = this.reporter.generateReport(result);
    const reportPath = this.reporter.saveReport(report, `report-iteration-${iterationNumber}.md`);
    
    this.log(`\n========== Iteration ${iterationNumber} Complete ==========`);
    this.log(`Total Errors: ${result.totalErrors}`);
    this.log(`Total Warnings: ${result.totalWarnings}`);
    this.log(`New Errors: ${result.newErrors.length}`);
    this.log(`Fixed Errors: ${result.fixedErrors.length}`);
    this.log(`Report saved: ${reportPath}`);

    if (result.totalErrors === 0) {
      this.log('\n✅ ALL TESTS PASSED - NO ERRORS DETECTED');
    }

    return result;
  }

  /**
   * Run iterations until no errors or max iterations reached
   */
  async runUntilClean(maxIterations = 10): Promise<TestIterationResult[]> {
    for (let i = 0; i < maxIterations; i++) {
      const result = await this.runIteration();
      
      if (result.totalErrors === 0) {
        this.log(`\n🎉 Clean run achieved after ${i + 1} iteration(s)!`);
        break;
      }

      if (i < maxIterations - 1) {
        this.log(`\n⚠️ ${result.totalErrors} errors found. Fix them and run again.`);
        // In automated mode, we'd wait for fixes here
        // For now, we just continue to the next iteration
      }
    }

    // Generate final summary
    const summary = this.reporter.getProgressSummary(this.iterations);
    this.log('\n========== Final Summary ==========');
    this.log(`Total Iterations: ${summary.totalIterations}`);
    this.log(`Initial Errors: ${summary.initialErrorCount}`);
    this.log(`Final Errors: ${summary.currentErrorCount}`);
    this.log(`Fixed: ${summary.fixedCount}`);
    this.log(`Progress: ${summary.progressPercentage}%`);
    this.log(`Status: ${summary.isClean ? '✅ CLEAN' : '⚠️ ERRORS REMAIN'}`);

    return this.iterations;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.log('Cleaning up...');
    this.monitor.stop();
    
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    
    this.page = null;
    this.context = null;
    this.browser = null;
    this.navigator = null;
    
    this.log('Cleanup complete');
  }

  /**
   * Capture screenshot
   */
  private async captureScreenshot(name: string): Promise<string | null> {
    if (!this.page) return null;

    try {
      const filename = `screenshot-${++this.screenshotCounter}-${name}.png`;
      const filepath = path.join(this.config.outputDir, filename);
      
      // Ensure directory exists
      if (!fs.existsSync(this.config.outputDir)) {
        fs.mkdirSync(this.config.outputDir, { recursive: true });
      }

      await this.page.screenshot({ path: filepath, fullPage: true });
      return filepath;
    } catch {
      return null;
    }
  }

  /**
   * Wait helper
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log helper
   */
  private log(message: string): void {
    if (this.config.verbose || !this.config.browser.headless) {
      console.log(`[E2E] ${message}`);
    }
  }

  /**
   * Get all iterations
   */
  getIterations(): TestIterationResult[] {
    return this.iterations;
  }

  /**
   * Get current error count
   */
  getCurrentErrorCount(): number {
    return this.monitor.getErrorCount();
  }
}
