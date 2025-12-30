# Amazon Nova Act - Testes E2E Automatizados

## Visão Geral

Este módulo implementa testes end-to-end automatizados usando **Amazon Nova Act**, um serviço AWS que permite construir agentes de IA confiáveis para automação de workflows de UI em escala.

A implementação é 100% TypeScript, integrando diretamente com a API REST do Nova Act Service, mantendo consistência com a arquitetura do projeto EVO UDS.

### Por que Nova Act?

- **Testes Inteligentes**: Nova Act entende a UI semanticamente, não depende de seletores CSS frágeis
- **Adaptação Automática**: Se a UI mudar, os testes continuam funcionando
- **Linguagem Natural**: Escreva testes em português/inglês natural
- **Extração de Dados**: Valide dados exibidos com schemas Zod
- **Paralelização**: Execute múltiplas sessões de browser simultaneamente
- **Relatórios Detalhados**: HTML com screenshots e traces de cada step

## Arquitetura

```
tests/nova-act/
├── config/
│   ├── nova-act.config.ts      # Configuração principal
│   ├── test-data.ts            # Dados de teste
│   └── environments.ts         # Configurações por ambiente
├── lib/
│   ├── nova-client.ts          # Cliente Nova Act (wrapper)
│   ├── test-runner.ts          # Executor de testes
│   ├── report-generator.ts     # Gerador de relatórios
│   ├── schemas.ts              # Schemas Pydantic em TS
│   └── utils.ts                # Utilitários
├── tests/
│   ├── auth/                   # Testes de autenticação
│   │   ├── login.test.ts
│   │   ├── signup.test.ts
│   │   ├── mfa.test.ts
│   │   └── password-reset.test.ts
│   ├── dashboard/              # Testes do dashboard
│   │   ├── overview.test.ts
│   │   ├── navigation.test.ts
│   │   └── widgets.test.ts
│   ├── security/               # Testes de segurança
│   │   ├── security-scans.test.ts
│   │   ├── compliance.test.ts
│   │   └── threat-detection.test.ts
│   ├── cost/                   # Testes de custos
│   │   ├── cost-analysis.test.ts
│   │   ├── optimization.test.ts
│   │   └── ri-savings.test.ts
│   ├── aws/                    # Testes AWS
│   │   ├── credentials.test.ts
│   │   ├── resources.test.ts
│   │   └── cloudwatch.test.ts
│   └── e2e/                    # Fluxos completos
│       ├── user-journey.test.ts
│       └── admin-workflow.test.ts
├── schemas/
│   └── test-case.schema.json   # Schema dos casos de teste
├── reports/                    # Relatórios gerados
├── package.json
└── tsconfig.json
```

## Pré-requisitos

1. **Node.js 18+**
2. **Python 3.10+** (apenas para executar Nova Act SDK)
3. **Nova Act SDK**: `pip install nova-act`
4. **Google Chrome** (recomendado)

## Instalação

```bash
cd tests/nova-act
npm install

# Instalar Nova Act SDK (Python - apenas runtime)
pip install nova-act
playwright install chrome
```

## Configuração

### Variáveis de Ambiente

```bash
# API Key (desenvolvimento)
export NOVA_ACT_API_KEY="your_api_key"

# Ou IAM (produção)
export AWS_PROFILE="your-profile"
export AWS_REGION="us-east-1"

# Aplicação
export APP_URL="https://evo.ai.udstec.io"
export TEST_USER_EMAIL="test@empresa.com"
export TEST_USER_PASSWORD="your_password"
```

## Execução

```bash
# Todos os testes
npm test

# Testes específicos
npm test -- --grep "auth"

# Com relatório HTML
npm run test:report

# Paralelo (múltiplas sessões)
npm run test:parallel
```

## Recursos

- **Testes Inteligentes**: Nova Act entende a UI e adapta-se a mudanças
- **Extração de Dados**: Validação automática de dados exibidos
- **Screenshots**: Captura automática em cada passo
- **Relatórios**: HTML detalhado com traces
- **Paralelização**: Múltiplas sessões simultâneas
- **HITL**: Human-in-the-loop para casos complexos
- **TypeScript First**: Toda orquestração em TypeScript


## Quick Start

### 1. Instalar Dependências

```bash
cd tests/nova-act
npm install
```

### 2. Configurar Credenciais

```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar com suas credenciais
# - NOVA_ACT_API_KEY: Obter em https://nova.amazon.com/act
# - TEST_USER_EMAIL: Email de um usuário de teste
# - TEST_USER_PASSWORD: Senha do usuário
```

### 3. Executar Testes

```bash
# Todos os testes
npm test

# Testes específicos por categoria
npm run test:auth
npm run test:dashboard
npm run test:security
npm run test:cost
npm run test:e2e

# Com interface visual
npm run test:ui

# Gerar relatório HTML
npm run test:report
```

## Estrutura de Testes

### Categorias

| Categoria | Descrição | Arquivos |
|-----------|-----------|----------|
| `auth` | Autenticação, login, MFA, reset de senha | `tests/auth/*.test.ts` |
| `dashboard` | Dashboard principal, KPIs, navegação | `tests/dashboard/*.test.ts` |
| `security` | Security scans, posture, compliance | `tests/security/*.test.ts` |
| `cost` | Cost optimization, RI, waste detection | `tests/cost/*.test.ts` |
| `aws` | AWS settings, credentials, regions | `tests/aws/*.test.ts` |
| `e2e` | Fluxos completos end-to-end | `tests/e2e/*.test.ts` |

### Prioridades

- **critical**: Testes essenciais que devem sempre passar
- **high**: Funcionalidades importantes
- **medium**: Funcionalidades secundárias
- **low**: Edge cases e melhorias

## Escrevendo Testes

### Exemplo Básico

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createNovaActClient } from '../../lib/nova-client';
import { config, URLS } from '../../config/nova-act.config';

describe('Minha Feature', () => {
  let client;

  beforeAll(async () => {
    client = createNovaActClient(URLS.auth);
    await client.start();
    
    // Login
    await client.fill('email field', config.testUser.email);
    await client.fill('password field', config.testUser.password);
    await client.click('login button');
    await client.waitFor('dashboard', 30000);
  });

  afterAll(async () => {
    await client?.stop();
  });

  it('deve fazer algo', async () => {
    // Ação em linguagem natural
    const result = await client.act('Click on the settings button');
    expect(result.success).toBe(true);

    // Verificar elemento
    const isVisible = await client.isVisible('settings panel');
    expect(isVisible).toBe(true);
  });
});
```

### Extraindo Dados Estruturados

```typescript
import { z } from 'zod';

it('deve extrair métricas do dashboard', async () => {
  const metrics = await client.actGet(
    'Extract the security score and total cost from the dashboard',
    z.object({
      securityScore: z.number().min(0).max(100),
      totalCost: z.number(),
    })
  );

  expect(metrics.data?.securityScore).toBeGreaterThan(0);
  expect(metrics.data?.totalCost).toBeGreaterThanOrEqual(0);
});
```

### Fluxos Completos

```typescript
import { runWorkflow } from '../../lib/nova-client';

it('deve completar jornada do usuário', async () => {
  const results = await runWorkflow(URLS.auth, [
    'Navigate to login page',
    'Fill email and password fields',
    'Click login button',
    'Wait for dashboard to load',
    'Navigate to Security Scans',
    'Verify scan list is visible',
    'Navigate back to Dashboard',
    'Logout',
  ]);

  const successRate = results.filter(r => r.success).length / results.length;
  expect(successRate).toBeGreaterThanOrEqual(0.8);
});
```

## Comandos Disponíveis

```bash
# Testes
npm test                    # Executar todos os testes
npm run test:watch          # Modo watch
npm run test:ui             # Interface visual do Vitest
npm run test:report         # Gerar relatório HTML
npm run test:parallel       # Executar em paralelo

# Por categoria
npm run test:auth           # Testes de autenticação
npm run test:dashboard      # Testes do dashboard
npm run test:security       # Testes de segurança
npm run test:cost           # Testes de custos
npm run test:e2e            # Testes end-to-end

# Utilitários
npm run lint                # Verificar código
npm run typecheck           # Verificar tipos
npm run generate:report     # Gerar relatório customizado
```

## Script de Execução Customizado

```bash
# Executar com filtros
npx tsx run-tests.ts --category auth
npx tsx run-tests.ts --priority critical
npx tsx run-tests.ts --tags smoke,login

# Com opções
npx tsx run-tests.ts --headless false  # Ver browser
npx tsx run-tests.ts --parallel 4      # 4 sessões
npx tsx run-tests.ts --report          # Gerar HTML

# Ajuda
npx tsx run-tests.ts --help
```

## Relatórios

Os relatórios são gerados em `./reports/`:

- `test-report.html` - Relatório HTML interativo
- `nova-act-report-{timestamp}.json` - Dados em JSON
- `traces/` - Traces detalhados de cada sessão
- `screenshots/` - Screenshots de falhas

## Integração com CI/CD

### GitHub Actions

```yaml
name: Nova Act E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: |
          cd tests/nova-act
          npm ci
          
      - name: Run E2E tests
        env:
          NOVA_ACT_API_KEY: ${{ secrets.NOVA_ACT_API_KEY }}
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
        run: |
          cd tests/nova-act
          npm run test:report
          
      - name: Upload test report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: nova-act-report
          path: tests/nova-act/reports/
```

## Troubleshooting

### Erro: "Nova Act API Key not configured"
- Verifique se `NOVA_ACT_API_KEY` está definido no `.env`
- Obtenha uma API key em https://nova.amazon.com/act

### Erro: "Test user credentials not configured"
- Defina `TEST_USER_EMAIL` e `TEST_USER_PASSWORD` no `.env`
- Use credenciais de um usuário de teste válido

### Testes muito lentos
- Nova Act pode levar 1-2 minutos na primeira execução
- Use `--parallel` para executar múltiplos testes simultaneamente
- Considere usar `--headless true` (default)

### Falhas intermitentes
- Aumente o timeout em `config/nova-act.config.ts`
- Adicione `waitFor()` antes de ações críticas
- Verifique se a aplicação está estável

## Recursos Adicionais

- [Amazon Nova Act Documentation](https://docs.aws.amazon.com/nova-act/)
- [Nova Act SDK Reference](https://pypi.org/project/nova-act/)
- [Vitest Documentation](https://vitest.dev/)
- [Zod Documentation](https://zod.dev/)
