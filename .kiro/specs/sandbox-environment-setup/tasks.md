# Plano de Implementação: Sandbox Environment Setup

## Visão Geral

Implementação em 3 frentes: (1) atualização dos steering docs com SSO e paridade, (2) funções TypeScript de verificação cross-account com testes de propriedade, (3) extensão do `verify-sandbox.sh` para comparação cross-account.

## Tasks

- [x] 1. Atualizar steering doc `deployment-rules.md` com SSO e sandbox
  - [x] 1.1 Adicionar seção "Acesso via AWS SSO" com comandos `aws sso login --profile EVO_SANDBOX` e `aws sso login --profile EVO_PRODUCTION`
    - Documentar que Profile_EVO_SANDBOX é obrigatório para operações locais no sandbox
    - Documentar que CI/CD pipeline usa IAM Role própria e não depende de SSO
    - Documentar que `sam deploy` local para sandbox usa `--config-env sandbox` e requer Profile_EVO_SANDBOX ativo
    - Documentar que scripts `scripts/setup-sandbox-*.sh` e `scripts/verify-sandbox.sh` requerem `--profile EVO_SANDBOX` ou `AWS_PROFILE=EVO_SANDBOX`
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.3, 2.4_
  - [x] 1.2 Adicionar entrada na tabela de troubleshooting para `ExpiredTokenException`
    - Causa: "Sessão SSO expirada"
    - Solução: "Executar `aws sso login --profile EVO_SANDBOX`"
    - _Requirements: 2.2_

- [x] 2. Atualizar steering doc `infrastructure.md` com SSO e diferenças esperadas
  - [x] 2.1 Adicionar seção "Acesso via AWS SSO" com exemplo completo de `~/.aws/config`
    - Incluir blocos `[profile EVO_SANDBOX]` e `[profile EVO_PRODUCTION]` com sso_start_url, sso_region, sso_account_id, sso_role_name, region
    - Incluir comando de verificação de sessão: `aws sts get-caller-identity --profile EVO_SANDBOX`
    - Documentar que scripts aceitam `--profile` ou `AWS_PROFILE`
    - _Requirements: 1.4, 1.5, 3.1, 3.2, 3.3_
  - [x] 2.2 Atualizar tabela de Resource IDs do sandbox e tabela de Diferenças Esperadas
    - Manter tabela de Resource IDs com valores atuais
    - Documentar todas as diferenças intencionais com justificativa de custo (RDS instance size, MultiAZ, NAT Gateways, CloudFront PriceClass, WAF, CloudTrail, Performance Insights, RDS PubliclyAccessible)
    - _Requirements: 3.4, 12.1, 12.2_

- [x] 3. Checkpoint — Revisar steering docs
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implementar funções TypeScript de verificação cross-account
  - [x] 4.1 Criar módulo `backend/src/lib/sandbox-verification.ts` com funções de comparação
    - `compareLambdaLists(sandboxLambdas, prodLambdas)`: detecta Lambdas ausentes no sandbox
    - `compareEnvVars(sandboxEnvVars, prodEnvVars, knownSubstitutions)`: detecta env vars divergentes exceto substituições conhecidas
    - `detectProdDomainRefs(envVars, exceptions)`: detecta referências a domínios de produção (exceto WEBAUTHN_RP_ID)
    - `compareApiRoutes(sandboxRoutes, prodRoutes)`: detecta rotas ausentes no sandbox
    - `compareSsmParameters(sandboxParams, prodParams)`: detecta SSM params ausentes no sandbox
    - `filterExpectedDifferences(differences, expectedDiffs)`: filtra diferenças documentadas como esperadas
    - `generateCheckSummary(results)`: gera summary com contagens PASS/FAIL/SKIP
    - _Requirements: 4.1, 4.3, 4.6, 5.1, 7.1, 7.4, 11.1, 11.2, 11.3, 11.5, 12.3_

  - [x]* 4.2 Escrever property test: Lambda Function Parity
    - **Property 1: Lambda Function Parity**
    - Testar `compareLambdaLists` com conjuntos arbitrários de Lambdas gerados por fast-check
    - Para qualquer Lambda em produção ausente no sandbox, deve ser reportada
    - Arquivo: `backend/tests/properties/sandbox-verification.property.test.ts`
    - **Validates: Requirements 4.1, 4.6**

  - [x]* 4.3 Escrever property test: Lambda Environment Variable Parity
    - **Property 2: Lambda Environment Variable Parity**
    - Testar `compareEnvVars` e `detectProdDomainRefs` com env vars arbitrárias
    - Apenas substituições conhecidas devem diferir; domínios de produção devem ser detectados (exceto WEBAUTHN_RP_ID)
    - Arquivo: `backend/tests/properties/sandbox-verification.property.test.ts`
    - **Validates: Requirements 4.3, 7.3**

  - [x]* 4.4 Escrever property test: API Gateway Route Parity
    - **Property 3: API Gateway Route Parity**
    - Testar `compareApiRoutes` com conjuntos arbitrários de rotas
    - Toda rota em produção ausente no sandbox deve ser reportada
    - Arquivo: `backend/tests/properties/sandbox-verification.property.test.ts`
    - **Validates: Requirements 5.1**

  - [x]* 4.5 Escrever property test: SSM Parameter Parity
    - **Property 5: SSM Parameter Parity**
    - Testar `compareSsmParameters` com conjuntos arbitrários de parâmetros
    - Todo parâmetro em produção ausente no sandbox deve ser reportado
    - Arquivo: `backend/tests/properties/sandbox-verification.property.test.ts`
    - **Validates: Requirements 7.1, 7.4**

  - [x]* 4.6 Escrever property test: PASS/FAIL Output Format
    - **Property 8: Verification Script PASS/FAIL Output**
    - Testar `generateCheckSummary` com conjuntos arbitrários de resultados
    - Contagens de PASS, FAIL e SKIP devem ser corretas
    - Arquivo: `backend/tests/properties/sandbox-verification.property.test.ts`
    - **Validates: Requirements 11.5**

  - [x]* 4.7 Escrever property test: Expected Differences Ignored
    - **Property 9: Expected Differences Ignored**
    - Testar `filterExpectedDifferences` com diferenças arbitrárias
    - Diferenças documentadas como esperadas nunca devem resultar em FAIL
    - Arquivo: `backend/tests/properties/sandbox-verification.property.test.ts`
    - **Validates: Requirements 12.3**

- [x] 5. Checkpoint — Verificar funções TypeScript e testes de propriedade
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Estender `scripts/verify-sandbox.sh` com comparação cross-account
  - [x] 6.1 Adicionar flag `--compare` e validação de sessão SSO em ambos os profiles
    - Verificar sessão SSO ativa com `aws sts get-caller-identity` para ambos os profiles
    - Abortar com mensagem clara se sessão expirada
    - Validar account IDs esperados (sandbox: `971354623291`, produção: `523115032346`)
    - _Requirements: 11.6_
  - [x] 6.2 Implementar comparação cross-account de Lambda functions
    - Listar Lambdas em ambos os ambientes e comparar contagem e nomes
    - Reportar Lambdas ausentes no sandbox com nome específico
    - _Requirements: 4.1, 4.6, 11.1_
  - [x] 6.3 Implementar comparação cross-account de rotas API Gateway
    - Listar rotas em ambos os ambientes e comparar paths + methods
    - Reportar rotas ausentes no sandbox
    - _Requirements: 5.1, 11.2_
  - [x] 6.4 Implementar comparação cross-account de SSM parameters
    - Listar parâmetros sob `/evo/sandbox/` e `/evo/production/` e comparar nomes
    - Reportar parâmetros ausentes no sandbox
    - _Requirements: 7.1, 7.4, 11.3_
  - [x] 6.5 Implementar comparação de schema de banco de dados
    - Executar `pg_dump --schema-only` em ambos os ambientes e comparar via diff
    - Marcar como SKIP se `psql` não estiver disponível
    - _Requirements: 10.1, 10.5, 11.4_
  - [x] 6.6 Implementar filtro de diferenças esperadas e relatório final
    - Ignorar diferenças documentadas (RDS instance size, MultiAZ, NAT Gateways, CloudFront PriceClass, WAF, CloudTrail, Performance Insights)
    - Gerar relatório com status PASS/FAIL/SKIP para cada check e summary final com contagens
    - _Requirements: 11.5, 12.3_

- [x] 7. Checkpoint final — Verificar script e integração
  - Ensure all tests pass, ask the user if questions arise.

## Notas

- Tasks marcadas com `*` são opcionais e podem ser puladas para MVP mais rápido
- Cada task referencia requisitos específicos para rastreabilidade
- Checkpoints garantem validação incremental
- Property tests validam propriedades universais de corretude
- Os steering docs (`deployment-rules.md`, `infrastructure.md`) já existem em `.kiro/steering/`
- O script `scripts/verify-sandbox.sh` já existe com 8 checks no sandbox — será estendido
- Testes de propriedade usam fast-check em `backend/tests/properties/`
