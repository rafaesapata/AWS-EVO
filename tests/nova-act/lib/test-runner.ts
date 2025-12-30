/**
 * Test Runner - Executor de testes Nova Act
 * Orquestra execução de testes E2E com relatórios detalhados
 */

import { NovaActClient, createNovaActClient, type ActResult } from './nova-client';
import { config, URLS } from '../config/nova-act.config';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

// Tipos para casos de teste
export interface TestStep {
  name: string;
  action: string;
  expectedResult?: string;
  schema?: z.ZodSchema;
  timeout?: number;
  optional?: boolean;
}

export interface TestCase {
  id: string;
  name: string;
  description: string;
  category: 'auth' | 'dashboard' | 'security' | 'cost' | 'aws' | 'e2e';
  priority: 'critical' | 'high' | 'medium' | 'low';
  steps: TestStep[];
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  tags?: string[];
}

export interface TestResult {
  testCase: TestCase;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  stepResults: StepResult[];
  error?: string;
  screenshots: string[];
}

export interface StepResult {
  step: TestStep;
  status: 'passed' | 'failed' | 'skipped';
  actResult?: ActResult;
  duration: number;
  error?: string;
}

export interface TestSuiteResult {
  name: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  results: TestResult[];
}

/**
 * Executor de testes Nova Act
 */
export class NovaActTestRunner {
  private client: NovaActClient | null = null;
  private results: TestResult[] = [];
  private currentTest: TestCase | null = null;

  constructor(
    private options: {
      headless?: boolean;
      parallel?: boolean;
      maxParallel?: number;
      stopOnFailure?: boolean;
      screenshotOnFailure?: boolean;
      screenshotOnSuccess?: boolean;
      reportDir?: string;
    } = {}
  ) {}

  /**
   * Executar um único caso de teste
   */
  async runTest(testCase: TestCase): Promise<TestResult> {
    this.currentTest = testCase;
    const startTime = Date.now();
    const stepResults: StepResult[] = [];
    const screenshots: string[] = [];
    let testStatus: 'passed' | 'failed' | 'skipped' = 'passed';
    let testError: string | undefined;

    console.log(`\n📋 Executando: ${testCase.name}`);
    console.log(`   Categoria: ${testCase.category} | Prioridade: ${testCase.priority}`);

    try {
      // Setup
      if (testCase.setup) {
        await testCase.setup();
      }

      // Iniciar cliente Nova Act
      this.client = createNovaActClient(URLS.auth, {
        headless: this.options.headless ?? config.novaAct.headless,
        logsDirectory: path.join(
          this.options.reportDir || './reports',
          'traces',
          testCase.id
        ),
      });
      await this.client.start();

      // Executar cada step
      for (const step of testCase.steps) {
        const stepResult = await this.runStep(step);
        stepResults.push(stepResult);

        if (stepResult.status === 'failed') {
          testStatus = 'failed';
          testError = stepResult.error;

          // Screenshot on failure
          if (this.options.screenshotOnFailure) {
            const screenshotPath = await this.captureScreenshot(`failure-${step.name}`);
            if (screenshotPath) screenshots.push(screenshotPath);
          }

          if (this.options.stopOnFailure && !step.optional) {
            break;
          }
        } else if (this.options.screenshotOnSuccess) {
          const screenshotPath = await this.captureScreenshot(`success-${step.name}`);
          if (screenshotPath) screenshots.push(screenshotPath);
        }
      }

    } catch (error) {
      testStatus = 'failed';
      testError = error instanceof Error ? error.message : String(error);
    } finally {
      // Teardown
      if (testCase.teardown) {
        try {
          await testCase.teardown();
        } catch (e) {
          console.error('Teardown error:', e);
        }
      }

      // Encerrar cliente
      if (this.client) {
        await this.client.stop();
        this.client = null;
      }
    }

    const result: TestResult = {
      testCase,
      status: testStatus,
      duration: Date.now() - startTime,
      stepResults,
      error: testError,
      screenshots,
    };

    this.results.push(result);
    this.logTestResult(result);

    return result;
  }

  /**
   * Executar um step individual
   */
  private async runStep(step: TestStep): Promise<StepResult> {
    const startTime = Date.now();
    console.log(`   ▶️  ${step.name}`);

    try {
      if (!this.client) {
        throw new Error('Nova Act client not initialized');
      }

      let actResult: ActResult;

      if (step.schema) {
        const result = await this.client.actGet(step.action, step.schema);
        actResult = result;
      } else {
        actResult = await this.client.act(step.action);
      }

      // Verificar resultado esperado
      if (step.expectedResult && actResult.response) {
        const hasExpected = actResult.response
          .toLowerCase()
          .includes(step.expectedResult.toLowerCase());
        
        if (!hasExpected) {
          return {
            step,
            status: 'failed',
            actResult,
            duration: Date.now() - startTime,
            error: `Expected "${step.expectedResult}" not found in response`,
          };
        }
      }

      if (!actResult.success) {
        return {
          step,
          status: step.optional ? 'skipped' : 'failed',
          actResult,
          duration: Date.now() - startTime,
          error: actResult.error,
        };
      }

      console.log(`      ✅ Concluído (${actResult.metadata.numSteps} steps)`);

      return {
        step,
        status: 'passed',
        actResult,
        duration: Date.now() - startTime,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`      ❌ Falhou: ${errorMsg}`);

      return {
        step,
        status: step.optional ? 'skipped' : 'failed',
        duration: Date.now() - startTime,
        error: errorMsg,
      };
    }
  }

  /**
   * Executar múltiplos testes
   */
  async runTests(testCases: TestCase[]): Promise<TestSuiteResult> {
    const startTime = new Date();
    this.results = [];

    console.log(`\n🚀 Iniciando suite com ${testCases.length} testes\n`);
    console.log('='.repeat(60));

    for (const testCase of testCases) {
      await this.runTest(testCase);
    }

    const endTime = new Date();
    const passed = this.results.filter(r => r.status === 'passed').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    const skipped = this.results.filter(r => r.status === 'skipped').length;

    const suiteResult: TestSuiteResult = {
      name: 'Nova Act E2E Tests',
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      totalTests: testCases.length,
      passed,
      failed,
      skipped,
      results: this.results,
    };

    this.logSuiteResult(suiteResult);

    return suiteResult;
  }

  /**
   * Executar testes por categoria
   */
  async runByCategory(
    testCases: TestCase[],
    category: TestCase['category']
  ): Promise<TestSuiteResult> {
    const filtered = testCases.filter(tc => tc.category === category);
    return this.runTests(filtered);
  }

  /**
   * Executar testes por prioridade
   */
  async runByPriority(
    testCases: TestCase[],
    priority: TestCase['priority']
  ): Promise<TestSuiteResult> {
    const filtered = testCases.filter(tc => tc.priority === priority);
    return this.runTests(filtered);
  }

  /**
   * Executar testes por tags
   */
  async runByTags(
    testCases: TestCase[],
    tags: string[]
  ): Promise<TestSuiteResult> {
    const filtered = testCases.filter(tc => 
      tc.tags?.some(tag => tags.includes(tag))
    );
    return this.runTests(filtered);
  }

  /**
   * Capturar screenshot
   */
  private async captureScreenshot(name: string): Promise<string | null> {
    if (!this.client) return null;

    try {
      return await this.client.screenshot(`${name}-${Date.now()}.png`);
    } catch {
      return null;
    }
  }

  /**
   * Log resultado do teste
   */
  private logTestResult(result: TestResult): void {
    const icon = result.status === 'passed' ? '✅' : 
                 result.status === 'failed' ? '❌' : '⏭️';
    const duration = (result.duration / 1000).toFixed(2);
    
    console.log(`\n${icon} ${result.testCase.name} (${duration}s)`);
    
    if (result.error) {
      console.log(`   Erro: ${result.error}`);
    }
  }

  /**
   * Log resultado da suite
   */
  private logSuiteResult(result: TestSuiteResult): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESULTADO DA SUITE');
    console.log('='.repeat(60));
    console.log(`Total: ${result.totalTests}`);
    console.log(`✅ Passou: ${result.passed}`);
    console.log(`❌ Falhou: ${result.failed}`);
    console.log(`⏭️  Pulou: ${result.skipped}`);
    console.log(`⏱️  Duração: ${(result.duration / 1000).toFixed(2)}s`);
    console.log('='.repeat(60) + '\n');
  }

  /**
   * Obter resultados
   */
  getResults(): TestResult[] {
    return this.results;
  }
}

/**
 * Factory para criar test runner
 */
export function createTestRunner(options?: {
  headless?: boolean;
  parallel?: boolean;
  maxParallel?: number;
  stopOnFailure?: boolean;
  screenshotOnFailure?: boolean;
  screenshotOnSuccess?: boolean;
  reportDir?: string;
}): NovaActTestRunner {
  return new NovaActTestRunner(options);
}

export default NovaActTestRunner;
