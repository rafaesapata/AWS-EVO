/**
 * Testes de AWS Credentials - Amazon Nova Act
 * Testes das configurações de credenciais AWS
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NovaActClient, createNovaActClient } from '../../lib/nova-client';
import { config, URLS } from '../../config/nova-act.config';
import { z } from 'zod';

describe('AWS Settings - Credentials', () => {
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

    // Navegar para AWS Settings
    await client.click('AWS Settings menu item in sidebar');
    await client.waitFor('AWS settings page', 10000);
  });

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
  });

  describe('AWS Settings Page', () => {
    it('deve carregar a página de AWS Settings', async () => {
      const currentUrl = await client.getCurrentUrl();
      expect(currentUrl).toContain('aws-settings');
    });

    it('deve exibir título da página', async () => {
      const hasTitle = await client.isVisible('AWS Settings title or Configurações AWS');
      expect(hasTitle).toBe(true);
    });

    it('deve exibir lista de contas conectadas', async () => {
      const hasAccountList = await client.isVisible('connected accounts list or AWS accounts');
      expect(hasAccountList).toBe(true);
    });
  });

  describe('AWS Account Management', () => {
    it('deve ter botão para adicionar nova conta', async () => {
      const hasAddButton = await client.isVisible('add account button or connect AWS account');
      expect(hasAddButton).toBe(true);
    });

    it('deve abrir modal de adicionar conta', async () => {
      const result = await client.click('add account button or connect AWS account');
      
      if (result.success) {
        const hasModal = await client.waitFor('add account modal or account form', 5000);
        expect(hasModal).toBe(true);

        // Fechar modal
        await client.act('Close the modal by clicking X or cancel button');
      }
    });

    it('deve exibir status de conexão das contas', async () => {
      const hasStatus = await client.isVisible('connection status or account status badges');
      expect(hasStatus).toBe(true);
    });

    it('deve exibir informações da conta', async () => {
      const accountInfo = await client.actGet(
        'Extract information about connected AWS accounts including account ID and status',
        z.object({
          hasAccounts: z.boolean(),
          accountCount: z.number().optional(),
        })
      );

      expect(accountInfo.success).toBe(true);
    });
  });

  describe('Credential Types', () => {
    it('deve suportar IAM Role (Cross-Account)', async () => {
      const hasIAMRole = await client.isVisible('IAM Role option or cross-account role');
      expect(hasIAMRole).toBe(true);
    });

    it('deve suportar Access Keys', async () => {
      const hasAccessKeys = await client.isVisible('Access Keys option or access key credentials');
      expect(hasAccessKeys).toBe(true);
    });

    it('deve ter opção de CloudFormation Quick Create', async () => {
      const hasQuickCreate = await client.isVisible('Quick Create or CloudFormation stack');
      expect(hasQuickCreate).toBe(true);
    });
  });

  describe('Account Actions', () => {
    it('deve ter opção de editar conta', async () => {
      const hasEdit = await client.isVisible('edit account button or edit credentials');
      expect(hasEdit).toBe(true);
    });

    it('deve ter opção de remover conta', async () => {
      const hasRemove = await client.isVisible('remove account button or delete account');
      expect(hasRemove).toBe(true);
    });

    it('deve ter opção de testar conexão', async () => {
      const hasTest = await client.isVisible('test connection button or verify credentials');
      expect(hasTest).toBe(true);
    });
  });

  describe('Multi-Account Support', () => {
    it('deve suportar múltiplas contas AWS', async () => {
      const multiAccountInfo = await client.actGet(
        'Check if the interface supports multiple AWS accounts',
        z.object({ supportsMultiple: z.boolean() })
      );

      expect(multiAccountInfo.data?.supportsMultiple).toBe(true);
    });

    it('deve ter seletor de conta padrão', async () => {
      const hasDefaultSelector = await client.isVisible('default account selector or primary account');
      expect(hasDefaultSelector).toBe(true);
    });
  });
});

describe('AWS Settings - Regions', () => {
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
    await client.click('AWS Settings menu item');
    await client.waitFor('AWS settings page', 10000);
  });

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
  });

  it('deve exibir regiões disponíveis', async () => {
    const hasRegions = await client.isVisible('AWS regions or region selector');
    expect(hasRegions).toBe(true);
  });

  it('deve permitir selecionar múltiplas regiões', async () => {
    const hasMultiRegion = await client.isVisible('multi-region selection or region checkboxes');
    expect(hasMultiRegion).toBe(true);
  });

  it('deve mostrar região primária', async () => {
    const hasPrimaryRegion = await client.isVisible('primary region or default region');
    expect(hasPrimaryRegion).toBe(true);
  });
});

describe('AWS Settings - Permissions', () => {
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
    await client.click('AWS Settings menu item');
    await client.waitFor('AWS settings page', 10000);
  });

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
  });

  it('deve exibir permissões necessárias', async () => {
    const hasPermissions = await client.isVisible('required permissions or IAM permissions');
    expect(hasPermissions).toBe(true);
  });

  it('deve ter documentação de setup', async () => {
    const hasDocumentation = await client.isVisible('setup documentation or setup guide link');
    expect(hasDocumentation).toBe(true);
  });

  it('deve validar permissões da conta', async () => {
    const hasValidation = await client.isVisible('permission validation or check permissions');
    expect(hasValidation).toBe(true);
  });
});
