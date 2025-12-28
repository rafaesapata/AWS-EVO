#!/usr/bin/env npx ts-node
/**
 * E2E Test Runner CLI
 * Run browser-based end-to-end tests for EVO UDS platform
 * 
 * Usage:
 *   npx ts-node tests/e2e/run-e2e-tests.ts [options]
 * 
 * Options:
 *   --headed        Run in headed mode (visible browser)
 *   --verbose       Enable verbose logging
 *   --menus=x,y,z   Test only specific menus
 *   --iterations=N  Max iterations to run (default: 1)
 */

import { E2ETestRunner } from './lib/e2e-test-runner';
import { TestConfig } from './config/test-config';

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const headed = args.includes('--headed');
  const verbose = args.includes('--verbose') || headed;
  const iterationsArg = args.find(a => a.startsWith('--iterations='));
  const maxIterations = iterationsArg ? parseInt(iterationsArg.split('=')[1]) : 1;
  const menusArg = args.find(a => a.startsWith('--menus='));
  const menus = menusArg ? menusArg.split('=')[1].split(',') : undefined;

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           EVO UDS - E2E Browser Testing Suite              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Mode: ${headed ? 'Headed (visible browser)' : 'Headless'}`);
  console.log(`Verbose: ${verbose}`);
  console.log(`Max Iterations: ${maxIterations}`);
  if (menus) {
    console.log(`Testing menus: ${menus.join(', ')}`);
  }
  console.log('');

  const config: Partial<TestConfig> = {
    browser: {
      headless: !headed,
      timeout: 30000,
      actionTimeout: 10000,
    },
    verbose,
    menus,
  };

  const runner = new E2ETestRunner(config);

  try {
    // Initialize
    await runner.initialize();

    // Authenticate
    const authenticated = await runner.authenticate();
    if (!authenticated) {
      console.error('❌ Authentication failed. Exiting.');
      process.exit(1);
    }

    // Run tests
    if (maxIterations > 1) {
      await runner.runUntilClean(maxIterations);
    } else {
      await runner.runIteration();
    }

    // Get final results
    const iterations = runner.getIterations();
    const lastIteration = iterations[iterations.length - 1];

    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                      Test Results                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`Iterations Run: ${iterations.length}`);
    console.log(`Final Error Count: ${lastIteration.totalErrors}`);
    console.log(`Final Warning Count: ${lastIteration.totalWarnings}`);
    console.log('');

    if (lastIteration.totalErrors > 0) {
      console.log('Errors by Category:');
      for (const [category, count] of Object.entries(lastIteration.errorsByCategory)) {
        if (count > 0) {
          console.log(`  ${category}: ${count}`);
        }
      }
      console.log('');
      console.log('Errors by Page:');
      for (const [page, errors] of Object.entries(lastIteration.errorsByPage)) {
        console.log(`  ${page}: ${errors.length} error(s)`);
      }
    }

    console.log('');
    console.log(`Reports saved to: test-results/e2e/`);

    // Exit with appropriate code
    process.exit(lastIteration.totalErrors > 0 ? 1 : 0);

  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  } finally {
    await runner.cleanup();
  }
}

main().catch(console.error);
