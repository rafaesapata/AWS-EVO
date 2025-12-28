/**
 * Error Reporter
 * Generates markdown reports and tracks progress across test iterations
 */

import * as fs from 'fs';
import * as path from 'path';
import { CapturedError, ErrorCategory } from './console-monitor';

export interface TestIterationResult {
  iteration: number;
  timestamp: Date;
  duration: number;
  menusTestedCount: number;
  totalErrors: number;
  totalWarnings: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsByPage: Record<string, CapturedError[]>;
  errors: CapturedError[];
  warnings: CapturedError[];
  newErrors: CapturedError[];
  fixedErrors: CapturedError[];
  screenshots: string[];
}

export interface ComparisonResult {
  newErrors: CapturedError[];
  fixedErrors: CapturedError[];
  persistentErrors: CapturedError[];
  progressPercentage: number;
}

export interface ProgressSummary {
  totalIterations: number;
  initialErrorCount: number;
  currentErrorCount: number;
  fixedCount: number;
  progressPercentage: number;
  isClean: boolean;
}

export class ErrorReporter {
  private previousErrors: Map<string, CapturedError> = new Map();
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    this.ensureOutputDir();
  }

  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Generate a unique key for an error (for comparison)
   */
  private getErrorKey(error: CapturedError): string {
    return `${error.category}:${error.menuItem}:${error.message.substring(0, 100)}`;
  }

  /**
   * Compare current iteration with previous
   */
  compareIterations(current: TestIterationResult, previous?: TestIterationResult): ComparisonResult {
    const currentErrorKeys = new Set(current.errors.map(e => this.getErrorKey(e)));
    const previousErrorKeys = new Set(previous?.errors.map(e => this.getErrorKey(e)) || []);

    const newErrors = current.errors.filter(e => !previousErrorKeys.has(this.getErrorKey(e)));
    const fixedErrors = previous?.errors.filter(e => !currentErrorKeys.has(this.getErrorKey(e))) || [];
    const persistentErrors = current.errors.filter(e => previousErrorKeys.has(this.getErrorKey(e)));

    const previousCount = previous?.totalErrors || current.totalErrors;
    const progressPercentage = previousCount > 0 
      ? Math.round(((previousCount - current.totalErrors) / previousCount) * 100)
      : 100;

    return {
      newErrors,
      fixedErrors,
      persistentErrors,
      progressPercentage,
    };
  }

  /**
   * Generate markdown report
   */
  generateReport(result: TestIterationResult): string {
    const lines: string[] = [];
    
    // Header
    lines.push(`# E2E Test Report - Iteration ${result.iteration}`);
    lines.push('');
    lines.push(`**Date:** ${result.timestamp.toISOString()}`);
    lines.push(`**Duration:** ${Math.round(result.duration / 1000)}s`);
    lines.push(`**Menus Tested:** ${result.menusTestedCount}`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push(`| Metric | Count |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total Errors | ${result.totalErrors} |`);
    lines.push(`| Total Warnings | ${result.totalWarnings} |`);
    lines.push(`| New Errors | ${result.newErrors.length} |`);
    lines.push(`| Fixed Errors | ${result.fixedErrors.length} |`);
    lines.push('');

    // Errors by Category
    lines.push('## Errors by Category');
    lines.push('');
    lines.push(`| Category | Count |`);
    lines.push(`|----------|-------|`);
    for (const [category, count] of Object.entries(result.errorsByCategory)) {
      if (count > 0) {
        lines.push(`| ${category} | ${count} |`);
      }
    }
    lines.push('');

    // Errors by Page
    if (Object.keys(result.errorsByPage).length > 0) {
      lines.push('## Errors by Page/Menu');
      lines.push('');
      
      for (const [page, errors] of Object.entries(result.errorsByPage)) {
        lines.push(`### ${page}`);
        lines.push('');
        lines.push(`**Error Count:** ${errors.length}`);
        lines.push('');
        
        for (const error of errors) {
          const newBadge = error.isNew ? ' 🆕' : '';
          lines.push(`#### ${error.category}${newBadge}`);
          lines.push('');
          lines.push(`- **Time:** ${error.timestamp.toISOString()}`);
          lines.push(`- **URL:** ${error.pageUrl}`);
          lines.push(`- **Message:** \`${error.message.substring(0, 200)}${error.message.length > 200 ? '...' : ''}\``);
          if (error.requestUrl) {
            lines.push(`- **Request URL:** ${error.requestUrl}`);
          }
          if (error.statusCode) {
            lines.push(`- **Status Code:** ${error.statusCode}`);
          }
          if (error.screenshotPath) {
            lines.push(`- **Screenshot:** [View](${error.screenshotPath})`);
          }
          lines.push('');
        }
      }
    }

    // New Errors Section
    if (result.newErrors.length > 0) {
      lines.push('## 🆕 New Errors (This Iteration)');
      lines.push('');
      for (const error of result.newErrors) {
        lines.push(`- **[${error.category}]** ${error.menuItem}: ${error.message.substring(0, 100)}`);
      }
      lines.push('');
    }

    // Fixed Errors Section
    if (result.fixedErrors.length > 0) {
      lines.push('## ✅ Fixed Errors (Since Last Iteration)');
      lines.push('');
      for (const error of result.fixedErrors) {
        lines.push(`- **[${error.category}]** ${error.menuItem}: ${error.message.substring(0, 100)}`);
      }
      lines.push('');
    }

    // Screenshots
    if (result.screenshots.length > 0) {
      lines.push('## Screenshots');
      lines.push('');
      for (const screenshot of result.screenshots) {
        lines.push(`- [${path.basename(screenshot)}](${screenshot})`);
      }
      lines.push('');
    }

    // Status
    lines.push('## Status');
    lines.push('');
    if (result.totalErrors === 0) {
      lines.push('✅ **ALL TESTS PASSED - NO ERRORS DETECTED**');
    } else {
      lines.push(`⚠️ **${result.totalErrors} errors need to be fixed**`);
    }
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Save report to file
   */
  saveReport(report: string, filename: string): string {
    const filepath = path.join(this.outputDir, filename);
    fs.writeFileSync(filepath, report, 'utf-8');
    return filepath;
  }

  /**
   * Get progress summary across all iterations
   */
  getProgressSummary(iterations: TestIterationResult[]): ProgressSummary {
    if (iterations.length === 0) {
      return {
        totalIterations: 0,
        initialErrorCount: 0,
        currentErrorCount: 0,
        fixedCount: 0,
        progressPercentage: 100,
        isClean: true,
      };
    }

    const first = iterations[0];
    const last = iterations[iterations.length - 1];
    const fixedCount = first.totalErrors - last.totalErrors;
    const progressPercentage = first.totalErrors > 0
      ? Math.round((fixedCount / first.totalErrors) * 100)
      : 100;

    return {
      totalIterations: iterations.length,
      initialErrorCount: first.totalErrors,
      currentErrorCount: last.totalErrors,
      fixedCount: Math.max(0, fixedCount),
      progressPercentage,
      isClean: last.totalErrors === 0,
    };
  }

  /**
   * Update previous errors for next comparison
   */
  updatePreviousErrors(errors: CapturedError[]): void {
    this.previousErrors.clear();
    for (const error of errors) {
      this.previousErrors.set(this.getErrorKey(error), error);
    }
  }

  /**
   * Mark errors as new or existing
   */
  markNewErrors(errors: CapturedError[]): void {
    for (const error of errors) {
      error.isNew = !this.previousErrors.has(this.getErrorKey(error));
    }
  }
}
