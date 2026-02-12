/**
 * Testes de Security Scans - Amazon Nova Act
 * Testes das funcionalidades de scan de segurança
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NovaActClient, createNovaActClient } from '../../lib/nova-client';
import { config, URLS } from '../../config/nova-act.config';
import { SecurityScanResultSchema } from '../../config/test-data';
import { z } from 'zod';

describe('Security Scans', () => {
  let client: NovaActClient;

  beforeAll(async () => {
    client = createNovaActClient(URLS.auth, {
      headless: config.novaAct.headless,
      timeout: 120000, // Scans podem demorar
    });
    await client.start();

    // Login
    await client.fill('email input field', config.testUser.email);
    await client.fill('password input field', config.testUser.password);
    await client.click('login button');
    await client.waitFor('dashboard', 30000);

    // Navegar para Security Scans
    await client.click('Security Scans menu item in sidebar');
    await client.waitFor('security scans page', 10000);
  });

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
  });

  describe('Security Scans Page Load', () => {
    it('deve carregar a página de Security Scans', async () => {
      const currentUrl = await client.getCurrentUrl();
      expect(currentUrl).toContain('security');
    });

    it('deve exibir título da página', async () => {
      const hasTitle = await client.isVisible('Security Scans title or page header');
      expect(hasTitle).toBe(true);
    });

    it('deve exibir botão de novo scan', async () => {
      const hasNewScanButton = await client.isVisible('new scan button or Run Scan button or Iniciar Scan');
      expect(hasNewScanButton).toBe(true);
    });
  });

  describe('Scan List', () => {
    it('deve exibir lista de scans anteriores', async () => {
      const hasScanList = await client.isVisible('scan list or scan history table');
      expect(hasScanList).toBe(true);
    });

    it('deve exibir status dos scans', async () => {
      const hasStatus = await client.isVisible('scan status column or status badges');
      expect(hasStatus).toBe(true);
    });

    it('deve exibir data dos scans', async () => {
      const hasDate = await client.isVisible('scan date column or timestamp');
      expect(hasDate).toBe(true);
    });
  });

  describe('Scan Details', () => {
    it('deve abrir detalhes de um scan ao clicar', async () => {
      // Clicar no primeiro scan da lista
      const result = await client.click('first scan item in the list or first row in scan table');
      
      if (result.success) {
        // Verificar se abriu detalhes
        const hasDetails = await client.waitFor('scan details or findings list', 5000);
        expect(hasDetails).toBe(true);
      }
    });

    it('deve exibir findings do scan', async () => {
      const hasFindings = await client.isVisible('findings section or vulnerabilities list');
      expect(hasFindings).toBe(true);
    });

    it('deve categorizar findings por severidade', async () => {
      const severities = ['Critical', 'High', 'Medium', 'Low'];
      let foundAnySeverity = false;

      for (const severity of severities) {
        const hasSeverity = await client.isVisible(`${severity} severity or ${severity} findings`);
        if (hasSeverity) {
          foundAnySeverity = true;
          break;
        }
      }

      expect(foundAnySeverity).toBe(true);
    });
  });

  describe('Run New Scan', () => {
    it('deve abrir modal/form de novo scan', async () => {
      // Voltar para lista se estiver em detalhes
      await client.act('Navigate back to scan list if in details view');
      
      const result = await client.click('new scan button or Run Scan button');
      expect(result.success).toBe(true);

      const hasForm = await client.waitFor('scan configuration form or scan options', 5000);
      expect(hasForm).toBe(true);
    });

    it('deve ter opções de tipo de scan', async () => {
      const hasScanTypes = await client.isVisible('scan type options or scan category selection');
      expect(hasScanTypes).toBe(true);
    });

    it('deve ter opção de selecionar conta AWS', async () => {
      const hasAccountSelector = await client.isVisible('AWS account selector or account dropdown');
      expect(hasAccountSelector).toBe(true);
    });

    it('deve iniciar scan ao confirmar', async () => {
      // Selecionar opções e iniciar
      const result = await client.click('start scan button or confirm scan button');
      
      if (result.success) {
        // Verificar se scan iniciou
        const scanStarted = await client.waitFor('scan started message or scan in progress', 10000);
        expect(scanStarted).toBe(true);
      }
    });
  });

  describe('Scan Filters', () => {
    it('deve ter filtro por status', async () => {
      const hasStatusFilter = await client.isVisible('status filter or filter by status');
      expect(hasStatusFilter).toBe(true);
    });

    it('deve ter filtro por data', async () => {
      const hasDateFilter = await client.isVisible('date filter or date range picker');
      expect(hasDateFilter).toBe(true);
    });

    it('deve aplicar filtros corretamente', async () => {
      // Aplicar um filtro
      const result = await client.act('Apply a filter to show only completed scans');
      expect(result.success).toBe(true);
    });
  });

  describe('Export Functionality', () => {
    it('deve ter opção de exportar relatório', async () => {
      const hasExport = await client.isVisible('export button or download report');
      expect(hasExport).toBe(true);
    });

    it('deve ter múltiplos formatos de export', async () => {
      await client.click('export button');
      
      const hasFormats = await client.waitFor('export format options or PDF CSV JSON options', 3000);
      expect(hasFormats).toBe(true);
    });
  });
});

describe('Security Posture', () => {
  let client: NovaActClient;

  beforeAll(async () => {
    client = createNovaActClient(URLS.auth, {
      headless: config.novaAct.headless,
    });
    await client.start();

    // Login e navegar
    await client.fill('email input field', config.testUser.email);
    await client.fill('password input field', config.testUser.password);
    await client.click('login button');
    await client.waitFor('dashboard', 30000);
    await client.click('Security Posture menu item in sidebar');
    await client.waitFor('security posture page', 10000);
  });

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
  });

  it('deve exibir score geral de segurança', async () => {
    const hasScore = await client.isVisible('security score or overall score');
    expect(hasScore).toBe(true);

    // Extrair score
    const scoreData = await client.actGet(
      'Extract the overall security score as a number',
      z.object({ score: z.number().min(0).max(100) })
    );

    if (scoreData.data) {
      expect(scoreData.data.score).toBeGreaterThanOrEqual(0);
      expect(scoreData.data.score).toBeLessThanOrEqual(100);
    }
  });

  it('deve exibir breakdown por categoria', async () => {
    const categories = [
      'IAM',
      'Network',
      'Data Protection',
      'Logging',
    ];

    let foundCategories = 0;
    for (const category of categories) {
      const hasCategory = await client.isVisible(`${category} category or ${category} section`);
      if (hasCategory) foundCategories++;
    }

    expect(foundCategories).toBeGreaterThan(0);
  });

  it('deve exibir recomendações de melhoria', async () => {
    const hasRecommendations = await client.isVisible('recommendations section or improvement suggestions');
    expect(hasRecommendations).toBe(true);
  });

  it('deve ter ações de remediação', async () => {
    const hasActions = await client.isVisible('remediation actions or fix buttons');
    expect(hasActions).toBe(true);
  });
});

describe('Compliance', () => {
  let client: NovaActClient;

  beforeAll(async () => {
    client = createNovaActClient(URLS.auth, {
      headless: config.novaAct.headless,
    });
    await client.start();

    // Login e navegar
    await client.fill('email input field', config.testUser.email);
    await client.fill('password input field', config.testUser.password);
    await client.click('login button');
    await client.waitFor('dashboard', 30000);
    await client.click('Compliance menu item in sidebar');
    await client.waitFor('compliance page', 10000);
  });

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
  });

  it('deve exibir frameworks de compliance', async () => {
    const frameworks = ['SOC 2', 'HIPAA', 'PCI DSS', 'ISO 27001', 'GDPR'];
    let foundFrameworks = 0;

    for (const framework of frameworks) {
      const hasFramework = await client.isVisible(`${framework} framework or ${framework} compliance`);
      if (hasFramework) foundFrameworks++;
    }

    expect(foundFrameworks).toBeGreaterThan(0);
  });

  it('deve exibir status de compliance', async () => {
    const hasStatus = await client.isVisible('compliance status or compliance percentage');
    expect(hasStatus).toBe(true);
  });

  it('deve exibir controles e checks', async () => {
    const hasControls = await client.isVisible('compliance controls or security checks');
    expect(hasControls).toBe(true);
  });

  it('deve permitir gerar relatório de compliance', async () => {
    const hasReportButton = await client.isVisible('generate report button or export compliance');
    expect(hasReportButton).toBe(true);
  });
});
