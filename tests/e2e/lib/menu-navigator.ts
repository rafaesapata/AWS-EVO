/**
 * Menu Navigator
 * Handles navigation through all sidebar menu items
 */

import type { Page } from '@playwright/test';
import { MenuItem, MENU_ITEMS, getAllMenuItems } from '../config/menu-items';
import { CapturedError } from './console-monitor';

export interface NavigationResult {
  menuItem: string;
  route: string;
  success: boolean;
  loadTime: number;
  errors: CapturedError[];
  warnings: CapturedError[];
  hasDataTable: boolean;
  hasForms: boolean;
  hasActionButtons: boolean;
  errorMessage?: string;
}

export interface FunctionalityResult {
  tablesFound: number;
  tablesWithData: number;
  formsFound: number;
  formsInteractive: number;
  buttonsFound: number;
  buttonsClickable: number;
}

export class MenuNavigator {
  private page: Page;
  private timeout: number;
  private waitBetweenActions: number;

  constructor(page: Page, timeout = 10000, waitBetweenActions = 1000) {
    this.page = page;
    this.timeout = timeout;
    this.waitBetweenActions = waitBetweenActions;
  }

  /**
   * Get all menu items
   */
  getMenuItems(includeSuperAdmin = false): MenuItem[] {
    return getAllMenuItems(includeSuperAdmin);
  }

  /**
   * Navigate to a menu item by clicking in the sidebar
   */
  async navigateTo(menuItem: MenuItem): Promise<NavigationResult> {
    const startTime = Date.now();
    const result: NavigationResult = {
      menuItem: menuItem.name,
      route: menuItem.route,
      success: false,
      loadTime: 0,
      errors: [],
      warnings: [],
      hasDataTable: false,
      hasForms: false,
      hasActionButtons: false,
    };

    try {
      // Find and click the menu item in sidebar
      const menuButton = this.page.locator(`[data-sidebar="menu-button"]`).filter({ hasText: menuItem.name }).first();
      
      // Check if menu exists
      const exists = await menuButton.count() > 0;
      if (!exists) {
        // Try alternative selector - look for any button/link with the menu name
        const altButton = this.page.getByRole('button', { name: menuItem.name }).or(
          this.page.getByRole('link', { name: menuItem.name })
        ).first();
        
        if (await altButton.count() > 0) {
          await altButton.click();
        } else {
          // Navigate directly via URL as fallback
          await this.page.goto(menuItem.route.startsWith('/') 
            ? `${this.page.url().split('/app')[0]}${menuItem.route}`
            : menuItem.route
          );
        }
      } else {
        await menuButton.click();
      }

      // Wait for navigation/page load
      await this.page.waitForLoadState('networkidle', { timeout: this.timeout });
      await this.wait(this.waitBetweenActions);

      // Check page elements
      result.hasDataTable = await this.hasDataTable();
      result.hasForms = await this.hasForms();
      result.hasActionButtons = await this.hasActionButtons();
      
      result.success = true;
      result.loadTime = Date.now() - startTime;

    } catch (error) {
      result.success = false;
      result.loadTime = Date.now() - startTime;
      result.errorMessage = error instanceof Error ? error.message : 'Navigation failed';
    }

    return result;
  }

  /**
   * Navigate directly to a route
   */
  async navigateToRoute(route: string, menuName: string): Promise<NavigationResult> {
    const startTime = Date.now();
    const result: NavigationResult = {
      menuItem: menuName,
      route: route,
      success: false,
      loadTime: 0,
      errors: [],
      warnings: [],
      hasDataTable: false,
      hasForms: false,
      hasActionButtons: false,
    };

    try {
      const baseUrl = this.page.url().split('/app')[0].split('/login')[0];
      const fullUrl = route.startsWith('http') ? route : `${baseUrl}${route}`;
      
      await this.page.goto(fullUrl);
      await this.page.waitForLoadState('domcontentloaded', { timeout: this.timeout });
      
      // Wait for network to settle
      await this.page.waitForLoadState('networkidle', { timeout: this.timeout }).catch(() => {
        // Network might not settle if there are polling requests
      });
      
      // Additional wait for React/dynamic content
      await this.wait(this.waitBetweenActions);

      result.hasDataTable = await this.hasDataTable();
      result.hasForms = await this.hasForms();
      result.hasActionButtons = await this.hasActionButtons();
      
      result.success = true;
      result.loadTime = Date.now() - startTime;

    } catch (error) {
      result.success = false;
      result.loadTime = Date.now() - startTime;
      result.errorMessage = error instanceof Error ? error.message : 'Navigation failed';
    }

    return result;
  }

  /**
   * Expand a sub-menu
   */
  async expandSubMenu(menuItem: MenuItem): Promise<boolean> {
    try {
      const menuButton = this.page.locator(`[data-sidebar="menu-button"]`).filter({ hasText: menuItem.name }).first();
      
      if (await menuButton.count() > 0) {
        await menuButton.click();
        await this.wait(500);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Test page functionality
   */
  async testPageFunctionality(): Promise<FunctionalityResult> {
    const result: FunctionalityResult = {
      tablesFound: 0,
      tablesWithData: 0,
      formsFound: 0,
      formsInteractive: 0,
      buttonsFound: 0,
      buttonsClickable: 0,
    };

    try {
      // Wait for content to render
      await this.wait(1500);

      // Check tables - include div-based tables and data grids
      const tables = this.page.locator('table, [role="grid"], [role="table"], .data-table, [class*="table"]');
      result.tablesFound = await tables.count();
      
      // Check for data rows
      const dataRows = this.page.locator('table tbody tr, [role="row"], .table-row, tr[data-state]');
      if (await dataRows.count() > 0) {
        result.tablesWithData = Math.min(await dataRows.count(), result.tablesFound || 1);
      }

      // Check forms and inputs - more comprehensive selectors
      const inputs = this.page.locator('input:visible, textarea:visible, select:visible, [contenteditable="true"]');
      result.formsFound = await inputs.count();
      
      for (let i = 0; i < Math.min(result.formsFound, 10); i++) {
        try {
          const input = inputs.nth(i);
          if (await input.isEnabled({ timeout: 1000 })) {
            result.formsInteractive++;
          }
        } catch {
          // Skip if element becomes stale
        }
      }

      // Check buttons - include all clickable elements
      const buttons = this.page.locator('button:visible, [role="button"]:visible, a.btn:visible, .button:visible');
      result.buttonsFound = await buttons.count();
      
      for (let i = 0; i < Math.min(result.buttonsFound, 15); i++) {
        try {
          const button = buttons.nth(i);
          if (await button.isEnabled({ timeout: 1000 })) {
            result.buttonsClickable++;
          }
        } catch {
          // Skip if element becomes stale
        }
      }

      // Also check for cards, charts, and other UI elements
      const cards = await this.page.locator('[class*="card"], [class*="Card"]').count();
      const charts = await this.page.locator('[class*="chart"], [class*="Chart"], canvas, svg[class*="recharts"]').count();
      
      // Log additional info
      if (cards > 0 || charts > 0) {
        console.log(`    [Additional] Cards: ${cards}, Charts: ${charts}`);
      }

    } catch (e) {
      console.log(`    [Warning] Error testing functionality: ${e}`);
    }

    return result;
  }

  /**
   * Check if page has data tables
   */
  private async hasDataTable(): Promise<boolean> {
    try {
      const tables = this.page.locator('table');
      return await tables.count() > 0;
    } catch {
      return false;
    }
  }

  /**
   * Check if page has forms
   */
  private async hasForms(): Promise<boolean> {
    try {
      const forms = this.page.locator('form');
      const inputs = this.page.locator('input:not([type="hidden"])');
      return await forms.count() > 0 || await inputs.count() > 0;
    } catch {
      return false;
    }
  }

  /**
   * Check if page has action buttons
   */
  private async hasActionButtons(): Promise<boolean> {
    try {
      const buttons = this.page.locator('button:visible');
      return await buttons.count() > 0;
    } catch {
      return false;
    }
  }

  /**
   * Wait helper
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
