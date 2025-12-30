/**
 * Testes de Cost Analysis - Amazon Nova Act
 * Testes E2E das funcionalidades de análise de custos
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NovaActClient, createNovaActClient } from '../../lib/nova-client';
import { config, URLS } from '../../config/nova-act.config';
import { CostDataSchema } from '../../config/test-data';
import { z } from 'zod';

describe('Cost Optimization', () => {
  let client: NovaActClient;

  beforeAll(async () => {
    client = createNovaActClient(URLS.auth, {
      headless: config.novaAct.headless,
      timeout: 60000,
    });
    await client.start();

    // Login
    await client.fill('email input field', config.testUser.email);
    await client.fill('password input field', config.testUser.password);
    await client.click('login button');
    await client.waitFor('dashboard', 30000);

    // Navegar para Cost Optimization
    await client.click('Cost Optimization menu item in sidebar');
    await client.waitFor('cost optimization page', 10000);
  });

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
  });

  describe('Cost Overview', () => {
    it('deve carregar a página de Cost Optimization', async () => {
      const currentUrl = await client.getCurrentUrl();
      expect(currentUrl).toContain('cost');
    });

    it('deve exibir custo total', async () => {
      const hasTotalCost = await client.isVisible('total cost or monthly spend');
      expect(hasTotalCost).toBe(true);

      // Extrair valor
      const costData = await client.actGet(
        'Extract the total cost value shown on the page. Return as JSON with totalCost as number.',
        z.object({ totalCost: z.number() })
      );

      if (costData.data) {
        expect(costData.data.totalCost).toBeGreaterThanOrEqual(0);
      }
    });

    it('deve exibir tendência de custos', async () => {
      const hasTrend = await client.isVisible('cost trend or spending trend or percentage change');
      expect(hasTrend).toBe(true);
    });

    it('deve exibir gráfico de custos', async () => {
      const hasChart = await client.isVisible('cost chart or spending graph or cost visualization');
      expect(hasChart).toBe(true);
    });
  });

  describe('Cost Breakdown', () => {
    it('deve exibir breakdown por serviço', async () => {
      const hasBreakdown = await client.isVisible('cost breakdown by service or service costs');
      expect(hasBreakdown).toBe(true);
    });

    it('deve listar principais serviços', async () => {
      const services = ['EC2', 'RDS', 'S3', 'Lambda', 'CloudFront'];
      let foundServices = 0;

      for (const service of services) {
        const hasService = await client.isVisible(`${service} cost or ${service} spending`);
        if (hasService) foundServices++;
      }

      expect(foundServices).toBeGreaterThan(0);
    });

    it('deve exibir percentual por serviço', async () => {
      const hasPercentage = await client.isVisible('percentage breakdown or cost percentage');
      expect(hasPercentage).toBe(true);
    });
  });

  describe('Cost Recommendations', () => {
    it('deve exibir recomendações de otimização', async () => {
      const hasRecommendations = await client.isVisible('optimization recommendations or cost savings suggestions');
      expect(hasRecommendations).toBe(true);
    });

    it('deve mostrar economia potencial', async () => {
      const hasSavings = await client.isVisible('potential savings or estimated savings');
      expect(hasSavings).toBe(true);
    });

    it('deve categorizar recomendações', async () => {
      const categories = [
        'Right Sizing',
        'Reserved Instances',
        'Unused Resources',
        'Spot Instances',
      ];

      let foundCategories = 0;
      for (const category of categories) {
        const hasCategory = await client.isVisible(`${category} recommendation or ${category} suggestion`);
        if (hasCategory) foundCategories++;
      }

      expect(foundCategories).toBeGreaterThan(0);
    });

    it('deve ter ação para implementar recomendação', async () => {
      const hasAction = await client.isVisible('implement button or apply recommendation or take action');
      expect(hasAction).toBe(true);
    });
  });

  describe('Cost Filters', () => {
    it('deve ter filtro de período', async () => {
      const hasPeriodFilter = await client.isVisible('period filter or date range selector');
      expect(hasPeriodFilter).toBe(true);
    });

    it('deve ter filtro por conta AWS', async () => {
      const hasAccountFilter = await client.isVisible('account filter or AWS account selector');
      expect(hasAccountFilter).toBe(true);
    });

    it('deve ter filtro por serviço', async () => {
      const hasServiceFilter = await client.isVisible('service filter or filter by service');
      expect(hasServiceFilter).toBe(true);
    });

    it('deve aplicar filtros e atualizar dados', async () => {
      // Mudar período
      const result = await client.act('Change the period filter to last 30 days or last month');
      expect(result.success).toBe(true);

      // Verificar se dados atualizaram
      await client.waitFor('updated cost data or refreshed chart', 5000);
    });
  });

  describe('Export and Reports', () => {
    it('deve ter opção de exportar dados', async () => {
      const hasExport = await client.isVisible('export button or download report');
      expect(hasExport).toBe(true);
    });

    it('deve ter opção de agendar relatório', async () => {
      const hasSchedule = await client.isVisible('schedule report or automated reports');
      expect(hasSchedule).toBe(true);
    });
  });
});

describe('RI & Savings Plans', () => {
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
    await client.click('RI & Savings Plans menu item in sidebar');
    await client.waitFor('RI savings page', 10000);
  });

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
  });

  describe('Reserved Instances', () => {
    it('deve exibir RIs atuais', async () => {
      const hasCurrentRIs = await client.isVisible('current reserved instances or active RIs');
      expect(hasCurrentRIs).toBe(true);
    });

    it('deve exibir utilização de RIs', async () => {
      const hasUtilization = await client.isVisible('RI utilization or reservation utilization');
      expect(hasUtilization).toBe(true);
    });

    it('deve exibir recomendações de RI', async () => {
      const hasRecommendations = await client.isVisible('RI recommendations or suggested reservations');
      expect(hasRecommendations).toBe(true);
    });

    it('deve mostrar economia com RIs', async () => {
      const hasSavings = await client.isVisible('RI savings or reservation savings');
      expect(hasSavings).toBe(true);
    });
  });

  describe('Savings Plans', () => {
    it('deve exibir Savings Plans ativos', async () => {
      const hasActivePlans = await client.isVisible('active savings plans or current savings plans');
      expect(hasActivePlans).toBe(true);
    });

    it('deve exibir cobertura de Savings Plans', async () => {
      const hasCoverage = await client.isVisible('savings plan coverage or coverage percentage');
      expect(hasCoverage).toBe(true);
    });

    it('deve exibir recomendações de Savings Plans', async () => {
      const hasRecommendations = await client.isVisible('savings plan recommendations');
      expect(hasRecommendations).toBe(true);
    });
  });

  describe('Analysis Tools', () => {
    it('deve ter calculadora de economia', async () => {
      const hasCalculator = await client.isVisible('savings calculator or cost calculator');
      expect(hasCalculator).toBe(true);
    });

    it('deve comparar opções de compra', async () => {
      const hasComparison = await client.isVisible('purchase comparison or compare options');
      expect(hasComparison).toBe(true);
    });

    it('deve mostrar ROI estimado', async () => {
      const hasROI = await client.isVisible('ROI or return on investment or payback period');
      expect(hasROI).toBe(true);
    });
  });
});

describe('ML Waste Detection', () => {
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
    await client.click('ML Waste Detection menu item in sidebar');
    await client.waitFor('ML waste detection page', 10000);
  });

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
  });

  it('deve exibir recursos com desperdício detectado', async () => {
    const hasWasteList = await client.isVisible('waste detection results or wasted resources');
    expect(hasWasteList).toBe(true);
  });

  it('deve categorizar tipos de desperdício', async () => {
    const wasteTypes = [
      'Idle Resources',
      'Over-provisioned',
      'Unused',
      'Orphaned',
    ];

    let foundTypes = 0;
    for (const type of wasteTypes) {
      const hasType = await client.isVisible(`${type} waste or ${type} resources`);
      if (hasType) foundTypes++;
    }

    expect(foundTypes).toBeGreaterThan(0);
  });

  it('deve mostrar economia potencial por recurso', async () => {
    const hasSavings = await client.isVisible('potential savings per resource or estimated waste cost');
    expect(hasSavings).toBe(true);
  });

  it('deve ter ações de remediação', async () => {
    const hasActions = await client.isVisible('remediation actions or fix waste or terminate resource');
    expect(hasActions).toBe(true);
  });

  it('deve ter confiança da detecção ML', async () => {
    const hasConfidence = await client.isVisible('ML confidence or detection confidence or accuracy score');
    expect(hasConfidence).toBe(true);
  });
});
