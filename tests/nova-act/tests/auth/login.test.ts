/**
 * Testes de Login - Amazon Nova Act
 * Testes E2E do fluxo de autenticação
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NovaActClient, createNovaActClient } from '../../lib/nova-client';
import { config, URLS } from '../../config/nova-act.config';
import { EXPECTED_MESSAGES, TIMEOUTS } from '../../config/test-data';
import { z } from 'zod';

describe('Auth - Login Flow', () => {
  let client: NovaActClient;

  beforeAll(async () => {
    client = createNovaActClient(URLS.auth, {
      headless: config.novaAct.headless,
      timeout: TIMEOUTS.login,
    });
    await client.start();
  });

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
  });

  describe('Login Page Load', () => {
    it('deve carregar a página de login corretamente', async () => {
      const result = await client.act('Navigate to the login page and verify it loaded');
      
      expect(result.success).toBe(true);
      
      // Verificar elementos essenciais
      const hasEmailField = await client.isVisible('email input field');
      const hasPasswordField = await client.isVisible('password input field');
      const hasLoginButton = await client.isVisible('login button or Entrar button');
      
      expect(hasEmailField).toBe(true);
      expect(hasPasswordField).toBe(true);
      expect(hasLoginButton).toBe(true);
    });

    it('deve exibir o logo da aplicação', async () => {
      const hasLogo = await client.isVisible('EVO logo or application logo');
      expect(hasLogo).toBe(true);
    });

    it('deve ter tabs de Login e Cadastro', async () => {
      const hasLoginTab = await client.isVisible('Login tab');
      const hasSignupTab = await client.isVisible('Cadastro tab or Signup tab');
      
      expect(hasLoginTab).toBe(true);
      expect(hasSignupTab).toBe(true);
    });
  });

  describe('Login com Credenciais Válidas', () => {
    it('deve fazer login com sucesso usando credenciais válidas', async () => {
      // Preencher email
      const emailResult = await client.fill('email input field', config.testUser.email);
      expect(emailResult.success).toBe(true);

      // Preencher senha
      const passwordResult = await client.fill('password input field', config.testUser.password);
      expect(passwordResult.success).toBe(true);

      // Clicar no botão de login
      const loginResult = await client.click('login button or Entrar button');
      expect(loginResult.success).toBe(true);

      // Aguardar redirecionamento ou mensagem de sucesso
      const redirected = await client.waitFor('dashboard or app main content', 30000);
      
      // Se não redirecionou, pode ser MFA
      if (!redirected) {
        const hasMFA = await client.isVisible('MFA code input or verification code');
        if (hasMFA) {
          console.log('MFA detectado - teste de MFA será executado separadamente');
          return;
        }
      }

      expect(redirected).toBe(true);
    });

    it('deve exibir informações do usuário após login', async () => {
      // Verificar se está no dashboard
      const currentUrl = await client.getCurrentUrl();
      expect(currentUrl).toContain('/app');

      // Verificar menu do usuário
      const hasUserMenu = await client.isVisible('user menu or user profile');
      expect(hasUserMenu).toBe(true);
    });
  });

  describe('Login com Credenciais Inválidas', () => {
    beforeAll(async () => {
      // Navegar de volta para login
      await client.goToUrl(URLS.auth);
    });

    it('deve exibir erro para email inválido', async () => {
      await client.fill('email input field', 'invalid-email');
      await client.fill('password input field', 'anypassword');
      await client.click('login button');

      const hasError = await client.waitFor('error message or validation error', 5000);
      expect(hasError).toBe(true);
    });

    it('deve exibir erro para senha incorreta', async () => {
      await client.fill('email input field', config.testUser.email);
      await client.fill('password input field', 'wrongpassword123');
      await client.click('login button');

      const hasError = await client.waitFor('error message or incorrect password', 10000);
      expect(hasError).toBe(true);
    });

    it('deve exibir erro para campos vazios', async () => {
      // Limpar campos
      await client.act('Clear the email and password fields');
      await client.click('login button');

      const hasValidationError = await client.waitFor('required field error or validation message', 5000);
      expect(hasValidationError).toBe(true);
    });
  });

  describe('Funcionalidades Adicionais', () => {
    it('deve ter link de recuperação de senha', async () => {
      const hasForgotPassword = await client.isVisible('forgot password link or Esqueceu sua senha');
      expect(hasForgotPassword).toBe(true);
    });

    it('deve alternar visibilidade da senha', async () => {
      await client.fill('password input field', 'testpassword');
      
      // Clicar no botão de mostrar senha
      const toggleResult = await client.click('show password button or eye icon');
      expect(toggleResult.success).toBe(true);

      // Verificar se o campo mudou para text
      const isPasswordVisible = await client.actGet(
        'Check if the password field is showing the password as text (not dots)',
        z.object({ visible: z.boolean() })
      );
      
      expect(isPasswordVisible.data?.visible).toBe(true);
    });

    it('deve navegar para tab de cadastro', async () => {
      const tabResult = await client.click('Cadastro tab or signup tab');
      expect(tabResult.success).toBe(true);

      // Verificar campos de cadastro
      const hasNameField = await client.isVisible('name input or full name field');
      expect(hasNameField).toBe(true);
    });
  });
});

describe('Auth - Password Reset Flow', () => {
  let client: NovaActClient;

  beforeAll(async () => {
    client = createNovaActClient(URLS.auth, {
      headless: config.novaAct.headless,
    });
    await client.start();
  });

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
  });

  it('deve abrir formulário de recuperação de senha', async () => {
    await client.click('forgot password link or Esqueceu sua senha');
    
    const hasResetForm = await client.waitFor('password reset form or email field for reset', 5000);
    expect(hasResetForm).toBe(true);
  });

  it('deve enviar email de recuperação', async () => {
    await client.fill('email input field', config.testUser.email);
    await client.click('send reset email button or Recuperar Senha button');

    const hasConfirmation = await client.waitFor('email sent confirmation or success message', 10000);
    expect(hasConfirmation).toBe(true);
  });

  it('deve ter botão para voltar ao login', async () => {
    const hasBackButton = await client.isVisible('back to login button or Voltar para login');
    expect(hasBackButton).toBe(true);
  });
});
