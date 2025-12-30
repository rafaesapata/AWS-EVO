/**
 * Report Generator - Gerador de relatórios HTML para testes Nova Act
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { TestSuiteResult, TestResult, StepResult } from './test-runner';

/**
 * Gerar relatório HTML
 */
export async function generateHtmlReport(
  suiteResult: TestSuiteResult,
  outputPath: string
): Promise<string> {
  const html = buildHtmlReport(suiteResult);
  
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, html);
  
  console.log(`📄 Relatório gerado: ${outputPath}`);
  return outputPath;
}

/**
 * Construir HTML do relatório
 */
function buildHtmlReport(result: TestSuiteResult): string {
  const passRate = ((result.passed / result.totalTests) * 100).toFixed(1);
  const duration = (result.duration / 1000).toFixed(2);
  
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nova Act Test Report - ${result.name}</title>
  <style>
    :root {
      --color-pass: #10b981;
      --color-fail: #ef4444;
      --color-skip: #f59e0b;
      --color-bg: #0f172a;
      --color-card: #1e293b;
      --color-text: #e2e8f0;
      --color-muted: #94a3b8;
      --color-border: #334155;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.6;
      padding: 2rem;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    header {
      text-align: center;
      margin-bottom: 2rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--color-border);
    }
    
    h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }
    
    .subtitle {
      color: var(--color-muted);
    }
    
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    
    .stat-card {
      background: var(--color-card);
      border-radius: 12px;
      padding: 1.5rem;
      text-align: center;
    }
    
    .stat-value {
      font-size: 2.5rem;
      font-weight: bold;
    }
    
    .stat-label {
      color: var(--color-muted);
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .stat-pass .stat-value { color: var(--color-pass); }
    .stat-fail .stat-value { color: var(--color-fail); }
    .stat-skip .stat-value { color: var(--color-skip); }
    
    .progress-bar {
      height: 8px;
      background: var(--color-border);
      border-radius: 4px;
      overflow: hidden;
      margin: 1rem 0;
    }
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--color-pass), #34d399);
      transition: width 0.3s ease;
    }
    
    .test-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    
    .test-card {
      background: var(--color-card);
      border-radius: 12px;
      overflow: hidden;
    }
    
    .test-header {
      padding: 1rem 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      border-bottom: 1px solid var(--color-border);
    }
    
    .test-header:hover {
      background: rgba(255,255,255,0.05);
    }
    
    .test-name {
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    
    .test-meta {
      display: flex;
      gap: 1rem;
      color: var(--color-muted);
      font-size: 0.875rem;
    }
    
    .badge {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    
    .badge-pass { background: rgba(16, 185, 129, 0.2); color: var(--color-pass); }
    .badge-fail { background: rgba(239, 68, 68, 0.2); color: var(--color-fail); }
    .badge-skip { background: rgba(245, 158, 11, 0.2); color: var(--color-skip); }
    
    .badge-critical { background: rgba(239, 68, 68, 0.2); color: var(--color-fail); }
    .badge-high { background: rgba(249, 115, 22, 0.2); color: #f97316; }
    .badge-medium { background: rgba(245, 158, 11, 0.2); color: var(--color-skip); }
    .badge-low { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
    
    .test-details {
      padding: 1.5rem;
      display: none;
    }
    
    .test-card.expanded .test-details {
      display: block;
    }
    
    .step-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    
    .step-item {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.75rem;
      background: rgba(0,0,0,0.2);
      border-radius: 8px;
    }
    
    .step-icon {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      flex-shrink: 0;
    }
    
    .step-pass .step-icon { background: var(--color-pass); }
    .step-fail .step-icon { background: var(--color-fail); }
    .step-skip .step-icon { background: var(--color-skip); }
    
    .step-content {
      flex: 1;
    }
    
    .step-name {
      font-weight: 500;
    }
    
    .step-action {
      color: var(--color-muted);
      font-size: 0.875rem;
      margin-top: 0.25rem;
    }
    
    .step-error {
      color: var(--color-fail);
      font-size: 0.875rem;
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: rgba(239, 68, 68, 0.1);
      border-radius: 4px;
    }
    
    .step-duration {
      color: var(--color-muted);
      font-size: 0.75rem;
    }
    
    footer {
      text-align: center;
      margin-top: 2rem;
      padding-top: 2rem;
      border-top: 1px solid var(--color-border);
      color: var(--color-muted);
    }
    
    @media (max-width: 768px) {
      body { padding: 1rem; }
      .summary { grid-template-columns: repeat(2, 1fr); }
      .test-header { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🤖 Nova Act Test Report</h1>
      <p class="subtitle">${result.name}</p>
      <p class="subtitle">
        ${format(result.startTime, "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
      </p>
    </header>
    
    <section class="summary">
      <div class="stat-card">
        <div class="stat-value">${result.totalTests}</div>
        <div class="stat-label">Total de Testes</div>
      </div>
      <div class="stat-card stat-pass">
        <div class="stat-value">${result.passed}</div>
        <div class="stat-label">Passou</div>
      </div>
      <div class="stat-card stat-fail">
        <div class="stat-value">${result.failed}</div>
        <div class="stat-label">Falhou</div>
      </div>
      <div class="stat-card stat-skip">
        <div class="stat-value">${result.skipped}</div>
        <div class="stat-label">Pulou</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${duration}s</div>
        <div class="stat-label">Duração</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${passRate}%</div>
        <div class="stat-label">Taxa de Sucesso</div>
      </div>
    </section>
    
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${passRate}%"></div>
    </div>
    
    <section class="test-list">
      ${result.results.map(test => buildTestCard(test)).join('')}
    </section>
    
    <footer>
      <p>Gerado por Amazon Nova Act Test Framework</p>
      <p>EVO UDS Platform - ${new Date().getFullYear()}</p>
    </footer>
  </div>
  
  <script>
    document.querySelectorAll('.test-header').forEach(header => {
      header.addEventListener('click', () => {
        header.parentElement.classList.toggle('expanded');
      });
    });
  </script>
</body>
</html>
`;
}

/**
 * Construir card de teste
 */
function buildTestCard(test: TestResult): string {
  const statusIcon = test.status === 'passed' ? '✅' : 
                     test.status === 'failed' ? '❌' : '⏭️';
  const statusClass = `badge-${test.status === 'passed' ? 'pass' : test.status === 'failed' ? 'fail' : 'skip'}`;
  const priorityClass = `badge-${test.testCase.priority}`;
  const duration = (test.duration / 1000).toFixed(2);
  
  return `
    <div class="test-card">
      <div class="test-header">
        <div class="test-name">
          <span>${statusIcon}</span>
          <span>${test.testCase.name}</span>
          <span class="badge ${statusClass}">${test.status}</span>
          <span class="badge ${priorityClass}">${test.testCase.priority}</span>
        </div>
        <div class="test-meta">
          <span>${test.testCase.category}</span>
          <span>${duration}s</span>
          <span>${test.stepResults.length} steps</span>
        </div>
      </div>
      <div class="test-details">
        <p style="margin-bottom: 1rem; color: var(--color-muted);">
          ${test.testCase.description}
        </p>
        ${test.error ? `<div class="step-error" style="margin-bottom: 1rem;">${test.error}</div>` : ''}
        <div class="step-list">
          ${test.stepResults.map(step => buildStepItem(step)).join('')}
        </div>
      </div>
    </div>
  `;
}

/**
 * Construir item de step
 */
function buildStepItem(step: StepResult): string {
  const statusClass = `step-${step.status === 'passed' ? 'pass' : step.status === 'failed' ? 'fail' : 'skip'}`;
  const icon = step.status === 'passed' ? '✓' : step.status === 'failed' ? '✗' : '○';
  const duration = (step.duration / 1000).toFixed(2);
  
  return `
    <div class="step-item ${statusClass}">
      <div class="step-icon">${icon}</div>
      <div class="step-content">
        <div class="step-name">${step.step.name}</div>
        <div class="step-action">${step.step.action}</div>
        ${step.error ? `<div class="step-error">${step.error}</div>` : ''}
      </div>
      <div class="step-duration">${duration}s</div>
    </div>
  `;
}

/**
 * Gerar relatório JSON
 */
export async function generateJsonReport(
  suiteResult: TestSuiteResult,
  outputPath: string
): Promise<string> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(suiteResult, null, 2));
  
  console.log(`📄 Relatório JSON gerado: ${outputPath}`);
  return outputPath;
}

/**
 * Gerar relatório resumido para console
 */
export function generateConsoleReport(suiteResult: TestSuiteResult): void {
  const passRate = ((suiteResult.passed / suiteResult.totalTests) * 100).toFixed(1);
  
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           🤖 NOVA ACT TEST REPORT                          ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Suite: ${suiteResult.name.padEnd(49)}║`);
  console.log(`║  Data: ${format(suiteResult.startTime, 'dd/MM/yyyy HH:mm').padEnd(50)}║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Total:    ${String(suiteResult.totalTests).padEnd(47)}║`);
  console.log(`║  ✅ Passou: ${String(suiteResult.passed).padEnd(46)}║`);
  console.log(`║  ❌ Falhou: ${String(suiteResult.failed).padEnd(46)}║`);
  console.log(`║  ⏭️  Pulou:  ${String(suiteResult.skipped).padEnd(46)}║`);
  console.log(`║  Taxa:     ${(passRate + '%').padEnd(47)}║`);
  console.log(`║  Duração:  ${((suiteResult.duration / 1000).toFixed(2) + 's').padEnd(47)}║`);
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');
}

export default {
  generateHtmlReport,
  generateJsonReport,
  generateConsoleReport,
};
